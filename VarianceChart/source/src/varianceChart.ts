"use strict";

import { select, Selection } from "d3-selection";
import { scaleBand, scaleLinear, ScaleBand, ScaleLinear } from "d3-scale";
import {
    buildRows, combineSeries, formatPercent, Row, Scenario, SCENARIO_CODE, Series, SortDirection, SortField, sortOrder, totalRow, wrapText,
} from "./varianceModel";

export type Orientation = "columns" | "bars";
export type ChartType = "variance" | "waterfall";
export type GroupMode = "multiples" | "stacked";

export interface ChartOptions {
    width: number;
    height: number;
    /** "columns": categories run left to right (time series). "bars": categories run top to bottom (structure). */
    orientation: Orientation;
    /** "variance": value and comparison side by side with variance charts. "waterfall": a bridge from the comparison total to the actual total. */
    chartType: ChartType;
    /** What to do with the Group field: one small chart per group, or stack the groups inside each bar. */
    groupMode: GroupMode;
    /** Small multiples only: give every small chart the same scale so they can be compared. */
    sameScale: boolean;
    /** What actual is compared against, or null when there is no comparison measure. */
    scenario: Scenario | null;
    showAbsolute: boolean;
    showRelative: boolean;
    /** True for measures where an increase is bad news, such as costs: swaps the variance colours. */
    higherIsWorse: boolean;
    showTotal: boolean;
    totalLabel: string;
    sortField: SortField;
    sortDirection: SortDirection;
    showComments: boolean;
    actualColor: string;
    previousYearColor: string;
    goodColor: string;
    badColor: string;
    textColor: string;
    showLabels: boolean;
    labelSize: number;
    categorySize: number;
    /** Short form for labels, for example "$74.7M". */
    formatValue: (value: number) => string;
    /** Full form for tooltips. */
    formatFull: (value: number) => string;
    /** Display names of the measures, for tooltips. */
    valueName: string;
    baseName: string;
    emptyMessage: string;
}

export interface ChartData {
    series: Series[];
    /** True when a Group field is in use (so `series` has one entry per group). */
    grouped: boolean;
}

export interface TooltipItem {
    displayName: string;
    value: string;
}

export interface ChartHandlers {
    /** `seriesIndex` is the group the mark belongs to, or null when it covers all groups. */
    onSelect(seriesIndex: number | null, row: Row, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(seriesIndex: number | null, row: Row | null, event: MouseEvent): void;
    showTooltip(items: TooltipItem[], event: MouseEvent, seriesIndex: number | null, row: Row): void;
    hideTooltip(): void;
    /** A chart title was clicked to change the sort order. */
    onSort(field: SortField, direction: SortDirection): void;
}

type Layer = Selection<SVGGElement, unknown, null, undefined>;

/** One chart: its own layers, positioned somewhere in the visual. */
interface Plot {
    frame: Layer;
    items: Layer;
    seriesIndex: number | null;
}

/** One of the stacked charts inside a plot: where it sits along the value direction, and its scale. */
interface Panel {
    start: number;
    end: number;
    scale: ScaleLinear<number, number>;
    title: string;
    field: SortField;
}

/** Fixed value ranges, used to give several small charts the same scale. */
interface Domains {
    value: [number, number];
    delta: [number, number];
    percent: [number, number];
}

interface PlotExtras {
    domains?: Domains;
    /** Names of the groups, in stacking order, when bars are drawn stacked. */
    stackNames?: string[];
    /** The number shown on each commented category, by row key. */
    commentNumbers?: Map<string, number>;
    /** Leave out the clickable sort arrows and use smaller chart titles (small multiples). */
    compact?: boolean;
    /** Small multiples: the longest label, in characters, across all the small charts, so they all show or all hide their labels together. */
    widest?: { value: number; delta: number; percent: number };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MINUS = "−";
const DELTA = "Δ";
/** Relative variances beyond this are drawn at the edge of their chart, so one outlier cannot flatten the rest. */
const PERCENT_CAP = 300;
/** The most room one category may take, so charts with few categories do not get oversized bars. */
const MAX_COLUMN_STEP = 96;
const MAX_BAR_STEP = 52;

/** A total more than this many times the largest category is drawn cut short, with a break mark. */
const TOTAL_BREAK = 2;

let instanceCounter = 0;

/** True when a value lies beyond what the scale covers, so its bar is drawn cut short. */
function outside(scale: ScaleLinear<number, number>, value: number): boolean {
    const [low, high] = scale.domain();
    return value < low || value > high;
}

/** Shortens text to fit a width, ending it with an ellipsis. */
function fitText(text: string, maxPx: number, size: number): string {
    const max = Math.floor(maxPx / (size * 0.56));
    return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)) + "\u2026";
}

/** The key used to match a mark to the current selection. */
export function selectionKey(seriesIndex: number | null, rowKey: string): string {
    return `${seriesIndex === null ? "*" : seriesIndex}|${rowKey}`;
}

function capPercent(value: number): number {
    return Math.max(-PERCENT_CAP, Math.min(PERCENT_CAP, value));
}

function domainsOf(rowSets: Row[][]): Domains {
    const all = rowSets.flat();
    const span = (values: number[]): [number, number] => [Math.min(0, ...values), Math.max(0, ...values)];
    return {
        value: span(all.flatMap((r) => [r.value, r.base]).filter((v): v is number => v !== null)),
        delta: span(all.map((r) => r.delta ?? 0)),
        percent: span(all.map((r) => capPercent(r.deltaPercent ?? 0))),
    };
}

export class VarianceChart {
    private readonly uid: string;
    private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly defs: Selection<SVGDefsElement, unknown, null, undefined>;
    private readonly root: Layer;
    private selectedKeys: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.uid = "vc" + ++instanceCounter;
        const svgElement = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
        container.appendChild(svgElement);
        this.svg = select<SVGSVGElement, unknown>(svgElement).attr("class", "varianceChart");
        this.defs = this.svg.append("defs");
        this.root = this.svg.append("g").attr("class", "root");
    }

    /** Dims every mark that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selectedKeys = keys;
        this.root.selectAll<SVGGElement, Row>("g.item").attr("opacity", function () {
            const key = this.getAttribute("data-key") || "";
            return keys.size === 0 || keys.has(key) ? 1 : 0.3;
        });
    }

    public render(data: ChartData, options: ChartOptions, handlers: ChartHandlers): void {
        const width = Math.max(1, options.width);
        const height = Math.max(1, options.height);
        this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
        this.svg.on("click", (event: MouseEvent) => {
            if (!event.defaultPrevented) handlers.onClear();
        });
        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            handlers.onContextMenu(null, null, event);
        });
        this.root.selectAll("*").remove();
        this.drawPatterns(options);

        const scenario = options.scenario;
        const combined = data.grouped ? combineSeries(data.series, scenario) : buildRows(data.series.length ? data.series[0].points : [], scenario);
        // One order for the whole visual: small charts all list their categories the same way.
        const order = sortOrder(combined, options.sortField, options.sortDirection);
        const arrange = (rows: Row[]) => order.map((i) => rows[i]).filter((r) => r !== undefined);
        const usable = (rows: Row[]) => rows.filter((r) => r.value !== null || r.base !== null);

        if (usable(combined).length === 0) {
            this.root
                .append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("fill", "#6B6B68")
                .text(options.emptyMessage);
            return;
        }

        const multiples = data.grouped && options.chartType === "variance" && options.groupMode === "multiples";
        if (multiples) {
            this.drawMultiples(data.series.map((s) => ({ name: s.name, rows: usable(arrange(buildRows(s.points, scenario))) })), options, handlers, width, height);
        } else {
            const stacked = data.grouped && options.groupMode === "stacked" && options.chartType === "variance";
            const rows = usable(arrange(combined)).map((r) => (stacked ? r : { ...r, parts: undefined }));

            // Commentary: number the categories that have a comment, and list them down the right-hand side.
            const commented = options.showComments ? rows.filter((r) => r.comment) : [];
            const commentNumbers = new Map<string, number>(commented.map((r, i) => [r.key, i + 1]));
            const commentWidth = commented.length ? Math.max(130, Math.min(250, width * 0.27)) : 0;
            const plotWidth = Math.max(60, width - commentWidth);

            const plot = this.createPlot(0, 0, null);
            const extras: PlotExtras = { commentNumbers, stackNames: stacked ? data.series.map((s) => s.name) : undefined };
            if (options.chartType === "waterfall") {
                this.drawWaterfall(plot, rows, options, handlers, plotWidth, height, extras);
            } else {
                const withTotal = options.showTotal && rows.length > 1 ? [...rows, totalRow(rows, options.totalLabel)] : rows;
                if (options.orientation === "bars") this.drawBars(plot, withTotal, options, handlers, plotWidth, height, extras);
                else this.drawColumns(plot, withTotal, options, handlers, plotWidth, height, extras);
            }
            if (commented.length) this.drawComments(commented, options, plotWidth + 8, 4, commentWidth - 12, height - 8);
        }
        this.setSelection(this.selectedKeys);
    }

    // ------------------------------------------------------------------ shared pieces

    private createPlot(x: number, y: number, seriesIndex: number | null): Plot {
        const g = this.root.append("g").attr("class", "plot").attr("transform", `translate(${x},${y})`);
        return { frame: g.append("g").attr("class", "frame"), items: g.append("g").attr("class", "items"), seriesIndex };
    }

    /** Diagonal hatching, used for forecast values. */
    private drawPatterns(options: ChartOptions): void {
        this.defs.selectAll("*").remove();
        const pattern = this.defs
            .append("pattern")
            .attr("id", `${this.uid}_hatch`)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 6)
            .attr("height", 6);
        pattern.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#FFFFFF");
        pattern
            .append("path")
            .attr("d", "M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2")
            .attr("stroke", options.actualColor)
            .attr("stroke-width", 1.6);
    }

    /** Fill and outline for the comparison (base) bar: grey for previous year, outlined for plan, hatched for forecast. */
    private baseStyle(options: ChartOptions): { fill: string; stroke: string } {
        if (options.scenario === "pl") return { fill: "#FFFFFF", stroke: options.actualColor };
        if (options.scenario === "fc") return { fill: `url(#${this.uid}_hatch)`, stroke: options.actualColor };
        return { fill: options.previousYearColor, stroke: "none" };
    }

    private valueStyle(row: Row, options: ChartOptions): { fill: string; stroke: string } {
        return row.isForecast
            ? { fill: `url(#${this.uid}_hatch)`, stroke: options.actualColor }
            : { fill: options.actualColor, stroke: "none" };
    }

    /** Shades for stacked groups: the first group is the Actual colour and later ones get progressively lighter. */
    private stackShade(index: number, count: number, options: ChartOptions): string {
        if (count <= 1 || index === 0) return options.actualColor;
        const hex = options.actualColor.replace("#", "");
        const from = [0, 2, 4].map((i) => parseInt(hex.length === 6 ? hex.slice(i, i + 2) : "40", 16));
        const t = (index / (count - 1)) * 0.78;
        return "#" + from.map((c) => Math.round(c + (228 - c) * t).toString(16).padStart(2, "0")).join("");
    }

    /** Green for a variance that is good news and red for bad, taking "higher is worse" into account. */
    private varianceColor(delta: number, options: ChartOptions): string {
        const good = options.higherIsWorse ? delta <= 0 : delta >= 0;
        return good ? options.goodColor : options.badColor;
    }

    private signed(value: number, options: ChartOptions): string {
        const text = options.formatValue(Math.abs(value));
        // Too small to show at this rounding: no sign, so it does not read as "−0.0".
        if (text === options.formatValue(0)) return text;
        return value > 0 ? `+${text}` : value < 0 ? `${MINUS}${text}` : text;
    }

    /**
     * The axis of a variance chart stands for the scenario being compared against, so it is drawn
     * in that scenario's style: a solid grey line for previous year, a double line for plan, a
     * dashed line for forecast.
     */
    private drawVarianceAxis(plot: Plot, x1: number, y1: number, x2: number, y2: number, options: ChartOptions): void {
        const vertical = x1 === x2;
        const line = (offset: number, color: string, widthPx: number, dash?: string) => {
            plot.frame
                .append("line")
                .attr("class", "axis")
                .attr("x1", x1 + (vertical ? offset : 0))
                .attr("x2", x2 + (vertical ? offset : 0))
                .attr("y1", y1 + (vertical ? 0 : offset))
                .attr("y2", y2 + (vertical ? 0 : offset))
                .attr("stroke", color)
                .attr("stroke-width", widthPx)
                .attr("stroke-dasharray", dash || null);
        };
        if (options.scenario === "pl") {
            line(-1.5, options.actualColor, 1);
            line(1.5, options.actualColor, 1);
        } else if (options.scenario === "fc") {
            line(0, options.actualColor, 2, "4 2");
        } else {
            line(0, options.previousYearColor, 3);
        }
    }

    private tooltipFor(row: Row, options: ChartOptions): TooltipItem[] {
        const items: TooltipItem[] = [{ displayName: "Category", value: row.category }];
        if (row.value !== null) items.push({ displayName: row.isForecast ? `${options.valueName} (forecast)` : options.valueName, value: options.formatFull(row.value) });
        if (row.parts && row.parts.length > 1) row.parts.forEach((part) => items.push({ displayName: `  ${part.name}`, value: options.formatFull(part.value) }));
        if (row.base !== null && options.scenario) items.push({ displayName: options.baseName, value: options.formatFull(row.base) });
        if (row.delta !== null && options.scenario) {
            const code = SCENARIO_CODE[options.scenario];
            const sign = row.delta > 0 ? "+" : row.delta < 0 ? MINUS : "";
            items.push({ displayName: `${DELTA}${code}`, value: `${sign}${options.formatFull(Math.abs(row.delta))}` });
            if (row.deltaPercent !== null) items.push({ displayName: `${DELTA}${code}%`, value: formatPercent(row.deltaPercent) });
        }
        if (row.comment) items.push({ displayName: "Comment", value: row.comment });
        return items;
    }

    /** One group per category holding all of its marks. Totals and bridge ends can be hovered but not selected. */
    private itemGroups(plot: Plot, rows: Row[], options: ChartOptions, handlers: ChartHandlers): Selection<SVGGElement, Row, SVGGElement, unknown> {
        return plot.items
            .selectAll<SVGGElement, Row>("g.item")
            .data(rows, (d) => d.key)
            .join("g")
            .attr("class", (d) => (d.isTotal ? "item total" : "item"))
            .attr("data-key", (d) => (d.isTotal ? "" : selectionKey(plot.seriesIndex, d.key)))
            .style("cursor", (d) => (d.isTotal ? "default" : "pointer"))
            .on("click", (event: MouseEvent, d) => {
                if (d.isTotal) return;
                event.stopPropagation();
                handlers.onSelect(plot.seriesIndex, d, event);
            })
            .on("contextmenu", (event: MouseEvent, d) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(plot.seriesIndex, d.isTotal ? null : d, event);
            })
            .on("mousemove", (event: MouseEvent, d) => handlers.showTooltip(this.tooltipFor(d, options), event, plot.seriesIndex, d))
            .on("mouseleave", () => handlers.hideTooltip());
    }

    /**
     * The rows to size each scale from. A total several times larger than any category is left
     * out, and drawn cut short with a break mark, so that it does not flatten the categories.
     */
    private scaleRows(rows: Row[]): { value: Row[]; delta: Row[] } {
        const total = rows.find((r) => r.isTotal);
        if (!total) return { value: rows, delta: rows };
        const others = rows.filter((r) => !r.isTotal);
        const size = (list: Row[], pick: (r: Row) => (number | null)[]) => Math.max(0, ...list.flatMap(pick).map((v) => Math.abs(v ?? 0)));
        const values = (r: Row) => [r.value, r.base], deltas = (r: Row) => [r.delta];
        return {
            value: size([total], values) > TOTAL_BREAK * size(others, values) ? others : rows,
            delta: size([total], deltas) > TOTAL_BREAK * size(others, deltas) ? others : rows,
        };
    }

    /** A slanted white stripe near the far end of a bar, showing that the bar has been cut short. */
    private breakMark(g: Layer, r: { x: number; y: number; width: number; height: number }, vertical: boolean, farAtStart: boolean): void {
        if ((vertical ? r.height : r.width) < 22) return;
        const slant = 3, half = 2;
        let points: string;
        if (vertical) {
            const c = farAtStart ? r.y + 11 : r.y + r.height - 11;
            points = `${r.x - 2},${c + slant + half} ${r.x + r.width + 2},${c - slant + half} ${r.x + r.width + 2},${c - slant - half} ${r.x - 2},${c + slant - half}`;
        } else {
            const c = farAtStart ? r.x + 11 : r.x + r.width - 11;
            points = `${c - slant - half},${r.y + r.height + 2} ${c - slant + half},${r.y + r.height + 2} ${c + slant + half},${r.y - 2} ${c + slant - half},${r.y - 2}`;
        }
        g.append("polygon").attr("class", "break").attr("points", points).attr("fill", "#FFFFFF");
    }

    /** Scale for a variance chart. It always includes zero and leaves room for labels at the ends that have bars. */
    private varianceScale(values: number[], from: number, to: number, padLow: number, padHigh: number, fixed?: [number, number], always?: boolean): ScaleLinear<number, number> {
        let low = fixed ? fixed[0] : Math.min(0, ...values), high = fixed ? fixed[1] : Math.max(0, ...values);
        if (low === high) {
            low -= 1;
            high += 1;
        }
        const direction = to >= from ? 1 : -1;
        return scaleLinear().domain([low, high]).range([from + direction * (low < 0 || always ? padLow : 3), to - direction * (high > 0 || always ? padHigh : 3)]).clamp(true);
    }

    private valueScale(rows: Row[], from: number, to: number, pad: number, fixed?: [number, number]): ScaleLinear<number, number> {
        const values = rows.flatMap((r) => [r.value, r.base]).filter((v): v is number => v !== null);
        let low = fixed ? fixed[0] : Math.min(0, ...values), high = fixed ? fixed[1] : Math.max(0, ...values);
        if (low === high) high = low + 1;
        const direction = to >= from ? 1 : -1;
        // Room for a label only at the ends that have bars: the top for positive values, the bottom for negative.
        return scaleLinear().domain([low, high]).range([from + (low < 0 ? direction * pad : 0), to - (high > 0 ? direction * pad : 0)]).clamp(true);
    }

    /**
     * A chart title. Clicking it sorts the categories by that chart's values: largest first, then
     * smallest first, then back to the order the data came in.
     */
    private drawTitle(plot: Plot, panel: Panel, x: number, y: number, anchor: string, options: ChartOptions, handlers: ChartHandlers, compact: boolean): void {
        const active = options.sortField === panel.field;
        const arrow = active ? (options.sortDirection === "desc" ? " ▼" : " ▲") : "";
        const text = plot.frame
            .append("text")
            .attr("class", "title")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", anchor)
            .attr("font-size", compact ? 9 : 10)
            .attr("font-weight", 600)
            .attr("fill", options.textColor)
            .text(panel.title + (compact ? "" : arrow));
        if (compact) return;
        text.style("pointer-events", "all")
            .style("cursor", "pointer")
            .on("click", (event: MouseEvent) => {
                event.stopPropagation();
                if (!active) handlers.onSort(panel.field, "desc");
                else if (options.sortDirection === "desc") handlers.onSort(panel.field, "asc");
                else handlers.onSort("none", "desc");
            })
            .append("title")
            .text("Click to sort by this chart");
    }

    /** The small numbered circle that ties a category to its comment. */
    private drawCommentMarker(layer: Layer, x: number, y: number, n: number, options: ChartOptions): void {
        layer.append("circle").attr("class", "commentMarker").attr("cx", x).attr("cy", y).attr("r", 6.5).attr("fill", options.actualColor);
        layer.append("text").attr("class", "commentNumber").attr("x", x).attr("y", y + 3).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 600).attr("fill", "#FFFFFF").text(String(n));
    }

    /** The list of comments, numbered to match the markers on the chart. */
    private drawComments(rows: Row[], options: ChartOptions, x: number, y: number, width: number, height: number): void {
        const layer = this.root.append("g").attr("class", "comments");
        const size = options.categorySize;
        const lineHeight = size * 1.3;
        const charsPerLine = (width - 20) / (size * 0.54);
        let cursor = y + 10;
        rows.forEach((row, i) => {
            const lines = wrapText(row.comment || "", charsPerLine);
            // Stop before running off the bottom; say that there is more.
            if (cursor + lineHeight * 2 > y + height) {
                if (cursor + lineHeight <= y + height) layer.append("text").attr("x", x + 18).attr("y", cursor + 3).attr("font-size", size).attr("fill", options.textColor).text("…");
                cursor = y + height + 1;
                return;
            }
            this.drawCommentMarker(layer, x + 7, cursor, i + 1, options);
            layer.append("text").attr("x", x + 18).attr("y", cursor + 3.5).attr("font-size", size).attr("font-weight", 600).attr("fill", options.textColor).text(row.category);
            cursor += lineHeight;
            for (const line of lines) {
                if (cursor > y + height) break;
                layer.append("text").attr("class", "commentText").attr("x", x + 18).attr("y", cursor + 3.5).attr("font-size", size).attr("fill", options.textColor).text(line);
                cursor += lineHeight;
            }
            cursor += lineHeight * 0.5;
        });
    }

    /** The key to the shades in a stacked chart. */
    private drawStackLegend(plot: Plot, names: string[], x: number, y: number, maxWidth: number, options: ChartOptions): void {
        let cursor = x;
        names.forEach((name, i) => {
            const width = name.length * 5.6 + 22;
            if (cursor + width > x + maxWidth) return;
            plot.frame.append("rect").attr("x", cursor).attr("y", y - 8).attr("width", 9).attr("height", 9).attr("fill", this.stackShade(i, names.length, options));
            plot.frame.append("text").attr("class", "legend").attr("x", cursor + 13).attr("y", y).attr("font-size", 9.5).attr("fill", options.textColor).text(name);
            cursor += width;
        });
    }

    // ------------------------------------------------------------------ columns (time series)

    private drawColumns(plot: Plot, rows: Row[], options: ChartOptions, handlers: ChartHandlers, width: number, height: number, extras: PlotExtras): void {
        const code = options.scenario ? SCENARIO_CODE[options.scenario] : "";
        const hasVariance = !!options.scenario && rows.some((r) => r.delta !== null);
        const showAbsolute = hasVariance && options.showAbsolute;
        const showRelative = hasVariance && options.showRelative && rows.some((r) => r.deltaPercent !== null);
        const compact = !!extras.compact;
        const labelSize = compact ? Math.min(options.labelSize, 8) : options.labelSize;
        const labelPad = options.showLabels ? labelSize + 5 : 4;
        const hasComments = !!extras.commentNumbers && extras.commentNumbers.size > 0;
        const stackNames = extras.stackNames;

        const gutter = compact ? 30 : 42;                   // room on the left for the chart titles
        const categoryHeight = options.categorySize + 10;
        const legendHeight = stackNames ? 16 : 0;
        // With only a few categories the columns would become very wide, so the chart stops short of the right edge.
        const left = gutter, right = Math.min(width - 6, gutter + rows.length * MAX_COLUMN_STEP);
        const top = 4 + legendHeight, bottom = height - categoryHeight;
        const gap = 10;
        const available = Math.max(30, bottom - top - (showAbsolute ? gap : 0) - (showRelative ? gap : 0));
        const relativeHeight = showRelative ? available * 0.2 : 0;
        const absoluteHeight = showAbsolute ? available * 0.26 : 0;
        const mainHeight = available - relativeHeight - absoluteHeight;

        const x: ScaleBand<string> = scaleBand<string>().domain(rows.map((r) => r.key)).range([left, right]).paddingInner(0.32).paddingOuter(0.12);
        const band = x.bandwidth();
        // The comparison bar sits behind and to the left of the value bar, overlapping it.
        const baseX = (r: Row) => x(r.key) ?? 0;
        const valueX = (r: Row) => (x(r.key) ?? 0) + band * 0.3;
        const barWidth = band * 0.7;
        const centre = (r: Row) => valueX(r) + barWidth / 2;
        const scaleRows = this.scaleRows(rows);
        // Labels are left off a chart when its columns are too narrow for them; the tooltip still has the figures.
        const fits = (texts: string[], atLeast: number) => options.showLabels && Math.max(atLeast, ...texts.map((t) => t.length)) * labelSize * 0.56 <= x.step() + 2;
        const shared = extras.widest || { value: 0, delta: 0, percent: 0 };
        const valueLabels = fits(rows.filter((r) => r.value !== null && !r.isTotal).map((r) => options.formatValue(r.value as number)), shared.value);
        const deltaLabels = fits(rows.filter((r) => r.delta !== null && !r.isTotal).map((r) => this.signed(r.delta as number, options)), shared.delta);
        const percentLabels = fits(rows.filter((r) => r.deltaPercent !== null && !r.isTotal).map((r) => formatPercent(r.deltaPercent as number)), shared.percent);
        const labelled = (row: Row, flag: boolean) => flag || (!!row.isTotal && options.showLabels);

        let cursor = top;
        const panel = (size: number, title: string, field: SortField, build: (from: number, to: number) => ScaleLinear<number, number>): Panel => {
            const start = cursor, end = cursor + size;
            cursor = end + gap;
            return { start, end, scale: build(end, start), title, field };
        };
        const domains = extras.domains;
        const relative = showRelative
            ? panel(relativeHeight, `${DELTA}${code}%`, "deltaPercent", (from, to) => this.varianceScale(rows.map((r) => capPercent(r.deltaPercent ?? 0)), from, to, labelPad + 4, labelPad + 4, domains && domains.percent))
            : null;
        const absolute = showAbsolute
            ? panel(absoluteHeight, `${DELTA}${code}`, "delta", (from, to) => this.varianceScale(scaleRows.delta.map((r) => r.delta ?? 0), from, to, labelPad, labelPad, domains && domains.delta))
            : null;
        const main = panel(mainHeight, "AC", "value", (from, to) => this.valueScale(scaleRows.value, from, to, labelPad + (hasComments ? 16 : 0), domains && domains.value));

        // ---- frame: titles, axes, legend
        [relative, absolute, main].forEach((p) => {
            if (p) this.drawTitle(plot, p, 2, (p.start + p.end) / 2 + 3.5, "start", options, handlers, compact);
        });
        plot.frame.append("line").attr("class", "axis").attr("x1", left).attr("x2", right).attr("y1", main.scale(0)).attr("y2", main.scale(0)).attr("stroke", options.textColor).attr("stroke-width", 1);
        if (absolute) this.drawVarianceAxis(plot, left, absolute.scale(0), right, absolute.scale(0), options);
        if (relative) this.drawVarianceAxis(plot, left, relative.scale(0), right, relative.scale(0), options);
        if (stackNames) this.drawStackLegend(plot, stackNames, left, 12, right - left, options);

        // ---- marks
        const groups = this.itemGroups(plot, rows, options, handlers);
        const baseStyle = this.baseStyle(options);
        const chart = this;
        groups.each(function (row) {
            const g: Layer = select<SVGGElement, unknown>(this);
            // Full-height strip so the whole column of the three charts responds to the pointer.
            g.append("rect").attr("class", "hit").attr("x", (x(row.key) ?? 0) - 2).attr("y", top).attr("width", band + 4).attr("height", bottom - top).attr("fill", "transparent");

            if (row.base !== null && options.scenario) {
                const y0 = main.scale(0), y1 = main.scale(row.base);
                g.append("rect").attr("class", "base").attr("x", baseX(row)).attr("y", Math.min(y0, y1)).attr("width", barWidth).attr("height", Math.max(1, Math.abs(y1 - y0)))
                    .attr("fill", baseStyle.fill).attr("stroke", baseStyle.stroke).attr("stroke-width", 1.2);
                if (outside(main.scale, row.base)) chart.breakMark(g, { x: baseX(row), y: Math.min(y0, y1), width: barWidth, height: Math.abs(y1 - y0) }, true, row.base >= 0);
            }
            if (row.value !== null) {
                const y0 = main.scale(0), y1 = main.scale(row.value);
                if (stackNames && row.parts && row.parts.length) {
                    // Stacked: positive parts build upwards from zero and negative parts downwards.
                    let up = 0, down = 0;
                    row.parts.forEach((part) => {
                        const from = part.value >= 0 ? up : down;
                        const to = from + part.value;
                        if (part.value >= 0) up = to; else down = to;
                        const a = main.scale(from), b = main.scale(to);
                        g.append("rect").attr("class", "segment").attr("x", valueX(row)).attr("y", Math.min(a, b)).attr("width", barWidth).attr("height", Math.max(0.5, Math.abs(b - a)))
                            .attr("fill", chart.stackShade(stackNames.indexOf(part.name), stackNames.length, options)).attr("stroke", "#FFFFFF").attr("stroke-width", 0.5);
                    });
                } else {
                    const style = chart.valueStyle(row, options);
                    g.append("rect").attr("class", "value").attr("x", valueX(row)).attr("y", Math.min(y0, y1)).attr("width", barWidth).attr("height", Math.max(1, Math.abs(y1 - y0)))
                        .attr("fill", style.fill).attr("stroke", style.stroke).attr("stroke-width", 1.2);
                    if (outside(main.scale, row.value)) chart.breakMark(g, { x: valueX(row), y: Math.min(y0, y1), width: barWidth, height: Math.abs(y1 - y0) }, true, row.value >= 0);
                }
                // The label clears whichever of the two bars reaches further.
                const yb = row.base !== null && options.scenario ? main.scale(row.base) : y1;
                const labelY = row.value >= 0 ? Math.min(y1, yb) - 4 : Math.max(y1, yb) + labelSize + 1;
                if (labelled(row, valueLabels)) {
                    g.append("text").attr("class", "label").attr("x", centre(row)).attr("y", labelY).attr("text-anchor", "middle")
                        .attr("font-size", labelSize).attr("font-weight", row.isTotal ? 600 : 400).attr("fill", options.textColor).text(options.formatValue(row.value));
                }
                const number = extras.commentNumbers && extras.commentNumbers.get(row.key);
                if (number) chart.drawCommentMarker(g, centre(row), Math.min(y0, y1, yb) - (valueLabels ? labelSize + 12 : 9), number, options);
            }
            if (absolute && row.delta !== null) {
                const y0 = absolute.scale(0), y1 = absolute.scale(row.delta);
                g.append("rect").attr("class", "delta").attr("x", valueX(row)).attr("y", Math.min(y0, y1)).attr("width", barWidth).attr("height", Math.max(1, Math.abs(y1 - y0)))
                    .attr("fill", chart.varianceColor(row.delta, options));
                if (outside(absolute.scale, row.delta)) chart.breakMark(g, { x: valueX(row), y: Math.min(y0, y1), width: barWidth, height: Math.abs(y1 - y0) }, true, row.delta >= 0);
                if (labelled(row, deltaLabels)) {
                    g.append("text").attr("class", "label").attr("x", centre(row)).attr("y", row.delta >= 0 ? y1 - 3 : y1 + labelSize).attr("text-anchor", "middle")
                        .attr("font-size", labelSize).attr("font-weight", row.isTotal ? 600 : 400).attr("fill", options.textColor).text(chart.signed(row.delta, options));
                }
            }
            if (relative && row.deltaPercent !== null && row.delta !== null) {
                const shown = capPercent(row.deltaPercent);
                const y0 = relative.scale(0), y1 = relative.scale(shown);
                const color = chart.varianceColor(row.delta, options);
                g.append("line").attr("class", "pin").attr("x1", centre(row)).attr("x2", centre(row)).attr("y1", y0).attr("y2", y1).attr("stroke", color).attr("stroke-width", 2);
                g.append("rect").attr("class", "pinHead").attr("x", centre(row) - 3.5).attr("y", y1 - 3.5).attr("width", 7).attr("height", 7).attr("fill", options.textColor);
                if (labelled(row, percentLabels)) {
                    g.append("text").attr("class", "label").attr("x", centre(row)).attr("y", shown >= 0 ? y1 - 6 : y1 + labelSize + 4).attr("text-anchor", "middle")
                        .attr("font-size", labelSize).attr("font-weight", row.isTotal ? 600 : 400).attr("fill", options.textColor).text(formatPercent(row.deltaPercent));
                }
            }
        });

        // ---- category labels under the main chart; skip some if they would run into each other
        const widest = Math.max(...rows.map((r) => r.category.length)) * options.categorySize * 0.58;
        const every = Math.max(1, Math.ceil((widest + 6) / x.step()));
        rows.forEach((row, i) => {
            if (i % every !== 0 && !row.isTotal) return;
            plot.frame
                .append("text")
                .attr("class", "category")
                .attr("x", centre(row) - barWidth * 0.15)
                .attr("y", bottom + options.categorySize + 3)
                .attr("text-anchor", "middle")
                .attr("font-size", options.categorySize)
                .attr("font-weight", row.isTotal ? 600 : 400)
                .attr("fill", options.textColor)
                .text(row.category);
        });
    }

    // ------------------------------------------------------------------ bars (structure)

    private drawBars(plot: Plot, rows: Row[], options: ChartOptions, handlers: ChartHandlers, width: number, height: number, extras: PlotExtras): void {
        const code = options.scenario ? SCENARIO_CODE[options.scenario] : "";
        const hasVariance = !!options.scenario && rows.some((r) => r.delta !== null);
        const showAbsolute = hasVariance && options.showAbsolute;
        const showRelative = hasVariance && options.showRelative && rows.some((r) => r.deltaPercent !== null);
        const compact = !!extras.compact;
        const labelSize = compact ? Math.min(options.labelSize, 8) : options.labelSize;
        const charWidth = labelSize * 0.6;
        const stackNames = extras.stackNames;
        const hasComments = !!extras.commentNumbers && extras.commentNumbers.size > 0;
        // Room beside the bars for their labels, sized from the longest label that will be drawn.
        const longest = (texts: string[]) => (options.showLabels ? Math.max(0, ...texts.map((t) => t.length)) * charWidth + 8 : 4);
        const valuePad = longest(rows.filter((r) => r.value !== null).map((r) => options.formatValue(r.value as number))) + (hasComments ? 16 : 0);
        // Variance labels sit beyond the end of their bar, so each side only needs room for the labels on that side.
        const deltaPad = (positive: boolean) => longest(rows.filter((r) => r.delta !== null && r.delta >= 0 === positive).map((r) => this.signed(r.delta as number, options)));
        const percentPad = (positive: boolean) => longest(rows.filter((r) => r.deltaPercent !== null && r.deltaPercent >= 0 === positive).map((r) => formatPercent(r.deltaPercent as number))) + 5;
        const scaleRows = this.scaleRows(rows);

        const legendHeight = stackNames ? 16 : 0;
        const headerHeight = 16 + legendHeight;
        // With only a few categories the bars would become very thick, so the chart stops short of the bottom edge.
        const top = headerHeight + 2, bottom = Math.min(height - 4, headerHeight + 2 + rows.length * MAX_BAR_STEP);
        const categoryWidth = Math.min(width * 0.34, Math.max(...rows.map((r) => r.category.length)) * options.categorySize * 0.6 + 12);
        const left = categoryWidth, right = width - 4;
        const gap = 14;
        const available = Math.max(40, right - left - (showAbsolute ? gap : 0) - (showRelative ? gap : 0));
        // Each chart first gets room for its labels, then a share of what is left for its bars.
        let absolutePads = showAbsolute ? deltaPad(false) + deltaPad(true) : 0;
        let relativePads = showRelative ? percentPad(false) + percentPad(true) : 0;
        let barRoom = Math.max(30, available - valuePad - absolutePads - relativePads);
        // Too narrow for labels on both sides of the variance axes: the labels move into a
        // column at the right of each variance chart, which needs room for one label, not two.
        const labelColumn = barRoom < available * 0.4;
        const deltaColumn = Math.max(deltaPad(false), deltaPad(true)), percentColumn = Math.max(percentPad(false), percentPad(true));
        if (labelColumn) {
            absolutePads = showAbsolute ? deltaColumn + 3 : 0;
            relativePads = showRelative ? percentColumn + 3 : 0;
            barRoom = Math.max(30, available - valuePad - absolutePads - relativePads);
        }
        const shares = 0.5 + (showAbsolute ? 0.3 : 0) + (showRelative ? 0.2 : 0);
        const relativeWidth = showRelative ? relativePads + (barRoom * 0.2) / shares : 0;
        const absoluteWidth = showAbsolute ? absolutePads + (barRoom * 0.3) / shares : 0;
        const mainWidth = Math.max(20, available - relativeWidth - absoluteWidth);

        const y: ScaleBand<string> = scaleBand<string>().domain(rows.map((r) => r.key)).range([top, bottom]).paddingInner(0.32).paddingOuter(0.12);
        const band = y.bandwidth();
        // The comparison bar sits behind and above the value bar, overlapping it.
        const baseY = (r: Row) => y(r.key) ?? 0;
        const valueY = (r: Row) => (y(r.key) ?? 0) + band * 0.3;
        const barHeight = band * 0.7;
        const middle = (r: Row) => valueY(r) + barHeight / 2;

        let cursor = left;
        const panel = (size: number, title: string, field: SortField, build: (from: number, to: number) => ScaleLinear<number, number>): Panel => {
            const start = cursor, end = cursor + size;
            cursor = end + gap;
            return { start, end, scale: build(start, end), title, field };
        };
        const domains = extras.domains;
        const main = panel(mainWidth, "AC", "value", (from, to) => this.valueScale(scaleRows.value, from, to, valuePad, domains && domains.value));
        const absolute = showAbsolute
            ? panel(absoluteWidth, `${DELTA}${code}`, "delta", (from, to) => this.varianceScale(scaleRows.delta.map((r) => r.delta ?? 0), from, to, labelColumn ? 3 : deltaPad(false), labelColumn ? deltaColumn : deltaPad(true), domains && domains.delta, labelColumn))
            : null;
        const relative = showRelative
            ? panel(relativeWidth, `${DELTA}${code}%`, "deltaPercent", (from, to) => this.varianceScale(rows.map((r) => capPercent(r.deltaPercent ?? 0)), from, to, labelColumn ? 6 : percentPad(false), labelColumn ? percentColumn : percentPad(true), domains && domains.percent, labelColumn))
            : null;

        // ---- frame: titles above each chart, axes, legend
        [main, absolute, relative].forEach((p) => {
            if (p) this.drawTitle(plot, p, p.scale(0), headerHeight - 5, "middle", options, handlers, compact);
        });
        plot.frame.append("line").attr("class", "axis").attr("x1", main.scale(0)).attr("x2", main.scale(0)).attr("y1", top).attr("y2", bottom).attr("stroke", options.textColor).attr("stroke-width", 1);
        if (absolute) this.drawVarianceAxis(plot, absolute.scale(0), top, absolute.scale(0), bottom, options);
        if (relative) this.drawVarianceAxis(plot, relative.scale(0), top, relative.scale(0), bottom, options);
        if (stackNames) this.drawStackLegend(plot, stackNames, left, 11, right - left, options);

        // ---- marks
        const groups = this.itemGroups(plot, rows, options, handlers);
        const baseStyle = this.baseStyle(options);
        const chart = this;
        const textY = (r: Row) => middle(r) + labelSize * 0.35;
        groups.each(function (row) {
            const g: Layer = select<SVGGElement, unknown>(this);
            const weight = row.isTotal ? 600 : 400;
            g.append("rect").attr("class", "hit").attr("x", 0).attr("y", (y(row.key) ?? 0) - 2).attr("width", width).attr("height", band + 4).attr("fill", "transparent");
            g.append("text").attr("class", "category").attr("x", categoryWidth - 8).attr("y", middle(row) + options.categorySize * 0.35 - barHeight * 0.1).attr("text-anchor", "end")
                .attr("font-size", options.categorySize).attr("font-weight", weight).attr("fill", options.textColor).text(row.category);

            if (row.base !== null && options.scenario) {
                const x0 = main.scale(0), x1 = main.scale(row.base);
                g.append("rect").attr("class", "base").attr("x", Math.min(x0, x1)).attr("y", baseY(row)).attr("width", Math.max(1, Math.abs(x1 - x0))).attr("height", barHeight)
                    .attr("fill", baseStyle.fill).attr("stroke", baseStyle.stroke).attr("stroke-width", 1.2);
                if (outside(main.scale, row.base)) chart.breakMark(g, { x: Math.min(x0, x1), y: baseY(row), width: Math.abs(x1 - x0), height: barHeight }, false, row.base < 0);
            }
            if (row.value !== null) {
                const x0 = main.scale(0), x1 = main.scale(row.value);
                if (stackNames && row.parts && row.parts.length) {
                    let up = 0, down = 0;
                    row.parts.forEach((part) => {
                        const from = part.value >= 0 ? up : down;
                        const to = from + part.value;
                        if (part.value >= 0) up = to; else down = to;
                        const a = main.scale(from), b = main.scale(to);
                        g.append("rect").attr("class", "segment").attr("x", Math.min(a, b)).attr("y", valueY(row)).attr("width", Math.max(0.5, Math.abs(b - a))).attr("height", barHeight)
                            .attr("fill", chart.stackShade(stackNames.indexOf(part.name), stackNames.length, options)).attr("stroke", "#FFFFFF").attr("stroke-width", 0.5);
                    });
                } else {
                    const style = chart.valueStyle(row, options);
                    g.append("rect").attr("class", "value").attr("x", Math.min(x0, x1)).attr("y", valueY(row)).attr("width", Math.max(1, Math.abs(x1 - x0))).attr("height", barHeight)
                        .attr("fill", style.fill).attr("stroke", style.stroke).attr("stroke-width", 1.2);
                    if (outside(main.scale, row.value)) chart.breakMark(g, { x: Math.min(x0, x1), y: valueY(row), width: Math.abs(x1 - x0), height: barHeight }, false, row.value < 0);
                }
                const text = options.formatValue(row.value);
                // The label clears whichever of the two bars reaches further.
                const xb = row.base !== null && options.scenario ? main.scale(row.base) : x1;
                const labelX = row.value >= 0 ? Math.max(x1, xb) + 4 : Math.min(x1, xb) - 4;
                if (options.showLabels) {
                    g.append("text").attr("class", "label").attr("x", labelX).attr("y", textY(row)).attr("text-anchor", row.value >= 0 ? "start" : "end")
                        .attr("font-size", labelSize).attr("font-weight", weight).attr("fill", options.textColor).text(text);
                }
                const number = extras.commentNumbers && extras.commentNumbers.get(row.key);
                if (number) chart.drawCommentMarker(g, Math.max(x0, x1, xb) + (options.showLabels ? text.length * charWidth + 14 : 10), middle(row), number, options);
            }
            if (absolute && row.delta !== null) {
                const x0 = absolute.scale(0), x1 = absolute.scale(row.delta);
                g.append("rect").attr("class", "delta").attr("x", Math.min(x0, x1)).attr("y", valueY(row)).attr("width", Math.max(1, Math.abs(x1 - x0))).attr("height", barHeight)
                    .attr("fill", chart.varianceColor(row.delta, options));
                if (outside(absolute.scale, row.delta)) chart.breakMark(g, { x: Math.min(x0, x1), y: valueY(row), width: Math.abs(x1 - x0), height: barHeight }, false, row.delta < 0);
                if (options.showLabels) {
                    g.append("text").attr("class", "label").attr("x", labelColumn ? absolute.end : row.delta >= 0 ? x1 + 4 : x1 - 4).attr("y", textY(row)).attr("text-anchor", labelColumn || row.delta < 0 ? "end" : "start")
                        .attr("font-size", labelSize).attr("font-weight", weight).attr("fill", options.textColor).text(chart.signed(row.delta, options));
                }
            }
            if (relative && row.deltaPercent !== null && row.delta !== null) {
                const shown = capPercent(row.deltaPercent);
                const x0 = relative.scale(0), x1 = relative.scale(shown);
                const color = chart.varianceColor(row.delta, options);
                g.append("line").attr("class", "pin").attr("x1", x0).attr("x2", x1).attr("y1", middle(row)).attr("y2", middle(row)).attr("stroke", color).attr("stroke-width", 2);
                g.append("rect").attr("class", "pinHead").attr("x", x1 - 3.5).attr("y", middle(row) - 3.5).attr("width", 7).attr("height", 7).attr("fill", options.textColor);
                if (options.showLabels) {
                    g.append("text").attr("class", "label").attr("x", labelColumn ? relative.end : shown >= 0 ? x1 + 7 : x1 - 7).attr("y", textY(row)).attr("text-anchor", labelColumn || shown < 0 ? "end" : "start")
                        .attr("font-size", labelSize).attr("font-weight", weight).attr("fill", options.textColor).text(formatPercent(row.deltaPercent));
                }
            }
        });
    }

    // ------------------------------------------------------------------ small multiples

    /** One small chart per group, laid out in a grid, with the group's name above each. */
    private drawMultiples(groups: { name: string; rows: Row[] }[], options: ChartOptions, handlers: ChartHandlers, width: number, height: number): void {
        const shown = groups.map((g, index) => ({ ...g, index })).filter((g) => g.rows.length > 0);
        const count = shown.length;
        if (count === 0) return;
        // Aim for cells of a comfortable shape: wider than tall for columns, the other way for bars.
        const target = options.orientation === "bars" ? 0.9 : 1.5;
        let columns = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * width) / (height * target)))));
        let gridRows = Math.ceil(count / columns);
        while (columns > 1 && (columns - 1) * gridRows >= count) columns--;
        gridRows = Math.ceil(count / columns);
        const gapX = 14, gapY = 10, titleHeight = 16;
        const cellWidth = (width - gapX * (columns - 1)) / columns;
        const cellHeight = (height - gapY * (gridRows - 1)) / gridRows;
        const domains = options.sameScale ? domainsOf(shown.map((g) => g.rows)) : undefined;
        const chars = (pick: (r: Row) => string | null) => Math.max(0, ...shown.flatMap((g) => g.rows).map((r) => (pick(r) || "").length));
        const widest = {
            value: chars((r) => (r.value !== null ? options.formatValue(r.value) : null)),
            delta: chars((r) => (r.delta !== null ? this.signed(r.delta, options) : null)),
            percent: chars((r) => (r.deltaPercent !== null ? formatPercent(r.deltaPercent) : null)),
        };

        shown.forEach((group, i) => {
            const x = (i % columns) * (cellWidth + gapX);
            const y = Math.floor(i / columns) * (cellHeight + gapY);
            this.root.append("text").attr("class", "multipleTitle").attr("x", x + 2).attr("y", y + 11).attr("font-size", 11).attr("font-weight", 600).attr("fill", options.textColor).text(group.name);
            const plot = this.createPlot(x, y + titleHeight, group.index);
            const rows = options.showTotal && group.rows.length > 1 ? [...group.rows, totalRow(group.rows, options.totalLabel)] : group.rows;
            const extras: PlotExtras = { domains, compact: true, widest };
            if (options.orientation === "bars") this.drawBars(plot, rows, options, handlers, cellWidth, cellHeight - titleHeight, extras);
            else this.drawColumns(plot, rows, options, handlers, cellWidth, cellHeight - titleHeight, extras);
        });
    }

    // ------------------------------------------------------------------ waterfall (bridge)

    /**
     * A bridge from the comparison total to the actual total: the first bar is the comparison,
     * each category then adds or takes away its variance, and the last bar is the actual.
     * When the totals dwarf the variances the axis is cropped so the steps stay readable.
     */
    private drawWaterfall(plot: Plot, rows: Row[], options: ChartOptions, handlers: ChartHandlers, width: number, height: number, extras: PlotExtras): void {
        const horizontal = options.orientation === "bars";
        const labelSize = options.labelSize;
        const code = options.scenario ? SCENARIO_CODE[options.scenario] : "";
        const steps = rows.map((r) => ({ row: r, delta: (r.value ?? 0) - (r.base ?? 0) }));
        const startLevel = rows.reduce((s, r) => s + (r.base ?? 0), 0);
        let running = startLevel;
        const bars = steps.map((s) => {
            const from = running;
            running += s.delta;
            return { ...s, from, to: running };
        });
        const endLevel = running;

        const levels = [startLevel, endLevel, ...bars.flatMap((b) => [b.from, b.to])];
        const low = Math.min(...levels), high = Math.max(...levels);
        const spread = high - low || Math.abs(high) || 1;
        // Crop when everything sits well above (or below) zero and the steps would otherwise be slivers.
        const cropped = (low > 0 && spread < high * 0.5) || (high < 0 && spread < -low * 0.5);
        const axisLow = cropped && low > 0 ? Math.max(0, low - spread * 0.7) : Math.min(0, low);
        const axisHigh = cropped && high < 0 ? Math.min(0, high + spread * 0.7) : Math.max(0, high);
        const baseline = cropped ? (low > 0 ? axisLow : axisHigh) : 0;

        const keys = ["__start__", ...bars.map((b) => b.row.key), "__end__"];
        const texts = [options.formatValue(startLevel), options.formatValue(endLevel), ...bars.map((b) => this.signed(b.delta, options))];
        const labelPad = options.showLabels ? (horizontal ? Math.max(...texts.map((t) => t.length)) * labelSize * 0.6 + 8 : labelSize + 6) : 4;
        const maxCategory = Math.max(code.length, 2, ...rows.map((r) => r.category.length));
        const markerPad = extras.commentNumbers && extras.commentNumbers.size ? 16 : 0;

        let bandScale: ScaleBand<string>;
        let valueScale: ScaleLinear<number, number>;
        let plotStart: number, plotEnd: number;
        if (horizontal) {
            const categoryWidth = Math.min(width * 0.34, maxCategory * options.categorySize * 0.6 + 12);
            const top = 6, bottom = Math.min(height - 4, 6 + keys.length * MAX_BAR_STEP);
            bandScale = scaleBand<string>().domain(keys).range([top, bottom]).paddingInner(0.3).paddingOuter(0.1);
            valueScale = scaleLinear().domain([axisLow, axisHigh]).range([categoryWidth, width - 6 - labelPad - markerPad]);
            plotStart = top;
            plotEnd = bottom;
        } else {
            const left = 8, right = Math.min(width - 6, 8 + keys.length * MAX_COLUMN_STEP);
            const top = 4 + labelPad + markerPad, bottom = height - (options.categorySize + 10);
            bandScale = scaleBand<string>().domain(keys).range([left, right]).paddingInner(0.3).paddingOuter(0.1);
            valueScale = scaleLinear().domain([axisLow, axisHigh]).range([bottom - (axisLow < 0 ? labelPad : 0), top]);
            plotStart = left;
            plotEnd = right;
        }
        const band = bandScale.bandwidth();
        const at = (key: string) => bandScale(key) ?? 0;
        /** A bar between two levels, in whichever direction the chart runs. */
        const box = (key: string, v0: number, v1: number) => {
            const a = valueScale(v0), b = valueScale(v1);
            return horizontal
                ? { x: Math.min(a, b), y: at(key), width: Math.max(1, Math.abs(b - a)), height: band }
                : { x: at(key), y: Math.min(a, b), width: band, height: Math.max(1, Math.abs(b - a)) };
        };
        const put = (target: Layer, cls: string, r: { x: number; y: number; width: number; height: number }) =>
            target.append("rect").attr("class", cls).attr("x", r.x).attr("y", r.y).attr("width", r.width).attr("height", r.height);
        /** A value label at the end of a bar: beyond the bar in the direction it points. */
        const label = (target: Layer, key: string, level: number, pointsUp: boolean, text: string, bold: boolean) => {
            if (!options.showLabels) return;
            const p = valueScale(level);
            const t = target.append("text").attr("class", "label").attr("font-size", labelSize).attr("font-weight", bold ? 600 : 400).attr("fill", options.textColor).text(text);
            if (horizontal) t.attr("x", pointsUp ? p + 4 : p - 4).attr("y", at(key) + band / 2 + labelSize * 0.35).attr("text-anchor", pointsUp ? "start" : "end");
            else t.attr("x", at(key) + band / 2).attr("y", pointsUp ? p - 4 : p + labelSize + 1).attr("text-anchor", "middle");
        };
        const categoryLabel = (key: string, text: string, bold: boolean) => {
            const t = plot.frame.append("text").attr("class", "category").attr("font-size", options.categorySize).attr("font-weight", bold ? 600 : 400).attr("fill", options.textColor)
                .text(horizontal ? text : fitText(text, bandScale.step() - 3, options.categorySize));
            if (horizontal) t.attr("x", valueScale(axisLow) - 8).attr("y", at(key) + band / 2 + options.categorySize * 0.35).attr("text-anchor", "end");
            else t.attr("x", at(key) + band / 2).attr("y", height - 5).attr("text-anchor", "middle");
        };

        // ---- baseline (dashed when the axis is cropped) and connectors
        const basePos = valueScale(baseline);
        const baseLine = plot.frame.append("line").attr("class", "axis").attr("stroke", options.textColor).attr("stroke-width", 1).attr("stroke-dasharray", cropped ? "4 3" : null);
        if (horizontal) baseLine.attr("x1", basePos).attr("x2", basePos).attr("y1", plotStart).attr("y2", plotEnd);
        else baseLine.attr("x1", plotStart).attr("x2", plotEnd).attr("y1", basePos).attr("y2", basePos);
        const joins: { from: string; to: string; level: number }[] = [];
        keys.slice(0, -1).forEach((key, i) => joins.push({ from: key, to: keys[i + 1], level: i === 0 ? startLevel : bars[i - 1].to }));
        joins.forEach((join) => {
            const p = valueScale(join.level);
            const line = plot.frame.append("line").attr("class", "connector").attr("stroke", "#8A8A86").attr("stroke-width", 1);
            if (horizontal) line.attr("x1", p).attr("x2", p).attr("y1", at(join.from) + band).attr("y2", at(join.to));
            else line.attr("x1", at(join.from) + band).attr("x2", at(join.to)).attr("y1", p).attr("y2", p);
        });

        // ---- the two totals: comparison first, actual last
        const baseStyle = this.baseStyle(options);
        const ends = plot.frame.append("g").attr("class", "ends");
        put(ends, "start", box("__start__", baseline, startLevel)).attr("fill", baseStyle.fill).attr("stroke", baseStyle.stroke).attr("stroke-width", 1.2);
        put(ends, "end", box("__end__", baseline, endLevel)).attr("fill", options.actualColor);
        label(ends, "__start__", startLevel, startLevel >= baseline, options.formatValue(startLevel), true);
        label(ends, "__end__", endLevel, endLevel >= baseline, options.formatValue(endLevel), true);
        categoryLabel("__start__", code || "Base", true);
        categoryLabel("__end__", "AC", true);

        // ---- the steps
        const groups = this.itemGroups(plot, rows, options, handlers);
        const chart = this;
        const byKey = new Map(bars.map((b) => [b.row.key, b]));
        groups.each(function (row) {
            const g: Layer = select<SVGGElement, unknown>(this);
            const bar = byKey.get(row.key);
            if (!bar) return;
            const hit = horizontal ? { x: 0, y: at(row.key) - 2, width, height: band + 4 } : { x: at(row.key) - 2, y: 0, width: band + 4, height };
            put(g, "hit", hit).attr("fill", "transparent");
            put(g, "delta", box(row.key, bar.from, bar.to)).attr("fill", chart.varianceColor(bar.delta, options));
            label(g, row.key, bar.to, bar.delta >= 0, chart.signed(bar.delta, options), false);
            const number = extras.commentNumbers && extras.commentNumbers.get(row.key);
            if (number) {
                const end = valueScale(Math.max(bar.from, bar.to));
                // Beside (or above) the bar, beyond its label when the label is on the same side.
                const textWidth = options.showLabels && bar.delta >= 0 ? chart.signed(bar.delta, options).length * labelSize * 0.6 + 6 : 0;
                if (horizontal) chart.drawCommentMarker(g, end + textWidth + 11, at(row.key) + band / 2, number, options);
                else chart.drawCommentMarker(g, at(row.key) + band / 2, end - (options.showLabels && bar.delta >= 0 ? labelSize + 6 : 0) - 10, number, options);
            }
        });
        rows.forEach((row) => categoryLabel(row.key, row.category, false));
    }
}

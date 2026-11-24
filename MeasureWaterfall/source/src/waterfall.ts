"use strict";

import { select, Selection } from "d3-selection";
import { scaleBand, scaleLinear } from "d3-scale";

export type BarKind = "base" | "step" | "subtotal" | "total";

export interface MeasureValue {
    /** Stable identifier, for example the measure's query name. */
    key: string;
    label: string;
    /** Null when the measure returns blank. */
    value: number | null;
    /**
     * Draw this step as a subtotal bar (for example a later year's result) instead of a change.
     * The bar shows the measure's own value and the following steps continue from it; if the
     * measure is blank it shows the running total.
     */
    subtotal?: boolean;
}

export interface WaterfallBar {
    key: string;
    label: string;
    kind: BarKind;
    /** The bar's own value: the level for base and total bars, the change for a step. */
    value: number;
    /** Level the bar starts from and the level it reaches. */
    start: number;
    end: number;
    /** True when the source measure was blank and has been treated as zero. */
    blank: boolean;
    /** Subtotal bars only: the level the preceding steps add up to. */
    expected?: number;
}

/** True when a subtotal's own value differs from what the steps before it add up to. */
export function hasGap(bar: WaterfallBar): boolean {
    if (bar.kind !== "subtotal" || bar.expected === undefined) return false;
    return Math.abs(bar.end - bar.expected) > Math.max(0.5, Math.abs(bar.end) * 1e-9);
}

/**
 * Turns one base value and an ordered list of step values into waterfall bars.
 * Each step starts where the previous bar ended; the optional total bar is the
 * base plus every step. Without a base measure the chart starts from zero.
 */
export function buildBars(base: MeasureValue | null, steps: MeasureValue[], totalLabel: string, showTotal: boolean): WaterfallBar[] {
    const bars: WaterfallBar[] = [];
    let running = 0;
    if (base) {
        const value = base.value ?? 0;
        bars.push({ key: base.key, label: base.label, kind: "base", value, start: 0, end: value, blank: base.value === null });
        running = value;
    }
    for (const step of steps) {
        if (step.subtotal) {
            const level = step.value ?? running;
            bars.push({ key: step.key, label: step.label, kind: "subtotal", value: level, start: 0, end: level, blank: false, expected: running });
            running = level;
            continue;
        }
        const value = step.value ?? 0;
        bars.push({ key: step.key, label: step.label, kind: "step", value, start: running, end: running + value, blank: step.value === null });
        running += value;
    }
    // A chart that already ends on a subtotal does not need a second, identical total bar.
    if (showTotal && bars.length > 0 && bars[bars.length - 1].kind !== "subtotal") {
        bars.push({ key: "__total__", label: totalLabel, kind: "total", value: running, start: 0, end: running, blank: false });
    }
    return bars;
}

export interface WaterfallOptions {
    width: number;
    height: number;
    baseColor: string;
    totalColor: string;
    increaseColor: string;
    decreaseColor: string;
    /** 0..0.8: share of each slot left empty between bars. */
    barGap: number;
    /** Corner radius of the bars in pixels; 0 gives square corners. */
    cornerRadius: number;
    showConnectors: boolean;
    connectorColor: string;
    showLabels: boolean;
    labelSize: number;
    labelColor: string;
    /** Prefix increases with "+" on step bars. */
    signedSteps: boolean;
    categorySize: number;
    categoryColor: string;
    showValueAxis: boolean;
    /** When false the value axis is cropped around the bars so small steps are easier to see. */
    startAtZero: boolean;
    axisColor: string;
    /** Short form for labels and axis ticks, for example "$74.7M". */
    formatShort: (value: number) => string;
    /** Full form for tooltips, for example "$74,700,000". */
    formatFull: (value: number, bar: WaterfallBar) => string;
    emptyMessage: string;
}

export interface TooltipItem {
    displayName: string;
    value: string;
}

export interface WaterfallHandlers {
    showTooltip(items: TooltipItem[], event: MouseEvent, bar: WaterfallBar): void;
    hideTooltip(): void;
    onContextMenu(bar: WaterfallBar | null, event: MouseEvent): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MINUS = "−";

/** Splits a label into at most `maxLines` lines that fit `maxChars`, adding an ellipsis if it is cut. */
export function wrapLabel(label: string, maxChars: number, maxLines: number): string[] {
    const limit = Math.max(3, Math.floor(maxChars));
    const words = label.split(/\s+/).filter((w) => w.length > 0);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= limit || !current) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    const clipped = lines.slice(0, maxLines).map((line) => (line.length > limit ? line.slice(0, limit - 1) + "…" : line));
    if (lines.length > maxLines) {
        const last = clipped[maxLines - 1];
        clipped[maxLines - 1] = (last.length >= limit ? last.slice(0, limit - 1) : last) + "…";
    }
    return clipped;
}

/**
 * Path for a bar with separately rounded top and bottom corners. Each radius is limited to
 * half the bar's width and half its height, so thin bars never bulge.
 */
export function roundedBarPath(x: number, y: number, width: number, height: number, topRadius: number, bottomRadius: number): string {
    const limit = Math.min(width / 2, height / 2);
    const t = Math.max(0, Math.min(topRadius, limit));
    const b = Math.max(0, Math.min(bottomRadius, limit));
    const right = x + width;
    const base = y + height;
    return [
        `M${x + t},${y}`,
        `H${right - t}`,
        t > 0 ? `A${t},${t} 0 0 1 ${right},${y + t}` : "",
        `V${base - b}`,
        b > 0 ? `A${b},${b} 0 0 1 ${right - b},${base}` : "",
        `H${x + b}`,
        b > 0 ? `A${b},${b} 0 0 1 ${x},${base - b}` : "",
        `V${y + t}`,
        t > 0 ? `A${t},${t} 0 0 1 ${x + t},${y}` : "",
        "Z",
    ].join("");
}

export class WaterfallChart {
    private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly axisLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly connectorLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly barLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly gapLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly labelLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly categoryLayer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly messageLayer: Selection<SVGGElement, unknown, null, undefined>;

    constructor(container: HTMLElement) {
        const svgElement = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
        container.appendChild(svgElement);
        this.svg = select<SVGSVGElement, unknown>(svgElement).attr("class", "measureWaterfall");
        this.axisLayer = this.svg.append("g").attr("class", "axis");
        this.connectorLayer = this.svg.append("g").attr("class", "connectors");
        this.barLayer = this.svg.append("g").attr("class", "bars");
        this.gapLayer = this.svg.append("g").attr("class", "gaps");
        this.labelLayer = this.svg.append("g").attr("class", "labels");
        this.categoryLayer = this.svg.append("g").attr("class", "categories");
        this.messageLayer = this.svg.append("g").attr("class", "messages");
    }

    public render(bars: WaterfallBar[], options: WaterfallOptions, handlers: WaterfallHandlers): void {
        const width = Math.max(1, options.width);
        const height = Math.max(1, options.height);
        this.svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        });

        this.messageLayer.selectAll("*").remove();
        if (bars.length === 0) {
            this.axisLayer.selectAll("*").remove();
            this.connectorLayer.selectAll("*").remove();
            this.barLayer.selectAll("*").remove();
            this.gapLayer.selectAll("*").remove();
            this.labelLayer.selectAll("*").remove();
            this.categoryLayer.selectAll("*").remove();
            this.messageLayer
                .append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .attr("font-size", 12)
                .attr("fill", "#6B6B68")
                .text(options.emptyMessage);
            return;
        }

        // --- value range
        // Base and total bars start at zero, but only the level they reach counts when cropping.
        const levels = bars.flatMap((b) => {
            if (b.kind === "step") return [b.start, b.end];
            return b.expected === undefined ? [b.end] : [b.end, b.expected];
        });
        let low = Math.min(...levels);
        let high = Math.max(...levels);
        if (options.startAtZero || low === high) {
            low = Math.min(0, low);
            high = Math.max(0, high);
        } else {
            // Cropped axis: pad around the bars, but never crop past zero.
            const pad = (high - low) * 0.35;
            low = low >= 0 ? Math.max(0, low - pad) : low - pad;
            high = high <= 0 ? Math.min(0, high + pad) : high + pad;
        }
        if (low === high) high = low + 1;
        const cropped = low > 0 || high < 0;

        // --- layout
        const labelSize = options.labelSize;
        const categorySize = options.categorySize;
        const ticks = scaleLinear().domain([low, high]).ticks(5);
        const axisLabelWidth = options.showValueAxis
            ? Math.max(...ticks.map((t) => options.formatShort(t).length)) * 10 * 0.6 + 10
            : 0;
        const margin = {
            top: options.showLabels ? labelSize + 10 : 8,
            right: 8,
            left: 8 + axisLabelWidth,
            bottom: 0,
        };
        const plotWidth = Math.max(10, width - margin.left - margin.right);
        const x = scaleBand<string>()
            .domain(bars.map((b) => b.key))
            .range([margin.left, margin.left + plotWidth])
            .paddingInner(Math.min(0.8, Math.max(0, options.barGap)))
            .paddingOuter(0.15);
        const slot = x.step();
        const wrapped = bars.map((b) => wrapLabel(b.label, (slot - 6) / (categorySize * 0.56), 3));
        const categoryLines = Math.max(...wrapped.map((w) => w.length));
        margin.bottom = 8 + categoryLines * categorySize * 1.25 + 4;
        // Room for a value label under a bar that ends at or below the bottom of the range.
        const needsRoomBelow = options.showLabels && bars.some((b) => Math.min(b.start, b.end) <= low && b.value < 0);
        const plotBottom = height - margin.bottom - (needsRoomBelow ? labelSize + 6 : 0);
        const plotTop = margin.top;
        const y = scaleLinear().domain([low, high]).range([Math.max(plotTop + 10, plotBottom), plotTop]);
        const bandWidth = x.bandwidth();

        // --- axis, gridlines and baseline
        this.axisLayer.selectAll("*").remove();
        if (options.showValueAxis) {
            ticks.forEach((t) => {
                this.axisLayer
                    .append("line")
                    .attr("class", "grid")
                    .attr("x1", margin.left)
                    .attr("x2", margin.left + plotWidth)
                    .attr("y1", y(t))
                    .attr("y2", y(t))
                    .attr("stroke", options.axisColor)
                    .attr("stroke-opacity", 0.25)
                    .attr("stroke-width", 1);
                this.axisLayer
                    .append("text")
                    .attr("class", "tick")
                    .attr("x", margin.left - 6)
                    .attr("y", y(t) + 3.5)
                    .attr("text-anchor", "end")
                    .attr("font-size", 10)
                    .attr("fill", options.categoryColor)
                    .text(options.formatShort(t));
            });
        }
        const baselineValue = cropped ? (low > 0 ? low : high) : 0;
        this.axisLayer
            .append("line")
            .attr("class", "baseline")
            .attr("x1", margin.left)
            .attr("x2", margin.left + plotWidth)
            .attr("y1", y(baselineValue))
            .attr("y2", y(baselineValue))
            .attr("stroke", options.axisColor)
            .attr("stroke-width", 1)
            // A dashed baseline signals that the axis does not start at zero.
            .attr("stroke-dasharray", cropped ? "4 3" : null);

        // --- bars
        const colorFor = (b: WaterfallBar): string => {
            if (b.kind === "base") return options.baseColor;
            if (b.kind === "total" || b.kind === "subtotal") return options.totalColor;
            return b.value >= 0 ? options.increaseColor : options.decreaseColor;
        };
        // Base and total bars run from zero; on a cropped axis they are drawn from the edge of the plot.
        const clamp = (v: number) => Math.min(high, Math.max(low, v));
        const top = (b: WaterfallBar) => Math.min(y(clamp(b.start)), y(clamp(b.end)));
        const bottom = (b: WaterfallBar) => Math.max(y(clamp(b.start)), y(clamp(b.end)));
        const barX = (b: WaterfallBar) => x(b.key) ?? 0;

        const tooltipFor = (b: WaterfallBar): TooltipItem[] => {
            const items: TooltipItem[] = [{ displayName: b.label, value: b.blank ? "(blank)" : options.formatFull(b.value, b) }];
            if (b.kind === "step") {
                items.push({ displayName: "Running total", value: options.formatFull(b.end, b) });
                // Compare with the most recent level bar: the base, or the latest subtotal.
                const level = bars.slice(0, bars.indexOf(b)).reverse().find((o) => o.kind !== "step");
                if (level && level.value !== 0) {
                    const pct = (b.value / Math.abs(level.value)) * 100;
                    items.push({ displayName: `Change vs ${level.label}`, value: `${pct >= 0 ? "+" : MINUS}${Math.abs(pct).toFixed(1)}%` });
                }
            }
            if (hasGap(b) && b.expected !== undefined) {
                items.push({ displayName: "Steps add up to", value: options.formatFull(b.expected, b) });
                items.push({ displayName: "Not explained by the steps", value: options.formatFull(b.end - b.expected, b) });
            }
            return items;
        };

        // Steps float, so all four corners are rounded. Base, subtotal and total bars stand on
        // the baseline, so only the end away from it is rounded.
        const barPath = (b: WaterfallBar): string => {
            const barTop = bottom(b) - top(b) < 1 ? top(b) - 0.5 : top(b);
            const barHeight = Math.max(1, bottom(b) - top(b));
            const r = Math.max(0, options.cornerRadius);
            if (b.kind === "step") return roundedBarPath(barX(b), barTop, bandWidth, barHeight, r, r);
            const pointsUp = b.end >= b.start;
            return roundedBarPath(barX(b), barTop, bandWidth, barHeight, pointsUp ? r : 0, pointsUp ? 0 : r);
        };

        this.barLayer
            .selectAll<SVGPathElement, WaterfallBar>("path")
            .data(bars, (b) => b.key)
            .join("path")
            .attr("class", (b) => `bar ${b.kind}`)
            .attr("d", barPath)
            .attr("fill", colorFor)
            .on("mousemove", (event: MouseEvent, b) => handlers.showTooltip(tooltipFor(b), event, b))
            .on("mouseleave", () => handlers.hideTooltip())
            .on("contextmenu", (event: MouseEvent, b) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(b, event);
            });

        // --- connectors: from the level each bar reaches to the start of the next bar
        const links = options.showConnectors ? bars.slice(0, -1).map((b, i) => ({ from: b, to: bars[i + 1] })) : [];
        this.connectorLayer
            .selectAll<SVGLineElement, (typeof links)[number]>("line")
            .data(links)
            .join("line")
            .attr("x1", (l) => barX(l.from) + bandWidth)
            .attr("x2", (l) => barX(l.to))
            .attr("y1", (l) => y(clamp(l.from.end)))
            .attr("y2", (l) => y(clamp(l.from.end)))
            .attr("stroke", options.connectorColor)
            .attr("stroke-width", 1);

        // --- a dashed mark on any subtotal whose own value differs from what the steps add up to
        const gaps = bars.filter((b) => hasGap(b));
        this.gapLayer
            .selectAll<SVGLineElement, WaterfallBar>("line")
            .data(gaps, (b) => b.key)
            .join("line")
            .attr("x1", (b) => barX(b) - 3)
            .attr("x2", (b) => barX(b) + bandWidth + 3)
            .attr("y1", (b) => y(clamp(b.expected ?? b.end)))
            .attr("y2", (b) => y(clamp(b.expected ?? b.end)))
            .attr("stroke", options.connectorColor)
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4 3");

        // --- value labels
        const labelText = (b: WaterfallBar): string => {
            if (b.blank) return "–";
            const text = options.formatShort(b.value);
            return b.kind === "step" && options.signedSteps && b.value > 0 ? `+${text}` : text;
        };
        const labels = !options.showLabels ? [] : bars.map((b) => {
            // Increases and level bars are labelled above the bar; decreases below it when there is room.
            const below = b.value < 0 && bottom(b) + labelSize + 4 <= height - margin.bottom;
            return {
                bar: b,
                x: barX(b) + bandWidth / 2,
                y: below ? bottom(b) + labelSize + 2 : top(b) - 5,
            };
        });
        this.labelLayer
            .selectAll<SVGTextElement, (typeof labels)[number]>("text")
            .data(labels)
            .join("text")
            .attr("x", (l) => l.x)
            .attr("y", (l) => l.y)
            .attr("text-anchor", "middle")
            .attr("font-size", labelSize)
            .attr("font-weight", (l) => (l.bar.kind === "step" ? 400 : 600))
            .attr("fill", options.labelColor)
            .text((l) => labelText(l.bar));

        // --- category labels under the plot
        const categoryTop = height - margin.bottom + 8 + categorySize * 0.8;
        const groups = this.categoryLayer
            .selectAll<SVGTextElement, WaterfallBar>("text")
            .data(bars, (b) => b.key)
            .join("text")
            .attr("text-anchor", "middle")
            .attr("font-size", categorySize)
            .attr("font-weight", (b) => (b.kind === "step" ? 400 : 600))
            .attr("fill", options.categoryColor);
        groups.each(function (b, i) {
            const text = select(this);
            text.selectAll("tspan").remove();
            wrapped[i].forEach((line, lineIndex) => {
                text.append("tspan")
                    .attr("x", barX(b) + bandWidth / 2)
                    .attr("y", categoryTop + lineIndex * categorySize * 1.25)
                    .text(line);
            });
        });
    }
}

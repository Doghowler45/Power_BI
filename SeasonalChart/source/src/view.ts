"use strict";

import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, SURFACE } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, niceTicks, svg, TextMeasurer } from "./common/svg";

/** The measure for each month of each year: `years[y].values[m]`, null where there is no data. */
export interface SeasonalData {
    months: string[];
    years: { name: string; values: (number | null)[] }[];
}

export interface SeasonalOptions {
    width: number;
    height: number;
    /** Add each month to the ones before it, to show the year building up. */
    cumulative: boolean;
    /** Shade the range the earlier years span, behind the lines. */
    showBand: boolean;
    startAtZero: boolean;
    /** Colour of the latest year's line. Earlier years are grey. */
    color: string;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface SeasonalHandlers {
    /** A month was clicked: its position in the data. */
    onSelect(month: number, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(month: number | null, event: MouseEvent): void;
    showTooltip(month: number, lines: { year: string; value: number | null }[], event: MouseEvent): void;
    hideTooltip(): void;
}

const EARLIER = "#B5B4AC", PREVIOUS = "#6F6E69", BAND = "#F0EFEA";

/** Running totals through the year, stopping at the last month that has a value. */
function accumulate(values: (number | null)[]): (number | null)[] {
    let last = -1;
    values.forEach((v, i) => {
        if (v !== null) last = i;
    });
    let running = 0;
    return values.map((v, i) => {
        if (i > last) return null;
        running += v ?? 0;
        return running;
    });
}

export class SeasonalView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "seasonalChart" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    public render(data: SeasonalData, options: SeasonalOptions, handlers: SeasonalHandlers): void {
        const root = this.root;
        clear(root);
        const width = Math.max(1, options.width), height = Math.max(1, options.height);
        root.setAttribute("width", String(width));
        root.setAttribute("height", String(height));
        root.setAttribute("viewBox", `0 0 ${width} ${height}`);
        root.onclick = (event) => {
            if (!event.defaultPrevented) handlers.onClear();
        };
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        };
        const message = (content: string) => root.appendChild(svg("text", { class: "message", x: width / 2, y: height / 2, "text-anchor": "middle", "font-size": 12, fill: INK_MUTED }, this.measure.fit(content, 12, width - 12)));
        const years = data.years
            .map((year) => ({ name: year.name, values: options.cumulative ? accumulate(year.values) : year.values }))
            .filter((year) => year.values.some((v) => v !== null));
        const monthCount = data.months.length;
        if (years.length === 0 || monthCount === 0) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const format = options.formatters[0], short = options.formatters[options.formatters.length - 1];
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));

        // The latest year is the one that stands out; the one before it is the natural comparison.
        const latest = years[years.length - 1];
        const previous = years.length > 1 ? years[years.length - 2] : null;
        const lastMonth = (values: (number | null)[]) => values.reduce<number>((found, v, i) => (v !== null ? i : found), -1);
        const latestEnd = lastMonth(latest.values);

        // ---- scale
        const all = years.flatMap((year) => year.values).filter((v): v is number => v !== null);
        let low = Math.min(...all), high = Math.max(...all);
        if (options.startAtZero || options.cumulative) low = Math.min(0, low);
        if (low === high) high = low + 1;
        const ticks = niceTicks(low - (high - low) * 0.04, high + (high - low) * 0.04, 4);
        low = Math.min(low, ticks[0]);
        high = Math.max(high, ticks[ticks.length - 1]);

        // ---- layout: year names sit at the right-hand end of their lines
        const latestValue = latestEnd >= 0 ? (latest.values[latestEnd] as number) : null;
        const latestLabel = latestValue !== null ? `${latest.name}  ${format(latestValue)}` : latest.name;
        const rightGutter = Math.max(this.measure.width(latestLabel, size, 600), ...years.map((year) => this.measure.width(year.name, size))) + 12;
        const left = Math.max(...ticks.map((t) => this.measure.width(short(t), size))) + 10;
        const top = size + 10, bottom = height - (size + 10), right = width - rightGutter;
        if (right - left < 80 || bottom - top < 50) {
            message("Make the visual larger to see the chart");
            return;
        }
        const xOf = (month: number) => (monthCount === 1 ? (left + right) / 2 : left + (month / (monthCount - 1)) * (right - left));
        const yOf = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);

        // ---- gridlines, tick labels, month names
        ticks.forEach((tick) => {
            const y = yOf(tick);
            root.appendChild(svg("line", { x1: left, x2: right, y1: y, y2: y, stroke: tick === 0 ? AXIS : GRIDLINE, "stroke-width": 1 }));
            text(left - 6, y + size * 0.35, short(tick), { "text-anchor": "end", fill: INK_MUTED });
        });
        const step = monthCount > 1 ? (right - left) / (monthCount - 1) : right - left;
        const widestMonth = Math.max(...data.months.map((m) => this.measure.width(m, size)));
        const every = Math.max(1, Math.ceil((widestMonth + 8) / step));
        data.months.forEach((name, month) => {
            if (month % every === 0) text(xOf(month), height - 4, name, { class: "monthName", "text-anchor": month === 0 ? "start" : month === monthCount - 1 && every === 1 ? "end" : "middle", fill: INK_MUTED });
        });

        // ---- the range the earlier years span, as a quiet band behind everything
        const earlier = years.slice(0, -1);
        if (options.showBand && earlier.length > 1) {
            const upper: string[] = [], lower: string[] = [];
            for (let month = 0; month < monthCount; month++) {
                const here = earlier.map((year) => year.values[month]).filter((v): v is number => v !== null);
                if (here.length === 0) continue;
                upper.push(`${xOf(month)},${yOf(Math.max(...here))}`);
                lower.unshift(`${xOf(month)},${yOf(Math.min(...here))}`);
            }
            if (upper.length > 1) root.appendChild(svg("polygon", { class: "band", points: [...upper, ...lower].join(" "), fill: BAND }));
        }

        // ---- lines: earlier years thin and grey, the previous year darker, the latest in colour with a dot on each month
        const path = (values: (number | null)[]) => {
            let d = "", pen = false;
            values.forEach((v, month) => {
                if (v === null) {
                    pen = false;
                    return;
                }
                d += `${pen ? "L" : "M"}${xOf(month).toFixed(1)},${yOf(v).toFixed(1)}`;
                pen = true;
            });
            return d;
        };
        const ends: { name: string; y: number; x: number; bold: boolean; label: string }[] = [];
        // Where the latest year's name went, when it was written beside its last point.
        let beside: { x: number; y: number } | null = null as { x: number; y: number } | null;
        years.forEach((year) => {
            const isLatest = year === latest, isPrevious = year === previous;
            root.appendChild(svg("path", {
                class: isLatest ? "line latest" : "line", d: path(year.values), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round",
                stroke: isLatest ? options.color : isPrevious ? PREVIOUS : EARLIER, "stroke-width": isLatest ? 3 : isPrevious ? 2 : 1.5,
            }));
            const end = lastMonth(year.values);
            if (end < 0) return;
            if (isLatest && end < monthCount - 1 && xOf(end) + 9 + this.measure.width(latestLabel, size, 600) <= right - 6) {
                // A year still in progress is named right beside its last point, when there is room before the edge. The halo keeps it readable over the other lines.
                root.appendChild(svg("text", {
                    class: "yearName latest", x: xOf(end) + 9, y: yOf(year.values[end] as number) + size * 0.35, "font-size": size, "font-weight": 600, fill: INK,
                    stroke: SURFACE, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round",
                }, latestLabel));
                beside = { x: xOf(end) + 9, y: yOf(year.values[end] as number) + size * 0.35 };
                return;
            }
            ends.push({ name: year.name, x: xOf(end), y: yOf(year.values[end] as number), bold: isLatest, label: isLatest ? latestLabel : year.name });
        });
        latest.values.forEach((v, month) => {
            if (v !== null) root.appendChild(svg("circle", { class: "dot", cx: xOf(month), cy: yOf(v), r: 3.5, fill: options.color, stroke: SURFACE, "stroke-width": 1.5 }));
        });

        // ---- year names at the line ends, nudged apart where lines finish close together
        ends.sort((a, b) => a.y - b.y);
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < size + 2) ends[i].y = ends[i - 1].y + size + 2;
        const overflow = ends.length ? ends[ends.length - 1].y - (bottom + size * 0.3) : 0;
        if (overflow > 0) ends.forEach((end) => (end.y -= overflow));
        ends.forEach((end) => text(right + 8, end.y + size * 0.35, end.label, { class: end.bold ? "yearName latest" : "yearName", "font-weight": end.bold ? 600 : 400, fill: end.bold ? INK : INK_SECONDARY }));

        // The change on the year before, at the latest point: the one number the chart is usually read for.
        if (previous && latestValue !== null && previous.values[latestEnd] !== null && previous.values[latestEnd] !== 0) {
            const base = previous.values[latestEnd] as number;
            const change = ((latestValue - base) / Math.abs(base)) * 100;
            const note = `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}% on ${previous.name}${options.cumulative ? " to date" : ""}`;
            const halo = { stroke: SURFACE, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" };
            if (beside && beside.x + this.measure.width(note, size, 600) <= width - 2) {
                // Stacked with the year's name, clear of the lines that lead up to the point.
                const lineAbove = beside.y - size - 4 > top + size;
                text(beside.x, lineAbove ? beside.y - size - 4 : beside.y + size + 4, note, { class: "change", "font-weight": 600, fill: INK, ...halo });
            } else {
                const x = xOf(latestEnd), y = yOf(latestValue);
                const above = y - 10 > top + size;
                text(Math.min(x, right - 2), above ? y - 10 : y + size + 8, note, { class: "change", "text-anchor": "end", "font-weight": 600, fill: INK, ...halo });
            }
        }

        // ---- hover: a line down the nearest month, and one tooltip listing every year there
        const hoverLine = svg("line", { class: "hoverLine", y1: top, y2: bottom, stroke: INK_SECONDARY, "stroke-width": 1, visibility: "hidden", "pointer-events": "none" });
        const sheet = svg("rect", { class: "hit", x: left - 4, y: top, width: right - left + 8, height: bottom - top, fill: "transparent" });
        const monthUnder = (event: Event): number => {
            const box = root.getBoundingClientRect();
            const at = ((event as MouseEvent).clientX - box.left - left) / Math.max(1, right - left);
            return Math.max(0, Math.min(monthCount - 1, Math.round(at * (monthCount - 1))));
        };
        sheet.addEventListener("mousemove", (event) => {
            const month = monthUnder(event);
            hoverLine.setAttribute("x1", String(xOf(month)));
            hoverLine.setAttribute("x2", String(xOf(month)));
            hoverLine.setAttribute("visibility", "visible");
            handlers.showTooltip(month, [...years].reverse().map((year) => ({ year: year.name, value: year.values[month] })), event as MouseEvent);
        });
        sheet.addEventListener("mouseleave", () => {
            hoverLine.setAttribute("visibility", "hidden");
            handlers.hideTooltip();
        });
        sheet.addEventListener("click", (event) => {
            event.preventDefault();
            handlers.onSelect(monthUnder(event), event as MouseEvent);
        });
        sheet.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onContextMenu(monthUnder(event), event as MouseEvent);
        });
        root.appendChild(hoverLine);
        root.appendChild(sheet);
    }
}

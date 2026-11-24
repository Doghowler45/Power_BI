"use strict";

import { interpolateLab, piecewise } from "d3-interpolate";
import { INK, INK_MUTED, INK_SECONDARY, inkOn } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, svg, TextMeasurer } from "./common/svg";

/** One row of data: a date (any day in the month it belongs to) and a value. */
export interface DatedValue {
    date: Date | null;
    value: number | null;
}

export interface MonthCell {
    /** Position of the year's row and of the month within the year (0 = the year's first month). */
    year: number;
    month: number;
    value: number;
    /** Positions, in the data as it arrived, of the rows added up into this month. */
    rows: number[];
}

export interface CalendarYear {
    label: string;
    /** Twelve entries, null where the month has no data. */
    months: (MonthCell | null)[];
    total: number;
    /** Change on the year before over the months both years have, as a percentage; null when there is nothing to compare. */
    change: number | null;
    /** Words to add after the change when the comparison covers only part of the year; otherwise empty. */
    partial: string;
}

export interface Calendar {
    years: CalendarYear[];
    monthNames: string[];
}

/**
 * Adds the rows up into months and lays them out one year to a row. `firstMonth` (1 to 12) is
 * the month a year starts with: 1 for calendar years, 7 for a year running July to June.
 */
export function buildCalendar(rows: DatedValue[], firstMonth: number, locale: string): Calendar | null {
    const start = Math.min(12, Math.max(1, Math.round(firstMonth))) - 1;
    const byYear = new Map<number, (MonthCell | null)[]>();
    rows.forEach((row, index) => {
        if (!row.date || row.value === null || isNaN(row.date.getTime())) return;
        const month = row.date.getMonth(), calendarYear = row.date.getFullYear();
        // A year is named by the calendar year it starts in.
        const year = month >= start ? calendarYear : calendarYear - 1;
        const position = (month - start + 12) % 12;
        let months = byYear.get(year);
        if (!months) {
            months = Array.from({ length: 12 }, () => null);
            byYear.set(year, months);
        }
        const cell = months[position] || { year: 0, month: position, value: 0, rows: [] };
        cell.value += row.value;
        cell.rows.push(index);
        months[position] = cell;
    });
    if (byYear.size === 0) return null;

    const ordered = [...byYear.keys()].sort((a, b) => a - b);
    const years: CalendarYear[] = ordered.map((year, y) => {
        const months = byYear.get(year) as (MonthCell | null)[];
        months.forEach((cell) => {
            if (cell) cell.year = y;
        });
        const before = y > 0 && ordered[y - 1] === year - 1 ? (byYear.get(year - 1) as (MonthCell | null)[]) : null;
        // Like for like: only the months that both years have.
        let current = 0, earlier = 0, shared = 0;
        if (before) {
            months.forEach((cell, m) => {
                const other = before[m];
                if (cell && other) {
                    current += cell.value;
                    earlier += other.value;
                    shared++;
                }
            });
        }
        return {
            label: start === 0 ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, "0")}`,
            months,
            total: months.reduce((sum, cell) => sum + (cell ? cell.value : 0), 0),
            change: shared > 0 && earlier !== 0 ? ((current - earlier) / Math.abs(earlier)) * 100 : null,
            // A year still in progress is compared "to date"; a full year set against a part-year before it, "like for like".
            partial: shared === 0 || shared === 12 ? "" : months.filter((cell) => cell !== null).length < 12 ? " to date" : " like for like",
        };
    });
    const monthNames = Array.from({ length: 12 }, (_, i) => new Date(2001, (start + i) % 12, 1).toLocaleString(locale || "en", { month: "short" }));
    return { years, monthNames };
}

export const cellKey = (cell: MonthCell): string => `${cell.year}|${cell.month}`;

export interface CalendarOptions {
    width: number;
    height: number;
    /** Light to dark steps of one hue. */
    ramp: string[];
    /** Colour each month against all months, or only against the months of its own year. */
    perYear: boolean;
    newestFirst: boolean;
    showTotals: boolean;
    showValues: boolean;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface CalendarHandlers {
    onSelect(cell: MonthCell, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(cell: MonthCell | null, event: MouseEvent): void;
    showTooltip(year: CalendarYear, cell: MonthCell, before: MonthCell | null, beforeLabel: string, event: MouseEvent): void;
    hideTooltip(): void;
}

const signedPercent = (value: number): string => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
let instanceCounter = 0;

export class CalendarView {
    private readonly uid = "cal" + ++instanceCounter;
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "calendarHeatmap" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every month that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("g.cell").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(data: Calendar | null, options: CalendarOptions, handlers: CalendarHandlers): void {
        const root = this.root;
        clear(root);
        const width = Math.max(1, options.width), height = Math.max(1, options.height);
        root.setAttribute("width", String(width));
        root.setAttribute("height", String(height));
        root.setAttribute("viewBox", `0 0 ${width} ${height}`);
        root.classList.remove("hovering");
        root.onclick = (event) => {
            if (!event.defaultPrevented) handlers.onClear();
        };
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        };
        const message = (content: string) => root.appendChild(svg("text", { class: "message", x: width / 2, y: height / 2, "text-anchor": "middle", "font-size": 12, fill: INK_MUTED }, this.measure.fit(content, 12, width - 12)));
        if (!data) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const format = options.formatters[0];
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));
        const rows = options.newestFirst ? [...data.years].reverse() : data.years;

        // ---- layout: year names on the left, months across, each year's total and change on the right
        const gap = 3;
        const left = Math.max(...rows.map((year) => this.measure.width(year.label, size, 600))) + 12;
        const totalWidth = options.showTotals ? Math.max(this.measure.width("Total", size, 600), ...rows.map((year) => this.measure.width(format(year.total), size, 600))) + 14 : 0;
        const changeWidth = options.showTotals ? Math.max(this.measure.width("On year before", size, 600), ...rows.map((year) => this.measure.width(year.change === null ? "" : signedPercent(year.change) + year.partial, size))) + 10 : 0;
        const gridRight = width - totalWidth - changeWidth - 2;
        const top = size + 12, legendHeight = 26;
        const cellWidth = (gridRight - left - gap * 11) / 12;
        const cellHeight = Math.min(46, (height - top - legendHeight - gap * (rows.length - 1)) / rows.length, Math.max(16, cellWidth * 1.1));
        if (cellWidth < 8 || cellHeight < 8) {
            message("Make the visual larger to see the calendar");
            return;
        }
        const radius = Math.min(6, cellWidth / 2, cellHeight / 2);
        const xOf = (month: number) => left + month * (cellWidth + gap);
        const yOf = (row: number) => top + row * (cellHeight + gap);

        // ---- colour scale, and hatching for months with no data
        const blend = piecewise(interpolateLab, options.ramp);
        const extent = (cells: (MonthCell | null)[]) => {
            const values = cells.filter((cell): cell is MonthCell => cell !== null).map((cell) => cell.value);
            return values.length ? { low: Math.min(...values), high: Math.max(...values) } : null;
        };
        const overall = extent(data.years.flatMap((year) => year.months));
        const defs = svg("defs");
        const hatch = svg("pattern", { id: `${this.uid}_none`, patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(45)" });
        hatch.appendChild(svg("rect", { width: 6, height: 6, fill: "#FAFAF8" }));
        hatch.appendChild(svg("rect", { width: 1, height: 6, fill: "#E7E6E1" }));
        defs.appendChild(hatch);
        const gradient = svg("linearGradient", { id: `${this.uid}_scale`, x1: 0, x2: 1, y1: 0, y2: 0 });
        for (let i = 0; i <= 10; i++) gradient.appendChild(svg("stop", { offset: `${i * 10}%`, "stop-color": blend(i / 10) }));
        defs.appendChild(gradient);
        root.appendChild(defs);

        // ---- headings
        data.monthNames.forEach((name, month) => text(xOf(month) + cellWidth / 2, size + 2, this.measure.fit(name, size, cellWidth + gap - 2), { class: "monthName", "text-anchor": "middle", fill: INK_MUTED }));
        if (options.showTotals) {
            text(gridRight + totalWidth, size + 2, "Total", { "text-anchor": "end", "font-weight": 600 });
            text(width - 2, size + 2, "On year before", { "text-anchor": "end", "font-weight": 600 });
        }

        // ---- value labels: the preferred form if it fits every cell, else a shorter one, else none
        const present = data.years.flatMap((year) => year.months).filter((cell): cell is MonthCell => cell !== null);
        const fitting = options.showValues && cellHeight >= size + 4
            ? options.formatters.find((candidate) => Math.max(...present.map((cell) => this.measure.width(candidate(cell.value), size, 600))) <= cellWidth - 6)
            : undefined;

        // ---- cells
        const ring = svg("rect", { class: "ring", fill: "none", stroke: INK, "stroke-width": 2, rx: radius + 1, visibility: "hidden", "pointer-events": "none" });
        const marker = svg("path", { class: "legendMarker", d: "M-4.5,0 L4.5,0 L0,-6 Z", fill: INK_SECONDARY, visibility: "hidden" });
        const legendY = yOf(rows.length) + 8;
        const lowText = overall && !options.perYear ? format(overall.low) : "Low", highText = overall && !options.perYear ? format(overall.high) : "High";
        const legendX = left + this.measure.width(lowText, size) + 8, legendWidth = Math.max(60, Math.min(200, cellWidth * 4));
        rows.forEach((year, row) => {
            const yearIndex = data.years.indexOf(year);
            const before = yearIndex > 0 ? data.years[yearIndex - 1] : null;
            const scale = options.perYear ? extent(year.months) : overall;
            text(left - 10, yOf(row) + cellHeight / 2 + size * 0.35, year.label, { class: "yearName", "text-anchor": "end", "font-weight": 600, fill: INK });
            year.months.forEach((cell, month) => {
                const x = xOf(month), y = yOf(row);
                if (!cell || !scale) {
                    root.appendChild(svg("rect", { class: "empty", x, y, width: cellWidth, height: cellHeight, rx: radius, fill: `url(#${this.uid}_none)` }));
                    return;
                }
                const position = scale.high === scale.low ? 0.6 : (cell.value - scale.low) / (scale.high - scale.low);
                const fill = blend(position);
                const group = svg("g", { class: "cell", "data-key": cellKey(cell) });
                group.appendChild(svg("rect", { x, y, width: cellWidth, height: cellHeight, rx: radius, fill }));
                if (fitting) group.appendChild(svg("text", { class: "value", x: x + cellWidth / 2, y: y + cellHeight / 2 + size * 0.35, "text-anchor": "middle", "font-size": size, "font-weight": 600, fill: inkOn(fill) }, fitting(cell.value)));
                group.addEventListener("mouseenter", () => {
                    root.classList.add("hovering");
                    group.classList.add("active");
                    ring.setAttribute("x", String(x - 1.5));
                    ring.setAttribute("y", String(y - 1.5));
                    ring.setAttribute("width", String(cellWidth + 3));
                    ring.setAttribute("height", String(cellHeight + 3));
                    ring.setAttribute("visibility", "visible");
                    marker.setAttribute("transform", `translate(${legendX + position * legendWidth},${legendY + 17})`);
                    marker.setAttribute("visibility", "visible");
                });
                group.addEventListener("mouseleave", () => {
                    root.classList.remove("hovering");
                    group.classList.remove("active");
                    ring.setAttribute("visibility", "hidden");
                    marker.setAttribute("visibility", "hidden");
                    handlers.hideTooltip();
                });
                group.addEventListener("mousemove", (event) => handlers.showTooltip(year, cell, before ? before.months[month] : null, before ? before.label : "", event as MouseEvent));
                group.addEventListener("click", (event) => {
                    event.preventDefault();
                    handlers.onSelect(cell, event as MouseEvent);
                });
                group.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handlers.onContextMenu(cell, event as MouseEvent);
                });
                root.appendChild(group);
            });
            if (options.showTotals) {
                const baseline = yOf(row) + cellHeight / 2 + size * 0.35;
                text(gridRight + totalWidth, baseline, format(year.total), { class: "yearTotal", "text-anchor": "end", "font-weight": 600, fill: INK });
                // The words after the figure say when the comparison covers only the months both years have.
                if (year.change !== null) text(width - 2, baseline, `${signedPercent(year.change)}${year.partial}`, { class: "yearChange", "text-anchor": "end" });
            }
        });
        root.appendChild(ring);

        // ---- legend
        if (legendY + 20 <= height) {
            text(left, legendY + 8, lowText, { class: "legendLabel", fill: INK_MUTED });
            root.appendChild(svg("rect", { class: "legendBar", x: legendX, y: legendY, width: legendWidth, height: 8, rx: 4, fill: `url(#${this.uid}_scale)` }));
            text(legendX + legendWidth + 8, legendY + 8, highText, { class: "legendLabel", fill: INK_MUTED });
            if (options.perYear) text(legendX + legendWidth + 16 + this.measure.width(highText, size), legendY + 8, "within each year", { fill: INK_MUTED });
            root.appendChild(marker);
        }
        this.setSelection(this.selected);
    }
}

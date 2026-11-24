"use strict";

import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, MOVEMENT, SURFACE } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, niceTicks, svg, TextMeasurer } from "./common/svg";

export interface DumbbellRow {
    /** Position in the data as it arrived, for selection. */
    index: number;
    name: string;
    start: number | null;
    end: number | null;
    /** end minus start; null unless both are present. */
    change: number | null;
    /** change as a percentage of the size of start; null when start is blank or zero. */
    percent: number | null;
}

export type SortMode = "change" | "percent" | "end" | "none";

/**
 * Picks the rows to draw and puts them in order. When there are more rows than fit, the ones
 * kept are those that matter most for the chosen order: the biggest movers (up or down) when
 * ordering by change, the largest when ordering by value.
 */
export function buildRows(raw: { name: string; start: number | null; end: number | null }[], sort: SortMode, maxRows: number): { rows: DumbbellRow[]; hidden: number } {
    const all: DumbbellRow[] = raw
        .map((r, index) => {
            const change = r.start !== null && r.end !== null ? r.end - r.start : null;
            return { index, name: r.name, start: r.start, end: r.end, change, percent: change !== null && r.start ? (change / Math.abs(r.start)) * 100 : null };
        })
        .filter((r) => r.start !== null || r.end !== null);
    const limit = Math.max(1, Math.round(maxRows));
    const weight = (r: DumbbellRow) => (sort === "end" || sort === "none" ? Math.abs(r.end ?? r.start ?? 0) : sort === "percent" ? Math.abs(r.percent ?? 0) : Math.abs(r.change ?? 0));
    const kept = all.length > limit && sort !== "none" ? [...all].sort((a, b) => weight(b) - weight(a) || a.index - b.index).slice(0, limit) : all.slice(0, limit);
    const key = (r: DumbbellRow) => (sort === "end" ? r.end : sort === "percent" ? r.percent : r.change);
    if (sort !== "none") {
        kept.sort((a, b) => {
            const x = key(a), y = key(b);
            if (x === null && y === null) return a.index - b.index;
            if (x === null) return 1;
            if (y === null) return -1;
            return y - x || a.index - b.index;
        });
    }
    return { rows: kept, hidden: all.length - kept.length };
}

export interface DumbbellOptions {
    width: number;
    height: number;
    startName: string;
    endName: string;
    /** True for measures where an increase is bad news, such as costs: swaps the colours. */
    higherIsWorse: boolean;
    /**
     * Draw the percentage change, with every row starting from the same line, in place of the
     * values themselves. For when the rows differ so much in size that their changes cannot be seen.
     */
    percentScale: boolean;
    showPercent: boolean;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface DumbbellHandlers {
    onSelect(row: DumbbellRow, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(row: DumbbellRow | null, event: MouseEvent): void;
    showTooltip(row: DumbbellRow, event: MouseEvent): void;
    hideTooltip(): void;
}

const UP = "▲", DOWN = "▼", MINUS = "−";

export class DumbbellView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "dumbbellChart" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every row that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("g.row").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(data: { rows: DumbbellRow[]; hidden: number }, options: DumbbellOptions, handlers: DumbbellHandlers): void {
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
        if (data.rows.length === 0) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const format = options.formatters[0], short = options.formatters[options.formatters.length - 1];
        const text = (parent: Element, x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            parent.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));
        const colourOf = (change: number) => (change === 0 ? MOVEMENT.same : change > 0 !== options.higherIsWorse ? MOVEMENT.up : MOVEMENT.down);
        const changeText = (row: DumbbellRow) => {
            if (row.change === null) return row.start === null ? "new" : "gone";
            // A change too small to show at this rounding is written as plain zero, with no arrow or sign.
            const size0 = format(Math.abs(row.change));
            const visible = size0 !== format(0);
            const amount = `${!visible ? "" : row.change > 0 ? "+" : MINUS}${size0}`;
            const percent = options.showPercent && row.percent !== null ? `  ${!visible ? "" : row.percent > 0 ? "+" : MINUS}${Math.abs(row.percent).toFixed(1)}%` : "";
            return `${!visible ? "" : row.change > 0 ? UP : DOWN} ${amount}${percent}`.trim();
        };

        // ---- key: a hollow dot is the earlier value, a filled one the later
        const keyY = size + 1;
        let keyX = 4;
        [{ name: options.startName || "From", filled: false }, { name: options.endName || "To", filled: true }].forEach((entry) => {
            root.appendChild(svg("circle", { cx: keyX + 5, cy: keyY - size * 0.32, r: 4, fill: entry.filled ? INK_SECONDARY : SURFACE, stroke: INK_SECONDARY, "stroke-width": 2 }));
            const label = this.measure.fit(entry.name, size, width * 0.4);
            text(root, keyX + 14, keyY, label, { class: "keyLabel" });
            keyX += 14 + this.measure.width(label, size) + 16;
        });
        if (data.hidden > 0) {
            const note = `${data.hidden} more not shown`;
            if (keyX + this.measure.width(note, size) < width - 4) text(root, width - 4, keyY, note, { class: "note", "text-anchor": "end", fill: INK_MUTED });
        }

        // ---- layout
        const rows = data.rows;
        const nameWidth = Math.min(Math.max(...rows.map((r) => this.measure.width(r.name, size))) + 12, width * 0.3);
        const changeWidth = Math.max(...rows.map((r) => this.measure.width(changeText(r), size))) + 12;
        const left = nameWidth, right = width - changeWidth;
        const top = size + 14, bottom = height - (size + 10);
        const rowHeight = Math.min(34, (bottom - top) / rows.length);
        if (right - left < 60 || rowHeight < size * 0.8) {
            message("Make the visual larger, or show fewer rows");
            return;
        }
        // On the percentage scale every row starts at nought and ends at its percentage change.
        const startOf = (r: DumbbellRow): number | null => (options.percentScale ? (r.percent === null ? null : 0) : r.start);
        const endOf = (r: DumbbellRow): number | null => (options.percentScale ? r.percent : r.end);
        const tickText = (tick: number) => (options.percentScale ? `${tick > 0 ? "+" : tick < 0 ? MINUS : ""}${Math.abs(tick)}%` : short(tick));
        const values = rows.flatMap((r) => [startOf(r), endOf(r)]).filter((v): v is number => v !== null);
        if (values.length === 0) {
            message("There are no changes to show as percentages");
            return;
        }
        let low = Math.min(...values), high = Math.max(...values);
        if (low === high) {
            low -= Math.abs(low) * 0.1 || 1;
            high += Math.abs(high) * 0.1 || 1;
        }
        const pad = (high - low) * 0.06;
        // Start at zero when the values sit close enough to it; otherwise fit them, so small changes can be seen.
        low = !options.percentScale && low >= 0 && low < (high - low) * 0.6 ? 0 : low - pad;
        high += pad;
        const ticks = niceTicks(low, high, 5);
        const xOf = (v: number) => left + 8 + ((v - low) / (high - low)) * (right - left - 16);
        const plotBottom = top + rowHeight * rows.length;

        ticks.forEach((tick) => {
            const x = xOf(tick);
            root.appendChild(svg("line", { x1: x, x2: x, y1: top, y2: plotBottom, stroke: tick === 0 ? AXIS : GRIDLINE, "stroke-width": 1 }));
            text(root, x, plotBottom + size + 3, tickText(tick), { "text-anchor": "middle", fill: INK_MUTED });
        });

        // ---- rows
        rows.forEach((row, i) => {
            const y = top + (i + 0.5) * rowHeight;
            const group = svg("g", { class: "row", "data-key": String(row.index) });
            group.appendChild(svg("rect", { class: "hit", x: 0, y: top + i * rowHeight, width, height: rowHeight, fill: "transparent" }));
            const shownName = this.measure.fit(row.name, size, nameWidth - 10);
            const name = text(group, left - 6, y + size * 0.35, shownName, { class: "rowName", "text-anchor": "end", fill: INK });
            if (shownName !== row.name) name.appendChild(svg("title", {}, row.name));

            const colour = row.change === null ? MOVEMENT.same : colourOf(row.change);
            const radius = Math.max(3, Math.min(5.5, rowHeight * 0.32));
            const from = startOf(row), to = endOf(row);
            if (from !== null && to !== null) {
                group.appendChild(svg("line", { class: "bar", x1: xOf(from), x2: xOf(to), y1: y, y2: y, stroke: colour, "stroke-width": Math.max(2, radius * 0.7), "stroke-linecap": "round" }));
            }
            if (from !== null) group.appendChild(svg("circle", { class: "startDot", cx: xOf(from), cy: y, r: radius, fill: SURFACE, stroke: colour, "stroke-width": 2 }));
            if (to !== null) group.appendChild(svg("circle", { class: "endDot", cx: xOf(to), cy: y, r: radius, fill: colour, stroke: SURFACE, "stroke-width": 1.5 }));
            // The arrow and the sign say which way it moved; the colour only repeats it.
            text(group, right + 6, y + size * 0.35, changeText(row), { class: "change", fill: INK_SECONDARY });

            group.addEventListener("mousemove", (event) => handlers.showTooltip(row, event as MouseEvent));
            group.addEventListener("mouseleave", () => handlers.hideTooltip());
            group.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(row, event as MouseEvent);
            });
            group.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(row, event as MouseEvent);
            });
            root.appendChild(group);
        });
        this.setSelection(this.selected);
    }
}

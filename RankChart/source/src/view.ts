"use strict";

import { RankData, RankLine } from "./model";
import { GRIDLINE, INK, INK_MUTED, INK_SECONDARY, inkOn, SURFACE } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, svg, TextMeasurer } from "./common/svg";

export interface RankOptions {
    width: number;
    height: number;
    /** The colour of each line, by the series' position in the data. */
    colourOf: (line: RankLine) => string;
    showValues: boolean;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface RankHandlers {
    onSelect(line: RankLine, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(line: RankLine | null, event: MouseEvent): void;
    showTooltip(line: RankLine, period: number, event: MouseEvent): void;
    hideTooltip(): void;
}

const UP = "▲", DOWN = "▼";

export class RankView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "rankChart" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every line that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("g.line").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(data: RankData | null, options: RankOptions, handlers: RankHandlers): void {
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
        const short = options.formatters[options.formatters.length - 1];
        const periodCount = data.periods.length;
        const last = periodCount - 1;

        // ---- labels at the two ends: names on the left for the first period, and on the right
        // names with the value and the places gained or lost. The left ones go when space is short.
        const endsHere = (line: RankLine, period: number) => {
            const rank = line.points[period].rank;
            return rank !== null && rank <= data.places;
        };
        const rightText = (line: RankLine) => {
            const value = line.points[last].value;
            return { name: line.name, value: options.showValues && value !== null ? short(value) : "", change: line.change === 0 ? "" : `${line.change > 0 ? UP : DOWN}${Math.abs(line.change)}` };
        };
        const rightLines = data.lines.filter((line) => endsHere(line, last));
        const leftLines = data.lines.filter((line) => endsHere(line, 0));
        const extrasWidth = Math.max(0, ...rightLines.map((line) => {
            const t = rightText(line);
            return (t.value ? this.measure.width(t.value, size) + 8 : 0) + (t.change ? this.measure.width(t.change, size) + 8 : 0);
        }));
        const widestName = Math.max(0, ...data.lines.map((line) => this.measure.width(line.name, size)));
        const showLeft = periodCount > 1 && width >= 520;
        const nameWidth = Math.min(widestName, width * (showLeft ? 0.22 : 0.32));
        const dotRoom = 14;
        const rightGutter = nameWidth + extrasWidth + dotRoom + 6;
        const leftGutter = showLeft ? nameWidth + dotRoom + 4 : dotRoom + 2;

        // ---- layout
        const top = size + 14, bottom = height - 6;
        const rows = data.places + (data.hasBelow ? 1 : 0);
        const rowHeight = (bottom - top) / rows;
        const plotLeft = leftGutter, plotRight = width - rightGutter;
        if (plotRight - plotLeft < 30 || rowHeight < 7) {
            message("Make the visual larger, or show fewer places");
            return;
        }
        const xOf = (period: number) => (periodCount === 1 ? (plotLeft + plotRight) / 2 : plotLeft + (period / last) * (plotRight - plotLeft));
        const belowY = top + (data.places + 0.5) * rowHeight;
        const yOf = (rank: number) => (rank <= data.places ? top + (rank - 0.5) * rowHeight : belowY);
        const radius = Math.max(3, Math.min(10, rowHeight * 0.42));
        const numbered = radius >= 7;

        // ---- period names, a faint guide for each period, and the "below" row
        data.periods.forEach((name, period) => {
            const x = xOf(period);
            root.appendChild(svg("line", { x1: x, x2: x, y1: top, y2: bottom, stroke: GRIDLINE, "stroke-width": 1 }));
            root.appendChild(svg("text", { class: "periodName", x, y: size + 2, "text-anchor": "middle", "font-size": size, "font-weight": 600, fill: INK_SECONDARY }, this.measure.fit(name, size, Math.max(30, (plotRight - plotLeft) / Math.max(1, last) - 6), 600)));
        });
        if (data.hasBelow) {
            root.appendChild(svg("line", { x1: plotLeft - dotRoom, x2: plotRight + dotRoom, y1: top + data.places * rowHeight, y2: top + data.places * rowHeight, stroke: GRIDLINE, "stroke-width": 1, "stroke-dasharray": "3 3" }));
            root.appendChild(svg("text", { class: "belowLabel", x: plotRight + dotRoom + 2, y: belowY + size * 0.35, "font-size": size, fill: INK_MUTED }, `${data.places + 1} and below`));
        }

        // ---- lines, each with its dots and end labels in one group so they dim and highlight together
        const groups: SVGElement[] = [];
        // Drawn from the bottom of the final ranking up, so the leaders sit on top where lines cross.
        const drawOrder = [...data.lines].sort((a, b) => (b.lastRank ?? 1e9) - (a.lastRank ?? 1e9));
        drawOrder.forEach((line) => {
            const colour = options.colourOf(line);
            const group = svg("g", { class: "line", "data-key": String(line.series) });
            const ranked = line.points.map((point, period) => ({ point, period })).filter(({ point }) => point.rank !== null);

            // A smooth step between periods: level out of one position and level into the next.
            let path = "";
            ranked.forEach(({ point, period }, i) => {
                const x = xOf(period), y = yOf(point.rank as number);
                if (i === 0 || ranked[i - 1].period !== period - 1) {
                    path += `M${x},${y}`;
                } else {
                    const previous = ranked[i - 1];
                    const x0 = xOf(previous.period), y0 = yOf(previous.point.rank as number);
                    path += `C${(x0 + x) / 2},${y0} ${(x0 + x) / 2},${y} ${x},${y}`;
                }
            });
            // A wide invisible stroke makes the line easy to point at.
            const hit = svg("path", { class: "hit", d: path, fill: "none", stroke: "transparent", "stroke-width": Math.max(12, radius * 2) });
            group.appendChild(hit);
            group.appendChild(svg("path", { class: "stroke", d: path, fill: "none", stroke: colour, "stroke-width": 2.5, "stroke-linecap": "round" }));

            ranked.forEach(({ point, period }) => {
                const rank = point.rank as number;
                const x = xOf(period), y = yOf(rank);
                const inside = rank <= data.places;
                const dot = svg("circle", { class: "dot", cx: x, cy: y, r: inside ? radius : Math.max(3, radius * 0.5), fill: colour, stroke: SURFACE, "stroke-width": 2 });
                dot.addEventListener("mousemove", (event) => handlers.showTooltip(line, period, event as MouseEvent));
                group.appendChild(dot);
                if (inside && numbered) {
                    group.appendChild(svg("text", { class: "rankNumber", x, y: y + radius * 0.36, "text-anchor": "middle", "font-size": Math.min(size, radius * 1.15), "font-weight": 600, fill: inkOn(colour) }, String(rank)));
                }
            });

            if (showLeft && endsHere(line, 0)) {
                const y = yOf(line.points[0].rank as number);
                group.appendChild(svg("text", { class: "endLabel", x: plotLeft - dotRoom, y: y + size * 0.35, "text-anchor": "end", "font-size": size, fill: INK_SECONDARY }, this.measure.fit(line.name, size, nameWidth)));
            }
            if (endsHere(line, last)) {
                const y = yOf(line.points[last].rank as number) + size * 0.35;
                const t = rightText(line);
                let x = plotRight + dotRoom;
                const name = this.measure.fit(t.name, size, nameWidth);
                group.appendChild(svg("text", { class: "endLabel name", x, y, "font-size": size, fill: INK }, name));
                x += this.measure.width(name, size) + 8;
                if (t.value) {
                    group.appendChild(svg("text", { class: "endLabel value", x, y, "font-size": size, fill: INK_MUTED }, t.value));
                    x += this.measure.width(t.value, size) + 8;
                }
                // The arrow says which way; the colour only repeats it.
                if (t.change) group.appendChild(svg("text", { class: "endLabel change", x, y, "font-size": size, "font-weight": 600, fill: INK_SECONDARY }, t.change));
            }

            group.addEventListener("mouseenter", () => {
                root.classList.add("hovering");
                group.classList.add("active");
                // Bring the hovered line to the front.
                root.appendChild(group);
            });
            group.addEventListener("mouseleave", () => {
                root.classList.remove("hovering");
                group.classList.remove("active");
                handlers.hideTooltip();
            });
            hit.addEventListener("mousemove", (event) => {
                // The nearest period to the pointer.
                const box = root.getBoundingClientRect();
                const x = (event as MouseEvent).clientX - box.left;
                const nearest = ranked.reduce((best, item) => (Math.abs(xOf(item.period) - x) < Math.abs(xOf(best.period) - x) ? item : best), ranked[0]);
                handlers.showTooltip(line, nearest.period, event as MouseEvent);
            });
            group.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(line, event as MouseEvent);
            });
            group.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(line, event as MouseEvent);
            });
            groups.push(group);
            root.appendChild(group);
        });
        this.setSelection(this.selected);
    }
}

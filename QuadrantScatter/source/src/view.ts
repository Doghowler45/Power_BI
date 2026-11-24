"use strict";

import { logTicks, Quadrant, quadrantOf, Scatter, ScatterPoint } from "./model";
import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, SURFACE, withOpacity } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, niceTicks, svg, TextMeasurer } from "./common/svg";

export interface AxisOptions {
    name: string;
    log: boolean;
    /** How the dividing line was placed, for its label: "median", "average" or "". */
    lineLabel: string;
    formatters: Formatter[];
}

export interface ScatterOptions {
    width: number;
    height: number;
    x: AxisOptions;
    y: AxisOptions;
    /** The name given to each quadrant; blank ones are not labelled. */
    quadrantNames: { [quadrant in Quadrant]: string };
    color: string;
    /** How many points to name: the largest when there is a Size measure, otherwise the furthest from the middle. */
    labelCount: number;
    fontSize: number;
    emptyMessage: string;
}

export interface ScatterHandlers {
    onSelect(point: ScatterPoint, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(point: ScatterPoint | null, event: MouseEvent): void;
    showTooltip(point: ScatterPoint, quadrant: Quadrant, event: MouseEvent): void;
    hideTooltip(): void;
}

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export class ScatterView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "quadrantScatter" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every point that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("circle.point").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(data: Scatter | null, options: ScatterOptions, handlers: ScatterHandlers): void {
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
        if (!data) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));

        // ---- scales: each axis covers its points and its dividing line, with a little room at the ends
        const scale = (values: number[], line: number, log: boolean) => {
            const all = log && line <= 0 ? values : [...values, line];
            let low = Math.min(...all), high = Math.max(...all);
            if (log) {
                low = low / 1.25;
                high = high * 1.25;
                const ticks = logTicks(low, high);
                return { low, high, ticks, position: (v: number) => (Math.log(v) - Math.log(low)) / (Math.log(high) - Math.log(low)) };
            }
            if (low === high) {
                low -= Math.abs(low) * 0.1 || 1;
                high += Math.abs(high) * 0.1 || 1;
            }
            const pad = (high - low) * 0.07;
            low -= pad;
            high += pad;
            return { low, high, ticks: niceTicks(low, high, 5), position: (v: number) => (v - low) / (high - low) };
        };
        const xs = scale(data.points.map((p) => p.x), data.xLine, options.x.log);
        const ys = scale(data.points.map((p) => p.y), data.yLine, options.y.log);
        const xFormat = options.x.formatters[options.x.formatters.length - 1], yFormat = options.y.formatters[options.y.formatters.length - 1];

        // ---- layout
        const left = Math.max(...ys.ticks.map((t) => this.measure.width(yFormat(t), size))) + 10;
        const top = size + 10, right = width - 10, bottom = height - (size * 2 + 14);
        if (right - left < 60 || bottom - top < 60) {
            message("Make the visual larger to see the chart");
            return;
        }
        const xOf = (v: number) => left + xs.position(v) * (right - left);
        const yOf = (v: number) => bottom - ys.position(v) * (bottom - top);

        // ---- gridlines, tick labels and axis names
        xs.ticks.forEach((tick) => {
            const x = xOf(tick);
            root.appendChild(svg("line", { x1: x, x2: x, y1: top, y2: bottom, stroke: GRIDLINE, "stroke-width": 1 }));
            text(x, bottom + size + 4, xFormat(tick), { "text-anchor": "middle", fill: INK_MUTED });
        });
        ys.ticks.forEach((tick) => {
            const y = yOf(tick);
            root.appendChild(svg("line", { x1: left, x2: right, y1: y, y2: y, stroke: GRIDLINE, "stroke-width": 1 }));
            text(left - 6, y + size * 0.35, yFormat(tick), { "text-anchor": "end", fill: INK_MUTED });
        });
        root.appendChild(svg("line", { x1: left, x2: right, y1: bottom, y2: bottom, stroke: AXIS, "stroke-width": 1 }));
        root.appendChild(svg("line", { x1: left, x2: left, y1: top, y2: bottom, stroke: AXIS, "stroke-width": 1 }));
        text(right, height - 4, `${options.x.name}${options.x.log ? " (log scale)" : ""} →`, { class: "axisName", "text-anchor": "end", "font-weight": 600 });
        text(2, size, `↑ ${options.y.name}${options.y.log ? " (log scale)" : ""}`, { class: "axisName", "font-weight": 600 });
        if (data.hidden > 0) text(right, size, `${data.hidden} not shown: a log scale has no place for zero or below`, { class: "note", "text-anchor": "end", fill: INK_MUTED });

        // Point sizes: area in proportion to the Size measure. Worked out first, because every label has to keep clear of the points.
        const sizes = data.points.map((p) => p.size).filter((v): v is number => v !== null && v > 0);
        const largest = sizes.length ? Math.max(...sizes) : 0;
        const radiusOf = (p: ScatterPoint) => (largest > 0 && p.size !== null && p.size > 0 ? 4 + 13 * Math.sqrt(p.size / largest) : largest > 0 ? 4 : 5.5);
        const pointBoxes: Box[] = data.points.map((p) => {
            const r = radiusOf(p);
            return { x: xOf(p.x) - r, y: yOf(p.y) - r, width: 2 * r, height: 2 * r };
        });
        const taken: Box[] = [];

        // ---- the two dividing lines, each saying where it sits, at whichever end of the line is clear of points
        const lineX = xOf(data.xLine), lineY = yOf(data.yLine);
        const xInside = lineX >= left && lineX <= right, yInside = lineY >= top && lineY <= bottom;
        // The labels themselves are placed last, once the names of the points have taken their places.
        const lineLabels: (() => void)[] = [];
        const dividerLabel = (content: string, places: { x: number; y: number; anchor: "start" | "end" }[]) => lineLabels.push(() => {
            const w = this.measure.width(content, size);
            const boxOf = (p: { x: number; y: number; anchor: "start" | "end" }): Box => ({ x: p.anchor === "start" ? p.x : p.x - w, y: p.y - size, width: w, height: size + 3 });
            const clear = (box: Box) => !pointBoxes.some((other) => overlaps(box, other)) && !taken.some((other) => overlaps(box, other));
            const place = places.find((p) => clear(boxOf(p))) || places[0];
            taken.push(boxOf(place));
            text(place.x, place.y, content, { class: "dividerLabel", "text-anchor": place.anchor, fill: INK_MUTED });
        });
        if (xInside) {
            root.appendChild(svg("line", { class: "divider", x1: lineX, x2: lineX, y1: top, y2: bottom, stroke: INK_SECONDARY, "stroke-width": 1, "stroke-dasharray": "4 3" }));
            dividerLabel(`${options.x.lineLabel} ${options.x.formatters[0](data.xLine)}`.trim(), [0, 1, 0.25, 0.75, 0.5].flatMap((along) => {
                // Along the line from its foot to its top, on either side of it.
                const y = bottom - 5 - along * (bottom - top - size - 8);
                return [{ x: lineX + 4, y, anchor: "start" as const }, { x: lineX - 4, y, anchor: "end" as const }];
            }));
        }
        if (yInside) {
            root.appendChild(svg("line", { class: "divider", x1: left, x2: right, y1: lineY, y2: lineY, stroke: INK_SECONDARY, "stroke-width": 1, "stroke-dasharray": "4 3" }));
            dividerLabel(`${options.y.lineLabel} ${options.y.formatters[0](data.yLine)}`.trim(), [1, 0, 0.75, 0.25, 0.5].flatMap((along) => {
                // Along the line from its right-hand end to its left, above or below it.
                const x = left + 4 + along * (right - left - 8);
                const anchor = along > 0.5 ? ("end" as const) : ("start" as const);
                return [{ x, y: lineY - 5, anchor }, { x, y: lineY + size + 3, anchor }];
            }));
        }

        // ---- quadrant names in the corners, with how many points each holds
        const corner = (quadrant: Quadrant, x: number, y: number, anchor: "start" | "end") => {
            const name = options.quadrantNames[quadrant].trim();
            if (!name) return;
            const label = `${name} · ${data.counts[quadrant]}`;
            const labelWidth = this.measure.width(label, size, 600);
            text(x, y, label, { class: "quadrantName", "text-anchor": anchor, "font-weight": 600, fill: INK });
            taken.push({ x: anchor === "start" ? x : x - labelWidth, y: y - size, width: labelWidth, height: size + 3 });
        };
        const midX = xInside ? lineX : left, midY = yInside ? lineY : bottom;
        corner("topLeft", left + 6, top + size + 2, "start");
        corner("topRight", right - 6, top + size + 2, "end");
        corner("bottomLeft", left + 6, Math.max(midY + size + 6, bottom - size - 12), "start");
        corner("bottomRight", Math.max(midX + 6, right - 6), Math.max(midY + size + 6, bottom - size - 12), "end");

        // ---- points: largest drawn first so small ones stay on top
        const drawOrder = [...data.points].sort((a, b) => radiusOf(b) - radiusOf(a));
        const fill = withOpacity(options.color, 0.78);
        const circles = new Map<number, SVGElement>();
        drawOrder.forEach((point) => {
            const quadrant = quadrantOf(point, data.xLine, data.yLine);
            const circle = svg("circle", { class: "point", "data-key": String(point.index), cx: xOf(point.x), cy: yOf(point.y), r: radiusOf(point), fill, stroke: SURFACE, "stroke-width": 1.5 });
            circle.addEventListener("mousemove", (event) => handlers.showTooltip(point, quadrant, event as MouseEvent));
            circle.addEventListener("mouseleave", () => handlers.hideTooltip());
            circle.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(point, event as MouseEvent);
            });
            circle.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(point, event as MouseEvent);
            });
            circles.set(point.index, circle);
            root.appendChild(circle);
        });

        // ---- names for the points that matter most, each placed where it does not sit on another
        // name or point; a name with nowhere to go is left out (the tooltip still has it).
        const centreX = (left + right) / 2, centreY = (top + bottom) / 2;
        const importance = (p: ScatterPoint) => (largest > 0 ? radiusOf(p) : Math.hypot((xOf(p.x) - centreX) / (right - left), (yOf(p.y) - centreY) / (bottom - top)));
        [...data.points].sort((a, b) => importance(b) - importance(a)).slice(0, Math.max(0, options.labelCount)).forEach((point) => {
            const r = radiusOf(point), cx = xOf(point.x), cy = yOf(point.y);
            const label = this.measure.fit(point.name, size, 150);
            const w = this.measure.width(label, size), h = size + 2;
            const own = pointBoxes[data.points.indexOf(point)];
            const places: { box: Box; anchor: string; x: number; y: number }[] = [
                { box: { x: cx + r + 4, y: cy - h / 2, width: w, height: h }, anchor: "start", x: cx + r + 4, y: cy + size * 0.35 },
                { box: { x: cx - r - 4 - w, y: cy - h / 2, width: w, height: h }, anchor: "end", x: cx - r - 4, y: cy + size * 0.35 },
                { box: { x: cx - w / 2, y: cy - r - 3 - h, width: w, height: h }, anchor: "middle", x: cx, y: cy - r - 5 },
                { box: { x: cx - w / 2, y: cy + r + 3, width: w, height: h }, anchor: "middle", x: cx, y: cy + r + size + 2 },
            ];
            const place = places.find(({ box }) => box.x >= left && box.x + box.width <= right && box.y >= top && box.y + box.height <= bottom
                && !taken.some((other) => overlaps(box, other)) && !pointBoxes.some((other) => other !== own && overlaps(box, other)));
            if (!place) return;
            taken.push(place.box);
            text(place.x, place.y, label, { class: "pointName", "text-anchor": place.anchor, fill: INK });
        });
        lineLabels.forEach((draw) => draw());
        this.setSelection(this.selected);
    }
}

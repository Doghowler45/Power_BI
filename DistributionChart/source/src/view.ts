"use strict";

import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, SURFACE, withOpacity } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, niceTicks, svg, TextMeasurer } from "./common/svg";

export interface DistributionPoint {
    /** Position in the data as it arrived, for selection. */
    index: number;
    name: string;
    value: number;
}

export interface DistributionGroup {
    name: string;
    points: DistributionPoint[];
    min: number;
    max: number;
    /** The middle value, and the values a quarter and three quarters of the way up. */
    median: number;
    q1: number;
    q3: number;
    /** The furthest points that are still within one and a half box-lengths of the box. Anything beyond is an outlier. */
    whiskerLow: number;
    whiskerHigh: number;
}

/** The value a given fraction of the way through sorted values, interpolating between neighbours. */
function quantile(sorted: number[], fraction: number): number {
    const position = (sorted.length - 1) * fraction;
    const below = Math.floor(position), above = Math.ceil(position);
    return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

export function buildGroups(rows: { group: string; name: string; value: number | null }[], byMedian: boolean): DistributionGroup[] {
    const byName = new Map<string, DistributionPoint[]>();
    rows.forEach((row, index) => {
        if (row.value === null) return;
        const list = byName.get(row.group) || [];
        list.push({ index, name: row.name, value: row.value });
        byName.set(row.group, list);
    });
    const groups: DistributionGroup[] = [...byName.entries()].map(([name, points]) => {
        const sorted = points.map((p) => p.value).sort((a, b) => a - b);
        const q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
        const reach = (q3 - q1) * 1.5;
        return {
            name, points, min: sorted[0], max: sorted[sorted.length - 1], median: quantile(sorted, 0.5), q1, q3,
            whiskerLow: sorted.find((v) => v >= q1 - reach) as number,
            whiskerHigh: [...sorted].reverse().find((v) => v <= q3 + reach) as number,
        };
    });
    if (byMedian) groups.sort((a, b) => b.median - a.median);
    return groups;
}

export interface DistributionOptions {
    width: number;
    height: number;
    /** Light to dark steps of one hue. */
    ramp: string[];
    showPoints: boolean;
    fontSize: number;
    valueName: string;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface DistributionHandlers {
    onSelect(key: string, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(key: string | null, event: MouseEvent): void;
    showPointTooltip(group: DistributionGroup, point: DistributionPoint, event: MouseEvent): void;
    showGroupTooltip(group: DistributionGroup, event: MouseEvent): void;
    hideTooltip(): void;
}

export const pointKey = (point: DistributionPoint): string => `p|${point.index}`;
export const groupKey = (group: DistributionGroup): string => `g|${group.name}`;

export class DistributionView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "distributionChart" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every point that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("circle.point").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(groups: DistributionGroup[], options: DistributionOptions, handlers: DistributionHandlers): void {
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
        if (groups.length === 0) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const format = options.formatters[0], short = options.formatters[options.formatters.length - 1];
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));

        // ---- layout: group names (and how many points) on the left, each group's median on the right
        const named = groups.some((group) => group.name !== "");
        const label = (group: DistributionGroup) => (named ? group.name : "All");
        const nameWidth = Math.min(Math.max(...groups.map((group) => this.measure.width(label(group), size, 600))), width * 0.26);
        const countWidth = Math.max(...groups.map((group) => this.measure.width(`n ${group.points.length}`, size)));
        const left = nameWidth + countWidth + 20;
        const medianWidth = Math.max(this.measure.width("Median", size, 600), ...groups.map((group) => this.measure.width(format(group.median), size, 600))) + 12;
        const right = width - medianWidth;
        const top = size + 12, bottom = height - (size + 12);
        const rowHeight = Math.min(64, (bottom - top) / groups.length);
        if (right - left < 60 || rowHeight < 12) {
            message("Make the visual larger to see the chart");
            return;
        }
        const low0 = Math.min(...groups.map((group) => group.min)), high0 = Math.max(...groups.map((group) => group.max));
        const span = high0 - low0 || Math.abs(high0) || 1;
        const low = low0 - span * 0.05, high = high0 + span * 0.05;
        const ticks = niceTicks(low, high, 5);
        const xOf = (v: number) => left + ((v - low) / (high - low)) * (right - left);
        const plotBottom = top + rowHeight * groups.length;

        ticks.forEach((tick) => {
            const x = xOf(tick);
            root.appendChild(svg("line", { x1: x, x2: x, y1: top, y2: plotBottom, stroke: tick === 0 ? AXIS : GRIDLINE, "stroke-width": 1 }));
            text(x, plotBottom + size + 3, short(tick), { "text-anchor": "middle", fill: INK_MUTED });
        });
        text(right, size, this.measure.fit(options.valueName, size, right - left, 600), { class: "axisName", "text-anchor": "end", "font-weight": 600 });
        text(width - 2, size, "Median", { "text-anchor": "end", "font-weight": 600 });

        const boxFill = withOpacity(options.ramp[2], 0.55), lineColour = options.ramp[5], pointFill = withOpacity(options.ramp[4], 0.7);
        const showPoints = options.showPoints && rowHeight >= 20;
        groups.forEach((group, row) => {
            const middle = top + (row + 0.5) * rowHeight;
            const boxHeight = Math.min(26, rowHeight * 0.5);
            const shownName = this.measure.fit(label(group), size, nameWidth, 600);
            text(nameWidth, middle + size * 0.35, shownName, { class: "groupName", "text-anchor": "end", "font-weight": 600, fill: INK });
            text(nameWidth + 8, middle + size * 0.35, `n ${group.points.length}`, { class: "groupCount", fill: INK_MUTED });
            text(width - 2, middle + size * 0.35, format(group.median), { class: "groupMedian", "text-anchor": "end", "font-weight": 600, fill: INK });

            // Whiskers, box and median. A group with one or two points has no meaningful box, so it gets only its points.
            const box = svg("g", { class: "box", "data-key": groupKey(group) });
            if (group.points.length >= 3) {
                box.appendChild(svg("line", { x1: xOf(group.whiskerLow), x2: xOf(group.whiskerHigh), y1: middle, y2: middle, stroke: lineColour, "stroke-width": 1.5 }));
                [group.whiskerLow, group.whiskerHigh].forEach((v) => box.appendChild(svg("line", { x1: xOf(v), x2: xOf(v), y1: middle - 5, y2: middle + 5, stroke: lineColour, "stroke-width": 1.5 })));
                box.appendChild(svg("rect", { class: "boxBody", x: xOf(group.q1), y: middle - boxHeight / 2, width: Math.max(1, xOf(group.q3) - xOf(group.q1)), height: boxHeight, rx: 3, fill: boxFill }));
            }
            box.appendChild(svg("line", { class: "median", x1: xOf(group.median), x2: xOf(group.median), y1: middle - boxHeight / 2 - 2, y2: middle + boxHeight / 2 + 2, stroke: lineColour, "stroke-width": 3, "stroke-linecap": "round" }));
            box.addEventListener("mousemove", (event) => handlers.showGroupTooltip(group, event as MouseEvent));
            box.addEventListener("mouseleave", () => handlers.hideTooltip());
            box.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(groupKey(group), event as MouseEvent);
            });
            root.appendChild(box);

            // Every point as a dot, spread up and down a little so that points with close values do not hide each other.
            if (showPoints) {
                group.points.forEach((point) => {
                    const spread = (((point.index * 2654435761) % 1000) / 1000 - 0.5) * Math.min(rowHeight * 0.55, 30);
                    const dot = svg("circle", { class: "point", "data-key": pointKey(point), cx: xOf(point.value), cy: middle + spread, r: 3.2, fill: pointFill, stroke: SURFACE, "stroke-width": 1 });
                    dot.addEventListener("mousemove", (event) => {
                        event.stopPropagation();
                        handlers.showPointTooltip(group, point, event as MouseEvent);
                    });
                    dot.addEventListener("mouseleave", () => handlers.hideTooltip());
                    dot.addEventListener("click", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handlers.onSelect(pointKey(point), event as MouseEvent);
                    });
                    dot.addEventListener("contextmenu", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handlers.onContextMenu(pointKey(point), event as MouseEvent);
                    });
                    root.appendChild(dot);
                });
            }
        });
        this.setSelection(this.selected);
    }
}

"use strict";

import { Mekko, MekkoColumn, MekkoSegment, segmentKey } from "./model";
import { INK, INK_MUTED, INK_SECONDARY, inkOn } from "./common/colours";
import { Formatter, share } from "./common/format";
import { clear, svg, TextMeasurer } from "./common/svg";

export interface MekkoOptions {
    width: number;
    height: number;
    /** A colour for each segment name. */
    colours: Map<string, string>;
    /** Space, in the surface colour, between columns and between segments. */
    gap: number;
    showLabels: boolean;
    /** What a segment's label says: its share of the column, or its value. */
    labelContent: "share" | "value";
    showLegend: boolean;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface MekkoHandlers {
    onSelect(segment: MekkoSegment, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(segment: MekkoSegment | null, event: MouseEvent): void;
    showTooltip(column: MekkoColumn, segment: MekkoSegment, event: MouseEvent): void;
    hideTooltip(): void;
}

export class MekkoView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "marimekko" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every segment that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("g.segment").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(data: Mekko | null, options: MekkoOptions, handlers: MekkoHandlers): void {
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
        const format = options.formatters[0], short = options.formatters[options.formatters.length - 1];
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));

        // ---- legend: a swatch and a name for each segment, in stacking order
        let top = 2;
        const legendItems: { name: string; swatch: SVGElement; label: SVGElement }[] = [];
        if (options.showLegend && data.series.length > 1) {
            let x = 2;
            const y = size + 2;
            const note = data.droppedNegatives ? "Values below zero are left out" : "";
            const noteWidth = note ? this.measure.width(note, size) + 16 : 0;
            for (let i = 0; i < data.series.length; i++) {
                const name = data.series[i];
                const label = this.measure.fit(name, size, 150);
                const itemWidth = 14 + this.measure.width(label, size) + 14;
                // Keep room to say how many names were left off.
                const more = `+${data.series.length - i} more`;
                const reserve = i < data.series.length - 1 ? this.measure.width(more, size) + 8 : 0;
                if (x + itemWidth + reserve > width - 2 - noteWidth) {
                    text(x, y, more, { class: "legendMore", fill: INK_MUTED });
                    break;
                }
                const swatch = root.appendChild(svg("rect", { class: "legendSwatch", x, y: y - size * 0.8, width: 10, height: 10, rx: 2, fill: options.colours.get(name) || "#B5B4AC" }));
                const node = text(x + 14, y, label, { class: "legendLabel" });
                legendItems.push({ name, swatch, label: node });
                x += itemWidth;
            }
            if (note) text(width - 2, y, note, { class: "note", "text-anchor": "end", fill: INK_MUTED });
            top = size + 12;
        }

        // ---- layout: totals above the columns, names below
        const plotTop = top + size + 6, plotBottom = height - (size + 8);
        const plotLeft = 2, plotRight = width - 2;
        const gap = Math.max(0, options.gap);
        const usable = plotRight - plotLeft - gap * (data.columns.length - 1);
        const plotHeight = plotBottom - plotTop;
        if (usable < 20 || plotHeight < 30) {
            message("Make the visual larger to see the chart");
            return;
        }

        const segmentNodes: { node: SVGElement; name: string }[] = [];
        let x = plotLeft;
        data.columns.forEach((column) => {
            const columnWidth = Math.max(1, usable * column.shareOfTotal);
            const centre = x + columnWidth / 2;

            // The column's total and its share of everything, shortened until it fits; then its name.
            const totals = [`${format(column.total)} · ${share(column.shareOfTotal)}`, short(column.total), share(column.shareOfTotal)];
            const totalLabel = totals.find((choice) => this.measure.width(choice, size) <= columnWidth - 2);
            if (totalLabel) text(centre, plotTop - 6, totalLabel, { class: "columnTotal", "text-anchor": "middle", fill: INK_MUTED });
            const name = this.measure.width(column.name, size, 600) <= columnWidth - 2 ? column.name : columnWidth >= 34 ? this.measure.fit(column.name, size, columnWidth - 2, 600) : "";
            if (name) {
                const label = text(centre, height - 4, name, { class: "columnName", "text-anchor": "middle", "font-weight": 600, fill: INK });
                if (name !== column.name) label.appendChild(svg("title", {}, column.name));
            }

            // Segments, stacked from the baseline up, with a gap in the surface colour between them.
            const inner = plotHeight - gap * (column.segments.length - 1);
            let y = plotBottom;
            column.segments.forEach((segment) => {
                const segmentHeight = Math.max(1, inner * segment.shareOfColumn);
                y -= segmentHeight;
                const fill = options.colours.get(segment.name) || "#B5B4AC";
                const group = svg("g", { class: "segment", "data-key": segmentKey(segment) });
                group.appendChild(svg("rect", { x, y, width: columnWidth, height: segmentHeight, rx: Math.min(3, columnWidth / 2, segmentHeight / 2), fill }));
                if (options.showLabels) {
                    const label = options.labelContent === "value" ? [format(segment.value), short(segment.value)] : [share(segment.shareOfColumn)];
                    const fits = label.find((choice) => this.measure.width(choice, size, 600) <= columnWidth - 8);
                    if (fits && segmentHeight >= size + 5) {
                        group.appendChild(svg("text", { class: "segmentLabel", x: centre, y: y + segmentHeight / 2 + size * 0.35, "text-anchor": "middle", "font-size": size, "font-weight": 600, fill: inkOn(fill) }, fits));
                    }
                }
                group.addEventListener("mouseenter", () => {
                    // The hovered segment's series stays strong in every column, so its share can be followed across.
                    root.classList.add("hovering");
                    segmentNodes.forEach((other) => other.node.classList.toggle("related", other.name === segment.name));
                    legendItems.forEach((item) => item.label.classList.toggle("active", item.name === segment.name));
                    group.classList.add("active");
                });
                group.addEventListener("mouseleave", () => {
                    root.classList.remove("hovering");
                    segmentNodes.forEach((other) => other.node.classList.remove("related"));
                    legendItems.forEach((item) => item.label.classList.remove("active"));
                    group.classList.remove("active");
                    handlers.hideTooltip();
                });
                group.addEventListener("mousemove", (event) => handlers.showTooltip(column, segment, event as MouseEvent));
                group.addEventListener("click", (event) => {
                    event.preventDefault();
                    handlers.onSelect(segment, event as MouseEvent);
                });
                group.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handlers.onContextMenu(segment, event as MouseEvent);
                });
                segmentNodes.push({ node: group, name: segment.name });
                root.appendChild(group);
                y -= gap;
            });
            x += columnWidth + gap;
        });
        this.setSelection(this.selected);
    }
}

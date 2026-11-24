"use strict";

import { columnTotals, extentFor, extentsOf, HeatData, orderByTotal, positionOf, rowTotals, ScaleOptions } from "./heatModel";
import { inkOn, Ramp } from "./palettes";

export interface HeatmapOptions {
    width: number;
    height: number;
    ramp: Ramp;
    scale: ScaleOptions;
    /** Space between cells, and how rounded their corners are. */
    gap: number;
    radius: number;
    /** Rows are never taller than this, so a grid with few rows does not turn into slabs. */
    maxCellHeight: number;
    /** Cells with no data: lightly hatched, or left blank. */
    hatchEmpty: boolean;
    showValues: boolean;
    valueFontSize: number;
    axisFontSize: number;
    axisColor: string;
    sortRows: boolean;
    sortColumns: boolean;
    showLegend: boolean;
    legendTop: boolean;
    /**
     * Ways to write a value, the preferred one first and shorter ones after it ("$58.2M", then
     * "$58M"). The legend uses the first; cells use the first that fits.
     */
    formatters: ((value: number) => string)[];
    emptyMessage: string;
}

export interface HeatmapHandlers {
    /** Row and column are positions in the data as it arrived, whatever order they are drawn in. */
    onSelect(row: number, column: number, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(row: number | null, column: number | null, event: MouseEvent): void;
    showTooltip(row: number, column: number, event: MouseEvent): void;
    hideTooltip(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif';
const ELLIPSIS = "…";
const LEGEND_HEIGHT = 30, LEGEND_BAR_HEIGHT = 8;
/** Value labels shrink to fit their cells, but not below this. */
const SMALLEST_VALUE_TEXT = 8;
/** Slanted column names are cut off beyond this length. */
const LONGEST_SLANTED_NAME = 110;

let instanceCounter = 0;

function svg(tag: string, attributes: { [name: string]: string | number } = {}, text?: string): SVGElement {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach((name) => node.setAttribute(name, String(attributes[name])));
    if (text !== undefined) node.textContent = text;
    return node;
}

export const cellKey = (row: number, column: number): string => `${row}|${column}`;

export class HeatmapView {
    private readonly uid: string;
    private readonly root: SVGSVGElement;
    private readonly measurer: CanvasRenderingContext2D | null;
    private selected: Set<string> = new Set();
    private firstRender = true;

    constructor(container: HTMLElement) {
        this.uid = "hm" + ++instanceCounter;
        this.root = svg("svg", { class: "heatmap" }) as SVGSVGElement;
        container.appendChild(this.root);
        this.measurer = document.createElement("canvas").getContext("2d");
    }

    /** Dims every cell that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("g.cell").forEach((cell) => cell.classList.toggle("selected", keys.has(cell.getAttribute("data-key") || "")));
    }

    private textWidth(text: string, size: number, weight = 400): number {
        if (!this.measurer) return text.length * size * 0.55;
        this.measurer.font = `${weight} ${size}px ${FONT}`;
        return this.measurer.measureText(text).width;
    }

    /** Shortens text to a width, ending it with an ellipsis. */
    private fit(text: string, size: number, maxWidth: number): string {
        if (this.textWidth(text, size) <= maxWidth) return text;
        let cut = text.length - 1;
        while (cut > 1 && this.textWidth(text.slice(0, cut) + ELLIPSIS, size) > maxWidth) cut--;
        return text.slice(0, Math.max(1, cut)) + ELLIPSIS;
    }

    /**
     * How to write the values inside the cells: the preferred form at the chosen size if it
     * fits, otherwise a shorter form, otherwise smaller text. Null when nothing readable fits.
     * It is one choice for the whole grid, so the cells do not look patchy.
     */
    private chooseValueLabels(data: HeatData, options: HeatmapOptions, cellWidth: number, cellHeight: number): { format: (value: number) => string; size: number } | null {
        if (!options.showValues || options.formatters.length === 0) return null;
        const present = data.values.flat().filter((v): v is number => v !== null);
        if (present.length === 0) return null;
        // The longest labels come from the extremes and from the value that is longest in the preferred form.
        const longest = present.reduce((a, b) => (options.formatters[0](b).length > options.formatters[0](a).length ? b : a));
        const samples = [Math.min(...present), Math.max(...present), longest];
        const fits = (format: (value: number) => string, size: number) =>
            size + 4 <= cellHeight && Math.max(...samples.map((v) => this.textWidth(format(v), size, 600))) <= cellWidth - 6;
        for (const format of options.formatters) if (fits(format, options.valueFontSize)) return { format, size: options.valueFontSize };
        const shortest = options.formatters[options.formatters.length - 1];
        for (let size = options.valueFontSize - 1; size >= SMALLEST_VALUE_TEXT; size--) if (fits(shortest, size)) return { format: shortest, size };
        return null;
    }

    public render(data: HeatData, options: HeatmapOptions, handlers: HeatmapHandlers): void {
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
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
            handlers.onContextMenu(null, null, event);
        };

        const message = (text: string) => root.appendChild(svg("text", { class: "message", x: width / 2, y: height / 2, "text-anchor": "middle", "font-size": 12 }, text));
        const rowCount = data.rows.length, columnCount = data.columns.length;
        if (rowCount === 0 || columnCount === 0 || data.values.every((row) => row.every((v) => v === null))) {
            message(options.emptyMessage);
            return;
        }
        const formatValue = options.formatters[0] || ((value: number) => String(value));

        // ---- order
        const rowOrder = options.sortRows ? orderByTotal(rowTotals(data)) : data.rows.map((_, i) => i);
        const columnOrder = options.sortColumns ? orderByTotal(columnTotals(data)) : data.columns.map((_, i) => i);

        // ---- layout: across first, because the column names depend on how wide the columns are
        const pad = 2;
        const axisSize = options.axisFontSize;
        const gap = Math.max(0, options.gap);
        const legendHeight = options.showLegend ? LEGEND_HEIGHT : 0;
        const hasRowLabels = data.rows.some((label) => label !== "");
        const widestRow = hasRowLabels ? Math.max(...data.rows.map((label) => this.textWidth(label, axisSize))) : 0;
        const rowLabelWidth = hasRowLabels ? Math.min(widestRow + 12, width * 0.32) : 0;
        const gridX = rowLabelWidth + pad;
        const gridWidth = width - gridX - pad;
        const cellWidth = (gridWidth - gap * (columnCount - 1)) / columnCount;
        const columnStep = cellWidth + gap;

        // Column names: flat when they fit, slanted when the columns are narrower than the names,
        // and thinned out to every few when the columns are too narrow even for that.
        const columnWidths = data.columns.map((label) => this.textWidth(label, axisSize));
        const typicalColumn = columnWidths.reduce((a, b) => a + b, 0) / columnCount;
        const widestColumn = Math.max(...columnWidths);
        const flat = typicalColumn + 8 <= columnStep;
        // Naming every few columns is enough when the names are short (day numbers, say).
        const everyFew = Math.max(1, Math.ceil((typicalColumn + 8) / columnStep));
        const fewIsEnough = widestColumn <= everyFew * columnStep - 4;
        // A slanted name may use up to about a third of the height; longer names are cut short.
        const slantedNameWidth = Math.min(widestColumn, LONGEST_SLANTED_NAME, (height * 0.35 - 12) / 0.71);
        const slanted = !flat && !fewIsEnough && columnStep >= axisSize + 3 && slantedNameWidth >= 36;
        const every = flat || slanted ? 1 : everyFew;
        const columnLabelHeight = slanted ? slantedNameWidth * 0.71 + 12 : axisSize + 10;

        const gridY = (options.legendTop ? legendHeight : 0) + columnLabelHeight;
        const gridHeight = height - gridY - (options.legendTop ? 0 : legendHeight) - pad;
        // Rows share the height, up to the tallest allowed, and never much taller than the cells are wide.
        const cellHeight = Math.min(options.maxCellHeight, (gridHeight - gap * (rowCount - 1)) / rowCount, Math.max(14, cellWidth * 1.5));
        if (cellWidth < 2 || cellHeight < 2) {
            message("Too many cells for this size: make the visual larger, or filter the data");
            return;
        }
        const radius = Math.min(options.radius, cellWidth / 2, cellHeight / 2);
        const xOf = (position: number) => gridX + position * columnStep;
        const yOf = (position: number) => gridY + position * (cellHeight + gap);

        // ---- "no data" hatching and the legend's gradient
        const defs = svg("defs");
        const hatch = svg("pattern", { id: `${this.uid}_none`, patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: "rotate(45)" });
        hatch.appendChild(svg("rect", { width: 6, height: 6, fill: "#FAFAF8" }));
        hatch.appendChild(svg("rect", { width: 1, height: 6, fill: "#E7E6E1" }));
        defs.appendChild(hatch);
        const gradient = svg("linearGradient", { id: `${this.uid}_scale`, x1: 0, x2: 1, y1: 0, y2: 0 });
        for (let i = 0; i <= 12; i++) gradient.appendChild(svg("stop", { offset: `${(i / 12) * 100}%`, "stop-color": options.ramp(i / 12) }));
        defs.appendChild(gradient);
        root.appendChild(defs);

        const extents = extentsOf(data, options.scale);
        const valueLabels = this.chooseValueLabels(data, options, cellWidth, cellHeight);

        // ---- axis labels
        const columnLabels: SVGElement[] = [];
        columnOrder.forEach((column, position) => {
            const name = data.columns[column];
            const centre = xOf(position) + cellWidth / 2;
            let label: SVGElement;
            let shown: string;
            if (slanted) {
                // Each name runs down to the top of its column, so none runs off the right-hand edge.
                shown = this.fit(name, axisSize, slantedNameWidth);
                const x = centre + axisSize * 0.3, y = gridY - 6;
                label = svg("text", { class: "axisLabel columnLabel", x, y, "text-anchor": "end", transform: `rotate(45 ${x} ${y})`, "font-size": axisSize, fill: options.axisColor }, shown);
            } else {
                shown = position % every === 0 ? this.fit(name, axisSize, every * columnStep - 2) : "";
                label = svg("text", { class: "axisLabel columnLabel", x: centre, y: gridY - 7, "text-anchor": "middle", "font-size": axisSize, fill: options.axisColor }, shown);
            }
            if (shown !== name && shown !== "") label.appendChild(svg("title", {}, name));
            columnLabels[column] = label;
            root.appendChild(label);
        });
        const rowLabels: SVGElement[] = [];
        if (hasRowLabels) {
            // Rows too short for their names: name every few.
            const rowEvery = Math.max(1, Math.ceil((axisSize + 2) / (cellHeight + gap)));
            rowOrder.forEach((row, position) => {
                const shown = position % rowEvery === 0 ? this.fit(data.rows[row], axisSize, rowLabelWidth - 10) : "";
                const label = svg("text", { class: "axisLabel rowLabel", x: gridX - 8, y: yOf(position) + cellHeight / 2 + axisSize * 0.35, "text-anchor": "end", "font-size": axisSize, fill: options.axisColor }, shown);
                if (shown !== data.rows[row] && shown !== "") label.appendChild(svg("title", {}, data.rows[row]));
                rowLabels[row] = label;
                root.appendChild(label);
            });
        }

        // ---- legend
        let legendMarker: SVGElement | null = null;
        let legendX = 0, legendWidth = 0, legendMarkerY = 0;
        if (options.showLegend) {
            const y = options.legendTop ? 6 : gridY + rowCount * (cellHeight + gap) - gap + 14;
            const overall = extents.all;
            const relative = options.scale.scope !== "all";
            const lowText = relative || !overall ? "Low" : formatValue(overall.low);
            const highText = relative || !overall ? "High" : formatValue(overall.high);
            const lowWidth = this.textWidth(lowText, axisSize) + 8;
            legendWidth = Math.max(60, Math.min(200, gridWidth - lowWidth - this.textWidth(highText, axisSize) - 8 - 120));
            legendX = gridX + lowWidth;
            const textY = y + LEGEND_BAR_HEIGHT / 2 + axisSize * 0.35;
            root.appendChild(svg("text", { class: "legendLabel", x: gridX, y: textY, "font-size": axisSize, fill: options.axisColor }, lowText));
            root.appendChild(svg("rect", { class: "legendBar", x: legendX, y, width: legendWidth, height: LEGEND_BAR_HEIGHT, rx: LEGEND_BAR_HEIGHT / 2, fill: `url(#${this.uid}_scale)` }));
            root.appendChild(svg("text", { class: "legendLabel", x: legendX + legendWidth + 8, y: textY, "font-size": axisSize, fill: options.axisColor }, highText));
            let noteX = legendX + legendWidth + 8 + this.textWidth(highText, axisSize) + 12;
            if (options.scale.twoSided) {
                // A notch marks the midpoint, where the two colours meet.
                root.appendChild(svg("rect", { class: "legendNotch", x: legendX + legendWidth / 2 - 0.75, y: y - 3, width: 1.5, height: LEGEND_BAR_HEIGHT + 6, fill: options.axisColor }));
                if (options.scale.midpoint !== 0 && !relative) {
                    const midText = `middle ${formatValue(options.scale.midpoint)}`;
                    root.appendChild(svg("text", { class: "legendNote", x: noteX, y: textY, "font-size": axisSize, fill: options.axisColor }, midText));
                    noteX += this.textWidth(midText, axisSize) + 12;
                }
            }
            if (relative) root.appendChild(svg("text", { class: "legendNote", x: noteX, y: textY, "font-size": axisSize, fill: options.axisColor }, options.scale.scope === "row" ? "within each row" : "within each column"));
            // Shows where the hovered cell sits on the scale.
            legendMarker = svg("path", { class: "legendMarker", d: "M-4.5,0 L4.5,0 L0,-6 Z", fill: options.axisColor, visibility: "hidden" });
            legendMarkerY = y + LEGEND_BAR_HEIGHT + 9;
            root.appendChild(legendMarker);
        }

        // ---- cells
        const grid = svg("g", { class: "grid" });
        root.appendChild(grid);
        const ring = svg("rect", { class: "ring", fill: "none", stroke: "#0B0B0B", "stroke-width": 2, rx: radius + 1, visibility: "hidden", "pointer-events": "none" });
        const cellsByRow: SVGElement[][] = data.rows.map(() => []);
        const cellsByColumn: SVGElement[][] = data.columns.map(() => []);
        const emptyFill = options.hatchEmpty ? `url(#${this.uid}_none)` : "transparent";

        rowOrder.forEach((row, rowPosition) => {
            columnOrder.forEach((column, columnPosition) => {
                const value = data.values[row][column] ?? null;
                const x = xOf(columnPosition), y = yOf(rowPosition);
                const cell = svg("g", { class: value === null ? "cell empty" : "cell", "data-key": cellKey(row, column) });
                const extent = value === null ? null : extentFor(extents, options.scale.scope, row, column);
                const position = value !== null && extent ? positionOf(value, extent, options.scale) : 0;
                const fill = value === null || !extent ? emptyFill : options.ramp(position);
                cell.appendChild(svg("rect", { x, y, width: cellWidth, height: cellHeight, rx: radius, fill }));
                if (valueLabels && value !== null) {
                    cell.appendChild(svg("text", { class: "value", x: x + cellWidth / 2, y: y + cellHeight / 2 + valueLabels.size * 0.35, "text-anchor": "middle", "font-size": valueLabels.size, fill: inkOn(fill) }, valueLabels.format(value)));
                }
                cellsByRow[row].push(cell);
                cellsByColumn[column].push(cell);

                cell.addEventListener("mouseenter", () => {
                    root.classList.add("hovering");
                    cell.classList.add("active");
                    cellsByRow[row].forEach((other) => other.classList.add("related"));
                    cellsByColumn[column].forEach((other) => other.classList.add("related"));
                    if (rowLabels[row]) rowLabels[row].classList.add("active");
                    if (columnLabels[column]) columnLabels[column].classList.add("active");
                    ring.setAttribute("x", String(x - 1.5));
                    ring.setAttribute("y", String(y - 1.5));
                    ring.setAttribute("width", String(cellWidth + 3));
                    ring.setAttribute("height", String(cellHeight + 3));
                    ring.setAttribute("visibility", "visible");
                    if (legendMarker && value !== null) {
                        legendMarker.setAttribute("transform", `translate(${legendX + position * legendWidth},${legendMarkerY})`);
                        legendMarker.setAttribute("visibility", "visible");
                    }
                });
                cell.addEventListener("mouseleave", () => {
                    root.classList.remove("hovering");
                    cell.classList.remove("active");
                    cellsByRow[row].forEach((other) => other.classList.remove("related"));
                    cellsByColumn[column].forEach((other) => other.classList.remove("related"));
                    if (rowLabels[row]) rowLabels[row].classList.remove("active");
                    if (columnLabels[column]) columnLabels[column].classList.remove("active");
                    ring.setAttribute("visibility", "hidden");
                    if (legendMarker) legendMarker.setAttribute("visibility", "hidden");
                    handlers.hideTooltip();
                });
                cell.addEventListener("mousemove", (event) => handlers.showTooltip(row, column, event as MouseEvent));
                cell.addEventListener("click", (event) => {
                    event.preventDefault();
                    if (value !== null) handlers.onSelect(row, column, event as MouseEvent);
                });
                cell.addEventListener("contextmenu", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handlers.onContextMenu(row, column, event as MouseEvent);
                });
                grid.appendChild(cell);
            });
        });
        root.appendChild(ring);

        // A short fade the first time the grid appears, not on every resize or filter.
        root.classList.toggle("intro", this.firstRender);
        this.firstRender = false;
        this.setSelection(this.selected);
    }
}

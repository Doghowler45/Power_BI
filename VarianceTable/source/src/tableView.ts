"use strict";

import { buildRows, formatPercent, Point, Row, Scenario, SCENARIO_CODE, SortDirection, totalRow } from "./varianceModel";

export interface TableOptions {
    /** The comparisons to show, in column order. */
    scenarios: Scenario[];
    /** Variance columns, variance % columns, and the small charts inside them. */
    showAbsolute: boolean;
    showRelative: boolean;
    showBars: boolean;
    showComments: boolean;
    /** True for measures where an increase is bad news, such as costs: swaps the variance colours. */
    higherIsWorse: boolean;
    showTotal: boolean;
    totalLabel: string;
    /** Column id to sort by, or "" for the order the data arrived in. */
    sortColumn: string;
    sortDirection: SortDirection;
    categoryTitle: string;
    /** Display names of the measures, shown when a heading is hovered. */
    names: { actual: string; pl: string; py: string; fc: string; comment: string };
    actualColor: string;
    previousYearColor: string;
    goodColor: string;
    badColor: string;
    textColor: string;
    headerColor: string;
    fontSize: number;
    rowPadding: number;
    showLines: boolean;
    lineColor: string;
    /** Short form for cells, for example "$74.7M". */
    formatValue: (value: number) => string;
    /** Full form, shown when a cell is hovered. */
    formatFull: (value: number) => string;
    emptyMessage: string;
}

export interface TableHandlers {
    onSelect(rowKey: string, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(rowKey: string | null, event: MouseEvent): void;
    /** A column heading was clicked. `column` is "" to go back to the order the data arrived in. */
    onSort(column: string, direction: SortDirection): void;
}

type ColumnKind = "category" | "value" | "base" | "delta" | "percent" | "comment";

interface Column {
    id: string;
    kind: ColumnKind;
    scenario?: Scenario;
    title: string;
    hint: string;
}

/** One row of the table: the value, and its comparison with each scenario shown. */
interface TableRow {
    key: string;
    category: string;
    isTotal: boolean;
    isForecast: boolean;
    value: number | null;
    comment: string | null;
    comparisons: { [scenario: string]: Row };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MINUS = "−";
const DELTA = "Δ";
const PERCENT_CAP = 300;
const BAR_WIDTH = 74;
const PIN_WIDTH = 46;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function svg(tag: string, attributes: { [name: string]: string | number }): SVGElement {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach((name) => node.setAttribute(name, String(attributes[name])));
    return node;
}

/** Maps a variance onto the width of an in-cell chart. Values beyond the range are held at the edge. */
function barScale(values: number[], width: number): (value: number) => number {
    let low = Math.min(0, ...values), high = Math.max(0, ...values);
    if (low === high) {
        low -= 1;
        high += 1;
    }
    const pad = 4;
    return (value) => pad + ((Math.max(low, Math.min(high, value)) - low) / (high - low)) * (width - 2 * pad);
}

export class VarianceTableView {
    private readonly root: HTMLDivElement;
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = el("div", "varianceTable");
        container.appendChild(this.root);
    }

    /** Dims every row that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr) => {
            const key = tr.getAttribute("data-key") || "";
            tr.classList.toggle("dimmed", keys.size > 0 && !keys.has(key));
        });
    }

    public render(points: Point[], options: TableOptions, handlers: TableHandlers, width: number, height: number): void {
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
        root.style.width = `${Math.max(1, width)}px`;
        root.style.height = `${Math.max(1, height)}px`;
        root.style.fontSize = `${options.fontSize}px`;
        root.style.color = options.textColor;
        root.style.setProperty("--line", options.showLines ? options.lineColor : "transparent");
        root.style.setProperty("--pad", `${options.rowPadding}px`);
        root.onclick = (event) => {
            if (!event.defaultPrevented) handlers.onClear();
        };
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        };

        const rows = this.buildRows(points, options);
        if (rows.length === 0) {
            root.appendChild(el("div", "message", options.emptyMessage));
            return;
        }
        const hasComments = options.showComments && rows.some((r) => r.comment);
        const columns = this.buildColumns(options, hasComments);
        const sorted = this.sort(rows, columns, options);
        const total = options.showTotal && rows.length > 1 ? this.totalOf(rows, options) : null;

        // One scale per in-cell chart, taken from the rows only: a total would otherwise flatten them.
        const scales: { [columnId: string]: (value: number) => number } = {};
        columns.forEach((column) => {
            if (!column.scenario) return;
            const scenario = column.scenario;
            if (column.kind === "delta") scales[column.id] = barScale(rows.map((r) => r.comparisons[scenario].delta ?? 0), BAR_WIDTH);
            if (column.kind === "percent") scales[column.id] = barScale(rows.map((r) => Math.max(-PERCENT_CAP, Math.min(PERCENT_CAP, r.comparisons[scenario].deltaPercent ?? 0))), PIN_WIDTH);
        });

        const table = el("table");
        const head = el("thead");
        const headRow = el("tr");
        columns.forEach((column) => headRow.appendChild(this.headerCell(column, options, handlers)));
        head.appendChild(headRow);
        table.appendChild(head);

        const body = el("tbody");
        sorted.forEach((row) => body.appendChild(this.bodyRow(row, columns, scales, options, handlers)));
        table.appendChild(body);

        if (total) {
            const foot = el("tfoot");
            foot.appendChild(this.bodyRow(total, columns, scales, options, handlers));
            table.appendChild(foot);
        }
        root.appendChild(table);
        this.setSelection(this.selected);
    }

    // ------------------------------------------------------------------ data

    private buildRows(points: Point[], options: TableOptions): TableRow[] {
        const plain = buildRows(points, null);
        const perScenario = options.scenarios.map((scenario) => buildRows(points, scenario));
        return plain
            .map((row, i) => {
                const comparisons: { [scenario: string]: Row } = {};
                options.scenarios.forEach((scenario, s) => (comparisons[scenario] = perScenario[s][i]));
                return { key: row.key, category: row.category, isTotal: false, isForecast: row.isForecast, value: row.value, comment: row.comment, comparisons };
            })
            .filter((row) => row.value !== null || options.scenarios.some((scenario) => row.comparisons[scenario].base !== null));
    }

    private totalOf(rows: TableRow[], options: TableOptions): TableRow {
        const comparisons: { [scenario: string]: Row } = {};
        options.scenarios.forEach((scenario) => (comparisons[scenario] = totalRow(rows.map((r) => r.comparisons[scenario]), options.totalLabel)));
        const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
        return {
            key: "__total__", category: options.totalLabel, isTotal: true, isForecast: false,
            value: values.length ? values.reduce((a, b) => a + b, 0) : null, comment: null, comparisons,
        };
    }

    private buildColumns(options: TableOptions, hasComments: boolean): Column[] {
        const columns: Column[] = [
            { id: "category", kind: "category", title: options.categoryTitle, hint: "" },
            { id: "value", kind: "value", title: "AC", hint: options.names.actual || "Actual" },
        ];
        options.scenarios.forEach((scenario) => {
            const code = SCENARIO_CODE[scenario];
            const name = (scenario === "pl" ? options.names.pl : scenario === "py" ? options.names.py : options.names.fc) || code;
            columns.push({ id: `base:${scenario}`, kind: "base", scenario, title: code, hint: name });
            if (options.showAbsolute) columns.push({ id: `delta:${scenario}`, kind: "delta", scenario, title: `${DELTA}${code}`, hint: `Actual minus ${name}` });
            if (options.showRelative) columns.push({ id: `percent:${scenario}`, kind: "percent", scenario, title: `${DELTA}${code}%`, hint: `Variance as a percentage of ${name}` });
        });
        if (hasComments) columns.push({ id: "comment", kind: "comment", title: options.names.comment || "Comment", hint: "" });
        return columns;
    }

    private cellNumber(row: TableRow, column: Column): number | null {
        if (column.kind === "value") return row.value;
        const comparison = column.scenario ? row.comparisons[column.scenario] : undefined;
        if (!comparison) return null;
        return column.kind === "base" ? comparison.base : column.kind === "delta" ? comparison.delta : column.kind === "percent" ? comparison.deltaPercent : null;
    }

    /** Sorts by the chosen column. Blanks go last, and equal values keep the order they arrived in. */
    private sort(rows: TableRow[], columns: Column[], options: TableOptions): TableRow[] {
        const column = columns.find((c) => c.id === options.sortColumn);
        if (!column) return rows;
        const sign = options.sortDirection === "asc" ? 1 : -1;
        const indexed = rows.map((row, index) => ({ row, index }));
        if (column.kind === "category" || column.kind === "comment") {
            const text = (r: TableRow) => (column.kind === "category" ? r.category : r.comment || "");
            indexed.sort((a, b) => text(a.row).localeCompare(text(b.row)) * sign || a.index - b.index);
        } else {
            indexed.sort((a, b) => {
                const x = this.cellNumber(a.row, column), y = this.cellNumber(b.row, column);
                if (x === null && y === null) return a.index - b.index;
                if (x === null) return 1;
                if (y === null) return -1;
                return x === y ? a.index - b.index : (x - y) * sign;
            });
        }
        return indexed.map((item) => item.row);
    }

    // ------------------------------------------------------------------ drawing

    /** A small square in the scenario's style: solid for actual, grey for previous year, outlined for plan, hatched for forecast. */
    private swatch(kind: "ac" | Scenario, options: TableOptions): HTMLSpanElement {
        const node = el("span", `swatch ${kind}`);
        if (kind === "ac") node.style.background = options.actualColor;
        else if (kind === "py") node.style.background = options.previousYearColor;
        else if (kind === "pl") node.style.border = `1.5px solid ${options.actualColor}`;
        else node.style.background = `repeating-linear-gradient(135deg, ${options.actualColor} 0 1.5px, #FFFFFF 1.5px 3.5px)`;
        return node;
    }

    private headerCell(column: Column, options: TableOptions, handlers: TableHandlers): HTMLTableCellElement {
        const th = el("th", column.kind);
        th.style.color = options.headerColor;
        const active = options.sortColumn === column.id;
        if (column.hint) th.title = `${column.hint}. Click to sort.`;
        else th.title = "Click to sort.";
        const inner = el("span", "heading");
        if (column.kind === "value") inner.appendChild(this.swatch("ac", options));
        if (column.kind === "base" && column.scenario) inner.appendChild(this.swatch(column.scenario, options));
        inner.appendChild(el("span", "title", column.title));
        if (active) inner.appendChild(el("span", "arrow", options.sortDirection === "desc" ? "▼" : "▲"));
        th.appendChild(inner);
        th.onclick = (event) => {
            event.preventDefault();
            // Text columns start A to Z; number columns start largest first.
            const first: SortDirection = column.kind === "category" || column.kind === "comment" ? "asc" : "desc";
            const second: SortDirection = first === "asc" ? "desc" : "asc";
            if (!active) handlers.onSort(column.id, first);
            else if (options.sortDirection === first) handlers.onSort(column.id, second);
            else handlers.onSort("", "desc");
        };
        return th;
    }

    private varianceColor(delta: number, options: TableOptions): string {
        const good = options.higherIsWorse ? delta <= 0 : delta >= 0;
        return good ? options.goodColor : options.badColor;
    }

    private signed(value: number, options: TableOptions): string {
        const text = options.formatValue(Math.abs(value));
        // Too small to show at this rounding: no sign, so it does not read as "−0.0".
        if (text === options.formatValue(0)) return text;
        return value > 0 ? `+${text}` : value < 0 ? `${MINUS}${text}` : text;
    }

    private bodyRow(row: TableRow, columns: Column[], scales: { [columnId: string]: (value: number) => number }, options: TableOptions, handlers: TableHandlers): HTMLTableRowElement {
        const tr = el("tr", row.isTotal ? "total" : "");
        if (!row.isTotal) {
            tr.setAttribute("data-key", row.key);
            tr.onclick = (event) => {
                event.preventDefault();
                handlers.onSelect(row.key, event);
            };
        }
        tr.oncontextmenu = (event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onContextMenu(row.isTotal ? null : row.key, event);
        };
        const barHeight = Math.max(10, Math.round(options.fontSize * 1.25));

        columns.forEach((column) => {
            const td = el("td", column.kind);
            const number = this.cellNumber(row, column);
            if (column.kind === "category") {
                td.textContent = row.category;
            } else if (column.kind === "comment") {
                td.textContent = row.comment || "";
            } else if (column.kind === "value" || column.kind === "base") {
                if (number !== null) {
                    td.title = options.formatFull(number);
                    if (column.kind === "value" && row.isForecast) {
                        td.appendChild(this.swatch("fc", options));
                        td.classList.add("forecast");
                        td.title += " (forecast)";
                    }
                    td.appendChild(el("span", "number", options.formatValue(number)));
                }
            } else if (number !== null) {
                // The variance decides the colour of both the variance and the variance % cells.
                const delta = column.scenario ? row.comparisons[column.scenario].delta ?? 0 : 0;
                const color = this.varianceColor(delta, options);
                const scale = scales[column.id];
                const wrap = el("span", "chartCell");
                if (options.showBars && scale) {
                    const widthPx = column.kind === "delta" ? BAR_WIDTH : PIN_WIDTH;
                    const chart = svg("svg", { width: widthPx, height: barHeight, class: "inCell" });
                    const zero = scale(0);
                    const shown = column.kind === "percent" ? Math.max(-PERCENT_CAP, Math.min(PERCENT_CAP, number)) : number;
                    const end = scale(shown);
                    if (column.kind === "delta") {
                        chart.appendChild(svg("rect", { x: Math.min(zero, end), y: 2, width: Math.max(1, Math.abs(end - zero)), height: barHeight - 4, fill: color }));
                    } else {
                        chart.appendChild(svg("line", { x1: zero, x2: end, y1: barHeight / 2, y2: barHeight / 2, stroke: color, "stroke-width": 2 }));
                        chart.appendChild(svg("rect", { x: end - 3, y: barHeight / 2 - 3, width: 6, height: 6, fill: options.textColor }));
                    }
                    // The axis stands for the comparison, so it takes that scenario's look.
                    const axis = svg("line", { x1: zero, x2: zero, y1: 0, y2: barHeight, stroke: column.scenario === "py" ? options.previousYearColor : options.actualColor, "stroke-width": column.scenario === "py" ? 2 : 1 });
                    if (column.scenario === "fc") axis.setAttribute("stroke-dasharray", "2 2");
                    chart.appendChild(axis);
                    wrap.appendChild(chart);
                }
                const text = column.kind === "delta" ? this.signed(number, options) : formatPercent(number);
                const label = el("span", "number", text);
                if (!options.showBars) label.style.color = color;
                wrap.appendChild(label);
                td.appendChild(wrap);
                td.title = column.kind === "delta" ? `${number > 0 ? "+" : number < 0 ? MINUS : ""}${options.formatFull(Math.abs(number))}` : text;
            }
            tr.appendChild(td);
        });
        return tr;
    }
}

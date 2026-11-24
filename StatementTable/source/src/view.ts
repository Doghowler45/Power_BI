"use strict";

import { Scenario, StatementRow } from "./model";
import { Formatter } from "./common/format";
import { SVG_NS } from "./common/svg";

export interface StatementOptions {
    width: number;
    height: number;
    /** The comparisons to show, in column order. */
    scenarios: Scenario[];
    showAbsolute: boolean;
    showRelative: boolean;
    showBars: boolean;
    /** Write negative numbers in brackets, as accounts do, in place of a minus sign. */
    brackets: boolean;
    lineTitle: string;
    /** Display names of the measures, shown when a heading is hovered. */
    names: { actual: string; pl: string; py: string };
    actualColor: string;
    previousYearColor: string;
    goodColor: string;
    badColor: string;
    textColor: string;
    fontSize: number;
    rowPadding: number;
    showLines: boolean;
    formatValue: Formatter;
    formatFull: Formatter;
    emptyMessage: string;
}

export interface StatementHandlers {
    onSelect(row: StatementRow, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(row: StatementRow | null, event: MouseEvent): void;
}

const MINUS = "−", DELTA = "Δ";
/**
 * Ways to draw the table, roomiest first. The first that fits the width is used: the in-cell
 * charts get narrower, then give way to coloured numbers, and last the line names wrap.
 */
const LAYOUTS: { bar: number; cellPad: number; wrap: boolean }[] = [
    { bar: 70, cellPad: 8, wrap: false },
    { bar: 44, cellPad: 6, wrap: false },
    { bar: 26, cellPad: 5, wrap: false },
    { bar: 0, cellPad: 5, wrap: false },
    { bar: 0, cellPad: 4, wrap: true },
];

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

export class StatementView {
    private readonly root: HTMLDivElement;
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = el("div", "statementTable");
        container.appendChild(this.root);
    }

    /** Dims every row that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.querySelectorAll<HTMLTableRowElement>("tbody tr[data-key]").forEach((tr) => tr.classList.toggle("dimmed", keys.size > 0 && !keys.has(tr.getAttribute("data-key") || "")));
    }

    public render(rows: StatementRow[], options: StatementOptions, handlers: StatementHandlers): void {
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
        root.style.width = `${Math.max(1, options.width)}px`;
        root.style.height = `${Math.max(1, options.height)}px`;
        root.style.fontSize = `${options.fontSize}px`;
        root.style.color = options.textColor;
        root.style.setProperty("--pad", `${options.rowPadding}px`);
        root.style.setProperty("--line", options.showLines ? "#E6E5E0" : "transparent");
        root.onclick = (event) => {
            if (!event.defaultPrevented) handlers.onClear();
        };
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        };
        if (rows.length === 0) {
            root.appendChild(el("div", "message", options.emptyMessage));
            return;
        }
        for (let i = 0; i < LAYOUTS.length; i++) {
            while (root.firstChild) root.removeChild(root.firstChild);
            const table = this.draw(rows, options, handlers, LAYOUTS[i]);
            if (table.scrollWidth <= root.clientWidth + 1) break;
        }
        this.setSelection(this.selected);
    }

    private draw(rows: StatementRow[], options: StatementOptions, handlers: StatementHandlers, layout: { bar: number; cellPad: number; wrap: boolean }): HTMLTableElement {
        const root = this.root;
        const BAR_WIDTH = layout.bar;
        const showBars = options.showBars && BAR_WIDTH > 0;
        root.style.setProperty("--cellpad", `${layout.cellPad}px`);
        root.classList.toggle("wrapNames", layout.wrap);

        const amount = (value: number): string => {
            const text = options.formatValue(Math.abs(value));
            if (value >= 0 || text === options.formatValue(0)) return text;
            return options.brackets ? `(${text})` : `${MINUS}${text}`;
        };
        const signed = (value: number): string => {
            const text = options.formatValue(Math.abs(value));
            if (text === options.formatValue(0)) return text;
            return `${value > 0 ? "+" : MINUS}${text}`;
        };
        const percentage = (value: number, decimals = 1): string => `${(value * 100).toFixed(decimals)}%`;
        const signedPercent = (value: number): string => `${value > 0 ? "+" : value < 0 ? MINUS : ""}${Math.abs(value).toFixed(1)}%`;
        const points = (value: number): string => `${value > 0 ? "+" : value < 0 ? MINUS : ""}${Math.abs(value * 100).toFixed(1)} pts`;

        // One scale for each variance column, from the ordinary lines: a ratio's points are a different kind of number.
        const scales: { [scenario: string]: (value: number) => number } = {};
        options.scenarios.forEach((scenario) => {
            const deltas = rows.filter((row) => row.kind !== "ratio").map((row) => row.comparisons[scenario].delta ?? 0);
            let low = Math.min(0, ...deltas), high = Math.max(0, ...deltas);
            if (low === high) {
                low -= 1;
                high += 1;
            }
            scales[scenario] = (value) => 4 + ((Math.max(low, Math.min(high, value)) - low) / (high - low)) * (BAR_WIDTH - 8);
        });

        const table = el("table");
        const head = el("thead");
        const headRow = el("tr");
        const heading = (className: string, title: string, hint: string, swatch?: string) => {
            const th = el("th", className);
            if (swatch) th.appendChild(this.swatch(swatch, options));
            th.appendChild(el("span", "title", title));
            if (hint) th.title = hint;
            headRow.appendChild(th);
        };
        heading("name", options.lineTitle, "");
        heading("number", "AC", options.names.actual || "Actual", "ac");
        options.scenarios.forEach((scenario) => {
            const code = scenario === "pl" ? "PL" : "PY";
            const name = (scenario === "pl" ? options.names.pl : options.names.py) || code;
            heading("number", code, name, scenario);
            if (options.showAbsolute) heading("delta", `${DELTA}${code}`, `Actual minus ${name}`);
            if (options.showRelative) heading("number", `${DELTA}${code}%`, `Variance as a percentage of ${name}`);
        });
        head.appendChild(headRow);
        table.appendChild(head);

        const body = el("tbody");
        const barHeight = Math.max(10, Math.round(options.fontSize * 1.2));
        rows.forEach((row) => {
            const tr = el("tr", row.kind);
            if (row.kind === "spacer") {
                const td = el("td");
                td.colSpan = headRow.children.length;
                tr.appendChild(td);
                body.appendChild(tr);
                return;
            }
            if (row.kind !== "heading") {
                tr.setAttribute("data-key", String(row.index));
                tr.onclick = (event) => {
                    event.preventDefault();
                    handlers.onSelect(row, event);
                };
            }
            tr.oncontextmenu = (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(row.kind === "heading" ? null : row, event);
            };
            const name = el("td", "name", row.name);
            name.style.paddingLeft = `${layout.cellPad + row.level * (layout.wrap ? 10 : 16)}px`;
            tr.appendChild(name);

            const isRatio = row.kind === "ratio";
            const number = (value: number | null) => {
                const td = el("td", "number");
                if (value !== null && row.kind !== "heading") {
                    td.textContent = isRatio ? percentage(value) : amount(value);
                    td.title = isRatio ? percentage(value, 2) : options.formatFull(value);
                }
                tr.appendChild(td);
            };
            number(row.actual);
            options.scenarios.forEach((scenario) => {
                const comparison = row.comparisons[scenario];
                number(comparison.base);
                const colour = comparison.good ? options.goodColor : options.badColor;
                if (options.showAbsolute) {
                    const td = el("td", "delta");
                    if (comparison.delta !== null && row.kind !== "heading") {
                        const wrap = el("span", "chartCell");
                        if (showBars && !isRatio) {
                            const scale = scales[scenario];
                            const zero = scale(0), end = scale(comparison.delta);
                            const chart = svg("svg", { width: BAR_WIDTH, height: barHeight, class: "inCell" });
                            chart.appendChild(svg("rect", { x: Math.min(zero, end), y: 2, width: Math.max(1, Math.abs(end - zero)), height: barHeight - 4, fill: colour }));
                            // The axis stands for the comparison, so it takes that scenario's look.
                            chart.appendChild(svg("line", { x1: zero, x2: zero, y1: 0, y2: barHeight, stroke: scenario === "py" ? options.previousYearColor : options.actualColor, "stroke-width": scenario === "py" ? 2 : 1 }));
                            wrap.appendChild(chart);
                        } else if (showBars) {
                            // Keeps a ratio's number in line with the others, which have a bar beside them.
                            wrap.appendChild(svg("svg", { width: BAR_WIDTH, height: barHeight, class: "inCell" }));
                        }
                        const label = el("span", "number", isRatio ? points(comparison.delta) : signed(comparison.delta));
                        if (!showBars || isRatio) label.style.color = colour;
                        wrap.appendChild(label);
                        td.appendChild(wrap);
                        td.title = isRatio ? points(comparison.delta) : `${comparison.delta > 0 ? "+" : comparison.delta < 0 ? MINUS : ""}${options.formatFull(Math.abs(comparison.delta))}`;
                    }
                    tr.appendChild(td);
                }
                if (options.showRelative) {
                    const td = el("td", "number percent");
                    if (comparison.percent !== null && row.kind !== "heading") {
                        td.textContent = signedPercent(comparison.percent);
                        td.style.color = colour;
                    }
                    tr.appendChild(td);
                }
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
        root.appendChild(table);
        return table;
    }

    /** A small square in the scenario's style: solid for actual, outlined for plan, grey for previous year. */
    private swatch(kind: string, options: StatementOptions): HTMLSpanElement {
        const node = el("span", `swatch ${kind}`);
        if (kind === "ac") node.style.background = options.actualColor;
        else if (kind === "py") node.style.background = options.previousYearColor;
        else node.style.border = `1.5px solid ${options.actualColor}`;
        return node;
    }
}

"use strict";

import { CardResult, Comparison, formatPercent, TrendPoint } from "./cardModel";

export interface CardFormat {
    /** Short form for the headline, for example "$74.7M". */
    short: (value: number) => string;
    /** Short form for a variance, in a unit that suits its own size: "$29.0M" beside a headline of "$1.30bn". */
    variance: (value: number) => string;
    /** Full form for tooltips. */
    full: (value: number) => string;
    /** True for measures that are themselves percentages: their variance is shown in points, with no variance %. */
    isPercent: boolean;
}

export interface CardsOptions {
    width: number;
    height: number;
    /** Cards per row, or 0 to fit as many as there is room for. */
    perRow: number;
    showSparkline: boolean;
    showBorder: boolean;
    background: string;
    actualColor: string;
    goodColor: string;
    badColor: string;
    textColor: string;
    valueSize: number;
    fontSize: number;
    emptyMessage: string;
}

export interface TooltipItem {
    displayName: string;
    value: string;
}

export interface CardsHandlers {
    showTooltip(items: TooltipItem[], event: MouseEvent): void;
    hideTooltip(): void;
    onContextMenu(event: MouseEvent): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const MINUS = "−";
const DELTA = "Δ";
const MIN_CARD_WIDTH = 180;
const GAP = 10;

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

export class VarianceCardsView {
    private readonly root: HTMLDivElement;

    constructor(container: HTMLElement) {
        this.root = el("div", "varianceCards");
        container.appendChild(this.root);
    }

    public render(cards: CardResult[], formats: CardFormat[], options: CardsOptions, handlers: CardsHandlers): void {
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
        root.style.width = `${Math.max(1, options.width)}px`;
        root.style.height = `${Math.max(1, options.height)}px`;
        root.style.color = options.textColor;
        root.style.fontSize = `${options.fontSize}px`;
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(event);
        };
        if (cards.length === 0) {
            root.classList.add("empty");
            root.appendChild(el("div", "message", options.emptyMessage));
            return;
        }
        root.classList.remove("empty");

        const fit = Math.max(1, Math.floor((options.width + GAP) / (MIN_CARD_WIDTH + GAP)));
        const perRow = Math.max(1, Math.min(cards.length, options.perRow > 0 ? Math.round(options.perRow) : fit));
        const rowCount = Math.ceil(cards.length / perRow);
        root.style.gridTemplateColumns = `repeat(${perRow}, minmax(0, 1fr))`;
        // Rows share the height, but never squash a card below what its text needs; the visual scrolls instead.
        const textHeight = options.fontSize * 1.5 + options.valueSize * 1.35 + options.fontSize * 1.6 * 2 + 22;
        const rowHeight = Math.max(textHeight, (options.height - GAP * (rowCount - 1)) / rowCount);
        root.style.gridAutoRows = `${rowHeight}px`;
        const sparkRoom = rowHeight - textHeight;

        cards.forEach((card, index) => {
            const format = formats[index];
            const node = el("div", "card");
            node.style.background = options.background;
            node.style.borderColor = options.showBorder ? "#D9D9D5" : "transparent";

            const top = el("div", "top");
            top.appendChild(el("span", "title", card.title));
            if (card.periodNote) top.appendChild(el("span", "note", card.periodNote));
            node.appendChild(top);

            const value = el("div", "value", card.value === null ? "–" : format.short(card.value));
            value.style.fontSize = `${options.valueSize}px`;
            if (card.value !== null) value.title = format.full(card.value);
            node.appendChild(value);

            const list = el("div", "comparisons");
            card.comparisons.forEach((comparison) => list.appendChild(this.comparisonRow(comparison, card, format, options)));
            node.appendChild(list);

            if (options.showSparkline && card.trend.length > 1 && sparkRoom >= 22) {
                node.appendChild(this.sparkline(card, format, options, handlers));
            }
            root.appendChild(node);
        });
    }

    private varianceColor(delta: number, card: CardResult, options: CardsOptions): string {
        const good = card.higherIsWorse ? delta <= 0 : delta >= 0;
        return good ? options.goodColor : options.badColor;
    }

    private signed(value: number, format: CardFormat, full: boolean): string {
        // A change in a percentage is given in points: 24.0% against 23.0% is +1.0 pts, not +1.0%.
        const text = format.isPercent ? `${(Math.abs(value) * 100).toFixed(1)} pts` : (full ? format.full : format.variance)(Math.abs(value));
        return value > 0 ? `+${text}` : value < 0 ? `${MINUS}${text}` : text;
    }

    /** One line: "ΔPL ▲ +$30.0M +2.1%", in green or red. */
    private comparisonRow(comparison: Comparison, card: CardResult, format: CardFormat, options: CardsOptions): HTMLDivElement {
        const row = el("div", "comparison");
        row.appendChild(el("span", "code", `${DELTA}${comparison.code}`));
        if (comparison.delta === null) {
            row.appendChild(el("span", "absolute", "–"));
            return row;
        }
        const color = this.varianceColor(comparison.delta, card, options);
        const arrow = el("span", "arrow", comparison.delta > 0 ? "▲" : comparison.delta < 0 ? "▼" : "●");
        arrow.style.color = color;
        row.appendChild(arrow);
        const absolute = el("span", "absolute", this.signed(comparison.delta, format, false));
        absolute.style.color = color;
        row.appendChild(absolute);
        if (comparison.percent !== null && !format.isPercent) {
            const percent = el("span", "percent", formatPercent(comparison.percent));
            percent.style.color = color;
            row.appendChild(percent);
        }
        if (comparison.base !== null) row.title = `${comparison.code === "PL" ? "Plan" : "Previous year"}: ${format.full(comparison.base)}; variance ${this.signed(comparison.delta, format, true)}`;
        return row;
    }

    /**
     * A small column chart of the periods. Each column is the actual, with the gap to the
     * comparison drawn in colour: green above the comparison, red for a shortfall. Periods
     * with no actual yet show the comparison in a light tint.
     */
    private sparkline(card: CardResult, format: CardFormat, options: CardsOptions, handlers: CardsHandlers): SVGElement {
        const width = 100, height = 40;
        const chart = svg("svg", { class: "spark", viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none" });
        const all = card.trend.flatMap((p) => [p.value, p.base]).filter((v): v is number => v !== null);
        const low = Math.min(0, ...all), high = Math.max(0, ...all);
        const y = (v: number) => (high === low ? height : height - ((v - low) / (high - low)) * height);
        const step = width / card.trend.length;
        const bar = step * 0.72;
        const firstCode = card.comparisons.length ? card.comparisons[0].code : "";

        card.trend.forEach((point: TrendPoint, i: number) => {
            const x = i * step + (step - bar) / 2;
            const group = svg("g", {});
            const rect = (from: number, to: number, fill: string) => {
                const a = y(from), b = y(to);
                group.appendChild(svg("rect", { x, y: Math.min(a, b), width: bar, height: Math.max(0.4, Math.abs(b - a)), fill }));
            };
            if (point.value === null) {
                if (point.base !== null) rect(0, point.base, "#DEDEDA");
            } else if (point.base === null) {
                rect(0, point.value, options.actualColor);
            } else {
                // The part both share, then the difference in colour.
                const sameSide = point.value >= 0 === point.base >= 0;
                const shared = sameSide ? (point.value >= 0 ? Math.min(point.value, point.base) : Math.max(point.value, point.base)) : 0;
                rect(0, shared, options.actualColor);
                if (point.value !== point.base) rect(shared, shared === point.value ? point.base : point.value, this.varianceColor(point.value - point.base, card, options));
            }
            // A full-height strip so the whole column responds to the pointer.
            const hit = svg("rect", { x: i * step, y: 0, width: step, height, fill: "transparent" });
            group.appendChild(hit);
            group.addEventListener("mousemove", (event) => {
                const items: TooltipItem[] = [{ displayName: card.title, value: point.label }];
                if (point.value !== null) items.push({ displayName: "Actual", value: format.full(point.value) });
                if (point.base !== null) items.push({ displayName: firstCode === "PY" ? "Previous year" : "Plan", value: format.full(point.base) });
                if (point.value !== null && point.base !== null) items.push({ displayName: `${DELTA}${firstCode}`, value: this.signed(point.value - point.base, format, true) });
                handlers.showTooltip(items, event as MouseEvent);
            });
            group.addEventListener("mouseleave", () => handlers.hideTooltip());
            chart.appendChild(group);
        });
        return chart;
    }
}

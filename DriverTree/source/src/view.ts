"use strict";

import { clear, svg, TextMeasurer } from "./common/svg";
import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, SURFACE } from "./common/colours";
import { Tree, TreeNode } from "./model";

/** What one card says. The visual writes the text; the view places it. */
export interface CardText {
    value: string;
    /** "+$3.6M", or null when there is nothing to compare with. */
    change: string | null;
    /** "+13.4%" */
    percent: string | null;
    /** The change as a share of the comparison (0.134), for the bar. */
    ratio: number | null;
    direction: -1 | 0 | 1;
    state: "good" | "bad" | "same";
}

export interface TreeOptions {
    width: number;
    height: number;
    /** A line above the tree saying what the changes are measured against; empty for none. */
    caption: string;
    hasComparison: boolean;
    showBars: boolean;
    fontSize: number;
    valueSize: number;
    goodColor: string;
    badColor: string;
    emptyMessage: string;
}

export interface TreeHandlers {
    onSelect(node: TreeNode, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(node: TreeNode | null, event: MouseEvent): void;
    showTooltip(node: TreeNode, event: MouseEvent): void;
    hideTooltip(): void;
}

const GLYPHS: { [sign: string]: string } = { "+": "+", "-": "−", "x": "×", "/": "÷" };
const MARGIN = 10, GAP = 38, CARD_PAD = 10, SCROLLBAR = 18;

export class DriverTreeView {
    private readonly root: HTMLDivElement;
    private readonly chart: SVGElement;
    private readonly measurer = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = document.createElement("div");
        this.root.className = "driverTree";
        this.chart = svg("svg", {});
        this.root.appendChild(this.chart);
        container.appendChild(this.root);
    }

    /** Dims every card that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.chart.classList.toggle("hasSelection", keys.size > 0);
        this.chart.querySelectorAll("g.card").forEach((card) => card.classList.toggle("selected", keys.has(card.getAttribute("data-key") || "")));
    }

    public render(tree: Tree, cards: Map<number, CardText>, options: TreeOptions, handlers: TreeHandlers): void {
        const chart = this.chart;
        clear(chart);
        const width = Math.max(1, options.width), height = Math.max(1, options.height);
        this.root.style.width = `${width}px`;
        this.root.style.height = `${height}px`;
        this.root.onclick = (event) => {
            if (!event.defaultPrevented) handlers.onClear();
        };
        this.root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(null, event);
        };
        const size = options.fontSize, valueSize = options.valueSize;
        if (tree.nodes.length === 0) {
            chart.setAttribute("width", String(width));
            chart.setAttribute("height", String(height));
            chart.appendChild(svg("text", { x: width / 2, y: height / 2, "text-anchor": "middle", "dominant-baseline": "middle", fill: INK_MUTED, "font-size": 12 }, this.measurer.fit(options.emptyMessage, 12, width - 16)));
            return;
        }

        // Sizes: cards share the width between the levels, and the leaves share the height.
        const line = Math.round(size * 1.3);
        const showChange = options.hasComparison;
        const showBars = showChange && options.showBars;
        const top = options.caption ? MARGIN + line + 4 : MARGIN;
        const cardWidth = Math.max(104, Math.min(210, Math.floor((width - 2 * MARGIN - (tree.levels - 1) * GAP) / tree.levels)));
        const nameBase = 7 + size;
        const valueBase = nameBase + Math.round(valueSize * 1.15) + 2;
        const changeBase = valueBase + line + 1;
        const barTop = changeBase + 6;
        const cardHeight = (showBars ? barTop + 4 : showChange ? changeBase : valueBase) + 8;
        const pitch = Math.max(cardHeight + 10, Math.min(cardHeight * 2 + 10, (height - top - MARGIN) / tree.leaves));
        const treeWidth = 2 * MARGIN + tree.levels * cardWidth + (tree.levels - 1) * GAP;
        const treeHeight = top + tree.leaves * pitch + MARGIN;
        const scrollX = treeWidth > width, scrollY = treeHeight > height;
        const drawWidth = scrollX ? treeWidth : width - (scrollY ? SCROLLBAR : 0);
        const drawHeight = scrollY ? treeHeight : height - (scrollX ? SCROLLBAR : 0);
        chart.setAttribute("width", String(drawWidth));
        chart.setAttribute("height", String(drawHeight));
        const offsetX = Math.max(0, (drawWidth - treeWidth) / 2), offsetY = Math.max(0, (drawHeight - treeHeight) / 2);
        const left = (node: TreeNode) => Math.round(offsetX + MARGIN + node.depth * (cardWidth + GAP));
        const middle = (node: TreeNode) => Math.round(offsetY + top + (node.row + 0.5) * pitch);

        if (options.caption) {
            chart.appendChild(svg("text", { x: Math.round(offsetX + MARGIN), y: Math.round(offsetY + MARGIN + size), fill: INK_MUTED, "font-size": size }, this.measurer.fit(options.caption, size, drawWidth - 2 * MARGIN)));
        }

        // Connectors first, so cards sit on top of them.
        const links = svg("g", { class: "links", fill: "none", stroke: AXIS, "stroke-width": 1.5 });
        chart.appendChild(links);
        tree.nodes.forEach((node) => {
            if (node.children.length === 0) return;
            const fromX = left(node) + cardWidth, fromY = middle(node), trunk = fromX + 12;
            node.children.forEach((child) => {
                const toX = left(child), toY = middle(child);
                links.appendChild(svg("path", { d: `M${fromX},${fromY}H${trunk}V${toY}H${toX}` }));
            });
        });
        tree.nodes.forEach((node) => {
            const glyph = GLYPHS[node.sign];
            if (!glyph || node.depth === 0) return;
            const x = left(node) - 13, y = middle(node);
            chart.appendChild(svg("circle", { class: "operator", cx: x, cy: y, r: 8, fill: SURFACE, stroke: AXIS, "stroke-width": 1.5 }));
            chart.appendChild(svg("text", { class: "operator", x, y: y + 0.5, "text-anchor": "middle", "dominant-baseline": "central", fill: INK_SECONDARY, "font-size": 12, "font-weight": 600 }, glyph));
        });

        const ratios = tree.nodes.map((node) => Math.abs((cards.get(node.index) || { ratio: null }).ratio || 0));
        const largest = Math.max(...ratios, 0);
        const inner = cardWidth - 2 * CARD_PAD;
        tree.nodes.forEach((node) => {
            const text = cards.get(node.index);
            if (!text) return;
            const group = svg("g", { class: "card", "data-key": node.index, transform: `translate(${left(node)},${middle(node) - Math.round(cardHeight / 2)})` });
            group.appendChild(svg("rect", { class: "frame", x: 0.5, y: 0.5, width: cardWidth - 1, height: cardHeight - 1, rx: 6, fill: SURFACE, stroke: GRIDLINE }));
            const name = svg("text", { x: CARD_PAD, y: nameBase, fill: INK_SECONDARY, "font-size": size }, this.measurer.fit(node.name, size, inner));
            group.appendChild(name);
            let shown = valueSize;
            while (shown > 9 && this.measurer.width(text.value, shown, 600) > inner) shown--;
            group.appendChild(svg("text", { class: "value", x: CARD_PAD, y: valueBase, fill: INK, "font-size": shown, "font-weight": 600 }, text.value));

            const colour = text.state === "good" ? options.goodColor : text.state === "bad" ? options.badColor : INK_MUTED;
            if (showChange && text.change !== null) {
                // The arrow carries the colour; the words stay in ink.
                const arrow = text.direction > 0 ? "▲" : text.direction < 0 ? "▼" : "";
                const indent = arrow ? Math.round(size * 1.05) : 0;
                if (arrow) group.appendChild(svg("text", { class: "arrow", x: CARD_PAD, y: changeBase - 1, fill: colour, "font-size": Math.round(size * 0.8) }, arrow));
                const both = text.percent ? `${text.change}  ${text.percent}` : text.change;
                const words = this.measurer.width(both, size) <= inner - indent ? both : text.percent || text.change;
                group.appendChild(svg("text", { class: "change", x: CARD_PAD + indent, y: changeBase, fill: INK_SECONDARY, "font-size": size }, this.measurer.fit(words, size, inner - indent)));
            } else if (showChange) {
                group.appendChild(svg("text", { class: "change", x: CARD_PAD, y: changeBase, fill: INK_MUTED, "font-size": size }, "–"));
            }
            if (showBars) {
                // Every card's bar is on the same scale, so the driver that moved most stands out.
                const centre = CARD_PAD + inner / 2;
                group.appendChild(svg("line", { x1: CARD_PAD, x2: CARD_PAD + inner, y1: barTop + 2, y2: barTop + 2, stroke: GRIDLINE }));
                if (text.ratio !== null && largest > 0 && text.ratio !== 0) {
                    const length = Math.max(2, (Math.abs(text.ratio) / largest) * (inner / 2));
                    group.appendChild(svg("rect", { class: "bar", x: text.ratio > 0 ? centre : centre - length, y: barTop, width: length, height: 4, fill: colour }));
                }
                group.appendChild(svg("line", { x1: centre, x2: centre, y1: barTop - 2, y2: barTop + 6, stroke: INK_MUTED }));
            }

            group.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(node, event);
            });
            group.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(node, event);
            });
            group.addEventListener("mousemove", (event) => handlers.showTooltip(node, event));
            group.addEventListener("mouseleave", () => handlers.hideTooltip());
            chart.appendChild(group);
        });
        this.setSelection(this.selected);
    }
}

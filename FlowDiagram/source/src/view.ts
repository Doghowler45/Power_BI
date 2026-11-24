"use strict";

import { Flow, FlowLink, FlowNode, layoutFlow, linkKey, nodeKey } from "./model";
import { INK, INK_MUTED, INK_SECONDARY, OTHER_COLOUR, SURFACE } from "./common/colours";
import { Formatter } from "./common/format";
import { clear, svg, TextMeasurer } from "./common/svg";

export interface FlowOptions {
    width: number;
    height: number;
    /** A colour for each name in the stage the ribbons are coloured by. */
    colours: Map<string, string>;
    /** Which stage that is: its nodes take the colours, the others are neutral. */
    colourStage: number;
    nodeWidth: number;
    nodeGap: number;
    showValues: boolean;
    fontSize: number;
    formatters: Formatter[];
    emptyMessage: string;
}

export interface FlowHandlers {
    onSelect(key: string, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(key: string | null, event: MouseEvent): void;
    showNodeTooltip(node: FlowNode, event: MouseEvent): void;
    showLinkTooltip(link: FlowLink, event: MouseEvent): void;
    hideTooltip(): void;
}

const NEUTRAL_NODE = "#52514E";

export class FlowView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "flowDiagram" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every node and ribbon that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("[data-key]").forEach((node) => node.classList.toggle("selected", keys.has(node.getAttribute("data-key") || "")));
    }

    public render(flow: Flow | null, options: FlowOptions, handlers: FlowHandlers): void {
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
        if (!flow) {
            message(options.emptyMessage);
            return;
        }
        const size = options.fontSize;
        const short = options.formatters[options.formatters.length - 1];
        const stageCount = flow.stages.length, lastStage = stageCount - 1;
        const labelOf = (node: FlowNode) => ({ name: node.name, value: options.showValues ? short(node.value) : "" });
        const labelWidth = (node: FlowNode, maxName: number) => {
            const label = labelOf(node);
            return Math.min(this.measure.width(label.name, size, 600), maxName) + (label.value ? this.measure.width(label.value, size) + 6 : 0);
        };

        // ---- layout: the first stage's names sit in a gutter on the left and the last stage's on the right
        const maxName = Math.max(60, width * 0.2);
        const leftGutter = Math.max(...flow.stages[0].map((node) => labelWidth(node, maxName))) + 8;
        const rightGutter = Math.max(...flow.stages[lastStage].map((node) => labelWidth(node, maxName))) + 8;
        const top = size + 12, bottom = height - 4;
        const plotLeft = leftGutter, plotWidth = width - leftGutter - rightGutter;
        if (plotWidth < options.nodeWidth * stageCount + 40 || bottom - top < 40) {
            message("Make the visual larger to see the flows");
            return;
        }
        layoutFlow(flow, plotLeft, top, plotWidth, bottom - top, options.nodeWidth, options.nodeGap);

        // ---- stage names across the top
        flow.stages.forEach((stage, index) => {
            const x = stage[0].x + (index === 0 ? 0 : index === lastStage ? options.nodeWidth : options.nodeWidth / 2);
            root.appendChild(svg("text", { class: "stageName", x, y: size, "text-anchor": index === 0 ? "start" : index === lastStage ? "end" : "middle", "font-size": size, "font-weight": 600, fill: INK_SECONDARY }, flow.stageNames[index]));
        });
        if (flow.dropped > 0) {
            root.appendChild(svg("title", {}, `${flow.dropped} rows with a blank, zero or negative value are not shown`));
        }

        // ---- ribbons, drawn under the nodes
        const ribbons: { node: SVGElement; link: FlowLink }[] = [];
        const nodes: { node: SVGElement; item: FlowNode }[] = [];
        const lit = (test: (link: FlowLink) => boolean, nodeTest: (item: FlowNode) => boolean) => {
            root.classList.add("hovering");
            ribbons.forEach((r) => r.node.classList.toggle("related", test(r.link)));
            nodes.forEach((n) => n.node.classList.toggle("related", nodeTest(n.item)));
        };
        const unlit = () => {
            root.classList.remove("hovering");
            ribbons.forEach((r) => r.node.classList.remove("related"));
            nodes.forEach((n) => n.node.classList.remove("related"));
            handlers.hideTooltip();
        };
        // Widest first, so thin ribbons are not buried.
        [...flow.links].sort((a, b) => b.thickness - a.thickness).forEach((link) => {
            const x0 = link.source.x + options.nodeWidth, x1 = link.target.x, mid = (x0 + x1) / 2;
            const s0 = link.sourceY, s1 = link.sourceY + link.thickness, t0 = link.targetY, t1 = link.targetY + link.thickness;
            const d = `M${x0},${s0} C${mid},${s0} ${mid},${t0} ${x1},${t0} L${x1},${t1} C${mid},${t1} ${mid},${s1} ${x0},${s1} Z`;
            const ribbon = svg("path", { class: "ribbon", "data-key": linkKey(link), d, fill: options.colours.get(link.colourBy) || OTHER_COLOUR });
            ribbon.addEventListener("mouseenter", () => lit((other) => other === link, (item) => item === link.source || item === link.target));
            ribbon.addEventListener("mouseleave", unlit);
            ribbon.addEventListener("mousemove", (event) => handlers.showLinkTooltip(link, event as MouseEvent));
            ribbon.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(linkKey(link), event as MouseEvent);
            });
            ribbon.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(linkKey(link), event as MouseEvent);
            });
            ribbons.push({ node: ribbon, link });
            root.appendChild(ribbon);
        });

        // ---- nodes and their names
        flow.stages.forEach((stage, stageIndex) => stage.forEach((item) => {
            const group = svg("g", { class: "node", "data-key": nodeKey(item) });
            const fill = stageIndex === options.colourStage ? options.colours.get(item.name) || OTHER_COLOUR : NEUTRAL_NODE;
            group.appendChild(svg("rect", { x: item.x, y: item.y, width: options.nodeWidth, height: item.height, rx: Math.min(2, item.height / 2), fill }));

            // Named when the node is tall enough to carry a line of text beside it.
            if (item.height >= size * 0.8) {
                const label = labelOf(item);
                const y = item.y + item.height / 2 + size * 0.35;
                const outside = stageIndex === 0 || stageIndex === lastStage;
                // Names of the stages in between sit on the ribbons, so they get a halo in the surface colour to stay readable.
                const halo = outside ? {} : { stroke: SURFACE, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" };
                const name = this.measure.fit(label.name, size, maxName, 600);
                if (stageIndex === 0) {
                    let x = item.x - 6;
                    if (label.value) {
                        group.appendChild(svg("text", { class: "nodeValue", x, y, "text-anchor": "end", "font-size": size, fill: INK_MUTED }, label.value));
                        x -= this.measure.width(label.value, size) + 6;
                    }
                    group.appendChild(svg("text", { class: "nodeName", x, y, "text-anchor": "end", "font-size": size, "font-weight": 600, fill: INK }, name));
                } else {
                    let x = item.x + options.nodeWidth + 6;
                    group.appendChild(svg("text", { class: "nodeName", x, y, "font-size": size, "font-weight": 600, fill: INK, ...halo }, name));
                    x += this.measure.width(name, size, 600) + 6;
                    if (label.value) group.appendChild(svg("text", { class: "nodeValue", x, y, "font-size": size, fill: outside ? INK_MUTED : INK_SECONDARY, ...halo }, label.value));
                }
            }
            group.addEventListener("mouseenter", () => lit((link) => link.source === item || link.target === item, (other) => other === item));
            group.addEventListener("mouseleave", unlit);
            group.addEventListener("mousemove", (event) => handlers.showNodeTooltip(item, event as MouseEvent));
            group.addEventListener("click", (event) => {
                event.preventDefault();
                handlers.onSelect(nodeKey(item), event as MouseEvent);
            });
            group.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onContextMenu(nodeKey(item), event as MouseEvent);
            });
            nodes.push({ node: group, item });
            root.appendChild(group);
        }));
        this.setSelection(this.selected);
    }
}

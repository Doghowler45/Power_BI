"use strict";

import { Band, Concentration, itemAt, RankedItem } from "./model";
import { AXIS, GRIDLINE, INK, INK_MUTED, INK_SECONDARY, SURFACE } from "./common/colours";
import { Formatter, share } from "./common/format";
import { clear, niceTicks, svg, TextMeasurer } from "./common/svg";

export interface CurveOptions {
    width: number;
    height: number;
    /** Light to dark steps of one hue; the bands take three of them. */
    ramp: string[];
    lossColor: string;
    showBars: boolean;
    showBandLabels: boolean;
    showTop: boolean;
    fontSize: number;
    /** What the items are called, lower case, for labels: "customers". */
    noun: string;
    /** What is being totalled: "Revenue FY26". */
    measureName: string;
    /** Preferred form first, shorter forms after. */
    formatters: Formatter[];
    /** For the lower chart. With grouped data it shows one item's average, which needs its own unit: "$1.2K" beside totals in millions. */
    barFormatter: Formatter;
    /** Shown prominently when the visual has not been given all the data, or null: what is wrong, and what to do about it. */
    warning: { headline: string; advice: string } | null;
    emptyMessage: string;
}

export interface CurveHandlers {
    onSelect(item: RankedItem, event: MouseEvent): void;
    onClear(): void;
    onContextMenu(item: RankedItem | null, event: MouseEvent): void;
    showTooltip(item: RankedItem, event: MouseEvent): void;
    hideTooltip(): void;
}

const WARNING_COLOUR = "#B3261E";
const whole = (value: number): string => Math.round(value).toLocaleString("en-NZ");

export class ConcentrationView {
    private readonly root: SVGSVGElement;
    private readonly measure = new TextMeasurer();
    private selected: Set<string> = new Set();

    constructor(container: HTMLElement) {
        this.root = svg("svg", { class: "concentrationCurve" }) as SVGSVGElement;
        container.appendChild(this.root);
    }

    /** Dims every bar that is not part of the selection. */
    public setSelection(keys: Set<string>): void {
        this.selected = keys;
        this.root.classList.toggle("hasSelection", keys.size > 0);
        this.root.querySelectorAll("rect.bar").forEach((bar) => bar.classList.toggle("selected", keys.has(bar.getAttribute("data-key") || "")));
    }

    public render(data: Concentration | null, options: CurveOptions, handlers: CurveHandlers): void {
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
        const format = options.formatters[0];
        const items = data.items, rowCount = items.length;
        const bandColour: { [band in Band]: string } = { A: options.ramp[4], B: options.ramp[2], C: options.ramp[1], L: options.lossColor };
        const text = (x: number, y: number, content: string, extra: { [name: string]: string | number } = {}) =>
            root.appendChild(svg("text", { x, y, "font-size": size, fill: INK_SECONDARY, ...extra }, content));

        // ---- summary line, and the warning when the visual has not been given everything
        const summary = `${whole(data.totalCount)} ${options.noun}${data.grouped ? ` in ${whole(rowCount)} groups` : ""} · ${format(data.total)} ${options.measureName}`;
        let top = size + 12;
        if (options.warning) {
            // What is wrong, and what to do about it, each on its own line so neither is cut short.
            text(4, size + 2, this.measure.fit(`⚠ ${options.warning.headline}`, size, width - 8, 600), { class: "warning", "font-weight": 600, fill: WARNING_COLOUR });
            text(4, size * 2 + 6, this.measure.fit(options.warning.advice, size, width - 8), { class: "warningAdvice", fill: WARNING_COLOUR });
            text(width - 4, size * 3 + 10, this.measure.fit(summary, size, width - 8), { "text-anchor": "end", class: "summary" });
            top = size * 3 + 20;
        } else {
            text(width - 4, size + 2, this.measure.fit(summary, size, width - 8), { "text-anchor": "end", class: "summary" });
        }

        // ---- layout: the running share above, what each item brings below, sharing one horizontal scale
        const bottom = height - (size + 12);
        const curveMax = Math.max(1, ...items.map((item) => item.cumulative));
        const curveTicks = curveMax > 1.001 ? niceTicks(0, curveMax, 4) : [0, 0.25, 0.5, 0.75, 1];
        const barMax = Math.max(0, ...items.map((item) => item.average)), barMin = Math.min(0, ...items.map((item) => item.average));
        const barText = options.barFormatter;
        const left = Math.max(...curveTicks.map((t) => this.measure.width(share(t), size)), this.measure.width(barText(barMax), size), this.measure.width(barText(barMin), size)) + 10;
        const right = width - 8;
        const plotWidth = right - left;
        const available = bottom - top;
        if (plotWidth < 40 || available < 60) {
            message("Make the visual larger to see the curve");
            return;
        }
        const showBars = options.showBars && available >= 150;
        const panelGap = showBars ? 16 : 0;
        const curveHeight = showBars ? (available - panelGap) * 0.6 : available;
        const curveBottom = top + curveHeight;
        const barsTop = curveBottom + panelGap, barsBottom = bottom;

        /** Across the chart: 0 is the left edge, 1 the right, as a share of all the items. */
        const xOf = (at: number) => left + at * plotWidth;
        const curveY = (value: number) => curveBottom - (value / Math.max(curveMax, curveTicks[curveTicks.length - 1])) * curveHeight;

        // ---- running-share panel: gridlines and axis
        curveTicks.forEach((tick) => {
            const y = curveY(tick);
            root.appendChild(svg("line", { x1: left, x2: right, y1: y, y2: y, stroke: tick === 0 ? AXIS : GRIDLINE, "stroke-width": 1 }));
            text(left - 6, y + size * 0.35, share(tick), { "text-anchor": "end", fill: INK_MUTED });
        });

        // The curve's points, thinned to at most two a pixel so a long list draws as fast as a short one.
        const curveOf = (rows: RankedItem[]): string[] => {
            const points: string[] = [];
            let lastX = -1;
            rows.forEach((item, i) => {
                const x = xOf(item.to);
                if (i === rows.length - 1 || x - lastX >= 0.5) {
                    points.push(`${x.toFixed(2)},${curveY(item.cumulative).toFixed(2)}`);
                    lastX = x;
                }
            });
            return points;
        };
        // The area under the curve, one piece per band, so the bands read as steps of one colour.
        data.bands.forEach((band) => {
            const rows = items.filter((item) => item.band === band.band);
            const start = rows[0].cumulative - rows[0].share;
            const points = [`${xOf(band.from)},${curveY(0)}`, `${xOf(band.from)},${curveY(start)}`, ...curveOf(rows), `${xOf(band.to)},${curveY(0)}`];
            root.appendChild(svg("polygon", { class: "bandArea", points: points.join(" "), fill: bandColour[band.band], opacity: band.band === "L" ? 0.25 : 0.55 }));
        });
        // A thin gap in the surface colour between bands, in place of a drawn border.
        data.bands.slice(1).forEach((band) => {
            const x = xOf(band.from);
            root.appendChild(svg("line", { x1: x, x2: x, y1: top, y2: curveBottom, stroke: SURFACE, "stroke-width": 2 }));
        });
        root.appendChild(svg("polyline", { class: "curve", points: [`${xOf(0)},${curveY(0)}`, ...curveOf(items)].join(" "), fill: "none", stroke: options.ramp[5], "stroke-width": 2, "stroke-linejoin": "round" }));

        // Band labels: the letter, how many items, and the share they add. Shortened to fit.
        if (options.showBandLabels) {
            data.bands.forEach((band) => {
                const bandWidth = (band.to - band.from) * plotWidth;
                const title = band.band === "L" ? "Below zero" : band.band;
                const choices = [
                    `${title} · ${whole(band.count)} ${options.noun} · ${share(band.share)}`,
                    `${title} · ${whole(band.count)} · ${share(band.share)}`,
                    band.band === "L" ? "<0" : band.band,
                ];
                const label = choices.find((choice) => this.measure.width(choice, size, 600) <= bandWidth - 8);
                // Along the foot of the chart, clear of the curve, which is always higher up by then.
                if (label) text(xOf(band.from) + 6, curveBottom - 7, label, { class: "bandLabel", "font-weight": 600, fill: INK });
            });
        }

        // The "top" call-out: a ringed dot on the curve with its share beside it.
        if (options.showTop && data.top) {
            const x = xOf(data.top.at), y = curveY(data.top.share);
            const label = `${data.top.label}: ${share(data.top.share)}`;
            const fitsRight = x + 10 + this.measure.width(label, size, 600) <= right;
            root.appendChild(svg("circle", { class: "topDot", cx: x, cy: y, r: 4.5, fill: options.ramp[6], stroke: SURFACE, "stroke-width": 2 }));
            // Below the dot, unless that would land on the band labels along the foot.
            const below = y + size + 6 <= curveBottom - size - 12;
            text(fitsRight ? x + 9 : x - 9, below ? y + size + 6 : y - 8, label, { class: "topLabel", "text-anchor": fitsRight ? "start" : "end", "font-weight": 600, fill: INK });
        }
        if (data.peak) {
            const x = xOf(data.peak.at), y = curveY(data.peak.cumulative);
            root.appendChild(svg("circle", { class: "peakDot", cx: x, cy: y, r: 4.5, fill: options.lossColor, stroke: SURFACE, "stroke-width": 2 }));
            text(x - 9, y + size + 6, `Peak ${share(data.peak.cumulative)} at ${whole(data.peak.items)}`, { class: "peakLabel", "text-anchor": "end", "font-weight": 600, fill: INK });
        }

        // ---- lower panel: what each item brings (for a group, the average of its items)
        if (showBars) {
            const span = barMax - barMin || 1;
            const barY = (value: number) => barsBottom - ((value - barMin) / span) * (barsBottom - barsTop);
            root.appendChild(svg("line", { x1: left, x2: right, y1: barY(0), y2: barY(0), stroke: AXIS, "stroke-width": 1 }));
            text(left - 6, barsTop + size * 0.8, barText(barMax), { "text-anchor": "end", fill: INK_MUTED });
            if (barMin < 0) text(left - 6, barsBottom, barText(barMin), { "text-anchor": "end", fill: INK_MUTED });
            if (data.grouped) text(right, barsTop + size * 0.8, `Average for one of the ${options.noun} in each group`, { class: "barsNote", "text-anchor": "end", fill: INK_MUTED });

            const narrowest = Math.min(...items.map((item) => (item.to - item.from) * plotWidth));
            if (narrowest >= 1.5) {
                // Room for a bar each: these can be picked out when selected.
                items.forEach((item) => {
                    const itemWidth = (item.to - item.from) * plotWidth;
                    const gap = itemWidth > 8 ? 2 : itemWidth > 3 ? 1 : 0;
                    // A group's bar is as wide as its share of the customers; only single customers are kept from growing too wide.
                    const barWidth = Math.min(data.grouped ? Infinity : 48, Math.max(1, itemWidth - gap));
                    const y0 = barY(0), y1 = barY(item.average);
                    const barHeight = Math.max(1, Math.abs(y1 - y0));
                    root.appendChild(svg("rect", {
                        class: "bar", "data-key": String(item.index), x: xOf(item.from) + (itemWidth - barWidth) / 2, y: Math.min(y0, y1), width: barWidth, height: barHeight,
                        rx: Math.min(3, barWidth / 2, barHeight / 2), fill: bandColour[item.band],
                    }));
                });
            } else {
                // More rows than pixels: one sliver for each pixel across, taking the row at that point.
                for (let pixel = 0; pixel < Math.floor(plotWidth); pixel++) {
                    const item = itemAt(items, (pixel + 0.5) / plotWidth);
                    const y0 = barY(0), y1 = barY(item.average);
                    root.appendChild(svg("rect", { class: "sliver", x: left + pixel, y: Math.min(y0, y1), width: 1, height: Math.max(1, Math.abs(y1 - y0)), fill: bandColour[item.band] }));
                }
            }
        }

        // ---- horizontal axis
        const axisY = height - 5;
        if (data.grouped) {
            // Grouped data: the scale is the share of all the items.
            [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((tick) => text(xOf(tick), axisY, share(tick), { "text-anchor": tick === 0 ? "start" : tick === 1 ? "end" : "middle", fill: INK_MUTED, class: "shareTick" }));
            const caption = `Share of ${options.noun}, largest first`;
            if (this.measure.width(caption, size) <= plotWidth * 0.2 - 56) text(xOf(0.1) + 6, axisY, caption, { "text-anchor": "middle", fill: INK_MUTED, class: "axisCaption" });
        } else {
            const step = plotWidth / rowCount;
            const widestName = Math.max(...items.map((item) => this.measure.width(item.name, size)));
            if (widestName + 6 <= step) {
                items.forEach((item) => text(xOf((item.from + item.to) / 2), axisY, item.name, { "text-anchor": "middle", class: "itemName" }));
            } else {
                const every = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find((k) => k * step >= 34) || 20000;
                items.forEach((item) => {
                    if (item.rank !== 1 && item.rank % every !== 0) return;
                    // The last number stays inside the chart.
                    const x = xOf((item.from + item.to) / 2);
                    const atEdge = x + this.measure.width(whole(item.rank), size) / 2 > right;
                    text(atEdge ? right : x, axisY, whole(item.rank), { "text-anchor": atEdge ? "end" : "middle", fill: INK_MUTED, class: "rankTick" });
                });
                text(left - 6, axisY, "Rank", { "text-anchor": "end", fill: INK_MUTED });
            }
        }

        // ---- hover: one sheet over both panels finds the row under the pointer, however many rows there are
        const hoverBottom = showBars ? barsBottom : curveBottom;
        const hoverLine = svg("line", { class: "hoverLine", y1: top, y2: hoverBottom, stroke: INK_SECONDARY, "stroke-width": 1, visibility: "hidden", "pointer-events": "none" });
        const hoverDot = svg("circle", { class: "hoverDot", r: 4, fill: INK, stroke: SURFACE, "stroke-width": 2, visibility: "hidden", "pointer-events": "none" });
        const sheet = svg("rect", { class: "hit", x: left, y: top, width: plotWidth, height: hoverBottom - top, fill: "transparent" });
        const under = (event: Event): RankedItem => {
            const box = root.getBoundingClientRect();
            const at = ((event as MouseEvent).clientX - box.left - left) / plotWidth;
            return itemAt(items, Math.max(0, Math.min(1, at)));
        };
        sheet.addEventListener("mousemove", (event) => {
            const item = under(event);
            const x = xOf((item.from + item.to) / 2);
            hoverLine.setAttribute("x1", String(x));
            hoverLine.setAttribute("x2", String(x));
            hoverLine.setAttribute("visibility", "visible");
            hoverDot.setAttribute("cx", String(xOf(item.to)));
            hoverDot.setAttribute("cy", String(curveY(item.cumulative)));
            hoverDot.setAttribute("visibility", "visible");
            handlers.showTooltip(item, event as MouseEvent);
        });
        sheet.addEventListener("mouseleave", () => {
            hoverLine.setAttribute("visibility", "hidden");
            hoverDot.setAttribute("visibility", "hidden");
            handlers.hideTooltip();
        });
        sheet.addEventListener("click", (event) => {
            event.preventDefault();
            handlers.onSelect(under(event), event as MouseEvent);
        });
        sheet.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onContextMenu(under(event), event as MouseEvent);
        });
        root.appendChild(hoverLine);
        root.appendChild(hoverDot);
        root.appendChild(sheet);
        this.setSelection(this.selected);
    }
}

"use strict";

export const SVG_NS = "http://www.w3.org/2000/svg";
export const FONT = '"Segoe UI", wf_segoe-ui_normal, helvetica, arial, sans-serif';
const ELLIPSIS = "…";

/** Creates an SVG element with attributes and, optionally, text. */
export function svg(tag: string, attributes: { [name: string]: string | number } = {}, text?: string): SVGElement {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attributes).forEach((name) => node.setAttribute(name, String(attributes[name])));
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Removes everything inside a node. */
export function clear(node: Element): void {
    while (node.firstChild) node.removeChild(node.firstChild);
}

/** Measures text, so labels can be placed and shortened before they are drawn. */
export class TextMeasurer {
    private readonly context: CanvasRenderingContext2D | null = document.createElement("canvas").getContext("2d");

    public width(text: string, size: number, weight = 400): number {
        if (!this.context) return text.length * size * 0.55;
        this.context.font = `${weight} ${size}px ${FONT}`;
        return this.context.measureText(text).width;
    }

    /** Shortens text to a width, ending it with an ellipsis. */
    public fit(text: string, size: number, maxWidth: number, weight = 400): string {
        if (this.width(text, size, weight) <= maxWidth) return text;
        let cut = text.length - 1;
        while (cut > 1 && this.width(text.slice(0, cut) + ELLIPSIS, size, weight) > maxWidth) cut--;
        return text.slice(0, Math.max(1, cut)) + ELLIPSIS;
    }
}

/** "Nice" tick values covering a range: steps of 1, 2 or 5 times a power of ten. */
export function niceTicks(low: number, high: number, target = 5): number[] {
    if (!(high > low)) return [low];
    const rough = (high - low) / Math.max(1, target);
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) || 10 * power;
    const ticks: number[] = [];
    for (let v = Math.ceil(low / step) * step; v <= high + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return ticks;
}

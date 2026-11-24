"use strict";

export interface ScatterPoint {
    /** Position in the data as it arrived, for selection. */
    index: number;
    name: string;
    x: number;
    y: number;
    size: number | null;
}

/** Where a dividing line sits: at the middle value, at the average, or at a value typed in. */
export type LineMode = "median" | "mean" | "value";

export type Quadrant = "topRight" | "topLeft" | "bottomRight" | "bottomLeft";

export interface Scatter {
    points: ScatterPoint[];
    xLine: number;
    yLine: number;
    counts: { [quadrant in Quadrant]: number };
    /** Points left out because a logarithmic axis cannot show zero or negative values. */
    hidden: number;
}

export function lineValue(values: number[], mode: LineMode, custom: number): number {
    if (mode === "value" || values.length === 0) return custom;
    if (mode === "mean") return values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A point on a dividing line counts as on the high side. */
export function quadrantOf(point: { x: number; y: number }, xLine: number, yLine: number): Quadrant {
    const right = point.x >= xLine, top = point.y >= yLine;
    return top ? (right ? "topRight" : "topLeft") : right ? "bottomRight" : "bottomLeft";
}

export function buildScatter(
    raw: { name: string; x: number | null; y: number | null; size: number | null }[],
    x: { mode: LineMode; value: number; log: boolean },
    y: { mode: LineMode; value: number; log: boolean },
): Scatter | null {
    const complete = raw.map((p, index) => ({ ...p, index })).filter((p): p is { name: string; x: number; y: number; size: number | null; index: number } => p.x !== null && p.y !== null);
    const points = complete.filter((p) => (!x.log || p.x > 0) && (!y.log || p.y > 0));
    if (points.length === 0) return null;
    const xLine = lineValue(points.map((p) => p.x), x.mode, x.value);
    const yLine = lineValue(points.map((p) => p.y), y.mode, y.value);
    const counts = { topRight: 0, topLeft: 0, bottomRight: 0, bottomLeft: 0 };
    points.forEach((p) => counts[quadrantOf(p, xLine, yLine)]++);
    return { points, xLine, yLine, counts, hidden: complete.length - points.length };
}

/** Tick values for a logarithmic axis: 1, 2 and 5 times each power of ten inside the range. */
export function logTicks(low: number, high: number): number[] {
    const ticks: number[] = [];
    for (let power = Math.floor(Math.log10(low)); power <= Math.ceil(Math.log10(high)); power++) {
        for (const m of [1, 2, 5]) {
            const v = m * Math.pow(10, power);
            if (v >= low * 0.999 && v <= high * 1.001) ticks.push(v);
        }
    }
    // Too many to label: keep the powers of ten.
    return ticks.length > 8 ? ticks.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9) : ticks;
}

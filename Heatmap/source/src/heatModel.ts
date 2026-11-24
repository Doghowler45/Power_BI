"use strict";

/** The grid as it arrives: `values[row][column]`, with null where there is no data. */
export interface HeatData {
    rows: string[];
    columns: string[];
    values: (number | null)[][];
}

/** What a cell's colour is measured against: every cell, the cells in its row, or those in its column. */
export type Scope = "all" | "row" | "column";

export interface ScaleOptions {
    /** Two poles around a midpoint (variances), as opposed to low to high (amounts). */
    twoSided: boolean;
    midpoint: number;
    scope: Scope;
    /** Low-to-high scales only: start the scale at zero, not at the smallest value. */
    zeroBased: boolean;
}

/** The values at the two ends of a colour scale. */
export interface Extent {
    low: number;
    high: number;
}

export function extentOf(values: (number | null)[], options: ScaleOptions): Extent | null {
    const present = values.filter((v): v is number => v !== null);
    if (present.length === 0) return null;
    const min = Math.min(...present), max = Math.max(...present);
    if (options.twoSided) {
        // Both arms cover the same distance, so the same depth of colour means the same size of gap on either side.
        const half = Math.max(Math.abs(max - options.midpoint), Math.abs(min - options.midpoint));
        return { low: options.midpoint - half, high: options.midpoint + half };
    }
    return options.zeroBased ? { low: Math.min(0, min), high: Math.max(0, max) } : { low: min, high: max };
}

/** Where a value sits on its scale: 0 at the low end, 1 at the high end. */
export function positionOf(value: number, extent: Extent, options: ScaleOptions): number {
    // Every value the same: there is nothing to rank, so they all take one mid-strength colour.
    if (extent.high === extent.low) return options.twoSided ? 0.5 : 0.6;
    return Math.max(0, Math.min(1, (value - extent.low) / (extent.high - extent.low)));
}

export interface Extents {
    all: Extent | null;
    rows: (Extent | null)[];
    columns: (Extent | null)[];
}

export function extentsOf(data: HeatData, options: ScaleOptions): Extents {
    return {
        all: extentOf(data.values.flat(), options),
        rows: data.values.map((row) => extentOf(row, options)),
        columns: data.columns.map((_, c) => extentOf(data.values.map((row) => row[c] ?? null), options)),
    };
}

export function extentFor(extents: Extents, scope: Scope, row: number, column: number): Extent | null {
    return scope === "row" ? extents.rows[row] : scope === "column" ? extents.columns[column] : extents.all;
}

/** Positions into `rows` or `columns`, largest total first. Equal totals keep the order they arrived in. */
export function orderByTotal(totals: number[]): number[] {
    return totals.map((_, i) => i).sort((a, b) => (totals[b] === totals[a] ? a - b : totals[b] - totals[a]));
}

export function rowTotals(data: HeatData): number[] {
    return data.values.map((row) => row.reduce<number>((sum, v) => sum + (v ?? 0), 0));
}

export function columnTotals(data: HeatData): number[] {
    return data.columns.map((_, c) => data.values.reduce<number>((sum, row) => sum + (row[c] ?? 0), 0));
}

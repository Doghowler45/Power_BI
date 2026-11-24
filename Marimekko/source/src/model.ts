"use strict";

import { OTHER_LABEL } from "./common/colours";

/** The grid as it arrives: `values[column][series]`, null where there is no data. */
export interface MekkoInput {
    columns: string[];
    series: string[];
    values: (number | null)[][];
}

export interface MekkoSegment {
    /** Positions, in the data as it arrived, of the columns it belongs to: one, or several pooled into "Other". */
    columns: number[];
    /** Positions of the series it stands for: one, or several pooled into "Other". */
    members: number[];
    name: string;
    value: number;
    shareOfColumn: number;
    shareOfTotal: number;
}

export interface MekkoColumn {
    /** Positions of the columns it stands for: one, or several pooled into "Other". */
    members: number[];
    name: string;
    total: number;
    shareOfTotal: number;
    segments: MekkoSegment[];
}

export interface Mekko {
    columns: MekkoColumn[];
    /** Segment names in stacking order, bottom first: largest overall first, "Other" last. */
    series: string[];
    total: number;
    /** True when values below zero were left out: a share-of-total chart cannot show them. */
    droppedNegatives: boolean;
}

/** Largest first; when there are more than `limit`, the smallest are pooled into one "Other" group, placed last. */
function rankAndPool(names: string[], totals: number[], limit: number): { name: string; members: number[] }[] {
    const ranked = names.map((_, i) => i).filter((i) => totals[i] > 0).sort((a, b) => (totals[b] === totals[a] ? a - b : totals[b] - totals[a]));
    const most = Math.max(2, Math.round(limit));
    if (ranked.length <= most) return ranked.map((i) => ({ name: names[i], members: [i] }));
    return [...ranked.slice(0, most - 1).map((i) => ({ name: names[i], members: [i] })), { name: OTHER_LABEL, members: ranked.slice(most - 1) }];
}

/**
 * Sizes the columns and their segments. Blank and negative values count as nothing. Columns
 * and series beyond the limits are pooled into "Other", so the chart never has slivers too
 * thin to read or more colours than a reader can tell apart.
 */
export function buildMekko(input: MekkoInput, sortColumns: boolean, maxSegments: number, maxColumns: number): Mekko | null {
    let droppedNegatives = false;
    const value = (c: number, s: number): number => {
        const raw = input.values[c] ? input.values[c][s] ?? null : null;
        if (raw !== null && raw < 0) droppedNegatives = true;
        return raw !== null && raw > 0 ? raw : 0;
    };
    const seriesTotals = input.series.map((_, s) => input.columns.reduce((sum, __, c) => sum + value(c, s), 0));
    const columnTotals = input.columns.map((_, c) => input.series.reduce((sum, __, s) => sum + value(c, s), 0));
    const total = columnTotals.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return null;

    // Largest series first; that is also the stacking order, so the biggest sits on the baseline everywhere.
    const seriesGroups = rankAndPool(input.series, seriesTotals, maxSegments);
    const columnGroups = rankAndPool(input.columns, columnTotals, maxColumns);
    if (!sortColumns) {
        // Data order, with "Other" still last.
        columnGroups.sort((a, b) => (a.members.length > 1 ? 1 : b.members.length > 1 ? -1 : a.members[0] - b.members[0]));
    }

    const sum = (columns: number[], series: number[]) => columns.reduce((a, c) => a + series.reduce((b, s) => b + value(c, s), 0), 0);
    const columns: MekkoColumn[] = columnGroups.map((column) => {
        const columnTotal = sum(column.members, input.series.map((_, s) => s));
        return {
            members: column.members,
            name: column.name,
            total: columnTotal,
            shareOfTotal: columnTotal / total,
            segments: seriesGroups
                .map((group) => {
                    const segmentValue = sum(column.members, group.members);
                    return { columns: column.members, members: group.members, name: group.name, value: segmentValue, shareOfColumn: segmentValue / columnTotal, shareOfTotal: segmentValue / total };
                })
                .filter((segment) => segment.value > 0),
        };
    });
    return { columns, series: seriesGroups.map((group) => group.name), total, droppedNegatives };
}

export const segmentKey = (segment: MekkoSegment): string => `${segment.columns.join(",")}|${segment.members.join(",")}`;

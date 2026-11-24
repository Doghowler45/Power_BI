"use strict";

/** The grid as it arrives: `values[period][series]`, null where there is no data. */
export interface RankInput {
    periods: string[];
    series: string[];
    values: (number | null)[][];
}

export interface RankPoint {
    /** 1 for the top; null when the series has no value in that period. */
    rank: number | null;
    value: number | null;
}

export type Movement = "up" | "down" | "same";

export interface RankLine {
    /** Position of the series in the data as it arrived. */
    series: number;
    name: string;
    /** One point per period. */
    points: RankPoint[];
    /** Places gained between its first and last ranked periods (negative for places lost). */
    change: number;
    movement: Movement;
    /** Rank in the last period, or null if it has no value there. */
    lastRank: number | null;
}

export interface RankData {
    periods: string[];
    /** Everything that is in the top places in at least one period. */
    lines: RankLine[];
    /** How many places are shown; the rest share one "below" row. */
    places: number;
    /** True when some line spends a period outside the places shown. */
    hasBelow: boolean;
}

/**
 * Ranks every series within each period and keeps those that make the top places at least
 * once. A series ranked below the places shown is still followed, so it can be seen arriving
 * or dropping out.
 */
export function buildRanks(input: RankInput, topCount: number, lowestFirst: boolean): RankData | null {
    const seriesCount = input.series.length;
    if (input.periods.length === 0 || seriesCount === 0) return null;
    const ranks: (number | null)[][] = input.periods.map((_, p) => {
        const row = input.values[p] || [];
        const present = input.series.map((__, s) => s).filter((s) => row[s] !== null && row[s] !== undefined);
        present.sort((a, b) => {
            const x = row[a] as number, y = row[b] as number;
            return x === y ? a - b : lowestFirst ? x - y : y - x;
        });
        const result: (number | null)[] = input.series.map(() => null);
        present.forEach((s, i) => (result[s] = i + 1));
        return result;
    });
    const mostRanked = Math.max(...ranks.map((row) => row.filter((r) => r !== null).length));
    if (mostRanked === 0) return null;
    const places = Math.max(1, Math.min(Math.round(topCount), mostRanked));

    const lines: RankLine[] = [];
    for (let s = 0; s < seriesCount; s++) {
        const points: RankPoint[] = input.periods.map((_, p) => ({ rank: ranks[p][s], value: (input.values[p] || [])[s] ?? null }));
        if (!points.some((point) => point.rank !== null && point.rank <= places)) continue;
        const ranked = points.filter((point) => point.rank !== null);
        const change = ranked.length > 1 ? (ranked[0].rank as number) - (ranked[ranked.length - 1].rank as number) : 0;
        lines.push({ series: s, name: input.series[s], points, change, movement: change > 0 ? "up" : change < 0 ? "down" : "same", lastRank: points[points.length - 1].rank });
    }
    const hasBelow = lines.some((line) => line.points.some((point) => point.rank !== null && point.rank > places));
    return { periods: input.periods, lines, places, hasBelow };
}

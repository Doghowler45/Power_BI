"use strict";

/** A is the few that make up most of the total, B the next slice, C the long tail; L is anything below zero. */
export type Band = "A" | "B" | "C" | "L";

/** One row: a single item (a customer), or a group of them (a bucket of customers) when a Count is supplied. */
export interface RankedItem {
    /** Position in the data as it arrived, for selection. */
    index: number;
    name: string;
    value: number;
    /** How many items this row stands for: 1 unless the data is grouped. */
    count: number;
    /** value / count: what one item in this row brings on average. Rows are ranked by this. */
    average: number;
    /** 1 for the first row. */
    rank: number;
    /** This row's share of the total (negative for a loss). */
    share: number;
    /** The running share of the total up to and including this row. */
    cumulative: number;
    /** The share of all items that come before this row, and up to and including it: its position across the chart. */
    from: number;
    to: number;
    band: Band;
}

export interface BandSummary {
    band: Band;
    /** How many items (customers) the band holds: the sum of its rows' counts. */
    count: number;
    /** The share of the total this band adds. */
    share: number;
    value: number;
    /** Where the band starts and ends across the chart, as a share of all items. */
    from: number;
    to: number;
}

export interface Concentration {
    items: RankedItem[];
    total: number;
    totalCount: number;
    /** True when rows stand for groups of items. */
    grouped: boolean;
    bands: BandSummary[];
    /** The running share reached by the largest few: "Top 10" of the items, or "Top 10%" of them when grouped. */
    top: { label: string; share: number; at: number } | null;
    /** The highest point of the running share, when losses pull it back down afterwards. */
    peak: { at: number; cumulative: number; items: number } | null;
}

export interface TopSetting {
    /** Ungrouped data: how many of the largest items. */
    count: number;
    /** Grouped data: what percentage of the items. */
    percent: number;
}

/**
 * Ranks the rows by what one item brings (largest first) and works out the running share of
 * the total against the running share of items.
 *
 * A holds the rows up to and including the one that takes the running share past the first
 * threshold, B those up to the second, C the rest; rows below zero are L. With grouped data a
 * band boundary therefore falls at the edge of a group, so it is exact to within one group.
 * Returns null when the total is not positive, because shares of it would mean nothing.
 */
export function buildConcentration(points: { name: string; value: number | null; count: number | null }[], grouped: boolean, aThreshold: number, bThreshold: number, top: TopSetting): Concentration | null {
    const present = points
        .map((p, index) => ({ name: p.name, value: p.value, count: grouped ? p.count : 1, index }))
        .filter((p): p is { name: string; value: number; count: number; index: number } => p.value !== null && p.count !== null && p.count > 0);
    const total = present.reduce((sum, p) => sum + p.value, 0);
    const totalCount = present.reduce((sum, p) => sum + p.count, 0);
    if (present.length === 0 || !(total > 0)) return null;
    const sorted = [...present].sort((x, y) => {
        const a = x.value / x.count, b = y.value / y.count;
        return a === b ? x.index - y.index : b - a;
    });

    const a = Math.min(aThreshold, bThreshold) / 100, b = Math.max(aThreshold, bThreshold) / 100;
    let running = 0, runningCount = 0;
    let band: Band = "A";
    const items: RankedItem[] = sorted.map((p, i) => {
        const itemBand: Band = p.value < 0 ? "L" : band;
        const from = runningCount / totalCount;
        running += p.value;
        runningCount += p.count;
        const cumulative = running / total;
        // The row that crosses a threshold belongs to the band it completes.
        if (band === "A" && cumulative >= a - 1e-9) band = "B";
        if (band === "B" && cumulative >= b - 1e-9) band = "C";
        return { index: p.index, name: p.name, value: p.value, count: p.count, average: p.value / p.count, rank: i + 1, share: p.value / total, cumulative, from, to: runningCount / totalCount, band: itemBand };
    });

    const bands: BandSummary[] = (["A", "B", "C", "L"] as Band[])
        .map((name) => {
            const members = items.filter((item) => item.band === name);
            const value = members.reduce((sum, item) => sum + item.value, 0);
            return {
                band: name, count: members.reduce((sum, item) => sum + item.count, 0), value, share: value / total,
                from: members.length ? members[0].from : 0, to: members.length ? members[members.length - 1].to : 0,
            };
        })
        .filter((summary) => summary.count > 0);

    // The running share at a point across the chart, taking a group's items as equal within it.
    const shareAt = (at: number): number => {
        const item = items.find((candidate) => at <= candidate.to + 1e-12) || items[items.length - 1];
        const before = item.cumulative - item.share;
        return item.to === item.from ? item.cumulative : before + ((at - item.from) / (item.to - item.from)) * item.share;
    };
    let topResult: Concentration["top"] = null;
    if (grouped) {
        const percent = Math.min(99.9, Math.max(0.01, top.percent));
        topResult = { label: `Top ${percent}%`, share: shareAt(percent / 100), at: percent / 100 };
    } else {
        const count = Math.max(1, Math.round(top.count));
        if (items.length > count) topResult = { label: `Top ${count}`, share: items[count - 1].cumulative, at: items[count - 1].to };
    }

    const highest = items.reduce((best, item) => (item.cumulative > best.cumulative ? item : best), items[0]);
    const itemsToPeak = items.slice(0, highest.rank).reduce((sum, item) => sum + item.count, 0);
    return {
        items,
        total,
        totalCount,
        grouped,
        bands,
        top: topResult,
        peak: highest.rank < items.length && highest.cumulative > 1 + 1e-9 ? { at: highest.to, cumulative: highest.cumulative, items: itemsToPeak } : null,
    };
}

/** The row that covers a position across the chart (0 to 1). */
export function itemAt(items: RankedItem[], at: number): RankedItem {
    let low = 0, high = items.length - 1;
    while (low < high) {
        const middle = (low + high) >> 1;
        if (items[middle].to < at) low = middle + 1;
        else high = middle;
    }
    return items[low];
}

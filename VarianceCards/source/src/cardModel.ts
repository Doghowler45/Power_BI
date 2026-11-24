"use strict";

/** One KPI as it arrives from Power BI: a value per period for the actual and for each comparison supplied. */
export interface CardInput {
    title: string;
    /** Period names, or a single empty name when there is no Trend field. */
    periods: string[];
    actual: (number | null)[];
    plan: (number | null)[] | null;
    previousYear: (number | null)[] | null;
    /** True for measures where an increase is bad news, such as costs. */
    higherIsWorse: boolean;
}

/** How the headline figure is worked out from the periods. */
export type Headline = "sum" | "last" | "average";

export interface Comparison {
    code: "PL" | "PY";
    base: number | null;
    delta: number | null;
    /** delta as a percentage of the size of base. Null when base is blank or zero. */
    percent: number | null;
}

export interface TrendPoint {
    label: string;
    value: number | null;
    /** The first comparison supplied (plan, else previous year) for the same period. */
    base: number | null;
}

export interface CardResult {
    title: string;
    value: number | null;
    comparisons: Comparison[];
    trend: TrendPoint[];
    /** Which periods the headline covers, when that is not all of them: "Jan–Oct", or "Oct". */
    periodNote: string;
    higherIsWorse: boolean;
}

function compare(code: "PL" | "PY", value: number | null, base: number | null): Comparison {
    const delta = value !== null && base !== null ? value - base : null;
    const percent = delta !== null && base !== null && base !== 0 ? (delta / Math.abs(base)) * 100 : null;
    return { code, base, delta, percent };
}

/**
 * Works out the headline figure and its variances. Only periods that have an actual are
 * counted, on both sides: with actuals to October and a plan for the full year, the
 * comparison is January to October against January to October.
 */
export function summarise(card: CardInput, headline: Headline): CardResult {
    const used = card.actual.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0);
    const chosen = headline === "last" ? used.slice(-1) : used;
    const combine = (values: (number | null)[] | null): number | null => {
        if (!values) return null;
        const present = chosen.map((i) => values[i]).filter((v): v is number => v !== null && v !== undefined);
        if (present.length === 0) return null;
        const sum = present.reduce((a, b) => a + b, 0);
        return headline === "average" ? sum / present.length : sum;
    };
    const value = combine(card.actual);
    const comparisons: Comparison[] = [];
    if (card.plan) comparisons.push(compare("PL", value, combine(card.plan)));
    if (card.previousYear) comparisons.push(compare("PY", value, combine(card.previousYear)));

    const hasTrend = card.periods.length > 1;
    const firstBase = card.plan || card.previousYear;
    let periodNote = "";
    if (hasTrend && chosen.length > 0 && chosen.length < card.periods.length) {
        const first = card.periods[chosen[0]], last = card.periods[chosen[chosen.length - 1]];
        periodNote = first === last ? first : `${first}–${last}`;
    }
    return {
        title: card.title,
        value,
        comparisons,
        trend: hasTrend ? card.periods.map((label, i) => ({ label, value: card.actual[i] ?? null, base: firstBase ? firstBase[i] ?? null : null })) : [],
        periodNote,
        higherIsWorse: card.higherIsWorse,
    };
}

/** "+12.3%", "−4.0%", or "+140%" for large values. */
export function formatPercent(value: number): string {
    const size = Math.abs(value);
    const text = size >= 100 ? size.toFixed(0) : size.toFixed(1);
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${text}%`;
}

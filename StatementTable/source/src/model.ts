"use strict";

/**
 * What a line of the statement is.
 *  - line: adds to the running total (revenue, other income)
 *  - cost: takes away from it (cost of sales, expenses), entered as a positive number
 *  - subtotal, total: the running total so far (gross profit, net profit)
 *  - ratio: the subtotal above it as a percentage of the first line (a margin)
 *  - heading: a label with no figures
 *  - spacer: a gap
 */
export type LineKind = "line" | "cost" | "subtotal" | "total" | "ratio" | "heading" | "spacer";

export type Scenario = "pl" | "py";

export interface RawLine {
    name: string;
    kind: string | null;
    order: number | null;
    level: number | null;
    actual: number | null;
    plan: number | null;
    previousYear: number | null;
}

export interface Comparison {
    base: number | null;
    /** Actual minus the comparison. For a ratio, the difference in percentage points. */
    delta: number | null;
    /** delta as a percentage of the size of the comparison. Not given for ratios. */
    percent: number | null;
    /** True when the difference is good news: a lower cost, or a higher anything else. */
    good: boolean;
}

export interface StatementRow {
    /** Position in the data as it arrived, for selection. */
    index: number;
    name: string;
    kind: LineKind;
    level: number;
    actual: number | null;
    comparisons: { [scenario in Scenario]: Comparison };
}

const KINDS: LineKind[] = ["line", "cost", "subtotal", "total", "ratio", "heading", "spacer"];

/** Reads the Line type field. Anything unrecognised, or no field at all, is an ordinary line. */
export function parseKind(text: string | null): LineKind {
    const word = (text || "").trim().toLowerCase();
    const aliases: { [word: string]: LineKind } = { income: "line", revenue: "line", expense: "cost", costs: "cost", "sub-total": "subtotal", sum: "subtotal", percent: "ratio", margin: "ratio", header: "heading", title: "heading", blank: "spacer", gap: "spacer" };
    return KINDS.find((kind) => kind === word) || aliases[word] || "line";
}

/**
 * Puts the lines in order and fills in the figures the statement works out for itself.
 *
 * A subtotal or total with no value of its own (blank or zero) is the running total of the
 * lines above it (lines added, costs taken away). If the measure does supply a value for it,
 * that value is used. A ratio is the latest subtotal divided by the first line of the statement.
 */
export function buildStatement(raw: RawLine[]): StatementRow[] {
    const ordered = raw.map((line, index) => ({ line, index })).sort((a, b) => {
        const x = a.line.order, y = b.line.order;
        if (x === null && y === null) return a.index - b.index;
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y || a.index - b.index;
    });
    type Triple = { actual: number | null; plan: number | null; previousYear: number | null };
    const running: Triple = { actual: null, plan: null, previousYear: null };
    let lastSubtotal: Triple = { actual: null, plan: null, previousYear: null };
    let first: Triple | null = null;
    const add = (total: number | null, value: number | null, sign: number): number | null => (value === null ? total : (total ?? 0) + sign * value);
    const ratio = (top: number | null, bottom: number | null): number | null => (top !== null && bottom ? top / bottom : null);

    return ordered.map(({ line, index }) => {
        const kind = parseKind(line.kind);
        let values: Triple = { actual: line.actual, plan: line.plan, previousYear: line.previousYear };
        if (kind === "line" || kind === "cost") {
            const sign = kind === "cost" ? -1 : 1;
            running.actual = add(running.actual, values.actual, sign);
            running.plan = add(running.plan, values.plan, sign);
            running.previousYear = add(running.previousYear, values.previousYear, sign);
            if (!first && kind === "line") first = { ...values };
        } else if (kind === "subtotal" || kind === "total") {
            // Zero counts as "no value": a measure written as SUM(...) + 0, which stops Power BI
            // dropping the lines that have no figures, returns 0 for them.
            values = { actual: values.actual || running.actual, plan: values.plan || running.plan, previousYear: values.previousYear || running.previousYear };
            lastSubtotal = { ...values };
        } else if (kind === "ratio") {
            const top = lastSubtotal.actual !== null || lastSubtotal.plan !== null || lastSubtotal.previousYear !== null ? lastSubtotal : running;
            values = { actual: ratio(top.actual, first ? first.actual : null), plan: ratio(top.plan, first ? first.plan : null), previousYear: ratio(top.previousYear, first ? first.previousYear : null) };
        } else {
            values = { actual: null, plan: null, previousYear: null };
        }
        const compare = (base: number | null): Comparison => {
            const delta = values.actual !== null && base !== null ? values.actual - base : null;
            return {
                base,
                delta,
                percent: kind !== "ratio" && delta !== null && base ? (delta / Math.abs(base)) * 100 : null,
                good: delta === null ? true : kind === "cost" ? delta <= 0 : delta >= 0,
            };
        };
        return { index, name: line.name, kind, level: Math.max(0, Math.round(line.level ?? 0)), actual: values.actual, comparisons: { pl: compare(values.plan), py: compare(values.previousYear) } };
    });
}

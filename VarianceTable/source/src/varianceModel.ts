"use strict";

/** What actual is compared against. */
export type Scenario = "py" | "pl" | "fc";

/** Short codes used on the chart for each scenario. */
export const SCENARIO_CODE: { [scenario in Scenario]: string } = { py: "PY", pl: "PL", fc: "FC" };

/** One category as it arrives from Power BI: a value (or blank) for each scenario, and an optional comment. */
export interface Point {
    key: string;
    category: string;
    actual: number | null;
    previousYear: number | null;
    plan: number | null;
    forecast: number | null;
    comment: string | null;
}

/**
 * The points for one value of the Group field (one division, say). With no Group field there
 * is a single series with an empty name. Every series lists the same categories in the same order.
 */
export interface Series {
    name: string;
    points: Point[];
}

/** One category ready to draw. */
export interface Row {
    key: string;
    category: string;
    /** The value drawn in the main chart: actual, or forecast where there is no actual yet. */
    value: number | null;
    /** True when `value` is a forecast standing in for an actual that does not exist yet. */
    isForecast: boolean;
    /** The value it is compared against. */
    base: number | null;
    /** value minus base. */
    delta: number | null;
    /** delta as a percentage of the size of base. Null when base is blank or zero. */
    deltaPercent: number | null;
    comment: string | null;
    /** True for the total added at the end; it is not a category from the data. */
    isTotal?: boolean;
    /** When several series are combined: each one's share of `value`, for stacking. */
    parts?: { name: string; value: number }[];
}

export type SortField = "none" | "value" | "delta" | "deltaPercent";
export type SortDirection = "asc" | "desc";

function baseOf(point: Point, scenario: Scenario): number | null {
    return scenario === "py" ? point.previousYear : scenario === "pl" ? point.plan : point.forecast;
}

/**
 * Picks what to compare against when the report author has not chosen: plan if there is one,
 * otherwise previous year, otherwise forecast. Returns null when there is nothing to compare with.
 */
export function chooseScenario(points: Point[], preferred: Scenario | "auto"): Scenario | null {
    const has = (scenario: Scenario) => points.some((p) => baseOf(p, scenario) !== null);
    if (preferred !== "auto" && has(preferred)) return preferred;
    if (has("pl")) return "pl";
    if (has("py")) return "py";
    // Forecast is only a useful comparison where there are actuals to set against it.
    if (has("fc") && points.some((p) => p.actual !== null)) return "fc";
    return null;
}

function makeRow(key: string, category: string, value: number | null, isForecast: boolean, base: number | null, comment: string | null): Row {
    const delta = value !== null && base !== null ? value - base : null;
    const deltaPercent = delta !== null && base !== null && base !== 0 ? (delta / Math.abs(base)) * 100 : null;
    return { key, category, value, isForecast, base, delta, deltaPercent, comment };
}

/**
 * Works out, for each category, the value to show and its variance against the chosen scenario.
 * Where a category has no actual but does have a forecast (months still to come), the forecast
 * is shown in its place and marked as such, unless forecast is itself what is being compared against.
 */
export function buildRows(points: Point[], scenario: Scenario | null): Row[] {
    return points.map((point) => {
        const useForecast = point.actual === null && point.forecast !== null && scenario !== "fc";
        const value = useForecast ? point.forecast : point.actual;
        const base = scenario ? baseOf(point, scenario) : null;
        return makeRow(point.key, point.category, value, useForecast, base, point.comment);
    });
}

const sumOrNull = (values: (number | null)[]): number | null => {
    const present = values.filter((v): v is number => v !== null);
    return present.length ? present.reduce((a, b) => a + b, 0) : null;
};

/**
 * Adds several series together, category by category. Each row keeps the size of every
 * series' contribution in `parts`, so it can be drawn stacked.
 */
export function combineSeries(series: Series[], scenario: Scenario | null): Row[] {
    if (series.length === 0) return [];
    const perSeries = series.map((s) => buildRows(s.points, scenario));
    return perSeries[0].map((first, i) => {
        const rows = perSeries.map((list) => list[i]).filter((r) => r !== undefined);
        const value = sumOrNull(rows.map((r) => r.value));
        const base = sumOrNull(rows.map((r) => r.base));
        const row = makeRow(first.key, first.category, value, rows.some((r) => r.isForecast) && rows.every((r) => r.isForecast || r.value === null), base,
            rows.map((r) => r.comment).find((c) => !!c) || null);
        row.parts = rows.map((r, s) => ({ name: series[s].name, value: r.value ?? 0 })).filter((p) => p.value !== 0);
        return row;
    });
}

/** A row that sums every category. Only meaningful for measures that add up, such as revenue or cost. */
export function totalRow(rows: Row[], label: string): Row {
    const row = makeRow("__total__", label, sumOrNull(rows.map((r) => r.value)), false, sumOrNull(rows.map((r) => r.base)), null);
    row.isTotal = true;
    return row;
}

/**
 * The order to draw categories in: positions into `rows`. "none" keeps the order the data
 * arrived in. Blanks always go last.
 */
export function sortOrder(rows: Row[], field: SortField, direction: SortDirection): number[] {
    const order = rows.map((_, i) => i);
    if (field === "none") return order;
    const pick = (r: Row) => (field === "value" ? r.value : field === "delta" ? r.delta : r.deltaPercent);
    const sign = direction === "asc" ? 1 : -1;
    return order.sort((a, b) => {
        const x = pick(rows[a]), y = pick(rows[b]);
        if (x === null && y === null) return a - b;
        if (x === null) return 1;
        if (y === null) return -1;
        return x === y ? a - b : (x - y) * sign;
    });
}

/** "+12.3%", "−4.0%", or "+140%" for large values. */
export function formatPercent(value: number): string {
    const size = Math.abs(value);
    const text = size >= 100 ? size.toFixed(0) : size.toFixed(1);
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${text}%`;
}

/** Breaks text into lines of at most `maxChars`, on word boundaries, for drawing in a narrow panel. */
export function wrapText(text: string, maxChars: number): string[] {
    const limit = Math.max(6, Math.floor(maxChars));
    const lines: string[] = [];
    let current = "";
    text.split(/\s+/).filter((w) => w).forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length <= limit || !current) current = candidate;
        else {
            lines.push(current);
            current = word;
        }
    });
    if (current) lines.push(current);
    return lines;
}

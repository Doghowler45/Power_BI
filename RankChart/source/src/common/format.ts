"use strict";

import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

export const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

export const UNIT_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto" },
    { value: "none", displayName: "None" },
    { value: "thousands", displayName: "Thousands" },
    { value: "millions", displayName: "Millions" },
    { value: "billions", displayName: "Billions" },
];

export type Formatter = (value: number) => string;

export const isPercentFormat = (format: string): boolean => format.indexOf("%") >= 0;

/**
 * One display unit for a whole visual, so its figures can be compared. On "auto" it comes
 * from the typical (median) size, not the largest: one big value must not push the rest into
 * reading "0.0bn". Percentages are never scaled.
 */
export function chooseUnit(format: string, values: (number | null)[], choice: string): number {
    if (isPercentFormat(format)) return 1;
    if (choice !== "auto") return UNIT_VALUES[choice] ?? 1;
    const sizes = values.filter((v): v is number => v !== null && v !== 0).map((v) => Math.abs(v)).sort((a, b) => a - b);
    const typical = sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : 0;
    return typical >= 1e9 ? 1e9 : typical >= 1e6 ? 1e6 : typical >= 1e3 ? 1e3 : 1;
}

/**
 * Ways to write a value: the preferred one first ("$58.2M"), then the same with fewer decimal
 * places ("$58M") for places too small for it. A value that rounds to nothing is written as
 * plain zero, never "-0".
 */
export function makeFormatters(format: string, unit: number, decimals: number, locale: string): Formatter[] {
    const scaled = unit > 1 || isPercentFormat(format);
    const precisions: (number | undefined)[] = scaled ? Array.from({ length: decimals + 1 }, (_, i) => decimals - i) : [undefined];
    return precisions.map((precision) => {
        const formatter = valueFormatter.create({ format, value: unit, precision, cultureSelector: locale });
        const zero = formatter.format(0);
        return (value: number) => {
            const text = formatter.format(value);
            return /[1-9]/.test(text) ? text : zero;
        };
    });
}

/** The value in full, in the measure's own format: for tooltips. */
export function fullFormatter(format: string): Formatter {
    return (value: number) => valueFormatter.format(value, format);
}

/** Shows a category value (text, number or date) the way its column is formatted. */
export function categoryText(raw: powerbi.PrimitiveValue, format: string | undefined): string {
    return raw === null || raw === undefined ? "(Blank)" : typeof raw === "string" ? raw : valueFormatter.format(raw, format);
}

/** A share between 0 and 1 as "62%" or, with decimals, "62.4%". */
export function share(value: number, decimals = 0): string {
    return `${(value * 100).toFixed(decimals)}%`;
}

export const clampDecimals = (value: unknown): number => Math.min(4, Math.max(0, Math.round(Number(value) || 0)));

export const range = (min: number, max: number) => ({
    minValue: { type: powerbi.visuals.ValidatorType.Min as powerbi.visuals.ValidatorType.Min, value: min },
    maxValue: { type: powerbi.visuals.ValidatorType.Max as powerbi.visuals.ValidatorType.Max, value: max },
});

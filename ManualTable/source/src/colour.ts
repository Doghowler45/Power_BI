"use strict";

/** A colour as hue (0 to 360), saturation (0 to 1) and brightness (0 to 1): what the picker's controls set. */
export interface Hsv {
    h: number;
    s: number;
    v: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Reads a typed hex colour. Accepts "#57B133", "57b133", "#5B3" and "5b3", with any spaces
 * around it, and the eight-digit form "#57B13380" whose last two digits are opacity.
 * Returns the colour in capitals as "#RRGGBB" (or "#RRGGBBAA"), or null if it is not a hex colour.
 */
export function parseHex(text: string): string | null {
    const t = text.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(t) || /^[0-9a-fA-F]{8}$/.test(t)) return "#" + t.toUpperCase();
    if (/^[0-9a-fA-F]{3}$/.test(t)) return "#" + t.split("").map((ch) => ch + ch).join("").toUpperCase();
    return null;
}

/**
 * Splits a saved colour into its solid "#RRGGBB" part and its transparency as a percentage:
 * 0 is solid, 100 is invisible.
 */
export function splitColour(colour: string): { hex: string; transparency: number } {
    const clean = parseHex(colour);
    if (!clean) return { hex: "#000000", transparency: 0 };
    if (clean.length === 9) {
        const opacity = parseInt(clean.slice(7, 9), 16) / 255;
        return { hex: clean.slice(0, 7), transparency: Math.round((1 - opacity) * 100) };
    }
    return { hex: clean, transparency: 0 };
}

/** Combines a solid colour and a transparency percentage into one saved colour. Solid colours stay "#RRGGBB". */
export function joinColour(hex: string, transparency: number): string {
    const solid = (parseHex(hex) || "#000000").slice(0, 7);
    const t = Math.min(100, Math.max(0, Math.round(transparency)));
    if (t === 0) return solid;
    const opacity = Math.round(((100 - t) / 100) * 255);
    return (solid + opacity.toString(16).padStart(2, "0")).toUpperCase();
}

export function hsvToHex(colour: Hsv): string {
    const h = ((colour.h % 360) + 360) % 360;
    const s = clamp01(colour.s), v = clamp01(colour.v);
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] =
        h < 60 ? [c, x, 0] :
        h < 120 ? [x, c, 0] :
        h < 180 ? [0, c, x] :
        h < 240 ? [0, x, c] :
        h < 300 ? [x, 0, c] : [c, 0, x];
    const part = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return ("#" + part(r) + part(g) + part(b)).toUpperCase();
}

/**
 * True when a fill is dark enough that dark text on it would be hard to read. A fill that is
 * more than half transparent is never counted as dark, because the page shows through it.
 */
export function isDark(colour: string): boolean {
    const clean = parseHex(colour);
    if (!clean) return false;
    if (splitColour(clean).transparency > 50) return false;
    const r = parseInt(clean.slice(1, 3), 16), g = parseInt(clean.slice(3, 5), 16), b = parseInt(clean.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Converts "#RRGGBB" (or any form `parseHex` accepts) to hue, saturation and brightness. Any opacity digits are ignored. */
export function hexToHsv(hex: string): Hsv {
    const clean = parseHex(hex) || "#000000";
    const r = parseInt(clean.slice(1, 3), 16) / 255;
    const g = parseInt(clean.slice(3, 5), 16) / 255;
    const b = parseInt(clean.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

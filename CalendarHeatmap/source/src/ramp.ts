"use strict";

// Builds a light-to-dark scale of one colour, from any colour you give it.
//
// The work is done in OKLCH, a way of describing colour by how light it looks, how strong it
// is and what hue it is. Stepping the lightness evenly there gives steps that look even, which
// stepping red, green and blue values does not. This is the same recipe that produced the
// built-in Green, Teal, Blue and Purple scales, so a custom colour behaves exactly as they do.

type Triple = [number, number, number];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** "#RRGGBB" (or "#RGB") as red, green and blue between 0 and 1; null if it is not a colour. */
function hexToRgb(hex: string): Triple | null {
    const text = (hex || "").trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : text);
    return long ? [parseInt(long[1], 16) / 255, parseInt(long[2], 16) / 255, parseInt(long[3], 16) / 255] : null;
}

/** Lightness, strength (chroma) and hue angle of a colour. */
function rgbToOklch(rgb: Triple): Triple {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function oklchToRgb(L: number, C: number, h: number): Triple {
    const A = C * Math.cos(h), B = C * Math.sin(h);
    const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
    const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
    const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

const displayable = (rgb: Triple): boolean => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** The colour at this lightness and hue, with as much of the wanted strength as a screen can show. */
function colourAt(L: number, C: number, h: number): string {
    let chroma = C;
    while (chroma > 0 && !displayable(oklchToRgb(L, chroma, h))) chroma -= 0.002;
    const channels = oklchToRgb(L, Math.max(0, chroma), h).map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255));
    return "#" + channels.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const STOPS = 7, LIGHTEST = 0.955, DARKEST = 0.34;

/**
 * Seven steps of the given colour's hue, light to dark: pale and nearly grey at the light end,
 * fullest in the upper middle, deep at the dark end. Returns null if the text is not a colour.
 */
export function rampFrom(hex: string): string[] | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const [, chroma, hue] = rgbToOklch(rgb);
    // A pastel still gives a scale with some colour in it; a grey stays grey.
    const strength = chroma < 0.03 ? chroma : Math.max(chroma, 0.07);
    const steps: string[] = [];
    for (let i = 0; i < STOPS; i++) {
        const t = i / (STOPS - 1);
        const L = LIGHTEST - t * (LIGHTEST - DARKEST);
        const C = strength * (0.16 + 0.94 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.78 + 0.08)), 1.1));
        steps.push(colourAt(L, C, hue));
    }
    return steps;
}

/** The colours behind the named choices in the Format pane. */
export const NAMED_COLOURS: { [name: string]: string } = {
    green: "#57B133",
    teal: "#0F938F",
    blue: "#2A78D6",
    purple: "#6250D6",
    pink: "#D6408F",
    red: "#C8283C",
    orange: "#EB6834",
    amber: "#EDA100",
    grey: "#898781",
};

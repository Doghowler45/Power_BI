"use strict";

import { interpolateLab, piecewise } from "d3-interpolate";

export interface Palette {
    /** Colours from the low end to the high end. */
    stops: string[];
    /** True for a scale with two poles around a neutral middle, for values above and below a midpoint. */
    twoSided: boolean;
}

/**
 * The built-in scales. Each single-hue ramp is one hue stepped evenly from light to dark in
 * OKLCH, so equal steps in the data look like equal steps in colour. The two-sided ramps meet
 * at a neutral grey, and their poles were checked to stay apart under simulated red-green
 * colour blindness (red to green fails that check, which is why it is not offered here).
 */
export const PALETTES: { [name: string]: Palette } = {
    green: { stops: ["#DBFCD1", "#A4E38F", "#70C750", "#43A905", "#338500", "#256302", "#1A4309"], twoSided: false },
    teal: { stops: ["#D5F9F6", "#97DEDA", "#57C2BD", "#07A39F", "#00817D", "#03605D", "#0B413F"], twoSided: false },
    blue: { stops: ["#E7F1FF", "#AFD1FF", "#74B0FF", "#378EF8", "#166ED0", "#0F529D", "#163863"], twoSided: false },
    purple: { stops: ["#EEEFFF", "#C7C9FE", "#A3A2FE", "#8377FE", "#6753E1", "#4C3DAA", "#332D6B"], twoSided: false },
    amber: { stops: ["#FEEDD7", "#FAC476", "#E79D08", "#BE8000", "#966506", "#704A02", "#4D3201"], twoSided: false },
    redBlue: { stops: ["#BA032D", "#EC676C", "#FEB7B5", "#F0EFEC", "#ADCFFC", "#5B9AEC", "#0260BF"], twoSided: true },
    redTeal: { stops: ["#BA032D", "#EC676C", "#FEB7B5", "#F0EFEC", "#ABD6D3", "#50A9A5", "#01726F"], twoSided: true },
};

/** A function from a position on the scale (0 = low end, 1 = high end) to a colour. */
export type Ramp = (position: number) => string;

export function buildRamp(palette: Palette, reverse: boolean): Ramp {
    const stops = reverse ? [...palette.stops].reverse() : palette.stops;
    const blend = piecewise(interpolateLab, stops.length > 1 ? stops : [stops[0], stops[0]]);
    return (position) => blend(Math.max(0, Math.min(1, position)));
}

/** Reads "#rrggbb" or "rgb(r, g, b)" into 0-255 channels. */
function channels(colour: string): [number, number, number] {
    const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim());
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
    const parts = colour.match(/[\d.]+/g);
    return parts && parts.length >= 3 ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : [255, 255, 255];
}

function luminance(colour: string): number {
    const [r, g, b] = channels(colour).map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LIGHT_INK = "#FFFFFF", DARK_INK = "#0B0B0B";

/** White or near-black, whichever reads better on the fill. */
export function inkOn(fill: string): string {
    const l = luminance(fill);
    const onWhite = 1.05 / (l + 0.05), onBlack = (l + 0.05) / 0.05;
    return onWhite >= onBlack ? LIGHT_INK : DARK_INK;
}

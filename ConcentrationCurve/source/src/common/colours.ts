"use strict";

import powerbi from "powerbi-visuals-api";

/** Text and chart-furniture colours. Text is always one of these, never a series colour. */
export const INK = "#0B0B0B";
export const INK_SECONDARY = "#52514E";
export const INK_MUTED = "#898781";
export const GRIDLINE = "#E1E0D9";
export const AXIS = "#C3C2B7";
export const SURFACE = "#FFFFFF";

/**
 * Colours for telling things apart, in a fixed order. The order matters: neighbours were
 * checked to stay distinguishable under red-green colour blindness. Things are given colours
 * in this order and keep them; a ninth thing does not get a ninth colour, it joins "Other".
 */
export const CATEGORICAL = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#6250D6", "#E34948"];
export const OTHER_COLOUR = "#B5B4AC";
export const OTHER_LABEL = "Other";

/** One hue, light to dark, for an ordered scale. */
export const RAMPS: { [name: string]: string[] } = {
    green: ["#DBFCD1", "#A4E38F", "#70C750", "#43A905", "#338500", "#256302", "#1A4309"],
    teal: ["#D5F9F6", "#97DEDA", "#57C2BD", "#07A39F", "#00817D", "#03605D", "#0B413F"],
    blue: ["#E7F1FF", "#AFD1FF", "#74B0FF", "#378EF8", "#166ED0", "#0F529D", "#163863"],
    purple: ["#EEEFFF", "#C7C9FE", "#A3A2FE", "#8377FE", "#6753E1", "#4C3DAA", "#332D6B"],
};

/** Up and down, for movements: blue and red stay apart for colour-blind readers; grey is no change. */
export const MOVEMENT = { up: "#166ED0", down: "#D03B3B", same: "#898781" };

export type ColourSource = "builtIn" | "theme";

/**
 * Gives each name a colour. Built-in: the fixed colour-blind-safe order, with everything past
 * the eighth sharing the "Other" grey. Theme: the report theme's own data colours, which stay
 * consistent with the report's other visuals but have not been checked the same way.
 */
export function assignColours(names: string[], source: ColourSource, palette: powerbi.extensibility.ISandboxExtendedColorPalette | undefined): Map<string, string> {
    const colours = new Map<string, string>();
    names.forEach((name, index) => {
        if (name === OTHER_LABEL) colours.set(name, OTHER_COLOUR);
        else if (source === "theme" && palette) colours.set(name, palette.getColor(name).value);
        else colours.set(name, index < CATEGORICAL.length ? CATEGORICAL[index] : OTHER_COLOUR);
    });
    return colours;
}

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

/** White or near-black, whichever reads better on the fill. */
export function inkOn(fill: string): string {
    const l = luminance(fill);
    return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#FFFFFF" : INK;
}

/** A colour with see-through-ness, for washes and ribbons. */
export function withOpacity(colour: string, opacity: number): string {
    const [r, g, b] = channels(colour);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

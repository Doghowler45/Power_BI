"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

const range = (min: number, max: number) => ({
    minValue: { type: powerbi.visuals.ValidatorType.Min as powerbi.visuals.ValidatorType.Min, value: min },
    maxValue: { type: powerbi.visuals.ValidatorType.Max as powerbi.visuals.ValidatorType.Max, value: max },
});

export const PALETTE_ITEMS: powerbi.IEnumMember[] = [
    { value: "green", displayName: "Green" },
    { value: "teal", displayName: "Teal" },
    { value: "blue", displayName: "Blue" },
    { value: "purple", displayName: "Purple" },
    { value: "amber", displayName: "Amber" },
    { value: "redBlue", displayName: "Red to blue (two-sided)" },
    { value: "redTeal", displayName: "Red to teal (two-sided)" },
    { value: "custom", displayName: "Custom" },
];

export const SCOPE_ITEMS: powerbi.IEnumMember[] = [
    { value: "all", displayName: "All cells" },
    { value: "row", displayName: "Each row" },
    { value: "column", displayName: "Each column" },
];

export const UNIT_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto" },
    { value: "none", displayName: "None" },
    { value: "thousands", displayName: "Thousands" },
    { value: "millions", displayName: "Millions" },
    { value: "billions", displayName: "Billions" },
];

export const SORT_ITEMS: powerbi.IEnumMember[] = [
    { value: "none", displayName: "Data order" },
    { value: "total", displayName: "Total, largest first" },
];

export const EMPTY_ITEMS: powerbi.IEnumMember[] = [
    { value: "hatch", displayName: "Hatched" },
    { value: "blank", displayName: "Blank" },
];

export const POSITION_ITEMS: powerbi.IEnumMember[] = [
    { value: "bottom", displayName: "Bottom" },
    { value: "top", displayName: "Top" },
];

class ColoursCard extends SimpleCard {
    palette = new formattingSettings.ItemDropdown({
        name: "palette",
        displayName: "Colour scale",
        description: "One colour, light to dark, for amounts. A two-sided scale for values above and below a midpoint, such as variances.",
        items: PALETTE_ITEMS,
        value: PALETTE_ITEMS[0],
    });

    reverse = new formattingSettings.ToggleSwitch({ name: "reverse", displayName: "Reverse", description: "Swaps the ends of the scale: for a measure where low is the strong result, or where below the midpoint is the good side.", value: false });

    midpoint = new formattingSettings.NumUpDown({ name: "midpoint", displayName: "Midpoint", description: "Two-sided scales: the value where the two colours meet. For a percentage, 0.05 means 5%.", value: 0 });

    scope = new formattingSettings.ItemDropdown({
        name: "scope",
        displayName: "Compare within",
        description: "All cells: one scale for the whole grid. Each row or each column: every row (or column) gets its own scale, which shows the pattern inside it when rows differ greatly in size.",
        items: SCOPE_ITEMS,
        value: SCOPE_ITEMS[0],
    });

    zeroBased = new formattingSettings.ToggleSwitch({ name: "zeroBased", displayName: "Start at zero", description: "One-colour scales. Off: the lightest colour is the smallest value. On: the lightest colour is zero.", value: false });

    customLow = new formattingSettings.ColorPicker({ name: "customLow", displayName: "Custom: low", value: { value: "#E7F0DA" } });
    customHigh = new formattingSettings.ColorPicker({ name: "customHigh", displayName: "Custom: high", value: { value: "#1C1C1B" } });
    customTwoSided = new formattingSettings.ToggleSwitch({ name: "customTwoSided", displayName: "Custom: two-sided", value: false });
    customMid = new formattingSettings.ColorPicker({ name: "customMid", displayName: "Custom: middle", value: { value: "#F0EFEC" } });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.palette, this.reverse, this.midpoint, this.scope, this.zeroBased, this.customLow, this.customHigh, this.customTwoSided, this.customMid];
}

class CellsCard extends SimpleCard {
    gap = new formattingSettings.NumUpDown({ name: "gap", displayName: "Gap (px)", value: 3, options: range(0, 12) });
    radius = new formattingSettings.NumUpDown({ name: "radius", displayName: "Rounded corners (px)", value: 6, options: range(0, 20) });
    maxHeight = new formattingSettings.NumUpDown({ name: "maxHeight", displayName: "Tallest row (px)", description: "Rows share the visual's height but never grow past this.", value: 56, options: range(8, 400) });

    empty = new formattingSettings.ItemDropdown({ name: "empty", displayName: "Cells with no data", description: "Hatched keeps \"no data\" apart from \"close to zero\". Blank suits a grid where most combinations do not exist.", items: EMPTY_ITEMS, value: EMPTY_ITEMS[0] });

    name: string = "cells";
    displayName: string = "Cells";
    slices: Array<Slice> = [this.gap, this.radius, this.maxHeight, this.empty];
}

class ValuesCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Values in cells", value: true });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(6, 30) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "values";
    displayName: string = "Values in cells";
    description: string = "Values are left off when the cells are too small for them. The units and decimal places also apply to the legend.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.fontSize, this.units, this.decimals];
}

class AxisCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(6, 30) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#52514E" } });
    sortRows = new formattingSettings.ItemDropdown({ name: "sortRows", displayName: "Order of rows", items: SORT_ITEMS, value: SORT_ITEMS[0] });
    sortColumns = new formattingSettings.ItemDropdown({ name: "sortColumns", displayName: "Order of columns", items: SORT_ITEMS, value: SORT_ITEMS[0] });

    name: string = "axis";
    displayName: string = "Row and column names";
    slices: Array<Slice> = [this.fontSize, this.color, this.sortRows, this.sortColumns];
}

class LegendCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Legend", value: true });
    position = new formattingSettings.ItemDropdown({ name: "position", displayName: "Position", items: POSITION_ITEMS, value: POSITION_ITEMS[0] });

    name: string = "legend";
    displayName: string = "Legend";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.position];
}

export class VisualFormattingSettingsModel extends Model {
    colours = new ColoursCard();
    cells = new CellsCard();
    values = new ValuesCard();
    axis = new AxisCard();
    legend = new LegendCard();

    cards = [this.colours, this.cells, this.values, this.axis, this.legend];
}

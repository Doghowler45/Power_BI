"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const SORT_ITEMS: powerbi.IEnumMember[] = [
    { value: "change", displayName: "Change, largest increase first" },
    { value: "percent", displayName: "Change %, largest increase first" },
    { value: "end", displayName: "Latest value, largest first" },
    { value: "none", displayName: "Data order" },
];

class RowsCard extends SimpleCard {
    sort = new formattingSettings.ItemDropdown({ name: "sort", displayName: "Order", items: SORT_ITEMS, value: SORT_ITEMS[0] });
    maxRows = new formattingSettings.NumUpDown({ name: "maxRows", displayName: "Most rows", description: "With more than this, the rows kept are the biggest movers (up or down), or the largest when ordering by value. The chart says how many are not shown.", value: 15, options: range(1, 200) });

    name: string = "rows";
    displayName: string = "Rows";
    slices: Array<Slice> = [this.sort, this.maxRows];
}

export const SCALE_ITEMS: powerbi.IEnumMember[] = [
    { value: "values", displayName: "The values" },
    { value: "percent", displayName: "Percentage change" },
];

class ComparisonCard extends SimpleCard {
    scale = new formattingSettings.ItemDropdown({ name: "scale", displayName: "Draw", description: "The values: each row runs from its earlier value to its later one. Percentage change: every row starts from the same line, which shows the movement when the rows differ greatly in size.", items: SCALE_ITEMS, value: SCALE_ITEMS[0] });
    higherIsWorse = new formattingSettings.ToggleSwitch({ name: "higherIsWorse", displayName: "Higher is worse", description: "Switch on for costs and other measures where an increase is bad news. It swaps the blue and red.", value: false });

    name: string = "comparison";
    displayName: string = "Comparison";
    slices: Array<Slice> = [this.scale, this.higherIsWorse];
}

class LabelsCard extends SimpleCard {
    percent = new formattingSettings.ToggleSwitch({ name: "percent", displayName: "Change as a percentage too", value: true });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Text and numbers";
    slices: Array<Slice> = [this.percent, this.fontSize, this.units, this.decimals];
}

export class VisualFormattingSettingsModel extends Model {
    rows = new RowsCard();
    comparison = new ComparisonCard();
    labels = new LabelsCard();

    cards = [this.rows, this.comparison, this.labels];
}

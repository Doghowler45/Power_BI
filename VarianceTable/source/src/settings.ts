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

export const UNIT_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto" },
    { value: "none", displayName: "None" },
    { value: "thousands", displayName: "Thousands" },
    { value: "millions", displayName: "Millions" },
    { value: "billions", displayName: "Billions" },
];

class ColumnsCard extends SimpleCard {
    plan = new formattingSettings.ToggleSwitch({ name: "plan", displayName: "Compare with plan", description: "Shown when a measure is in Plan.", value: true });
    previousYear = new formattingSettings.ToggleSwitch({ name: "previousYear", displayName: "Compare with previous year", description: "Shown when a measure is in Previous year.", value: true });
    absolute = new formattingSettings.ToggleSwitch({ name: "absolute", displayName: "Variance columns", value: true });
    relative = new formattingSettings.ToggleSwitch({ name: "relative", displayName: "Variance % columns", value: true });
    bars = new formattingSettings.ToggleSwitch({ name: "bars", displayName: "Charts in cells", description: "Draws each variance as a small bar beside its number. Off: the numbers are coloured green or red instead.", value: true });
    comments = new formattingSettings.ToggleSwitch({ name: "comments", displayName: "Comment column", description: "Shown when a measure is in Comment.", value: true });

    name: string = "columns";
    displayName: string = "Columns";
    slices: Array<Slice> = [this.plan, this.previousYear, this.absolute, this.relative, this.bars, this.comments];
}

class ComparisonCard extends SimpleCard {
    higherIsWorse = new formattingSettings.ToggleSwitch({
        name: "higherIsWorse",
        displayName: "Higher is worse",
        description: "Switch on for costs and other measures where an increase is bad news. It swaps the green and red.",
        value: false,
    });

    name: string = "comparison";
    displayName: string = "Good and bad";
    slices: Array<Slice> = [this.higherIsWorse];
}

class TotalsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Total row", value: true });
    label = new formattingSettings.TextInput({ name: "label", displayName: "Label", value: "Total", placeholder: "Total" });

    name: string = "totals";
    displayName: string = "Total row";
    description: string = "The sum of the rows. Switch it off for measures that do not add up, such as prices or percentages.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.label];
}

class NumbersCard extends SimpleCard {
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "numbers";
    displayName: string = "Numbers";
    slices: Array<Slice> = [this.units, this.decimals];
}

class TextCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 11, options: range(7, 24) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#1C1C1B" } });
    headerColor = new formattingSettings.ColorPicker({ name: "headerColor", displayName: "Heading colour", value: { value: "#1C1C1B" } });

    name: string = "text";
    displayName: string = "Text";
    slices: Array<Slice> = [this.fontSize, this.color, this.headerColor];
}

class GridCard extends SimpleCard {
    rowPadding = new formattingSettings.NumUpDown({ name: "rowPadding", displayName: "Row padding (px)", value: 5, options: range(0, 20) });
    lines = new formattingSettings.ToggleSwitch({ name: "lines", displayName: "Lines between rows", value: true });
    lineColor = new formattingSettings.ColorPicker({ name: "lineColor", displayName: "Line colour", value: { value: "#E3E3DF" } });

    name: string = "grid";
    displayName: string = "Rows";
    slices: Array<Slice> = [this.rowPadding, this.lines, this.lineColor];
}

class ColoursCard extends SimpleCard {
    actual = new formattingSettings.ColorPicker({ name: "actual", displayName: "Actual", value: { value: "#404040" } });
    previousYear = new formattingSettings.ColorPicker({ name: "previousYear", displayName: "Previous year", value: { value: "#A6A6A6" } });
    good = new formattingSettings.ColorPicker({ name: "good", displayName: "Good variance", value: { value: "#57B133" } });
    bad = new formattingSettings.ColorPicker({ name: "bad", displayName: "Bad variance", value: { value: "#C8283C" } });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.actual, this.previousYear, this.good, this.bad];
}

/** Where the sort chosen by clicking a heading is saved. It has no entry in the format pane. */
class SortStateCard extends SimpleCard {
    column = new formattingSettings.TextInput({ name: "column", displayName: "Column", value: "", placeholder: "" });
    direction = new formattingSettings.TextInput({ name: "direction", displayName: "Direction", value: "desc", placeholder: "" });

    name: string = "sortState";
    displayName: string = "Sort";
    visible: boolean = false;
    slices: Array<Slice> = [this.column, this.direction];
}

export class VisualFormattingSettingsModel extends Model {
    columns = new ColumnsCard();
    comparison = new ComparisonCard();
    totals = new TotalsCard();
    numbers = new NumbersCard();
    text = new TextCard();
    grid = new GridCard();
    colours = new ColoursCard();
    sortState = new SortStateCard();

    cards = [this.columns, this.comparison, this.totals, this.numbers, this.text, this.grid, this.colours, this.sortState];
}

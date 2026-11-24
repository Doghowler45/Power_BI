"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

class ColumnsCard extends SimpleCard {
    absolute = new formattingSettings.ToggleSwitch({ name: "absolute", displayName: "Variance columns", value: true });
    relative = new formattingSettings.ToggleSwitch({ name: "relative", displayName: "Variance % columns", value: true });
    bars = new formattingSettings.ToggleSwitch({ name: "bars", displayName: "Charts in cells", description: "Draws each variance as a small bar beside its number. Off: the numbers are coloured green or red instead.", value: true });

    name: string = "columns";
    displayName: string = "Columns";
    description: string = "Plan and previous-year columns appear when those fields have a measure.";
    slices: Array<Slice> = [this.absolute, this.relative, this.bars];
}

class NumbersCard extends SimpleCard {
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });
    brackets = new formattingSettings.ToggleSwitch({ name: "brackets", displayName: "Negatives in brackets", description: "Writes a loss as (1.2M), as accounts do, in place of a minus sign.", value: true });

    name: string = "numbers";
    displayName: string = "Numbers";
    slices: Array<Slice> = [this.units, this.decimals, this.brackets];
}

class TextCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 12, options: range(7, 24) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#1C1C1B" } });

    name: string = "text";
    displayName: string = "Text";
    slices: Array<Slice> = [this.fontSize, this.color];
}

class RowsCard extends SimpleCard {
    padding = new formattingSettings.NumUpDown({ name: "padding", displayName: "Row padding (px)", value: 5, options: range(0, 20) });
    lines = new formattingSettings.ToggleSwitch({ name: "lines", displayName: "Lines between rows", value: false });

    name: string = "rows";
    displayName: string = "Rows";
    slices: Array<Slice> = [this.padding, this.lines];
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

export class VisualFormattingSettingsModel extends Model {
    columns = new ColumnsCard();
    numbers = new NumbersCard();
    text = new TextCard();
    rows = new RowsCard();
    colours = new ColoursCard();

    cards = [this.columns, this.numbers, this.text, this.rows, this.colours];
}

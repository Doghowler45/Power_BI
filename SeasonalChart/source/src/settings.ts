"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const MODE_ITEMS: powerbi.IEnumMember[] = [
    { value: "monthly", displayName: "Each month" },
    { value: "cumulative", displayName: "Running total through the year" },
];

class LinesCard extends SimpleCard {
    mode = new formattingSettings.ItemDropdown({ name: "mode", displayName: "Show", description: "Each month's own value, or the year building up month by month.", items: MODE_ITEMS, value: MODE_ITEMS[0] });
    band = new formattingSettings.ToggleSwitch({ name: "band", displayName: "Range of earlier years", description: "Shades the range the earlier years span, so the latest year can be seen against what is usual. Needs at least two earlier years.", value: true });
    zero = new formattingSettings.ToggleSwitch({ name: "zero", displayName: "Start at zero", description: "Off: the scale fits the values, which shows the seasonal shape more clearly. A running total always starts at zero.", value: false });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Latest year", description: "The colour of the latest year's line. Earlier years are grey.", value: { value: "#2A78D6" } });

    name: string = "lines";
    displayName: string = "Lines";
    slices: Array<Slice> = [this.mode, this.band, this.zero, this.color];
}

class LabelsCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Text and numbers";
    slices: Array<Slice> = [this.fontSize, this.units, this.decimals];
}

export class VisualFormattingSettingsModel extends Model {
    lines = new LinesCard();
    labels = new LabelsCard();

    cards = [this.lines, this.labels];
}

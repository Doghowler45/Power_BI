"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const HUE_ITEMS: powerbi.IEnumMember[] = [
    { value: "green", displayName: "Green" },
    { value: "teal", displayName: "Teal" },
    { value: "blue", displayName: "Blue" },
    { value: "purple", displayName: "Purple" },
];

export const SORT_ITEMS: powerbi.IEnumMember[] = [
    { value: "median", displayName: "Median, highest first" },
    { value: "none", displayName: "Data order" },
];

class BoxesCard extends SimpleCard {
    sort = new formattingSettings.ItemDropdown({ name: "sort", displayName: "Order of groups", items: SORT_ITEMS, value: SORT_ITEMS[0] });
    points = new formattingSettings.ToggleSwitch({ name: "points", displayName: "Show every point", description: "A dot for each point, over the box. Left off when the rows are too thin.", value: true });
    hue = new formattingSettings.ItemDropdown({ name: "hue", displayName: "Colour", items: HUE_ITEMS, value: HUE_ITEMS[2] });

    name: string = "boxes";
    displayName: string = "Boxes and points";
    slices: Array<Slice> = [this.sort, this.points, this.hue];
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
    boxes = new BoxesCard();
    labels = new LabelsCard();

    cards = [this.boxes, this.labels];
}

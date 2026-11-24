"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const SOURCE_ITEMS: powerbi.IEnumMember[] = [
    { value: "builtIn", displayName: "Built-in (colour-blind safe)" },
    { value: "theme", displayName: "Report theme" },
];

export const BY_ITEMS: powerbi.IEnumMember[] = [
    { value: "first", displayName: "First stage" },
    { value: "last", displayName: "Last stage" },
];

class LayoutCard extends SimpleCard {
    maxNodes = new formattingSettings.NumUpDown({ name: "maxNodes", displayName: "Most nodes in a stage", description: "With more than this, the smallest are pooled into one \"Other\" node.", value: 8, options: range(2, 30) });
    nodeWidth = new formattingSettings.NumUpDown({ name: "nodeWidth", displayName: "Node width (px)", value: 12, options: range(4, 40) });
    nodeGap = new formattingSettings.NumUpDown({ name: "nodeGap", displayName: "Gap between nodes (px)", value: 10, options: range(0, 40) });

    name: string = "layout";
    displayName: string = "Nodes";
    slices: Array<Slice> = [this.maxNodes, this.nodeWidth, this.nodeGap];
}

class ColoursCard extends SimpleCard {
    by = new formattingSettings.ItemDropdown({ name: "by", displayName: "Colour flows by", description: "Each flow keeps the colour of where it starts (first stage) or where it ends (last stage) all the way across, so it can be followed.", items: BY_ITEMS, value: BY_ITEMS[0] });
    source = new formattingSettings.ItemDropdown({ name: "source", displayName: "Colours", items: SOURCE_ITEMS, value: SOURCE_ITEMS[0] });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.by, this.source];
}

class LabelsCard extends SimpleCard {
    values = new formattingSettings.ToggleSwitch({ name: "values", displayName: "Values beside names", value: true });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Text and numbers";
    slices: Array<Slice> = [this.values, this.fontSize, this.units, this.decimals];
}

export class VisualFormattingSettingsModel extends Model {
    layout = new LayoutCard();
    colours = new ColoursCard();
    labels = new LabelsCard();

    cards = [this.layout, this.colours, this.labels];
}

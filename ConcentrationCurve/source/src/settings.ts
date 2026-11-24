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

class BandsCard extends SimpleCard {
    aThreshold = new formattingSettings.NumUpDown({ name: "aThreshold", displayName: "A ends at (%)", description: "A is the items that together reach this share of the total.", value: 80, options: range(1, 99) });
    bThreshold = new formattingSettings.NumUpDown({ name: "bThreshold", displayName: "B ends at (%)", description: "B is the next items, up to this share. C is everything after.", value: 95, options: range(1, 100) });
    labels = new formattingSettings.ToggleSwitch({ name: "labels", displayName: "Band labels", value: true });
    hue = new formattingSettings.ItemDropdown({ name: "hue", displayName: "Colour", description: "The bands are three depths of this colour. Anything below zero is red.", items: HUE_ITEMS, value: HUE_ITEMS[0] });

    name: string = "bands";
    displayName: string = "Bands";
    slices: Array<Slice> = [this.aThreshold, this.bThreshold, this.labels, this.hue];
}

class CalloutCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Top call-out", value: true });
    count = new formattingSettings.NumUpDown({ name: "count", displayName: "How many", description: "Marks the share of the total held by this many of the largest items. Used when each row is one item.", value: 10, options: range(1, 100000) });
    percent = new formattingSettings.NumUpDown({ name: "percent", displayName: "What percentage (grouped data)", description: "Used when a measure is in Count: marks the share of the total held by this percentage of the items, such as the top 10% of customers.", value: 10, options: range(0.01, 99.9) });

    name: string = "callout";
    displayName: string = "Top call-out";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.count, this.percent];
}

class BarsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Values chart", value: true });

    name: string = "bars";
    displayName: string = "Values chart";
    description: string = "The second chart, underneath: each item's own value, in the same order. It is left off when the visual is too short for both.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [];
}

class LabelsCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });
    noun = new formattingSettings.TextInput({ name: "noun", displayName: "What the items are called", description: "Used in labels, such as \"6 customers\". Left blank, it is taken from the field's name.", value: "", placeholder: "customers" });

    name: string = "labels";
    displayName: string = "Text and numbers";
    slices: Array<Slice> = [this.fontSize, this.units, this.decimals, this.noun];
}

export class VisualFormattingSettingsModel extends Model {
    bands = new BandsCard();
    callout = new CalloutCard();
    bars = new BarsCard();
    labels = new LabelsCard();

    cards = [this.bands, this.callout, this.bars, this.labels];
}

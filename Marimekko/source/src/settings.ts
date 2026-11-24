"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const SORT_ITEMS: powerbi.IEnumMember[] = [
    { value: "total", displayName: "Largest first" },
    { value: "none", displayName: "Data order" },
];

export const SOURCE_ITEMS: powerbi.IEnumMember[] = [
    { value: "builtIn", displayName: "Built-in (colour-blind safe)" },
    { value: "theme", displayName: "Report theme" },
];

export const CONTENT_ITEMS: powerbi.IEnumMember[] = [
    { value: "share", displayName: "Share of column" },
    { value: "value", displayName: "Value" },
];

class LayoutCard extends SimpleCard {
    sortColumns = new formattingSettings.ItemDropdown({ name: "sortColumns", displayName: "Order of columns", items: SORT_ITEMS, value: SORT_ITEMS[0] });
    maxSegments = new formattingSettings.NumUpDown({ name: "maxSegments", displayName: "Most segments", description: "With more than this, the smallest are pooled into one \"Other\" segment. Eight is the most colours that stay easy to tell apart.", value: 7, options: range(2, 8) });
    maxColumns = new formattingSettings.NumUpDown({ name: "maxColumns", displayName: "Most columns", description: "With more than this, the smallest are pooled into one \"Other\" column, so there are no slivers too thin to read.", value: 10, options: range(2, 40) });
    gap = new formattingSettings.NumUpDown({ name: "gap", displayName: "Gap (px)", value: 2, options: range(0, 8) });

    name: string = "layout";
    displayName: string = "Columns and segments";
    slices: Array<Slice> = [this.sortColumns, this.maxColumns, this.maxSegments, this.gap];
}

class ColoursCard extends SimpleCard {
    source = new formattingSettings.ItemDropdown({ name: "source", displayName: "Colours", description: "Built-in colours were checked to stay apart for colour-blind readers. Report theme uses your theme's colours, to match the report's other visuals.", items: SOURCE_ITEMS, value: SOURCE_ITEMS[0] });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.source];
}

class LabelsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Labels in segments", value: true });
    content = new formattingSettings.ItemDropdown({ name: "content", displayName: "Show", items: CONTENT_ITEMS, value: CONTENT_ITEMS[0] });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Labels";
    description: string = "A label is left off any segment too small for it. Text size, units and decimal places also apply to the column totals and names.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.content, this.fontSize, this.units, this.decimals];
}

class LegendCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Legend", value: true });

    name: string = "legend";
    displayName: string = "Legend";
    topLevelSlice = this.show;
    slices: Array<Slice> = [];
}

export class VisualFormattingSettingsModel extends Model {
    layout = new LayoutCard();
    colours = new ColoursCard();
    labels = new LabelsCard();
    legend = new LegendCard();

    cards = [this.layout, this.colours, this.labels, this.legend];
}

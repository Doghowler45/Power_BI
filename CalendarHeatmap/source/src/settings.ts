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

export const SCOPE_ITEMS: powerbi.IEnumMember[] = [
    { value: "all", displayName: "All months" },
    { value: "year", displayName: "Each year" },
];

class CalendarCard extends SimpleCard {
    firstMonth = new formattingSettings.NumUpDown({ name: "firstMonth", displayName: "Year starts in month", description: "1 for January (calendar years). For a financial year that runs July to June, 7; the rows are then labelled 2025/26.", value: 1, options: range(1, 12) });
    newestFirst = new formattingSettings.ToggleSwitch({ name: "newestFirst", displayName: "Latest year at the top", value: true });
    totals = new formattingSettings.ToggleSwitch({ name: "totals", displayName: "Year totals and change", description: "Each year's total, and its change on the year before over the months both years have.", value: true });

    name: string = "calendar";
    displayName: string = "Calendar";
    slices: Array<Slice> = [this.firstMonth, this.newestFirst, this.totals];
}

class ColoursCard extends SimpleCard {
    hue = new formattingSettings.ItemDropdown({ name: "hue", displayName: "Colour", items: HUE_ITEMS, value: HUE_ITEMS[0] });
    scope = new formattingSettings.ItemDropdown({ name: "scope", displayName: "Compare within", description: "All months: one scale, so growth from year to year shows as darker rows. Each year: every year has its own scale, which shows the seasonal shape even when the years differ in size.", items: SCOPE_ITEMS, value: SCOPE_ITEMS[0] });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.hue, this.scope];
}

class LabelsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Values in cells", value: true });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Values in cells";
    description: string = "Values drop decimal places to fit, and are left off when the cells are too small. Text size, units and decimal places also apply to the totals.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.fontSize, this.units, this.decimals];
}

export class VisualFormattingSettingsModel extends Model {
    calendar = new CalendarCard();
    colours = new ColoursCard();
    labels = new LabelsCard();

    cards = [this.calendar, this.colours, this.labels];
}

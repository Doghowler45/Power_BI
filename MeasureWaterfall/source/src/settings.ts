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

class BarsCard extends SimpleCard {
    increaseColor = new formattingSettings.ColorPicker({
        name: "increaseColor",
        displayName: "Increase",
        value: { value: "#57B133" },
    });

    decreaseColor = new formattingSettings.ColorPicker({
        name: "decreaseColor",
        displayName: "Decrease",
        value: { value: "#B3202A" },
    });

    baseColor = new formattingSettings.ColorPicker({
        name: "baseColor",
        displayName: "Base",
        value: { value: "#1C1C1B" },
    });

    totalColor = new formattingSettings.ColorPicker({
        name: "totalColor",
        displayName: "Total",
        value: { value: "#0F938F" },
    });

    gap = new formattingSettings.NumUpDown({
        name: "gap",
        displayName: "Gap between bars (%)",
        value: 35,
        options: range(0, 80),
    });

    cornerRadius = new formattingSettings.NumUpDown({
        name: "cornerRadius",
        displayName: "Rounded corners (px)",
        description: "How rounded the bar corners are. 0 gives square corners.",
        value: 4,
        options: range(0, 20),
    });

    connectors = new formattingSettings.ToggleSwitch({
        name: "connectors",
        displayName: "Connector lines",
        value: true,
    });

    name: string = "bars";
    displayName: string = "Bars";
    slices: Array<Slice> = [this.increaseColor, this.decreaseColor, this.baseColor, this.totalColor, this.gap, this.cornerRadius, this.connectors];
}

class TotalCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true,
    });

    label = new formattingSettings.TextInput({
        name: "label",
        displayName: "Label",
        value: "Total",
        placeholder: "Total",
    });

    name: string = "total";
    displayName: string = "Total bar";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.label];
}

/**
 * One switch per measure in the Steps well. The switches are created in the visual's update,
 * because the list of measures is only known once data arrives.
 */
class SubtotalsCard extends SimpleCard {
    name: string = "stepType";
    displayName: string = "Subtotal bars";
    description: string = "Switch on a step to draw it as a subtotal bar, for example a later year's result. The steps after it continue from that bar.";
    slices: Array<Slice> = [];
}

class LabelsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true,
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text size",
        value: 11,
        options: range(6, 40),
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Colour",
        value: { value: "#1C1C1B" },
    });

    units = new formattingSettings.ItemDropdown({
        name: "units",
        displayName: "Display units",
        items: UNIT_ITEMS,
        value: UNIT_ITEMS[0],
    });

    decimals = new formattingSettings.NumUpDown({
        name: "decimals",
        displayName: "Decimal places",
        value: 1,
        options: range(0, 4),
    });

    signed = new formattingSettings.ToggleSwitch({
        name: "signed",
        displayName: "Plus sign on increases",
        value: true,
    });

    name: string = "labels";
    displayName: string = "Value labels";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.fontSize, this.color, this.units, this.decimals, this.signed];
}

class CategoryCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text size",
        value: 10,
        options: range(6, 30),
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Colour",
        value: { value: "#1C1C1B" },
    });

    name: string = "category";
    displayName: string = "Bar names";
    slices: Array<Slice> = [this.fontSize, this.color];
}

class AxisCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show values and gridlines",
        value: false,
    });

    startAtZero = new formattingSettings.ToggleSwitch({
        name: "startAtZero",
        displayName: "Start at zero",
        value: true,
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Line colour",
        value: { value: "#8A8A86" },
    });

    name: string = "axis";
    displayName: string = "Value axis";
    slices: Array<Slice> = [this.show, this.startAtZero, this.color];
}

export class VisualFormattingSettingsModel extends Model {
    bars = new BarsCard();
    total = new TotalCard();
    subtotals = new SubtotalsCard();
    labels = new LabelsCard();
    category = new CategoryCard();
    axis = new AxisCard();

    cards = [this.bars, this.subtotals, this.total, this.labels, this.category, this.axis];
}

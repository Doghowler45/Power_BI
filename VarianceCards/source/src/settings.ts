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

export const HEADLINE_ITEMS: powerbi.IEnumMember[] = [
    { value: "sum", displayName: "Sum of periods" },
    { value: "last", displayName: "Latest period" },
    { value: "average", displayName: "Average of periods" },
];

class CardsCard extends SimpleCard {
    perRow = new formattingSettings.NumUpDown({
        name: "perRow",
        displayName: "Cards per row",
        description: "0 fits as many as there is room for.",
        value: 0,
        options: range(0, 12),
    });

    headline = new formattingSettings.ItemDropdown({
        name: "headline",
        displayName: "Headline figure",
        description: "Used when a field is in Trend. Only periods that have an actual are counted, for the actual and for what it is compared with.",
        items: HEADLINE_ITEMS,
        value: HEADLINE_ITEMS[0],
    });

    sparkline = new formattingSettings.ToggleSwitch({ name: "sparkline", displayName: "Trend chart", description: "Shown when a field is in Trend and the card is tall enough.", value: true });
    border = new formattingSettings.ToggleSwitch({ name: "border", displayName: "Border", value: true });
    background = new formattingSettings.ColorPicker({ name: "background", displayName: "Background", value: { value: "#FFFFFF" } });

    name: string = "cards";
    displayName: string = "Cards";
    slices: Array<Slice> = [this.perRow, this.headline, this.sparkline, this.border, this.background];
}

/**
 * One switch per measure in Actual. The switches are created in the visual's update,
 * because the list of measures is only known once data arrives.
 */
class DirectionCard extends SimpleCard {
    name: string = "direction";
    displayName: string = "Higher is worse";
    description: string = "Switch on for costs and other measures where an increase is bad news. It swaps the green and red on that card.";
    slices: Array<Slice> = [];
}

class NumbersCard extends SimpleCard {
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", description: "Auto picks a unit for each card from the size of its figure.", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "numbers";
    displayName: string = "Numbers";
    slices: Array<Slice> = [this.units, this.decimals];
}

class TextCard extends SimpleCard {
    valueSize = new formattingSettings.NumUpDown({ name: "valueSize", displayName: "Headline size", value: 24, options: range(10, 60) });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 11, options: range(7, 24) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#1C1C1B" } });

    name: string = "text";
    displayName: string = "Text";
    slices: Array<Slice> = [this.valueSize, this.fontSize, this.color];
}

class ColoursCard extends SimpleCard {
    actual = new formattingSettings.ColorPicker({ name: "actual", displayName: "Actual", value: { value: "#404040" } });
    good = new formattingSettings.ColorPicker({ name: "good", displayName: "Good variance", value: { value: "#57B133" } });
    bad = new formattingSettings.ColorPicker({ name: "bad", displayName: "Bad variance", value: { value: "#C8283C" } });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.actual, this.good, this.bad];
}

export class VisualFormattingSettingsModel extends Model {
    cardsCard = new CardsCard();
    direction = new DirectionCard();
    numbers = new NumbersCard();
    text = new TextCard();
    colours = new ColoursCard();

    cards = [this.cardsCard, this.direction, this.numbers, this.text, this.colours];
}

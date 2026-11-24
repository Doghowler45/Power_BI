"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

const SCENARIO_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto (plan, else previous year)" },
    { value: "pl", displayName: "Plan" },
    { value: "py", displayName: "Previous year" },
];

class ComparisonCard extends SimpleCard {
    scenario = new formattingSettings.ItemDropdown({ name: "scenario", displayName: "Compare with", description: "What each driver's change is measured against.", items: SCENARIO_ITEMS, value: SCENARIO_ITEMS[0] });

    name: string = "comparison";
    displayName: string = "Comparison";
    slices: Array<Slice> = [this.scenario];
}

class CardsCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 20) });
    valueSize = new formattingSettings.NumUpDown({ name: "valueSize", displayName: "Value size (px)", value: 16, options: range(9, 32) });
    bars = new formattingSettings.ToggleSwitch({ name: "bars", displayName: "Change bars", description: "A small bar on each card for its percentage change, all on one scale, so the driver that moved most stands out.", value: true });

    name: string = "cards";
    displayName: string = "Cards";
    slices: Array<Slice> = [this.fontSize, this.valueSize, this.bars];
}

class NumbersCard extends SimpleCard {
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", description: "Auto picks a unit for each driver, since a tree mixes large amounts with prices and rates.", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "numbers";
    displayName: string = "Numbers";
    slices: Array<Slice> = [this.units, this.decimals];
}

class ColoursCard extends SimpleCard {
    good = new formattingSettings.ColorPicker({ name: "good", displayName: "Good change", value: { value: "#57B133" } });
    bad = new formattingSettings.ColorPicker({ name: "bad", displayName: "Bad change", value: { value: "#C8283C" } });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.good, this.bad];
}

export class VisualFormattingSettingsModel extends Model {
    comparison = new ComparisonCard();
    cardsCard = new CardsCard();
    numbers = new NumbersCard();
    colours = new ColoursCard();

    cards = [this.comparison, this.cardsCard, this.numbers, this.colours];
}

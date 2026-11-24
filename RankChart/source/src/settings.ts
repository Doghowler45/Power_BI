"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const MODE_ITEMS: powerbi.IEnumMember[] = [
    { value: "movement", displayName: "Movement (up, down, same)" },
    { value: "entity", displayName: "One colour each" },
];

export const SOURCE_ITEMS: powerbi.IEnumMember[] = [
    { value: "builtIn", displayName: "Built-in (colour-blind safe)" },
    { value: "theme", displayName: "Report theme" },
];

class RankingCard extends SimpleCard {
    topCount = new formattingSettings.NumUpDown({ name: "topCount", displayName: "Places shown", description: "Anything that makes these places in at least one period gets a line. Lower places share one row at the bottom.", value: 10, options: range(1, 50) });
    lowestFirst = new formattingSettings.ToggleSwitch({ name: "lowestFirst", displayName: "Lowest value ranks first", description: "For measures where smaller is better, such as cost or days to pay.", value: false });

    name: string = "ranking";
    displayName: string = "Ranking";
    slices: Array<Slice> = [this.topCount, this.lowestFirst];
}

class ColoursCard extends SimpleCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "Colour by",
        description: "Movement: blue for lines that finish higher than they started, red for lower, grey for no change. One colour each: the first eight get their own colour and the rest are grey.",
        items: MODE_ITEMS,
        value: MODE_ITEMS[0],
    });

    source = new formattingSettings.ItemDropdown({ name: "source", displayName: "Colours for \"one colour each\"", items: SOURCE_ITEMS, value: SOURCE_ITEMS[0] });

    name: string = "colours";
    displayName: string = "Colours";
    slices: Array<Slice> = [this.mode, this.source];
}

class LabelsCard extends SimpleCard {
    values = new formattingSettings.ToggleSwitch({ name: "values", displayName: "Values beside names", description: "The last period's value, after each name on the right.", value: true });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 11, options: range(7, 24) });
    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });
    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Text and numbers";
    slices: Array<Slice> = [this.values, this.fontSize, this.units, this.decimals];
}

export class VisualFormattingSettingsModel extends Model {
    ranking = new RankingCard();
    colours = new ColoursCard();
    labels = new LabelsCard();

    cards = [this.ranking, this.colours, this.labels];
}

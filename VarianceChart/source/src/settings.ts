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

export const SCENARIO_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto (plan, else previous year)" },
    { value: "pl", displayName: "Plan" },
    { value: "py", displayName: "Previous year" },
    { value: "fc", displayName: "Forecast" },
];

export const ORIENTATION_ITEMS: powerbi.IEnumMember[] = [
    { value: "columns", displayName: "Columns (over time)" },
    { value: "bars", displayName: "Bars (by category)" },
];

export const CHART_TYPE_ITEMS: powerbi.IEnumMember[] = [
    { value: "variance", displayName: "Variance charts" },
    { value: "waterfall", displayName: "Waterfall (bridge)" },
];

export const GROUP_MODE_ITEMS: powerbi.IEnumMember[] = [
    { value: "multiples", displayName: "Small multiples" },
    { value: "stacked", displayName: "Stacked" },
];

export const SORT_FIELD_ITEMS: powerbi.IEnumMember[] = [
    { value: "none", displayName: "Data order" },
    { value: "value", displayName: "Actual" },
    { value: "delta", displayName: "Variance" },
    { value: "deltaPercent", displayName: "Variance %" },
];

export const SORT_DIRECTION_ITEMS: powerbi.IEnumMember[] = [
    { value: "desc", displayName: "Largest first" },
    { value: "asc", displayName: "Smallest first" },
];

export const UNIT_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto" },
    { value: "none", displayName: "None" },
    { value: "thousands", displayName: "Thousands" },
    { value: "millions", displayName: "Millions" },
    { value: "billions", displayName: "Billions" },
];

class ComparisonCard extends SimpleCard {
    scenario = new formattingSettings.ItemDropdown({
        name: "scenario",
        displayName: "Compare actual with",
        description: "Which measure the variance is worked out against. Auto uses Plan if there is one, otherwise Previous year.",
        items: SCENARIO_ITEMS,
        value: SCENARIO_ITEMS[0],
    });

    higherIsWorse = new formattingSettings.ToggleSwitch({
        name: "higherIsWorse",
        displayName: "Higher is worse",
        description: "Switch on for costs and other measures where an increase is bad news. It swaps the green and red.",
        value: false,
    });

    name: string = "comparison";
    displayName: string = "Comparison";
    slices: Array<Slice> = [this.scenario, this.higherIsWorse];
}

class LayoutCard extends SimpleCard {
    chartType = new formattingSettings.ItemDropdown({
        name: "chartType",
        displayName: "Chart",
        description: "Variance charts show each category against its comparison. Waterfall walks from the comparison total to the actual total, one category at a time.",
        items: CHART_TYPE_ITEMS,
        value: CHART_TYPE_ITEMS[0],
    });

    orientation = new formattingSettings.ItemDropdown({
        name: "orientation",
        displayName: "Direction",
        description: "Columns suit periods of time. Bars suit lists such as divisions, products or cost lines.",
        items: ORIENTATION_ITEMS,
        value: ORIENTATION_ITEMS[0],
    });

    absolute = new formattingSettings.ToggleSwitch({
        name: "absolute",
        displayName: "Variance chart",
        description: "Shows the difference between actual and the comparison as green and red bars.",
        value: true,
    });

    relative = new formattingSettings.ToggleSwitch({
        name: "relative",
        displayName: "Variance % chart",
        description: "Shows the same difference as a percentage of the comparison.",
        value: true,
    });

    name: string = "layout";
    displayName: string = "Layout";
    slices: Array<Slice> = [this.chartType, this.orientation, this.absolute, this.relative];
}

class GroupsCard extends SimpleCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "Show groups as",
        description: "Small multiples draws one small chart per group. Stacked draws one chart with the groups stacked inside each bar.",
        items: GROUP_MODE_ITEMS,
        value: GROUP_MODE_ITEMS[0],
    });

    sameScale = new formattingSettings.ToggleSwitch({
        name: "sameScale",
        displayName: "Same scale for all",
        description: "Small multiples only. On: every small chart uses one scale, so bar lengths can be compared between them. Off: each chart fills its own space.",
        value: true,
    });

    name: string = "groups";
    displayName: string = "Groups";
    description: string = "Used when a field is in Group.";
    slices: Array<Slice> = [this.mode, this.sameScale];
}

class TotalsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Total", value: false });

    label = new formattingSettings.TextInput({ name: "label", displayName: "Label", value: "Total", placeholder: "Total" });

    name: string = "totals";
    displayName: string = "Total";
    description: string = "Adds a total after the last category: the sum of the categories. Leave it off for measures that do not add up, such as prices or percentages.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.label];
}

class SortCard extends SimpleCard {
    field = new formattingSettings.ItemDropdown({
        name: "field",
        displayName: "Sort by",
        description: "You can also click a chart title (AC, the variance or the variance %) to sort by it.",
        items: SORT_FIELD_ITEMS,
        value: SORT_FIELD_ITEMS[0],
    });

    direction = new formattingSettings.ItemDropdown({ name: "direction", displayName: "Order", items: SORT_DIRECTION_ITEMS, value: SORT_DIRECTION_ITEMS[0] });

    name: string = "sort";
    displayName: string = "Sort";
    slices: Array<Slice> = [this.field, this.direction];
}

class CommentsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Comments", value: true });

    name: string = "comments";
    displayName: string = "Comments";
    description: string = "Used when a measure is in Comment. Commented categories are numbered and the comments are listed beside the chart.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [];
}

class ColoursCard extends SimpleCard {
    actual = new formattingSettings.ColorPicker({ name: "actual", displayName: "Actual", value: { value: "#404040" } });
    previousYear = new formattingSettings.ColorPicker({ name: "previousYear", displayName: "Previous year", value: { value: "#A6A6A6" } });
    good = new formattingSettings.ColorPicker({ name: "good", displayName: "Good variance", value: { value: "#57B133" } });
    bad = new formattingSettings.ColorPicker({ name: "bad", displayName: "Bad variance", value: { value: "#C8283C" } });

    name: string = "colours";
    displayName: string = "Colours";
    description: string = "Plan is drawn as an outline and forecast as hatching, both in the Actual colour.";
    slices: Array<Slice> = [this.actual, this.previousYear, this.good, this.bad];
}

class LabelsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Value labels", value: true });

    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 9, options: range(6, 24) });

    units = new formattingSettings.ItemDropdown({ name: "units", displayName: "Display units", items: UNIT_ITEMS, value: UNIT_ITEMS[0] });

    decimals = new formattingSettings.NumUpDown({ name: "decimals", displayName: "Decimal places", value: 1, options: range(0, 4) });

    name: string = "labels";
    displayName: string = "Value labels";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.fontSize, this.units, this.decimals];
}

class CategoryCard extends SimpleCard {
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 10, options: range(6, 24) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", description: "Used for category names, chart titles and value labels.", value: { value: "#1C1C1B" } });

    name: string = "category";
    displayName: string = "Text";
    slices: Array<Slice> = [this.fontSize, this.color];
}

export class VisualFormattingSettingsModel extends Model {
    comparison = new ComparisonCard();
    layout = new LayoutCard();
    groups = new GroupsCard();
    totals = new TotalsCard();
    sort = new SortCard();
    comments = new CommentsCard();
    colours = new ColoursCard();
    labels = new LabelsCard();
    category = new CategoryCard();

    cards = [this.comparison, this.layout, this.groups, this.totals, this.sort, this.comments, this.colours, this.labels, this.category];
}

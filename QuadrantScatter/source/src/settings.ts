"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { range, UNIT_ITEMS } from "./common/format";

import SimpleCard = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

export const LINE_ITEMS: powerbi.IEnumMember[] = [
    { value: "median", displayName: "Median" },
    { value: "mean", displayName: "Average" },
    { value: "value", displayName: "A value" },
];

class QuadrantsCard extends SimpleCard {
    xLine = new formattingSettings.ItemDropdown({ name: "xLine", displayName: "Vertical line at", description: "Where the chart is divided left from right. Median puts half the points on each side.", items: LINE_ITEMS, value: LINE_ITEMS[0] });
    xValue = new formattingSettings.NumUpDown({ name: "xValue", displayName: "Vertical line value", description: "Used when the line is set to \"A value\".", value: 0 });
    yLine = new formattingSettings.ItemDropdown({ name: "yLine", displayName: "Horizontal line at", items: LINE_ITEMS, value: LINE_ITEMS[0] });
    yValue = new formattingSettings.NumUpDown({ name: "yValue", displayName: "Horizontal line value", description: "Used when the line is set to \"A value\". For a percentage, 0.1 means 10%.", value: 0 });
    topRight = new formattingSettings.TextInput({ name: "topRight", displayName: "Top right name", value: "", placeholder: "e.g. Protect" });
    topLeft = new formattingSettings.TextInput({ name: "topLeft", displayName: "Top left name", value: "", placeholder: "e.g. Grow" });
    bottomRight = new formattingSettings.TextInput({ name: "bottomRight", displayName: "Bottom right name", value: "", placeholder: "e.g. Reprice" });
    bottomLeft = new formattingSettings.TextInput({ name: "bottomLeft", displayName: "Bottom left name", value: "", placeholder: "e.g. Review" });

    name: string = "quadrants";
    displayName: string = "Quadrants";
    description: string = "A quadrant with a name shows the name and how many points it holds.";
    slices: Array<Slice> = [this.xLine, this.xValue, this.yLine, this.yValue, this.topRight, this.topLeft, this.bottomRight, this.bottomLeft];
}

class AxesCard extends SimpleCard {
    xLog = new formattingSettings.ToggleSwitch({ name: "xLog", displayName: "X: logarithmic scale", description: "Spreads out points that bunch near zero, such as revenue with a few very large customers. Points at zero or below cannot be shown on it.", value: false });
    yLog = new formattingSettings.ToggleSwitch({ name: "yLog", displayName: "Y: logarithmic scale", value: false });

    name: string = "axes";
    displayName: string = "Axes";
    slices: Array<Slice> = [this.xLog, this.yLog];
}

class PointsCard extends SimpleCard {
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Colour", value: { value: "#2A78D6" } });
    labelCount = new formattingSettings.NumUpDown({ name: "labelCount", displayName: "Points to name", description: "Names the largest points (or, with no Size measure, those furthest from the middle). A name with no clear space beside its point is left out.", value: 8, options: range(0, 60) });

    name: string = "points";
    displayName: string = "Points";
    slices: Array<Slice> = [this.color, this.labelCount];
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
    quadrants = new QuadrantsCard();
    axes = new AxesCard();
    points = new PointsCard();
    labels = new LabelsCard();

    cards = [this.quadrants, this.axes, this.points, this.labels];
}

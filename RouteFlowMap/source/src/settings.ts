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

export const PROJECTION_ITEMS: powerbi.IEnumMember[] = [
    { value: "globe", displayName: "Globe (flattens as you zoom in)" },
    { value: "flat", displayName: "Flat map (shows every route)" },
];

class RoutesCard extends SimpleCard {
    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Colour",
        value: { value: "#57B133" },
    });

    minWidth = new formattingSettings.NumUpDown({
        name: "minWidth",
        displayName: "Minimum width",
        value: 1.5,
        options: range(0.5, 20),
    });

    maxWidth = new formattingSettings.NumUpDown({
        name: "maxWidth",
        displayName: "Maximum width",
        value: 14,
        options: range(1, 40),
    });

    scaleMax = new formattingSettings.NumUpDown({
        name: "scaleMax",
        displayName: "Value at maximum width (0 = auto)",
        description: "The value drawn at the maximum width. Leave at 0 to use the largest route currently shown, which rescales when you filter. Enter a fixed value to keep widths and the legend the same under any filter.",
        value: 0,
        options: { minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 } },
    });

    opacity = new formattingSettings.NumUpDown({
        name: "opacity",
        displayName: "Opacity (%)",
        value: 85,
        options: range(10, 100),
    });

    curvature = new formattingSettings.NumUpDown({
        name: "curvature",
        displayName: "Curvature (%)",
        value: 20,
        options: range(0, 60),
    });

    fade = new formattingSettings.ToggleSwitch({
        name: "fade",
        displayName: "Fade from origin",
        value: true,
    });

    name: string = "routes";
    displayName: string = "Routes";
    slices: Array<Slice> = [this.color, this.minWidth, this.maxWidth, this.scaleMax, this.opacity, this.curvature, this.fade];
}

class MapCard extends SimpleCard {
    projection = new formattingSettings.ItemDropdown({
        name: "projection",
        displayName: "Map type",
        items: PROJECTION_ITEMS,
        value: PROJECTION_ITEMS[0],
    });

    oceanColor = new formattingSettings.ColorPicker({
        name: "oceanColor",
        displayName: "Sea colour (globe)",
        value: { value: "#EEF3F1" },
    });

    zoomButtons = new formattingSettings.ToggleSwitch({
        name: "zoomButtons",
        displayName: "Zoom buttons",
        value: true,
    });

    landColor = new formattingSettings.ColorPicker({
        name: "landColor",
        displayName: "Land colour",
        value: { value: "#E4E6DF" },
    });

    activeColor = new formattingSettings.ColorPicker({
        name: "activeColor",
        displayName: "Countries in data",
        value: { value: "#CFE1B6" },
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border colour",
        value: { value: "#FFFFFF" },
    });

    markerColor = new formattingSettings.ColorPicker({
        name: "markerColor",
        displayName: "Origin marker colour",
        value: { value: "#1C1C1B" },
    });

    zoomToRoutes = new formattingSettings.ToggleSwitch({
        name: "zoomToRoutes",
        displayName: "Zoom to routes",
        value: true,
    });

    allowZoom = new formattingSettings.ToggleSwitch({
        name: "allowZoom",
        displayName: "Allow pan and zoom",
        value: true,
    });

    name: string = "map";
    displayName: string = "Map";
    slices: Array<Slice> = [this.projection, this.landColor, this.activeColor, this.borderColor, this.oceanColor, this.markerColor, this.zoomToRoutes, this.allowZoom, this.zoomButtons];
}

class HoverCard extends SimpleCard {
    card = new formattingSettings.ToggleSwitch({
        name: "card",
        displayName: "Details card",
        description: "Show the route, its value, share of total and rank in the corner of the map while a route is hovered.",
        value: true,
    });

    highlight = new formattingSettings.ToggleSwitch({
        name: "highlight",
        displayName: "Highlight hovered route",
        value: true,
    });

    tooltip = new formattingSettings.ToggleSwitch({
        name: "tooltip",
        displayName: "Power BI tooltip",
        description: "Also show the standard Power BI tooltip next to the pointer. Needed for report page tooltips.",
        value: false,
    });

    name: string = "hover";
    displayName: string = "Hover";
    slices: Array<Slice> = [this.card, this.highlight, this.tooltip];
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
        value: 10,
        options: range(6, 30),
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Colour",
        value: { value: "#1C1C1B" },
    });

    name: string = "labels";
    displayName: string = "Country labels";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.fontSize, this.color];
}

class LegendCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true,
    });

    name: string = "legend";
    displayName: string = "Width legend";
    topLevelSlice = this.show;
    slices: Array<Slice> = [];
}

export class VisualFormattingSettingsModel extends Model {
    routes = new RoutesCard();
    map = new MapCard();
    hover = new HoverCard();
    labels = new LabelsCard();
    legend = new LegendCard();

    cards = [this.routes, this.map, this.hover, this.labels, this.legend];
}

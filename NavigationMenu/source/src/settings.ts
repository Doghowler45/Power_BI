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

export const MODE_ITEMS: powerbi.IEnumMember[] = [
    { value: "button", displayName: "Select, then a Go button" },
    { value: "link", displayName: "Open the page in a new tab" },
];

class NavigationCard extends SimpleCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "When an entry is clicked",
        description: "Power BI does not let a custom visual change page by itself. Select: the entry is selected, and a Power BI button whose destination is a measure takes you there. New tab: the page opens in a new browser tab (published reports only).",
        items: MODE_ITEMS,
        value: MODE_ITEMS[0],
    });

    reportUrl = new formattingSettings.TextInput({
        name: "reportUrl",
        displayName: "Report web address",
        description: "For the new-tab method. Open the published report in a browser and paste its address here. Each entry's Page link is added to it.",
        value: "",
        placeholder: "https://app.powerbi.com/groups/.../reports/...",
    });

    currentPage = new formattingSettings.TextInput({
        name: "currentPage",
        displayName: "This page",
        description: "The name of the page this copy of the visual is on, as in the Page field. Its heading and entry are shown in the active colour. A visual cannot find this out for itself.",
        value: "",
        placeholder: "Page name",
    });

    openOnHover = new formattingSettings.ToggleSwitch({
        name: "openOnHover",
        displayName: "Open dropdowns on hover",
        description: "Off: a dropdown opens when its heading is clicked.",
        value: false,
    });

    name: string = "navigation";
    displayName: string = "Navigation";
    slices: Array<Slice> = [this.mode, this.reportUrl, this.currentPage, this.openOnHover];
}

class HeaderCard extends SimpleCard {
    height = new formattingSettings.NumUpDown({ name: "height", displayName: "Height (px)", description: "The height of the row of headings. The rest of the visual's height is room for the dropdowns.", value: 32, options: range(16, 120) });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size (px)", value: 13, options: range(8, 40) });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#FFFFFF" } });
    activeColor = new formattingSettings.ColorPicker({ name: "activeColor", displayName: "Active colour", description: "Used for the page you are on, the entry selected, and text under the pointer.", value: { value: "#57B133" } });
    fill = new formattingSettings.ToggleSwitch({ name: "fill", displayName: "Fill behind headings", description: "Off: the page shows through, for placing the menu on a band that is part of the page background.", value: true });
    background = new formattingSettings.ColorPicker({ name: "background", displayName: "Fill colour", value: { value: "#1C1C1B" } });
    hoverColor = new formattingSettings.ColorPicker({ name: "hoverColor", displayName: "Fill under the pointer", value: { value: "#3A3A38" } });

    name: string = "header";
    displayName: string = "Headings";
    slices: Array<Slice> = [this.height, this.fontSize, this.color, this.activeColor, this.fill, this.background, this.hoverColor];
}

class DropdownCard extends SimpleCard {
    background = new formattingSettings.ColorPicker({ name: "background", displayName: "Fill colour", value: { value: "#2E2E2C" } });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#FFFFFF" } });
    itemHeight = new formattingSettings.NumUpDown({ name: "itemHeight", displayName: "Entry height (px)", value: 30, options: range(16, 80) });
    minWidth = new formattingSettings.NumUpDown({ name: "minWidth", displayName: "Minimum width (px)", value: 200, options: range(60, 600) });

    name: string = "dropdown";
    displayName: string = "Dropdowns";
    description: string = "A dropdown opens inside the visual, so make the visual tall enough for its longest one.";
    slices: Array<Slice> = [this.background, this.color, this.itemHeight, this.minWidth];
}

export class VisualFormattingSettingsModel extends Model {
    navigation = new NavigationCard();
    header = new HeaderCard();
    dropdown = new DropdownCard();

    cards = [this.navigation, this.header, this.dropdown];
}

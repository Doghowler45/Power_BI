"use strict";

// The format pane for the Manual Table. It is laid out like Power BI's own table visual, so the
// options are where people already expect them:
//
//   Column headers   Text | Background
//   Values           Text | Background | Alternate rows
//   Grid             Horizontal lines | Row spacing
//   Totals           (switch) Label
//   Number format    Decimal places, negatives, currency symbol
//   Editing          Allow editing online
//
// Each card saves to one object in capabilities.json (the card's `name`). A group with a switch
// in its heading (Background, Alternate rows, Horizontal lines) is off until the switch is on.

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import SimpleCard = formattingSettings.SimpleCard;
import CompositeCard = formattingSettings.CompositeCard;
import Group = formattingSettings.Group;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

const range = (min: number, max: number) => ({
    minValue: { type: powerbi.visuals.ValidatorType.Min as powerbi.visuals.ValidatorType.Min, value: min },
    maxValue: { type: powerbi.visuals.ValidatorType.Max as powerbi.visuals.ValidatorType.Max, value: max },
});

const DEFAULT_FONT = "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif";

export const ALIGN_ITEMS: powerbi.IEnumMember[] = [
    { value: "auto", displayName: "Auto (text left, numbers right)" },
    { value: "left", displayName: "Left" },
    { value: "center", displayName: "Centre" },
    { value: "right", displayName: "Right" },
];

/** "Text" group: Power BI's standard font control, then colour and alignment. Used for headers and for values. */
export class TextGroup extends Group {
    font: formattingSettings.FontControl;
    color: formattingSettings.ColorPicker;
    align: formattingSettings.ItemDropdown;

    constructor(groupName: string, bold: boolean) {
        const font = new formattingSettings.FontControl({
            name: "font",
            displayName: "Font",
            fontFamily: new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font", value: DEFAULT_FONT }),
            fontSize: new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 10, options: range(6, 40) }),
            bold: new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: bold }),
            italic: new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false }),
            underline: new formattingSettings.ToggleSwitch({ name: "underline", displayName: "Underline", value: false }),
        });
        const color = new formattingSettings.ColorPicker({ name: "color", displayName: "Text colour", value: { value: "#1C1C1B" } });
        const align = new formattingSettings.ItemDropdown({ name: "align", displayName: "Alignment", items: ALIGN_ITEMS, value: ALIGN_ITEMS[0] });
        super({ name: groupName, displayName: "Text", slices: [font, color, align] });
        this.font = font;
        this.color = color;
        this.align = align;
    }
}

/** A group with an on/off switch in its heading and one colour inside: backgrounds and row shading. */
export class ColourGroup extends Group {
    show: formattingSettings.ToggleSwitch;
    color: formattingSettings.ColorPicker;

    constructor(groupName: string, displayName: string, description: string, switchProperty: string, colourProperty: string, defaultColour: string) {
        const show = new formattingSettings.ToggleSwitch({ name: switchProperty, displayName, value: false });
        const color = new formattingSettings.ColorPicker({ name: colourProperty, displayName: "Colour", description, value: { value: defaultColour } });
        super({ name: groupName, displayName, description, slices: [color], topLevelSlice: show });
        this.show = show;
        this.color = color;
    }
}

// ---------------------------------------------------------------- Column headers

class ColumnHeadersCard extends CompositeCard {
    text = new TextGroup("headerText", true);
    background = new ColourGroup(
        "headerBackground", "Background",
        "Fills the header row with a colour. A header cell filled from the toolbar keeps its own colour.",
        "fill", "background", "#E7F0DA",
    );

    name: string = "headerStyle";
    displayName: string = "Column headers";
    groups: Array<Group> = [this.text, this.background];
}

// ---------------------------------------------------------------- Values

class ValuesCard extends CompositeCard {
    text = new TextGroup("valueText", false);
    background = new ColourGroup(
        "valueBackground", "Background",
        "Fills every value cell with a colour. A cell filled from the toolbar keeps its own colour.",
        "fill", "background", "#FFFFFF",
    );
    banding = new ColourGroup(
        "valueBanding", "Alternate rows",
        "Shades every second row to make wide tables easier to read across.",
        "banding", "bandColor", "#F4F8EF",
    );

    name: string = "valueStyle";
    displayName: string = "Values";
    groups: Array<Group> = [this.text, this.background, this.banding];
}

// ---------------------------------------------------------------- Grid

class LinesGroup extends Group {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Horizontal lines", value: true });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Colour", value: { value: "#96CF80" } });
    width = new formattingSettings.NumUpDown({ name: "width", displayName: "Thickness (px)", value: 1, options: range(1, 6) });

    constructor() {
        super({ name: "gridLines", displayName: "Horizontal lines", description: "The lines under each row. The line under the header is drawn one pixel thicker." });
        this.slices = [this.color, this.width];
        this.topLevelSlice = this.show;
    }
}

class SpacingGroup extends Group {
    rowPadding = new formattingSettings.NumUpDown({
        name: "rowPadding",
        displayName: "Row padding (px)",
        description: "Space above and below the text in every row. To set one row's exact height, use the Height box in the table's toolbar.",
        value: 5,
        options: range(0, 20),
    });

    constructor() {
        super({ name: "gridSpacing", displayName: "Row spacing" });
        this.slices = [this.rowPadding];
    }
}

class GridCard extends CompositeCard {
    lines = new LinesGroup();
    spacing = new SpacingGroup();

    name: string = "grid";
    displayName: string = "Grid";
    groups: Array<Group> = [this.lines, this.spacing];
}

// ---------------------------------------------------------------- Totals, numbers, editing

class TotalsCard extends SimpleCard {
    show = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Totals", value: false });

    label = new formattingSettings.TextInput({
        name: "label",
        displayName: "Label",
        description: "Shown in the first text column of the totals row.",
        value: "Total",
        placeholder: "Total",
    });

    name: string = "totals";
    displayName: string = "Totals";
    description: string = "Adds a row at the bottom that sums every number column.";
    topLevelSlice = this.show;
    slices: Array<Slice> = [this.label];
}

class NumberFormatCard extends SimpleCard {
    decimals = new formattingSettings.NumUpDown({
        name: "decimals",
        displayName: "Decimal places",
        value: 0,
        options: range(0, 6),
    });

    brackets = new formattingSettings.ToggleSwitch({
        name: "brackets",
        displayName: "Negative numbers in brackets",
        description: "On: (1,200). Off: -1,200.",
        value: true,
    });

    prefix = new formattingSettings.TextInput({
        name: "prefix",
        displayName: "Currency symbol",
        description: "Put in front of every number, for example $. Leave blank for none.",
        value: "",
        placeholder: "none",
    });

    name: string = "numbers";
    displayName: string = "Number format";
    description: string = "Applies to every number column and to the totals row.";
    slices: Array<Slice> = [this.decimals, this.brackets, this.prefix];
}

class EditingCard extends SimpleCard {
    allowService = new formattingSettings.ToggleSwitch({
        name: "allowService",
        displayName: "Allow editing online",
        description: "Off: the table can only be typed into in Power BI Desktop. On: people who open the published report in edit mode can also change it. People viewing the report can never change it.",
        value: false,
    });

    name: string = "editing";
    displayName: string = "Editing";
    slices: Array<Slice> = [this.allowService];
}

export class VisualFormattingSettingsModel extends Model {
    header = new ColumnHeadersCard();
    values = new ValuesCard();
    grid = new GridCard();
    totals = new TotalsCard();
    numbers = new NumberFormatCard();
    editing = new EditingCard();

    cards = [this.header, this.values, this.grid, this.totals, this.numbers, this.editing];
}

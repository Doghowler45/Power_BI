"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { TextGroup, VisualFormattingSettingsModel } from "./settings";
import { emptyTable, parseData, serialiseData, starterTable, TableData } from "./tableModel";
import { TableView, TableViewOptions, TextStyle } from "./tableView";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

/** The colour chosen in a colour picker, or an empty string when it is set to "no fill". */
const fillOf = (picker: formattingSettings.ColorPicker): string => {
    const value = picker.value && picker.value.value;
    return typeof value === "string" ? value : "";
};

/** Where the typed table is kept: a hidden property of the visual, saved with the report. */
const CONTENT_OBJECT = "content";
const CONTENT_PROPERTY = "data";
/** Bit that marks Power BI Desktop in `host.hostEnv`. */
const HOST_DESKTOP = 4;

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly view: TableView;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();

    /** The table as it currently stands in this visual, and its saved form. */
    private data: TableData | null = null;
    private currentJson = "";
    /** The last version sent to Power BI to save, and whether Power BI has sent it back yet. */
    private lastSent: string | null = null;
    private acknowledged = true;
    /** What the screen was last built from; used to skip rebuilding (and losing the cursor) when nothing changed. */
    private renderedKey = "";

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.view = new TableView(options.element);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const editable = this.canEdit(options);

            const objects = dataView && dataView.metadata && dataView.metadata.objects;
            const stored = objects && objects[CONTENT_OBJECT] ? objects[CONTENT_OBJECT][CONTENT_PROPERTY] : undefined;
            this.adopt(typeof stored === "string" ? stored : "", editable);

            // Header and values each have their own text formatting.
            const textStyle = (text: TextGroup): TextStyle => {
                const align = String(text.align.value && text.align.value.value);
                return {
                    fontFamily: text.font.fontFamily.value || "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif",
                    fontSize: Number(text.font.fontSize.value) || 10,
                    bold: !!(text.font.bold && text.font.bold.value),
                    italic: !!(text.font.italic && text.font.italic.value),
                    underline: !!(text.font.underline && text.font.underline.value),
                    color: fillOf(text.color) || "#1C1C1B",
                    align: align === "left" || align === "center" || align === "right" ? align : "auto",
                };
            };
            const lineWidth = Math.min(6, Math.max(1, Math.round(Number(s.grid.lines.width.value) || 1)));
            const viewOptions: TableViewOptions = {
                editable,
                header: textStyle(s.header.text),
                // Each background has an on/off switch in its heading; switched off means no fill at all.
                headerBackground: s.header.background.show.value ? fillOf(s.header.background.color) : "",
                values: textStyle(s.values.text),
                valuesBackground: s.values.background.show.value ? fillOf(s.values.background.color) : "",
                ruleColor: fillOf(s.grid.lines.color) || "#96CF80",
                ruleWidth: s.grid.lines.show.value ? lineWidth : 0,
                rowPadding: Number(s.grid.spacing.rowPadding.value) || 0,
                banding: s.values.banding.show.value,
                bandColor: fillOf(s.values.banding.color) || "#F4F8EF",
                showTotals: s.totals.show.value,
                totalsLabel: (s.totals.label.value || "").trim() || "Total",
                numbers: {
                    locale: this.host.locale,
                    decimals: Number(s.numbers.decimals.value) || 0,
                    brackets: s.numbers.brackets.value,
                    prefix: s.numbers.prefix.value || "",
                },
            };

            // Rebuild only when the data, the mode or the formatting actually changed. Power BI calls
            // update after every save, and rebuilding then would take the cursor out of the cell being typed in.
            const shown = this.data || (editable ? starterTable() : emptyTable());
            const key = JSON.stringify([this.currentJson, viewOptions]);
            if (key !== this.renderedKey) {
                this.view.render(shown, viewOptions, (changed) => this.save(changed, viewOptions));
                this.renderedKey = key;
            }
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /**
     * Typing is allowed only while the report is being edited. By default that means Power BI
     * Desktop; with "Allow editing online" switched on it also covers edit mode in the Power BI
     * service. People viewing a published report always get a read-only table.
     */
    private canEdit(options: VisualUpdateOptions): boolean {
        const editingReport = options.viewMode === powerbi.ViewMode.Edit || options.viewMode === powerbi.ViewMode.InFocusEdit;
        if (!editingReport) return false;
        const env = this.host.hostEnv as number | undefined;
        // Older hosts do not say where they are running; being in edit mode is then the only test.
        const inDesktop = env === undefined || env === null || (env & HOST_DESKTOP) !== 0;
        return inDesktop || this.formattingSettings.editing.allowService.value;
    }

    /** Decides whether the table Power BI just handed over should replace the one on screen. */
    private adopt(incoming: string, editable: boolean): void {
        if (incoming === this.currentJson) {
            if (incoming === this.lastSent) this.acknowledged = true;
            return;
        }
        if (editable && this.lastSent !== null && !this.acknowledged) {
            // An older save coming back while a newer one is still on its way: keep what was typed.
            return;
        }
        // Loaded with the report, or changed from outside (undo, a bookmark, another editor).
        this.data = parseData(incoming);
        this.currentJson = incoming;
    }

    /** Stores an edit with the report. */
    private save(data: TableData, viewOptions: TableViewOptions): void {
        const json = serialiseData(data);
        this.data = data;
        this.currentJson = json;
        this.lastSent = json;
        this.acknowledged = false;
        // The view has already redrawn itself for this edit.
        this.renderedKey = JSON.stringify([this.currentJson, viewOptions]);
        this.host.persistProperties({
            merge: [{ objectName: CONTENT_OBJECT, selector: null, properties: { [CONTENT_PROPERTY]: json } }],
        });
    }
}

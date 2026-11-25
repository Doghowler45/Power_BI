"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { buildCalendar, CalendarView, cellKey, DatedValue } from "./view";
import { RAMPS } from "./common/colours";
import { NAMED_COLOURS, rampFrom } from "./ramp";
import { chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData {
    rows: DatedValue[];
    rowIds: ISelectionId[];
    format: string;
    valueName: string;
    /** True when a field is in Date but its values are not dates. */
    notDates: boolean;
}

/** Reads a date however Power BI sends it: a Date, or text such as "2026-10-01". */
function toDate(raw: powerbi.PrimitiveValue): Date | null {
    if (raw instanceof Date) return raw;
    if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = new Date(raw);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: CalendarView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new CalendarView(options.element);
        this.interaction = new Interaction(options.host, options.element, (keys) => this.view.setSelection(keys));
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            const calendar = buildCalendar(data.rows, Number(s.calendar.firstMonth.value) || 1, this.host.locale);

            // A month stands for every row added up into it: selecting it selects them all.
            const ids = new Map<string, ISelectionId[]>();
            if (calendar) calendar.years.forEach((year) => year.months.forEach((cell) => cell && ids.set(cellKey(cell), cell.rows.map((r) => data.rowIds[r]))));
            this.interaction.setIds(ids);

            const cells = calendar ? calendar.years.flatMap((year) => year.months.map((cell) => (cell ? cell.value : null))) : [];
            const formatters = makeFormatters(data.format, chooseUnit(data.format, cells, String(s.labels.units.value?.value ?? "auto")), clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);

            // The scale of shades: a named colour, or one made from the colour picked under Custom.
            const hue = String(s.colours.hue.value?.value ?? "green");
            const picked = s.colours.custom.value && typeof s.colours.custom.value.value === "string" ? s.colours.custom.value.value : "";
            const ramp = (hue === "custom" ? rampFrom(picked) : RAMPS[hue] || rampFrom(NAMED_COLOURS[hue] || "")) || RAMPS.green;
            // The colour picker is only offered while Colour is set to Custom.
            s.colours.custom.visible = hue === "custom";

            this.view.render(calendar, {
                width: options.viewport.width,
                height: options.viewport.height,
                ramp,
                perYear: String(s.colours.scope.value?.value) === "year",
                newestFirst: s.calendar.newestFirst.value,
                showTotals: s.calendar.totals.value,
                showValues: s.labels.show.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: data.notDates ? "The field in Date is not a date. Use a date column, not a month name or number" : "Add a date column to Date and a measure to Values",
            }, {
                onSelect: (cell, event) => this.interaction.select(cellKey(cell), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (cell, event) => this.interaction.contextMenu(cell ? cellKey(cell) : null, event),
                showTooltip: (year, cell, before, beforeLabel, event) => {
                    const monthName = calendar ? calendar.monthNames[cell.month] : "";
                    const items: TooltipItem[] = [
                        { displayName: "Month", value: `${monthName} ${year.label}` },
                        { displayName: data.valueName || "Value", value: full(cell.value) },
                    ];
                    if (before) {
                        items.push({ displayName: `${monthName} ${beforeLabel}`, value: full(before.value) });
                        if (before.value !== 0) {
                            const change = ((cell.value - before.value) / Math.abs(before.value)) * 100;
                            items.push({ displayName: "Change", value: `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%` });
                        }
                    }
                    this.interaction.showTooltip(items, event, cellKey(cell));
                },
                hideTooltip: () => this.interaction.hideTooltip(),
            });
            this.interaction.sync();
            this.host.eventService.renderingFinished(options);
        } catch (error) {
            this.host.eventService.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { rows: [], rowIds: [], format: DEFAULT_FORMAT, valueName: "", notDates: false };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !category) return result;
        const value = categorical.values ? Array.from(categorical.values).find((c) => c.source.roles && c.source.roles["value"]) : undefined;
        if (value) {
            result.format = value.source.format || DEFAULT_FORMAT;
            result.valueName = value.source.displayName || "";
        }
        category.values.forEach((raw, index) => {
            const number = value ? value.values[index] : null;
            result.rows.push({ date: toDate(raw), value: typeof number === "number" && isFinite(number) ? number : null });
            result.rowIds.push(this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId());
        });
        result.notDates = result.rows.length > 0 && result.rows.every((row) => row.date === null);
        return result;
    }
}

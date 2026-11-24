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
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";
import { SeasonalData, SeasonalView } from "./view";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

const MONTH_STARTS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface ParsedData extends SeasonalData {
    ids: Map<string, ISelectionId[]>;
    format: string;
    names: { months: string; value: string };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: SeasonalView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new SeasonalView(options.element);
        this.interaction = new Interaction(options.host, options.element, () => undefined);
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            this.interaction.setIds(data.ids);
            const cumulative = String(s.lines.mode.value?.value) === "cumulative";

            // The unit comes from what is drawn: yearly totals are far larger than single months.
            const drawn = data.years.flatMap((year) => (cumulative ? [year.values.reduce<number>((sum, v) => sum + (v ?? 0), 0)] : year.values));
            const formatters = makeFormatters(data.format, chooseUnit(data.format, drawn, String(s.labels.units.value?.value ?? "auto")), clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);

            this.view.render(data, {
                width: options.viewport.width,
                height: options.viewport.height,
                cumulative,
                showBand: s.lines.band.value,
                startAtZero: s.lines.zero.value,
                color: s.lines.color.value.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: "Add a month field to Months, a year field to Years, and a measure to Values",
            }, {
                onSelect: (month, event) => this.interaction.select(String(month), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (month, event) => this.interaction.contextMenu(month === null ? null : String(month), event),
                showTooltip: (month, lines, event) => {
                    const items: TooltipItem[] = [{ displayName: data.names.months || "Month", value: `${data.months[month]}${cumulative ? " (running total)" : ""}` }];
                    lines.forEach((line) => items.push({ displayName: line.year, value: line.value === null ? "–" : full(line.value) }));
                    const [latest, before] = lines;
                    if (latest && before && latest.value !== null && before.value !== null && before.value !== 0) {
                        const change = ((latest.value - before.value) / Math.abs(before.value)) * 100;
                        items.push({ displayName: `${latest.year} on ${before.year}`, value: `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%` });
                    }
                    this.interaction.showTooltip(items, event, String(month));
                },
                hideTooltip: () => this.interaction.hideTooltip(),
            });
            this.host.eventService.renderingFinished(options);
        } catch (error) {
            this.host.eventService.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /** Months come from the Months field; the measure arrives once for each value of the Years field. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { months: [], years: [], ids: new Map(), format: DEFAULT_FORMAT, names: { months: "", value: "" } };
        const categorical = dataView && dataView.categorical;
        const valueColumns = categorical && categorical.values;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !valueColumns || valueColumns.length === 0 || !category) return result;
        result.months = category.values.map((raw) => categoryText(raw, category.source.format));
        result.names.months = category.source.displayName || "";
        category.values.forEach((_, month) => result.ids.set(String(month), [this.host.createSelectionIdBuilder().withCategory(category, month).createSelectionId()]));

        const groups = typeof valueColumns.grouped === "function" ? valueColumns.grouped() : [];
        const grouped = !!valueColumns.source && groups.length > 0;
        const valueIn = (columns: DataViewValueColumn[]) => columns.find((c) => c.source.roles && c.source.roles["value"]);
        const first = valueIn(Array.from(valueColumns));
        if (!first) return result;
        result.format = first.source.format || DEFAULT_FORMAT;
        result.names.value = first.source.displayName || "";
        const numbers = (column: DataViewValueColumn | undefined) => result.months.map((_, month) => {
            const raw = column ? column.values[month] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        });
        // With no Years field there is a single line, named after the measure.
        result.years = grouped
            ? groups.map((group) => ({ name: categoryText(group.name ?? null, valueColumns.source ? valueColumns.source.format : undefined), values: numbers(valueIn(group.values)) }))
            : [{ name: result.names.value, values: numbers(first) }];

        // Month names arrive A to Z (Apr, Aug, Dec...) unless the column is sorted by a month
        // number in the model. When every value is a month name, put them in calendar order.
        const calendar = result.months.map((name) => MONTH_STARTS.indexOf(name.trim().slice(0, 3).toLowerCase()));
        const isCalendar = calendar.length > 1 && calendar.every((m) => m >= 0) && new Set(calendar).size === calendar.length;
        if (isCalendar && calendar.some((m, i) => i > 0 && m < calendar[i - 1])) {
            const order = calendar.map((m, position) => ({ m, position })).sort((a, b) => a.m - b.m).map((entry) => entry.position);
            result.months = order.map((position) => result.months[position]);
            result.years.forEach((year) => (year.values = order.map((position) => year.values[position])));
            const ids = new Map<string, ISelectionId[]>();
            order.forEach((position, month) => ids.set(String(month), result.ids.get(String(position)) || []));
            result.ids = ids;
        }
        return result;
    }
}

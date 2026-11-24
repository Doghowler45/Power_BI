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
import { buildRows, DumbbellView, SortMode } from "./view";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData {
    rows: { name: string; start: number | null; end: number | null }[];
    ids: Map<string, ISelectionId[]>;
    format: string;
    names: { category: string; start: string; end: string };
    extras: { name: string; format: string; values: powerbi.PrimitiveValue[] }[];
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: DumbbellView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new DumbbellView(options.element);
        this.interaction = new Interaction(options.host, options.element, (keys) => this.view.setSelection(keys));
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            this.interaction.setIds(data.ids);

            const sortChoice = String(s.rows.sort.value?.value ?? "change");
            const sort: SortMode = sortChoice === "percent" || sortChoice === "end" || sortChoice === "none" ? sortChoice : "change";
            const chart = buildRows(data.rows, sort, Number(s.rows.maxRows.value) || 15);
            const formatters = makeFormatters(data.format, chooseUnit(data.format, chart.rows.flatMap((r) => [r.start, r.end]), String(s.labels.units.value?.value ?? "auto")), clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);

            this.view.render(chart, {
                width: options.viewport.width,
                height: options.viewport.height,
                startName: data.names.start,
                endName: data.names.end,
                higherIsWorse: s.comparison.higherIsWorse.value,
                percentScale: String(s.comparison.scale.value?.value) === "percent",
                showPercent: s.labels.percent.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: "Add a field to Category, and measures to From and To",
            }, {
                onSelect: (row, event) => this.interaction.select(String(row.index), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (row, event) => this.interaction.contextMenu(row ? String(row.index) : null, event),
                showTooltip: (row, event) => {
                    const items: TooltipItem[] = [{ displayName: data.names.category || "Category", value: row.name }];
                    items.push({ displayName: data.names.start || "From", value: row.start === null ? "–" : full(row.start) });
                    items.push({ displayName: data.names.end || "To", value: row.end === null ? "–" : full(row.end) });
                    if (row.change !== null) {
                        const sign = row.change > 0 ? "+" : row.change < 0 ? "−" : "";
                        items.push({ displayName: "Change", value: `${sign}${full(Math.abs(row.change))}` });
                        if (row.percent !== null) items.push({ displayName: "Change %", value: `${sign}${Math.abs(row.percent).toFixed(1)}%` });
                    }
                    data.extras.forEach((extra) => {
                        const raw = extra.values[row.index];
                        if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "number" ? fullFormatter(extra.format)(raw) : String(raw) });
                    });
                    this.interaction.showTooltip(items, event, String(row.index));
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
        const result: ParsedData = { rows: [], ids: new Map(), format: DEFAULT_FORMAT, names: { category: "", start: "", end: "" }, extras: [] };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !category) return result;
        const columns: DataViewValueColumn[] = categorical.values ? Array.from(categorical.values) : [];
        const start = columns.find((c) => c.source.roles && c.source.roles["start"]);
        const end = columns.find((c) => c.source.roles && c.source.roles["end"]);
        const first = end || start;
        if (first) result.format = first.source.format || DEFAULT_FORMAT;
        result.names = { category: category.source.displayName || "", start: start ? start.source.displayName || "" : "", end: end ? end.source.displayName || "" : "" };
        result.extras = columns.filter((c) => c.source.roles && c.source.roles["tooltips"]).map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT, values: c.values }));
        const numberAt = (column: DataViewValueColumn | undefined, index: number): number | null => {
            const raw = column ? column.values[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        category.values.forEach((raw, index) => {
            result.rows.push({ name: categoryText(raw, category.source.format), start: numberAt(start, index), end: numberAt(end, index) });
            result.ids.set(String(index), [this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId()]);
        });
        return result;
    }
}

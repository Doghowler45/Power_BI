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
import { buildConcentration } from "./model";
import { ConcentrationView } from "./view";
import { RAMPS } from "./common/colours";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters, share } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData {
    points: { name: string; value: number | null; count: number | null }[];
    ids: Map<string, ISelectionId[]>;
    format: string;
    categoryName: string;
    measureName: string;
    /** The name of the Count measure, or null when each row is one item. */
    countName: string | null;
    extras: { name: string; format: string; values: powerbi.PrimitiveValue[] }[];
    /** True when Power BI had more rows than it gave the visual. */
    truncated: boolean;
}

/** "Customer" -> "customers", "Country" -> "countries". Only a default: the format pane can override it. */
function plural(name: string): string {
    const word = name.trim().toLowerCase();
    if (word === "") return "items";
    if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
    return /s$/.test(word) ? word : word + "s";
}

const whole = (value: number): string => Math.round(value).toLocaleString("en-NZ");

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: ConcentrationView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new ConcentrationView(options.element);
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

            const grouped = data.countName !== null;
            const result = buildConcentration(data.points, grouped, Number(s.bands.aThreshold.value) || 80, Number(s.bands.bThreshold.value) || 95,
                { count: Number(s.callout.count.value) || 10, percent: Number(s.callout.percent.value) || 10 });
            const unitChoice = String(s.labels.units.value?.value ?? "auto");
            const decimals = clampDecimals(s.labels.decimals.value);
            const formatters = makeFormatters(data.format, chooseUnit(data.format, [result ? result.total : null], unitChoice), decimals, this.host.locale);
            // The lower chart shows what one item brings: for a group that is an average, far smaller than the total, so it gets its own unit.
            const averages = result ? result.items.map((item) => item.average) : [];
            const barFormatters = makeFormatters(data.format, chooseUnit(data.format, averages, unitChoice), decimals, this.host.locale);
            const full = fullFormatter(data.format);
            // With grouped data the Count measure says what is being counted ("Customers"); otherwise the category does.
            const noun = String(s.labels.noun.value || "").trim() || (data.countName !== null ? data.countName.trim().toLowerCase() || "items" : plural(data.categoryName));
            const hasData = data.points.some((p) => p.value !== null);

            this.view.render(result, {
                width: options.viewport.width,
                height: options.viewport.height,
                ramp: RAMPS[String(s.bands.hue.value?.value ?? "green")] || RAMPS.green,
                lossColor: "#D03B3B",
                showBars: s.bars.show.value,
                showBandLabels: s.bands.labels.value,
                showTop: s.callout.show.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                noun,
                measureName: data.measureName,
                formatters,
                barFormatter: grouped ? barFormatters[barFormatters.length - 1] : formatters[formatters.length - 1],
                warning: data.truncated
                    ? { headline: `Incomplete: only the first ${whole(data.points.length)} rows were loaded`, advice: `Group the ${noun} into buckets and add their number to Count` }
                    : null,
                emptyMessage: hasData ? "The total is zero or negative, so there are no shares to show" : "Add a field to Category and a measure to Values",
            }, {
                onSelect: (item, event) => this.interaction.select(String(item.index), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (item, event) => this.interaction.contextMenu(item ? String(item.index) : null, event),
                showTooltip: (item, event) => {
                    const items: TooltipItem[] = [{ displayName: data.categoryName || "Category", value: item.name }];
                    if (grouped) {
                        items.push({ displayName: data.countName || "Count", value: whole(item.count) });
                        items.push({ displayName: data.measureName || "Value", value: full(item.value) });
                        items.push({ displayName: "Average each", value: full(item.average) });
                        items.push({ displayName: "Share of total", value: share(item.share, 1) });
                        items.push({ displayName: `Up to here: share of ${noun}`, value: share(item.to, 1) });
                        items.push({ displayName: `Up to here: share of ${data.measureName || "total"}`, value: share(item.cumulative, 1) });
                    } else {
                        items.push({ displayName: "Rank", value: `${whole(item.rank)} of ${whole(result ? result.items.length : 0)}` });
                        items.push({ displayName: data.measureName || "Value", value: full(item.value) });
                        items.push({ displayName: "Share of total", value: share(item.share, 1) });
                        items.push({ displayName: "Running share", value: share(item.cumulative, 1) });
                    }
                    items.push({ displayName: "Band", value: item.band === "L" ? "Below zero" : item.band });
                    data.extras.forEach((extra) => {
                        const raw = extra.values[item.index];
                        if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "number" ? fullFormatter(extra.format)(raw) : String(raw) });
                    });
                    this.interaction.showTooltip(items, event, String(item.index));
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
        const result: ParsedData = { points: [], ids: new Map(), format: DEFAULT_FORMAT, categoryName: "", measureName: "", countName: null, extras: [], truncated: false };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!dataView || !categorical || !category) return result;
        // Power BI marks the data when it holds back rows beyond the visual's limit.
        result.truncated = !!(dataView.metadata && dataView.metadata.segment);
        const columns: DataViewValueColumn[] = categorical.values ? Array.from(categorical.values) : [];
        const value = columns.find((c) => c.source.roles && c.source.roles["value"]);
        const count = columns.find((c) => c.source.roles && c.source.roles["count"]);
        result.categoryName = category.source.displayName || "";
        if (value) {
            result.format = value.source.format || DEFAULT_FORMAT;
            result.measureName = value.source.displayName || "";
        }
        if (count) result.countName = count.source.displayName || "";
        result.extras = columns.filter((c) => c.source.roles && c.source.roles["tooltips"]).map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT, values: c.values }));
        const numberAt = (column: DataViewValueColumn | undefined, index: number): number | null => {
            const raw = column ? column.values[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        category.values.forEach((raw, index) => {
            result.points.push({ name: categoryText(raw, category.source.format), value: numberAt(value, index), count: count ? numberAt(count, index) : null });
            result.ids.set(String(index), [this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId()]);
        });
        return result;
    }
}

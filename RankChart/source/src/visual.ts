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
import { buildRanks, RankInput, RankLine } from "./model";
import { RankView } from "./view";
import { assignColours, MOVEMENT, OTHER_COLOUR } from "./common/colours";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData extends RankInput {
    ids: Map<string, ISelectionId[]>;
    format: string;
    names: { periods: string; series: string; value: string };
    extras: { name: string; format: string; values: (powerbi.PrimitiveValue | null)[][] }[];
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: RankView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new RankView(options.element);
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
            const ranks = buildRanks(data, Number(s.ranking.topCount.value) || 10, s.ranking.lowestFirst.value);

            // "One colour each": the leaders of the last period take the colours, in order; the rest are grey.
            const byMovement = String(s.colours.mode.value?.value ?? "movement") !== "entity";
            const leaders = ranks ? [...ranks.lines].sort((a, b) => (a.lastRank ?? 1e9) - (b.lastRank ?? 1e9)).map((line) => line.name) : [];
            const entityColours = assignColours(leaders, String(s.colours.source.value?.value) === "theme" ? "theme" : "builtIn", this.host.colorPalette);
            const colourOf = (line: RankLine) => (byMovement ? MOVEMENT[line.movement] : entityColours.get(line.name) || OTHER_COLOUR);

            const unit = chooseUnit(data.format, data.values.flat(), String(s.labels.units.value?.value ?? "auto"));
            const formatters = makeFormatters(data.format, unit, clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);

            this.view.render(ranks, {
                width: options.viewport.width,
                height: options.viewport.height,
                colourOf,
                showValues: s.labels.values.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: "Add fields to Periods and Ranked, and a measure to Values",
            }, {
                onSelect: (line, event) => this.interaction.select(String(line.series), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (line, event) => this.interaction.contextMenu(line ? String(line.series) : null, event),
                showTooltip: (line, period, event) => {
                    const point = line.points[period];
                    const items: TooltipItem[] = [
                        { displayName: data.names.series || "Ranked", value: line.name },
                        { displayName: data.names.periods || "Period", value: data.periods[period] },
                        { displayName: "Rank", value: point.rank === null ? "Not ranked" : String(point.rank) },
                    ];
                    if (point.value !== null) items.push({ displayName: data.names.value || "Value", value: full(point.value) });
                    if (line.change !== 0) items.push({ displayName: "Places since the start", value: `${line.change > 0 ? "Up" : "Down"} ${Math.abs(line.change)}` });
                    data.extras.forEach((extra) => {
                        const raw = extra.values[period][line.series];
                        if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "number" ? fullFormatter(extra.format)(raw) : String(raw) });
                    });
                    this.interaction.showTooltip(items, event, String(line.series));
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

    /** Periods come from the Periods field; the measure arrives once for each value of the Ranked field. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { periods: [], series: [], values: [], ids: new Map(), format: DEFAULT_FORMAT, names: { periods: "", series: "", value: "" }, extras: [] };
        const categorical = dataView && dataView.categorical;
        const valueColumns = categorical && categorical.values;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !valueColumns || valueColumns.length === 0 || !category) return result;
        const groups = typeof valueColumns.grouped === "function" ? valueColumns.grouped() : [];
        if (!valueColumns.source || groups.length === 0) return result;

        result.periods = category.values.map((raw) => categoryText(raw, category.source.format));
        result.names.periods = category.source.displayName || "";
        result.names.series = valueColumns.source.displayName || "";
        const inRole = (columns: DataViewValueColumn[], role: string) => columns.filter((c) => c.source.roles && c.source.roles[role]);
        const first = inRole(Array.from(valueColumns), "value")[0];
        if (!first) return result;
        result.format = first.source.format || DEFAULT_FORMAT;
        result.names.value = first.source.displayName || "";

        result.series = groups.map((group) => categoryText(group.name ?? null, valueColumns.source ? valueColumns.source.format : undefined));
        result.values = result.periods.map(() => groups.map(() => null));
        result.extras = inRole(groups[0].values, "tooltips").map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT, values: result.periods.map(() => groups.map(() => null)) }));
        groups.forEach((group, s) => {
            const value = inRole(group.values, "value")[0];
            const extras = inRole(group.values, "tooltips");
            result.periods.forEach((_, p) => {
                const raw = value ? value.values[p] : null;
                result.values[p][s] = typeof raw === "number" && isFinite(raw) ? raw : null;
                extras.forEach((extra, e) => {
                    if (result.extras[e]) result.extras[e].values[p][s] = extra.values[p] ?? null;
                });
            });
            // Selecting a line selects that customer (or product, or market) in every period.
            result.ids.set(String(s), [this.host.createSelectionIdBuilder().withSeries(valueColumns, group).createSelectionId()]);
        });
        return result;
    }
}

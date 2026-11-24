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
import { buildMekko, MekkoInput, segmentKey } from "./model";
import { MekkoView } from "./view";
import { assignColours, OTHER_LABEL } from "./common/colours";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters, share } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData extends MekkoInput {
    /** One id per cell, keyed "column|series" by position in the data. */
    cellIds: Map<string, ISelectionId>;
    format: string;
    names: { columns: string; series: string; value: string };
    extras: { name: string; format: string; values: (powerbi.PrimitiveValue | null)[][] }[];
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: MekkoView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new MekkoView(options.element);
        this.interaction = new Interaction(options.host, options.element, (keys) => this.view.setSelection(keys));
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            const mekko = buildMekko(data, String(s.layout.sortColumns.value?.value ?? "total") !== "none", Number(s.layout.maxSegments.value) || 7, Number(s.layout.maxColumns.value) || 10);

            // A segment can stand for several columns or series pooled as "Other": selecting it selects them all.
            const ids = new Map<string, ISelectionId[]>();
            if (mekko) {
                mekko.columns.forEach((column) => column.segments.forEach((segment) => {
                    const cells = segment.columns.flatMap((c) => segment.members.map((member) => data.cellIds.get(`${c}|${member}`)));
                    ids.set(segmentKey(segment), cells.filter((id): id is ISelectionId => !!id));
                }));
            }
            this.interaction.setIds(ids);

            // Colours go by the order the series arrive in, not by size, so a filter does not repaint them.
            const kept = mekko ? mekko.series.filter((name) => name !== OTHER_LABEL) : [];
            const inDataOrder = data.series.filter((name) => kept.includes(name));
            const colours = assignColours([...inDataOrder, OTHER_LABEL], String(s.colours.source.value?.value) === "theme" ? "theme" : "builtIn", this.host.colorPalette);

            const unit = chooseUnit(data.format, mekko ? mekko.columns.map((column) => column.total) : [], String(s.labels.units.value?.value ?? "auto"));
            const formatters = makeFormatters(data.format, unit, clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);
            const hasData = data.values.some((row) => row.some((v) => v !== null));

            this.view.render(mekko, {
                width: options.viewport.width,
                height: options.viewport.height,
                colours,
                gap: Math.max(0, Number(s.layout.gap.value ?? 2) || 0),
                showLabels: s.labels.show.value,
                labelContent: String(s.labels.content.value?.value) === "value" ? "value" : "share",
                showLegend: s.legend.show.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: hasData ? "There is nothing above zero to show" : "Add fields to Columns and Segments, and a measure to Values",
            }, {
                onSelect: (segment, event) => this.interaction.select(segmentKey(segment), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (segment, event) => this.interaction.contextMenu(segment ? segmentKey(segment) : null, event),
                showTooltip: (column, segment, event) => {
                    const items: TooltipItem[] = [
                        { displayName: data.names.columns || "Column", value: column.members.length > 1 ? `${OTHER_LABEL} (${column.members.map((m) => data.columns[m]).join(", ")})` : column.name },
                        { displayName: data.names.series || "Segment", value: segment.members.length > 1 ? `${OTHER_LABEL} (${segment.members.map((m) => data.series[m]).join(", ")})` : segment.name },
                        { displayName: data.names.value || "Value", value: full(segment.value) },
                        { displayName: `Share of ${column.name}`, value: share(segment.shareOfColumn, 1) },
                        { displayName: "Share of total", value: share(segment.shareOfTotal, 1) },
                    ];
                    if (segment.members.length === 1 && segment.columns.length === 1) {
                        data.extras.forEach((extra) => {
                            const raw = extra.values[segment.columns[0]][segment.members[0]];
                            if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "number" ? fullFormatter(extra.format)(raw) : String(raw) });
                        });
                    }
                    this.interaction.showTooltip(items, event, segmentKey(segment));
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

    /** Columns come from the Columns field; the measure arrives once for each value of the Segments field. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { columns: [], series: [], values: [], cellIds: new Map(), format: DEFAULT_FORMAT, names: { columns: "", series: "", value: "" }, extras: [] };
        const categorical = dataView && dataView.categorical;
        const valueColumns = categorical && categorical.values;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !valueColumns || valueColumns.length === 0 || !category) return result;

        result.columns = category.values.map((raw) => categoryText(raw, category.source.format));
        result.names.columns = category.source.displayName || "";
        const groups = typeof valueColumns.grouped === "function" ? valueColumns.grouped() : [];
        const grouped = !!valueColumns.source && groups.length > 0;
        result.names.series = valueColumns.source ? valueColumns.source.displayName || "" : "";
        const inRole = (columns: DataViewValueColumn[], role: string) => columns.filter((c) => c.source.roles && c.source.roles[role]);
        const first = inRole(Array.from(valueColumns), "value")[0];
        if (!first) return result;
        result.format = first.source.format || DEFAULT_FORMAT;
        result.names.value = first.source.displayName || "";

        const sets = grouped
            ? groups.map((group) => ({ name: categoryText(group.name ?? null, valueColumns.source ? valueColumns.source.format : undefined), columns: group.values, group }))
            : [{ name: result.names.value, columns: Array.from(valueColumns), group: null as powerbi.DataViewValueColumnGroup | null }];
        result.series = sets.map((set) => set.name);
        result.values = result.columns.map(() => sets.map(() => null));
        result.extras = inRole(sets[0].columns, "tooltips").map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT, values: result.columns.map(() => sets.map(() => null)) }));

        sets.forEach((set, s) => {
            const value = inRole(set.columns, "value")[0];
            const extras = inRole(set.columns, "tooltips");
            result.columns.forEach((_, c) => {
                const raw = value ? value.values[c] : null;
                result.values[c][s] = typeof raw === "number" && isFinite(raw) ? raw : null;
                extras.forEach((extra, e) => {
                    if (result.extras[e]) result.extras[e].values[c][s] = extra.values[c] ?? null;
                });
                let builder = this.host.createSelectionIdBuilder().withCategory(category, c);
                if (set.group) builder = builder.withSeries(valueColumns, set.group);
                result.cellIds.set(`${c}|${s}`, builder.createSelectionId());
            });
        });
        return result;
    }
}

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
import { buildScatter, LineMode } from "./model";
import { ScatterView } from "./view";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface Measure {
    name: string;
    format: string;
    values: (number | null)[];
}

interface ParsedData {
    names: string[];
    categoryName: string;
    x: Measure | null;
    y: Measure | null;
    size: Measure | null;
    extras: { name: string; format: string; values: powerbi.PrimitiveValue[] }[];
    ids: Map<string, ISelectionId[]>;
}

const LINE_LABELS: { [mode in LineMode]: string } = { median: "median", mean: "average", value: "" };

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: ScatterView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new ScatterView(options.element);
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

            const mode = (value: unknown): LineMode => (value === "mean" || value === "value" ? value : "median");
            const xMode = mode(s.quadrants.xLine.value?.value), yMode = mode(s.quadrants.yLine.value?.value);
            const xLog = s.axes.xLog.value, yLog = s.axes.yLog.value;
            const scatter = data.x && data.y
                ? buildScatter(
                    data.names.map((name, i) => ({ name, x: (data.x as Measure).values[i], y: (data.y as Measure).values[i], size: data.size ? data.size.values[i] : null })),
                    { mode: xMode, value: Number(s.quadrants.xValue.value) || 0, log: xLog },
                    { mode: yMode, value: Number(s.quadrants.yValue.value) || 0, log: yLog },
                )
                : null;

            // Each axis has its own measure, so its own format and unit: dollars across, a percentage up, say.
            const decimals = clampDecimals(s.labels.decimals.value);
            const unitChoice = String(s.labels.units.value?.value ?? "auto");
            const formattersFor = (measure: Measure | null) => {
                const format = measure ? measure.format : DEFAULT_FORMAT;
                return makeFormatters(format, chooseUnit(format, measure ? measure.values : [], unitChoice), decimals, this.host.locale);
            };
            const quadrantNames = {
                topRight: String(s.quadrants.topRight.value || ""), topLeft: String(s.quadrants.topLeft.value || ""),
                bottomRight: String(s.quadrants.bottomRight.value || ""), bottomLeft: String(s.quadrants.bottomLeft.value || ""),
            };

            this.view.render(scatter, {
                width: options.viewport.width,
                height: options.viewport.height,
                x: { name: data.x ? data.x.name : "", log: xLog, lineLabel: LINE_LABELS[xMode], formatters: formattersFor(data.x) },
                y: { name: data.y ? data.y.name : "", log: yLog, lineLabel: LINE_LABELS[yMode], formatters: formattersFor(data.y) },
                quadrantNames,
                color: s.points.color.value.value,
                labelCount: Math.max(0, Number(s.points.labelCount.value ?? 8) || 0),
                fontSize: Number(s.labels.fontSize.value) || 11,
                emptyMessage: data.x && data.y ? "There are no points with both an X and a Y value" : "Add a field to Points, and measures to X axis and Y axis",
            }, {
                onSelect: (point, event) => this.interaction.select(String(point.index), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (point, event) => this.interaction.contextMenu(point ? String(point.index) : null, event),
                showTooltip: (point, quadrant, event) => {
                    const items: TooltipItem[] = [{ displayName: data.categoryName || "Point", value: point.name }];
                    if (data.x) items.push({ displayName: data.x.name, value: fullFormatter(data.x.format)(point.x) });
                    if (data.y) items.push({ displayName: data.y.name, value: fullFormatter(data.y.format)(point.y) });
                    if (data.size && point.size !== null) items.push({ displayName: data.size.name, value: fullFormatter(data.size.format)(point.size) });
                    if (quadrantNames[quadrant].trim()) items.push({ displayName: "Quadrant", value: quadrantNames[quadrant].trim() });
                    data.extras.forEach((extra) => {
                        const raw = extra.values[point.index];
                        if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "number" ? fullFormatter(extra.format)(raw) : String(raw) });
                    });
                    this.interaction.showTooltip(items, event, String(point.index));
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
        const result: ParsedData = { names: [], categoryName: "", x: null, y: null, size: null, extras: [], ids: new Map() };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !category) return result;
        const columns: DataViewValueColumn[] = categorical.values ? Array.from(categorical.values) : [];
        const measure = (role: string): Measure | null => {
            const column = columns.find((c) => c.source.roles && c.source.roles[role]);
            if (!column) return null;
            return { name: column.source.displayName || "", format: column.source.format || DEFAULT_FORMAT, values: column.values.map((raw) => (typeof raw === "number" && isFinite(raw) ? raw : null)) };
        };
        result.categoryName = category.source.displayName || "";
        result.x = measure("x");
        result.y = measure("y");
        result.size = measure("size");
        result.extras = columns.filter((c) => c.source.roles && c.source.roles["tooltips"]).map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT, values: c.values }));
        category.values.forEach((raw, index) => {
            result.names.push(categoryText(raw, category.source.format));
            result.ids.set(String(index), [this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId()]);
        });
        return result;
    }
}

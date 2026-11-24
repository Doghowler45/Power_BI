"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService, formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { buildBars, MeasureValue, WaterfallBar, WaterfallChart, WaterfallOptions } from "./waterfall";

const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

interface ParsedData {
    base: MeasureValue | null;
    steps: MeasureValue[];
    /** Format string of each measure, by key. */
    formats: Map<string, string>;
    selectionIds: Map<string, ISelectionId>;
    /** Query name of each step measure, by key: needed to save a per-measure setting. */
    queryNames: Map<string, string>;
}

/** Format-pane object and property that mark a step measure as a subtotal bar. */
const STEP_TYPE_OBJECT = "stepType";
const SUBTOTAL_PROPERTY = "subtotal";

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly chart: WaterfallChart;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.chart = new WaterfallChart(this.target);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readMeasures(dataView);

            // One "show as subtotal" switch per step measure, saved against that measure.
            s.subtotals.slices = data.steps
                .filter((step) => data.queryNames.has(step.key))
                .map((step) => new formattingSettings.ToggleSwitch({
                    name: SUBTOTAL_PROPERTY,
                    displayName: step.label,
                    value: !!step.subtotal,
                    selector: { metadata: data.queryNames.get(step.key) },
                }));
            s.subtotals.visible = s.subtotals.slices.length > 0;

            const totalLabel = (s.total.label.value || "").trim() || "Total";
            const bars = buildBars(data.base, data.steps, totalLabel, s.total.show.value);

            // One unit for the whole chart so bars can be compared: chosen from the largest level shown.
            const largest = bars.reduce((m, b) => Math.max(m, Math.abs(b.start), Math.abs(b.end)), 0);
            const unitChoice = String(s.labels.units.value?.value ?? "auto");
            const unit = unitChoice === "auto"
                ? (largest >= 1e9 ? 1e9 : largest >= 1e6 ? 1e6 : largest >= 1e3 ? 1e3 : 1)
                : UNIT_VALUES[unitChoice] ?? 1;
            const decimals = Math.min(4, Math.max(0, Math.round(Number(s.labels.decimals.value) || 0)));
            // The total and the axis use the base measure's format, or the first step's if there is no base.
            const mainKey = data.base ? data.base.key : data.steps.length ? data.steps[0].key : "";
            const mainFormat = data.formats.get(mainKey) || DEFAULT_FORMAT;
            const short = valueFormatter.create({
                format: mainFormat,
                value: unit,
                precision: unit > 1 ? decimals : undefined,
                cultureSelector: this.host.locale,
            });
            const formatOf = (bar: WaterfallBar) => data.formats.get(bar.key) || mainFormat;

            const chartOptions: WaterfallOptions = {
                width: options.viewport.width,
                height: options.viewport.height,
                baseColor: s.bars.baseColor.value.value,
                totalColor: s.bars.totalColor.value.value,
                increaseColor: s.bars.increaseColor.value.value,
                decreaseColor: s.bars.decreaseColor.value.value,
                barGap: Math.min(80, Math.max(0, Number(s.bars.gap.value) || 0)) / 100,
                cornerRadius: Math.min(20, Math.max(0, Number(s.bars.cornerRadius.value) || 0)),
                showConnectors: s.bars.connectors.value,
                connectorColor: s.axis.color.value.value,
                showLabels: s.labels.show.value,
                labelSize: Number(s.labels.fontSize.value) || 11,
                labelColor: s.labels.color.value.value,
                signedSteps: s.labels.signed.value,
                categorySize: Number(s.category.fontSize.value) || 10,
                categoryColor: s.category.color.value.value,
                showValueAxis: s.axis.show.value,
                startAtZero: s.axis.startAtZero.value,
                axisColor: s.axis.color.value.value,
                formatShort: (value: number) => short.format(value),
                formatFull: (value: number, bar: WaterfallBar) => valueFormatter.format(value, formatOf(bar)),
                emptyMessage: "Add a Base measure and one or more Step measures",
            };

            this.chart.render(bars, chartOptions, {
                showTooltip: (items, event, bar) => {
                    const box = this.target.getBoundingClientRect();
                    const id = data.selectionIds.get(bar.key);
                    this.host.tooltipService.show({
                        coordinates: [event.clientX - box.left, event.clientY - box.top],
                        isTouchEvent: false,
                        dataItems: items,
                        identities: id ? [id] : [],
                    });
                },
                hideTooltip: () => {
                    this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
                },
                onContextMenu: (bar, event) => {
                    const id = bar ? data.selectionIds.get(bar.key) : undefined;
                    this.selectionManager.showContextMenu(id ? id : {}, { x: event.clientX, y: event.clientY });
                },
            });
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /** Reads the single value of each measure, keeping the order of the Steps field well. */
    private readMeasures(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { base: null, steps: [], formats: new Map(), selectionIds: new Map(), queryNames: new Map() };
        const columns = dataView && dataView.categorical && dataView.categorical.values;
        if (!columns) return result;

        columns.forEach((column, index) => {
            const source = column.source;
            const roles = source.roles || {};
            const raw = column.values && column.values.length ? column.values[0] : null;
            const value = typeof raw === "number" && isFinite(raw) ? raw : null;
            const key = `${index}:${source.queryName || source.displayName}`;
            const measure: MeasureValue = { key, label: source.displayName || "", value };
            if (source.format) result.formats.set(key, source.format);
            if (source.queryName) {
                result.selectionIds.set(key, this.host.createSelectionIdBuilder().withMeasure(source.queryName).createSelectionId());
            }
            // A measure dropped in both wells counts as the base once, then as a step.
            if (roles["base"] && !result.base) {
                result.base = measure;
                if (roles["steps"]) result.steps.push({ ...measure, key: key + ":step" });
            } else if (roles["steps"]) {
                const stepType = source.objects && source.objects[STEP_TYPE_OBJECT];
                measure.subtotal = !!(stepType && stepType[SUBTOTAL_PROPERTY]);
                if (source.queryName) result.queryNames.set(key, source.queryName);
                result.steps.push(measure);
            }
        });
        return result;
    }
}

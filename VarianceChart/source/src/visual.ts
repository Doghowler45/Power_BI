"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
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
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";
import { chooseScenario, Scenario, SCENARIO_CODE, Series, SortDirection, SortField } from "./varianceModel";
import { ChartOptions, selectionKey, VarianceChart } from "./varianceChart";

const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };
const SCENARIO_NAMES: { [scenario in Scenario]: string } = { py: "Previous year", pl: "Plan", fc: "Forecast" };
const SORT_FIELDS: SortField[] = ["none", "value", "delta", "deltaPercent"];

interface ParsedData {
    series: Series[];
    /** True when a field is in Group. */
    grouped: boolean;
    /** Keyed by `selectionKey(series, row)`: one entry per category, and one per category within each group. */
    selectionIds: Map<string, ISelectionId>;
    /** Format string of the Actual measure (or the first measure supplied). */
    format: string;
    names: { actual: string; py: string; pl: string; fc: string };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly chart: VarianceChart;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private selectionIds: Map<string, ISelectionId> = new Map();
    private lastOptions: VisualUpdateOptions | null = null;
    /**
     * The sort chosen by clicking a chart title. It is saved to the report where that is allowed
     * (editing); where it is not (a published report being read) it is kept here for the session.
     * `basis` is the saved setting at the moment of the click: once the saved setting differs
     * from it, the saved setting has moved on and takes over again.
     */
    private clickedSort: { field: SortField; direction: SortDirection; basis: string } | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.chart = new VarianceChart(this.target);
        // Keeps the dimming in step when a bookmark or another action changes the selection.
        this.selectionManager.registerOnSelectCallback(() => this.syncSelection());
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        this.lastOptions = options;
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            this.selectionIds = data.selectionIds;

            const allPoints = data.series.flatMap((series) => series.points);
            const preferred = String(s.comparison.scenario.value?.value ?? "auto");
            const scenario = chooseScenario(allPoints, preferred === "py" || preferred === "pl" || preferred === "fc" ? preferred : "auto");

            // One unit for the whole visual so every label can be compared. It is chosen from the
            // typical (median) value, not the largest: one big category must not push the rest
            // into reading "0.0bn".
            const sizes = allPoints
                .flatMap((p) => [p.actual ?? p.forecast, scenario === "py" ? p.previousYear : scenario === "pl" ? p.plan : scenario === "fc" ? p.forecast : null])
                .filter((v): v is number => v !== null && v !== 0)
                .map((v) => Math.abs(v))
                .sort((x, y) => x - y);
            const typical = sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : 0;
            const unitChoice = String(s.labels.units.value?.value ?? "auto");
            const unit = unitChoice === "auto"
                ? (typical >= 1e9 ? 1e9 : typical >= 1e6 ? 1e6 : typical >= 1e3 ? 1e3 : 1)
                : UNIT_VALUES[unitChoice] ?? 1;
            const decimals = Math.min(4, Math.max(0, Math.round(Number(s.labels.decimals.value) || 0)));
            const short = valueFormatter.create({
                format: data.format,
                value: unit,
                precision: unit > 1 ? decimals : undefined,
                cultureSelector: this.host.locale,
            });

            // Sorting: the saved setting, unless a chart title has been clicked since it last changed.
            const savedField = String(s.sort.field.value?.value ?? "none");
            const savedDirection = String(s.sort.direction.value?.value ?? "desc");
            const savedKey = `${savedField}|${savedDirection}`;
            if (this.clickedSort && this.clickedSort.basis !== savedKey) this.clickedSort = null;
            const sortField: SortField = this.clickedSort ? this.clickedSort.field : (SORT_FIELDS.find((f) => f === savedField) ?? "none");
            const sortDirection: SortDirection = this.clickedSort ? this.clickedSort.direction : savedDirection === "asc" ? "asc" : "desc";

            const baseName = scenario
                ? (scenario === "py" ? data.names.py : scenario === "pl" ? data.names.pl : data.names.fc) || SCENARIO_NAMES[scenario]
                : "";
            const chartOptions: ChartOptions = {
                width: options.viewport.width,
                height: options.viewport.height,
                orientation: String(s.layout.orientation.value?.value) === "bars" ? "bars" : "columns",
                // A bridge needs something to bridge from.
                chartType: String(s.layout.chartType.value?.value) === "waterfall" && scenario ? "waterfall" : "variance",
                groupMode: String(s.groups.mode.value?.value) === "stacked" ? "stacked" : "multiples",
                sameScale: s.groups.sameScale.value,
                scenario,
                showAbsolute: s.layout.absolute.value,
                showRelative: s.layout.relative.value,
                higherIsWorse: s.comparison.higherIsWorse.value,
                showTotal: s.totals.show.value,
                totalLabel: String(s.totals.label.value || "").trim() || "Total",
                sortField,
                sortDirection,
                showComments: s.comments.show.value,
                actualColor: s.colours.actual.value.value,
                previousYearColor: s.colours.previousYear.value.value,
                goodColor: s.colours.good.value.value,
                badColor: s.colours.bad.value.value,
                textColor: s.category.color.value.value,
                showLabels: s.labels.show.value,
                labelSize: Number(s.labels.fontSize.value) || 9,
                categorySize: Number(s.category.fontSize.value) || 10,
                formatValue: (value: number) => short.format(value),
                formatFull: (value: number) => valueFormatter.format(value, data.format),
                valueName: data.names.actual || "Actual",
                baseName: scenario ? `${baseName} (${SCENARIO_CODE[scenario]})` : "",
                emptyMessage: "Add a Category and an Actual measure, then a Plan or Previous year measure to compare against",
            };

            const idFor = (seriesIndex: number | null, rowKey: string) => this.selectionIds.get(selectionKey(seriesIndex, rowKey));
            this.chart.render({ series: data.series, grouped: data.grouped }, chartOptions, {
                onSelect: (seriesIndex, row, event) => {
                    if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                    const id = idFor(seriesIndex, row.key);
                    if (!id) return;
                    this.selectionManager.select(id, event.ctrlKey || event.metaKey).then(() => this.syncSelection());
                },
                onClear: () => {
                    if (!this.selectionManager.hasSelection()) return;
                    this.selectionManager.clear().then(() => this.syncSelection());
                },
                onContextMenu: (seriesIndex, row, event) => {
                    const id = row ? idFor(seriesIndex, row.key) : undefined;
                    this.selectionManager.showContextMenu(id ? id : {}, { x: event.clientX, y: event.clientY });
                },
                showTooltip: (items, event, seriesIndex, row) => {
                    const box = this.target.getBoundingClientRect();
                    const id = idFor(seriesIndex, row.key);
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
                onSort: (field, direction) => {
                    this.clickedSort = { field, direction, basis: savedKey };
                    this.host.persistProperties({ merge: [{ objectName: "sort", selector: null as unknown as powerbi.data.Selector, properties: { field, direction } }] });
                    if (this.lastOptions) this.update(this.lastOptions);
                },
            });
            this.syncSelection();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /**
     * Reads one value per category for each measure supplied. With a field in Group the
     * measures arrive once per group, and each group becomes its own series.
     */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { series: [], grouped: false, selectionIds: new Map(), format: DEFAULT_FORMAT, names: { actual: "", py: "", pl: "", fc: "" } };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !category) return result;

        const values = categorical.values;
        const allColumns: DataViewValueColumn[] = values ? Array.from(values) : [];
        const groups = values && typeof values.grouped === "function" ? values.grouped() : [];
        result.grouped = !!(values && values.source) && groups.length > 0;
        const groupFormat = values && values.source ? values.source.format : undefined;

        const find = (columns: DataViewValueColumn[], role: string) => columns.find((c) => c.source.roles && c.source.roles[role]);
        const actualAny = find(allColumns, "actual"), pyAny = find(allColumns, "previousYear"), plAny = find(allColumns, "plan"), fcAny = find(allColumns, "forecast");
        const first = actualAny || plAny || pyAny || fcAny;
        if (first && first.source.format) result.format = first.source.format;
        const nameOf = (column: DataViewValueColumn | undefined) => (column ? column.source.displayName || "" : "");
        result.names = { actual: nameOf(actualAny), py: nameOf(pyAny), pl: nameOf(plAny), fc: nameOf(fcAny) };

        const numberAt = (column: DataViewValueColumn | undefined, index: number): number | null => {
            const raw = column ? column.values[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        const textAt = (column: DataViewValueColumn | undefined, index: number): string | null => {
            const raw = column ? column.values[index] : null;
            const text = raw === null || raw === undefined ? "" : String(raw).trim();
            return text ? text : null;
        };
        const show = (raw: powerbi.PrimitiveValue, format: string | undefined) =>
            raw === null || raw === undefined ? "(Blank)" : typeof raw === "string" ? raw : valueFormatter.format(raw, format);

        // Dates and numbers used as categories are shown in the column's own format.
        const labels = category.values.map((raw) => show(raw, category.source.format));
        const keys = labels.map((label, index) => `${index}:${label}`);
        keys.forEach((key, index) => {
            result.selectionIds.set(selectionKey(null, key), this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId());
        });

        const sets: { name: string; columns: DataViewValueColumn[]; group: powerbi.DataViewValueColumnGroup | null }[] = result.grouped
            ? groups.map((group) => ({ name: show(group.name ?? null, groupFormat), columns: group.values, group }))
            : [{ name: "", columns: allColumns, group: null }];

        sets.forEach((set, seriesIndex) => {
            const actual = find(set.columns, "actual"), py = find(set.columns, "previousYear"), pl = find(set.columns, "plan"), fc = find(set.columns, "forecast");
            const comment = find(set.columns, "comment");
            result.series.push({
                name: set.name,
                points: keys.map((key, index) => ({
                    key,
                    category: labels[index],
                    actual: numberAt(actual, index),
                    previousYear: numberAt(py, index),
                    plan: numberAt(pl, index),
                    forecast: numberAt(fc, index),
                    comment: textAt(comment, index),
                })),
            });
            if (set.group && values) {
                const group = set.group;
                keys.forEach((key, index) => {
                    result.selectionIds.set(
                        selectionKey(seriesIndex, key),
                        this.host.createSelectionIdBuilder().withCategory(category, index).withSeries(values, group).createSelectionId(),
                    );
                });
            }
        });
        return result;
    }

    /** Dims every mark that is not part of the current selection. */
    private syncSelection(): void {
        const selected = this.selectionManager.getSelectionIds() as ISelectionId[];
        const keys = new Set<string>();
        if (selected && selected.length) {
            this.selectionIds.forEach((id, key) => {
                if (selected.some((sel) => sel.equals(id))) keys.add(key);
            });
        }
        this.chart.setSelection(keys);
    }
}

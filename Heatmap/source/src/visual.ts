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
import { HeatData, Scope } from "./heatModel";
import { buildRamp, Palette, PALETTES } from "./palettes";
import { cellKey, HeatmapView } from "./heatmapView";

const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

interface ExtraValue {
    name: string;
    format: string;
    /** `values[row][column]` */
    values: (powerbi.PrimitiveValue | null)[][];
}

interface ParsedData extends HeatData {
    selectionIds: Map<string, ISelectionId>;
    format: string;
    names: { rows: string; columns: string; value: string };
    extras: ExtraValue[];
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly view: HeatmapView;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private selectionIds: Map<string, ISelectionId> = new Map();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.view = new HeatmapView(this.target);
        // Keeps the dimming in step when a bookmark or another action changes the selection.
        this.selectionManager.registerOnSelectCallback(() => this.syncSelection());
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            this.selectionIds = data.selectionIds;

            // ---- colour scale
            const choice = String(s.colours.palette.value?.value ?? "green");
            const custom: Palette = s.colours.customTwoSided.value
                ? { stops: [s.colours.customLow.value.value, s.colours.customMid.value.value, s.colours.customHigh.value.value], twoSided: true }
                : { stops: [s.colours.customLow.value.value, s.colours.customHigh.value.value], twoSided: false };
            const palette = choice === "custom" ? custom : PALETTES[choice] || PALETTES.green;
            const scopeChoice = String(s.colours.scope.value?.value ?? "all");
            const scope: Scope = scopeChoice === "row" || scopeChoice === "column" ? scopeChoice : "all";

            // ---- numbers: one unit for the whole grid, from the typical (median) value
            const isPercent = data.format.indexOf("%") >= 0;
            const sizes = data.values.flat().filter((v): v is number => v !== null && v !== 0).map((v) => Math.abs(v)).sort((x, y) => x - y);
            const typical = sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : 0;
            const unitChoice = String(s.values.units.value?.value ?? "auto");
            const unit = isPercent ? 1
                : unitChoice === "auto" ? (typical >= 1e9 ? 1e9 : typical >= 1e6 ? 1e6 : typical >= 1e3 ? 1e3 : 1)
                : UNIT_VALUES[unitChoice] ?? 1;
            const decimals = Math.min(4, Math.max(0, Math.round(Number(s.values.decimals.value) || 0)));
            // The preferred form first, then the same with fewer decimal places, for cells too small for it.
            const scaled = unit > 1 || isPercent;
            const formatters = (scaled ? Array.from({ length: decimals + 1 }, (_, i) => decimals - i) : [undefined]).map((precision) => {
                const formatter = valueFormatter.create({ format: data.format, value: unit, precision, cultureSelector: this.host.locale });
                const zero = formatter.format(0);
                // A value that rounds to nothing is written as plain zero, not "-0%".
                return (value: number) => {
                    const text = formatter.format(value);
                    return /[1-9]/.test(text) ? text : zero;
                };
            });

            this.view.render(data, {
                width: options.viewport.width,
                height: options.viewport.height,
                ramp: buildRamp(palette, s.colours.reverse.value),
                scale: { twoSided: palette.twoSided, midpoint: Number(s.colours.midpoint.value) || 0, scope, zeroBased: s.colours.zeroBased.value },
                gap: Math.max(0, Number(s.cells.gap.value ?? 3) || 0),
                radius: Math.max(0, Number(s.cells.radius.value ?? 6) || 0),
                maxCellHeight: Math.max(8, Number(s.cells.maxHeight.value) || 56),
                showValues: s.values.show.value,
                valueFontSize: Number(s.values.fontSize.value) || 11,
                axisFontSize: Number(s.axis.fontSize.value) || 11,
                axisColor: s.axis.color.value.value,
                sortRows: String(s.axis.sortRows.value?.value) === "total",
                sortColumns: String(s.axis.sortColumns.value?.value) === "total",
                showLegend: s.legend.show.value,
                legendTop: String(s.legend.position.value?.value) === "top",
                formatters,
                hatchEmpty: String(s.cells.empty.value?.value ?? "hatch") !== "blank",
                emptyMessage: "Add a measure to Values, then fields to Rows and Columns",
            }, {
                onSelect: (row, column, event) => {
                    if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                    const id = this.selectionIds.get(cellKey(row, column));
                    if (!id) return;
                    this.selectionManager.select(id, event.ctrlKey || event.metaKey).then(() => this.syncSelection());
                },
                onClear: () => {
                    if (!this.selectionManager.hasSelection()) return;
                    this.selectionManager.clear().then(() => this.syncSelection());
                },
                onContextMenu: (row, column, event) => {
                    const id = row !== null && column !== null ? this.selectionIds.get(cellKey(row, column)) : undefined;
                    this.selectionManager.showContextMenu(id ? id : {}, { x: event.clientX, y: event.clientY });
                },
                showTooltip: (row, column, event) => {
                    const value = data.values[row][column] ?? null;
                    const items: powerbi.extensibility.VisualTooltipDataItem[] = [];
                    if (data.rows[row] !== "") items.push({ displayName: data.names.rows || "Row", value: data.rows[row] });
                    items.push({ displayName: data.names.columns || "Column", value: data.columns[column] });
                    items.push({ displayName: data.names.value || "Value", value: value === null ? "No data" : valueFormatter.format(value, data.format) });
                    data.extras.forEach((extra) => {
                        const raw = extra.values[row][column];
                        if (raw !== null && raw !== undefined) items.push({ displayName: extra.name, value: typeof raw === "string" ? raw : valueFormatter.format(raw, extra.format) });
                    });
                    const box = this.target.getBoundingClientRect();
                    const id = this.selectionIds.get(cellKey(row, column));
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
     * Reads the grid. Rows come from the Rows field; columns from the Columns field, where the
     * measure arrives once per value. With no Columns field there is a single column, named
     * after the measure; with no Rows field, a single row.
     */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { rows: [], columns: [], values: [], selectionIds: new Map(), format: DEFAULT_FORMAT, names: { rows: "", columns: "", value: "" }, extras: [] };
        const categorical = dataView && dataView.categorical;
        const valueColumns = categorical && categorical.values;
        if (!categorical || !valueColumns || valueColumns.length === 0) return result;

        const category = categorical.categories && categorical.categories[0];
        const show = (raw: powerbi.PrimitiveValue, format: string | undefined) =>
            raw === null || raw === undefined ? "(Blank)" : typeof raw === "string" ? raw : valueFormatter.format(raw, format);
        result.rows = category ? category.values.map((raw) => show(raw, category.source.format)) : [""];
        result.names.rows = category ? category.source.displayName || "" : "";

        const groups = typeof valueColumns.grouped === "function" ? valueColumns.grouped() : [];
        const grouped = !!valueColumns.source && groups.length > 0;
        const seriesFormat = valueColumns.source ? valueColumns.source.format : undefined;
        result.names.columns = valueColumns.source ? valueColumns.source.displayName || "" : "";
        const sets: { name: string; columns: DataViewValueColumn[]; group: powerbi.DataViewValueColumnGroup | null }[] = grouped
            ? groups.map((group) => ({ name: show(group.name ?? null, seriesFormat), columns: group.values, group }))
            : [{ name: "", columns: Array.from(valueColumns), group: null }];

        const inRole = (columns: DataViewValueColumn[], role: string) => columns.filter((c) => c.source.roles && c.source.roles[role]);
        const firstValue = inRole(Array.from(valueColumns), "value")[0];
        if (!firstValue) return result;
        result.format = firstValue.source.format || DEFAULT_FORMAT;
        result.names.value = firstValue.source.displayName || "";
        if (!grouped) {
            sets[0].name = result.names.value;
            result.names.columns = "Measure";
        }
        result.columns = sets.map((set) => set.name);

        const rowCount = result.rows.length;
        result.values = result.rows.map(() => sets.map(() => null));
        const extraNames = inRole(sets[0].columns, "tooltips").map((c) => ({ name: c.source.displayName || "", format: c.source.format || DEFAULT_FORMAT }));
        result.extras = extraNames.map((extra) => ({ ...extra, values: result.rows.map(() => sets.map(() => null)) }));

        sets.forEach((set, columnIndex) => {
            const value = inRole(set.columns, "value")[0];
            const extras = inRole(set.columns, "tooltips");
            for (let row = 0; row < rowCount; row++) {
                const raw = value ? value.values[row] : null;
                result.values[row][columnIndex] = typeof raw === "number" && isFinite(raw) ? raw : null;
                extras.forEach((extra, e) => {
                    if (result.extras[e]) result.extras[e].values[row][columnIndex] = extra.values[row] ?? null;
                });
                let builder = this.host.createSelectionIdBuilder();
                if (category) builder = builder.withCategory(category, row);
                if (set.group) builder = builder.withSeries(valueColumns, set.group);
                else if (value && value.source.queryName) builder = builder.withMeasure(value.source.queryName);
                result.selectionIds.set(cellKey(row, columnIndex), builder.createSelectionId());
            }
        });
        return result;
    }

    /** Dims every cell that is not part of the current selection. */
    private syncSelection(): void {
        const selected = this.selectionManager.getSelectionIds() as ISelectionId[];
        const keys = new Set<string>();
        if (selected && selected.length) {
            this.selectionIds.forEach((id, key) => {
                if (selected.some((sel) => sel.equals(id))) keys.add(key);
            });
        }
        this.view.setSelection(keys);
    }
}

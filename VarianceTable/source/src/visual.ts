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
import { Point, Scenario, SortDirection } from "./varianceModel";
import { TableOptions, VarianceTableView } from "./tableView";

const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

interface ParsedData {
    points: Point[];
    selectionIds: Map<string, ISelectionId>;
    /** Format string of the Actual measure (or the first measure supplied). */
    format: string;
    categoryTitle: string;
    names: { actual: string; pl: string; py: string; fc: string; comment: string };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly view: VarianceTableView;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private selectionIds: Map<string, ISelectionId> = new Map();
    private lastOptions: VisualUpdateOptions | null = null;
    /**
     * The sort chosen by clicking a heading. It is saved to the report where that is allowed
     * (editing); where it is not (a published report being read) it is kept here for the session.
     * `basis` is the saved setting at the moment of the click: once the saved setting differs
     * from it, the saved setting has moved on and takes over again.
     */
    private clickedSort: { column: string; direction: SortDirection; basis: string } | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.view = new VarianceTableView(this.target);
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

            const has = (pick: (p: Point) => number | null) => data.points.some((p) => pick(p) !== null);
            const scenarios: Scenario[] = [];
            if (s.columns.plan.value && has((p) => p.plan)) scenarios.push("pl");
            if (s.columns.previousYear.value && has((p) => p.previousYear)) scenarios.push("py");

            // One unit for the whole table, chosen from the typical (median) value so that one
            // large row does not push the rest into reading "0.0bn".
            const sizes = data.points
                .flatMap((p) => [p.actual ?? p.forecast, p.plan, p.previousYear])
                .filter((v): v is number => v !== null && v !== 0)
                .map((v) => Math.abs(v))
                .sort((x, y) => x - y);
            const typical = sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : 0;
            const unitChoice = String(s.numbers.units.value?.value ?? "auto");
            const unit = unitChoice === "auto"
                ? (typical >= 1e9 ? 1e9 : typical >= 1e6 ? 1e6 : typical >= 1e3 ? 1e3 : 1)
                : UNIT_VALUES[unitChoice] ?? 1;
            const decimals = Math.min(4, Math.max(0, Math.round(Number(s.numbers.decimals.value) || 0)));
            const short = valueFormatter.create({ format: data.format, value: unit, precision: unit > 1 ? decimals : undefined, cultureSelector: this.host.locale });

            // Sorting: the saved setting, unless a heading has been clicked since it last changed.
            const savedColumn = String(s.sortState.column.value || "");
            const savedDirection: SortDirection = String(s.sortState.direction.value || "desc") === "asc" ? "asc" : "desc";
            const savedKey = `${savedColumn}|${savedDirection}`;
            if (this.clickedSort && this.clickedSort.basis !== savedKey) this.clickedSort = null;

            const tableOptions: TableOptions = {
                scenarios,
                showAbsolute: s.columns.absolute.value,
                showRelative: s.columns.relative.value,
                showBars: s.columns.bars.value,
                showComments: s.columns.comments.value,
                higherIsWorse: s.comparison.higherIsWorse.value,
                showTotal: s.totals.show.value,
                totalLabel: String(s.totals.label.value || "").trim() || "Total",
                sortColumn: this.clickedSort ? this.clickedSort.column : savedColumn,
                sortDirection: this.clickedSort ? this.clickedSort.direction : savedDirection,
                categoryTitle: data.categoryTitle,
                names: data.names,
                actualColor: s.colours.actual.value.value,
                previousYearColor: s.colours.previousYear.value.value,
                goodColor: s.colours.good.value.value,
                badColor: s.colours.bad.value.value,
                textColor: s.text.color.value.value,
                headerColor: s.text.headerColor.value.value,
                fontSize: Number(s.text.fontSize.value) || 11,
                rowPadding: Math.max(0, Number(s.grid.rowPadding.value) || 0),
                showLines: s.grid.lines.value,
                lineColor: s.grid.lineColor.value.value,
                formatValue: (value: number) => short.format(value),
                formatFull: (value: number) => valueFormatter.format(value, data.format),
                emptyMessage: "Add a Category and an Actual measure, then a Plan or Previous year measure to compare against",
            };

            this.view.render(data.points, tableOptions, {
                onSelect: (rowKey, event) => {
                    if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                    const id = this.selectionIds.get(rowKey);
                    if (!id) return;
                    this.selectionManager.select(id, event.ctrlKey || event.metaKey).then(() => this.syncSelection());
                },
                onClear: () => {
                    if (!this.selectionManager.hasSelection()) return;
                    this.selectionManager.clear().then(() => this.syncSelection());
                },
                onContextMenu: (rowKey, event) => {
                    const id = rowKey ? this.selectionIds.get(rowKey) : undefined;
                    this.selectionManager.showContextMenu(id ? id : {}, { x: event.clientX, y: event.clientY });
                },
                onSort: (column, direction) => {
                    this.clickedSort = { column, direction, basis: savedKey };
                    this.host.persistProperties({ merge: [{ objectName: "sortState", selector: null as unknown as powerbi.data.Selector, properties: { column, direction } }] });
                    if (this.lastOptions) this.update(this.lastOptions);
                },
            }, options.viewport.width, options.viewport.height);
            this.syncSelection();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /** Reads one value per category for each measure that has been supplied. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { points: [], selectionIds: new Map(), format: DEFAULT_FORMAT, categoryTitle: "", names: { actual: "", pl: "", py: "", fc: "", comment: "" } };
        const categorical = dataView && dataView.categorical;
        const category = categorical && categorical.categories && categorical.categories[0];
        if (!categorical || !category) return result;

        const columns: DataViewValueColumn[] = categorical.values ? Array.from(categorical.values) : [];
        const find = (role: string) => columns.find((c) => c.source.roles && c.source.roles[role]);
        const actual = find("actual"), py = find("previousYear"), pl = find("plan"), fc = find("forecast"), comment = find("comment");
        const first = actual || pl || py || fc;
        if (first && first.source.format) result.format = first.source.format;
        const nameOf = (column: DataViewValueColumn | undefined) => (column ? column.source.displayName || "" : "");
        result.names = { actual: nameOf(actual), pl: nameOf(pl), py: nameOf(py), fc: nameOf(fc), comment: nameOf(comment) };
        result.categoryTitle = category.source.displayName || "";

        const numberAt = (column: DataViewValueColumn | undefined, index: number): number | null => {
            const raw = column ? column.values[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        const textAt = (column: DataViewValueColumn | undefined, index: number): string | null => {
            const raw = column ? column.values[index] : null;
            const text = raw === null || raw === undefined ? "" : String(raw).trim();
            return text ? text : null;
        };
        const categoryFormat = category.source.format;

        category.values.forEach((raw, index) => {
            // Dates and numbers used as categories are shown in the column's own format.
            const label = raw === null || raw === undefined ? "(Blank)" : typeof raw === "string" ? raw : valueFormatter.format(raw, categoryFormat);
            const key = `${index}:${label}`;
            result.points.push({
                key,
                category: label,
                actual: numberAt(actual, index),
                previousYear: numberAt(py, index),
                plan: numberAt(pl, index),
                forecast: numberAt(fc, index),
                comment: textAt(comment, index),
            });
            result.selectionIds.set(key, this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId());
        });
        return result;
    }

    /** Dims every row that is not part of the current selection. */
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

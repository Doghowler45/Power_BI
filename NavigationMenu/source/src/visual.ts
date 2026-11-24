"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { BasicFilter } from "powerbi-models";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";
import { buildMenu, MenuEntry, MenuSection, RawRow, resolveLink, samePage } from "./menuModel";
import { NavigationMenuView } from "./menuView";

/** The table and column the Page field comes from: what the visual filters when an entry is chosen. */
interface FilterTarget {
    table: string;
    column: string;
}

/** The parts of a saved filter this visual reads back to see what is selected. */
interface SavedFilter {
    target?: { table?: string; column?: string };
    values?: unknown[];
}

interface ParsedData {
    menu: MenuSection[];
    target: FilterTarget | null;
    hasPage: boolean;
    hasLink: boolean;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly view: NavigationMenuView;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    /** The page chosen and waiting for the Go button. Follows the filter this visual has applied. */
    private selectedPage: string | null = null;
    private lastOptions: VisualUpdateOptions | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.view = new NavigationMenuView(this.target);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        this.lastOptions = options;
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            const linkMode = String(s.navigation.mode.value?.value ?? "button") === "link";
            const reportUrl = String(s.navigation.reportUrl.value || "");

            // The filter this visual applied earlier (or one restored by a bookmark) says what is selected.
            this.selectedPage = linkMode ? null : this.readSelection(options.jsonFilters, data.target);

            this.view.render(data.menu, {
                width: options.viewport.width,
                height: options.viewport.height,
                currentPage: String(s.navigation.currentPage.value || ""),
                selectedPage: this.selectedPage,
                openOnHover: s.navigation.openOnHover.value,
                barHeight: Math.min(Math.max(16, Number(s.header.height.value) || 32), Math.max(16, options.viewport.height)),
                fontSize: Number(s.header.fontSize.value) || 13,
                textColor: s.header.color.value.value,
                activeColor: s.header.activeColor.value.value,
                hoverColor: s.header.hoverColor.value.value,
                barColor: s.header.fill.value ? s.header.background.value.value : null,
                dropdownColor: s.dropdown.background.value.value,
                dropdownTextColor: s.dropdown.color.value.value,
                itemHeight: Number(s.dropdown.itemHeight.value) || 30,
                dropdownMinWidth: Number(s.dropdown.minWidth.value) || 200,
                emptyMessage: "Add a Section field, then Sub-section and Page",
                disabledReason: (entry: MenuEntry) => {
                    if (linkMode) {
                        if (resolveLink(reportUrl, entry.link)) return null;
                        if (!data.hasLink) return "Add a field to Page link, or switch Navigation to the Go button method";
                        return entry.link ? "Paste the report's web address into Format > Navigation > Report web address" : "This entry has no page link";
                    }
                    if (!data.hasPage) return "Add a field to Page";
                    return entry.page ? null : "This entry has no page";
                },
            }, {
                onChoose: (entry) => {
                    if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                    if (linkMode) {
                        const url = resolveLink(reportUrl, entry.link);
                        if (url) this.host.launchUrl(url);
                        return;
                    }
                    if (!data.target || !entry.page) return;
                    // Choosing the selected entry again clears it.
                    if (samePage(entry.page, this.selectedPage)) {
                        this.selectedPage = null;
                        this.host.applyJsonFilter(null as unknown as powerbi.IFilter, "general", "filter", powerbi.FilterAction.remove);
                    } else {
                        this.selectedPage = entry.page;
                        // "Page is <this page>": the same kind of filter a slicer applies, so the Go button's measure sees it.
                        this.host.applyJsonFilter(new BasicFilter(data.target, "In", [entry.page]), "general", "filter", powerbi.FilterAction.merge);
                    }
                    // Show the choice straight away; Power BI sends an update of its own once the filter is in place.
                    if (this.lastOptions) {
                        const jsonFilters: powerbi.IFilter[] = this.selectedPage && data.target ? [new BasicFilter(data.target, "In", [this.selectedPage]).toJSON()] : [];
                        this.update({ ...this.lastOptions, jsonFilters });
                    }
                },
                onContextMenu: (event) => {
                    this.selectionManager.showContextMenu({}, { x: event.clientX, y: event.clientY });
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

    /** Reads the navigation table: one row per menu entry. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { menu: [], target: null, hasPage: false, hasLink: false };
        const table = dataView && dataView.table;
        if (!table || !table.columns || !table.rows) return result;

        const indexOf = (role: string) => table.columns.findIndex((column) => column.roles && column.roles[role]);
        const section = indexOf("section"), item = indexOf("item"), page = indexOf("page"), link = indexOf("link"), order = indexOf("order");
        if (section < 0) return result;
        result.hasPage = page >= 0;
        result.hasLink = link >= 0;

        const textAt = (row: powerbi.DataViewTableRow, index: number): string | null => {
            if (index < 0) return null;
            const raw = row[index];
            if (raw === null || raw === undefined) return null;
            return typeof raw === "string" ? raw : valueFormatter.format(raw, table.columns[index].format);
        };
        const rows: RawRow[] = table.rows.map((row) => {
            const rawOrder = order >= 0 ? row[order] : null;
            return {
                section: textAt(row, section),
                item: textAt(row, item),
                page: textAt(row, page),
                link: textAt(row, link),
                order: typeof rawOrder === "number" && isFinite(rawOrder) ? rawOrder : null,
            };
        });
        result.menu = buildMenu(rows);

        // "Table.Column": the part before the first dot is the table.
        const queryName = page >= 0 ? table.columns[page].queryName || "" : "";
        const dot = queryName.indexOf(".");
        if (dot > 0 && dot < queryName.length - 1) result.target = { table: queryName.slice(0, dot), column: queryName.slice(dot + 1) };
        return result;
    }

    private readSelection(filters: powerbi.IFilter[] | undefined, target: FilterTarget | null): string | null {
        if (!filters || !target) return null;
        for (const filter of filters) {
            const candidate = filter as SavedFilter;
            if (candidate && candidate.target && candidate.target.column === target.column && Array.isArray(candidate.values) && candidate.values.length === 1) {
                return String(candidate.values[0]);
            }
        }
        return null;
    }
}

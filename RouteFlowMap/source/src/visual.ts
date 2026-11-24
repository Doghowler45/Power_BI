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
import DataViewTable = powerbi.DataViewTable;

import { VisualFormattingSettingsModel } from "./settings";
import { Country, findCountry } from "./countries";
import { FlowMap, FlowMapHandlers, FlowMapOptions, Route } from "./flowMap";

const DEFAULT_FORMAT = "#,0.##";

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly map: FlowMap;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private routes: Route[] = [];
    private selectionIds: Map<string, ISelectionId[]> = new Map();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.map = new FlowMap(this.target);
        // Keeps the dimming in step when a bookmark or another action changes the selection.
        this.selectionManager.registerOnSelectCallback(() => this.syncSelection());
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);

            const table = dataView && dataView.table;
            const parsed = this.readTable(table);
            this.routes = parsed.routes;
            this.selectionIds = parsed.selectionIds;

            const s = this.formattingSettings;
            // Legend labels: pick the unit from the smallest value shown (automatic units would
            // print 150 million as "0.2bn"), and only show a decimal when a value needs one.
            const makeCompactFormatter = (values: number[]) => {
                const smallest = Math.min(...values.map((v) => Math.abs(v)));
                const unit = smallest >= 1e9 ? 1e9 : smallest >= 1e6 ? 1e6 : smallest >= 1e3 ? 1e3 : 1;
                const whole = values.every((v) => Math.abs(v / unit - Math.round(v / unit)) < 1e-9);
                const formatter = valueFormatter.create({
                    format: parsed.format,
                    value: unit,
                    precision: unit > 1 ? (whole ? 0 : 1) : undefined,
                    cultureSelector: this.host.locale,
                });
                return (value: number) => formatter.format(value);
            };
            const mapOptions: FlowMapOptions = {
                width: options.viewport.width,
                height: options.viewport.height,
                projection: String(s.map.projection.value?.value ?? "globe") === "flat" ? "flat" : "globe",
                oceanColor: s.map.oceanColor.value.value,
                showZoomButtons: s.map.zoomButtons.value,
                hoverHighlight: s.hover.highlight.value,
                hoverCard: s.hover.card.value,
                routeColor: s.routes.color.value.value,
                minWidth: s.routes.minWidth.value,
                maxWidth: s.routes.maxWidth.value,
                scaleMax: Math.max(0, Number(s.routes.scaleMax.value) || 0),
                routeOpacity: Math.min(100, Math.max(10, s.routes.opacity.value)) / 100,
                curvature: Math.min(60, Math.max(0, s.routes.curvature.value)) / 100,
                fadeFromOrigin: s.routes.fade.value,
                landColor: s.map.landColor.value.value,
                activeLandColor: s.map.activeColor.value.value,
                borderColor: s.map.borderColor.value.value,
                markerColor: s.map.markerColor.value.value,
                zoomToRoutes: s.map.zoomToRoutes.value,
                allowZoom: s.map.allowZoom.value,
                showLabels: s.labels.show.value,
                labelSize: s.labels.fontSize.value,
                labelColor: s.labels.color.value.value,
                showLegend: s.legend.show.value,
                valueLabel: parsed.valueLabel,
                formatValue: (value: number) => valueFormatter.format(value, parsed.format),
                makeCompactFormatter,
            };

            this.map.render(this.routes, parsed.unmatched, mapOptions, this.createHandlers());
            this.syncSelection();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    /** Turns the table rows into one route per origin and destination pair. */
    private readTable(table: DataViewTable | undefined): {
        routes: Route[];
        selectionIds: Map<string, ISelectionId[]>;
        unmatched: string[];
        format: string;
        valueLabel: string;
    } {
        const empty = { routes: [], selectionIds: new Map<string, ISelectionId[]>(), unmatched: [], format: DEFAULT_FORMAT, valueLabel: "Value" };
        if (!table || !table.columns || !table.rows) return empty;

        const indexOfRole = (role: string) => table.columns.findIndex((c) => c.roles && c.roles[role]);
        const originIndex = indexOfRole("origin");
        const destinationIndex = indexOfRole("destination");
        const valueIndex = indexOfRole("revenue");
        if (originIndex < 0 || destinationIndex < 0) return empty;

        const valueColumn = valueIndex >= 0 ? table.columns[valueIndex] : undefined;
        const byKey = new Map<string, Route>();
        const selectionIds = new Map<string, ISelectionId[]>();
        const unmatched = new Set<string>();
        const resolved = new Map<string, Country | undefined>();
        const resolve = (raw: powerbi.PrimitiveValue): Country | undefined => {
            const text = raw === null || raw === undefined ? "" : String(raw).trim();
            if (!text) return undefined;
            if (!resolved.has(text)) {
                const country = findCountry(text);
                resolved.set(text, country);
                if (!country) unmatched.add(text);
            }
            return resolved.get(text);
        };

        table.rows.forEach((row, rowIndex) => {
            const origin = resolve(row[originIndex]);
            const destination = resolve(row[destinationIndex]);
            if (!origin || !destination) return;
            const raw = valueIndex >= 0 ? row[valueIndex] : null;
            const value = typeof raw === "number" && isFinite(raw) ? raw : null;
            if (valueIndex >= 0 && value === null) return;

            const key = `${origin.name}>${destination.name}`;
            let route = byKey.get(key);
            if (!route) {
                route = { key, origin, destination, value: null, rowIndexes: [] };
                byKey.set(key, route);
                selectionIds.set(key, []);
            }
            if (value !== null) route.value = (route.value ?? 0) + value;
            route.rowIndexes.push(rowIndex);
            selectionIds.get(key)!.push(this.host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId());
        });

        return {
            routes: Array.from(byKey.values()),
            selectionIds,
            unmatched: Array.from(unmatched),
            format: (valueColumn && valueColumn.format) || DEFAULT_FORMAT,
            valueLabel: (valueColumn && valueColumn.displayName) || "Value",
        };
    }

    private createHandlers(): FlowMapHandlers {
        const position = (event: MouseEvent): number[] => {
            const box = this.target.getBoundingClientRect();
            return [event.clientX - box.left, event.clientY - box.top];
        };
        return {
            onRouteClick: (route, event) => {
                // Dashboard tiles and some embeds switch interactions off.
                if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                const ids = this.selectionIds.get(route.key) || [];
                this.selectionManager.select(ids, event.ctrlKey || event.metaKey).then(() => this.syncSelection());
            },
            onCountryClick: (routes) => {
                if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
                const ids = routes.flatMap((route) => this.selectionIds.get(route.key) || []);
                const done = ids.length ? this.selectionManager.select(ids, false) : this.selectionManager.clear();
                done.then(() => this.syncSelection());
            },
            onBackgroundClick: () => {
                if (!this.selectionManager.hasSelection()) return;
                this.selectionManager.clear().then(() => this.syncSelection());
            },
            onContextMenu: (route, event) => {
                const ids = route ? this.selectionIds.get(route.key) || [] : [];
                this.selectionManager.showContextMenu(ids.length ? ids[0] : {}, { x: event.clientX, y: event.clientY });
            },
            showTooltip: (items, event, route) => {
                // The details card is the default; the Power BI tooltip is opt-in under Format > Hover.
                if (!this.formattingSettings.hover.tooltip.value) return;
                this.host.tooltipService.show({
                    coordinates: position(event),
                    isTouchEvent: false,
                    dataItems: items,
                    identities: route ? this.selectionIds.get(route.key) || [] : [],
                });
            },
            hideTooltip: () => {
                this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
            },
        };
    }

    /** Dims every route that is not part of the current selection. */
    private syncSelection(): void {
        const selected = this.selectionManager.getSelectionIds() as ISelectionId[];
        const keys = new Set<string>();
        if (selected && selected.length) {
            this.selectionIds.forEach((ids, key) => {
                if (ids.some((id) => selected.some((sel) => sel.equals(id)))) keys.add(key);
            });
        }
        this.map.setSelection(keys);
    }
}

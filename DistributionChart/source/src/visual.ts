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

import { VisualFormattingSettingsModel } from "./settings";
import { buildGroups, DistributionView, groupKey, pointKey } from "./view";
import { RAMPS } from "./common/colours";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData {
    rows: { group: string; name: string; value: number | null }[];
    rowIds: ISelectionId[];
    format: string;
    names: { points: string; group: string; value: string };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: DistributionView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new DistributionView(options.element);
        this.interaction = new Interaction(options.host, options.element, (keys) => this.view.setSelection(keys));
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            const groups = buildGroups(data.rows, String(s.boxes.sort.value?.value ?? "median") !== "none");

            // A point selects its own row; a box selects every point in its group.
            const ids = new Map<string, ISelectionId[]>();
            groups.forEach((group) => {
                ids.set(groupKey(group), group.points.map((point) => data.rowIds[point.index]));
                group.points.forEach((point) => ids.set(pointKey(point), [data.rowIds[point.index]]));
            });
            this.interaction.setIds(ids);

            const values = data.rows.map((row) => row.value);
            const formatters = makeFormatters(data.format, chooseUnit(data.format, values, String(s.labels.units.value?.value ?? "auto")), clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);

            this.view.render(groups, {
                width: options.viewport.width,
                height: options.viewport.height,
                ramp: RAMPS[String(s.boxes.hue.value?.value ?? "blue")] || RAMPS.blue,
                showPoints: s.boxes.points.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                valueName: data.names.value,
                formatters,
                emptyMessage: "Add a field to Points and a measure to Values",
            }, {
                onSelect: (key, event) => this.interaction.select(key, event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (key, event) => this.interaction.contextMenu(key, event),
                showPointTooltip: (group, point, event) => {
                    const items: TooltipItem[] = [{ displayName: data.names.points || "Point", value: point.name }];
                    if (group.name !== "") items.push({ displayName: data.names.group || "Group", value: group.name });
                    items.push({ displayName: data.names.value || "Value", value: full(point.value) });
                    items.push({ displayName: group.name !== "" ? `Median of ${group.name}` : "Median", value: full(group.median) });
                    this.interaction.showTooltip(items, event, pointKey(point));
                },
                showGroupTooltip: (group, event) => {
                    const items: TooltipItem[] = [
                        { displayName: data.names.group || "Group", value: group.name !== "" ? group.name : "All" },
                        { displayName: "Points", value: String(group.points.length) },
                        { displayName: "Highest", value: full(group.max) },
                        { displayName: "Upper quarter starts at", value: full(group.q3) },
                        { displayName: "Median", value: full(group.median) },
                        { displayName: "Lower quarter ends at", value: full(group.q1) },
                        { displayName: "Lowest", value: full(group.min) },
                    ];
                    this.interaction.showTooltip(items, event, groupKey(group));
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

    /** One row for each point, with its group (if any) and its value. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { rows: [], rowIds: [], format: DEFAULT_FORMAT, names: { points: "", group: "", value: "" } };
        const table = dataView && dataView.table;
        if (!table || !table.columns || !table.rows) return result;
        const indexOf = (role: string) => table.columns.findIndex((column) => column.roles && column.roles[role]);
        const points = indexOf("points"), group = indexOf("group"), value = indexOf("value");
        if (points < 0 || value < 0) return result;
        result.format = table.columns[value].format || DEFAULT_FORMAT;
        result.names = { points: table.columns[points].displayName || "", group: group >= 0 ? table.columns[group].displayName || "" : "", value: table.columns[value].displayName || "" };
        table.rows.forEach((row, rowIndex) => {
            const raw = row[value];
            result.rows.push({
                group: group >= 0 ? categoryText(row[group], table.columns[group].format) : "",
                name: categoryText(row[points], table.columns[points].format),
                value: typeof raw === "number" && isFinite(raw) ? raw : null,
            });
            result.rowIds.push(this.host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId());
        });
        return result;
    }
}

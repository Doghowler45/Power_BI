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
import { buildFlow, FlowRow, linkKey, nodeKey } from "./model";
import { FlowView } from "./view";
import { assignColours, OTHER_LABEL } from "./common/colours";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters, share } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

interface ParsedData {
    stageNames: string[];
    rows: FlowRow[];
    rowIds: ISelectionId[];
    format: string;
    valueName: string;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: FlowView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new FlowView(options.element);
        this.interaction = new Interaction(options.host, options.element, (keys) => this.view.setSelection(keys));
    }

    public update(options: VisualUpdateOptions): void {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const data = this.readData(dataView);
            const colourStage = String(s.colours.by.value?.value) === "last" ? "last" : "first";
            const flow = buildFlow(data.stageNames, data.rows, Number(s.layout.maxNodes.value) || 8, colourStage);

            // A node or ribbon stands for every row that passes through it: selecting it selects them all.
            const ids = new Map<string, ISelectionId[]>();
            if (flow) {
                flow.stages.forEach((stage) => stage.forEach((node) => ids.set(nodeKey(node), node.rows.map((r) => data.rowIds[r]))));
                flow.links.forEach((link) => ids.set(linkKey(link), link.rows.map((r) => data.rowIds[r])));
            }
            this.interaction.setIds(ids);

            // Colours go by name, A to Z, not by size, so a filter does not repaint them.
            const names = flow ? [...flow.colourNames.filter((name) => name !== OTHER_LABEL)].sort((a, b) => a.localeCompare(b)) : [];
            const colours = assignColours([...names, OTHER_LABEL], String(s.colours.source.value?.value) === "theme" ? "theme" : "builtIn", this.host.colorPalette);

            const unit = chooseUnit(data.format, flow ? flow.stages.flat().map((node) => node.value) : [], String(s.labels.units.value?.value ?? "auto"));
            const formatters = makeFormatters(data.format, unit, clampDecimals(s.labels.decimals.value), this.host.locale);
            const full = fullFormatter(data.format);
            const stageLabel = (index: number) => data.stageNames[index] || `Stage ${index + 1}`;

            this.view.render(flow, {
                width: options.viewport.width,
                height: options.viewport.height,
                colours,
                colourStage: colourStage === "last" ? data.stageNames.length - 1 : 0,
                nodeWidth: Math.max(4, Number(s.layout.nodeWidth.value) || 12),
                nodeGap: Math.max(0, Number(s.layout.nodeGap.value ?? 10) || 0),
                showValues: s.labels.values.value,
                fontSize: Number(s.labels.fontSize.value) || 11,
                formatters,
                emptyMessage: data.stageNames.length < 2 ? "Add two to four fields to Stages, and a measure to Values" : data.rows.length ? "There is nothing above zero to show" : "Add a measure to Values",
            }, {
                onSelect: (key, event) => this.interaction.select(key, event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (key, event) => this.interaction.contextMenu(key, event),
                showNodeTooltip: (node, event) => {
                    const items: TooltipItem[] = [
                        { displayName: stageLabel(node.stage), value: node.pooled.length ? `${OTHER_LABEL} (${node.pooled.join(", ")})` : node.name },
                        { displayName: data.valueName || "Value", value: full(node.value) },
                        { displayName: "Share of total", value: share(node.value / (flow ? flow.total : 1), 1) },
                    ];
                    this.interaction.showTooltip(items, event, nodeKey(node));
                },
                showLinkTooltip: (link, event) => {
                    const items: TooltipItem[] = [
                        { displayName: stageLabel(link.source.stage), value: link.source.name },
                        { displayName: stageLabel(link.target.stage), value: link.target.name },
                    ];
                    const colouredBy = colourStage === "last" ? data.stageNames.length - 1 : 0;
                    if (colouredBy !== link.source.stage && colouredBy !== link.target.stage) items.push({ displayName: stageLabel(colouredBy), value: link.colourBy });
                    items.push({ displayName: data.valueName || "Value", value: full(link.value) });
                    items.push({ displayName: `Share of ${link.source.name}`, value: share(link.value / link.source.value, 1) });
                    items.push({ displayName: "Share of total", value: share(link.value / (flow ? flow.total : 1), 1) });
                    this.interaction.showTooltip(items, event, linkKey(link));
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

    /** One row for each combination of the stage fields, with the measure. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { stageNames: [], rows: [], rowIds: [], format: DEFAULT_FORMAT, valueName: "" };
        const table = dataView && dataView.table;
        if (!table || !table.columns || !table.rows) return result;
        const stageColumns = table.columns.map((column, index) => ({ column, index })).filter(({ column }) => column.roles && column.roles["levels"]);
        const valueIndex = table.columns.findIndex((column) => column.roles && column.roles["value"]);
        result.stageNames = stageColumns.map(({ column }) => column.displayName || "");
        if (valueIndex < 0) return result;
        result.format = table.columns[valueIndex].format || DEFAULT_FORMAT;
        result.valueName = table.columns[valueIndex].displayName || "";
        table.rows.forEach((row, rowIndex) => {
            const raw = row[valueIndex];
            result.rows.push({ stages: stageColumns.map(({ column, index }) => categoryText(row[index], column.format)), value: typeof raw === "number" && isFinite(raw) ? raw : null });
            result.rowIds.push(this.host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId());
        });
        return result;
    }
}

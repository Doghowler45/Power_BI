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
import { buildTree, RawNode, TreeNode } from "./model";
import { CardText, DriverTreeView } from "./view";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, isPercentFormat, makeFormatters } from "./common/format";
import { Interaction, TooltipItem } from "./common/interaction";

const MINUS = "−";

interface ParsedData {
    nodes: RawNode[];
    ids: Map<string, ISelectionId[]>;
    format: string;
    names: { node: string; actual: string; plan: string; previousYear: string };
    has: { plan: boolean; previousYear: boolean };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: DriverTreeView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new DriverTreeView(options.element);
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
            const tree = buildTree(data.nodes);

            const choice = String(s.comparison.scenario.value?.value ?? "auto");
            const scenario: "pl" | "py" | null = choice === "pl" && data.has.plan ? "pl" : choice === "py" && data.has.previousYear ? "py" : data.has.plan ? "pl" : data.has.previousYear ? "py" : null;
            const baseOf = (node: TreeNode): number | null => (scenario === "pl" ? node.plan : scenario === "py" ? node.previousYear : null);
            const baseName = scenario === "pl" ? data.names.plan || "plan" : scenario === "py" ? data.names.previousYear || "previous year" : "";
            const unitChoice = String(s.numbers.units.value?.value ?? "auto");
            const decimals = clampDecimals(s.numbers.decimals.value);
            const formatOf = (node: TreeNode): string => node.format || data.format;

            const cards = new Map<number, CardText>();
            tree.nodes.forEach((node) => {
                const format = formatOf(node), base = baseOf(node);
                const write = makeFormatters(format, this.unitFor(format, node.actual ?? base, unitChoice), decimals, this.host.locale)[0];
                const card: CardText = { value: node.actual === null ? "–" : write(node.actual), change: null, percent: null, ratio: null, direction: 0, state: "same" };
                if (node.actual !== null && base !== null) {
                    const delta = node.actual - base;
                    const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "";
                    card.direction = delta > 0 ? 1 : delta < 0 ? -1 : 0;
                    card.ratio = base !== 0 ? delta / Math.abs(base) : null;
                    if (isPercentFormat(format)) {
                        // A rate changes by points, not by a percentage of itself.
                        card.change = `${sign}${Math.abs(delta * 100).toFixed(1)} pts`;
                    } else {
                        const size = write(Math.abs(delta));
                        card.change = size === write(0) ? size : `${sign}${size}`;
                        if (card.ratio !== null) card.percent = `${sign}${Math.abs(card.ratio * 100).toFixed(1)}%`;
                    }
                    card.state = delta === 0 ? "same" : (delta > 0) !== node.costLike ? "good" : "bad";
                }
                cards.set(node.index, card);
            });

            this.view.render(tree, cards, {
                width: options.viewport.width,
                height: options.viewport.height,
                caption: scenario ? `▲▼ change on ${baseName}` : "",
                hasComparison: scenario !== null,
                showBars: s.cardsCard.bars.value,
                fontSize: Number(s.cardsCard.fontSize.value) || 11,
                valueSize: Number(s.cardsCard.valueSize.value) || 16,
                goodColor: s.colours.good.value.value,
                badColor: s.colours.bad.value.value,
                emptyMessage: "Add Driver, Parent and Actual fields",
            }, {
                onSelect: (node, event) => this.interaction.select(String(node.index), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (node, event) => this.interaction.contextMenu(node ? String(node.index) : null, event),
                showTooltip: (node, event) => {
                    const full = fullFormatter(formatOf(node));
                    const text = (value: number | null) => (value === null ? "–" : full(value));
                    const items: TooltipItem[] = [{ displayName: data.names.node || "Driver", value: node.name }];
                    items.push({ displayName: data.names.actual || "Actual", value: text(node.actual) });
                    if (data.has.plan) items.push({ displayName: data.names.plan || "Plan", value: text(node.plan) });
                    if (data.has.previousYear) items.push({ displayName: data.names.previousYear || "Previous year", value: text(node.previousYear) });
                    const card = cards.get(node.index);
                    const base = baseOf(node);
                    if (card && card.change !== null && node.actual !== null && base !== null) {
                        const delta = node.actual - base;
                        const sign = delta > 0 ? "+" : delta < 0 ? MINUS : "";
                        items.push({ displayName: `Change on ${baseName}`, value: isPercentFormat(formatOf(node)) ? card.change : `${sign}${full(Math.abs(delta))}` });
                        if (card.percent) items.push({ displayName: "Change %", value: card.percent });
                    }
                    this.interaction.showTooltip(items, event, String(node.index));
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

    /**
     * A unit for one driver. A tree mixes amounts in the millions with prices and rates, so on
     * "auto" each driver gets its own; thousands start at 10,000 so a price like $2,584 keeps
     * its detail and its change does not read "+$0.0K".
     */
    private unitFor(format: string, value: number | null, choice: string): number {
        if (choice !== "auto" || isPercentFormat(format)) return chooseUnit(format, [value], choice);
        const size = Math.abs(value ?? 0);
        return size >= 1e9 ? 1e9 : size >= 1e6 ? 1e6 : size >= 1e4 ? 1e3 : 1;
    }

    /** One row for each driver. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { nodes: [], ids: new Map(), format: DEFAULT_FORMAT, names: { node: "", actual: "", plan: "", previousYear: "" }, has: { plan: false, previousYear: false } };
        const table = dataView && dataView.table;
        if (!table || !table.columns || !table.rows) return result;
        const indexOf = (role: string) => table.columns.findIndex((column) => column.roles && column.roles[role]);
        const node = indexOf("node"), parent = indexOf("parent"), operator = indexOf("operator"), order = indexOf("order"), format = indexOf("format");
        const actual = indexOf("actual"), plan = indexOf("plan"), previousYear = indexOf("previousYear");
        if (node < 0) return result;
        const nameOf = (index: number) => (index >= 0 ? table.columns[index].displayName || "" : "");
        const firstMeasure = [actual, plan, previousYear].find((index) => index >= 0);
        if (firstMeasure !== undefined) result.format = table.columns[firstMeasure].format || DEFAULT_FORMAT;
        result.names = { node: nameOf(node), actual: nameOf(actual), plan: nameOf(plan), previousYear: nameOf(previousYear) };
        result.has = { plan: plan >= 0, previousYear: previousYear >= 0 };
        const numberAt = (row: powerbi.DataViewTableRow, index: number): number | null => {
            const raw = index >= 0 ? row[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        const textAt = (row: powerbi.DataViewTableRow, index: number): string | null => {
            const raw = index >= 0 ? row[index] : null;
            const text = raw === null || raw === undefined ? "" : String(raw).trim();
            return text === "" ? null : text;
        };
        table.rows.forEach((row, rowIndex) => {
            result.nodes.push({
                index: rowIndex,
                name: categoryText(row[node], table.columns[node].format),
                parent: textAt(row, parent),
                operator: textAt(row, operator),
                order: numberAt(row, order),
                format: textAt(row, format),
                actual: numberAt(row, actual),
                plan: numberAt(row, plan),
                previousYear: numberAt(row, previousYear),
            });
            result.ids.set(String(rowIndex), [this.host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId()]);
        });
        return result;
    }
}

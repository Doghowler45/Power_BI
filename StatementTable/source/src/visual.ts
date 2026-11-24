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
import { buildStatement, RawLine, Scenario } from "./model";
import { StatementView } from "./view";
import { categoryText, chooseUnit, clampDecimals, DEFAULT_FORMAT, fullFormatter, makeFormatters } from "./common/format";
import { Interaction } from "./common/interaction";

interface ParsedData {
    lines: RawLine[];
    ids: Map<string, ISelectionId[]>;
    format: string;
    lineTitle: string;
    names: { actual: string; pl: string; py: string };
    has: { plan: boolean; previousYear: boolean };
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private readonly view: StatementView;
    private readonly interaction: Interaction;
    private formattingSettings = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.view = new StatementView(options.element);
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
            const rows = buildStatement(data.lines);
            const scenarios: Scenario[] = [];
            if (data.has.plan) scenarios.push("pl");
            if (data.has.previousYear) scenarios.push("py");

            // One unit for the whole statement, from its typical line.
            const amounts = data.lines.flatMap((line) => [line.actual, line.plan, line.previousYear]);
            const formatters = makeFormatters(data.format, chooseUnit(data.format, amounts, String(s.numbers.units.value?.value ?? "auto")), clampDecimals(s.numbers.decimals.value), this.host.locale);

            this.view.render(rows, {
                width: options.viewport.width,
                height: options.viewport.height,
                scenarios,
                showAbsolute: s.columns.absolute.value,
                showRelative: s.columns.relative.value,
                showBars: s.columns.bars.value,
                brackets: s.numbers.brackets.value,
                lineTitle: data.lineTitle,
                names: data.names,
                actualColor: s.colours.actual.value.value,
                previousYearColor: s.colours.previousYear.value.value,
                goodColor: s.colours.good.value.value,
                badColor: s.colours.bad.value.value,
                textColor: s.text.color.value.value,
                fontSize: Number(s.text.fontSize.value) || 12,
                rowPadding: Math.max(0, Number(s.rows.padding.value ?? 5) || 0),
                showLines: s.rows.lines.value,
                formatValue: formatters[0],
                formatFull: fullFormatter(data.format),
                emptyMessage: "Add the statement's lines to Line and a measure to Actual",
            }, {
                onSelect: (row, event) => this.interaction.select(String(row.index), event),
                onClear: () => this.interaction.clear(),
                onContextMenu: (row, event) => this.interaction.contextMenu(row ? String(row.index) : null, event),
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

    /** One row for each line of the statement. */
    private readData(dataView: DataView | undefined): ParsedData {
        const result: ParsedData = { lines: [], ids: new Map(), format: DEFAULT_FORMAT, lineTitle: "", names: { actual: "", pl: "", py: "" }, has: { plan: false, previousYear: false } };
        const table = dataView && dataView.table;
        if (!table || !table.columns || !table.rows) return result;
        const indexOf = (role: string) => table.columns.findIndex((column) => column.roles && column.roles[role]);
        const line = indexOf("line"), kind = indexOf("kind"), order = indexOf("order"), level = indexOf("level");
        const actual = indexOf("actual"), plan = indexOf("plan"), previousYear = indexOf("previousYear");
        if (line < 0) return result;
        const nameOf = (index: number) => (index >= 0 ? table.columns[index].displayName || "" : "");
        const firstMeasure = [actual, plan, previousYear].find((index) => index >= 0);
        if (firstMeasure !== undefined) result.format = table.columns[firstMeasure].format || DEFAULT_FORMAT;
        result.lineTitle = nameOf(line);
        result.names = { actual: nameOf(actual), pl: nameOf(plan), py: nameOf(previousYear) };
        result.has = { plan: plan >= 0, previousYear: previousYear >= 0 };
        const numberAt = (row: powerbi.DataViewTableRow, index: number): number | null => {
            const raw = index >= 0 ? row[index] : null;
            return typeof raw === "number" && isFinite(raw) ? raw : null;
        };
        table.rows.forEach((row, rowIndex) => {
            result.lines.push({
                name: categoryText(row[line], table.columns[line].format),
                kind: kind >= 0 && row[kind] !== null && row[kind] !== undefined ? String(row[kind]) : null,
                order: numberAt(row, order),
                level: numberAt(row, level),
                actual: numberAt(row, actual),
                plan: numberAt(row, plan),
                previousYear: numberAt(row, previousYear),
            });
            result.ids.set(String(rowIndex), [this.host.createSelectionIdBuilder().withTable(table, rowIndex).createSelectionId()]);
        });
        return result;
    }
}

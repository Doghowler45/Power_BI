"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings, FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataView = powerbi.DataView;
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";
import { CardInput, Headline, summarise } from "./cardModel";
import { CardFormat, VarianceCardsView } from "./cardsView";

const DEFAULT_FORMAT = "#,0.##";
const UNIT_VALUES: { [key: string]: number } = { none: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

interface ParsedCard extends CardInput {
    format: string;
    /** Identifies the measure, so its "higher is worse" switch can be saved against it. */
    queryName: string;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly events: IVisualEventService;
    private readonly target: HTMLElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly view: VarianceCardsView;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.selectionManager = this.host.createSelectionManager();
        this.view = new VarianceCardsView(this.target);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const s = this.formattingSettings;
            const parsed = this.readData(dataView);

            // One "higher is worse" switch per Actual measure, saved against that measure.
            s.direction.slices = parsed
                .filter((card) => card.queryName)
                .map((card) => new formattingSettings.ToggleSwitch({
                    name: "higherIsWorse",
                    displayName: card.title,
                    value: card.higherIsWorse,
                    selector: { metadata: card.queryName },
                }));
            s.direction.visible = s.direction.slices.length > 0;

            const headlineChoice = String(s.cardsCard.headline.value?.value ?? "sum");
            const headline: Headline = headlineChoice === "last" || headlineChoice === "average" ? headlineChoice : "sum";
            const results = parsed.map((card) => summarise(card, headline));

            const unitChoice = String(s.numbers.units.value?.value ?? "auto");
            const decimals = Math.min(4, Math.max(0, Math.round(Number(s.numbers.decimals.value) || 0)));
            const formats: CardFormat[] = parsed.map((card, index) => {
                const isPercent = card.format.indexOf("%") >= 0;
                // Each figure picks its own unit: revenue in billions can sit beside its variance in millions.
                const unitFor = (size: number) => isPercent ? 1
                    : unitChoice === "auto" ? (size >= 1e9 ? 1e9 : size >= 1e6 ? 1e6 : size >= 1e3 ? 1e3 : 1)
                    : UNIT_VALUES[unitChoice] ?? 1;
                const made = new Map<number, (value: number) => string>();
                const at = (size: number) => {
                    const unit = unitFor(size);
                    let format = made.get(unit);
                    if (!format) {
                        // Billions get one more decimal place, or "$1.3bn" hides too much.
                        const formatter = valueFormatter.create({ format: card.format, value: unit, precision: unit > 1 ? decimals + (unit === 1e9 ? 1 : 0) : undefined, cultureSelector: this.host.locale });
                        format = (value: number) => formatter.format(value);
                        made.set(unit, format);
                    }
                    return format;
                };
                const headlineSize = Math.abs(results[index].value ?? 0);
                return {
                    short: (value: number) => at(headlineSize)(value),
                    variance: (value: number) => at(Math.abs(value))(value),
                    full: (value: number) => valueFormatter.format(value, card.format),
                    isPercent,
                };
            });

            this.view.render(results, formats, {
                width: options.viewport.width,
                height: options.viewport.height,
                perRow: Math.max(0, Number(s.cardsCard.perRow.value) || 0),
                showSparkline: s.cardsCard.sparkline.value,
                showBorder: s.cardsCard.border.value,
                background: s.cardsCard.background.value.value,
                actualColor: s.colours.actual.value.value,
                goodColor: s.colours.good.value.value,
                badColor: s.colours.bad.value.value,
                textColor: s.text.color.value.value,
                valueSize: Number(s.text.valueSize.value) || 24,
                fontSize: Number(s.text.fontSize.value) || 11,
                emptyMessage: "Add one or more measures to Actual, then the matching Plan and Previous year measures in the same order",
            }, {
                showTooltip: (items, event) => {
                    const box = this.target.getBoundingClientRect();
                    this.host.tooltipService.show({
                        coordinates: [event.clientX - box.left, event.clientY - box.top],
                        isTouchEvent: false,
                        dataItems: items,
                        identities: [],
                    });
                },
                hideTooltip: () => {
                    this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
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

    /**
     * One card per measure in Actual. Plan and Previous year measures are matched to it by
     * position: the first Plan measure belongs to the first Actual measure, and so on.
     */
    private readData(dataView: DataView | undefined): ParsedCard[] {
        const categorical = dataView && dataView.categorical;
        if (!categorical || !categorical.values) return [];
        const columns: DataViewValueColumn[] = Array.from(categorical.values);
        const category = categorical.categories && categorical.categories[0];
        const periods = category
            ? category.values.map((raw) => (raw === null || raw === undefined ? "(Blank)" : typeof raw === "string" ? raw : valueFormatter.format(raw, category.source.format)))
            : [""];

        const inRole = (role: string) => columns.filter((c) => c.source.roles && c.source.roles[role]);
        const numbers = (column: DataViewValueColumn | undefined): (number | null)[] | null =>
            column ? periods.map((_, index) => {
                const raw = column.values[index];
                return typeof raw === "number" && isFinite(raw) ? raw : null;
            }) : null;
        const plans = inRole("plan"), previous = inRole("previousYear");

        return inRole("actual").map((column, index) => {
            const objects = column.source.objects;
            const direction = objects && objects["direction"];
            return {
                title: column.source.displayName || "",
                format: column.source.format || DEFAULT_FORMAT,
                queryName: column.source.queryName || "",
                periods,
                actual: numbers(column) || [],
                plan: numbers(plans[index]),
                previousYear: numbers(previous[index]),
                higherIsWorse: !!(direction && direction["higherIsWorse"]),
            };
        });
    }
}

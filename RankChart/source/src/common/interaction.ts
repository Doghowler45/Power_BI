"use strict";

import powerbi from "powerbi-visuals-api";

import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

export interface TooltipItem {
    displayName: string;
    value: string;
}

/**
 * The plumbing every visual needs between its marks and Power BI: selecting (which filters
 * the other visuals on the page), the right-click menu, and tooltips. Marks are known by a
 * key; one key can stand for several data points (a Sankey node covers every row through it).
 */
export class Interaction {
    private readonly manager: ISelectionManager;
    private ids: Map<string, ISelectionId[]> = new Map();

    constructor(private readonly host: IVisualHost, private readonly element: HTMLElement, private readonly onChange: (selectedKeys: Set<string>) => void) {
        this.manager = host.createSelectionManager();
        // Keeps the visual in step when a bookmark or another action changes the selection.
        this.manager.registerOnSelectCallback(() => this.sync());
    }

    public setIds(ids: Map<string, ISelectionId[]>): void {
        this.ids = ids;
    }

    public select(key: string, event: MouseEvent): void {
        if (this.host.hostCapabilities && this.host.hostCapabilities.allowInteractions === false) return;
        const ids = this.ids.get(key);
        if (!ids || ids.length === 0) return;
        this.manager.select(ids, event.ctrlKey || event.metaKey).then(() => this.sync());
    }

    public clear(): void {
        if (!this.manager.hasSelection()) return;
        this.manager.clear().then(() => this.sync());
    }

    public contextMenu(key: string | null, event: MouseEvent): void {
        const ids = key ? this.ids.get(key) : undefined;
        this.manager.showContextMenu(ids && ids.length ? ids[0] : {}, { x: event.clientX, y: event.clientY });
    }

    public showTooltip(items: TooltipItem[], event: MouseEvent, key?: string): void {
        const box = this.element.getBoundingClientRect();
        const ids = key ? this.ids.get(key) : undefined;
        this.host.tooltipService.show({
            coordinates: [event.clientX - box.left, event.clientY - box.top],
            isTouchEvent: false,
            dataItems: items,
            identities: ids && ids.length ? [ids[0]] : [],
        });
    }

    public hideTooltip(): void {
        this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
    }

    /** Works out which keys are fully selected and tells the visual, so it can dim the rest. */
    public sync(): void {
        const selected = this.manager.getSelectionIds() as ISelectionId[];
        const keys = new Set<string>();
        if (selected && selected.length) {
            this.ids.forEach((ids, key) => {
                if (ids.length && ids.every((id) => selected.some((sel) => sel.equals(id)))) keys.add(key);
            });
        }
        this.onChange(keys);
    }
}

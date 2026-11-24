"use strict";

import { MenuEntry, MenuSection, samePage } from "./menuModel";

export interface MenuOptions {
    width: number;
    height: number;
    /** The page this copy of the visual sits on, so its section and entry can be marked. */
    currentPage: string;
    /** The page chosen and waiting for the Go button, or null. Not used when entries open links. */
    selectedPage: string | null;
    openOnHover: boolean;
    barHeight: number;
    fontSize: number;
    textColor: string;
    activeColor: string;
    hoverColor: string;
    /** Fill behind the headings, or null to let the page show through. */
    barColor: string | null;
    dropdownColor: string;
    dropdownTextColor: string;
    itemHeight: number;
    dropdownMinWidth: number;
    /** Shown in place of the menu when there is nothing to draw. */
    emptyMessage: string;
    /** Why an entry cannot be used, shown when it is hovered; null when it can. */
    disabledReason: (entry: MenuEntry) => string | null;
}

export interface MenuHandlers {
    onChoose(entry: MenuEntry): void;
    onContextMenu(event: MouseEvent): void;
}

const DOWN = "▾", UP = "▴", TICK = "✓";
/** How long the pointer may be outside the visual before an open dropdown closes. */
const CLOSE_DELAY = 600;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class NavigationMenuView {
    private readonly root: HTMLDivElement;
    /** Label of the section whose dropdown is open. Kept between updates. */
    private openSection: string | null = null;
    private closeTimer: number | null = null;
    private last: { menu: MenuSection[]; options: MenuOptions; handlers: MenuHandlers } | null = null;

    constructor(container: HTMLElement) {
        this.root = el("div", "navigationMenu");
        container.appendChild(this.root);
        // A visual cannot see clicks elsewhere on the page, so an open dropdown closes a moment after the pointer leaves.
        this.root.addEventListener("mouseleave", () => {
            this.cancelClose();
            this.closeTimer = window.setTimeout(() => this.setOpen(null), CLOSE_DELAY);
        });
        this.root.addEventListener("mouseenter", () => this.cancelClose());
        this.root.addEventListener("keydown", (event) => {
            if (event.key === "Escape") this.setOpen(null);
        });
    }

    public render(menu: MenuSection[], options: MenuOptions, handlers: MenuHandlers): void {
        this.last = { menu, options, handlers };
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
        root.style.width = `${Math.max(1, options.width)}px`;
        root.style.height = `${Math.max(1, options.height)}px`;
        root.style.fontSize = `${options.fontSize}px`;
        root.style.setProperty("--hover", options.hoverColor);
        root.style.setProperty("--active", options.activeColor);
        root.oncontextmenu = (event) => {
            event.preventDefault();
            handlers.onContextMenu(event);
        };
        // A click on the empty part of the visual closes the dropdown.
        root.onclick = (event) => {
            if (event.target === root) this.setOpen(null);
        };

        if (menu.length === 0) {
            root.appendChild(el("div", "message", options.emptyMessage));
            return;
        }
        if (this.openSection && !menu.some((section) => section.label === this.openSection && section.items.length)) this.openSection = null;

        const bar = el("div", "bar");
        bar.style.height = `${options.barHeight}px`;
        bar.style.background = options.barColor || "transparent";
        bar.onclick = (event) => {
            if (event.target === bar) this.setOpen(null);
        };
        root.appendChild(bar);

        menu.forEach((section) => {
            const entries = section.entry ? [section.entry] : section.items;
            const isCurrent = entries.some((entry) => samePage(entry.page, options.currentPage));
            const holdsSelection = entries.some((entry) => samePage(entry.page, options.selectedPage));
            const isOpen = this.openSection === section.label;
            const heading = el("button", "heading");
            heading.type = "button";
            heading.style.height = `${options.barHeight}px`;
            heading.style.color = isCurrent || holdsSelection ? options.activeColor : options.textColor;
            if (isCurrent) heading.classList.add("current");
            if (holdsSelection) heading.classList.add("selected");
            heading.appendChild(el("span", "label", section.label));

            if (section.entry) {
                this.wireEntry(heading, section.entry, options, handlers);
            } else {
                heading.appendChild(el("span", "caret", isOpen ? UP : DOWN));
                heading.setAttribute("aria-haspopup", "true");
                heading.setAttribute("aria-expanded", String(isOpen));
                if (isOpen) {
                    heading.classList.add("open");
                    heading.style.background = options.dropdownColor;
                }
                heading.onclick = (event) => {
                    event.stopPropagation();
                    this.setOpen(isOpen ? null : section.label);
                };
                if (options.openOnHover) heading.onmouseenter = () => this.setOpen(section.label);
            }
            bar.appendChild(heading);

            if (isOpen) {
                const panel = el("div", "panel");
                panel.style.top = `${options.barHeight}px`;
                panel.style.left = `${heading.offsetLeft}px`;
                panel.style.minWidth = `${Math.max(options.dropdownMinWidth, heading.offsetWidth)}px`;
                // The dropdown has to fit inside the visual: a visual cannot draw outside its own box.
                panel.style.maxHeight = `${Math.max(0, options.height - options.barHeight)}px`;
                panel.style.background = options.dropdownColor;
                section.items.forEach((entry) => {
                    const item = el("button", "item");
                    item.type = "button";
                    item.style.height = `${options.itemHeight}px`;
                    const current = samePage(entry.page, options.currentPage);
                    const selected = samePage(entry.page, options.selectedPage);
                    item.style.color = current || selected ? options.activeColor : options.dropdownTextColor;
                    if (current) item.classList.add("current");
                    if (selected) item.classList.add("selected");
                    item.appendChild(el("span", "label", entry.label));
                    if (selected) item.appendChild(el("span", "tick", TICK));
                    this.wireEntry(item, entry, options, handlers);
                    panel.appendChild(item);
                });
                root.appendChild(panel);
            }
        });
    }

    /** Makes a heading or dropdown entry do its job when clicked, or explains why it cannot. */
    private wireEntry(node: HTMLButtonElement, entry: MenuEntry, options: MenuOptions, handlers: MenuHandlers): void {
        if (samePage(entry.page, options.currentPage)) {
            node.setAttribute("aria-current", "page");
            node.title = "You are on this page";
            node.onclick = (event) => event.stopPropagation();
            return;
        }
        const reason = options.disabledReason(entry);
        if (reason) {
            node.classList.add("unavailable");
            node.title = reason;
            node.onclick = (event) => event.stopPropagation();
            return;
        }
        node.onclick = (event) => {
            event.stopPropagation();
            this.openSection = null;
            handlers.onChoose(entry);
            this.redraw();
        };
    }

    private setOpen(section: string | null): void {
        this.cancelClose();
        if (this.openSection === section) return;
        this.openSection = section;
        this.redraw();
    }

    private redraw(): void {
        if (this.last) this.render(this.last.menu, this.last.options, this.last.handlers);
    }

    private cancelClose(): void {
        if (this.closeTimer !== null) {
            window.clearTimeout(this.closeTimer);
            this.closeTimer = null;
        }
    }
}

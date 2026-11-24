"use strict";

/** One row of the navigation table as it arrives from Power BI. */
export interface RawRow {
    section: string | null;
    item: string | null;
    page: string | null;
    link: string | null;
    order: number | null;
}

/** Something that can be chosen: a sub-section in a dropdown, or a heading that goes straight to a page. */
export interface MenuEntry {
    label: string;
    /** The page's name, exactly as on its page tab. This is the value the visual filters on. */
    page: string | null;
    /** The page's id or web address, for opening it in a new tab. */
    link: string | null;
}

export interface MenuSection {
    label: string;
    /** Set when the heading itself goes to a page (a section with no sub-sections). */
    entry: MenuEntry | null;
    /** The dropdown. Empty when the heading is a plain link. */
    items: MenuEntry[];
}

const clean = (value: string | null): string => (value === null || value === undefined ? "" : String(value).trim());

/**
 * Turns the rows into headings and dropdowns. Rows are put in the order of the Order field
 * (rows without one keep the order they arrived in, after the rest). A section whose rows all
 * have a blank sub-section becomes a plain link; otherwise it becomes a dropdown.
 */
export function buildMenu(rows: RawRow[]): MenuSection[] {
    const sorted = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => clean(row.section) !== "")
        .sort((a, b) => {
            const x = a.row.order, y = b.row.order;
            if (x === null && y === null) return a.index - b.index;
            if (x === null) return 1;
            if (y === null) return -1;
            return x === y ? a.index - b.index : x - y;
        })
        .map(({ row }) => row);

    const sections: MenuSection[] = [];
    const byLabel = new Map<string, { section: MenuSection; rows: RawRow[] }>();
    for (const row of sorted) {
        const label = clean(row.section);
        let found = byLabel.get(label);
        if (!found) {
            found = { section: { label, entry: null, items: [] }, rows: [] };
            byLabel.set(label, found);
            sections.push(found.section);
        }
        found.rows.push(row);
    }
    byLabel.forEach(({ section, rows: own }) => {
        const entryOf = (row: RawRow, label: string): MenuEntry => ({ label, page: clean(row.page) || null, link: clean(row.link) || null });
        const named = own.filter((row) => clean(row.item) !== "");
        if (named.length === 0) {
            section.entry = entryOf(own[0], section.label);
        } else {
            // A blank sub-section among named ones still needs a label: its page name, or the section's.
            section.items = own.map((row) => entryOf(row, clean(row.item) || clean(row.page) || section.label));
        }
    });
    return sections;
}

/** Every entry in the menu, headings that are links included. */
export function allEntries(menu: MenuSection[]): MenuEntry[] {
    return menu.flatMap((section) => (section.entry ? [section.entry] : section.items));
}

export const samePage = (a: string | null, b: string | null): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The web address to open for an entry, or null when there is not enough to build one.
 *
 * `link` may be a full address, which is used as it is, or a page id, which is added to the
 * report's address. The report's address can be pasted straight from the browser: anything
 * after the report id (a page, a query string) is dropped.
 */
export function resolveLink(reportUrl: string, link: string | null): string | null {
    const target = clean(link);
    if (/^https?:\/\//i.test(target)) return target;
    if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
    const base = /^(https?:\/\/[^?#\s]*?\/reports\/[^/?#\s]+)/i.exec(clean(reportUrl));
    if (!base) return null;
    return `${base[1]}/${encodeURIComponent(target)}`;
}

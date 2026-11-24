"use strict";

export type ColumnType = "text" | "number";

export interface TableColumn {
    name: string;
    type: ColumnType;
}

/**
 * Text formatting set on one cell from the toolbar. Anything left out follows the Format pane
 * (Column headers > Text for a header cell, Values > Text for the rest).
 */
export interface CellFormat {
    /** A font name from FONTS. */
    font?: string;
    /** In points. */
    size?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: string;
}

/** The sides of a cell: top, right, bottom, left. */
export type Side = "t" | "r" | "b" | "l";
const SIDES: Side[] = ["t", "r", "b", "l"];

/** The border on each side of one cell: a colour, or nothing for no border on that side. */
export type CellBorder = { [side in Side]?: string };

/** What the Borders control offers, as a spreadsheet does. */
export type BorderChoice = "all" | "outside" | "left" | "right" | "top" | "bottom" | "leftRight" | "topBottom" | "none";

/** Row index that stands for the header row. */
export const HEADER_ROW = -1;

/** The fonts offered in the toolbar: the ones Power BI itself offers, so they exist wherever a report is viewed. */
export const FONTS: { name: string; css: string }[] = [
    { name: "Segoe UI", css: "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif" },
    { name: "Segoe UI Light", css: "'Segoe UI Light', wf_segoe-ui_light, helvetica, arial, sans-serif" },
    { name: "Segoe UI Semibold", css: "'Segoe UI Semibold', wf_segoe-ui_semibold, helvetica, arial, sans-serif" },
    { name: "Arial", css: "Arial, helvetica, sans-serif" },
    { name: "Arial Black", css: "'Arial Black', Arial, sans-serif" },
    { name: "Calibri", css: "Calibri, Arial, sans-serif" },
    { name: "Cambria", css: "Cambria, Georgia, serif" },
    { name: "Candara", css: "Candara, Arial, sans-serif" },
    { name: "Comic Sans MS", css: "'Comic Sans MS', Arial, sans-serif" },
    { name: "Consolas", css: "Consolas, 'Courier New', monospace" },
    { name: "Constantia", css: "Constantia, Georgia, serif" },
    { name: "Corbel", css: "Corbel, Arial, sans-serif" },
    { name: "Courier New", css: "'Courier New', monospace" },
    { name: "Georgia", css: "Georgia, serif" },
    { name: "Lucida Sans Unicode", css: "'Lucida Sans Unicode', Arial, sans-serif" },
    { name: "Tahoma", css: "Tahoma, Arial, sans-serif" },
    { name: "Times New Roman", css: "'Times New Roman', serif" },
    { name: "Trebuchet MS", css: "'Trebuchet MS', Arial, sans-serif" },
    { name: "Verdana", css: "Verdana, Arial, sans-serif" },
];

/** The CSS font-family for a font name from FONTS; an empty string for a name that is not one of them. */
export function fontCss(name: string | undefined): string {
    const font = FONTS.find((f) => f.name === name);
    return font ? font.css : "";
}

export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 40;

/** The whole table. Every cell is kept as the text that was typed, so nothing is lost by formatting. */
export interface TableData {
    columns: TableColumn[];
    rows: string[][];
    /** Fill colour of each cell, the same shape as `rows`. An empty string means no fill. */
    fills: string[][];
    /** Fill colour of each header cell, one per column. An empty string means no fill of its own. */
    headerFills: string[];
    /** Text formatting of each cell, the same shape as `rows`. An empty object means none of its own. */
    formats: CellFormat[][];
    /** Text formatting of each header cell, one per column. */
    headerFormats: CellFormat[];
    /** Borders of each cell, the same shape as `rows`. An empty object means none. */
    borders: CellBorder[][];
    /** Borders of each header cell, one per column. */
    headerBorders: CellBorder[];
    /** Width of each column in pixels. 0 means automatic. */
    widths: number[];
    /** Height of each row in pixels, the same length as `rows`. 0 means automatic. */
    heights: number[];
    /** Height of the header row in pixels. 0 means automatic. */
    headerHeight: number;
}

export const MIN_WIDTH = 30;
export const MAX_WIDTH = 800;
export const MIN_HEIGHT = 16;
export const MAX_HEIGHT = 300;

/** A column width or row height as saved: 0 for automatic, otherwise a whole number inside the limits. */
export function cleanSize(value: unknown, min: number, max: number): number {
    const n = typeof value === "number" ? value : Number(value);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.round(Math.min(max, Math.max(min, n)));
}

/** A table with no highlights: a blank fill for every cell. */
export function blankFills(rows: string[][]): string[][] {
    return rows.map((row) => row.map(() => ""));
}

export const MAX_ROWS = 300;
export const MAX_COLUMNS = 30;

/** Shown when the visual is first added and nothing has been typed yet. */
export function starterTable(): TableData {
    return {
        columns: [
            { name: "Item", type: "text" },
            { name: "Amount", type: "number" },
            { name: "Comment", type: "text" },
        ],
        rows: [["", "", ""], ["", "", ""], ["", "", ""]],
        fills: [["", "", ""], ["", "", ""], ["", "", ""]],
        headerFills: ["", "", ""],
        formats: [[{}, {}, {}], [{}, {}, {}], [{}, {}, {}]],
        headerFormats: [{}, {}, {}],
        borders: [[{}, {}, {}], [{}, {}, {}], [{}, {}, {}]],
        headerBorders: [{}, {}, {}],
        widths: [0, 0, 0],
        heights: [0, 0, 0],
        headerHeight: 0,
    };
}

/** A table with nothing in it at all. */
export function emptyTable(): TableData {
    return { columns: [], rows: [], fills: [], headerFills: [], formats: [], headerFormats: [], borders: [], headerBorders: [], widths: [], heights: [], headerHeight: 0 };
}

export function cloneTable(data: TableData): TableData {
    return {
        columns: data.columns.map((c) => ({ ...c })),
        rows: data.rows.map((r) => r.slice()),
        fills: data.fills.map((r) => r.slice()),
        headerFills: data.headerFills.slice(),
        formats: data.formats.map((r) => r.map((f) => ({ ...f }))),
        headerFormats: data.headerFormats.map((f) => ({ ...f })),
        borders: data.borders.map((r) => r.map((b) => ({ ...b }))),
        headerBorders: data.headerBorders.map((b) => ({ ...b })),
        widths: data.widths.slice(),
        heights: data.heights.slice(),
        headerHeight: data.headerHeight,
    };
}

const isColour = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value);

/** Keeps only the parts of a saved text format that are valid. */
export function cleanFormat(raw: unknown): CellFormat {
    const format: CellFormat = {};
    if (!raw || typeof raw !== "object") return format;
    const saved = raw as { [key: string]: unknown };
    if (typeof saved.font === "string" && fontCss(saved.font)) format.font = saved.font;
    const size = Number(saved.size);
    if (saved.size !== undefined && saved.size !== null && isFinite(size) && size > 0) format.size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
    if (typeof saved.bold === "boolean") format.bold = saved.bold;
    if (typeof saved.italic === "boolean") format.italic = saved.italic;
    if (typeof saved.underline === "boolean") format.underline = saved.underline;
    if (isColour(saved.color)) format.color = saved.color;
    return format;
}

/** Keeps only the sides of a saved border that have a valid colour. */
export function cleanBorder(raw: unknown): CellBorder {
    const border: CellBorder = {};
    if (!raw || typeof raw !== "object") return border;
    const saved = raw as { [key: string]: unknown };
    SIDES.forEach((side) => {
        if (isColour(saved[side])) border[side] = saved[side] as string;
    });
    return border;
}

const hasAny = (value: object): boolean => Object.keys(value).length > 0;

/** Makes every row the same length as the header and every cell a string. */
function normalise(data: TableData): TableData {
    const columns = data.columns.slice(0, MAX_COLUMNS).map((c) => ({
        name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
        type: c.type === "number" ? "number" as const : "text" as const,
    }));
    const rows = data.rows.slice(0, MAX_ROWS).map((row) =>
        columns.map((_, i) => {
            const cell = Array.isArray(row) ? row[i] : undefined;
            return cell === null || cell === undefined ? "" : String(cell);
        }));
    // Tables saved before highlighting existed have no fills; anything that is not a colour is dropped.
    const colour = (fill: unknown): string => (isColour(fill) ? fill : "");
    const savedFills = Array.isArray(data.fills) ? data.fills : [];
    const fills = rows.map((row, r) => columns.map((_, c) => colour(Array.isArray(savedFills[r]) ? savedFills[r][c] : "")));
    const savedHeaderFills = Array.isArray(data.headerFills) ? data.headerFills : [];
    const headerFills = columns.map((_, c) => colour(savedHeaderFills[c]));
    const savedFormats = Array.isArray(data.formats) ? data.formats : [];
    const formats = rows.map((row, r) => columns.map((_, c) => cleanFormat(Array.isArray(savedFormats[r]) ? savedFormats[r][c] : undefined)));
    const savedHeaderFormats = Array.isArray(data.headerFormats) ? data.headerFormats : [];
    const headerFormats = columns.map((_, c) => cleanFormat(savedHeaderFormats[c]));
    const savedBorders = Array.isArray(data.borders) ? data.borders : [];
    const borders = rows.map((row, r) => columns.map((_, c) => cleanBorder(Array.isArray(savedBorders[r]) ? savedBorders[r][c] : undefined)));
    const savedHeaderBorders = Array.isArray(data.headerBorders) ? data.headerBorders : [];
    const headerBorders = columns.map((_, c) => cleanBorder(savedHeaderBorders[c]));
    // Sizes: tables saved before resizing existed have none, which means automatic everywhere.
    const savedWidths = Array.isArray(data.widths) ? data.widths : [];
    const savedHeights = Array.isArray(data.heights) ? data.heights : [];
    const widths = columns.map((_, c) => cleanSize(savedWidths[c], MIN_WIDTH, MAX_WIDTH));
    const heights = rows.map((_, r) => cleanSize(savedHeights[r], MIN_HEIGHT, MAX_HEIGHT));
    const headerHeight = cleanSize(data.headerHeight, MIN_HEIGHT, MAX_HEIGHT);
    return { columns, rows, fills, headerFills, formats, headerFormats, borders, headerBorders, widths, heights, headerHeight };
}

/**
 * Text formats and borders are saved as short lists of the cells that have any, keyed
 * "row,column" with "h" for the header row, because most cells have none.
 */
type Sparse<T> = { [cell: string]: T };

function toSparse<T extends object>(body: T[][], header: T[]): Sparse<T> | undefined {
    const sparse: Sparse<T> = {};
    header.forEach((value, c) => {
        if (hasAny(value)) sparse[`h,${c}`] = value;
    });
    body.forEach((row, r) => row.forEach((value, c) => {
        if (hasAny(value)) sparse[`${r},${c}`] = value;
    }));
    return hasAny(sparse) ? sparse : undefined;
}

function fromSparse(sparse: unknown, rowCount: number, columnCount: number): { body: unknown[][]; header: unknown[] } {
    const body: unknown[][] = Array.from({ length: rowCount }, () => new Array(columnCount).fill(undefined));
    const header: unknown[] = new Array(columnCount).fill(undefined);
    if (sparse && typeof sparse === "object" && !Array.isArray(sparse)) {
        Object.keys(sparse as Sparse<unknown>).forEach((key) => {
            const [rowText, columnText] = key.split(",");
            const c = Number(columnText);
            if (!(c >= 0 && c < columnCount)) return;
            if (rowText === "h") header[c] = (sparse as Sparse<unknown>)[key];
            else if (Number(rowText) >= 0 && Number(rowText) < rowCount) body[Number(rowText)][c] = (sparse as Sparse<unknown>)[key];
        });
    }
    return { body, header };
}

/** Reads the table saved with the report. Returns null when nothing usable is stored. */
export function parseData(json: unknown): TableData | null {
    if (typeof json !== "string" || !json.trim()) return null;
    try {
        const parsed = JSON.parse(json);
        if (!parsed || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows) || parsed.columns.length === 0) return null;
        const rowCount = parsed.rows.length, columnCount = parsed.columns.length;
        const formats = fromSparse(parsed.formats, rowCount, columnCount);
        const borders = fromSparse(parsed.borders, rowCount, columnCount);
        // Tables saved before borders had sides have one outline colour for a cell: a border on all four sides.
        const allRound = (colour: unknown) => (isColour(colour) ? { t: colour, r: colour, b: colour, l: colour } : undefined);
        if (Array.isArray(parsed.outlines)) {
            parsed.outlines.forEach((row: unknown, r: number) => {
                if (Array.isArray(row) && borders.body[r]) row.forEach((colour, c) => (borders.body[r][c] = borders.body[r][c] || allRound(colour)));
            });
        }
        if (Array.isArray(parsed.headerOutlines)) parsed.headerOutlines.forEach((colour: unknown, c: number) => (borders.header[c] = borders.header[c] || allRound(colour)));
        return normalise({ ...parsed, formats: formats.body, headerFormats: formats.header, borders: borders.body, headerBorders: borders.header } as TableData);
    } catch {
        return null;
    }
}

export function serialiseData(data: TableData): string {
    const clean = normalise(data);
    // Highlights are only written when there are some, to keep the saved text short.
    const saved: {
        v: number; columns: TableColumn[]; rows: string[][];
        fills?: string[][]; headerFills?: string[]; formats?: Sparse<CellFormat>; borders?: Sparse<CellBorder>;
        widths?: number[]; heights?: number[]; headerHeight?: number;
    } = { v: 5, columns: clean.columns, rows: clean.rows };
    if (clean.fills.some((row) => row.some((fill) => fill))) saved.fills = clean.fills;
    if (clean.headerFills.some((fill) => fill)) saved.headerFills = clean.headerFills;
    const formats = toSparse(clean.formats, clean.headerFormats);
    if (formats) saved.formats = formats;
    const borders = toSparse(clean.borders, clean.headerBorders);
    if (borders) saved.borders = borders;
    if (clean.widths.some((w) => w > 0)) saved.widths = clean.widths;
    if (clean.heights.some((h) => h > 0)) saved.heights = clean.heights;
    if (clean.headerHeight > 0) saved.headerHeight = clean.headerHeight;
    return JSON.stringify(saved);
}

/**
 * Reads a typed number. Accepts thousands separators, a currency symbol, a percent sign and
 * accounting-style brackets for negatives, for example "1,250", "$1,250.50", "(300)" or "-12%".
 * Returns null for empty cells and for text that is not a number.
 */
export function parseNumber(text: string): number | null {
    let t = text.trim();
    if (!t) return null;
    let negative = false;
    if (/^\(.*\)$/.test(t)) {
        negative = true;
        t = t.slice(1, -1);
    }
    t = t.replace(/[\s,$€£¥%]/g, "").replace(/−/g, "-");
    if (t.startsWith("-")) {
        negative = !negative;
        t = t.slice(1);
    } else if (t.startsWith("+")) {
        t = t.slice(1);
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    const value = Number(t);
    if (!isFinite(value)) return null;
    return negative ? -value : value;
}

export interface NumberStyle {
    locale: string;
    decimals: number;
    /** Show negatives as (1,200) instead of -1,200. */
    brackets: boolean;
    /** Put in front of every number, for example "$". */
    prefix: string;
}

export function formatNumber(value: number, style: NumberStyle): string {
    const decimals = Math.min(6, Math.max(0, Math.round(style.decimals) || 0));
    let body: string;
    try {
        body = new Intl.NumberFormat(style.locale || undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(value));
    } catch {
        body = Math.abs(value).toFixed(decimals);
    }
    // A value that rounds to zero is shown without a sign.
    const isNegative = value < 0 && Number(Math.abs(value).toFixed(decimals)) !== 0;
    const text = `${style.prefix}${body}`;
    if (!isNegative) return text;
    return style.brackets ? `(${text})` : `-${text}`;
}

/** What a cell shows when it is not being edited. */
export function displayCell(raw: string, column: TableColumn, style: NumberStyle): string {
    if (column.type !== "number") return raw;
    const value = parseNumber(raw);
    // Text typed into a number column is left as it is, so nothing silently disappears.
    return value === null ? raw : formatNumber(value, style);
}

/** Sum of each number column (null for text columns, and for number columns with no numbers in them). */
export function columnTotals(data: TableData): (number | null)[] {
    return data.columns.map((column, c) => {
        if (column.type !== "number") return null;
        let total = 0, found = false;
        data.rows.forEach((row) => {
            const value = parseNumber(row[c] || "");
            if (value !== null) {
                total += value;
                found = true;
            }
        });
        return found ? total : null;
    });
}

// Adding and removing rows and columns. Every per-row and per-column list (values, fills,
// text formats, borders, sizes) is changed together here, so they can never fall out of step.

/** Adds an empty row at the bottom. */
export function addRow(data: TableData): void {
    data.rows.push(data.columns.map(() => ""));
    data.fills.push(data.columns.map(() => ""));
    data.formats.push(data.columns.map(() => ({})));
    data.borders.push(data.columns.map(() => ({})));
    data.heights.push(0);
}

export function removeRow(data: TableData, row: number): void {
    data.rows.splice(row, 1);
    data.fills.splice(row, 1);
    data.formats.splice(row, 1);
    data.borders.splice(row, 1);
    data.heights.splice(row, 1);
}

/** Adds an empty text column on the right. */
export function addColumn(data: TableData): void {
    data.columns.push({ name: `Column ${data.columns.length + 1}`, type: "text" });
    data.rows.forEach((row) => row.push(""));
    data.fills.forEach((row) => row.push(""));
    data.formats.forEach((row) => row.push({}));
    data.borders.forEach((row) => row.push({}));
    data.headerFills.push("");
    data.headerFormats.push({});
    data.headerBorders.push({});
    data.widths.push(0);
}

export function removeColumn(data: TableData, column: number): void {
    data.columns.splice(column, 1);
    data.rows.forEach((row) => row.splice(column, 1));
    data.fills.forEach((row) => row.splice(column, 1));
    data.formats.forEach((row) => row.splice(column, 1));
    data.borders.forEach((row) => row.splice(column, 1));
    data.headerFills.splice(column, 1);
    data.headerFormats.splice(column, 1);
    data.headerBorders.splice(column, 1);
    data.widths.splice(column, 1);
}

// ---------------------------------------------------------------- text formats and borders

/** A block of cells. Rows run from `top` to `bottom`, where HEADER_ROW is the header row; columns from `left` to `right`. */
export interface CellRange {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

/** The text format of one cell (a header cell when `row` is HEADER_ROW), or undefined outside the table. */
export function formatAt(data: TableData, row: number, column: number): CellFormat | undefined {
    return row === HEADER_ROW ? data.headerFormats[column] : data.formats[row] ? data.formats[row][column] : undefined;
}

/** The borders of one cell (a header cell when `row` is HEADER_ROW), or undefined outside the table. */
export function borderAt(data: TableData, row: number, column: number): CellBorder | undefined {
    return row === HEADER_ROW ? data.headerBorders[column] : data.borders[row] ? data.borders[row][column] : undefined;
}

const OPPOSITE: { [side in Side]: Side } = { t: "b", b: "t", l: "r", r: "l" };
const STEP: { [side in Side]: [number, number] } = { t: [-1, 0], b: [1, 0], l: [0, -1], r: [0, 1] };

/**
 * Sets or clears one edge. Two cells share the edge between them, as in a spreadsheet, so the
 * neighbour's side of it is cleared: a line is never drawn twice, and removing it removes it.
 */
function setEdge(data: TableData, row: number, column: number, side: Side, colour: string): void {
    const own = borderAt(data, row, column);
    if (!own) return;
    if (colour) own[side] = colour;
    else delete own[side];
    const neighbour = borderAt(data, row + STEP[side][0], column + STEP[side][1]);
    if (neighbour) delete neighbour[OPPOSITE[side]];
}

/**
 * Puts borders on a block of cells the way a spreadsheet's Borders menu does. "left", "top" and
 * so on draw that edge of the block; "outside" boxes the block; "all" also draws every line
 * inside it; "none" removes every line on or inside it. Borders already there are kept.
 */
export function applyBorders(data: TableData, range: CellRange, choice: BorderChoice, colour: string): void {
    for (let row = range.top; row <= range.bottom; row++) {
        for (let column = range.left; column <= range.right; column++) {
            const edge: { [side in Side]: boolean } = { t: row === range.top, b: row === range.bottom, l: column === range.left, r: column === range.right };
            SIDES.forEach((side) => {
                const wanted = choice === "all"
                    || (choice === "outside" && edge[side])
                    || (side === "l" && edge.l && (choice === "left" || choice === "leftRight"))
                    || (side === "r" && edge.r && (choice === "right" || choice === "leftRight"))
                    || (side === "t" && edge.t && (choice === "top" || choice === "topBottom"))
                    || (side === "b" && edge.b && (choice === "bottom" || choice === "topBottom"));
                if (choice === "none") setEdge(data, row, column, side, "");
                else if (wanted) setEdge(data, row, column, side, colour);
            });
        }
    }
}

/** Changes the text format of every cell in a block. A value of undefined removes that part, so it follows the Format pane again. */
export function applyFormat(data: TableData, range: CellRange, change: CellFormat): void {
    for (let row = range.top; row <= range.bottom; row++) {
        for (let column = range.left; column <= range.right; column++) {
            const format = formatAt(data, row, column);
            if (!format) continue;
            (Object.keys(change) as (keyof CellFormat)[]).forEach((key) => {
                if (change[key] === undefined) delete format[key];
                else Object.assign(format, { [key]: change[key] });
            });
        }
    }
}

/** Removes all text formatting from every cell in a block. */
export function clearFormat(data: TableData, range: CellRange): void {
    for (let row = range.top; row <= range.bottom; row++) {
        for (let column = range.left; column <= range.right; column++) {
            const format = formatAt(data, row, column);
            if (format) (Object.keys(format) as (keyof CellFormat)[]).forEach((key) => delete format[key]);
        }
    }
}

/** Splits text copied from a spreadsheet (tabs between cells, new lines between rows) into a grid. */
export function parseClipboard(text: string): string[][] {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    // Spreadsheets end the copied block with a new line; drop that empty last row.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    return lines.map((line) => line.split("\t"));
}

/** True when clipboard text covers more than one cell. */
export function isGridPaste(text: string): boolean {
    return /\t/.test(text) || /[\r\n]/.test(text.replace(/[\r\n]+$/, ""));
}

/**
 * Writes a pasted grid into the table starting at the given cell, adding rows and columns
 * if the block runs past the edge. Returns a new table; the original is not changed.
 */
export function pasteGrid(data: TableData, startRow: number, startColumn: number, grid: string[][]): TableData {
    const next = cloneTable(data);
    const neededColumns = Math.min(MAX_COLUMNS, startColumn + Math.max(0, ...grid.map((r) => r.length)));
    while (next.columns.length < neededColumns) addColumn(next);
    const neededRows = Math.min(MAX_ROWS, startRow + grid.length);
    while (next.rows.length < neededRows) addRow(next);
    grid.forEach((line, r) => {
        line.forEach((cell, c) => {
            const row = startRow + r, column = startColumn + c;
            if (row < next.rows.length && column < next.columns.length) next.rows[row][column] = cell.trim();
        });
    });
    return next;
}

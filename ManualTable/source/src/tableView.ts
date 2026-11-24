"use strict";

import {
    addColumn, addRow, applyBorders, applyFormat, borderAt, BorderChoice, CellBorder, CellFormat, CellRange, cleanSize, clearFormat, cloneTable,
    columnTotals, displayCell, emptyTable, fontCss, FONTS, formatAt, formatNumber, HEADER_ROW, isGridPaste, MAX_COLUMNS, MAX_FONT_SIZE, MAX_HEIGHT,
    MAX_ROWS, MAX_WIDTH, MIN_FONT_SIZE, MIN_HEIGHT, MIN_WIDTH, NumberStyle, parseClipboard, pasteGrid, removeColumn, removeRow, TableColumn, TableData,
} from "./tableModel";
import { hexToHsv, Hsv, hsvToHex, isDark, joinColour, parseHex, splitColour } from "./colour";

export type TextAlign = "auto" | "left" | "center" | "right";

/** How a block of text looks. Used once for the header row and once for the values. */
export interface TextStyle {
    fontFamily: string;
    /** In points. */
    fontSize: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color: string;
    /** "auto" puts text on the left and numbers on the right. */
    align: TextAlign;
}

export interface TableViewOptions {
    /** True while the report is being authored; false for people viewing the published report. */
    editable: boolean;
    header: TextStyle;
    /** Fill behind the header row. Empty means no fill. */
    headerBackground: string;
    values: TextStyle;
    /** Fill behind every value cell and the totals row. Empty means no fill. */
    valuesBackground: string;
    ruleColor: string;
    /** Thickness of the line under each row, in pixels. 0 means no lines. */
    ruleWidth: number;
    rowPadding: number;
    banding: boolean;
    bandColor: string;
    showTotals: boolean;
    totalsLabel: string;
    numbers: NumberStyle;
}

/** Called after every edit with the new table. */
export type ChangeHandler = (data: TableData) => void;


/**
 * Sets one style on an element as "important". The host application has its own stylesheet for
 * form controls; without this, a text box can keep the host's white background and hide the
 * fill behind it, which is what stopped the header colour showing while authoring.
 */
const paint = (node: HTMLElement, property: string, value: string): void => {
    node.style.setProperty(property, value, "important");
};

type Scope = "cell" | "row" | "column";

/** What the colour picker is setting: the colour of a cell's text, the colour behind it, or its borders. */
type ColourMode = "text" | "fill" | "border";
const COLOUR_MODES: ColourMode[] = ["text", "fill", "border"];
const MODE_NAME: { [mode in ColourMode]: string } = { text: "Text", fill: "Fill", border: "Border" };

/** Thickness of a cell border, in pixels. */
const BORDER_WIDTH = 2;

/** The choices in the picker's Sides list, in the order a spreadsheet's Borders menu gives them. */
const BORDER_CHOICES: { value: BorderChoice; label: string }[] = [
    { value: "all", label: "All" },
    { value: "outside", label: "Outside" },
    { value: "bottom", label: "Bottom" },
    { value: "top", label: "Top" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
    { value: "topBottom", label: "Top and bottom" },
    { value: "leftRight", label: "Left and right" },
];

/**
 * A cell's borders as CSS. Each is drawn just inside the cell's edge, so borders never change
 * a cell's size.
 */
const borderShadow = (border: CellBorder | undefined): string => {
    if (!border) return "none";
    const w = BORDER_WIDTH;
    const parts: string[] = [];
    if (border.l) parts.push(`inset ${w}px 0 0 0 ${border.l}`);
    if (border.r) parts.push(`inset -${w}px 0 0 0 ${border.r}`);
    if (border.t) parts.push(`inset 0 ${w}px 0 0 ${border.t}`);
    if (border.b) parts.push(`inset 0 -${w}px 0 0 ${border.b}`);
    return parts.length ? parts.join(", ") : "none";
};
/** Width of the narrow column that holds the delete-row buttons while authoring. */
const TOOLS_WIDTH = 26;
/** Size of the colour picker's saturation and brightness square, in pixels. */
const SV_WIDTH = 190, SV_HEIGHT = 100;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/**
 * Draws the table. In edit mode every header and cell is a text box, the edges of columns and
 * rows can be dragged to resize them, and a toolbar adds rows and columns, fills cells with
 * colour and sets exact sizes. Otherwise it is plain, read-only text.
 *
 * Every colour, font and fill is written directly onto the element that shows it, including the
 * text boxes. Nothing relies on the stylesheet or on the boxes being see-through, because the
 * host application can restyle form controls.
 */
export class TableView {
    private readonly root: HTMLDivElement;
    private data: TableData = emptyTable();
    private options: TableViewOptions | null = null;
    private onChange: ChangeHandler = () => undefined;
    private totalCells: HTMLTableCellElement[] = [];
    /** The cell that formatting and sizes apply to: the one being typed in, or the last one that was. */
    private active: { row: number; column: number } | null = null;
    private scope: Scope = "cell";

    // Colour picker: whether it is open, which of text, fill and border it is setting, what its
    // controls show for each, and the colour last applied for each (shown on the toolbar buttons).
    private pickerOpen = false;
    private pickerMode: ColourMode = "fill";
    private pickerState: { [mode in ColourMode]: { colour: Hsv; transparency: number } } = {
        text: { colour: hexToHsv("#C8283C"), transparency: 0 },
        fill: { colour: hexToHsv("#57B133"), transparency: 0 },
        border: { colour: hexToHsv("#1C1C1B"), transparency: 0 },
    };
    private applied: { [mode in ColourMode]: string } = { text: "#C8283C", fill: "#57B133", border: "#1C1C1B" };
    private chips: { [mode in ColourMode]: HTMLSpanElement | null } = { text: null, fill: null, border: null };
    /** Which sides the Border tab's Apply button draws. */
    private borderChoice: BorderChoice = "all";
    private pickerParts: {
        square: HTMLDivElement; knob: HTMLDivElement; hue: HTMLInputElement; hex: HTMLInputElement; ink: HTMLSpanElement;
        alpha: HTMLInputElement; alphaTrack: HTMLDivElement; alphaLabel: HTMLSpanElement; sidesRow: HTMLDivElement;
        tabs: { [mode in ColourMode]: HTMLButtonElement };
    } | null = null;

    // The toolbar's text controls, which show the formatting of the active cell.
    private formatParts: {
        font: HTMLSelectElement; size: HTMLInputElement; clear: HTMLButtonElement;
        toggles: { [key in "bold" | "italic" | "underline"]: HTMLButtonElement };
    } | null = null;

    // Parts of the table that sizes are applied to without rebuilding it.
    private tableElement: HTMLTableElement | null = null;
    private columnElements: HTMLTableColElement[] = [];
    private widthInput: HTMLInputElement | null = null;
    private heightInput: HTMLInputElement | null = null;

    constructor(container: HTMLElement) {
        this.root = el("div", "manualTable");
        container.appendChild(this.root);
    }

    /** Rebuilds the whole table from the given data. */
    public render(data: TableData, options: TableViewOptions, onChange: ChangeHandler): void {
        this.data = cloneTable(data);
        this.options = options;
        this.onChange = onChange;
        this.build();
    }

    // ------------------------------------------------------------------ styling

    private alignFor(style: TextStyle, column: TableColumn): string {
        if (style.align !== "auto") return style.align;
        return column.type === "number" ? "right" : "left";
    }

    /**
     * The text style a cell ends up with: the Format pane's style for headers or values, with
     * whatever was set on the cell itself from the toolbar laid over it.
     */
    private effectiveText(style: TextStyle, format: CellFormat | undefined): TextStyle {
        if (!format) return style;
        return {
            fontFamily: fontCss(format.font) || style.fontFamily,
            fontSize: format.size ?? style.fontSize,
            bold: format.bold ?? style.bold,
            italic: format.italic ?? style.italic,
            underline: format.underline ?? style.underline,
            color: format.color || style.color,
            align: style.align,
        };
    }

    /** Writes a text style onto an element (a cell, or the text box inside it). */
    private applyText(node: HTMLElement, base: TextStyle, column: TableColumn, forceBold = false, format?: CellFormat): void {
        const style = this.effectiveText(base, format);
        paint(node, "font-family", style.fontFamily);
        paint(node, "font-size", `${style.fontSize}pt`);
        paint(node, "font-weight", style.bold || forceBold ? "600" : "400");
        paint(node, "font-style", style.italic ? "italic" : "normal");
        paint(node, "text-decoration", style.underline ? "underline" : "none");
        paint(node, "color", style.color);
        paint(node, "text-align", this.alignFor(style, column));
    }

    /** The fill behind a body cell: its own fill first, then alternate-row shading, then the values background. */
    private cellFill(row: number, column: number): string {
        const options = this.options!;
        const own = this.data.fills[row] ? this.data.fills[row][column] : "";
        if (own) return own;
        if (options.banding && row % 2 === 1) return options.bandColor;
        return options.valuesBackground || "";
    }

    /**
     * The fill behind a header cell: its own fill first, then the header background from the
     * format pane. With no column given, the fill for the header row as a whole.
     */
    private headerFill(column?: number): string {
        const options = this.options!;
        const own = column === undefined ? "" : this.data.headerFills[column] || "";
        return own || options.headerBackground || "";
    }

    /** Paints one header cell and, in edit mode, the text box inside it. */
    private paintHeader(th: HTMLTableCellElement, column: number): void {
        const options = this.options!;
        const fill = this.headerFill(column);
        paint(th, "background", fill || "transparent");
        // The line under the header is one pixel thicker than the lines between rows.
        paint(th, "border-bottom", options.ruleWidth > 0 ? `${options.ruleWidth + 1}px solid ${options.ruleColor}` : "none");
        const format = this.data.headerFormats[column];
        const input = th.querySelector<HTMLInputElement>("input.header");
        if (input) {
            this.applyText(input, options.header, this.data.columns[column], false, format);
            // The box is given the fill itself, so the fill shows even where the host
            // application draws text boxes with a solid background.
            paint(input, "background", fill || "transparent");
            paint(input, "padding", `${Math.max(0, options.rowPadding)}px 5px`);
        } else {
            this.applyText(th, options.header, this.data.columns[column], false, format);
            paint(th, "padding", `${Math.max(0, options.rowPadding)}px 8px`);
        }
        // A header cell given its own dark fill switches to white text so it stays readable,
        // unless a text colour was chosen for it.
        const own = this.data.headerFills[column] || "";
        if (own && isDark(own) && !(format && format.color)) paint(input || th, "color", "#FFFFFF");
        paint(th, "box-shadow", borderShadow(this.data.headerBorders[column]));
    }

    /** Paints one body cell and, in edit mode, the text box inside it. */
    private paintCell(td: HTMLTableCellElement, row: number, column: number): void {
        const options = this.options!;
        const fill = this.cellFill(row, column);
        paint(td, "background", fill || "transparent");
        paint(td, "border-bottom", options.ruleWidth > 0 ? `${options.ruleWidth}px solid ${options.ruleColor}` : "none");
        const format = formatAt(this.data, row, column);
        const input = td.querySelector<HTMLInputElement>("input.cell");
        if (input) {
            this.applyText(input, options.values, this.data.columns[column], false, format);
            paint(input, "background", fill || "transparent");
            paint(input, "padding", `${Math.max(0, options.rowPadding)}px 5px`);
        } else {
            this.applyText(td, options.values, this.data.columns[column], false, format);
            paint(td, "padding", `${Math.max(0, options.rowPadding)}px 8px`);
        }
        // A cell given its own dark fill switches to white text so it stays readable, unless a
        // text colour was chosen for it.
        const own = this.data.fills[row] ? this.data.fills[row][column] : "";
        if (own && isDark(own) && !(format && format.color)) paint(input || td, "color", "#FFFFFF");
        paint(td, "box-shadow", borderShadow(borderAt(this.data, row, column)));
    }

    /** Repaints one cell, body or header, keeping the white editing box of the cell being typed in. */
    private repaint(row: number, column: number): void {
        if (row === HEADER_ROW) {
            const th = this.headerCell(column);
            if (th) this.paintHeader(th, column);
            return;
        }
        const td = this.bodyCell(row, column);
        if (!td) return;
        this.paintCell(td, row, column);
        const input = td.querySelector<HTMLInputElement>("input.cell");
        if (input && input === document.activeElement) this.styleEditing(input);
    }

    private headerCell(column: number): HTMLTableCellElement | null {
        return this.root.querySelector<HTMLTableCellElement>(`thead th[data-column="${column}"]`);
    }

    private bodyCell(row: number, column: number): HTMLTableCellElement | null {
        return this.root.querySelector<HTMLTableCellElement>(`tbody td[data-row="${row}"][data-column="${column}"]`);
    }

    // ------------------------------------------------------------------ sizes

    /**
     * Applies the saved column widths and row heights to the table that is on screen. Columns
     * and rows with no size set stay automatic.
     */
    private applySizes(): void {
        const options = this.options;
        const table = this.tableElement;
        if (!options || !table) return;
        const widths = this.data.widths;
        const anySet = widths.some((w) => w > 0);
        const allSet = widths.length > 0 && widths.every((w) => w > 0);
        // With every width set, the table is exactly as wide as its columns; otherwise it fills
        // the visual and the automatic columns share what is left.
        paint(table, "table-layout", anySet ? "fixed" : "auto");
        const total = widths.reduce((sum, w) => sum + w, 0) + (options.editable ? TOOLS_WIDTH : 0);
        paint(table, "width", allSet ? `${total}px` : "100%");
        this.columnElements.forEach((col, c) => {
            if (widths[c] > 0) paint(col, "width", `${widths[c]}px`);
            else col.style.removeProperty("width");
        });

        const setRowHeight = (tr: HTMLTableRowElement | null, height: number) => {
            if (!tr) return;
            if (height > 0) paint(tr, "height", `${height}px`);
            else tr.style.removeProperty("height");
            // A text box does not stretch with its row, so it is given the height directly.
            tr.querySelectorAll<HTMLInputElement>("input.cell, input.header").forEach((input) => {
                if (height > 0) paint(input, "height", `${Math.max(12, height - 5)}px`);
                else input.style.removeProperty("height");
            });
        };
        setRowHeight(table.querySelector<HTMLTableRowElement>("thead tr"), this.data.headerHeight);
        table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((tr, r) => setRowHeight(tr, this.data.heights[r] || 0));
    }

    /** Sets a column's width, a row's height, or (with HEADER_ROW) the header row's height. 0 means automatic. */
    private setSize(kind: "column" | "row", index: number, size: number): void {
        if (kind === "column") {
            if (index >= 0 && index < this.data.widths.length) this.data.widths[index] = cleanSize(size, MIN_WIDTH, MAX_WIDTH);
        } else if (index === HEADER_ROW) {
            this.data.headerHeight = cleanSize(size, MIN_HEIGHT, MAX_HEIGHT);
        } else if (index >= 0 && index < this.data.heights.length) {
            this.data.heights[index] = cleanSize(size, MIN_HEIGHT, MAX_HEIGHT);
        }
    }

    /** Starts dragging the edge of a column or row. The size follows the pointer until the button is released. */
    private startResize(event: MouseEvent, kind: "column" | "row", index: number, startSize: number): void {
        event.preventDefault();
        event.stopPropagation();
        const origin = kind === "column" ? event.clientX : event.clientY;
        const minimum = kind === "column" ? MIN_WIDTH : MIN_HEIGHT;
        this.root.classList.add(kind === "column" ? "resizingColumn" : "resizingRow");
        const move = (e: MouseEvent) => {
            const delta = (kind === "column" ? e.clientX : e.clientY) - origin;
            this.setSize(kind, index, Math.max(minimum, startSize + delta));
            this.applySizes();
            this.refreshSizeInputs();
        };
        const stop = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
            window.removeEventListener("blur", stop);
            this.root.classList.remove("resizingColumn", "resizingRow");
            this.commit();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
        // If the pointer is released outside the visual, the mouseup never arrives; stop anyway.
        window.addEventListener("blur", stop);
    }

    /** A thin strip on the right edge of a header cell: drag to change the column's width, double-click for automatic. */
    private columnGrip(column: number, th: HTMLTableCellElement): HTMLDivElement {
        const grip = el("div", "columnGrip");
        grip.title = "Drag to change the column width. Double-click to make it automatic.";
        grip.addEventListener("mousedown", (event) => this.startResize(event, "column", column, th.getBoundingClientRect().width));
        grip.addEventListener("dblclick", (event) => {
            event.preventDefault();
            this.setSize("column", column, 0);
            this.applySizes();
            this.refreshSizeInputs();
            this.commit();
        });
        return grip;
    }

    /** A thin strip on the bottom edge of a cell: drag to change its row's height, double-click for automatic. */
    private rowGrip(row: number, cell: HTMLTableCellElement): HTMLDivElement {
        const grip = el("div", "rowGrip");
        grip.title = "Drag to change the row height. Double-click to make it automatic.";
        grip.addEventListener("mousedown", (event) => {
            const tr = cell.parentElement as HTMLTableRowElement;
            this.startResize(event, "row", row, tr.getBoundingClientRect().height);
        });
        grip.addEventListener("dblclick", (event) => {
            event.preventDefault();
            this.setSize("row", row, 0);
            this.applySizes();
            this.refreshSizeInputs();
            this.commit();
        });
        return grip;
    }

    /** Shows the active cell's column width and row height in the toolbar boxes (blank for automatic). */
    private refreshSizeInputs(): void {
        const width = this.widthInput, height = this.heightInput;
        if (!width || !height) return;
        const active = this.active;
        width.disabled = height.disabled = !active;
        if (!active) {
            width.value = height.value = "";
            return;
        }
        const w = this.data.widths[active.column] || 0;
        const h = active.row === HEADER_ROW ? this.data.headerHeight : this.data.heights[active.row] || 0;
        if (document.activeElement !== width) width.value = w > 0 ? String(w) : "";
        if (document.activeElement !== height) height.value = h > 0 ? String(h) : "";
    }

    // ------------------------------------------------------------------ building

    private build(focus?: { row: number; column: number }): void {
        const options = this.options!;
        const data = this.data;
        const root = this.root;
        while (root.firstChild) root.removeChild(root.firstChild);
        this.tableElement = null;
        this.columnElements = [];
        this.pickerParts = null;
        this.chips = { text: null, fill: null, border: null };
        this.formatParts = null;
        this.widthInput = this.heightInput = null;
        root.classList.toggle("editing", options.editable);
        paint(root, "background", "transparent");
        paint(root, "color", options.values.color);
        paint(root, "font-family", options.values.fontFamily);
        paint(root, "font-size", `${options.values.fontSize}pt`);

        if (!options.editable && (data.columns.length === 0 || data.rows.every((r) => r.every((c) => !c.trim())))) {
            root.appendChild(el("div", "empty", "No data has been entered."));
            return;
        }
        if (this.active && (this.active.row >= data.rows.length || this.active.column >= data.columns.length)) this.active = null;

        if (options.editable) {
            root.appendChild(this.buildToolbar());
            if (this.pickerOpen) root.appendChild(this.buildPicker());
        }

        const pad = Math.max(0, options.rowPadding);
        const headerFill = this.headerFill();
        const table = el("table");
        this.tableElement = table;

        // One <col> per column carries its width.
        const colgroup = el("colgroup");
        data.columns.forEach(() => {
            const col = el("col");
            this.columnElements.push(col);
            colgroup.appendChild(col);
        });
        if (options.editable) {
            const toolsCol = el("col");
            paint(toolsCol, "width", `${TOOLS_WIDTH}px`);
            colgroup.appendChild(toolsCol);
        }
        table.appendChild(colgroup);

        const head = el("thead");
        const headRow = el("tr");
        paint(headRow, "background", headerFill || "transparent");
        data.columns.forEach((column, c) => {
            const th = el("th");
            th.dataset.column = String(c);
            if (options.editable) {
                const wrap = el("div", "headerCell");
                const name = el("input", "header");
                name.type = "text";
                name.value = column.name;
                name.setAttribute("aria-label", `Name of column ${c + 1}`);
                // Clicking a header makes it the cell that fills and sizes apply to.
                name.addEventListener("focus", () => this.setActive(HEADER_ROW, c));
                name.addEventListener("change", () => {
                    this.data.columns[c].name = name.value;
                    this.commit();
                });
                name.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.focusCell(0, c);
                    }
                });
                const type = el("button", "type", column.type === "number" ? "123" : "Abc");
                type.type = "button";
                type.title = column.type === "number"
                    ? "Number column: formatted and totalled. Click to make it text."
                    : "Text column. Click to make it a number column.";
                type.addEventListener("click", () => {
                    this.data.columns[c].type = column.type === "number" ? "text" : "number";
                    this.commit(true);
                });
                const remove = el("button", "remove", "×");
                remove.type = "button";
                remove.title = "Delete this column";
                remove.disabled = data.columns.length <= 1;
                remove.addEventListener("click", () => {
                    removeColumn(this.data, c);
                    this.commit(true);
                });
                wrap.appendChild(name);
                wrap.appendChild(type);
                wrap.appendChild(remove);
                th.appendChild(wrap);
                th.appendChild(this.rowGrip(HEADER_ROW, th));
                th.appendChild(this.columnGrip(c, th));
            } else {
                th.textContent = column.name;
            }
            this.paintHeader(th, c);
            headRow.appendChild(th);
        });
        if (options.editable) {
            const tools = el("th", "rowTools");
            paint(tools, "background", headerFill || "transparent");
            headRow.appendChild(tools);
        }
        head.appendChild(headRow);
        table.appendChild(head);

        const body = el("tbody");
        data.rows.forEach((row, r) => {
            const tr = el("tr");
            data.columns.forEach((column, c) => {
                const td = el("td");
                td.dataset.row = String(r);
                td.dataset.column = String(c);
                if (options.editable) {
                    td.appendChild(this.buildCellInput(r, c));
                    td.appendChild(this.rowGrip(r, td));
                } else {
                    td.textContent = displayCell(row[c] || "", column, options.numbers);
                }
                this.paintCell(td, r, c);
                tr.appendChild(td);
            });
            if (options.editable) {
                const tools = el("td", "rowTools");
                const remove = el("button", "remove", "×");
                remove.type = "button";
                remove.title = "Delete this row";
                remove.disabled = data.rows.length <= 1;
                remove.addEventListener("click", () => {
                    removeRow(this.data, r);
                    this.commit(true);
                });
                tools.appendChild(remove);
                tr.appendChild(tools);
            }
            body.appendChild(tr);
        });
        table.appendChild(body);

        this.totalCells = [];
        if (options.showTotals && data.columns.some((c) => c.type === "number")) {
            const foot = el("tfoot");
            const tr = el("tr");
            data.columns.forEach((column) => {
                const td = el("td");
                this.applyText(td, options.values, column, true);
                paint(td, "border-top", options.ruleWidth > 0 ? `${options.ruleWidth + 1}px solid ${options.ruleColor}` : "none");
                paint(td, "background", options.valuesBackground || "transparent");
                paint(td, "padding", `${pad}px 8px`);
                this.totalCells.push(td);
                tr.appendChild(td);
            });
            if (options.editable) tr.appendChild(el("td", "rowTools"));
            foot.appendChild(tr);
            table.appendChild(foot);
            this.refreshTotals();
        }

        root.appendChild(table);
        this.applySizes();
        this.markActive();
        this.refreshSizeInputs();
        this.refreshFormatControls();
        this.placePicker();
        if (focus) this.focusCell(focus.row, focus.column);
    }

    private buildToolbar(): HTMLDivElement {
        const bar = el("div", "toolbar");
        // Pressing a toolbar button must not take the cursor out of the cell being edited.
        // Boxes that are typed into, and the drop-down, are left alone so they can take focus.
        bar.addEventListener("mousedown", (event) => {
            const tag = (event.target as HTMLElement).tagName;
            if (tag !== "SELECT" && tag !== "INPUT") event.preventDefault();
        });

        const rowButton = el("button", "add", "+ Row");
        rowButton.type = "button";
        rowButton.disabled = this.data.rows.length >= MAX_ROWS;
        rowButton.addEventListener("click", () => {
            addRow(this.data);
            this.commit(true, { row: this.data.rows.length - 1, column: 0 });
        });
        const columnButton = el("button", "add", "+ Column");
        columnButton.type = "button";
        columnButton.disabled = this.data.columns.length >= MAX_COLUMNS;
        columnButton.addEventListener("click", () => {
            addColumn(this.data);
            this.commit(true);
        });
        bar.appendChild(rowButton);
        bar.appendChild(columnButton);

        // ---- What formatting applies to: the selected cell, its row or its column.
        const scopeGroup = el("div", "group");
        scopeGroup.appendChild(el("span", "label", "Apply to"));
        const scope = el("select", "scope");
        scope.title = "What formatting is applied to: the selected cell, its whole row or its whole column";
        (["cell", "row", "column"] as Scope[]).forEach((value) => {
            const option = el("option", undefined, value.charAt(0).toUpperCase() + value.slice(1));
            option.value = value;
            option.selected = value === this.scope;
            scope.appendChild(option);
        });
        scope.addEventListener("change", () => {
            this.scope = scope.value as Scope;
        });
        scopeGroup.appendChild(scope);
        bar.appendChild(scopeGroup);

        // ---- Text: font, size, bold, italic, underline. Each shows what the selected cell has.
        const textGroup = el("div", "group");
        const font = el("select", "font");
        font.title = "Font of the selected cell, row or column. Table font follows the Format pane.";
        const tableFont = el("option", undefined, "Table font");
        tableFont.value = "";
        font.appendChild(tableFont);
        FONTS.forEach(({ name }) => {
            const option = el("option", undefined, name);
            option.value = name;
            font.appendChild(option);
        });
        font.addEventListener("change", () => this.setFormat({ font: font.value || undefined }));
        textGroup.appendChild(font);

        const size = el("input", "fontSize");
        size.type = "number";
        size.min = String(MIN_FONT_SIZE);
        size.max = String(MAX_FONT_SIZE);
        size.title = "Text size in points of the selected cell, row or column. Leave blank to follow the Format pane.";
        size.addEventListener("change", () => {
            const typed = Number(size.value);
            this.setFormat({ size: size.value.trim() !== "" && isFinite(typed) && typed > 0 ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(typed))) : undefined });
            size.blur();
        });
        size.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                size.blur();
            }
        });
        textGroup.appendChild(size);

        const toggles = {} as { [key in "bold" | "italic" | "underline"]: HTMLButtonElement };
        ([["bold", "B", "Bold"], ["italic", "I", "Italic"], ["underline", "U", "Underline"]] as ["bold" | "italic" | "underline", string, string][]).forEach(([key, letter, name]) => {
            const toggle = el("button", `style ${key}`, letter);
            toggle.type = "button";
            toggle.title = `${name}: switch it on or off for the selected cell, row or column`;
            toggle.addEventListener("click", () => {
                const now = this.activeText();
                if (now) this.setFormat({ [key]: !now[key] } as CellFormat);
            });
            toggles[key] = toggle;
            textGroup.appendChild(toggle);
        });
        bar.appendChild(textGroup);

        // ---- Colour: one button each for text, fill and border. The chip shows the colour last applied.
        const colourGroup = el("div", "group");
        const titles: { [mode in ColourMode]: string } = {
            text: "Text colour: open the colour picker to colour the text of the selected cell, row or column",
            fill: "Fill colour: open the colour picker to fill the selected cell, row or column",
            border: "Borders: open the colour picker to choose which sides of the selected cell, row or column get a border, and its colour",
        };
        COLOUR_MODES.forEach((mode) => {
            const pick = el("button", `pick ${mode}`);
            pick.type = "button";
            pick.title = titles[mode];
            const chip = el("span", "chip", mode === "text" ? "A" : undefined);
            this.chips[mode] = chip;
            this.paintChip(mode);
            pick.appendChild(chip);
            pick.appendChild(el("span", undefined, MODE_NAME[mode]));
            pick.addEventListener("click", () => this.openPicker(mode));
            colourGroup.appendChild(pick);
        });
        const clear = el("button", "add clear", "Clear");
        clear.type = "button";
        clear.title = "Clear text formatting: removes the font, size, bold, italic, underline and text colour set on the selected cell, row or column. Fills and borders stay.";
        clear.addEventListener("click", () => {
            const range = this.range();
            if (!range) return;
            clearFormat(this.data, range);
            this.afterFormat(range);
        });
        colourGroup.appendChild(clear);
        bar.appendChild(colourGroup);
        this.formatParts = { font, size, clear, toggles };

        // ---- Size: exact width of the selected cell's column and height of its row, in pixels.
        const sizeGroup = el("div", "group");
        sizeGroup.appendChild(el("span", "label", "Width"));
        const width = this.sizeBox("Width in pixels of the selected cell's column. Leave blank for automatic.", MIN_WIDTH, MAX_WIDTH, (value) => {
            if (this.active) this.setSize("column", this.active.column, value);
        });
        sizeGroup.appendChild(width);
        sizeGroup.appendChild(el("span", "label", "Height"));
        const height = this.sizeBox("Height in pixels of the selected cell's row. Leave blank for automatic.", MIN_HEIGHT, MAX_HEIGHT, (value) => {
            if (this.active) this.setSize("row", this.active.row, value);
        });
        sizeGroup.appendChild(height);
        this.widthInput = width;
        this.heightInput = height;
        bar.appendChild(sizeGroup);

        bar.appendChild(el("span", "hint", "Click a cell or header first, then format it. Drag the edge of a column or row to resize it."));
        return bar;
    }

    // ------------------------------------------------------------------ text formatting

    /** The block of cells the toolbar acts on: the active cell, its whole row, or its whole column. */
    private range(): CellRange | null {
        if (!this.active) return null;
        const { row, column } = this.active;
        const lastColumn = this.data.columns.length - 1, lastRow = this.data.rows.length - 1;
        if (this.scope === "row") return { top: row, bottom: row, left: 0, right: lastColumn };
        // A column takes in its header only when the header is the selected cell.
        if (this.scope === "column") return { top: row === HEADER_ROW ? HEADER_ROW : 0, bottom: lastRow, left: column, right: column };
        return { top: row, bottom: row, left: column, right: column };
    }

    /** The text style the active cell is shown in, from the Format pane and its own formatting together. */
    private activeText(): TextStyle | null {
        if (!this.active || !this.options) return null;
        const base = this.active.row === HEADER_ROW ? this.options.header : this.options.values;
        return this.effectiveText(base, formatAt(this.data, this.active.row, this.active.column));
    }

    /** Sets part of the text format on the selected cell, row or column. */
    private setFormat(change: CellFormat): void {
        const range = this.range();
        if (!range) return;
        applyFormat(this.data, range, change);
        this.afterFormat(range);
    }

    /** Redraws a block of cells after their formatting changed, and saves. */
    private afterFormat(range: CellRange, margin = 0): void {
        for (let row = Math.max(HEADER_ROW, range.top - margin); row <= Math.min(this.data.rows.length - 1, range.bottom + margin); row++) {
            for (let column = Math.max(0, range.left - margin); column <= Math.min(this.data.columns.length - 1, range.right + margin); column++) this.repaint(row, column);
        }
        this.refreshFormatControls();
        this.commit();
    }

    /** Shows the active cell's font, size, bold, italic and underline in the toolbar. */
    private refreshFormatControls(): void {
        const parts = this.formatParts;
        if (!parts) return;
        const active = this.active;
        const format = active ? formatAt(this.data, active.row, active.column) : undefined;
        const text = this.activeText();
        parts.font.disabled = parts.size.disabled = parts.clear.disabled = !active;
        parts.font.value = (format && format.font) || "";
        if (document.activeElement !== parts.size) parts.size.value = format && format.size ? String(format.size) : "";
        // The greyed number is the size the cell gets from the Format pane.
        parts.size.placeholder = text ? String(text.fontSize) : "";
        (["bold", "italic", "underline"] as ("bold" | "italic" | "underline")[]).forEach((key) => {
            const on = !!text && text[key];
            parts.toggles[key].disabled = !active;
            parts.toggles[key].classList.toggle("on", on);
            parts.toggles[key].setAttribute("aria-pressed", on ? "true" : "false");
        });
    }

    /** A small number box in the toolbar for typing an exact size. Blank or 0 means automatic. */
    private sizeBox(title: string, min: number, max: number, apply: (value: number) => void): HTMLInputElement {
        const box = el("input", "size");
        box.type = "number";
        box.min = String(min);
        box.max = String(max);
        box.placeholder = "auto";
        box.title = title;
        const commit = () => {
            apply(Number(box.value) || 0);
            this.applySizes();
            this.commit();
            box.blur();
            this.refreshSizeInputs();
        };
        box.addEventListener("change", commit);
        box.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                box.blur();
            }
        });
        return box;
    }

    // ------------------------------------------------------------------ colour picker

    /**
     * Shows the colour last applied for a mode on its toolbar button: a solid chip for fill, a
     * hollow one for border, and a letter A underlined in the colour for text.
     */
    private paintChip(mode: ColourMode): void {
        const chip = this.chips[mode];
        if (!chip) return;
        const colour = this.applied[mode];
        if (mode === "fill") {
            paint(chip, "background", colour);
            paint(chip, "box-shadow", "none");
        } else if (mode === "border") {
            paint(chip, "background", "transparent");
            paint(chip, "box-shadow", `inset 0 0 0 3px ${colour}`);
        } else {
            paint(chip, "background", "transparent");
            paint(chip, "box-shadow", `inset 0 -3px 0 0 ${colour}`);
        }
    }

    /** Opens the picker for text, fill or border. Clicking the button of the mode already open closes it. */
    private openPicker(mode: ColourMode): void {
        const wasOpen = this.pickerOpen;
        const sameMode = this.pickerMode === mode;
        this.pickerMode = mode;
        this.pickerOpen = !(wasOpen && sameMode);
        const existing = this.root.querySelector(".picker");
        if (existing) existing.remove();
        this.pickerParts = null;
        if (this.pickerOpen) {
            const toolbar = this.root.querySelector(".toolbar");
            const picker = this.buildPicker();
            if (toolbar && toolbar.nextSibling) this.root.insertBefore(picker, toolbar.nextSibling);
            else this.root.appendChild(picker);
            this.placePicker();
        }
    }

    /** Puts the open picker just under the toolbar, however many lines the toolbar has wrapped onto. */
    private placePicker(): void {
        const picker = this.root.querySelector<HTMLDivElement>(".picker");
        const toolbar = this.root.querySelector<HTMLDivElement>(".toolbar");
        if (picker && toolbar) paint(picker, "top", `${toolbar.offsetTop + toolbar.offsetHeight}px`);
    }

    private closePicker(): void {
        this.pickerOpen = false;
        const existing = this.root.querySelector(".picker");
        if (existing) existing.remove();
        this.pickerParts = null;
    }

    /**
     * A full colour picker, used for the text, the fill and the borders: tabs to choose which, a
     * square for saturation and brightness, a slider for hue, a slider for transparency and a
     * box for typing a hex code. The Border tab also has a list of which sides to draw. "Apply"
     * colours the selected cell, row or column; "None" clears it.
     */
    private buildPicker(): HTMLDivElement {
        const panel = el("div", "picker");

        // ---- Text / Fill / Border tabs
        const tabs = el("div", "tabs");
        const tabButtons = {} as { [mode in ColourMode]: HTMLButtonElement };
        const tabTitles: { [mode in ColourMode]: string } = {
            text: "Set the colour of the cell's text",
            fill: "Set the colour behind the cell",
            border: "Set which sides of the cell have a border, and its colour",
        };
        COLOUR_MODES.forEach((mode) => {
            const tab = el("button", "tab", MODE_NAME[mode]);
            tab.type = "button";
            tab.title = tabTitles[mode];
            tab.addEventListener("click", () => {
                this.pickerMode = mode;
                this.refreshPicker();
            });
            tabButtons[mode] = tab;
            tabs.appendChild(tab);
        });
        panel.appendChild(tabs);

        // ---- which sides get the border (Border tab only)
        const sidesRow = el("div", "sidesRow");
        sidesRow.appendChild(el("span", "label", "Sides"));
        const sides = el("select", "sides");
        sides.title = "Which edges of the selected cell, row or column get the border. Outside boxes it; All also draws the lines inside it.";
        BORDER_CHOICES.forEach(({ value, label }) => {
            const option = el("option", undefined, label);
            option.value = value;
            option.selected = value === this.borderChoice;
            sides.appendChild(option);
        });
        sides.addEventListener("change", () => {
            this.borderChoice = sides.value as BorderChoice;
        });
        sidesRow.appendChild(sides);
        panel.appendChild(sidesRow);

        // ---- saturation and brightness square
        const square = el("div", "square");
        paint(square, "width", `${SV_WIDTH}px`);
        paint(square, "height", `${SV_HEIGHT}px`);
        square.appendChild(el("div", "white"));
        square.appendChild(el("div", "black"));
        const knob = el("div", "knob");
        square.appendChild(knob);
        const pick = (event: MouseEvent) => {
            const box = square.getBoundingClientRect();
            const state = this.pickerState[this.pickerMode];
            state.colour = {
                h: state.colour.h,
                s: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
                v: 1 - Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
            };
            this.refreshPicker();
        };
        square.addEventListener("mousedown", (event) => {
            event.preventDefault();
            pick(event);
            const stop = () => {
                document.removeEventListener("mousemove", pick);
                document.removeEventListener("mouseup", stop);
            };
            document.addEventListener("mousemove", pick);
            document.addEventListener("mouseup", stop);
        });
        panel.appendChild(square);

        // ---- hue
        const hue = el("input", "hue");
        hue.type = "range";
        hue.min = "0";
        hue.max = "360";
        hue.step = "1";
        hue.title = "Hue";
        hue.addEventListener("input", () => {
            const state = this.pickerState[this.pickerMode];
            state.colour = { ...state.colour, h: Number(hue.value) };
            this.refreshPicker();
        });
        panel.appendChild(hue);

        // ---- transparency: 0% is solid, 100% is invisible
        const alphaRow = el("div", "alphaRow");
        alphaRow.appendChild(el("span", "label", "Transparency"));
        const alphaTrack = el("div", "alphaTrack");
        const alpha = el("input", "alpha");
        alpha.type = "range";
        alpha.min = "0";
        alpha.max = "100";
        alpha.step = "1";
        alpha.title = "Transparency: 0% is solid, 100% is invisible";
        alpha.addEventListener("input", () => {
            this.pickerState[this.pickerMode].transparency = Number(alpha.value);
            this.refreshPicker();
        });
        alphaTrack.appendChild(alpha);
        alphaRow.appendChild(alphaTrack);
        const alphaLabel = el("span", "percent", "0%");
        alphaRow.appendChild(alphaLabel);
        panel.appendChild(alphaRow);

        // ---- preview, hex box and buttons
        const row = el("div", "row");
        const preview = el("span", "preview");
        const ink = el("span", "ink");
        preview.appendChild(ink);
        const hex = el("input", "hex");
        hex.type = "text";
        hex.maxLength = 9;
        hex.spellcheck = false;
        hex.placeholder = "#RRGGBB";
        hex.title = "Type a hex colour, for example #57B133, then press Enter or Apply";
        hex.addEventListener("input", () => {
            const typed = parseHex(hex.value);
            hex.classList.toggle("invalid", !typed && hex.value.trim() !== "");
            if (typed) {
                const state = this.pickerState[this.pickerMode];
                const parts = splitColour(typed);
                state.colour = hexToHsv(parts.hex);
                // Eight digits carry their own opacity; six digits leave the transparency slider alone.
                if (typed.length === 9) state.transparency = parts.transparency;
                this.refreshPicker(true);
            }
        });
        const apply = () => {
            const state = this.pickerState[this.pickerMode];
            // A hex code that was typed is used exactly as typed, not rounded through the sliders.
            const typed = parseHex(hex.value);
            const solid = typed ? splitColour(typed).hex : hsvToHex(state.colour);
            const colour = joinColour(solid, state.transparency);
            this.applied[this.pickerMode] = colour;
            this.paintChip(this.pickerMode);
            this.applyColour(this.pickerMode, colour);
        };
        hex.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (parseHex(hex.value)) apply();
            }
        });
        const applyButton = el("button", "apply", "Apply");
        applyButton.type = "button";
        applyButton.title = "Apply to the selected cell, row or column";
        applyButton.addEventListener("click", apply);
        const none = el("button", "none", "None");
        none.type = "button";
        none.title = "Remove the text colour, fill or borders (whichever tab is open) from the selected cell, row or column";
        none.addEventListener("click", () => this.applyColour(this.pickerMode, ""));
        const close = el("button", "close", "\u00D7");
        close.type = "button";
        close.title = "Close the colour picker";
        close.addEventListener("click", () => this.closePicker());
        row.appendChild(preview);
        row.appendChild(hex);
        row.appendChild(applyButton);
        row.appendChild(none);
        row.appendChild(close);
        // The buttons sit above the colour controls, so they stay in view when the visual is too
        // short to show the whole picker.
        panel.insertBefore(row, square);

        // Buttons in the picker must not pull the cursor out of the cell; the hex box, sliders and Sides list may take focus.
        panel.addEventListener("mousedown", (event) => {
            const tag = (event.target as HTMLElement).tagName;
            if (tag !== "INPUT" && tag !== "SELECT" && tag !== "OPTION") event.preventDefault();
        });

        this.pickerParts = { square, knob, hue, hex, ink, alpha, alphaTrack, alphaLabel, sidesRow, tabs: tabButtons };
        this.refreshPicker();
        return panel;
    }

    /** Redraws the picker's controls for the mode it is on. `keepHex` leaves the hex box alone while it is being typed in. */
    private refreshPicker(keepHex = false): void {
        const parts = this.pickerParts;
        if (!parts) return;
        const state = this.pickerState[this.pickerMode];
        const colour = state.colour;
        const solid = keepHex ? splitColour(parseHex(parts.hex.value) || hsvToHex(colour)).hex : hsvToHex(colour);
        COLOUR_MODES.forEach((mode) => parts.tabs[mode].classList.toggle("on", mode === this.pickerMode));
        paint(parts.sidesRow, "display", this.pickerMode === "border" ? "flex" : "none");
        paint(parts.square, "background", hsvToHex({ h: colour.h, s: 1, v: 1 }));
        paint(parts.knob, "left", `${colour.s * SV_WIDTH}px`);
        paint(parts.knob, "top", `${(1 - colour.v) * SV_HEIGHT}px`);
        parts.hue.value = String(Math.round(colour.h));
        parts.alpha.value = String(state.transparency);
        parts.alphaLabel.textContent = `${state.transparency}%`;
        // The slider's track runs from the solid colour to fully see-through; the preview shows the result.
        paint(parts.alphaTrack, "background-image", `linear-gradient(to right, ${solid}, ${solid}00)`);
        paint(parts.ink, "background", joinColour(solid, state.transparency));
        if (!keepHex) {
            parts.hex.value = solid;
            parts.hex.classList.remove("invalid");
        }
    }

    // ------------------------------------------------------------------ colours, borders and the active cell

    /**
     * Applies a text colour, a fill or borders (or, with an empty colour, clears them) starting
     * from the active cell, which can be a header. "Cell" takes just that cell; "Row" its whole
     * row (the whole header row if a header is selected); "Column" the cells below it, and the
     * header too when the header is the selected cell.
     */
    private applyColour(mode: ColourMode, colour: string): void {
        const range = this.range();
        if (!range) return;
        if (mode === "text") {
            applyFormat(this.data, range, { color: colour || undefined });
            this.afterFormat(range);
            return;
        }
        if (mode === "border") {
            applyBorders(this.data, range, colour ? this.borderChoice : "none", colour);
            // The cells next to the block share its edges, so they are redrawn too.
            this.afterFormat(range, 1);
            return;
        }
        for (let row = range.top; row <= range.bottom; row++) {
            for (let column = range.left; column <= range.right; column++) {
                if (row === HEADER_ROW) this.data.headerFills[column] = colour;
                else this.data.fills[row][column] = colour;
            }
        }
        this.afterFormat(range);
    }

    private styleEditing(input: HTMLInputElement): void {
        paint(input, "background", "#FFFFFF");
        paint(input, "color", "#1C1C1B");
    }

    private setActive(row: number, column: number): void {
        this.active = { row, column };
        this.markActive();
        this.refreshSizeInputs();
        this.refreshFormatControls();
    }

    /** Outlines the active cell (body or header) so it is clear where a fill or size will go. */
    private markActive(): void {
        this.root.querySelectorAll("td.active, th.active").forEach((cell) => cell.classList.remove("active"));
        if (!this.active || !this.options || !this.options.editable) return;
        const cell = this.active.row === HEADER_ROW ? this.headerCell(this.active.column) : this.bodyCell(this.active.row, this.active.column);
        if (cell) cell.classList.add("active");
    }

    // ------------------------------------------------------------------ cells

    private buildCellInput(r: number, c: number): HTMLInputElement {
        const options = this.options!;
        const column = this.data.columns[c];
        const input = el("input", "cell");
        input.type = "text";
        if (column.type === "number") input.inputMode = "decimal";
        input.value = displayCell(this.data.rows[r][c] || "", column, options.numbers);
        input.dataset.row = String(r);
        input.dataset.column = String(c);
        input.setAttribute("aria-label", `${column.name || `Column ${c + 1}`}, row ${r + 1}`);

        // While a cell has focus it shows exactly what was typed, in a plain white box;
        // when focus leaves, numbers are formatted and the cell's own look comes back.
        input.addEventListener("focus", () => {
            input.value = this.data.rows[r][c] || "";
            this.styleEditing(input);
            this.setActive(r, c);
            input.select();
        });
        input.addEventListener("blur", () => {
            const typed = input.value;
            if (typed !== (this.data.rows[r][c] || "")) {
                this.data.rows[r][c] = typed;
                this.refreshTotals();
                this.commit();
            }
            input.value = displayCell(this.data.rows[r][c] || "", column, options.numbers);
            const td = input.parentElement as HTMLTableCellElement | null;
            if (td) this.paintCell(td, r, c);
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === "ArrowDown") {
                event.preventDefault();
                if (r + 1 < this.data.rows.length) {
                    this.focusCell(r + 1, c);
                } else if (event.key === "Enter" && this.data.rows.length < MAX_ROWS) {
                    // Enter on the last row starts a new one, like a spreadsheet.
                    this.data.rows[r][c] = input.value;
                    addRow(this.data);
                    this.commit(true, { row: r + 1, column: c });
                }
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (r > 0) this.focusCell(r - 1, c);
            } else if (event.key === "Escape") {
                // Abandon what was typed in this cell.
                input.value = this.data.rows[r][c] || "";
                input.blur();
            }
        });
        input.addEventListener("paste", (event) => {
            const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
            if (!text || !isGridPaste(text)) return; // a single value pastes into the cell as normal
            event.preventDefault();
            this.data = pasteGrid(this.data, r, c, parseClipboard(text));
            this.commit(true, { row: r, column: c });
        });
        return input;
    }

    private focusCell(row: number, column: number): void {
        const input = this.root.querySelector<HTMLInputElement>(`input.cell[data-row="${row}"][data-column="${column}"]`);
        if (input) input.focus();
    }

    private refreshTotals(): void {
        const options = this.options!;
        if (this.totalCells.length === 0) return;
        const totals = columnTotals(this.data);
        const labelColumn = this.data.columns.findIndex((c) => c.type !== "number");
        this.totalCells.forEach((cell, c) => {
            const total = totals[c];
            if (total !== null) cell.textContent = formatNumber(total, options.numbers);
            else cell.textContent = c === labelColumn ? options.totalsLabel : "";
        });
    }

    /**
     * Reports the edit. `structural` changes (rows or columns added or removed, a column's
     * type changed, a block pasted) rebuild the table; a single cell edit, fill or resize
     * leaves it in place so the cursor is not disturbed.
     */
    private commit(structural = false, focus?: { row: number; column: number }): void {
        if (structural) this.build(focus);
        this.onChange(cloneTable(this.data));
    }
}

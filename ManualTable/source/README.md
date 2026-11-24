# Manual Table

A Power BI custom visual that works like a table you type into yourself. It needs no data fields: what you type is saved inside the report.

## Who can type into it

| Where the report is open | Can the table be changed? |
| --- | --- |
| Power BI Desktop | Yes |
| Published report, reading view | No, never |
| Published report, opened in edit mode | No by default. Yes if **Format > Editing > Allow editing online** is switched on |

Only people who can edit the report can ever change the table. Viewers see plain, read-only text with no boxes or buttons.

## Using it

- Click a cell and type. Press **Enter** or the down arrow to move down; **Enter** on the last row adds a new row. **Esc** abandons what you typed in that cell.
- Click a column heading to rename it.
- **+ Row** and **+ Column** add to the table; the small **×** buttons delete a row or a column.
- The **Abc / 123** button on each column switches it between text and numbers. Number columns are right-aligned, formatted and included in the totals row.
- Paste a block copied from Excel into any cell and it fills across and down from there, adding rows and columns if needed.
- Numbers can be typed as `1250`, `1,250`, `$1,250.50`, `(300)` or `-300`. Text typed into a number column is kept as it is and left out of the total.
- Power BI's own undo (Ctrl+Z) steps back through your edits.

## Formatting cells

There are two places to format the table, and they work together.

**The Format pane** sets the look of the whole table at once: the font, size, bold, italic, underline, text colour and alignment of the headers (**Column headers > Text**) and of everything else (**Values > Text**), plus backgrounds, row shading and the lines under the rows.

**The toolbar** above the table formats one cell, one row or one column, the way a spreadsheet does. Anything set there wins over the Format pane for those cells.

1. Click the cell you want. A header cell works too. It gets a dashed green marker.
2. In **Apply to**, choose whether the formatting goes on that cell, its whole row or its whole column. A column includes its header only when the header is the cell you clicked.
3. Use the controls below.

### Font, size, bold, italic and underline

- **Font list:** pick a font. **Table font** goes back to the one set in the Format pane.
- **Size box:** type a size in points and press Enter. Leave it blank to go back to the Format pane's size, which is shown greyed in the box.
- **B**, **I** and **U** switch bold, italic and underline on or off. A button is dark when the selected cell has that style, whether from the toolbar or the Format pane.
- **Clear** removes all text formatting set from the toolbar (font, size, bold, italic, underline and text colour) from the selection. Fills and borders stay.

The fonts offered are the ones Power BI itself offers, so they show the same for everyone who views the report.

### Text colour, fill and borders

The **Text**, **Fill** and **Border** buttons each open the colour picker on its matching tab. The chip on each button shows the colour last applied.

- **Text** colours the cell's text.
- **Fill** puts a solid colour behind the cell.
- **Border** draws lines on the cell's edges. Its tab has a **Sides** list:

| Sides | What is drawn |
| --- | --- |
| All | Every edge of the selection, including the lines between its cells |
| Outside | A box round the selection |
| Bottom, Top, Left, Right | That edge of the selection |
| Top and bottom, Left and right | Both of those edges |

Choose the sides and the colour, then press **Apply**. Borders add up, as in a spreadsheet: apply Bottom in one colour and then Left in another and the cell has both. **None** removes every border on the selection.

With **Apply to** set to Row or Column, the sides are those of the row or column as a block: Top and bottom on a row draws a line above and below the whole row, and Outside on a column boxes the column.

In the colour picker:

- The **Text / Fill / Border** tabs switch between the three. Each keeps its own colour and transparency.
- Type a hex code such as `#8E44AD`; `8E44AD` and the short form `#5B3` also work. An eight-digit code such as `#8E44AD80` sets the transparency as well.
- Or drag in the square to set how strong and how bright the colour is, and drag the rainbow slider to set the hue.
- Drag the **Transparency** slider from 0% (solid) to 100% (invisible).
- Press Enter or **Apply** to format the selection. **None** clears only what the open tab controls, so removing a fill leaves the text colour and borders alone.

The picker stays open so you can click another cell and apply the same thing again.

Things to know:

- A border is drawn just inside the cell's edge, 2 pixels thick, so it never changes the cell's size.
- Two cells share the edge between them. Putting a border on that edge from either cell replaces the one that was there, and None on either cell removes it.
- A cell given a solid dark fill switches to white text so it stays readable, unless you have chosen a text colour for it.
- Everything set from the toolbar is saved with the table, moves with its rows and columns when others are deleted, and shows for viewers of the published report.
- A cell's own fill takes priority over the header fill, the table fill and row shading.
- Tables made with an earlier version keep their outlines: each becomes a border on all four sides.

## Column widths and row heights

A table cell cannot be sized on its own: its width is its column's and its height is its row's. Both can be changed in two ways.

- **Drag:** hover over the right edge of a column heading, or the bottom edge of any cell, until the cursor changes, then drag. Double-click the same edge to go back to automatic. The header row's height changes the same way.
- **Exact size:** click a cell, then type a number of pixels into the **Width** or **Height** box in the toolbar. Leave a box blank for automatic.

Columns with no width set share whatever space is left. Once every column has a width, the table is exactly as wide as its columns, so it may be narrower than the visual or scroll sideways. Widths can be 30 to 800 pixels and heights 16 to 300. Sizes are saved with the table and viewers of the published report see the same layout.

## Format pane

Select the table and open the Format pane. The cards follow the layout of Power BI's own table visual.

| Card | What it holds |
| --- | --- |
| **Column headers** | **Text**: font, size, bold, italic, underline, text colour, alignment. **Background**: a switch and a colour for the whole header row |
| **Values** | **Text**: the same options for everything typed into the cells. **Background**: a switch and a colour behind every value cell. **Alternate rows**: a switch and a colour to shade every second row |
| **Grid** | **Horizontal lines**: a switch, colour and thickness for the lines under each row. **Row spacing**: padding above and below the text in every row |
| **Totals** | A switch for a row that sums every number column, and its label |
| **Number format** | Decimal places, brackets for negatives, and a currency symbol. Applies to every number column and the totals row |
| **Editing** | Whether the table can also be changed in the published report's edit mode |

- A group with a switch in its heading (Background, Alternate rows, Horizontal lines) does nothing until the switch is on.
- Both backgrounds start switched off, so the page (or the visual's own background under General > Effects) shows through.
- Alignment set to Auto puts text on the left and numbers on the right.
- Formatting set on a cell from the toolbar always wins over these settings.

## Things to know

- The table is stored in the report file, not in the data model, so measures, slicers and other visuals cannot see or filter it.
- It is meant for small tables such as commentary, adjustments or targets: up to 300 rows and 30 columns. For anything larger, load the data into the model instead.
- Anyone who can download or edit the report file can read what was typed, the same as any other report content.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

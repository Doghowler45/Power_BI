# Heatmap

A Power BI custom visual: a grid of rounded cells, each coloured by a measure. Use it to see where a number is large or small across two things at once: destination by product, division by month, hour by day.

## Fields

| Field | What to put in it |
| --- | --- |
| Rows | What runs down the side |
| Columns | What runs across the top |
| Values | The measure that sets each cell's colour |
| Tooltips | Optional. More measures to show when a cell is hovered |

With no Columns field there is one column, named after the measure. With no Rows field there is one row.

## Colour scales

Pick the scale under *Format > Colours > Colour scale*.

- **One colour, light to dark** (Green, Teal, Blue, Purple, Amber): for amounts, where more is darker. The lightest colour is the smallest value in the grid, or zero if you switch on **Start at zero**.
- **Two-sided** (Red to blue, Red to teal): for values above and below a midpoint, such as a variance to plan. The two colours meet at a neutral grey at the **Midpoint** (0 unless you change it), and both sides cover the same distance, so the same depth of colour means the same size of gap either way.
- **Custom**: your own low and high colours, with an optional middle colour for a two-sided scale.

**Reverse** swaps the ends: for a measure where low is the strong result, or to make the side below the midpoint the "good" colour.

**Compare within** changes what each cell is measured against. *All cells* uses one scale for the grid. *Each row* (or *each column*) gives every row its own scale, which shows the pattern inside a small row that would otherwise be washed out beside a large one. The legend then reads Low to High instead of showing figures.

Each one-colour scale is a single hue stepped evenly from light to dark, so equal steps in the data look like equal steps in colour. Red to green is deliberately not offered: about one man in twelve cannot tell those two apart, and the two built-in two-sided scales were checked to stay distinguishable for them. If you build a red-to-green scale with Custom, keep the values switched on so colour is not the only cue.

## What you see

- **Values in the cells**, in white or near-black, whichever reads better on the cell. If the preferred form does not fit, the visual drops decimal places, then shrinks the text, and if nothing readable fits it leaves the values out for the whole grid. The tooltip always has the full figure.
- **Legend:** a slim bar showing the scale and the values at its ends. A two-sided scale has a notch at the midpoint. Hover over a cell and a marker shows where it sits on the scale.
- **Hover:** the cell gets a ring, its row and column stay at full strength while the rest step back, and its row and column names go bold.
- **Cells with no data** are lightly hatched, so "nothing here" does not look like "close to zero". Switch to blank under *Format > Cells* for a grid where most combinations do not exist.
- **Column names** are written flat when they fit, slanted when the columns are narrower than the names, and thinned out to every few when the names are short (day numbers, for example).
- **Click a cell** to filter the other visuals on the page; Ctrl+click for several; click outside the grid to clear.

## Format pane

- **Colours:** scale, reverse, midpoint, compare within, start at zero, custom colours.
- **Cells:** gap, rounded corners, tallest row, cells with no data.
- **Values in cells:** on or off, text size, display units, decimal places. The units and decimal places also apply to the legend.
- **Row and column names:** text size and colour; order by the data's own order or by total, largest first.
- **Legend:** on or off, bottom or top.

## Things to know

- Rows share the visual's height, up to **Tallest row**, and are never much taller than the cells are wide, so a grid with few rows does not fill the whole visual.
- All figures share one display unit, chosen from the typical value in the grid.
- Rows and columns come in the order the model gives them. Give a month-name column a *Sort by column* in the model, or it arrives A to Z.
- Up to 200 rows and 60 columns are read. When there are too many cells to draw at the visual's size, it says so.
- Power BI's *Show as a table* (the visual's menu) gives every figure as text.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

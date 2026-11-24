# Calendar Heatmap

A Power BI custom visual: a grid with a row for each year and a column for each month, every cell coloured by a measure. It shows the seasonal pattern and the growth from year to year at a glance, with each year's total and its change on the year before at the end of the row.

## Fields

| Field | What to put in it |
| --- | --- |
| Date | A date column. Days are added up into months |
| Values | The measure, such as revenue |

Use the date column itself, not its hierarchy: in the Build pane, open the Date field's menu and choose the column name in place of *Date Hierarchy*. If the field is not a date (a month name, say), the visual tells you.

## What you see

- **Cells** are one colour, light to dark: darker is more. The value is written in each cell when it fits.
- **Hatched cells** are months with no data, so "nothing yet" does not look like "close to zero".
- **Total** is the year's total. **On year before** is its change on the previous year, counted over the months both years have. A year still in progress is marked "to date"; a full year set against a part-year before it is marked "like for like".
- **Legend:** a bar showing the scale, when there is room under the grid. Hover over a cell and a marker shows where it sits.
- **Hover** for the month's value and its change on the same month a year earlier. **Click** a cell to filter the other visuals on the page by that month.

## Things to know

- **Financial years:** set *Format > Calendar > Year starts in month* (7 for a year that runs July to June). The rows are then named 2025/26 and the columns start at that month.
- **Compare within** (*Format > Colours*): *All months* uses one scale, so growth shows as darker rows. *Each year* gives every year its own scale, which shows the seasonal shape of a small year as clearly as a large one.
- The latest year is at the top; switch that under *Format > Calendar*.
- Up to 30,000 dates are read.

## Format pane

- **Calendar:** the month the year starts in, latest year at the top, year totals and change.
- **Colours:** green, teal, blue or purple; compare within all months or each year.
- **Values in cells:** on or off, text size, display units, decimal places.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

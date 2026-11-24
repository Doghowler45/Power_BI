# Variance Table

A Power BI custom visual: a table of actual against plan and previous year, with each variance drawn as a small bar inside its cell, a total row, an optional comment column, and sorting by clicking a column heading.

It uses the same notation as the Variance Chart visual: solid for actual (AC), outlined for plan (PL), grey for previous year (PY), hatched for forecast (FC), green and red for good and bad variances. The small square beside each column heading shows which is which.

This is an original visual. It is not affiliated with, or a copy of, any commercial variance-reporting product.

## Fields

| Field | What to put in it |
| --- | --- |
| Category | One row for each value: divisions, products, cost lines, months |
| Actual | The actual result |
| Plan | The plan or budget (optional) |
| Previous year | The same measure for the previous year (optional) |
| Forecast | Optional. Shown in place of actual, in italics with a hatched marker, on rows that have no actual yet |
| Comment | Optional. A text measure that returns a comment for some rows |

## Columns

For each comparison supplied (plan, previous year, or both) the table shows three columns: the comparison itself, the variance (actual minus the comparison) and the variance as a percentage. The variance has a bar and the percentage has a pin, both measured from an axis drawn in the comparison's style.

- **Sort:** click a heading. Number columns go largest first, then smallest first, then back to the order of the data; text columns go A to Z first. An arrow marks the sorted column. A sort made while editing is saved with the report; a sort made by someone reading a published report lasts for their session.
- **Total row:** the sum of the rows, kept in view at the bottom when the table scrolls. It is never sorted.
- **Select:** click a row to filter the other visuals on the page; Ctrl+click for several; click empty space to clear.
- Hover over a number to see it in full.

## Format pane

- **Columns:** switch the plan and previous-year comparisons, the variance columns, the variance % columns, the charts in cells and the comment column on or off. With charts off, the variance numbers are coloured green or red instead.
- **Good and bad:** **Higher is worse** for costs, which swaps the green and red.
- **Total row:** on or off, and its label.
- **Numbers:** display units and decimal places.
- **Text:** size, text colour, heading colour.
- **Rows:** padding, and the lines between rows.
- **Colours:** actual, previous year, good variance, bad variance.

## Things to know

- All numbers share one display unit, chosen from the typical value in the table.
- The bars in a column share one scale, taken from the rows. The total's bar is held at the edge of the cell if it is larger than any row.
- Switch the total off for measures that do not add up, such as prices or percentages.
- When comparing a part-year actual with a full-year plan, use a plan measure cut back to the same months, or the variance will be misleading.
- One category field is supported; there is no row hierarchy or expand and collapse.
- Up to 1,000 rows are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

# Statement Table

A Power BI custom visual for a financial statement: a profit and loss account, or any list of lines that adds down to subtotals and a total. It sets actual beside plan and previous year, shows each variance as a number, a percentage and a small bar, and works out the subtotals, totals and margins itself.

## Fields

| Field | What to put in it |
| --- | --- |
| Line | The lines of the statement: Revenue, Cost of sales, Gross profit and so on |
| Line type | Optional. What each line is (see below) |
| Order | Optional. A number that puts the lines in order |
| Indent | Optional. 0 for no indent, 1 for one step in, and so on |
| Actual | The actual result |
| Plan | Optional. The plan or budget |
| Previous year | Optional. The same measure for the previous year |

The plan and previous-year columns appear when those fields have a measure.

## The data it expects

One row for each line of the statement, in a table like this:

| Order | Line | Line type | Indent | Amount |
| --- | --- | --- | --- | --- |
| 10 | Revenue | line | 0 | 305.9m |
| 20 | Cost of sales | cost | 0 | 232.2m |
| 30 | Gross profit | subtotal | 0 | |
| 35 | Gross margin % | ratio | 0 | |
| 50 | Operating expenses | heading | 0 | |
| 60 | Selling and distribution | cost | 1 | 21.4m |

Use the Order field. Without it Power BI hands the lines over in alphabetical order.

## Line types

| Line type | What the visual does |
| --- | --- |
| line | Adds to the running total: revenue, other income. This is what a line is when there is no Line type field |
| cost | Takes away from the running total. Enter costs as positive numbers. A cost over plan is shown as bad, a cost under plan as good |
| subtotal | Shows the running total so far, in bold with a rule above |
| total | The same, with a double rule below |
| ratio | The subtotal above it as a percentage of the first line of the statement: a margin. Its variance is in percentage points |
| heading | A label in bold with no figures |
| spacer | A gap |

A subtotal or total that has a figure of its own in the data keeps that figure. One that is blank or zero is worked out.

## Keeping the lines that have no figures

Power BI leaves a row out of a visual when every measure on it is blank, which would drop the subtotals, headings and spacers. Either:

- write the measures so that they are never blank, for example `Amount AC = SUM(Statement[Actual]) + 0`, or
- choose **Show items with no data** from the Line field's menu in the Build pane.

## Things to know

- The visual fits itself to its width: the bars in the cells get narrower, then give way to green and red numbers, and last of all long line names wrap. Past that it scrolls sideways.
- Negative amounts are written in brackets, as accounts do. Switch to minus signs under *Format > Numbers*.
- Hover over a figure for the value in full, and over a column heading for the measure behind it.
- Click a line to filter the other visuals on the page by it; Ctrl+click for several.
- Up to 500 lines are read.

## Format pane

- **Columns:** variance columns, variance % columns, charts in cells.
- **Numbers:** display units (one unit for the whole statement), decimal places, negatives in brackets.
- **Text:** size and colour.
- **Rows:** padding, and lines between rows.
- **Colours:** actual, previous year, good variance, bad variance.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

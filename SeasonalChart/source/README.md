# Seasonal Chart

A Power BI custom visual that draws each year as its own line across the twelve months, so this year can be read against the same months of earlier years. Use it for anything with a season: revenue, volumes, costs.

## Fields

| Field | What to put in it |
| --- | --- |
| Months | What runs across: the months of the year (a month-name column) |
| Years | One line for each year |
| Values | The measure, such as revenue |
| Tooltips | Optional. More measures to show on hover |

With no Years field there is a single line.

## What you see

- **The latest year** (the last one in the Years field) is drawn in colour, with a dot on each month and its name and latest value at the end of the line.
- **The year before** is a darker grey line; **earlier years** are thin and light.
- **The shaded band** is the range the earlier years span, month by month: what is usual for the time of year. It needs at least two earlier years.
- **The change note** ("+7.0% on 2025") compares the latest year's last month with the same month of the year before.
- **Hover** anywhere to get every year's value for that month in one tooltip, with the change on the year before.

Under *Format > Lines > Show*, **Running total through the year** adds each month to the ones before it, so the lines show the year building up and the note reads "+2.0% on 2025 to date".

## Things to know

- **Month order:** when the Months field holds month names (Jan or January), the chart puts them in calendar order itself. For anything else, such as financial periods, set *Sort by column* on the column in the model, or the values arrive in alphabetical order.
- The scale fits the values, which shows the seasonal shape more clearly; switch on **Start at zero** when the size of the swing matters more than its shape. A running total always starts at zero.
- A year still in progress simply stops at its last month.
- Click a month to filter the other visuals on the page by it.
- Up to 60 values across and 40 years are read.

## Format pane

- **Lines:** each month or running total, the range of earlier years, start at zero, the latest year's colour.
- **Text and numbers:** text size, display units, decimal places.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

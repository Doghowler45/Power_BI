# Variance Chart

A Power BI custom visual that shows actual results against a plan, the previous year or a forecast, with charts of the variance and the variance percentage alongside. It can also draw the same comparison as a waterfall, as small multiples, or stacked by a second field, and can add a total, comments and sorting.

It follows the notation widely used in business reporting, so the same thing always looks the same:

| What | How it is drawn |
| --- | --- |
| Actual (AC) | Solid dark bar |
| Previous year (PY) | Solid grey bar |
| Plan (PL) | Outlined bar |
| Forecast (FC) | Hatched bar |
| Good variance / bad variance | Green / red |

This is an original visual. It is not affiliated with, or a copy of, any commercial variance-reporting product.

Two companion visuals use the same notation: **Variance Table** (the same figures as a table with bars in the cells) and **Variance Cards** (KPI cards).

## Fields

| Field | What to put in it |
| --- | --- |
| Category | What to break the values down by: months, divisions, products, cost lines |
| Group | Optional. A second field. Gives one small chart per value, or stacks the values inside each bar |
| Actual | The actual result |
| Previous year | The same measure for the previous year (optional) |
| Plan | The plan or budget (optional) |
| Forecast | The forecast (optional) |
| Comment | Optional. A text measure that returns a comment for some categories |

Give it Actual and at least one of Previous year or Plan. With no comparison measure it draws the actual values on their own.

## What it draws

- **Main chart (AC):** actual, with the comparison bar behind it and slightly offset.
- **Variance chart (ΔPL or ΔPY):** actual minus the comparison, as green and red bars.
- **Variance % chart (ΔPL% or ΔPY%):** the same difference as a percentage of the comparison, as pins.

The axis of each variance chart stands for the comparison, so it is drawn in that scenario's style: a grey line for previous year, a double line for plan, a dashed line for forecast.

Where a category has no actual but does have a forecast, such as months still to come, the forecast is drawn in its place as a hatched bar and its variance is worked out from the forecast.

## Variants

**Total.** *Format > Total* adds the sum of the categories after the last one. When the total is more than twice the largest category it is drawn cut short, with a slanted break mark, so it does not flatten the categories; its label still shows the true figure. Leave the total off for measures that do not add up, such as prices or percentages.

**Sorting.** Click a chart title (AC, the variance, or the variance %) to sort the categories by it: once for largest first, again for smallest first, a third time to go back to the order of the data. An arrow beside the title shows the current sort. The same choice is under *Format > Sort*. A sort made while editing is saved with the report; a sort made by someone reading a published report lasts for their session.

**Waterfall.** *Format > Layout > Chart > Waterfall (bridge)* walks from the comparison total to the actual total: the first bar is the plan (or previous year), each category then adds or takes away its variance, and the last bar is the actual. When the totals dwarf the variances the axis is cut off above zero so the steps stay readable; the baseline is then dashed to show it is not zero. Works in both directions.

**Small multiples.** Put a field in **Group** to get one small chart per value, each with the group's name above it. *Format > Groups > Same scale for all* decides whether the small charts share one scale (bar lengths can be compared between charts) or each fills its own space (small groups stay readable). Value labels are left off small charts when the columns are too narrow for them; the tooltip has the figures.

**Stacked.** *Format > Groups > Show groups as > Stacked* draws one chart with the groups stacked inside each actual bar, in shades from dark to light, with a key above. The comparison bar and the variance charts are for the total of the groups.

**Comments.** Put a text measure in **Comment**. Each category it returns text for gets a numbered marker, and the comments are listed, with the same numbers, down the right-hand side. A comment measure is usually a `SWITCH` on the category, or a lookup into a table of comments that Finance maintains.

With a field in Group, the waterfall adds the groups together.

## Format pane

- **Comparison:** which measure to compare with (Auto uses Plan if there is one, otherwise Previous year), and **Higher is worse** for costs, which swaps the green and red.
- **Layout:** variance charts or waterfall; **Columns** for periods of time or **Bars** for lists such as divisions; switches for the variance chart and the variance % chart.
- **Groups:** small multiples or stacked, and whether small multiples share a scale.
- **Total:** on or off, and its label.
- **Sort:** which chart to sort by, and the order.
- **Comments:** on or off.
- **Colours:** actual, previous year, good variance, bad variance.
- **Value labels:** on or off, text size, display units, decimal places.
- **Text:** size and colour of the category names and chart titles.

## Things to know

- All labels share one display unit, chosen from the typical value on the chart. Change it under **Value labels > Display units**.
- A variance percentage beyond 300% is drawn at the edge of its chart so one outlier cannot flatten the rest; its label still shows the true figure.
- When comparing a part-year actual with a full-year plan, use a plan measure cut back to the same months, or the variance will be misleading.
- Click a column or bar to filter the other visuals on the page; click empty space to clear. In small multiples a click selects that category within that group. The total, and the first and last bars of a waterfall, cannot be selected.
- Columns and bars have a maximum thickness, so a chart with only a few categories does not fill the whole visual.
- In the Bars direction, when the visual is narrow, the variance labels line up in a column at the right of each variance chart instead of sitting at the ends of the bars.
- Sorting from the chart titles is not offered inside small multiples (the titles are too small to click); use *Format > Sort*, which sorts every small chart the same way.
- Up to 500 categories and 24 groups are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

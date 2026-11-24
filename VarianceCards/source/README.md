# Variance Cards

A Power BI custom visual: a row of KPI cards. Each card shows one actual figure, its variance against plan and against the previous year in green or red, and an optional small trend chart.

This is an original visual. It is not affiliated with, or a copy of, any commercial variance-reporting product.

## Fields

| Field | What to put in it |
| --- | --- |
| Actual | One or more measures. Each becomes a card |
| Plan | The plan for each Actual measure, **in the same order** (optional) |
| Previous year | The previous year for each Actual measure, **in the same order** (optional) |
| Trend | Optional. Periods such as months, to add a small chart to each card |

Plan and Previous year measures are matched to the Actual measures by position: the first Plan measure belongs to the first Actual measure, and so on. If you have a plan for some KPIs but not others, put the ones with a plan first.

The card's title is the name of the Actual measure. Rename it in the field well (right-click the field > Rename for this visual) to get, say, "Revenue" instead of "Revenue AC".

## What a card shows

- **Headline:** the actual figure.
- **ΔPL and ΔPY:** the variance against plan and against previous year, as an amount and a percentage, with an up or down arrow. Green is good and red is bad.
- **Trend chart** (with a field in Trend): one column per period. Each column is the actual, with the gap to plan drawn in colour on top: green where actual is above plan, red for the shortfall. Periods with no actual yet show the plan in a light tint. Hover over a column for the figures. With no plan measure, the previous year is used.

## Periods with no actual yet

With a field in Trend, the headline and its variances count only the periods that have an actual, **on both sides**. With actuals to October and a plan for the whole year, the card compares January to October with January to October, and says "Jan–Oct" in its corner.

Without a field in Trend the visual cannot know which periods the actual covers, so give it plan and previous-year measures that are already cut back to the same periods.

## Format pane

- **Cards:** cards per row (0 fits as many as there is room for), how the headline is worked out from the periods (sum, latest period, or average), trend chart on or off, border, background.
- **Higher is worse:** one switch per Actual measure. Switch it on for costs, so an increase shows red.
- **Numbers:** display units and decimal places.
- **Text:** headline size, text size, colour.
- **Colours:** actual, good variance, bad variance.

## Things to know

- Each figure picks its own unit, so a headline of $1.51bn can sit beside a variance of +$23.1M.
- For a measure formatted as a percentage, such as a margin, the variance is given in points ("+1.0 pts") and no variance percentage is shown.
- **Sum of periods** is right for measures that add up, such as revenue. For a price, a margin or a headcount, choose **Latest period** or **Average of periods**.
- The trend chart is left off when a card is too short for it.
- The cards do not filter other visuals when clicked.
- Up to 12 measures in each field.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

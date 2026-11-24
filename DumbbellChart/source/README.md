# Dumbbell Chart

A Power BI custom visual that shows a before and an after for each item: last year's revenue and this year's for every customer, joined by a line. The length of the line is the change, and its colour is the direction.

## Fields

| Field | What to put in it |
| --- | --- |
| Category | One row for each value: customers, products, markets |
| From | The earlier value, such as last year's revenue |
| To | The later value, such as this year's revenue |
| Tooltips | Optional. More measures to show on hover |

## What you see

- A **hollow dot** is the earlier value and a **filled dot** the later one.
- **Blue** rows went up and **red** rows went down. Blue and red, not green and red, so that colour-blind readers can tell them apart; the arrow and the sign beside each row say the same thing without colour.
- Each row is labelled with its change, and its percentage change if you want it.
- An item with no earlier value is marked "new", and one with no later value "gone".

## Things to know

- **Most rows** (*Format > Rows*, 15 to begin with): with more items than this, the chart keeps the biggest movers, up or down, and says how many it has left out. Ordering by latest value keeps the largest instead.
- **Order:** by change, by percentage change, by latest value, or as the data arrives.
- **Draw** (*Format > Comparison*): *The values* runs each row from its earlier value to its later one. *Percentage change* starts every row from the same line, which shows the movement when the items differ so much in size that the changes are too small to see.
- **Higher is worse:** switch on for costs. It swaps the blue and red.
- The scale starts at zero when the values sit close enough to it, and otherwise fits them.
- Hover over a row for both values and the change. Click a row to filter the other visuals on the page; Ctrl+click for several.
- Up to 2,000 items are read.

## Format pane

- **Rows:** order, most rows.
- **Comparison:** draw the values or the percentage change; higher is worse.
- **Text and numbers:** change as a percentage too, text size, display units, decimal places.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

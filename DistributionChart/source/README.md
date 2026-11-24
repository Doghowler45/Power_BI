# Distribution Chart

A Power BI custom visual that shows how a measure is spread, not just its average: the margin of every customer in each segment, as a box plot with the individual points drawn over it.

## Fields

| Field | What to put in it |
| --- | --- |
| Points | One point for each value: customers, orders, products |
| Group | Optional. One row of the chart for each value, such as segment |
| Values | The measure whose spread you want to see, such as margin % |

With no Group field there is one row.

## Reading it

- **The box** covers the middle half of the points: from the lower quartile to the upper quartile.
- **The heavy line** in the box is the median, the value with half the points on each side. It is also written at the end of the row.
- **The whiskers** reach to the furthest points that are still within one and a half box-lengths of the box. Points beyond them are the outliers.
- **Each dot** is one point, nudged up or down a little so that dots with similar values do not hide each other. The nudge means nothing.
- A group with only one or two points has no box, just its points.

Each group's name shows how many points it holds.

## Things to know

- Groups are ordered by median, highest first; change that under *Format > Boxes and points*.
- Switch the points off for a plain box plot. They are left off anyway when the rows are too thin for them.
- Hover over a point for its name and value, and over a box for the group's median, quartiles and range. Click a point, or a box for its whole group, to filter the other visuals on the page.
- Up to 10,000 points are read.

## Format pane

- **Boxes and points:** order of groups, show every point, colour.
- **Text and numbers:** text size, display units, decimal places.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

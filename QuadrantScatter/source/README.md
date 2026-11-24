# Quadrant Scatter

A Power BI custom visual: a scatter chart divided into four named quadrants, with the points that matter named on the chart. Typical use: every customer by revenue and margin, to see who is large but thin, small but rich, and so on.

## Fields

| Field | What to put in it |
| --- | --- |
| Points | One point for each value: customers, products |
| X axis | The measure across, such as revenue |
| Y axis | The measure up the side, such as margin % |
| Size | Optional. A measure for the size of each point, such as volume |
| Tooltips | Optional. More measures to show on hover |

## Quadrants

Two dashed lines divide the chart. Each can sit at the **median** (half the points on each side), the **average**, or **a value** you type in, such as 0% growth or a 10% margin target. Each line is labelled with where it sits.

Give a quadrant a name under *Format > Quadrants* and it is shown in that corner with how many points it holds, for example "Protect · 7". Quadrants left blank are not labelled.

## Named points

The visual names the eight largest points (or, with no Size measure, the eight furthest from the middle). Each name is placed beside its point where it does not sit on another name or point; one with nowhere clear to go is left out, and the tooltip still has it. Change the number under *Format > Points*.

## Logarithmic scales

Revenue usually has a few very large customers and many small ones, which bunches most points against the axis. *Format > Axes > X: logarithmic scale* spreads them out. A log scale has no place for zero or negative values, so those points are left out, and the visual says how many.

## Things to know

- Each axis uses its own measure's format and display unit, so dollars can run across and a percentage up.
- A point's area, not its width, is in proportion to the Size measure.
- All points are one colour (*Format > Points > Colour*): position already says which quadrant a point is in.
- Click a point to filter the other visuals on the page; Ctrl+click for several.
- Up to 3,000 points are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

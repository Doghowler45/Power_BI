# Measure Waterfall

A Power BI custom visual that draws a waterfall chart from measures alone. No category column is needed.

## Fields

| Field | What to put in it |
| --- | --- |
| Base | One measure: the level the chart starts from, for example last year's profit. Optional; without it the chart starts at zero |
| Steps | One measure per step, in the order they should appear. A positive value goes up, a negative value goes down |

The final bar is worked out by the visual: base plus every step. Set its name under **Format > Total bar > Label**, or switch it off.

Each bar is named after its measure. To change a name, rename the measure in the field well (double-click it) rather than in the model.

## Chaining periods (FY25 to FY26 to FY27 and so on)

1. Put the first year's result in **Base**.
2. In **Steps**, add the drivers for the first change, then the next year's result measure, then the drivers for the next change, then the following year's result, and so on.
3. Open **Format > Subtotal bars** and switch on each year's result measure. It is then drawn as a full bar from zero, and the steps after it continue from it.

A subtotal bar shows its measure's own value. If that differs from what the steps before it add up to, a dashed line marks where the steps got to and the tooltip shows the unexplained difference. A subtotal measure that returns blank shows the running total instead. When the last bar is a subtotal, the automatic total bar is left out.

Measure names must be unique in a model, so a second set of drivers needs different names (for example `Volume FY27`). Rename them in the field well to show the same short name under both periods.

## Things to know

- A cost that should reduce the total must come through as a negative number. If your cost measure is positive, add a measure that negates it.
- A step whose measure is blank is treated as zero and labelled with a dash.
- All bars share one display unit (for example millions), chosen from the largest level on the chart. Change it under **Format > Value labels**.
- **Format > Value axis > Start at zero** is on by default. Switching it off crops the axis around the bars so small steps are easier to see; the baseline is then drawn dashed to show the axis is cropped.
- **Format > Bars > Rounded corners (px)** sets how rounded the bars are (default 4; 0 for square). Steps are rounded on all four corners; base, subtotal and total bars only at the end away from the baseline.
- **Format > Bars > Connector lines** switches the lines between bars on or off.
- Because the bars are measures rather than categories, clicking a bar does not filter other visuals. Slicers and other visuals still filter the waterfall.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

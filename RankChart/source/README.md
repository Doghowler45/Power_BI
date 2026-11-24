# Rank Chart

A Power BI custom visual: a rank (bump) chart. It shows how the ranking of customers, products or markets changes from one period to the next: who climbed, who slipped, who arrived in the top ten and who dropped out.

## Fields

| Field | What to put in it |
| --- | --- |
| Periods | What runs across: years, quarters, months |
| Ranked | What is ranked: customers, products, markets |
| Values | The measure to rank by, such as revenue |
| Tooltips | Optional. More measures to show on hover |

## Reading it

- Each line is one customer. Its position in each period is its rank, with the rank number in the dot.
- On the right: the name, the last period's value, and the places gained or lost since its first ranked period (▲3 or ▼2).
- On the left (when the visual is at least 520 pixels wide): the names in the first period.
- Anything that makes the top places in at least one period gets a line. While it is ranked lower it runs along a row at the bottom, so you can see it arrive or drop out.

## Colours

Under *Format > Colours > Colour by*:

- **Movement** (default): blue for lines that finish higher than they started, red for lower, grey for no change. The arrows beside the names say the same thing, so colour is never the only cue.
- **One colour each:** the leaders of the last period get their own colour, up to eight; the rest are grey. The built-in colours are a fixed set of eight, in an order checked to keep neighbours distinguishable for colour-blind readers. **Report theme** uses your theme's colours instead, to match the report's other visuals; those have not been checked the same way.

## Things to know

- Hover over a line and it thickens while the rest fade. Click a line to filter the other visuals to that customer; Ctrl+click for several.
- *Format > Ranking > Places shown* sets how many places are drawn (default 10). *Lowest value ranks first* is for measures where smaller is better.
- Equal values are ranked in the order the data arrives.
- Up to 60 periods and 300 ranked items are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

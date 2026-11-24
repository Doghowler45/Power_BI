# Marimekko

A Power BI custom visual: a Marimekko (mekko) chart. Each column's **width** shows how big that category is, and its stacked segments show the **mix** inside it, so two splits of one total can be read together: how big each market is, and what it buys.

## Fields

| Field | What to put in it |
| --- | --- |
| Columns | One column for each value, such as market |
| Segments | What each column is split into, such as product |
| Values | The measure, such as revenue |
| Tooltips | Optional. More measures to show on hover |

## Reading it

- Above each column: its total and its share of everything.
- Inside each segment: its share of the column (or its value: *Format > Labels > Show*), when there is room.
- Every column is the same height, so compare **widths** between columns and **heights** within one.
- The largest segment overall sits on the baseline in every column, so it can be compared across them.

## Keeping it readable

- With more than 10 columns, the smallest are pooled into one **Other** column, so there are no slivers too thin to read. Change the limit under *Format > Columns and segments > Most columns*.
- With more than 7 segments, the smallest are pooled into one **Other** segment. Eight is the most colours that stay easy to tell apart.
- The tooltip on an Other column or segment lists what was pooled into it. Clicking it selects them all.

## Colours

The built-in colours are a fixed set of eight, in an order checked to keep neighbours distinguishable for colour-blind readers. **Report theme** uses your theme's colours instead, to match the report's other visuals; those have not been checked the same way.

## Things to know

- Hover over a segment and that segment stays strong in every column while the rest step back.
- Click a segment to filter the other visuals on the page; Ctrl+click for several.
- Blank and negative values are left out, because a share-of-total chart cannot show them. The visual says so when it has dropped any.
- Up to 100 columns and 60 segment values are read before pooling.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

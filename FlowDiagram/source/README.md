# Flow Diagram

A Power BI custom visual: a flow (Sankey) diagram. It shows how one total splits and regroups across two to four fields, for example revenue from product, through customer segment, to sales channel.

## Fields

| Field | What to put in it |
| --- | --- |
| Stages | Two to four fields, in order from left to right |
| Values | The measure that sets the width of each flow |

## Reading it

- Each stage is a column of **nodes**, one for each value of that field, as tall as its share of the total.
- **Ribbons** join the nodes of neighbouring stages; a ribbon's thickness is the amount flowing between them.
- Each ribbon keeps the colour of where it **starts** all the way across, so you can follow, say, Apples from the left-hand side through every stage. Switch to colouring by where flows **end** under *Format > Colours > Colour flows by*.
- Names and values sit beside the nodes; a node too thin for a line of text is left unnamed, and the tooltip has it.

## Keeping it readable

- With more than 8 nodes in a stage, the smallest are pooled into one **Other** node (*Format > Nodes > Most nodes in a stage*). The tooltip lists what was pooled.
- Within each stage, nodes are ordered to keep connected nodes near each other, so ribbons cross as little as possible. Other is always at the bottom.

## Colours

The built-in colours are a fixed set of eight, in an order checked to keep neighbours distinguishable for colour-blind readers. **Report theme** uses your theme's colours instead, to match the report's other visuals; those have not been checked the same way. Only the stage the flows are coloured by needs colours; nodes in the other stages are a neutral grey.

## Things to know

- Hover over a node to see everything that flows through it; hover over a ribbon for that one flow, its share of the node it leaves, and its share of the total.
- Click a node or a ribbon to filter the other visuals on the page to the rows behind it; Ctrl+click for several.
- Rows with a blank, zero or negative value are left out.
- Up to 5,000 rows (combinations of the stage fields) are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

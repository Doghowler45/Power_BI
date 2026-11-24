# Driver Tree

A Power BI custom visual that lays a result out as a tree of what drives it: operating profit from revenue less costs, revenue from volume times price. Each driver is a card with its value and its change on plan or previous year, so you can follow a variance down to where it comes from.

## Fields

| Field | What to put in it |
| --- | --- |
| Driver | The name of each driver: Operating profit, Revenue, Volume, Price |
| Parent | The driver each one feeds into; blank for the one at the top |
| Operator | Optional. How it combines into its parent: +, -, x or / |
| Order | Optional. A number that orders drivers under the same parent |
| Number format | Optional. A format for each driver's numbers, such as `#,0` or `0.0%` |
| Actual | The actual result |
| Plan | Optional. The plan or budget |
| Previous year | Optional. The same measure for the previous year |

## The data it expects

One row for each driver, naming its parent:

| Order | Driver | Parent | Operator | Format | Actual | Plan |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Operating profit | | | \$#,0 | 30.4m | 26.8m |
| 2 | Revenue | Operating profit | + | \$#,0 | 305.9m | 298.0m |
| 3 | Volume (tonnes) | Revenue | x | #,0 | 118,380 | 117,000 |
| 4 | Price per tonne | Revenue | x | \$#,0 | 2,584 | 2,547 |
| 5 | Costs | Operating profit | - | \$#,0 | 275.5m | 271.2m |

**The visual does not do the arithmetic.** Every driver's value comes from your data; the operators are drawn on the connectors to show how the drivers relate, and they decide which way is good.

## Good and bad

A driver that goes up is good news, unless it is a cost. A driver with the operator **-** counts as a cost, and so does everything that feeds into it: in the table above Costs is subtracted, so a rise in Cost of sales underneath it is shown as bad. A second **-** further down flips it back.

The arrow shows which way the driver moved; its colour, and the bar's, show whether that is good or bad.

## Things to know

- **Compare with** (*Format > Comparison*) picks plan or previous year. On Auto it is plan when there is one.
- **Units:** a tree mixes amounts in the millions with prices and rates, so on Auto each driver gets its own unit. Use the Number format field when the drivers are not all the same kind of number. A driver whose format is a percentage has its change shown in percentage points.
- **Change bars** are all on one scale, the percentage change, so the driver that moved most stands out.
- The operator can be typed as a symbol or a word: + or plus, - or minus, x, * or times, / or per.
- A driver whose parent is blank or cannot be found starts a tree of its own. If two drivers name each other as parent, the loop is cut at the first one.
- The tree scrolls when it is too big for the visual. Cards get narrower before that happens, and long names are shortened.
- Hover over a card for the figures in full. Click one to filter the other visuals on the page; Ctrl+click for several.
- Up to 300 drivers are read.

## Format pane

- **Comparison:** compare with plan or previous year.
- **Cards:** text size, value size, change bars.
- **Numbers:** display units and decimal places.
- **Colours:** good change, bad change.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

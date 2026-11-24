# Route Flow Map

A Power BI custom visual that draws origin-to-destination routes between countries, with line width set by a measure such as revenue.

## Fields

| Field | What to put in it |
| --- | --- |
| Origin country | A country name (`New Zealand`), common alias (`USA`, `UK`, `Viet Nam`) or ISO code (`NZ`, `NZL`) |
| Destination country | Same as above |
| Revenue | Any measure; it sets the width of each route. Optional: without it, all routes are the same width |

Countries the visual cannot match are listed in a small notice at the top left of the visual. To add a spelling, edit `manualAliases` in `scripts/build-data.js`, then run `npm run build-data` and rebuild.

## Map type, zooming and hover

- **Format > Map > Map type** chooses between two views:
  - **Globe** (default): a globe when zoomed out that flattens into a Mercator-style map as you zoom in. Only the near side is visible, so routes to the far side run off the edge until you rotate the globe.
  - **Flat map**: a flat world map that shows every route at once. Use this when the page will be printed or exported, since nobody can rotate a PDF.
- **Zooming:** use the mouse wheel or the **+ / −** buttons in the bottom-right corner; the third button resets the view. On the globe, drag to rotate; on the flat map, drag to pan. The buttons can be hidden with **Format > Map > Zoom buttons**, and all zooming switched off with **Allow pan and zoom**.
- **Hover:** pointing at a route dims the others and shows a card in the top-right corner with the route, its value, its share of the total and its rank. Pointing at a country marker previews that country's card (see below). **Format > Hover** switches the card and the dimming on or off, and can turn on the standard Power BI tooltip as well (needed for report page tooltips).
- **Selecting a country:** click a country's marker, or its shape on the map, to pin a card listing every route it is part of: totals out, in and domestic, then each route with its value, largest first (`→` outbound, `←` inbound). Its routes stay highlighted and other visuals on the page filter to them. Routes hidden on the far side of the globe are still listed. Click the country again, or an empty part of the map, to clear. If the list is longer than the visual is tall, the card says how many routes were left out.

## Line widths and the legend

- Width is proportional to the value: a route with half the revenue is drawn half as wide.
- The largest route currently shown gets the **Maximum width**. Because of that, filtering rescales the lines and the legend values change with it.
- To stop the rescaling, set **Routes > Value at maximum width** to a fixed number (for example 400000000). Widths and the legend then stay the same under any filter; routes above that value are capped at the maximum width.
- **Minimum width** is only a floor so that small routes stay visible. Routes at the floor look the same width even if their values differ.
- The legend shows up to three round values between zero and the top of the scale, each drawn at exactly the width a route of that value gets.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npm run build-data
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

## Data sources

- Country shapes: Natural Earth 1:50m via the `world-atlas` package. No map tiles or web requests are used.
- Country names, codes and centre points: the `world-countries` package (Open Database License).

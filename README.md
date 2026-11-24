# Power BI custom visuals

19 custom visuals for Power BI, built for finance and commercial reporting. Each one has its own folder, holding a ready-to-use `.pbiviz` file and its source.

## Using a visual

1. In the table below, click **Download** for the visual you want, then the download button on the page that opens.
2. In Power BI Desktop, open the Visualizations pane, choose **...** > **Import a visual from a file**, and pick the file.
3. The visual appears in the pane with its own icon. Add it to a page and fill its fields.

Click a visual's name for its guide: its fields, its Format pane options and the things worth knowing before you use it.

## The visuals

### Financial statements and variances

| Visual | Version | What it does | File |
| --- | --- | --- | --- |
| [Statement Table](StatementTable/source/README.md) | 1.0.0.0 | A financial statement such as a profit and loss account: lines, costs, subtotals, totals and ratios, each formatted as such, with actual against plan and previous year and the variances drawn as bars. | [Download](StatementTable/StatementTable.pbiviz) |
| [Driver Tree](DriverTree/source/README.md) | 1.0.0.0 | A driver tree: a result broken down into what drives it (profit into revenue and costs, revenue into volume and price), with actual, the comparison and the variance on every driver. | [Download](DriverTree/DriverTree.pbiviz) |
| [Measure Waterfall](MeasureWaterfall/source/README.md) | 1.2.1.0 | A waterfall chart driven by measures: one measure is the starting bar, each further measure is a step up or down, and the total is worked out for you. No category column is needed. | [Download](MeasureWaterfall/MeasureWaterfall.pbiviz) |
| [Variance Chart](VarianceChart/source/README.md) | 1.1.1.0 | Actual against plan, previous year or forecast, with charts of the variance and the variance percentage. Uses common business-reporting notation: solid for actual, outlined for plan, grey for previous year, hatched for forecast, green and red for good and bad variances. | [Download](VarianceChart/VarianceChart.pbiviz) |
| [Variance Table](VarianceTable/source/README.md) | 1.0.1.0 | A table of actual against plan and previous year, with the variance and variance percentage drawn as bars inside the cells, a total row, comments, and sorting by clicking a column heading. | [Download](VarianceTable/VarianceTable.pbiviz) |
| [Variance Cards](VarianceCards/source/README.md) | 1.0.1.0 | A row of KPI cards. Each shows an actual figure with its variance against plan and previous year, in green or red, and an optional small trend chart. | [Download](VarianceCards/VarianceCards.pbiviz) |

### Customers, products and markets

| Visual | Version | What it does | File |
| --- | --- | --- | --- |
| [Concentration Curve](ConcentrationCurve/source/README.md) | 1.1.0.0 | How concentrated a total is: customers ranked largest first, the running share of the total they add up to, and A, B and C bands. Rows can be single customers or groups of them, so a few hundred rows can describe millions of customers. | [Download](ConcentrationCurve/ConcentrationCurve.pbiviz) |
| [Marimekko](Marimekko/source/README.md) | 1.0.0.0 | A Marimekko chart: columns whose width shows each category's size and whose stacked segments show its mix, so two splits of one total read together. | [Download](Marimekko/Marimekko.pbiviz) |
| [Rank Chart](RankChart/source/README.md) | 1.0.0.0 | A rank (bump) chart: how the ranking of customers, products or markets changes from period to period. | [Download](RankChart/RankChart.pbiviz) |
| [Quadrant Scatter](QuadrantScatter/source/README.md) | 1.0.0.0 | A scatter chart divided into four labelled quadrants, with the points that matter named. | [Download](QuadrantScatter/QuadrantScatter.pbiviz) |
| [Flow Diagram](FlowDiagram/source/README.md) | 1.0.0.0 | A flow (Sankey) diagram: how a total splits and regroups across two to four fields, such as segment, channel and market. | [Download](FlowDiagram/FlowDiagram.pbiviz) |
| [Dumbbell Chart](DumbbellChart/source/README.md) | 1.0.0.0 | A dumbbell chart: for each customer, product or market, a line from an earlier value to a later one, coloured by direction and ordered by the size of the change. | [Download](DumbbellChart/DumbbellChart.pbiviz) |
| [Distribution Chart](DistributionChart/source/README.md) | 1.0.0.0 | How spread out a measure is: a box for the middle half, a line for the median and a dot for every point, for the whole set or for each group. | [Download](DistributionChart/DistributionChart.pbiviz) |

### Time and seasonality

| Visual | Version | What it does | File |
| --- | --- | --- | --- |
| [Seasonal Chart](SeasonalChart/source/README.md) | 1.0.0.0 | A month-by-month chart with one line for each year: the latest year stands out against the earlier ones, with their range behind it, as monthly values or as a running total. | [Download](SeasonalChart/SeasonalChart.pbiviz) |
| [Calendar Heatmap](CalendarHeatmap/source/README.md) | 1.0.0.0 | A calendar of months: one row for each year and one cell for each month, coloured by a measure, with each year's total and its change on the year before. | [Download](CalendarHeatmap/CalendarHeatmap.pbiviz) |
| [Heatmap](Heatmap/source/README.md) | 1.0.0.0 | A heatmap: a grid of rounded cells coloured by a measure, with single-hue or two-sided colour scales, values in the cells, a scale legend and hover highlighting. | [Download](Heatmap/Heatmap.pbiviz) |

### Maps, tables and navigation

| Visual | Version | What it does | File |
| --- | --- | --- | --- |
| [Route Flow Map](RouteFlowMap/source/README.md) | 1.2.1.0 | Draws origin-to-destination routes between countries on a world map, with line width set by a measure such as revenue. Countries are matched by name or ISO code; no latitude or longitude is needed and no internet access is used. | [Download](RouteFlowMap/RouteFlowMap.pbiviz) |
| [Manual Table](ManualTable/source/README.md) | 1.8.0.0 | A table you type numbers and text into yourself while building the report. What you type is saved with the report, and people viewing the published report see it read-only. No data fields are needed. | [Download](ManualTable/ManualTable.pbiviz) |
| [Navigation Menu](NavigationMenu/source/README.md) | 1.0.0.0 | A navigation header with dropdown sub-sections, set up from a table of sections and pages. Choosing an entry either selects it for a Power BI button to go to, or opens the page in a new browser tab. | [Download](NavigationMenu/NavigationMenu.pbiviz) |

## Source

Each visual's folder holds the packaged visual and a `source` folder: TypeScript, styles, `capabilities.json` and a README. To rebuild one you need Node.js. From its `source` folder:

```
npm install
npx pbiviz package
```

The package is written to `dist/`. The author name, email and support address in each `pbiviz.json` are placeholders: replace them before you distribute a visual of your own.

## Things to know

- These are private (uncertified) visuals. Your organisation's Power BI settings decide whether they can be used in published reports.
- None of them sends data anywhere or needs internet access.
- A custom visual cannot change the report page by itself. The Navigation Menu works with a standard Power BI button, or opens the page in a new browser tab; its README explains both.

# Concentration Curve

A Power BI custom visual that shows how concentrated a total is: how much of your revenue comes from how few customers.

It ranks the customers largest first and draws two charts that share one horizontal scale:

- **Running share (top):** the share of the total reached as each customer is added. A curve that shoots up and then flattens means a few customers carry the total.
- **Values (bottom):** what each customer brings, in the same order.

It works with one row per customer (up to 30,000), or with customers **grouped into buckets**, which is how to use it for millions of customers.

## Fields

| Field | What to put in it |
| --- | --- |
| Category | What to rank: customers, products, markets. With grouped data, the bucket |
| Values | The measure to total, such as revenue |
| Count | Only for grouped data: how many customers each row stands for |
| Tooltips | Optional. More measures to show on hover |

## Bands

The customers are split into three bands, shown as three depths of one colour:

- **A:** those that together reach 80% of the total (the row that crosses 80% is counted in A).
- **B:** the next ones, up to 95%.
- **C:** the rest.

Each band is labelled along the foot of the top chart with how many customers it holds and the share they add, for example "A · 17 customers · 81%". Change the two thresholds under *Format > Bands*.

A ringed dot marks the share held by the largest ten ("Top 10: 68%"), or with grouped data by the top 10% of customers ("Top 10%: 55%"). Change either under *Format > Top call-out*.

## Millions of customers: grouped data

Power BI will not send a visual millions of rows, and a chart a few hundred pixels wide could not show them anyway. So for a large customer base, group the customers **before** they reach the report: rank them by revenue, cut the ranking into buckets, and keep one row per bucket with the number of customers and their revenue. A thousand buckets describe the curve as well as every customer would.

Put the bucket in **Category**, its revenue in **Values** and its number of customers in **Count**. The visual then:

- measures across the chart in **share of customers** (0% to 100%), not rank
- counts customers, not rows, in every label ("A · 510,000 customers · 80%")
- draws each bucket as wide as its share of the customers
- shows, in the lower chart, the **average for one customer** in each bucket

Buckets need not be the same size. A useful pattern is to keep the largest few hundred customers as rows of their own (Count = 1) and bucket the rest; the head of the curve is then exact.

### Building the buckets in the source database

This is the best place to do it for millions of customers. `NTILE` is available in SQL Server, PostgreSQL, Oracle, Snowflake and BigQuery; adjust table and column names.

```sql
WITH per_customer AS (
    SELECT customer_id, SUM(revenue) AS revenue
    FROM sales
    WHERE fiscal_year = 'FY26'
    GROUP BY customer_id
),
ranked AS (
    SELECT revenue, NTILE(1000) OVER (ORDER BY revenue DESC) AS bucket
    FROM per_customer
)
SELECT bucket, COUNT(*) AS customers, SUM(revenue) AS revenue
FROM ranked
GROUP BY bucket;
```

### Building the buckets in Power Query

For sources with no SQL to run. It sorts every customer in memory, so it is slower on a very large table. This has not been run against your data: check the row count and total against a known figure the first time.

```
let
    PerCustomer = Table.Group(Sales, {"Customer"}, {{"Revenue", each List.Sum([Revenue]), type number}}),
    // Buffered so the order is fixed before the rows are numbered.
    Sorted = Table.Buffer(Table.Sort(PerCustomer, {{"Revenue", Order.Descending}})),
    Numbered = Table.AddIndexColumn(Sorted, "Position", 0, 1, Int64.Type),
    Customers = Table.RowCount(Numbered),
    WithBucket = Table.AddColumn(Numbered, "Bucket", each Number.IntegerDivide([Position] * 1000, Customers) + 1, Int64.Type),
    Buckets = Table.Group(WithBucket, {"Bucket"}, {{"Customers", each Table.RowCount(_), Int64.Type}, {"Revenue", each List.Sum([Revenue]), type number}})
in
    Buckets
```

Then add two measures over the bucket table, `SUM` of revenue and `SUM` of customers. Name the customers measure for what it counts ("Customers"): the visual uses that name in its labels.

### What you give up

- **The buckets are fixed at refresh.** A slicer cannot re-rank customers. If the curve has to respond to a slicer, say year or product, add that column to the bucketing query (`NTILE(1000) OVER (PARTITION BY fiscal_year ORDER BY revenue DESC)`), keep it in the bucket table, and relate or filter on it.
- **Inside a bucket, customers are treated as equal.** Band edges and the call-out are exact to within one bucket: 0.1% of customers with 1,000 buckets.
- **Clicking selects a bucket**, not a customer.

## One row per customer

With nothing in Count, each row is one customer. Up to 30,000 are read, in the order of the query. **If there are more, the visual shows a red warning** and says so, because the curve would then be drawn from only part of the customers; group them into buckets instead.

Under the bars, names are shown when they fit; otherwise rank numbers.

## Using it with margin

Put a margin or profit measure in Values and the curve shows where profit is given back. Customers that lose money sit at the far right in red, the running share climbs past 100% before they pull it back down, and the highest point is marked ("Peak 105% at 32": the first 32 customers earn 105% of the total margin, and the rest lose the extra 5%).

## Things to know

- Rows are ranked by what one customer brings: the value itself, or with grouped data the bucket's average. The visual does this itself, so the order of the data does not matter.
- Hover anywhere to see the row under the pointer. Click to filter the other visuals on the page; Ctrl+click for several.
- With a very uneven customer base the lower chart is dominated by its first few bars. That is the point of the top chart; switch the lower one off under *Format > Values chart* if it adds nothing.
- The values chart is left off when the visual is too short for both charts.
- If the total is zero or negative there are no shares to show, and the visual says so.
- The word used in labels ("customers") comes from the Count measure's name, or with one row per customer from the Category field's name. Override it under *Format > Text and numbers*.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

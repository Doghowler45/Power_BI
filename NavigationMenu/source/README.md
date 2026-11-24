# Navigation Menu

A Power BI custom visual: a header of section headings, where a heading either goes to a page or opens a dropdown of sub-sections. For example, a heading called **Financial performance** with **Profit and Loss** and **Balance sheet** beneath it.

The menu is read from a small table in your model, so changing the menu means changing rows, not rebuilding anything.

## The one thing to know first

**Power BI does not let a custom visual change the report page.** No visual from the Visualizations pane can: only Power BI's own buttons can. So this visual gets you there in one of two ways, chosen under *Format > Navigation > When an entry is clicked*:

| Method | What happens | Works in |
| --- | --- | --- |
| **Select, then a Go button** (default) | Clicking an entry selects it. A Power BI button beside the menu then reads "Go to Profit and Loss" and takes you there. Two clicks, same tab. | Desktop and the Power BI service |
| **Open the page in a new tab** | Clicking an entry opens that page in a new browser tab. One click. | Published reports only |

## The navigation table

One row per menu entry. In Power BI Desktop: *Home > Enter data*.

| Order | Section | Item | Page | Page id |
| --- | --- | --- | --- | --- |
| 0 | Home | | Cover | 5050bfe29c361c4374e6 |
| 1 | Financial performance | Profit and Loss | P&L | a9d3c6e2b5f8417c0d2b |
| 2 | Financial performance | Balance sheet | Balance sheet | f6a2b8d4c1e7093a5b4c |
| 3 | Commentary | | Commentary | e5f1a9c2d7b4083f6a1e |

- **Section:** the heading.
- **Item:** the entry in that heading's dropdown. Leave it blank and the heading goes straight to the page, with no dropdown.
- **Page:** the page's name, **exactly** as on its page tab. Power BI matches on this text.
- **Page id:** only needed for the new-tab method. See below.
- **Order:** a number that puts the entries in order. Without it they arrive A to Z.

## Fields

| Field | Column |
| --- | --- |
| Section | Section |
| Sub-section | Item |
| Page | Page |
| Page link | Page id (optional) |
| Order | Order (optional) |

## Method 1: select, then a Go button

Add two measures to the navigation table:

```
Go to page = SELECTEDVALUE ( Navigation[Page] )

Go to label =
IF (
    NOT ISBLANK ( SELECTEDVALUE ( Navigation[Page] ) ),
    "Go to " & COALESCE ( SELECTEDVALUE ( Navigation[Item] ), SELECTEDVALUE ( Navigation[Section] ) ) & " " & UNICHAR ( 8594 )
)
```

Then add the button, once per page (or copy it from page to page along with the menu):

1. *Insert > Buttons > Blank*, and place it beside the menu.
2. In the format pane, turn **Action** on. Set **Type** to **Page navigation**.
3. Beside **Destination**, click **fx** and choose the measure **Go to page**.
4. Under **Style > Text**, click **fx** beside the text and choose **Go to label**.

Choosing an entry in the menu filters the navigation table to that row, the way a slicer would, so both measures return that entry. The button has nothing to show and nowhere to go until an entry is chosen. Click the chosen entry again to clear it.

In Power BI Desktop the button needs **Ctrl+click**, as all buttons do there. The menu itself does not.

## Method 2: open the page in a new tab

1. Publish the report and open it in a browser.
2. Copy the address from the address bar and paste it into *Format > Navigation > Report web address*. Anything after the report's id is ignored, so paste it as it is.
3. Fill the **Page id** column: open each page in the browser and take the last part of its address, after the final `/` and before any `?`. In a project saved as `.pbip`, it is also the name of the page's folder under `definition\pages`.
4. Put the column in **Page link**, and set *When an entry is clicked* to **Open the page in a new tab**.

A **Page link** value that is already a full web address (starting `https://`) is opened as it is, so an entry can also point at another report or a web page.

## Marking the page you are on

A visual cannot find out which page it is sitting on. On each page's copy of the menu, type that page's name into *Format > Navigation > This page*. Its heading and entry are then shown in the active colour and cannot be clicked.

## Format pane

- **Navigation:** the method, the report's web address, this page, and whether dropdowns open on hover or on click.
- **Headings:** height, text size, colours, and whether there is a fill behind the headings. Turn the fill off to sit the menu on a band that is part of your page background.
- **Dropdowns:** fill and text colour, entry height, minimum width.

## Things to know

- **A dropdown opens inside the visual.** A visual cannot draw outside its own box, so make the visual tall enough for its longest dropdown: heading height plus entry height for each entry. The part below the headings is see-through.
- **Whatever sits underneath the visual cannot be clicked**, even where the visual is see-through. Place it over titles and empty space, not over charts or slicers.
- A dropdown closes when you choose an entry, click its heading again, press Esc, or move the pointer off the visual for a moment.
- With the Go button method, the selection stays on that page until you clear it or choose something else. Each page's menu keeps its own selection.
- An entry with no page (or, for the new-tab method, no link) is shown faded and says why when you hover over it.
- If a page is renamed, update the **Page** column to match, or the Go button will have nowhere to go.
- Turn off the visual header for the menu (*Format > General > Header icons*) so its icons do not appear over the headings.
- Up to 500 rows are read.

## Rebuilding

Needs Node.js. Build from a local drive: npm does not work from a network path such as `\\server\share`.

```
npm install
npx pbiviz package
```

The packaged visual is written to `dist/`. Before sharing it more widely, replace the placeholder author name, email and support URL in `pbiviz.json`.

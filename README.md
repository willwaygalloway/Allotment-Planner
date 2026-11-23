# Allotment Planner

A simple, free planner for an allotment or veg beds. It tells you when to sow, plant out and pick each crop, shows what is in each bed month by month, and gives you a weekly to-do list.

- Sowing and harvest months come from **Huw Richards' Master Vegetable Sowing List** and the **Real Seeds sowing calendar**. They shift earlier or later with the user's frost dates.
- Variety suggestions come from the **[Real Seeds catalogue](https://realseeds.co.uk/)**. GitHub refreshes the list every Monday.
- There are no accounts and no server. Each person's plan is saved in their own browser. They can save it as a file to move it between devices.

## Put it on GitHub Pages (about 5 minutes)

1. On GitHub, click **+ › New repository**. Name it, for example, `allotment-planner`, and make it **Public**.
2. On the new repository's page, click **uploading an existing file**. Drag in everything from this folder, including the hidden `.github` folder and `.nojekyll`, then click **Commit changes**.
   - On a Mac, Finder hides files that start with a dot. Press **Cmd + Shift + .** in Finder to show them before you drag.
   - If `.github` won't upload, see "If the weekly update isn't there" below.
3. Go to **Settings › Pages**. Under "Build and deployment", choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. Wait a minute. The address appears at the top of the Pages settings, for example `https://yourname.github.io/allotment-planner/`.

### The weekly Real Seeds update

- `.github/workflows/update-realseeds.yml` runs every Monday morning.
- It reads the Real Seeds catalogue pages and updates `data/realseeds.js` with variety names, packet sizes and organic flags. It doesn't copy descriptions, photos or prices: each variety links back to its page on Real Seeds.
- To run it straight away, open the **Actions** tab, choose **Update Real Seeds catalogue**, then **Run workflow**. If GitHub asks you to enable workflows, say yes.
- If the update can't read a page, or a page suddenly lists far fewer varieties (for example because Real Seeds changed its site), it keeps the previous list for that page. The planner never ends up with an empty list.

**If the weekly update isn't there.** Some browsers won't upload folders that start with a dot. If that happens:

1. In the repository, click **Add file › Create new file**.
2. Name it `.github/workflows/update-realseeds.yml`.
3. Paste in the contents of that file from this folder.
4. Commit it.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `app.js`, `style.css` | The simple planner |
| `data/crops.js` | The crop guide: Huw Richards' sowing list, the Real Seeds calendar (read to the nearest half month) and typical growing times |
| `data/realseeds.js` / `.json` | Real Seeds varieties, updated weekly by the workflow |
| `scripts/update_realseeds.py` | The catalogue reader. `catalogue_rules.json` says which page feeds which crop |
| `full/` | The advanced planner (nursery trays, quantities, plan versions, exports). It keeps its own separate plan. |
| `fonts/` | Self-hosted fonts (SIL Open Font Licence, see `fonts/licences`), so nothing loads from Google |

## How the planner works

1. **Where you grow** sets your frost dates, which shift every sowing date.
2. **Sections and beds**: beds are grouped into sections and named 1A, 1B… 2A, 2B… The default bed is 6 × 4 ft (1.8 × 1.2 m). You can set a size for a whole section at once, or copy one bed's size to the rest of its section.
3. **What to grow**: crops are grouped as *Staples & easy to grow*, *Worth a try* and *For when you're confident*. You can pick a Real Seeds variety for each one.
4. **How much**: you choose meals a week, how long and portion size. kg = portion × meals a week × weeks × 1.2, then area = kg ÷ typical yield.
   - Salads and roots such as lettuce, radish and beetroot are split into several smaller sowings a few weeks apart, following Charles Dowding's and the RHS's advice on succession sowing.
5. **Review**: shows where everything goes before the plan starts. Small sowings can share part of a bed.

The **Calendar** tab shows the year at a glance (sow, plant out, picking) plus a month-by-month list. It prints on one landscape page.

## Adding features later

Good next steps: a seed list, a harvest log, and nursery tray counts. The advanced planner in `full/` already has working versions to borrow from.

## Using your own plan

Plan files from the advanced planner (`allotment-plan.json`) open in the simple planner: **Settings › Open plan file**. Beds, crops and their dates come across. Flowers and green manures are left out.

## Credits

- Succession sowing: [Charles Dowding](https://www.charlesdowding.co.uk/lessons/succession-and-rotation) and the [RHS](https://www.rhs.org.uk/advice/profile?PID=730). Easy crops: [Which? Gardening](https://www.which.co.uk/reviews/grow-your-own/article/growing-vegetables/the-five-easiest-vegetables-to-grow).
- Sowing and harvest months: Huw Richards, *Master Vegetable Sowing List* and *One Bed, More Harvests* (Productive Planting Plan 2.0).
- [Real Seeds Sowing and Harvesting Calendar](https://realseeds.co.uk/Printablesowing.html) and [catalogue](https://realseeds.co.uk/).
- Growing times are typical figures. Varieties, soil and weather decide the actual day.

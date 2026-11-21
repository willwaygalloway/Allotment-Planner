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

## Adding features later

The simple planner is deliberately small: one crop guide and three screens. Good next steps, roughly in order:

1. Seed list
2. Harvest log
3. "How much to grow"
4. Nursery tray counts

The advanced planner in `full/` already has working versions of all of these to borrow from.

## Using your own plan

Plan files from the advanced planner (`allotment-plan.json`) open in the simple planner: **Settings › Open plan file**. Beds, crops and their dates come across. Flowers and green manures are left out.

## Credits

- Sowing and harvest months: Huw Richards, *Master Vegetable Sowing List* and *One Bed, More Harvests* (Productive Planting Plan 2.0).
- [Real Seeds Sowing and Harvesting Calendar](https://realseeds.co.uk/Printablesowing.html) and [catalogue](https://realseeds.co.uk/).
- Growing times are typical figures. Varieties, soil and weather decide the actual day.

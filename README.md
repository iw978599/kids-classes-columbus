# Columbus Kids' Classes

A static site listing classes and camps for kids up to age 6 around Columbus, refreshed every 3 hours by GitHub Actions.

- `scripts/sources/`: Rec & Parks, Columbus Children's Theatre, and library adapters, plus a page monitor for providers without readable schedules.
- `data/providers.json`: hand-checked providers. Update the details and `verified` date when a badge shows a page changed.
- `docs/`: the GitHub Pages site. `docs/data.json` is generated.

Run locally with `node scripts/update.mjs`. Run tests with `node --test "test/*.test.mjs"`.

A star on any listing saves it in that browser (`localStorage`, key `saved`). Saved listings show at the top whatever the filters say, and one that drops off the site stays there as a link. The logic is in `docs/logic.mjs` (`readSaved`, `toggleSaved`, `savedView`).

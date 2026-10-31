# Columbus Kids' Classes

A static site listing classes and camps for kids up to age 6 around Columbus, refreshed every 3 hours by GitHub Actions.

- `scripts/sources/`: Rec & Parks, Columbus Children's Theatre, and library adapters, plus a page monitor for providers without readable schedules.
- `data/providers.json`: hand-checked providers. Update the details and `verified` date when a badge shows a page changed.
- `docs/`: the GitHub Pages site. `docs/data.json` is generated.

Run locally with `node scripts/update.mjs`. Run tests with `node --test "test/*.test.mjs"`.

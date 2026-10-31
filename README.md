# Columbus Kids' Classes

A static site listing classes for age 4 around Columbus, refreshed every 3 hours by GitHub Actions.

- `scripts/sources/`: Rec & Parks, Columbus Children's Theatre, and library adapters, plus a page monitor for providers without readable schedules.
- `data/providers.json`: hand-checked providers. Update the details and `verified` date when a badge shows a page changed.
- `docs/`: the GitHub Pages site. `docs/data.json` is generated.

The workflow needs a `BIRTH_MONTH` secret in `YYYY-MM` format, which decides age eligibility. Run locally with `BIRTH_MONTH=YYYY-MM node scripts/update.mjs`. Run tests with `node --test "test/*.test.mjs"`.

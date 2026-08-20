# Nuclear source data

Download the current **Global Nuclear Power Tracker** export from Global Energy
Monitor and save its CSV version in this directory (for example,
`data/source/global-nuclear-power-tracker.xlsx`). Source exports are ignored by
Git: they can be regenerated and may have reuse conditions that should travel
with the original download.

Then generate the version committed and served by the app:

```sh
npm run data:sync -- --input data/source/global-nuclear-power-tracker.xlsx
```

The script accepts XLSX, XLS, CSV, or JSON. It converts individual reactor-unit records to
facility-level markers and writes:

- `src/data/plants.json` — data shipped with the front end.
- `src/data/plants.meta.json` — source path, sync time, and record counts.

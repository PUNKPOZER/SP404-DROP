# Migrations

Rules (normative text: SP_SYSTEM_INTERCHANGE.md §24):

1. `formatVersion` (manifest) and each module's own `schemaVersion` / `analysisVersion` / `recipeVersion` are independent integers. Never infer a version from the app version.
2. A reader that sees a **higher** `formatVersion` than it knows opens the package read-only for the parts it understands, reports `VALID WITH WARNINGS` or `UNSUPPORTED VERSION` (see §14) and **never rewrites** files it does not understand.
3. A migration is a pure function `vN -> vN+1` on parsed JSON, kept as `migrations/vN-to-vN+1.md` (human description) plus a fixture pair `before/` + `after/` in this folder. Migrations never delete unknown fields.
4. Migrations run in memory on open; the migrated package is written only on the next explicit save, through the atomic save path, and the previous file is kept as `<name>.spsystem.bak` once.
5. A package written by an older application stays readable by newer ones forever (v1 is read-only supported for as long as the project exists); a newer package is *not* promised to be readable by older apps — hence rule 2.

No migrations exist yet: v1 is the first version.

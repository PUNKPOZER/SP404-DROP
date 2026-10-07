# sp-system-spec — `.spsystem` interchange, draft v1

Status: **draft for review. Nothing here is implemented in SP404 DROP or SP-404 LEARN.**
The normative text is [`../SP_SYSTEM_INTERCHANGE.md`](../SP_SYSTEM_INTERCHANGE.md); this folder holds the machine-readable parts.

```
schemas/       JSON Schema (draft 2020-12). All objects allow unknown properties (forward compatible).
examples/      Three unpacked example packages (audio omitted on purpose).
migrations/    How future format versions are migrated.
validate_examples.py   Checks every example against the schemas + the reader-side structural rules.
```

Run the check (needs `pip install jsonschema`):

```bash
python3 validate_examples.py
```

Schemas: `manifest`, `chops`, `pads`, `samples`, `loops`, `analysis`, `recipe`, `progress`, `requirements`, plus `common` (shared definitions).
The two applications must not import each other's code; each implements this specification (and, later, can share a reader/writer — see "SP CORE" in the main document).

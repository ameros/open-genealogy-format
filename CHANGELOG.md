# Changelog

## 1.0.2 — 2026-11-25

Corrected GEDCOM import dictionary initialization.

- New empty OGF projects continue to receive the curated default dictionary.
- GEDCOM imports now start with an empty import-specific dictionary and populate
  it only from unique flattened keys found in the imported records.
- Starter-project defaults are no longer merged into imported dictionaries.
- Repeated imported fields continue to share one dictionary definition and
  preserve their values in source order.

## 1.0.1 — 2026-11-25

Backward-compatible update focused on repeated fields and GEDCOM import.

- Repeated occurrences of a field are stored as an ordered list under one key,
  instead of generating synthetic keys such as `_2` and `_3`.
- Dictionary population reuses unique field definitions and avoids duplicate
  entries for repeated fields.
- Editor and tree handling updated to work with repeated values and references.
- GEDCOM import and OGF documentation updated to describe repeated-field
  handling.

## 1.0.0 — 2026-11-25

First stable release of Open Genealogy Format (OGF).

1. **Open Genealogy Format established** — a human-readable, self-describing
   format for genealogical data, with an open field vocabulary and explicit
   rules for preserving records, identifiers, references and source data.
2. **Naked data editor implemented** — a browser-based editor for working
   directly with OGF data, metadata and dictionary fields.
3. **GEDCOM importer implemented** — GEDCOM data can be imported into OGF while
   preserving source tags and values rather than silently translating their
   meaning.
4. **Tree visualisation implemented** — interactive family-tree visualisation
   based on the earlier family project, GEDCOM to SVG Tree.
5. **Mobile experience adjusted** — full-screen tree and details views,
   responsive to screen orientation, with synchronized navigation between
   tree nodes and record references.

# Changelog

### 1.0.4 — inline YAML metadata parsing and sample tree fix

- Fixed parsing of inline YAML collections in structured metadata. Inline lists
  such as `partners: [husb, wife]` and inline maps such as
  `birth: { date: birth_date, place: birth_place }` are now parsed as arrays and
  objects rather than plain strings.
- Restored tree rendering for the supplied sample files, whose relationship
  configuration uses inline YAML collection syntax.
- Retained the reusable `defaults/meta.yaml` and `defaults/dictionary.yaml`
  files and the independent configuration behavior of existing projects and
  GEDCOM imports.

### 1.0.3 — dictionary-driven card grouping

- Removed per-card field move controls; record data no longer carries presentation ordering.
- Card field order and visual groups now come from `@dictionary@` order and blank-line group boundaries.
- GEDCOM import groups every flattened descendant under its top-level source tag and writes those groups to the dictionary consistently across records.
- Unknown record fields remain visible in an ungrouped fallback section.
- Moved starter metadata and dictionary into reusable `defaults/meta.yaml` and
  `defaults/dictionary.yaml` files; new projects load and embed these defaults.
- Existing projects and GEDCOM imports keep their independent configuration
  behavior; starter defaults are not merged into either.
- Documented that YAML comments are optional human-readable notes only; they are not parsed as group metadata.

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

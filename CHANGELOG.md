## [1.2.0] - 2026-11-27

### Added
- Added unified `@meta@.gender` configuration with an explicit field, allowed values, and male/female classifications. Legacy `gender_mapping` remains readable.
- Added readable type-prefixed identifiers for newly created records: `I-`, `F-`, `S-` and `R-`, with independent counters and persisted high-water marks.
- Existing identifiers and imported GEDCOM xrefs remain unchanged.

### Versioning
- Project and specification version: 1.2.0.
- OGF format version: 1.
- Metadata contract version: 3.

## [1.1.0] - 2026-11-26

### Added
- Added PDF print scaling modes: fit the complete rendered tree onto one selected sheet, or preserve the tree's native 96-DPI SVG scale and tile it across multiple sheets when necessary.
- Actual-size PDF output uses the selected A-series paper size and orientation, with 10 mm page margins. Tree lines and text remain vector artwork in the browser's Save as PDF output.
- Moved SVG export into a collapsed Advanced export formats section; SVG remains available for Inkscape editing and web publishing, without photographs.
- Retained A4, A3, A2, A1 and A0 paper sizes, with landscape and portrait orientation.

### Notes
- This is a project release only. The OGF format version remains 1 and the metadata contract remains 2; the specification revision remains 1.0.4.

## [1.0.4] - 2026-11-26

### Fixed
- SVG tree export uses portable Unicode event symbols instead of depending on the application's Font Awesome webfont.

### Added
- SVG export intentionally omits photographs, producing a clean, lightweight vector tree for editing and sharing.
- Added a print-oriented PDF workflow using the browser's native print pipeline. It prints the currently rendered tree and retains the image URLs used by the visible tree, without requiring JavaScript to read cross-origin image bytes.
- Added A4, A3, A2, A1 and A0 page sizing with landscape and portrait orientation for SVG and PDF exports.
- PDF print layout uses explicit physical page dimensions and vector SVG artwork; users save the result through the browser's Print → Save as PDF command.

## 1.0.4

- Added a unified Save / Export dialog for OGF YAML and SVG.
- SVG exports the currently rendered tree graph, respecting the active generation controls; it is fitted to the page and does not include unrelated records outside the rendered tree.
- SVG export is self-contained with resolved SVG presentation styles and a white background.
- YAML remains a complete native project export.

# Changelog

### 1.0.4 — inline YAML metadata parsing, sample tree and version badge fixes

- Fixed parsing of inline YAML collections in structured metadata. Inline lists
  such as `partners: [husb, wife]` and inline maps such as
  `birth: { date: birth_date, place: birth_place }` are now parsed as arrays and
  objects rather than plain strings.
- Restored tree rendering for the supplied sample files, whose relationship
  configuration uses inline YAML collection syntax.
- The header version badge now reads `projectVersion` from `VERSION.json` at runtime; it is hidden if the manifest cannot be loaded, avoiding stale hardcoded release labels.
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



- Unified gender interpretation under `@meta@.gender` and introduced readable, type-prefixed IDs for newly created records while preserving imported and existing identifiers.

## [1.2.6] - 2026-11-27
### Fixed
- Restored metadata-driven date phrasing for GEDCOM qualifiers (`ABT`, `BEF`, `AFT`, `BET ... AND ...`, `CAL`, `EST`, `FROM` and `TO`) while preserving the original stored date expressions.
- Kept existing EDTF-style approximate, uncertain and range phrasing working through the same shared formatter.

### Added
- Added reusable sample-fixture checks and date-phrasing regression tests, including assertions against real dates in the GEDCOM-derived English sample and repeated-event sample.
- Added localized date-phrase templates to the English and Polish sample metadata and starter metadata.
### Changed
- Restored one shared `@meta@.image_field` configuration for all record types.
- The shared setting accepts one field name or an ordered list of field names and applies consistently to Individuals, Families, Sources, Repositories and other records.
- Updated starter metadata, sample data and specification examples to use the shared configuration.
- Older per-record-type image-field mappings remain readable for compatibility and are normalized to one shared field list when field keys are renamed.

## [1.2.5] - 2026-11-27
### Changed
- Made existing `@meta@` keys read-only in the metadata editor; metadata values remain editable and newly added fields can still be named.
- Displayed each repeated structured field's dictionary label once for the entire occurrence group instead of repeating it on every occurrence.
- Removed duplicate labels from individual items inside nested repeated arrays while retaining one parent label.

### Fixed
- Preserved fixed metadata key names when editing nested values, preventing accidental key renames.
- Kept repeated occurrence boundaries and nested field labels intact on data cards.

## [1.2.4] - 2026-11-27
### Changed
- Rebuilt the `@meta@` editor as a recursive structured form: nested objects expose independently editable fields, and arrays expose independently editable, ordered items.
- Added and removed nested metadata fields and list items without requiring raw JSON editing.
- New array items inherit the shape of the existing first item (scalar, object or nested list) to keep repeated metadata structures consistent.
- Preserved scalar types for existing numeric, boolean and null metadata values when saving.

### Fixed
- Kept nested metadata objects and arrays as native YAML structures through editor save and serialization.
- Retained validation for required metadata objects, version numbers and image-field configuration.

## [1.2.3] - 2026-11-27
### Changed
- Removed generated occurrence numbers from repeated structured-field headings on record cards; every occurrence uses the same label from `@dictionary@`.
- Replaced raw JSON editing for structured values with a visual editor that exposes each occurrence and its nested fields independently.
- Added and removed repeated structured occurrences individually while preserving their order and object boundaries.

### Fixed
- Kept repeated event fields grouped per occurrence during editing and YAML serialization.
- Preserved dictionary labels for nested fields while editing structured values; no synthetic numbered dictionary keys are introduced.

## [1.2.2] - 2026-11-27
- Added reusable dotted dictionary definitions for nested structured fields (for example, `even.date` and `even.plac`). These definitions support labels and descriptions without creating numbered occurrence keys or standalone Add Field options.

### Added
- Added general rules for repeated source tags: repeated leaf tags remain ordered scalar lists, while repeated structured tags become ordered lists of occurrence objects.
- Added separate occurrence groups in record cards, preserving associations such as each event's own date, place and notes.
- Added structured-value JSON editing and YAML round-trip support for nested record data.
- Added a fictional repeated-events sample demonstrating separate residence and general-event occurrences.

### Fixed
- Fixed GEDCOM import so repeated structured tags are no longer flattened into parallel arrays that lose occurrence boundaries.
- Ensured the dictionary contains one entry per unique top-level field plus reusable dotted definitions for nested child paths; it never creates synthetic occurrence keys such as `event_1`, `event_2` or `resi_1`.
- Updated Replace keys to include nested record keys while preserving metadata configuration keys.
- Consolidated legacy numbered `chil_2`/`note_cont_2`-style sample fields into ordered scalar lists and removed their synthetic dictionary entries.
- Corrected YAML quoting for placeholder names and colon-containing text in the GEDCOM sample so the sample is valid YAML.

### Versioning
- Project and specification version: 1.2.2.
- OGF format version: 1.
- Metadata contract version: 3.

## [1.2.1] - 2026-11-27

### Fixed
- Moved gender value presentation labels into `@meta@.gender.labels`; the viewer now uses those labels in record display and editing while preserving stored gender codes.
- Removed gender-specific `sex_values` entries from defaults and samples. Generic dictionary `<field>_values` choices remain supported for non-gender fields.
- Fixed metadata editor handling of array-valued fields such as gender values. Arrays are now kept distinct from objects when displayed, edited and saved, preserving their original YAML data types.
- Fixed portrait image-field configuration to support the documented per-record-type `image_field` mapping, while retaining compatibility with legacy shared string/list values.
- Fixed Replace keys so renamed image fields are also updated inside `@meta@.image_field`, including nested per-record-type mappings and ordered field lists.
- Updated default and sample projects to use the per-record-type image-field mapping.

### Versioning
- Project and specification version: 1.2.1.
- OGF format version: 1.
- Metadata contract version: 3.

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

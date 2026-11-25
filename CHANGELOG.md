# Changelog

Notable changes to the OGF project are recorded here. This is a concise release
log, not a replacement for the specification or Git history.

## 0.1.0-draft — 2026-11-25

- Added explicit OGF format versioning through `@meta@.format_version: 1`.
- Kept metadata contract versioning independent through `@meta@.version: 1`.
- Updated the viewer to report invalid or unsupported explicit format and
  metadata contract versions instead of silently interpreting them as version 1.
- Added the versioning and compatibility policy.
- Updated sample files, GEDCOM import defaults and documentation to declare
  both data-contract versions.
- Retained the specification version `0.1.0-draft`.


## Unreleased — starter project, dictionary and relationship configuration

- Start the viewer with an empty OGF project instead of loading a sample genealogy.
- Initialize default metadata and a curated English field dictionary.
- Add the selected human-readable starter fields to the default dictionary without source-format tag mappings.
- Enumerate `husb`, `wife` and `chil` in the default dictionary; keep relationship behavior in `@meta@.tree.relationships`.
- Flatten imported GEDCOM tag paths into lowercase underscore-separated keys without translating their meaning into the starter dictionary vocabulary.
- Make redundant `FAMS`/`FAMC` removal consult `tree.relationships` and the configured relationship field names.
- Keep Family display driven by metadata configuration rather than a hardcoded relationship fallback.
- Add Repository records and a Repository view.

## Unreleased — source-tag preservation correction

- Remove GEDCOM-to-OGF field mappings from the default dictionary, importer, dictionary editor and documentation.
- Keep the default dictionary as a human-readable set of target OGF fields users can choose to adopt.
- Import GEDCOM tag paths as flattened lowercase keys (for example, `BIRT.DATE` becomes `birt_date`) and add generated labels for those imported keys.
- Keep GEDCOM-specific structural parsing separate from semantic field translation.


### Tree reference navigation rendering
- Tree-node clicks and record references followed from the details card now use the same navigation function. References to records outside the currently rendered subgraph are validated against the full dataset, then selected, re-rooted and rendered using the same path as a node click.

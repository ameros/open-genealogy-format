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

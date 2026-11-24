# Open Genealogy Format (OGF)

OGF is a human-readable, self-describing format for genealogical data. It uses
YAML multi-document files and keeps records, metadata and presentation separate.

The format has an open field vocabulary: applications must preserve fields they
do not recognize. Records are connected by stable identifiers, not by copied
names. Import and display must not silently invent facts or change stored data.

## A small example

```yaml
---
id: "@meta@"
type: Meta
version: 1
language: en
gender_mapping:
  field: sex
  male: M
  female: F
---
id: "@dictionary@"
type: Dictionary

name: Name
birt_date: Birth Date
---
id: "@I1@"
type: Individual
name: Alex Smith
sex: M
birt_date: "25 NOV 1976"
```

`@meta@.version` identifies the metadata contract. Version `1` is the first
stable contract. Shared rules such as `gender_mapping` belong directly in
`@meta@`; view-specific settings belong under their own key, such as
`tree.relationships`.

## Project files

- `index.html` — browser-based OGF viewer.
- `js/` and `css/` — application source.
- `samples/` — example OGF files.

## Documentation

The [OGF specification](specs/SPECIFICATION.md) is the authoritative
description of the format.

| Document | What it covers |
|---|---|
| [Specification](specs/SPECIFICATION.md) | Records, identifiers, metadata, dictionary, dates and presentation rules |
| [GEDCOM import](specs/GEDCOM-IMPORT.md) | How GEDCOM 5.5.1 data is mapped into OGF |
| [Tree view](specs/TREE-VIEW.md) | Tree relationships and tree-specific behavior |
| [Name display](specs/NAME-DISPLAY.md) | Viewer settings for choosing and displaying name variants |

## Licensing

The repository does not use one license for every kind of material.

- The application and source code are covered by the root [LICENSE](LICENSE).
- The format specification and documentation are covered by
  [CC BY-NC 4.0](license/FORMAT-LICENSE.md).
- Third-party components keep their own licenses.

See the [licensing guide](license/README.md) for the full breakdown,
[commercial licensing](license/COMMERCIAL-LICENSING.md), and
[third-party notices](license/THIRD-PARTY-LICENSES.md).

## Core rule

**Keep the data authoritative. Applications may interpret and display it, but
must not silently change its stored values or meaning.**

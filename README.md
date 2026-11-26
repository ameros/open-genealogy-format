# Open Genealogy Format (OGF)

OGF is a human-readable, self-describing format for genealogical data. It uses
YAML multi-document files and keeps records, metadata and presentation separate.

The format has an open field vocabulary: applications must preserve fields they
do not recognize. Records are connected by stable identifiers, not by copied
names. Import and display must not silently invent facts or change stored data.
The dictionary defines useful OGF fields and labels; it does not translate tags
from GEDCOM or other source formats. Importers preserve source tags as flattened
field keys, and users may explicitly rename or reorganize those fields.
The viewer starts with an empty project containing default metadata and a curated
human-readable dictionary; example files are available from the Samples menu.

## A small example

```yaml
---
id: "@meta@"
type: Meta
format_version: 1
version: 1
language: en
gender_mapping:
  field: sex
  male: M
  female: F
---
id: "@dictionary@"
type: Dictionary
name: Full name
birth_date: Date of birth
---
id: "@I1@"
type: Individual
name: Alex Smith
sex: M
birth_date: "25 NOV 1976"
```

`@meta@.format_version` identifies the OGF data-format contract;
`@meta@.version` identifies the metadata contract. Both are independent:
`format_version` is `1` and the metadata contract is `2` in this release.
Shared rules such as `gender_mapping` and `image_field` belong directly in
`@meta@`; tree-specific settings belong under `@meta@.tree`. Record portrait
fields are configured in `@meta@.image_field` and shared by tree nodes and
details cards. See
[versioning and compatibility](VERSIONING.md).

## Project files

- `index.html` — browser-based OGF viewer.
- `js/` and `css/` — application source.
- `samples/` — example OGF files.
- `VERSION.json` — current project and data-contract release manifest.
- `CHANGELOG.md` — notable changes by project release.
- `VERSIONING.md` — versioning and compatibility policy.

Run `node scripts/check-versions.js` before a release to check that the
manifest, specification, viewer, importer defaults and sample declarations agree.

## Documentation

The [OGF specification](specs/SPECIFICATION.md) is the authoritative
description of the format.

| Document | What it covers |
|---|---|
| [Specification](specs/SPECIFICATION.md) | Records, identifiers, metadata, dictionary, dates and presentation rules |
| [GEDCOM import](specs/GEDCOM-IMPORT.md) | How GEDCOM 5.5.1 structures are flattened and preserved during import |
| [Tree view](specs/TREE-VIEW.md) | Tree relationships and tree-specific behavior |
| [Name display](specs/NAME-DISPLAY.md) | Viewer settings for choosing and displaying name variants |

## Licensing

The repository does not use one license for every kind of material.

- The application and source code are covered by the root [LICENSE](LICENSE).
- The format specification and documentation are covered by
  [CC BY-NC 4.0](licensing/FORMAT-LICENSE.md).
- Third-party components keep their own licenses.

See the [licensing guide](licensing/README.md) for the full breakdown,
[commercial licensing](licensing/COMMERCIAL-LICENSING.md), and
[third-party notices](licensing/THIRD-PARTY-LICENSES.md).

## Core rule

**Keep the data authoritative. Applications may interpret and display it, but
must not silently change its stored values or meaning.**

---
The tool is listed @ https://www.cyndislist.com

Here you can add a link to the list: http://www.cyndislist.com/create-a-link-to-cyndis-list/

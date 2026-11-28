# Open Genealogy Format (OGF)

OGF is a human-readable, self-describing format for genealogical data. 

[ _>> You can read it - you can write it <<_ ](docs/WRITING-OGF-YAML.md)

It uses YAML multi-document files and keeps records, metadata and presentation separate.

The format has an open field vocabulary: applications must preserve fields they
do not recognize. Records are connected by stable identifiers, not by copied
names. Import and display must not silently invent facts or change stored data.
The dictionary defines useful OGF fields and labels; it does not translate tags
from GEDCOM or other source formats. The viewer starts with an empty project by
loading reusable defaults from `defaults/meta.yaml` and
`defaults/dictionary.yaml`. These standalone YAML documents can be copied and
adapted for other OGF projects. For a practical introduction, see the
[guide to writing genealogy data by hand](docs/WRITING-OGF-YAML.md).

## A small example

```yaml
---
id: "@meta@"
type: Meta
format_version: 1
version: 1
language: en
gender:
  field: sex
  values: [M, F, U]
  labels: { M: Male, F: Female, U: Unknown }
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
`format_version` is `1` and the metadata contract is `3` in this release.
Shared rules such as `gender` and `image_field` belong directly in
`@meta@`; tree-specific settings belong under `@meta@.tree`. Record portrait
fields are configured in `@meta@.image_field` and shared by tree nodes and
details cards. See
[versioning and compatibility](VERSIONING.md).

## Project files

- `index.html` — browser-based OGF viewer.
- `js/` and `css/` — application source.
- `samples/` — example OGF files, also used as regression-test fixtures.
- `docs/` — practical guides for creating and editing OGF data.
- `articles/` — topic-based Markdown articles rendered in the viewer help.
- `scripts/test-all.sh` — runs date-phrasing and sample-fixture regression checks.
- `defaults/meta.yaml` — reusable starter `@meta@` configuration.
- `defaults/dictionary.yaml` — reusable starter `@dictionary@` vocabulary and labels.
- `VERSION.json` — current project and data-contract release manifest.
- `CHANGELOG.md` — notable changes by project release.
- `VERSIONING.md` — versioning and compatibility policy.

Run `node scripts/check-versions.js` before a release to check that the
manifest, specification, viewer, importer defaults and sample declarations agree.
Run `scripts/test-all.sh` during development to validate the sample YAML fixtures
and regression-test date phrasing. The checks require Node.js, Python 3, and the
PyYAML test dependency. Install the Python dependency once with
`python3 -m pip install -r requirements-test.txt`. If it is missing, the test
runner prints this instruction and exits cleanly.

## Documentation


- [Viewer guide](VIEWER-GUIDE.md) — a short guide to using the OGF viewer.
- [Writing genealogy data by hand](docs/WRITING-OGF-YAML.md) — a practical YAML tutorial.
- [Articles and field notes](articles/README.md) — focused explanations with links to complete sample files.

The [OGF specification](specs/SPECIFICATION.md) is the authoritative
description of the format.

| Document | What it covers |
|---|---|
| [Specification](specs/SPECIFICATION.md) | Records, identifiers, metadata, dictionary, dates and presentation rules |
| [GEDCOM import](specs/GEDCOM-IMPORT.md) | How GEDCOM 5.5.1 hierarchy and repeated occurrences are preserved during import |
| [Tree view](specs/TREE-VIEW.md) | Tree relationships and tree-specific behavior |
| [Name display](specs/NAME-DISPLAY.md) | Viewer settings for choosing and displaying name variants |

## Using the OGF viewer

## Saving and exporting

Use **Save / Export** to choose one of three outputs:

- **OGF YAML** downloads the complete editable project, including records,
  dictionary and metadata.
- **SVG** exports the currently rendered tree as clean vector artwork without
  photographs. It follows the active generation controls and includes only
  the currently displayed nodes and relationships. The complete tree is fitted
  to the selected page independently of the browser's pan and zoom.
- **PDF** opens a dedicated print layout containing the rendered tree and its
  photographs. Use the browser print dialog and choose **Save as PDF**. The
  PDF retains vector tree artwork while the browser loads the same image URLs
  used by the visible tree. Select the same paper size in the print dialog and
  disable browser headers and footers for a clean plotter file.

SVG and PDF support A4, A3, A2, A1 and A0 paper sizes, in landscape or portrait
orientation. The PDF route uses the browser's native print pipeline; it does
not create a PDF download directly. The Save / Export dialog is also available
from the tree toolbar while the full-screen tree workspace is open.


### Printing large family trees

Use **Save / Export → PDF** to open the print layout. Choose a paper size (A4–A0), orientation, and one of two scaling modes:

- **Fit to one page** scales the complete currently rendered tree to a single sheet.
- **Actual size** preserves the tree's native SVG scale (96 CSS pixels per inch). If the tree is larger than the selected sheet, the output is tiled across multiple pages with 10 mm margins. Assemble the sheets after printing.

Choose **Print → Save as PDF** in the browser. For reliable dimensions, use the same paper size and orientation in the print dialog and disable browser headers and footers. SVG export remains available under **Advanced export formats**; it omits photographs and is intended for vector editing or web publishing.

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

_>> You wrote it - you read it <<_

---
The tool is listed @ https://www.cyndislist.com

Here you can add a link to the list: http://www.cyndislist.com/create-a-link-to-cyndis-list/

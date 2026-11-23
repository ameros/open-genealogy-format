# Open Genealogy Format (OGF)

**A flat, human-readable, schema-free YAML format for family trees.**

Open Genealogy Format (OGF) is a modern alternative to legacy GEDCOM files. Instead of rigid 4-letter tags (`INDI`, `FAM`, `BIRT`), deep indentation hierarchies, and slash-wrapped surnames (`/Kowalski/`), OGF stores your entire family tree in a **single, strict multi-document YAML file** (`---`) made of flat, self-describing records.

---

## Why Open Genealogy Format?

| Problem in Legacy GEDCOM | How OGF Solves It |
| :--- | :--- |
| **Locked vocabulary & dropped `_CUSTOM` tags** | **100% open `snake_case` keys.** Invent any field you need (`godmother_id`, `military_unit`, `dna_haplogroup`, `witness_ids`) without breaking compatibility. |
| **Brittle multi-level nesting (`0`, `1`, `2`)** | **Completely flat.** Every record starts at column `0` separated by `---`. No indentation traps and clean Git diffs. |
| **Western-centric name rules (`/Surname/`)** | **Explicit, flat name fields** (`name_first`, `name_maiden`, `name_last`, `patronymic`, `recorded_as`) that handle Polish/Slavic gender inflections and archival spelling shifts naturally. |
| **English-only tags** | **Self-describing `@meta@` and `@dictionary@` cards** define your tree's language, localized UI labels with diacritics (*Imię*, *Mąż*, *Żona*), field grouping, and date phrases right inside the file. |
| **Verbose date strings (`BET 1920 AND 1921`)** | **Compact EDTF dates** (`1895-11~`, `1920..1921`, `"..1900"`) that stay chronologically sortable and expand into localized human badges via `@meta@`. |

---

## Quick Example

An OGF file is a stream of flat YAML documents separated by `---`. Every record uses a collision-proof `"@id@"` pointer (`"@ind_a8f3k@"`, `"@fam_9x2p1@"`) and flat `snake_case` properties:

```yaml
---
id: "@meta@"
type: Meta
language: en
encoding: UTF-8
date_approx: "About {date}"
date_uncertain: "Possibly {date}"
date_range: "Between {start} and {end}"
date_before: "On or before {date}"
date_after: "On or after {date}"
---
id: "@dictionary@"
type: Dictionary

name_first: First Name — Primary given name
name_maiden: Maiden Name — Surname at birth before marriage
name_last: Last Name — Current or primary family surname

birth_date: Birth Date — Date of birth (YYYY-MM-DD, 1895~, 1920..1921)
birth_place: Birth Place — Location of birth

husband_id: Husband — Link to partner 1 in a family unit
wife_id: Wife — Link to partner 2 in a family unit
child_ids: Children — List of links to children in this family
---
id: "@ind_a8f3k@"
type: Individual

name_first: John
name_last: Smith

birth_date: 1890-05-12
birth_place: London
occupation: Watchmaker
---
id: "@ind_c2p7q@"
type: Individual

name_first: Anna
name_maiden: Brown
name_last: Smith

birth_date: 1895-11~
---
id: "@fam_9x2p1@"
type: Family

marriage_date: 1918-06-20
marriage_place: London

husband_id: "@ind_a8f3k@"
wife_id: "@ind_c2p7q@"
```

*(Supports any language natively—see `SPECIFICATION-v5.md` for a full Polish (`language: pl`) example.)*

---

## Core Design Concepts

1. **Zero Schema Lock-In:** Parsers and viewers do not hardcode genealogical fields. Any `snake_case` key is valid and automatically rendered as a readable label.
2. **Self-Describing `@dictionary@`:** Blank-line sections in `@dictionary@` group related fields visually, while `Display Label — Tooltip description` syntax provides rich labels and hover help without restricting custom keys.
3. **Bi-Directional `@id@` Graph:** Any string wrapped in `@...@` (`"@ind_a8f3k@"`) acts as a live link. Viewers automatically infer reverse references (e.g., showing connected `Family` records on each `Individual` card).
4. **Zero-Build Browser Viewer:** Includes a standalone, zero-dependency HTML/JS viewer (`open-genealogy-viewer.html`) designed for large trees (300+ individuals) with instant search, sorting, inline card editing, and local `.yaml` import/export.

---

## Repository Contents

* **`SPECIFICATION-v5.md`** — Full formal specification of the Open Genealogy Format (structure, `@meta@`, `@dictionary@`, ID conventions, EDTF dates, and English/Polish examples).
* **`open-genealogy-viewer.html`** *(formerly `naked-genealogy-viewer-v6.html`)* — Standalone single-file browser viewer and inline editor. Open directly in any modern browser—no server or build tools required.

---

## Getting Started

1. **Explore the Format:** Read `SPECIFICATION-v5.md` to see all rules and examples.
2. **Launch the Viewer:** Download `open-genealogy-viewer.html` and double-click it to open it locally in Chrome, Firefox, Edge, or Safari.
3. **Load or Edit Your Tree:** Switch between the built-in English and Polish sample trees, edit cards inline, or open your own `.yaml` file.

---

## Contributing & Roadmap

Open Genealogy Format is an open, community-driven specification. Contributions, feedback, and companion tools are welcome:

- [ ] Browser-based **GEDCOM (`.ged`) → OGF (`.yaml`)** converter
- [ ] Visual **interactive family tree / pedigree graph** view
- [ ] CLI validator & linter for large `.yaml` family trees
- [ ] Additional localized sample trees and dictionary templates

---

## License

Suggested: [MIT License](https://opensource.org/licenses/MIT) or [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) for the specification.

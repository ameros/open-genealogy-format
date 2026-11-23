# Naked Genealogy Specification (v0.5)

> **A flat, human-readable, strict-YAML data model for genealogy inspired by the Naked Objects pattern.**

---

## 1. Core Design Principles

1. **Zero Nesting (Flat Stream):** Every entity is a top-level YAML document separated by `---`. No deep hierarchies or indentation traps.
2. **Open & Uncompromised Vocabulary:** No fixed tag specification. Authors define any `snake_case` keys they need; the viewer generates labels and UI sections directly from `@dictionary@` and key order.
3. **Self-Describing Metadata (`@meta@` & `@dictionary@`):** File language, localized date-format explanations, field labels, tooltips, and visual groupings live inside the file itself.
4. **Decoupled Graph Links (`"@id@"`):** Entities connect via explicit, collision-proof pointers (`"@ind_a8f3k@"`, `"@fam_9x2p1@"`). Reverse links are inferred automatically.
5. **Order-as-Layout:** Property order inside a YAML document dictates the exact visual order rendered in the Naked Objects UI.

---

## 2. File Structure & Reserved Structural Keys

A tree file is a **UTF-8 multi-document YAML stream** (`---`). Only **two** structural keys are reserved across all records:

| Key | Required | Purpose |
| :--- | :---: | :--- |
| `id` | **Yes** | Unique quoted pointer (`"@ind_a8f3k@"`, `"@fam_9x2p1@"`, `"@meta@"`, `"@dictionary@"`). |
| `type` | **Yes** | Open archetype name (`Meta`, `Dictionary`, `Individual`, `Family`, `Source`, `Place`, etc.). |

All other keys are **100% open** `snake_case` identifiers.

---

## 3. Metadata & Date Format Explanations (`@meta@`)

The optional first document (`id: "@meta@"`) declares the file's primary language and defines how date modifiers are explained in the UI (using `{date}` as a placeholder for the parsed date value).

```yaml
---
id: "@meta@"
type: Meta
language: en
encoding: UTF-8
date_approx: "About {date}"
date_uncertain: "Uncertain {date}"
date_range: "Between {start} and {end}"
date_before: "On or before {date}"
date_after: "On or after {date}"
```

* **`language`:** ISO 639-1 code (`en`, `pl`, `de`, etc.).
* **`date_*` templates:** Customizes the human-readable green badge rendered next to compact EDTF dates in the Naked Objects viewer (e.g., `1895-11~` → `About 1895-11` in English, or `Około 1895-11` in Polish). If omitted, the viewer falls back to sensible defaults in the declared `language`.
* **Multilingual Archival Values:** Append `_<lang>` to any flat key to store original-language records alongside primary values (`occupation_de: Uhrmacher`, `birth_place_la: Cracovia`).

---

## 4. Self-Describing Dictionary (`@dictionary@`)

The optional `@dictionary@` document maps raw `snake_case` keys to human-readable UI labels, tooltips, and visual sections—allowing natural keys in any language without forced prefixes.

### Rules
1. **Label & Tooltip Syntax:** `raw_key: Display Label — Optional tooltip description` (separated by an em-dash ` — ` or ` - `).
2. **Blank-Line Grouping:** Consecutive keys without a blank line form a visual section card in the UI. A blank line starts a new visual group.
3. **Zero Lock-In:** Keys omitted from `@dictionary@` still render cleanly using `raw_key.replace("_", " ")`.

---

## 5. Identifiers & Bi-Directional Graph Links

* **Format:** Quoted `"@<prefix>_<unique_code>@"` (e.g., `"@ind_a8f3k@"`, `"@fam_9x2p1@"`). Never derive IDs from names or dates so corrections never break links.
* **Single & List Links:** Any string matching `^@.+@$` becomes a clickable object link in the UI. Multiple targets use standard YAML lists (`child_ids:`).
* **Automatic Backlinks:** Linking `husband_id: "@ind_a8f3k@"` on `@fam_9x2p1@` automatically exposes `@fam_9x2p1@` on `@ind_a8f3k@`'s card without duplicating data.

---

## 6. Simplified Genealogical Dates (EDTF)

Dates use **ISO 8601-2 (EDTF)** compact notation—valid unquoted YAML (except leading `..`) and naturally chronological when sorted alphabetically:

| Meaning | Compact Value | `@meta@` Key Used | Example Badge Output (`en` / `pl`) |
| :--- | :--- | :--- | :--- |
| Exact date | `1890-05-12` | *(none)* | *(rendered as exact date)* |
| Year / Month | `1895-11` | *(none)* | *(rendered as exact month)* |
| Approximate (`ABT`) | `1895-11~` | `date_approx` | `About 1895-11` / `Około 1895-11` |
| Uncertain (`EST`) | `1895?` | `date_uncertain` | `Uncertain 1895` / `Niepewna data: 1895` |
| Between (`BET`) | `1890..1895` | `date_range` | `Between 1890 and 1895` / `Między 1890 a 1895` |
| Before (`BEF`) | `"..1900"` | `date_before` | `On or before 1900` / `Nie później niż 1900` |
| After (`AFT`) | `1880..` | `date_after` | `On or after 1880` / `Nie wcześniej niż 1880` |

---

## 7. Complete Examples

### Example A: English (`language: en`)

```yaml
---
id: "@meta@"
type: Meta
language: en
encoding: UTF-8
date_approx: "About {date}"
date_uncertain: "Uncertain {date}"
date_range: "Between {start} and {end}"
date_before: "On or before {date}"
date_after: "On or after {date}"
---
id: "@dictionary@"
type: Dictionary

name_first: First Name — Primary given name at birth or baptism
name_middle: Middle Name — Secondary given name(s)
name_maiden: Maiden Name — Surname at birth prior to marriage
name_last: Last Name — Current or primary family surname
name_alias: Alias / Variants — Nicknames or spelling variations in records

birth_date: Birth Date — Date of birth (EDTF format)
birth_place: Birth Place — Town, parish, or region of birth

death_date: Death Date — Date of death (EDTF format)
death_place: Death Place — Location of death or burial

husband_id: Husband — Link to partner 1 in a family unit
wife_id: Wife — Link to partner 2 in a family unit
child_ids: Children — List of links to children in this family
---
id: "@ind_a8f3k@"
type: Individual

name_first: John
name_last: Smith
name_alias:
  - Jack Smith
  - Joannes Faber

birth_date: 1890-05-12
birth_place: Bristol

occupation: Watchmaker
---
id: "@ind_c2p7q@"
type: Individual

name_first: Anna
name_maiden: Taylor
name_last: Smith

birth_date: 1895-11~
birth_place: Bath
---
id: "@fam_9x2p1@"
type: Family

marriage_date: 1918-06-20
marriage_place: Bristol

husband_id: "@ind_a8f3k@"
wife_id: "@ind_c2p7q@"
```

### Example B: Polish (`language: pl`)

```yaml
---
id: "@meta@"
type: Meta
language: pl
encoding: UTF-8
date_approx: "Około {date}"
date_uncertain: "Niepewna data: {date}"
date_range: "Między {start} a {end}"
date_before: "Nie później niż {date}"
date_after: "Nie wcześniej niż {date}"
---
id: "@dictionary@"
type: Dictionary

imie: Imię — Pierwsze imię nadane przy urodzeniu lub chrzcie
drugie_imie: Drugie imię — Kolejne imię nadane przy urodzeniu lub chrzcie
nazwisko_rodowe: Nazwisko rodowe — Nazwisko noszone przed zawarciem małżeństwa
nazwisko: Nazwisko — Obecne lub główne nazwisko
pseudonim: Pseudonim / Warianty — Zdrobnienia lub warianty pisowni w aktach

urodzenie_data: Data urodzenia — Data urodzenia w formacie EDTF
urodzenie_miejsce: Miejsce urodzenia — Miejscowość lub parafia urodzenia

maz_id: Mąż — Odnośnik do męża lub partnera w rodzinie
zona_id: Żona — Odnośnik do żony lub partnerki w rodzinie
dzieci_ids: Dzieci — Lista odnośników do dzieci w rodzinie
---
id: "@ind_a8f3k@"
type: Individual

imie: Jan
nazwisko: Kowalski

urodzenie_data: 1890-05-12
urodzenie_miejsce: Kraków

zawod: Zegarmistrz
---
id: "@ind_c2p7q@"
type: Individual

imie: Anna
nazwisko_rodowe: Zielińska
nazwisko: Kowalska

urodzenie_data: 1895-11~
urodzenie_miejsce: Wieliczka
---
id: "@fam_9x2p1@"
type: Family

slub_data: 1918-06-20
slub_miejsce: Kraków

maz_id: "@ind_a8f3k@"
zona_id: "@ind_c2p7q@"
```

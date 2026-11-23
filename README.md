# Open Genealogy Format (OGF)

A flat, human-readable, self-describing YAML format for genealogical data.

Open Genealogy Format (OGF) is designed to store family-history data in a transparent, portable format that does not depend on a fixed set of genealogical tags or a particular application.

The format separates the data itself from its presentation. Records contain genealogical facts and references; `@meta@` and `@dictionary@` provide language, labels, descriptions and presentation grouping.

## Design principles

- **Flat records:** Each record is a separate YAML document, separated by `---`.
- **Open vocabulary:** Applications must not require a fixed list of genealogical fields.
- **Preservation:** Imported values should not be silently rewritten, inferred or discarded.
- **Stable references:** Records are connected using explicit identifiers.
- **Self-description:** Field labels, descriptions and grouping are stored in the data file.
- **Presentation independence:** Display choices must not alter the underlying genealogical data.
- **Interoperability:** GEDCOM data can be imported without requiring OGF to adopt GEDCOM's hierarchical structure.

## File structure

An OGF file is a UTF-8 YAML multi-document stream.

The principal document types are:

| Document | Purpose |
|---|---|
| `@meta@` | Language and presentation metadata |
| `@dictionary@` | Field labels, descriptions and field grouping |
| `Individual` | Information about a person |
| `Family` | Information about a family or partnership |
| `Source` | Information about a genealogical source |

The `type` field is extensible. The current OGF viewer provides dedicated cards for Individuals, Families and Sources.

Example:

```yaml
---
id: "@meta@"
type: Meta
language: en
encoding: UTF-8
---
id: "@dictionary@"
type: Dictionary

name: Name — Name as recorded or represented in the data
birt_date: Birth Date — Date of birth
birt_plac: Birth Place — Place of birth

husb: Husband — Reference to an Individual
wife: Wife — Reference to an Individual
---
id: "@I1@"
type: Individual

name: John Smith
birt_date: "25 NOV 1976"
birt_plac: London
---
id: "@F1@"
type: Family

husb: "@I1@"
```

## Identifiers and references

Every record has a unique `id`.

Examples:

- `@I1@` — Individual
- `@F1@` — Family
- `@S1@` — Source
- `@meta@` — metadata
- `@dictionary@` — dictionary

Identifiers imported from GEDCOM are preserved exactly.

A reference to another record uses its identifier as a value. References are not replaced with names or other derived values.

The viewer can resolve references and display reverse links without requiring redundant data to be stored.

## Fields and dictionary

OGF does not impose a closed vocabulary of field names.

The `@dictionary@` document describes fields using:

```yaml
field_key: Display Label — Optional description
```

For example:

```yaml
birt_date: Birth Date — Date of birth
birt_plac: Birth Place — Place of birth
```

Blank lines in the dictionary separate groups of fields.

The dictionary is the source of available fields in the viewer's Add Field workflow:

1. Define a field in the editable dictionary.
2. Save the dictionary.
3. Select the field from Add Field.
4. The new field is added to the record with an empty value.

Removing a dictionary entry must not silently delete existing record data.

Unknown or custom fields remain valid even when they are not described in the dictionary.

## Dates

OGF supports both:

- GEDCOM-style date expressions, such as `25 NOV 1976`, `ABT 1890` and `BET 1900 AND 1905`.
- EDTF date expressions, such as `1976-11-25`, `1890~` and `1900..1905`.

The stored value is preserved in its original notation.

GEDCOM dates must not be automatically converted to EDTF during import. Applications may interpret supported date expressions for sorting, filtering, searching and display, but interpretation must not overwrite the stored value.

See `SPECIFICATION.md` for the date model and `gedcom-import-rules.md` for import-specific requirements.

## GEDCOM import

The importer maps GEDCOM records to OGF records:

| GEDCOM | OGF |
|---|---|
| `INDI` | `Individual` |
| `FAM` | `Family` |
| `SOUR` | `Source` |

GEDCOM tag paths are flattened into lowercase underscore-separated field names.

For example:

- `BIRT.DATE` becomes `birt_date`.
- `BIRT.PLAC` becomes `birt_plac`.
- `BIRT.PLAC.MAP.LATI` becomes `birt_plac_map_lati`.

Original identifiers, relationship references and source values are preserved.

The importer does not infer missing facts or create genealogical relationships that are not present in the source data.

See `gedcom-import-rules.md`.

## Viewer capabilities

The browser viewer provides:

- YAML import and export.
- GEDCOM import.
- Individual, Family and Source cards.
- Search and sorting.
- Editing of record fields.
- Dictionary editing and field selection.
- Internal links between records.
- Reverse-reference display.
- URL link detection.
- Google Maps links for recognized coordinate pairs.
- Image display from GEDCOM media references.
- Reordering, merging and splitting field groups.

Presentation operations must not modify field names or values.

Blank lines in a record define visual groups. Moving, merging or splitting groups changes only field order and blank-line placement.

Images and map links are presentation features. They must not replace or destructively modify the original stored values.

## Name variants and contextual display

A person may have multiple historically valid names, including birth, adopted and married names.

OGF should preserve these values without assuming that a surname changed because of a marriage.

The intended display model allows different name variants to be selected in different contexts, such as:

- An Individual card.
- A general reference to an Individual.
- A particular Family card.

The exact metadata schema for contextual display profiles is not yet finalized.

## Documentation

- `README.md` — project overview and introduction.
- `SPECIFICATION.md` — formal OGF data specification.
- `gedcom-import-rules.md` — detailed GEDCOM import requirements.

## Core rule

**The data is authoritative. The viewer may interpret and present it, but must not silently change its meaning or stored representation.**
# Open Genealogy Format (OGF)

A flat, human-readable, self-describing YAML format for genealogical data.

Open Genealogy Format (OGF) is designed to store family-history data in a transparent, portable format that does not depend on a fixed set of genealogical tags or a particular application.

The format separates the data itself from its presentation. Records contain genealogical facts and references; `@meta@` defines the versioned contract between incoming data and renderer behavior, while `@dictionary@` provides labels, descriptions and presentation grouping.

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
individual_display_field: name
family_display_field: "{$wife.name_givn} & {$husb.name}"
date_approx: "About {date}"
date_uncertain: "Possibly {date}"
date_range: "Between {start} and {end}"
date_before: "On or before {date}"
date_after: "On or after {date}"
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
- Experimental OGF-native tree view, configured through optional `tree.relationships` metadata.

Presentation operations must not modify field names or values.

Blank lines in a record define visual groups. Moving, merging or splitting groups changes only field order and blank-line placement.

Images and map links are presentation features. They must not replace or destructively modify the original stored values.

## Name variants and contextual display

A person may have multiple historically valid names, including birth, adopted and married names.

OGF should preserve these values without assuming that a surname changed because of a marriage.

The `@meta@` document defines the metadata contract between the data file and applications that interpret or render it. Its `version` property identifies the contract version (the first stable contract is `1`). Shared interpretation rules such as `gender_mapping` live at the top level of `@meta@` and can be reused by different renderers. Renderer-specific settings, such as `tree.relationships`, remain under their renderer namespace.

The `@meta@` document can also select which stored fields an application uses when presenting Individuals and Families. These settings affect presentation only; they do not change record values or relationship references.

### Display metadata

Two optional `@meta@` properties are defined:

| Property | Purpose |
|---|---|
| `individual_display_field` | Selects the title displayed on Individual cards and the text used for links to Individual records. |
| `family_display_field` | Selects the title displayed on Family cards and the text used for links to Family records. |

Each property accepts either a field key or a quoted display template.

**A single field key** is the shortest form:

```yaml
individual_display_field: name
```

**A template** can combine fields from the current record:

```yaml
individual_display_field: "{given_name} {family_name}"
```

Use `{field_key}` for a field on the record whose title is being generated.
Use `{$reference_key.field_key}` to follow a reference stored on that record and read a field from the referenced record. Literal text between placeholders is preserved:

```yaml
family_display_field: "{$wife_id.name_given} & {$husband_id.name}"
```

The reference field must contain a record identifier, and the referenced record must contain the requested field. Quote template values in YAML.

If a placeholder cannot be resolved, it contributes no text. If the complete template produces no usable title, the viewer falls back to its normal title logic. The settings do not require corresponding entries in `@dictionary@`: the dictionary supplies labels and descriptions, while display metadata selects stored values.

Applications must keep the underlying fields and references unchanged. They must not infer a name variant from marriage, adoption or another relationship. The selected display text is derived presentation data only.

The current viewer uses the Individual setting for links whose target record is an Individual, and the Family setting for links whose target record is a Family. This includes ordinary record links and incoming “Referenced In” links.

## Documentation

- `README.md` — project overview and introduction.
- `SPECIFICATION.md` — formal OGF data specification.
- `gedcom-import-rules.md` — detailed GEDCOM import requirements.
- `TREE-VIEW.md` — experimental tree-view relationship configuration and behavior.

## Core rule

**The data is authoritative. The viewer may interpret and present it, but must not silently change its meaning or stored representation.**

## Licensing

OGF distinguishes between the format specification and the software that implements it. They are licensed separately.

### OGF format specification and documentation

The Open Genealogy Format (OGF) specification and its accompanying documentation are licensed under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.

You may share and adapt the specification and documentation for non-commercial purposes, provided you give appropriate attribution and comply with the license terms.

See [FORMAT-LICENSE.md](FORMAT-LICENSE.md) and the [full CC BY-NC 4.0 license](https://creativecommons.org/licenses/by-nc/4.0/).

Suggested attribution:

"Open Genealogy Format (OGF) specification by Michał Amerek, licensed under CC BY-NC 4.0."

### OGF software and source code

The OGF application and source code are licensed under the **PolyForm Noncommercial License 1.0.0**.

Use, modification and distribution are permitted only for purposes allowed by that license. Commercial use requires separate written permission from the copyright holder. This includes internal business use by commercial companies.

See [LICENSE](LICENSE) and [COMMERCIAL-LICENSING.md](COMMERCIAL-LICENSING.md).

### Third-party components and genealogical data

Third-party dependencies remain subject to their respective licenses. See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).

User-provided genealogical data is not relicensed by either of the above notices. Its ownership and applicable terms remain with the relevant data owners.

### Shared gender mapping

The optional `@meta@.gender_mapping` object defines the exact field and values
used to classify an Individual record as male or female. It is independent of
the tree renderer and can be reused by data cards and other presentation
features:

```yaml
gender_mapping:
  field: sex
  male: M
  female: F
```

Applications match the configured values exactly. Missing or unrecognized
values remain unknown; applications do not infer gender or change stored data.
See [SPECIFICATION.md](SPECIFICATION.md#72-shared-gender-mapping) for the
contract and [TREE-VIEW.md](TREE-VIEW.md) for tree-specific configuration.

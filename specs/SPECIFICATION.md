# Open Genealogy Format — Specification

**Status:** Revised draft  
**Version:** Not yet assigned

## 1. Purpose

Open Genealogy Format (OGF) is a flat, human-readable, self-describing format for genealogical data.

It uses YAML multi-document streams to store records, references, metadata and field descriptions.

OGF separates:

1. Stored genealogical data.
2. Metadata describing the data.
3. Presentation and interpretation performed by applications.

An application must not silently change stored data when presenting or interpreting it.

## 2. Core principles
### 2.1 Flat records

Every record is a top-level YAML document separated by `---`.

Records must not require a fixed hierarchical genealogical structure.

### 2.2 Open vocabulary

Only `id` and `type` are reserved structural keys.

All other field names are open identifiers, conventionally written in lowercase `snake_case`.

Applications must preserve unknown fields.

### 2.3 Data preservation

Applications must not silently:

- Infer missing facts.
- Invent relationships.
- Translate values.
- Normalize original source values destructively.
- Discard unknown fields.
- Replace references with display names.

### 2.4 Presentation independence

A viewer may derive labels, links, images, map links and interpreted dates for display.

These derived elements must not overwrite the original stored values.

## 3. File structure

An OGF file is a UTF-8 YAML multi-document stream.

Each document represents one record.

A record has two required structural fields:

| Field | Requirement | Meaning |
|---|---|---|
| `id` | Required | Unique record identifier |
| `type` | Required | Record type |

Example:

```yaml
---
id: "@I1@"
type: Individual

name: John Smith
birt_date: "25 NOV 1976"
---
id: "@F1@"
type: Family

husb: "@I1@"
```

YAML lists may be used where a field contains multiple values.

## 4. Record types

The OGF type system is extensible.

The current viewer provides dedicated card interfaces for:

- `Individual`
- `Family`
- `Source`

Other record types are not currently assigned dedicated card interfaces.

### 4.1 Individual

Represents a person.

Example:

```yaml
---
id: "@I1@"
type: Individual

name: John Smith
birt_date: "25 NOV 1976"
birt_plac: London
```

### 4.2 Family

Represents a family or partnership and its relationships.

Example:

```yaml
---
id: "@F1@"
type: Family

husb: "@I1@"
wife: "@I2@"
chil:
  - "@I3@"
```

Field names are not mandatory globally. The dictionary defines their labels.

### 4.3 Source

Represents a genealogical source.

Example:

```yaml
---
id: "@S1@"
type: Source

titl: Parish Register
auth: St Mary's Parish
publ: London
```

Source identifiers and references must be preserved.

## 5. Identifiers and references
### 5.1 Identifiers

Every record must have a unique identifier.

Identifiers are strings and must be treated as opaque values.

Examples:

- `@I1@`
- `@F1@`
- `@S1@`
- `@meta@`
- `@dictionary@`

An importer must preserve source identifiers exactly when importing them.

It must not strip delimiters, renumber records or derive identifiers from names or dates.

### 5.2 References

A reference is a field value containing a record identifier.

References must remain references. They must not be replaced by a person's name or another presentation value.

A viewer may resolve references and display clickable links.

### 5.3 Reverse references

A viewer may calculate reverse references by inspecting existing records.

Reverse references are presentation-derived and do not require duplicate stored fields.

A reverse reference must not be mistaken for an independently stored genealogical assertion.

## 6. Field names and flattening

OGF field names are open.

For imported GEDCOM data, hierarchical tag paths are represented by joining lowercase tag names with underscores.

Examples:

| GEDCOM path | OGF key |
|---|---|
| `NAME` | `name` |
| `NAME.GIVN` | `name_givn` |
| `NAME.SURN` | `name_surn` |
| `BIRT.DATE` | `birt_date` |
| `BIRT.PLAC` | `birt_plac` |
| `BIRT.PLAC.MAP.LATI` | `birt_plac_map_lati` |
| `_MARNM` | `_marnm` |

GEDCOM tag names must not be semantically translated.
A tag such as `BIRT` becomes `birt`, not `birth`.

Leading underscores in extension tags must be preserved.

Repeated tags must not overwrite earlier values. A deterministic suffix may be appended, for example `_2`, `_3`.

## 7. Metadata: `@meta@`

The optional `@meta@` document describes the metadata contract between an OGF
data file and applications that interpret or render it. It contains file-level
metadata, shared data-interpretation mappings, and renderer-specific settings.

The `version` property versions this metadata contract. It does not version the
OGF application, individual records, or the specification document itself.

Example:

```yaml
---
id: "@meta@"
type: Meta
version: 1
language: en
encoding: UTF-8
individual_display_field: name
family_display_field: "{$wife.name_givn} & {$husb.name}"
date_approx: "About {date}"
date_uncertain: "Possibly {date}"
date_range: "Between {start} and {end}"
date_before: "On or before {date}"
date_after: "On or after {date}"
```

The `language` field identifies the primary language used for presentation.

The viewer's standard metadata defaults are:

| Property | Default example | Purpose |
|---|---|---|
| `language` | `en` | Primary presentation language |
| `encoding` | `UTF-8` | Text encoding declaration |
| `individual_display_field` | `name` | Individual card and link title |
| `family_display_field` | `{$wife.name_givn} & {$husb.name}` | Family card and link title |
| `date_approx` | `About {date}` | Approximate-date description |
| `date_uncertain` | `Possibly {date}` | Uncertain-date description |
| `date_range` | `Between {start} and {end}` | Date-range description |
| `date_before` | `On or before {date}` | Open-ended date ending |
| `date_after` | `On or after {date}` | Open-ended date beginning |

These are optional conventions, not mandatory schema properties. Applications may use built-in defaults when a property is absent. Samples should include the complete set so that their intended display behavior is explicit. Localized samples may translate the date-description templates and use display fields appropriate to their own dictionary keys.

Metadata must not be used to rewrite record values.

### 7.1 Metadata contract version

`@meta@.version` is a positive integer identifying the contract used by the
metadata document.

- Version `1` is the first stable metadata contract.
- A change that breaks compatibility with existing metadata or changes the
  meaning of an existing property requires a new contract version.
- Adding an optional property that older applications can safely ignore does
  not, by itself, require a version increment.
- An application must not silently interpret an explicitly unsupported
  metadata version as version 1. It must report that the version is unsupported.
- A missing `version` property identifies an unversioned/legacy metadata
  document. Applications may retain legacy compatibility behavior, but new
  files and first-release examples should always include `version: 1`.

The metadata contract describes how incoming data is interpreted and how
applications should behave when presenting it. Shared interpretation settings
belong directly in `@meta@`; renderer-specific settings belong under a
renderer-specific namespace.

### 7.2 Shared gender mapping

The optional `gender_mapping` object defines how an application interprets a
field on an Individual record as male or female. It is a shared data
interpretation rule, not a tree-view setting, and may be reused by any renderer
or feature that needs this classification (including data cards).

```yaml
gender_mapping:
  field: sex
  male: M
  female: F
```

- `field` is the exact Individual record field to read.
- `male` is the exact stored value that represents male.
- `female` is the exact stored value that represents female.
- Matching is exact; applications must not guess field names, translate values,
  or infer gender from names, relationships, or other data.
- A missing field, missing value, or value matching neither configured value
  must be treated as unknown/unclassified.
- Applications must not modify the original record value.
- The mapping is optional. Without it, gender classification is unknown.

For example, a dataset using `gender: male/female` may declare:

```yaml
gender_mapping:
  field: gender
  male: male
  female: female
```

### 7.3 Tree relationship mapping

An application may use the optional `tree.relationships` object in `@meta@` to
configure how a tree view reads relationships from Family records. This is
renderer-specific presentation configuration, not a required OGF vocabulary or
a new relationship assertion.

```yaml
tree:
  relationships:
    individual_type: Individual
    family_type: Family
    family:
      partner_fields:
        - husb
        - wife
      child_fields:
        - chil
```

- `individual_type` identifies the record type used for people.
- `family_type` identifies the record type used for family/partnership records.
- `family.partner_fields` lists Family fields containing references to Individual records.
- `family.child_fields` lists Family fields containing references to child Individual records.
- A configured field may contain a single reference or a list of references.
- Field names are examples only; OGF does not reserve `husb`, `wife` or `chil`.

A viewer must not infer relationships from field names or reverse references
when no mapping is supplied. It must preserve the underlying record values and
references. Unresolved references may be reported by the viewer, but must not
be guessed or silently replaced. See [TREE-VIEW.md](TREE-VIEW.md) for the current
viewer behavior.

### 7.4 Contextual display metadata

The `@meta@` document may define the following optional properties:

| Property | Applies to | Purpose |
|---|---|---|
| `individual_display_field` | `Individual` | Selects the title shown on an Individual card and the text used when a link targets an Individual record. |
| `family_display_field` | `Family` | Selects the title shown on a Family card and the text used when a link targets a Family record. |

These properties configure presentation. They do not create, modify or replace genealogical facts, record identifiers or relationship references.

#### 7.4.1 Field-key form

A property may contain a bare field key. The application reads that field from the record whose display title is being generated:

```yaml
individual_display_field: name
```

This is shorthand for selecting one field; it is not a new record field.

#### 7.4.2 Template form

A property may instead contain a string template with one or more placeholders. Template values should be quoted in YAML.

`{field_key}` reads a field from the current record:

```yaml
individual_display_field: "{given_name} {family_name}"
```

`{$reference_key.field_key}` follows a reference field on the current record, then reads the named field from the referenced record:

```yaml
family_display_field: "{$wife_id.name_given} & {$husband_id.name}"
```

The reference field must contain a single record identifier. The referenced record must exist and contain the requested field. Literal text between placeholders, such as the ampersand and spaces in the example, is retained.

This syntax addresses one reference hop and one field on the target record; it does not define arbitrary nested object traversal or chained references.

#### 7.4.3 Resolution and fallback

An unresolved placeholder contributes an empty string. If the complete expression produces no usable display text, the current viewer falls back to its normal title-generation behavior for that record type.

Applications should provide a readable fallback when a configured key, reference or target field is missing. A missing display value must not cause the record itself or its original reference to be removed.

#### 7.4.4 Use in links

When a viewer renders a link to an `Individual`, it should use the resolved `individual_display_field` value as the link text. For a link to a `Family`, it should use `family_display_field`. The same target-type rule applies to reverse-reference labels. A viewer may use its normal title-generation behavior when the corresponding property is absent or cannot produce text.

The `@dictionary@` is not required to contain entries for these metadata properties or for the fields they select. The dictionary describes field labels, descriptions and grouping; display metadata selects values for presentation.

#### 7.4.5 Preservation

Display metadata must never replace stored names with derived strings, rewrite relationship identifiers, or infer a name from a spouse or family context. Changing a display property changes presentation only.

## 8. Dictionary: `@dictionary@`

The optional `@dictionary@` document defines field labels, descriptions and grouping.

Example:

```yaml
---
id: "@dictionary@"
type: Dictionary

name: Name — Name as recorded
birt_date: Birth Date — Date of birth
birt_plac: Birth Place — Place of birth

deat_date: Death Date — Date of death
deat_plac: Death Place — Place of death
```

### 8.1 Entry syntax

The general form is:

```yaml
field_key: Display Label — Optional description
```

### 8.2 Grouping

Blank lines separate groups of fields.

The viewer may use these groups in the card layout and field-selection interface.

### 8.3 Unknown fields

Fields not present in the dictionary remain valid.

A viewer may generate a readable label from the key, but must not invent a semantic description.

### 8.4 Adding fields

The dictionary is the authoritative list of fields available in the Add Field interface.

Custom fields must be defined in the dictionary before they can be added to a record through that interface.

Adding a field creates it with an empty value.

Removing a dictionary entry must not delete existing record data.

### 8.5 Key renaming

Renaming a field must keep dictionary keys and record keys synchronized.

A rename must not silently overwrite another field. If a collision occurs, the application must report it and require an explicit resolution. Automatic merging of values is not defined.

## 9. Dates

OGF supports two date notations:

1. GEDCOM-style date expressions.
2. EDTF date expressions.

Both are valid stored representations.

### 9.1 GEDCOM-style dates

Examples:

```yaml
birt_date: "25 NOV 1975"
birt_date: "NOV 1975"
birt_date: "1975"
birt_date: "ABT 1975"
birt_date: "BEF 1976"
birt_date: "BET 1975 AND 1976"
birt_date: "FROM 1975 TO 1976"
```

### 9.2 EDTF dates

Examples:

```yaml
birt_date: "1975-11-25"
birt_date: "1975-11"
birt_date: "1975"
birt_date: "1975~"
birt_date: "1975?"
birt_date: "1975..1976"
```

### 9.3 Preservation

An application must preserve the original stored date expression.

GEDCOM dates imported from a GEDCOM file must remain in their original GEDCOM notation.

An importer must not convert them automatically into EDTF.

An application may parse either notation for:

- Chronological sorting.
- Filtering.
- Search.
- Timeline display.
- Human-readable presentation.

Such parsing is interpretation, not conversion of the stored value.

### 9.4 Ambiguous and unsupported dates

Unknown, ambiguous or unsupported expressions must be preserved.

An application must not guess a date or silently replace an expression it cannot interpret.

### 9.5 Qualifiers

GEDCOM qualifiers such as `ABT`, `CAL`, `EST`, `BEF` and `AFT` must not be treated as interchangeable with EDTF qualifiers such as `~`, `?` or `%`.

Any interpretation mapping must be explicit and must not alter the original stored expression.

## 10. Presentation and grouping
### 10.1 Field order

The order of fields in a record determines their order in the viewer.

### 10.2 Visual groups

Blank lines in a record separate visual groups of fields.

Example:

```yaml
name: John Smith
sex: M

birt_date: "25 NOV 1976"
birt_plac: London

deat_date: "2020"
```

### 10.3 Group editing

The viewer may allow users to:

- Move groups up or down.
- Merge adjacent groups.
- Split a group at a selected field.

These operations must change only field order and blank-line placement.

They must not modify field names or values.

### 10.4 Field descriptions

The viewer may display dictionary descriptions as contextual help next to field labels.

Help indicators and editing controls are presentation elements only.

## 11. Links, URLs and places
### 11.1 Internal references

A viewer may detect record identifiers wherever they occur in a field value, including mixed text and list values.

Recognized identifiers may be rendered as clickable links.

Unresolved identifiers must remain visible and must not be silently removed.

### 11.2 URLs

Recognized `http://`, `https://` and `www.` addresses may be rendered as links.

The original stored text must remain unchanged.

### 11.3 Coordinates

A viewer may recognize matching latitude and longitude fields, including flattened GEDCOM paths such as:

- `birt_plac_map_lati`
- `birt_plac_map_long`
- `deat_plac_map_lati`
- `deat_plac_map_long`

It may render a Google Maps link near the corresponding place information.

The link is derived presentation data. The stored coordinates must remain unchanged.

## 12. Images and media

Image references may be stored in fields such as `obje_file`.

A viewer may display the first usable image as a record portrait.

The image may be shown above or alongside the record fields, according to the viewer's layout.

The original media reference must remain available in the record.

The same portrait image must not be redundantly rendered again as a second image inside its ordinary field row.

For local media paths, a browser application may require the user to select the media directory. It must not assume that a local path is a publicly accessible URL.

If an image cannot be resolved or loaded, the record must remain usable and must not display a broken-image placeholder.

## 13. Name variants and contextual display

OGF must preserve all stored name values.

The format does not assume that a person's surname changes as a result of marriage.

Applications may use the optional `individual_display_field` and `family_display_field` properties in `@meta@` to select display values for Individual and Family records. These properties are defined in section 7.1.

Applications must not infer a name variant from a spouse or family relationship.

The selected display value is a presentation result. It must not overwrite the original name fields or any other stored data. Relationship references must remain identifiers, even when a viewer displays a person's selected name as the link text.

## 14. Import and interoperability

The importer must preserve original identifiers, source values, references
and unknown fields to the extent supported by the parser. It must not infer
missing facts or silently normalize source data.

See [GEDCOM-IMPORT.md](GEDCOM-IMPORT.md) for the detailed GEDCOM 5.5.1 rules.

## 15. Conformance principle

When in doubt, preserve the original value.

A viewer may interpret, link, format or present data, but must not silently rewrite the underlying genealogical record.

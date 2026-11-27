# Open Genealogy Format — Specification

**Status:** Stable release  
**Version:** 1.2.0

## 1. Purpose

Open Genealogy Format (OGF) is a flat, human-readable, self-describing format for genealogical data.

It uses YAML multi-document streams to store records, references, metadata and field descriptions.

The specification version identifies this document revision. It is independent of
`@meta@.format_version`, which identifies the OGF data format, and
`@meta@.version`, which identifies the metadata contract used by an OGF data file.
The project release, specification, format, and metadata contract have separate
versioning rules. See [VERSIONING.md](../VERSIONING.md).

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
birth_date: "25 NOV 1976"
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
- `Repository`

The record type vocabulary remains extensible.

### 4.1 Individual

Represents a person.

Example:

```yaml
---
id: "@I1@"
type: Individual

name: John Smith
birth_date: "25 NOV 1976"
birth_place: London
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

source_title: Parish Register
source_text: Parish register entry transcript
```

Source identifiers and references must be preserved.

### 4.4 Repository

Represents an institution or other repository that holds a source.

Example:

```yaml
---
id: "@R1@"
type: Repository

repository_name: City Archives
repository_website: https://example.org/archive
```

Repository records may be referenced by Source records. A viewer should preserve
those references and may render them as navigable links.

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

New records created by an OGF application should use readable, type-prefixed
identifiers: `I-1`, `I-2`, ... for Individuals; `F-1`, `F-2`, ... for Families;
`S-1`, `S-2`, ... for Sources; and `R-1`, `R-2`, ... for Repositories. Counters
are independent per record type. Applications should initialize counters from the highest matching identifier
already present. Implementations may keep allocation counters in memory while
the project is open; counters are application runtime bookkeeping and are not
part of the OGF project data or user-configurable `@meta@` configuration.
Existing identifiers, including GEDCOM xrefs and identifiers that do not
follow this convention, must never be rewritten. When importing data,
applications must preserve imported identifiers and references exactly and
advance the relevant counter past any matching OGF-style identifiers.


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

Importers may flatten hierarchical source structures into field keys. They must
not silently translate source tags into a different OGF vocabulary. The field
dictionary defines useful OGF fields and labels, but it is not a source-format
mapping table. A user may rename imported fields explicitly.

Examples of source-tag flattening:

| GEDCOM path | OGF key |
|---|---|
| `NAME` | `name` |
| `NAME.GIVN` | `name_givn` |
| `NAME.SURN` | `name_surn` |
| `BIRT.DATE` | `birt_date` |
| `BIRT.PLAC` | `birt_plac` |
| `BIRT.PLAC.MAP.LATI` | `birt_plac_map_lati` |
| `_MARNM` | `_marnm` |

The importer does not translate these source-derived keys into the human-readable
starter fields such as `birth_date` or `marriage_date`. Those fields are available
in the dictionary for users to adopt through an explicit rename or editing step.
Unknown paths remain available and must not be discarded. Leading underscores
in extension tags must be preserved.

Repeated occurrences of the same flattened key are stored as an ordered YAML list under that one key. They must not generate numbered synthetic keys such as `_2` or `_3`.

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
format_version: 1
version: 1
language: en
encoding: UTF-8
individual_display_field: name
family_display_field: "{$wife.name} & {$husb.name}"
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
| `family_display_field` | `{$wife.name} & {$husb.name}` | Family card and link title |
| `date_approx` | `About {date}` | Approximate-date description |
| `date_uncertain` | `Possibly {date}` | Uncertain-date description |
| `date_range` | `Between {start} and {end}` | Date-range description |
| `date_before` | `On or before {date}` | Open-ended date ending |
| `date_after` | `On or after {date}` | Open-ended date beginning |

These are optional conventions, not mandatory schema properties. Applications may use built-in defaults when a property is absent. Samples should include the complete set so that their intended display behavior is explicit. Localized samples may translate the date-description templates and use display fields appropriate to their own dictionary keys.

Metadata must not be used to rewrite record values.

### 7.1 OGF format version

`@meta@.format_version` is a positive integer identifying the OGF data-format
contract used by the file. It covers the structure and meaning of OGF records,
identifiers, references, and other format-level rules. It does not identify a
viewer release or a renderer implementation.

- Version `1` is the first OGF format contract.
- A change that makes existing OGF data structurally or semantically
  incompatible requires a new format version.
- Compatible additions that older applications can safely preserve and ignore
  do not, by themselves, require a version increment.
- An application must not silently interpret an explicitly unsupported format
  version as version 1. It must report that the version is unsupported.
- A missing `format_version` identifies an unversioned/legacy file. Applications
  may retain legacy compatibility behavior, but new files and samples should
  include `format_version: 1`.

### 7.2 Metadata contract version

`@meta@.version` is a positive integer identifying the contract used by the
metadata document. It versions metadata interpretation, not the OGF record
format, application, or specification document.

- Version `1` is the first stable metadata contract.
- Version `3` defines the unified `gender` configuration. Readers should continue to accept metadata contract versions 1 and 2 where supported; legacy `gender_mapping` remains readable.
- A change that breaks compatibility with existing metadata or changes the
  meaning of an existing property requires a new contract version.
- Adding an optional property that older applications can safely ignore does
  not, by itself, require a version increment.
- An application must not silently interpret an explicitly unsupported
  metadata version as version 1. It must report that the version is unsupported.
- A missing `version` property identifies an unversioned/legacy metadata
  document. Applications may retain legacy compatibility behavior, but new
  files and first-release examples should always include `version: 1`.

The format version and metadata contract version are independent. An OGF file
may use format version 1 and metadata contract version 3, provided the
application supports both. An application should report the compatibility of
each contract separately. It must not silently downgrade either version.

### 7.3 Shared gender configuration

The optional `gender` object defines how an application interprets a configured
record field. It is shared metadata and may be used by tree rendering, record
cards and other features that need gender classification.

```yaml
gender:
  field: sex
  values:
    - M
    - F
    - U
  male: M
  female: F
```

- `field` is the exact record field to read.
- `values` lists the values recognized by the project. It may include values
  beyond male and female, such as unknown or project-specific classifications.
- `male` and `female` identify the exact values representing those categories;
  when present, each must also occur in `values`.
- Matching is exact. Applications must not guess field names, translate values,
  or infer gender from names, relationships or other data.
- A missing field, missing value or value not matching `male` or `female` is
  unclassified. Values outside `values` must be preserved in the record and
  treated as unclassified.
- Applications must not modify the original record value.

For backward compatibility, readers should continue to recognize the legacy
`gender_mapping` object (`field`, `male`, `female`). New files should use
`gender`. If both are present, `gender` takes precedence.

### 7.4 Tree configuration

An application may use the optional `tree` object in `@meta@` to configure how
the tree view identifies record types, reads Family relationships and displays
event fields. This is renderer-specific presentation configuration, not a
required OGF vocabulary or a new relationship assertion.

```yaml
tree:
  individual_type: Individual
  family_type: Family
  individual:
    birth:
      date: birth_date
      place: birth_place
    death:
      date: death_date
      place: death_place
    burial:
      date: burial_date
      place: burial_place
  family:
    partners:
      - husb
      - wife
    children:
      - chil
    marriage:
      date: marriage_date
      place: marriage_place
    divorce:
      date: divorce_date
```

- `individual_type` and `family_type` identify the record types rendered by
  the tree.
- `family.partners` lists Family fields containing references to Individual
  records.
- `family.children` lists Family fields containing references to child
  Individual records.
- `individual.birth`, `individual.death` and `individual.burial` configure the
  date and place fields displayed on Individual nodes.
- `family.marriage` configures the date and place fields displayed on Family
  nodes.
- `family.divorce.date` configures the optional divorce date field displayed
  on Family nodes.
- A configured relationship field may contain a single reference or a list of
  references.
- Field names are open identifiers; the tree renderer uses configured keys
  and does not infer event meaning from field names or language.

Portrait image fields are configured separately through `@meta@.image_field`;
the mapping is shared by details cards and tree nodes. A viewer must not infer
an image field from its name. See section 12.

A viewer must not infer relationships from field names or reverse references
when no mapping is supplied. It must preserve the underlying record values and
references. Unresolved references may be reported by the viewer, but must not
be guessed or silently replaced. See [TREE-VIEW.md](TREE-VIEW.md) for the current
viewer behavior.

### 7.5 Contextual display metadata

The `@meta@` document may define the following optional properties:

| Property | Applies to | Purpose |
|---|---|---|
| `individual_display_field` | `Individual` | Selects the title shown on an Individual card and the text used when a link targets an Individual record. |
| `family_display_field` | `Family` | Selects the title shown on a Family card and the text used when a link targets a Family record. |

These properties configure presentation. They do not create, modify or replace genealogical facts, record identifiers or relationship references.

#### 7.5.1 Field-key form

A property may contain a bare field key. The application reads that field from the record whose display title is being generated:

```yaml
individual_display_field: name
```

This is shorthand for selecting one field; it is not a new record field.

#### 7.5.2 Template form

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

#### 7.5.3 Resolution and fallback

An unresolved placeholder contributes an empty string. If the complete expression produces no usable display text, the current viewer falls back to its normal title-generation behavior for that record type.

Applications should provide a readable fallback when a configured key, reference or target field is missing. A missing display value must not cause the record itself or its original reference to be removed.

#### 7.5.4 Use in links

When a viewer renders a link to an `Individual`, it should use the resolved `individual_display_field` value as the link text. For a link to a `Family`, it should use `family_display_field`. The same target-type rule applies to reverse-reference labels. A viewer may use its normal title-generation behavior when the corresponding property is absent or cannot produce text.

The `@dictionary@` is not required to contain entries for these metadata properties or for the fields they select. The dictionary describes field labels, descriptions and grouping; display metadata selects values for presentation.

#### 7.5.5 Preservation

Display metadata must never replace stored names with derived strings, rewrite relationship identifiers, or infer a name from a spouse or family context. Changing a display property changes presentation only.

## 8. Dictionary: `@dictionary@`

The optional `@dictionary@` document defines field labels, descriptions,
grouping and optional value choices. A new project should start with a default
dictionary and no sample genealogy records.

Example:

```yaml
---
id: "@dictionary@"
type: Dictionary
name: Full name — Name as recorded
birth_date: Date of birth — Date associated with the birth event
birth_place: Place of birth — Place associated with the birth event
husb: Husband
wife: Wife
chil: Child
event_type: Event type
event_date: Event date
event_place: Event place
event_description: Event description
divorce: Divorced
```

### 8.1 Entry syntax

The general form is:

```yaml
field_key: Display Label — Optional description
```

The dictionary describes the OGF field vocabulary. It does not map GEDCOM tags
or tags from any other source format to OGF fields. Importers preserve source
tags as source-derived keys; users may explicitly rename those keys when they
want to adopt a preferred OGF field name.

Relationship field keys such as `husb`, `wife` and `chil` are enumerated in the
`@dictionary@` for human-readable display. Their relationship meaning and use
are configured by `@meta@.tree.relationships`; they are not separately defined
by the dictionary.

### 8.2 Grouping

Blank lines in `@dictionary@` separate field groups. Dictionary entry order
sets field order within each group and group order on cards. Optional YAML
comment lines may be placed above a group as human-readable visual notes, but
comments are not parsed and do not create group names or affect rendering.

Record-local blank lines do not control card layout. The viewer derives card
field order and grouping from the dictionary. Fields absent from the dictionary
remain visible in an ungrouped fallback section, in their record order.

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

### 8.6 Default vocabulary

A new project starts with these curated field groups:

| Group | Default fields |
|---|---|
| Individual | `name`, `given_name`, `surname`, `nickname`, `sex`, `birth_date`, `birth_place`, `death_date`, `death_place`, `burial_date`, `burial_place`, `occupation`, `education`, `title`, `cause_of_death`, `source_reference` |
| Family | `marriage_date`, `marriage_place` |
| Source | `source_title`, `source_text` |
| Repository | `repository_name`, `repository_website` |
| General event | `event_type`, `event_date`, `event_place`, `event_description` |

The general-event group deliberately has no generic `event_cause` field. The
Individual field `cause_of_death` is separate and maps to `DEAT.CAUS`.

## 9. Dates

OGF supports two date notations:

1. GEDCOM-style date expressions.
2. EDTF date expressions.

Both are valid stored representations.

### 9.1 GEDCOM-style dates

Examples:

```yaml
birth_date: "25 NOV 1975"
birth_date: "NOV 1975"
birth_date: "1975"
birth_date: "ABT 1975"
birth_date: "BEF 1976"
birth_date: "BET 1975 AND 1976"
birth_date: "FROM 1975 TO 1976"
```

### 9.2 EDTF dates

Examples:

```yaml
birth_date: "1975-11-25"
birth_date: "1975-11"
birth_date: "1975"
birth_date: "1975~"
birth_date: "1975?"
birth_date: "1975..1976"
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
### 10.1 Field order and groups

The dictionary is the single source of truth for card field order and grouping.
Record entry order and record-local blank lines do not define card layout.
Dictionary order determines field order; blank lines in the dictionary separate
groups. Optional comment lines are human-readable notes only and are ignored by
the parser and renderer. The viewer does not provide per-record field or group
reordering controls.

Fields absent from the dictionary remain visible in a final ungrouped fallback
section, preserving data that has not yet been added to the dictionary.

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

Image references may be stored in any field. A viewer must not assume that a
field named `obje_file`, or any other field-name pattern, is the image field
for a record type.

The optional `@meta@.image_field` object maps exact record type names to the
field or ordered list of fields containing portrait images. The same mapping
is shared by details cards and tree nodes. For example:

```yaml
image_field:
  Individual: obje_file
  Family: family_photo
  Source:
    - scan_front
    - scan_back
```

A viewer displays the first usable image from the configured fields in its
record portrait area. The mapping applies to all record types, including
Individual, Family and Source. A record type without an entry has no configured
portrait; the viewer must not guess one from field names.

The original media reference must remain available in the record. A configured
portrait must not be redundantly rendered again as a second thumbnail in its
ordinary field row.

For local media paths, a browser application may require the user to select the media directory. It must not assume that a local path is a publicly accessible URL.

If an image cannot be resolved or loaded, the record must remain usable and must not display a broken-image placeholder.

## 13. Name variants and contextual display

OGF must preserve all stored name values.

The format does not assume that a person's surname changes as a result of marriage.

Applications may use the optional `individual_display_field` and `family_display_field` properties in `@meta@` to select display values for Individual and Family records. These properties are defined in section 7.5.

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


## Tree metadata configuration

The `@meta@.tree` object configures record types and record-specific tree
fields. Family relationships are configured under `tree.family.partners` and
`tree.family.children`; Individual event fields are configured under
`tree.individual`; Family event fields are configured under `tree.family`.
The renderer uses configured field identifiers and does not infer event fields
from names or language. See [Tree view](TREE-VIEW.md) for the complete schema.

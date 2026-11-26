# GEDCOM Import Rules

**Target:** GEDCOM 5.5.1 to Open Genealogy Format (OGF)  
**Status:** Import requirements

## 1. Purpose

This document defines the GEDCOM 5.5.1 to OGF import rules. It supplements
[the OGF specification](SPECIFICATION.md). Import changes structure, not
genealogical meaning.

## 2. Strict transformation policy

The importer must not:

- Infer missing facts.
- Invent people or families.
- Invent relationships.
- Complete incomplete dates or places.
- Translate field values.
- Enrich records using external knowledge.
- Replace references with names.
- Silently discard unknown tags.
- Destructively normalize source values.

The importer may transform GEDCOM structure into OGF's flat representation as described below.

## 3. Supported record types

The importer creates dedicated OGF records for:

| GEDCOM record | OGF type |
|---|---|
| `INDI` | `Individual` |
| `FAM` | `Family` |
| `SOUR` | `Source` |
| `REPO` | `Repository` |

Other GEDCOM record types do not receive dedicated card interfaces in the current application.

Other records and their data may be used to resolve references or media, or preserved where appropriate, but must not be silently converted into invented genealogical entities.

## 4. Identifier preservation

GEDCOM cross-reference identifiers must be preserved exactly.

Examples:

```gedcom
0 @I1@ INDI
0 @F1@ FAM
0 @S1@ SOUR
```

Become:

```yaml
id: "@I1@"
type: Individual
```

```yaml
id: "@F1@"
type: Family
```

```yaml
id: "@S1@"
type: Source
```

The importer must not:

- Remove `@` delimiters.
- Rename identifiers.
- Renumber identifiers.
- Generate replacement identifiers.
- Derive identifiers from names or dates.

Every reference must continue to point to the same identifier.

## 5. Flattening GEDCOM hierarchy

GEDCOM uses hierarchical levels. OGF stores record fields as flat keys. The
importer flattens each tag path by lowercasing its tag names and joining nested
levels with underscores. It does not translate GEDCOM tags into the default
human-readable OGF dictionary fields.

Examples:

| GEDCOM path | Imported OGF key |
|---|---|
| `NAME` | `name` |
| `NAME.GIVN` | `name_givn` |
| `NAME.SURN` | `name_surn` |
| `BIRT.DATE` | `birt_date` |
| `BIRT.PLAC` | `birt_plac` |
| `DEAT.DATE` | `deat_date` |
| `MARR.DATE` | `marr_date` |
| `DIV` | `div` |
| `_MARNM` | `_marnm` |

The dictionary is not an import mapping table. It provides a set of useful OGF
fields (for example, `birth_date`, `birth_place` and `marriage_date`) that users
may choose to use. If a user wants an imported key to use one of those fields,
they can explicitly rename it after import. The importer must not make that
semantic decision on the user's behalf.

Leading underscores in extension tags must be preserved. Repeated occurrences
of the same flattened key are stored as an ordered YAML list under that one
key. The importer must not generate synthetic keys such as `_2` or `_3` for
repeated occurrences. This keeps the dictionary vocabulary unique while
preserving every value and its source order.

### 5.1 Tag names

Tag names are source data. Lowercasing and flattening only make them valid,
consistent OGF field keys; they do not translate their meaning. The original
values are preserved, subject only to explicitly documented structural handling
such as removal of GEDCOM name-delimiter slashes from a top-level personal name.

### 5.2 Structural parents

A structural parent that has child tags but no own value must not produce an empty field.

Input:

```gedcom
1 BIRT
2 DATE 25 NOV 1976
```

Output:

```yaml
birt_date: "25 NOV 1976"
```

It must not produce:

```yaml
birt: ""
birt_date: "25 NOV 1976"
```

## 10. Date preservation

GEDCOM date expressions must be preserved exactly as imported.

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

The importer must not convert these expressions into EDTF.

OGF supports both GEDCOM-style expressions and EDTF. Applications may interpret either notation for sorting, filtering, search or display, while retaining the original stored value.

The importer must preserve qualifiers and expressions it cannot interpret.

It must not assume that GEDCOM `CAL`, `EST` and `ABT` have identical meanings to EDTF `?`, `%` and `~`.

## 11. Dictionary generation

A new empty OGF project starts with a default `@dictionary@` containing a
curated set of human-readable OGF fields. This dictionary is a starting
vocabulary for users; it does not contain GEDCOM tag mappings.

A GEDCOM import starts with an import-specific, otherwise empty `@dictionary@`.
The importer populates it exclusively from the unique flattened keys actually
present in the imported records. It does not merge in the starter-project
defaults and does not consult those defaults to rename imported fields.

### 11.1 Included fields

Include the flattened keys used by imported:

- Individual records.
- Family records.
- Source records.
- Repository records.

Exclude structural keys:

- `id`
- `type`

Include each unique flattened source key once, regardless of how many times
it occurs in imported records. Repeated occurrences are values of the same
field and do not create additional dictionary entries.

### 11.2 Repeated values

A record may contain the same flattened key more than once. The importer must
store these occurrences as an ordered YAML list under one field entry. It must
not create numbered field keys or duplicate dictionary entries. The viewer and
editor must preserve the list and its order when displaying, editing and saving
the record.

### 11.3 Labels and descriptions

Every imported key receives a neutral generated display label derived from its
flattened key. The importer must not infer a semantic label from a GEDCOM tag.

The importer must not invent semantic descriptions for unknown tags. Starter
dictionary labels are available only when creating a new empty OGF project;
they are not merged into an imported project.

### 11.4 Shared dictionary

The dictionary is shared by Individuals, Families, Sources and Repositories.

The Add Field interface must use the dictionary as its source of available fields.

A custom field must be defined in the dictionary before it can be added to a card.

Removing a dictionary entry must not delete existing record data.

### 11.5 Key replacement

When a key is renamed, the change must be synchronized across the dictionary and all records.

A rename must not silently overwrite another field.

If multiple source keys would map to the same destination key, the application must report the collision and require explicit resolution. It must not silently merge or discard values.

## 12. Presentation-only transformations

The importer and viewer may provide presentation features without modifying stored values.

These include:

- Rendering internal `@id@` references as clickable links.
- Rendering URLs as links.
- Creating Google Maps links from recognized coordinate pairs.
- Displaying images from `OBJE.FILE` when the corresponding record type has
  an explicit entry in `@meta@.image_field`. The importer may provide the
  default `obje_file` configuration for Individual, Family and Source records;
  viewers must use the configured field names rather than guessing them.
- Displaying dictionary descriptions beside field labels.
- Organizing fields into visual groups.

These features must not alter the underlying imported values.

## 13. Field grouping and layout

During GEDCOM import, each top-level GEDCOM tag and all of its descendants
belong to one dictionary group. For example, `BIRT.DATE` and `BIRT.PLAC` are
flattened to `birt_date` and `birt_plac` and placed in the same dictionary
group. The group identity is based on the top-level source tag, consistently
across records; it is not inferred from translated meanings.

The importer preserves first-seen field order and writes dictionary blank lines
between groups. Record fields themselves contain only data and do not carry
presentation grouping. The viewer derives card order and grouping exclusively
from the dictionary. Unknown fields remain visible in an ungrouped fallback
section.

Optional comments in the dictionary may visually annotate groups for people
reading the YAML, but comments are not parsed and have no effect on grouping.
The application does not offer per-record field/group move controls.

## Final rule

**Import is a transformation of structure, not an interpretation of genealogy.**

When a value, relationship, date or reference cannot be interpreted safely, preserve it rather than guessing.

Related: [OGF specification](SPECIFICATION.md) · [Project overview](../README.md)

### 11.5 OGF presentation metadata retained during import

GEDCOM import must not merge the starter project's genealogical field
dictionary into the imported dictionary. It should, however, initialize OGF
presentation metadata that GEDCOM does not supply, including display templates,
tree relationship configuration, and date-description templates. The shared
gender mapping is retained when imported records contain the GEDCOM `SEX`
field. Its standard `sex_values` choices (`M`, `F`, `U`) are also included as
dictionary value metadata in that case. These settings do not add genealogical
facts or unused starter fields to imported records.


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

Leading underscores in extension tags must be preserved. Repeated tags must
not overwrite earlier values. A deterministic suffix may be appended, for
example `_2`, `_3`.

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
vocabulary for users; it does not contain GEDCOM tag mappings and the importer
does not consult it to rename imported fields.

During GEDCOM import, the importer retains the default dictionary and adds
neutral entries for source-derived flattened keys that are not already listed.

### 11.1 Included fields

Include the flattened keys used by imported:

- Individual records.
- Family records.
- Source records.
- Repository records.

Exclude structural keys:

- `id`
- `type`

Include generated suffix keys such as `_2` and `_3` when they occur.

### 11.2 Labels and descriptions

Fields already present in the default dictionary retain their human-readable
labels. Source-derived keys not already present receive neutral generated labels
and empty descriptions. The importer must not infer a semantic label from a
GEDCOM tag.

The importer must not invent semantic descriptions for unknown tags.

### 11.3 Shared dictionary

The dictionary is shared by Individuals, Families, Sources and Repositories.

The Add Field interface must use the dictionary as its source of available fields.

A custom field must be defined in the dictionary before it can be added to a card.

Removing a dictionary entry must not delete existing record data.

### 11.4 Key replacement

When a key is renamed, the change must be synchronized across the dictionary and all records.

A rename must not silently overwrite another field.

If multiple source keys would map to the same destination key, the application must report the collision and require explicit resolution. It must not silently merge or discard values.

## 12. Presentation-only transformations

The importer and viewer may provide presentation features without modifying stored values.

These include:

- Rendering internal `@id@` references as clickable links.
- Rendering URLs as links.
- Creating Google Maps links from recognized coordinate pairs.
- Displaying images from `OBJE.FILE`.
- Displaying dictionary descriptions beside field labels.
- Organizing fields into visual groups.

These features must not alter the underlying imported values.

## 13. Field grouping and layout

Blank lines in an OGF record separate visual groups.

The viewer may allow users to:

- Move groups up or down.
- Merge adjacent groups.
- Split a group at a selected field.

The operations must preserve field names and values.

Only field order and blank-line placement may change.

The resulting YAML must preserve the selected grouping when exported.

## Final rule

**Import is a transformation of structure, not an interpretation of genealogy.**

When a value, relationship, date or reference cannot be interpreted safely, preserve it rather than guessing.

Related: [OGF specification](SPECIFICATION.md) · [Project overview](../README.md)

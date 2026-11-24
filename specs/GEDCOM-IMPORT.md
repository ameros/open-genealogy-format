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

GEDCOM uses hierarchical levels. OGF stores fields using flat keys.

The importer must flatten tag paths by joining lowercase tag names with underscores.

Examples:

| GEDCOM | OGF |
|---|---|
| `NAME` | `name` |
| `NAME.GIVN` | `name_givn` |
| `NAME.SURN` | `name_surn` |
| `BIRT.DATE` | `birt_date` |
| `BIRT.PLAC` | `birt_plac` |
| `BIRT.PLAC.MAP.LATI` | `birt_plac_map_lati` |
| `BIRT.PLAC.MAP.LONG` | `birt_plac_map_long` |
| `DEAT.DATE` | `deat_date` |
| `_MARNM` | `_marnm` |

### 5.1 Tag names

Tag names are converted to lowercase.

Nested tag names are joined with `_`.

The importer must not semantically translate GEDCOM tags.

For example:

- `BIRT` becomes `birt`, not `birth`.
- `DEAT` becomes `deat`, not `death`.
- `MARR` becomes `marr`, not `marriage`.

Leading underscores in extension tags must be preserved.

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

### 5.3 Empty leaf values

An empty leaf value must be preserved as an empty string.

### 5.4 Repeated tags

Repeated tags must not overwrite one another.

The importer must use deterministic unique field names, for example:

```yaml
note: First note
note_2: Second note
note_3: Third note
```

A generated suffix must not overwrite another field that already exists.

## 6. NAME handling

The importer removes GEDCOM surname delimiters `/` only from the top-level `NAME` value of an Individual.

Input:

```gedcom
1 NAME John /Smith/
2 GIVN John
2 SURN Smith
```

Output:

```yaml
name: John Smith
name_givn: John
name_surn: Smith
```

The importer must not modify:

- `GIVN` values.
- `SURN` values.
- Other name substructures.
- Slash characters in unrelated fields.

The importer must preserve multiple name records and name-related fields.

It must not infer which name is a birth, adopted or married name unless the source explicitly provides that information.

## 7. Individual and Family relationships

### 7.1 Family-side references

Family-side relationship fields are preserved as references.

Examples:

```gedcom
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
```

Become:

```yaml
id: "@F1@"
type: Family

husb: "@I1@"
wife: "@I2@"
chil: "@I3@"
```

The importer must not replace these values with names.

### 7.2 Individual-side references

GEDCOM Individual records may contain:

- `FAMS` — spouse relationship to a Family.
- `FAMC` — child relationship to a Family.

These references may duplicate the relationship already represented on the Family record.

### 7.3 Conditional removal of redundant FAMS

An Individual's `FAMS: @F1@` may be removed only if:

1. Family `@F1@` exists.
2. That Family has a `HUSB` or `WIFE` reference to the same Individual.

If either condition is not met, preserve the `FAMS` reference.

### 7.4 Conditional removal of redundant FAMC

An Individual's `FAMC: @F1@` may be removed only if:

1. Family `@F1@` exists.
2. That Family has a `CHIL` reference to the same Individual.

If either condition is not met, preserve the `FAMC` reference.

### 7.5 Nested FAMC and FAMS data

Removing a redundant relationship pointer must not remove nested data.

For example:

```gedcom
1 FAMC @F1@
2 PEDI adopted
2 STAT proven
```

The relationship pointer may be omitted when the Family-side relationship is present, but the additional values must be retained, for example:

```yaml
famc_pedi: adopted
famc_stat: proven
```

The same preservation rule applies to nested `FAMS` information.

### 7.6 Reverse references

The viewer may display reverse links by inspecting Family records.

These reverse links are derived presentation data, not additional imported facts.

## 8. Source records

GEDCOM `SOUR` records become OGF `Source` records.

Example:

```gedcom
0 @S1@ SOUR
1 TITL Parish Register
1 AUTH St Mary's Parish
1 PUBL London
```

Output:

```yaml
id: "@S1@"
type: Source

titl: Parish Register
auth: St Mary's Parish
publ: London
```

Nested fields are flattened using the same rules.

Examples:

- `DATA.DATE` becomes `data_date`.
- `DATA.TEXT` becomes `data_text`.

References to Sources from Individuals and Families must be preserved exactly.

The viewer must support navigation between records and their referenced Sources.

The importer must not create dedicated Repository or other record cards in the current implementation.

## 9. Multimedia and OBJE records

### 9.1 General rule

GEDCOM multimedia information must not be discarded merely because `OBJE` is not a dedicated card type.

The importer must preserve the original media references and file values.

### 9.2 Inline OBJE

For an inline object:

```gedcom
1 OBJE
2 FILE photos/john.jpg
```

The flattened field is:

```yaml
obje_file: photos/john.jpg
```

### 9.3 Standalone OBJE records

GEDCOM may define a separate object record:

```gedcom
0 @O1@ OBJE
1 FILE photos/john.jpg
```

An Individual may reference it:

```gedcom
1 OBJE @O1@
```

The importer must resolve the reference for media presentation.

The original object reference must not be silently discarded.

The resolved `FILE` value must be made available to the viewer for image rendering, for example through `obje_file`.

An unresolved object reference must remain visible as an unresolved reference.

### 9.4 Image rendering

The viewer should:

1. Identify usable image references.
2. Resolve remote URLs directly where supported.
3. Resolve local paths against a user-selected media directory.
4. Display the first usable image as the record portrait.
5. Keep other media references accessible in the record fields.

The portrait must be rendered as an actual image element:

```html
<img src="resolved-image-source" alt="Record image">
```

The portrait must not be displayed a second time as an ordinary image inside the `obje_file` field row.

If the image cannot be resolved or loaded, the record must remain usable without a broken-image placeholder.

A local GEDCOM path must not be assumed to be a public URL. Browser access to local media may require the user to select the media directory.

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

The importer must generate or update an `@dictionary@` document based on the fields actually emitted during import.

### 11.1 Included fields

Include the flattened keys used by imported:

- Individual records.
- Family records.
- Source records.

Exclude structural keys:

- `id`
- `type`

Include generated suffix keys such as `_2` and `_3` when they occur.

### 11.2 Labels and descriptions

Known GEDCOM tag paths may receive curated labels and descriptions.

Unknown or custom fields must receive neutral generated labels and empty descriptions.

The importer must not invent semantic descriptions for unknown tags.

### 11.3 Shared dictionary

The dictionary is shared by Individuals, Families and Sources.

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

# OGF name display rules

Name display is presentation-only. It does not rewrite, normalize, infer, or delete a person's recorded names.

## Individual name variants

Store every known variant as its own field on the Individual record. For example:

```yaml
name: Alex Married
name_type: married
name_birth: Alex Birth
name_birth_type: birth
name_adopted: Alex Adopted
name_adopted_type: adopted
name_married_2: Alex Later Married
name_married_2_type: married
```

The field names are examples; values are always taken literally from the record. The viewer does not infer a married surname from a spouse.

## Global rules in `@meta@`

The viewer supports these flat metadata keys (the current OGF stream parser stores metadata as flat key/value entries):

- `display_individual_default_name_field`: final configured fallback, normally `name`.
- `display_individual_card_name_field`: name field for an Individual card heading.
- `display_individual_directory_name_field`: name field in the directory list and sorting.
- `display_individual_reference_name_field`: name field in ordinary `@id@` reference links.
- `display_family_card_title_template`: Family card title; supports `{husb}`, `{wife}`, `{husb_id}`, `{wife_id}`, `{id}`.
- `display_family_reference_title_template`: Family reference title; same placeholders.
- `display_name_indicators`: `true`/`false`; show a small indicator for the selected name type/variant.

If a configured name field is absent or empty, the viewer falls back to `display_individual_default_name_field`, then `name`, then the existing given-name/surname fields. It never synthesizes a surname from a spouse.

## Per-family spouse selection

A Family record may explicitly select a name field for either spouse:

```yaml
husb: "@I-X@"
husb_name_field: name_birth
wife: "@I-Y@"
wife_name_field: name_married_2
```

These selectors affect the spouse names used in that Family's title and the corresponding `husb`/`wife` reference pills on that Family card. They do not change the Individual's own card, directory name, or unrelated references. If omitted or if the selected field is empty, the configured Individual reference name rule is used.

## Indicators

For a selected field, the viewer looks for a matching type key such as `name_birth_type`; for the base `name` field it uses `name_type`. If no explicit type value exists, a non-default selected field is shown as the indicator. Indicators explain which stored value was selected; they do not assert any genealogical interpretation beyond the source data.

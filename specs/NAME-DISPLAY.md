# Name display

This guide describes how the OGF viewer selects names for record titles and
reference links. Name display is presentation-only: it does not rewrite, infer
or delete recorded names. The format-level rules are in
[the OGF specification](SPECIFICATION.md#13-name-variants-and-contextual-display).

## Individual name variants

Store each known name variant in its own field on the Individual record. For
example:

```yaml
name: Alex Married
name_birth: Alex Birth
name_adopted: Alex Adopted
name_married_2: Alex Later Married
```

These field names are examples, not reserved OGF fields. The viewer does not
infer a married or adopted name from a spouse, a relationship, or another name
field. It displays the value selected by the metadata configuration.

## Global rules in `@meta@`

Use `individual_display_field` to select the title for an Individual record and
`family_display_field` to select the title for a Family record. The same
resolved values are used as link text when another record refers to that
Individual or Family.

A setting may contain a field key:

```yaml
individual_display_field: name_birth
```

Or a template. `{field_key}` reads a field from the current record;
`{$reference_key.field_key}` follows a record reference and reads a field from
the referenced record:

```yaml
individual_display_field: "{given_name} {family_name}"
family_display_field: "{$wife.name} & {$husb.name}"
```

Template values should be quoted in YAML. Reference placeholders require a
single identifier in the referenced field and an existing target record. An
unresolved placeholder contributes an empty string. If the configured value
produces no usable title, the viewer uses its normal title-generation fallback.

These settings belong to the shared `@meta@` document. They are not
name-specific display flags and do not alter the source record.

## Preservation

The viewer preserves every stored name variant and the original relationship
identifiers. It does not create a name variant, choose a spouse's surname, or
rewrite a name because of marriage or adoption. Changing display metadata
changes presentation only.

Related: [OGF specification](SPECIFICATION.md) · [Project overview](../README.md)

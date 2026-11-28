# Representing repeated events and other structured groups

A person may have several residences, occupations, awards, migrations or other
events. When each occurrence has its own details, OGF keeps each occurrence as
an object in an ordered YAML list.

## Keep each occurrence together

For example, each event below has its own type, date, place and note:

```yaml
even:
  - type: Award
    date: "1944"
    plac: London
    note: Military decoration
  - type: Occupation
    date: "1950"
    plac: Oxford
    note: Appointed lecturer
```

This structure says that the date and place belong to a particular event. It
is safer than storing separate arrays for types, dates and places, because
separate arrays rely on matching positions to associate the values.

## Do not number the field names

The list key remains `even`. Do not create `even_1`, `even_2` or similar keys.
The list position preserves occurrence order; it is not part of the field name.
The dictionary contains one top-level definition for `even` and reusable dotted
path definitions for nested fields such as `even.type`, `even.date` and
`even.plac`.

## Dictionary example

```yaml
---
id: "@dictionary@"
type: Dictionary
even: Events
even.type: Event type
even.date: Date
even.plac: Place
even.note: Note
```

Dictionary order controls where the group appears among other card sections.
The dotted paths provide labels for fields inside the repeated objects; they
do not create independent top-level record fields.

## Try the complete sample

- [Open the repeated-events YAML sample](../samples/sample-en-repeated-events.ogf.yaml)
- [Read the general YAML writing tutorial](../docs/WRITING-OGF-YAML.md)

The same representation applies to repeated residences and other structured
source occurrences, not only to events. See
[the OGF specification](../specs/SPECIFICATION.md#61-repeated-source-occurrences)
for the normative structural rules.

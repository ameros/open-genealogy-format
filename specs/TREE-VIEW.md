# Tree view

The tree is an optional view of existing OGF records. It does not create or
change genealogy facts. Family records define the relationships used by this
viewer; Individual-side reverse references are not used. The shared metadata
rules are defined in [the specification](SPECIFICATION.md).

## Relationship configuration

Add `tree.relationships` to the `@meta@` document. Field names are examples,
not reserved OGF vocabulary:

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

- `partner_fields` lists Family fields whose values reference Individuals.
- `child_fields` lists Family fields whose values reference child Individuals.
- The `@dictionary@` should enumerate these configured field keys with
  human-readable labels. It does not define their relationship behavior; this
  configuration remains the source of truth for the tree and importer's
  reciprocal-reference check.
- Each configured field may contain one reference or a YAML list of references.
- Multiple partner and child fields are supported.
- A configured field may contain a YAML list of references. Repeated GEDCOM
  occurrences are stored in that list under the same key, preserving source
  order without generating numbered field names.
- Unresolved references are reported in the tree status; they are not guessed.
- Without this configuration, the tree does not infer relationships.

## Shared gender interpretation

Gender classification is configured once through the shared top-level
`@meta@.gender_mapping` object, not through a tree-specific property. For
example:

```yaml
gender_mapping:
  field: sex
  male: M
  female: F
```

The tree calls the same shared interpretation rule available to other
renderers. It uses exact value matching; absent or unrecognized values use the
neutral unknown style. See [the shared gender mapping rules](SPECIFICATION.md#73-shared-gender-mapping).

The renderer uses the same core mechanism as `gedcom-svg-tree`:

- ordered `NodeFamily.Tree`-style traversal from the selected record;
- separate ancestor and descendant expansion, with collateral relatives
  controlled independently;
- a directed graph laid out by Dagre/Dagre-D3 (rather than sorting records
  into breadth-first rows);
- Family records rendered as circular nodes and Individuals as rectangular
  person cards;
- Individual and Family titles reuse the existing `individual_display_field`
  and `family_display_field` metadata; the tree does not define a parallel
  title configuration;
- Individual nodes show birth and death dates and places, plus burial place,
  when those values exist; the first resolved `obje_file` image is used as a
  portrait, and no empty portrait placeholder is shown when an image is absent;
- the shared `@meta@.gender_mapping` setting classifies Individual nodes;
  exact configured male/female values select the corresponding blue and rose
  node borders, while missing or unrecognized values use the neutral
  pink-to-blue gradient border;
- Family nodes show the configured Family title and marriage date/place when
  present;
- hover highlighting based on graph predecessors (ancestors) and successors
  (descendants), dimming unrelated branches;
- D3 zoom/pan, fit-to-tree, and re-centering when another node is selected.

The toolbar controls ancestor generations, descendant generations, and the
additional collateral generations. Relationship order follows the OGF document
order, configured field order, and YAML list order; names and IDs are not
alphabetically sorted. The existing OGF record card remains the editor for the
selected node. Mobile uses the same graph and selection logic with a responsive
layout.

Related: [OGF specification](SPECIFICATION.md) · [Project overview](../README.md)

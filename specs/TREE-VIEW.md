# Tree view

The tree is an optional view of existing OGF records. It does not create or
change genealogy facts. Family records define the relationships used by this
viewer; Individual-side reverse references are not used. The shared metadata
rules are defined in [the specification](SPECIFICATION.md).

## Tree configuration

The `@meta@.tree` object configures record types, family relationships and
event fields used by the tree. These settings are grouped by record type; there
is no separate `relationships` section.

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
```

- `individual_type` and `family_type` identify the record types rendered by
  the tree.
- `family.partners` lists Family fields whose values reference Individuals.
- `family.children` lists Family fields whose values reference child Individuals.
- `individual.birth`, `individual.death` and `individual.burial` configure
  the date and place fields displayed on Individual nodes.
- `family.marriage` configures the date and place fields displayed on Family
  nodes.
- Field names are open identifiers. They may use any language or naming
  convention; the renderer uses the configured identifiers and does not infer
  event meaning from field names or dictionary labels.
- Relationship fields may contain one reference or an ordered YAML list of
  references. Repeated occurrences are stored under one key, preserving
  source order.
- The `@dictionary@` should enumerate configured relationship field keys with
  human-readable labels. It does not define their relationship behavior.
- Unresolved references are reported in the tree status; they are not guessed.
- Without relationship field configuration, the tree does not infer family
  relationships.
- Portrait fields are configured separately through `@meta@.image_field`;
  the same mapping is used by tree nodes and record details cards. See
  [Images and media](SPECIFICATION.md#12-images-and-media).

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
- Individual nodes show the configured birth, death and burial dates and
  places when those values exist. Individual and Family node portraits use the
  shared `@meta@.image_field` mapping; no image field is inferred from its name,
  and no empty portrait placeholder is shown when an image is absent;
- the shared `@meta@.gender_mapping` setting classifies Individual nodes;
  exact configured male/female values select the corresponding blue and rose
  node borders, while missing or unrecognized values use the neutral
  pink-to-blue gradient border;
- Family nodes show the configured Family title and configured marriage
  date/place fields when present;
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


## Save and SVG export

The unified Save / Export dialog offers the native OGF YAML project and SVG.
YAML saves the complete project. SVG exports the graph currently rendered by
the tree view, using the active ancestor, descendant and other-generation
controls. It does not export records outside that rendered graph.

SVG output is fitted to its page; the browser viewport's current pan and zoom
are not included. The export includes the rendered nodes and relationship
edges, resolved SVG presentation styles, a white background, and images that
the browser is permitted to embed. Images whose hosts block cross-origin
access may remain external references.
\nThe tree toolbar provides its own Save / Export action while the tree workspace is open. SVG remains selectable in the dialog even when no tree is currently rendered; in that case, the dialog explains that the tree view must be opened and rendered first.\n
SVG export embeds record photos when the browser can fetch their image sources. Event symbols are converted to portable Unicode glyphs so the SVG does not depend on the application's externally loaded Font Awesome font. Images hosted on servers that block cross-origin access may remain external references.

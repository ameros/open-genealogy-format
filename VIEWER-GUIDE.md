# OGF Viewer Guide

A short guide to working with genealogy projects in the OGF viewer.

## Open a project or try a sample

Use **Project / samples…** to start a new empty project or load an example. The samples include English and Polish field names, custom keys, and an example imported from GEDCOM.

## Work with records

The viewer displays the records in your project. Select a record to inspect its details and follow links to related records. Keep each person, family and source as a separate record, and use references to connect them.

## Understand field names

The dictionary supplies readable labels and organizes fields for display. A field key is still the data identifier: changing its label does not rename the stored key. Custom keys are allowed; add them to the dictionary when you want to give them a clear label or organize them for display.

## Choose which names appear

An Individual can store more than one name variant. The viewer uses the name-display settings in `@meta@` to choose the title shown for a person and in references. Changing the display setting does not rewrite the recorded names. See [Name display](specs/NAME-DISPLAY.md) for examples.

## Explore the family tree

Open the tree view from the viewer. Select a node to focus on that record; use the ancestor, descendant and other-generation controls to change how much of the family is shown. Use zoom and pan to move around the graph. The tree displays relationships already present in Family records; it does not invent missing relationships. See [Tree view](specs/TREE-VIEW.md) for configuration details.

## Save and export

Choose **Save / Export** to save the complete project as OGF YAML. The same action is available from the tree toolbar while the tree is open.

The tree can also be exported as SVG or prepared for PDF printing:

- **SVG** exports the currently rendered tree as vector artwork without photographs. It is available under **Advanced export formats**.
- **PDF** opens a print layout. Use the browser's **Print → Save as PDF** option. The print layout supports A4 to A0, portrait or landscape, and two scaling modes:
  - **Fit to one page** shrinks the complete tree to one sheet.
  - **Actual size** keeps the tree's native scale and tiles it across multiple pages when needed.

For a clean PDF, select the same paper size and orientation in the browser print dialog and turn off its headers and footers. Check the resulting PDF before sending it to a print shop, especially when printing a large tree with photographs.

## Learn more

- [OGF specification](specs/SPECIFICATION.md) — how the data format works.
- [GEDCOM import](specs/GEDCOM-IMPORT.md) — what happens when GEDCOM data is imported.
- [Tree view](specs/TREE-VIEW.md) — tree configuration and behaviour.
- [Name display](specs/NAME-DISPLAY.md) — name variants and display settings.

## Learn to write OGF YAML

OGF files can be created and edited in a text editor. Start with the
[step-by-step YAML tutorial](docs/WRITING-OGF-YAML.md), then explore the
[articles and field notes](articles/README.md).

The sample files are also practical examples of how to write the data:

- [English sample YAML](samples/sample-en.ogf.yaml)
- [GEDCOM-derived sample YAML](samples/sample-en-from-gedcom.ogf.yaml)
- [Repeated events sample YAML](samples/sample-en-repeated-events.ogf.yaml)

Repeated structured occurrences remain ordered and keep their own nested
values together. The dictionary defines their labels and position among other
card sections. See [repeated structures in the specification](specs/SPECIFICATION.md#61-repeated-source-occurrences).

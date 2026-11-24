# OGF 1.0 metadata contract

The first stable metadata contract is identified by `@meta@.version: 1`.

- Shared data interpretation belongs directly in `@meta@` (for example,
  `gender_mapping`).
- Renderer-specific configuration belongs under a renderer namespace
  (for example, `tree.relationships`).
- Gender mapping uses an exact field/value mapping and is reusable by tree
  nodes, data cards, and other renderers.
- Explicit unsupported metadata versions must be reported rather than
  silently interpreted as version 1.
- Unversioned metadata may be treated as legacy input; new files should include
  the version.

See [SPECIFICATION.md](SPECIFICATION.md#71-metadata-contract-version) for the
normative rules.

# OGF versioning and compatibility

OGF uses separate versions for separate contracts. Do not assume that the
numbers must match. A version describes a compatibility contract, not simply
a file's edit date.

## Version axes

| Version | Meaning | Source of truth |
|---|---|---|
| Project release | A coordinated, reproducible application/source release | `VERSION.json` and its Git tag |
| OGF format | Structure and semantics of OGF data, records, identifiers and references | `@meta@.format_version` |
| Metadata contract | Meaning and structure of `@meta@` properties | `@meta@.version` |
| Specification | Revision of the published specification document | `specs/SPECIFICATION.md` header and `VERSION.json` |
| Viewer/renderer | Software implementation that reads and displays OGF | Included in the project release unless independently distributed |
| JavaScript engine | Shared implementation code | Included in the viewer/project release until it becomes an independently released library |

The format and metadata contract versions are data-level compatibility
identifiers. The project release and specification versions are independent.
Renderer behavior is not a data-format version. Do not add a separate version
to every JavaScript file or renderer module unless that component becomes an
independently maintained and distributed product.

## Compatibility rules

1. An application checks `format_version` and metadata `version` independently.
2. A missing version means legacy/unversioned input; it is not equivalent to an
   explicit version 1 declaration.
3. An explicitly unsupported version must be reported. Never silently treat it
   as version 1, downgrade it, or rewrite it.
4. Compatible optional additions that older applications can preserve and
   ignore do not automatically require a contract version increment.
5. A change that breaks the structure or meaning of existing OGF data requires
   a format-version increment. A change that breaks metadata interpretation
   requires a metadata-contract increment. These increments are independent.
6. Viewer-only changes, bug fixes, layout changes and documentation corrections
   do not automatically change either data contract.

The current viewer supports OGF format version 1 and metadata contract version
2. It retains a legacy path when either declaration is absent, and reports an
explicitly unsupported declaration rather than guessing.

## Project and specification releases

Use Semantic Versioning (`MAJOR.MINOR.PATCH`) for stable project and
specification releases:

- **MAJOR**: incompatible public API, application behavior, or specification
  contract change. A format or metadata contract break should be called out
  explicitly and versioned independently as well.
- **MINOR**: backward-compatible functionality or specification additions.
- **PATCH**: backward-compatible fixes and clarifications.

Before the first stable release, use a `0.x.y` draft version and prerelease
labels such as `-draft` or `-rc.1`. The current project and specification
versions are recorded in `VERSION.json`; the specification header mirrors its
`specificationVersion`.

## Coordinated release workflow

1. Make implementation, specification, import rules and samples agree.
2. Decide explicitly whether the change affects the format contract, metadata
   contract, viewer, or documentation. Bump only the affected version axes.
3. Update `VERSION.json`, the specification header, and sample `@meta@`
   declarations as appropriate.
4. Run syntax, sample-loading, round-trip and compatibility checks. Confirm that
   unknown fields and original identifiers/references are preserved.
5. Create a release candidate from a specific commit and test the ZIP built from
   that commit.
6. Publish the tested ZIP and create a Git tag pointing to the exact same
   commit. Record notable changes in `CHANGELOG.md`.

A release ZIP must be reproducible from its tagged source commit. Do not describe
a ZIP as a GitHub release or as published on `main` unless it has actually been
committed/published there.

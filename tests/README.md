# OGF sample fixtures and regression checks

The files in `../samples/` are both user-facing examples and regression fixtures.
Keep them realistic: a sample should demonstrate the actual OGF/YAML structure
used by the viewer, not only an isolated mock object.

## Fixture roles

- `sample-en-from-gedcom.ogf.yaml` — imported GEDCOM values, original date
  expressions (`ABT`, `BEF`, etc.), source references and imported record shapes.
- `sample-en-repeated-events.ogf.yaml` — repeated structured occurrences and
  the association of each occurrence's own nested values.
- `sample-en.ogf.yaml` — larger English dataset and broad viewer compatibility.
- `sample-pl.ogf.yaml` — Polish metadata and localized display phrases.
- `sample-en-custom-keys.ogf.yaml` — custom metadata and vocabulary configuration.

## Running checks

The test runner needs Node.js, Python 3, and the PyYAML test dependency.
Install the Python dependency once from the project root:

```sh
python3 -m pip install -r requirements-test.txt
```

Then run:

```sh
scripts/test-all.sh
```

This validates that every sample is parseable YAML with valid document headers,
checks key structural invariants in the GEDCOM and repeated-event fixtures, and
runs date-phrase unit tests against real values found in the GEDCOM-derived
sample. It requires Node.js and Python 3. The required Python package is declared in
`requirements-test.txt`; the runner prints the install command if it is missing.

## Adding a regression case

When implementing a feature:

1. Add or extend the most relevant sample with a representative real-world
   structure and keep its original data semantics intact.
2. Add an assertion to `scripts/test-fixtures.py` for the YAML structure or
   cross-record invariant.
3. Add an assertion to `scripts/test-regressions.js` when the feature has a
   pure formatting or transformation rule that can be tested independently.
4. Run `scripts/test-all.sh` and `node scripts/check-versions.js` before
   packaging the change.

Do not replace existing sample data with synthetic fixtures if the existing
sample already covers the behaviour. Prefer extending the existing sample so
that it remains a useful end-to-end example as well as a regression fixture.

#!/usr/bin/env python3
"""Validate OGF sample YAML files as reusable regression fixtures.

Requires PyYAML: python3 -m pip install pyyaml
"""
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError as exc:
    if exc.name == "yaml":
        raise SystemExit(
            "OGF fixture tests need PyYAML. Install the test dependency with:\n"
            "  python3 -m pip install -r requirements-test.txt\n"
            "Then rerun: scripts/test-all.sh"
        ) from None
    raise

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples"


def load_stream(path):
    with path.open(encoding="utf-8") as stream:
        docs = list(yaml.safe_load_all(stream))
    assert docs and all(isinstance(doc, dict) for doc in docs), f"{path.name}: empty or non-record YAML document"
    for index, doc in enumerate(docs, 1):
        assert doc.get("id") and doc.get("type"), f"{path.name}: document {index} needs id and type"
    ids = [doc["id"] for doc in docs]
    assert len(ids) == len(set(ids)), f"{path.name}: duplicate document IDs"
    return docs


fixture_docs = {}
for sample_path in sorted(SAMPLES.glob("*.ogf.yaml")):
    docs = load_stream(sample_path)
    fixture_docs[sample_path.name] = docs
    assert docs[0]["id"] == "@meta@" and docs[0]["type"] == "Meta", f"{sample_path.name}: first document must be @meta@"
    if len(docs) > 1:
        assert any(doc.get("id") == "@dictionary@" and doc.get("type") == "Dictionary" for doc in docs), f"{sample_path.name}: multi-document sample needs @dictionary@"

# GEDCOM-derived fixture: assert source date qualifiers survive YAML loading.
gedcom_docs = fixture_docs["sample-en-from-gedcom.ogf.yaml"]
people = {doc["id"]: doc for doc in gedcom_docs if doc.get("type") == "Individual"}
assert people["@I25@"]["birt_date"] == "ABT 1825"
assert people["@I25@"]["deat_date"] == "ABT 1865"
assert any(doc.get("birt_date") == "BEF 16 DEC 1884" or doc.get("deat_date") == "BEF 16 DEC 1884" for doc in people.values())

# Repeated structured events fixture: occurrences must remain separate and ordered.
event_docs = fixture_docs["sample-en-repeated-events.ogf.yaml"]
example = next(doc for doc in event_docs if doc.get("id") == "@I-1@")
assert isinstance(example.get("even"), list) and len(example["even"]) == 2
assert example["even"][0]["type"] == "Name Change"
assert example["even"][1]["type"] == "Occupation Change"

print(f"OGF fixture checks passed ({len(fixture_docs)} sample files; {sum(map(len, fixture_docs.values()))} YAML documents).")

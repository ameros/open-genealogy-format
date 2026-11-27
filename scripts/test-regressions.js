#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { explainDate } = require("../js/date-phrasing.js");

const meta = {
  date_approx: "About {date}",
  date_uncertain: "Possibly {date}",
  date_range: "Between {start} and {end}",
  date_before: "On or before {date}",
  date_after: "On or after {date}",
  date_calculated: "Calculated {date}",
  date_estimated: "Estimated {date}",
  date_from: "From {date}",
  date_to: "Until {date}"
};

const cases = [
  ["ABT 1825", "About 1825"],
  ["abt 1825", "About 1825"],
  ["BEF 16 DEC 1884", "On or before 16 DEC 1884"],
  ["AFT 3 MAR 1900", "On or after 3 MAR 1900"],
  ["BET 1900 AND 1905", "Between 1900 and 1905"],
  ["FROM 1900 TO 1905", "Between 1900 and 1905"],
  ["FROM 1900", "From 1900"],
  ["TO 1905", "Until 1905"],
  ["CAL 1900", "Calculated 1900"],
  ["EST 1900", "Estimated 1900"],
  ["1900..1905", "Between 1900 and 1905"],
  ["..1905", "On or before 1905"],
  ["1900..", "On or after 1900"],
  ["1900~", "About 1900"],
  ["1900?", "Possibly 1900"]
];

for (const [input, expected] of cases) {
  assert.equal(explainDate(input, meta), expected, `date phrase for ${input}`);
}
assert.equal(explainDate("13 MAY 1900", meta), null, "plain dates stay unphrased");
assert.equal(explainDate("ABT 1825", { date_approx: "Circa {date}" }), "Circa 1825", "metadata templates override defaults");

// Use the real GEDCOM-derived sample as an input fixture, not merely a copied
// synthetic example. Check the actual qualifier strings in that file.
const gedcomSample = fs.readFileSync(path.join(__dirname, "../samples/sample-en-from-gedcom.ogf.yaml"), "utf8");
for (const rawDate of ["ABT 1825", "ABT 1865", "BEF 16 DEC 1884"]) {
  assert.ok(gedcomSample.includes(rawDate), `GEDCOM sample must retain ${rawDate}`);
  assert.ok(explainDate(rawDate, meta), `GEDCOM sample date ${rawDate} must be humanized`);
}

console.log(`Date phrasing regression tests passed (${cases.length} cases + GEDCOM sample checks).`);

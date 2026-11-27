/* Shared date-phrase formatter. Stored date values are never modified. */
(function (root) {
  "use strict";

  function explainDate(value, meta) {
    if (typeof value !== "string") return null;
    const source = value.trim();
    if (!source) return null;
    const rules = meta && typeof meta === "object" ? meta : {};
    const phrase = (key, fallback, replacements) => {
      let result = String(rules[key] || fallback);
      for (const [token, replacement] of Object.entries(replacements || {})) {
        result = result.replaceAll(`{${token}}`, replacement);
      }
      return result;
    };

    // GEDCOM 5.5.1 date qualifiers. Keep the original value in the record;
    // these templates affect presentation only.
    let match = source.match(/^ABT\s+(.+)$/i);
    if (match) return phrase("date_approx", "About {date}", { date: match[1] });

    match = source.match(/^CAL\s+(.+)$/i);
    if (match) return phrase("date_calculated", "Calculated {date}", { date: match[1] });

    match = source.match(/^EST\s+(.+)$/i);
    if (match) return phrase("date_estimated", "Estimated {date}", { date: match[1] });

    match = source.match(/^BEF\s+(.+)$/i);
    if (match) return phrase("date_before", "On or before {date}", { date: match[1] });

    match = source.match(/^AFT\s+(.+)$/i);
    if (match) return phrase("date_after", "On or after {date}", { date: match[1] });

    match = source.match(/^BET\s+(.+?)\s+AND\s+(.+)$/i);
    if (match) return phrase("date_range", "Between {start} and {end}", { start: match[1], end: match[2] });

    match = source.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/i);
    if (match) return phrase("date_range", "Between {start} and {end}", { start: match[1], end: match[2] });

    match = source.match(/^FROM\s+(.+)$/i);
    if (match) return phrase("date_from", "From {date}", { date: match[1] });

    match = source.match(/^TO\s+(.+)$/i);
    if (match) return phrase("date_to", "Until {date}", { date: match[1] });

    // Existing EDTF-style expressions remain supported.
    if (source.includes("..")) {
      const [start, end] = source.split("..", 2);
      if (start && end) return phrase("date_range", "Between {start} and {end}", { start, end });
      if (!start && end) return phrase("date_before", "On or before {date}", { date: end });
      if (start && !end) return phrase("date_after", "On or after {date}", { date: start });
    }
    if (source.endsWith("~")) {
      return phrase("date_approx", "About {date}", { date: source.slice(0, -1) });
    }
    if (source.endsWith("?")) {
      return phrase("date_uncertain", "Possibly {date}", { date: source.slice(0, -1) });
    }
    return null;
  }

  const api = { explainDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OGFDatePhrasing = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

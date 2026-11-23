const SAMPLE_FILES = {
  en: "samples/sample-en.ogf.yaml",
  pl: "sample-pl.ogf.yaml"
};

const LINK_RE = /^@.+@$/;
const REF_TOKEN_RE = /@[^@\s]+@/g;
const URL_TOKEN_RE = /(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function makeExternalLink(url, label) {
  const a = document.createElement("a");
  a.href = /^www\./i.test(url) ? "https://" + url : url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label || url;
  return a;
}

function appendLinkedText(container, value, docMap) {
  // Preserve all original text while turning embedded OGF references and URLs into links.
  const text = String(value ?? "");
  const tokenRe = /@[^@\s]+@|(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  let cursor = 0;
  let match;
  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > cursor) container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith("@") && token.endsWith("@")) {
      const target = docMap[token];
      const pill = document.createElement("span");
      if (target) {
        pill.className = "link-pill";
        pill.textContent = getRecordTitle(target, docMap) + " (" + token + ")";
        pill.addEventListener("click", () => {
          state.selectedId = token;
          state.editMode = false;
          if (["Individual", "Family", "Source"].includes(target.type)) {
            state.activeTab = target.type;
            updateTabUI();
          }
          renderDirectory();
          renderInspector();
        });
      } else {
        pill.className = "link-pill link-missing";
        pill.textContent = "Missing: " + token;
      }
      container.appendChild(pill);
    } else {
      // Exclude common trailing punctuation from the clickable URL.
      const clean = token.replace(/[),.;!?]+$/, "");
      const suffix = token.slice(clean.length);
      container.appendChild(makeExternalLink(clean, clean));
      if (suffix) container.appendChild(document.createTextNode(suffix));
    }
    cursor = tokenRe.lastIndex;
  }
  if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
}

// Local GEDCOM media are resolved only after the user explicitly selects the
// media directory. The browser does not expose arbitrary disk paths from .ged.
const mediaObjectUrls = new Map();
const mediaFilesByPath = new Map();
const mediaFilesByName = new Map();

function normalizeMediaPath(value) {
  return String(value ?? "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^file:\/+/i, "")
    .replace(/^([a-z]):\//i, (_, drive) => drive.toLowerCase() + ":/")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function resolveImageReference(value, allowUnknownExtension = false) {
  const raw = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return null;

  const hasImageExtension = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|tiff?)(?:[?#].*)?$/i.test(raw);
  const hasKnownOtherExtension = /\.[a-z0-9]{2,8}(?:[?#].*)?$/i.test(raw) && !hasImageExtension;
  // OBJE.FILE is the GEDCOM media declaration. Some archives omit extensions,
  // so let the browser attempt to decode those values instead of discarding them.
  if (!hasImageExtension && (!allowUnknownExtension || hasKnownOtherExtension)) return null;

  if (/^(?:https?:|data:image\/|blob:|file:)/i.test(raw)) return raw;

  const normalized = normalizeMediaPath(raw);
  if (mediaFilesByPath.has(normalized)) return mediaFilesByPath.get(normalized);

  // Match absolute GEDCOM paths against the relative paths from a folder the
  // user selected with the media-folder picker.
  const suffixMatches = [...mediaFilesByPath.entries()]
    .filter(([path]) => path.endsWith("/" + normalized) || normalized.endsWith("/" + path));
  if (suffixMatches.length === 1) return suffixMatches[0][1];

  const basename = normalized.split("/").pop();
  const nameMatches = mediaFilesByName.get(basename) || [];
  if (nameMatches.length === 1) return nameMatches[0];

  // Relative paths can be resolved beside the viewer when it is hosted on a
  // web server. Keep path separators, but encode spaces and other URL chars.
  if (!/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(raw) && !/^file:/i.test(raw)) {
    const relativePath = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    return relativePath.split("/").map(encodeURIComponent).join("/");
  }

  // Preserve an absolute path as an explicit file URL as a last resort. Most
  // browsers still require the media-folder picker for cross-directory access.
  if (/^[a-z]:[\\/]/i.test(raw)) {
    const path = raw.replace(/\\/g, "/");
    return "file:///" + path.split("/").map((part, i) => i === 0 ? part : encodeURIComponent(part)).join("/");
  }
  if (raw.startsWith("/")) {
    return "file://" + raw.split("/").map((part, i) => i === 0 ? "" : encodeURIComponent(part)).join("/");
  }
  return null;
}

function getImageCandidates(doc) {
  const candidates = [];
  // Prefer explicit GEDCOM OBJE.FILE paths. They may have no extension, so
  // do not apply the extension-only filter used for arbitrary `*_file` keys.
  const entries = [...(doc.entries || [])].sort((a, b) => {
    const aObje = /^obje_file(?:_\d+)?$/i.test(a.key) ? 0 : 1;
    const bObje = /^obje_file(?:_\d+)?$/i.test(b.key) ? 0 : 1;
    return aObje - bObje;
  });
  for (const entry of entries) {
    if (!/(?:^|_)file(?:_\d+)?$/i.test(entry.key)) continue;
    const isObjeFile = /^obje_file(?:_\d+)?$/i.test(entry.key);
    const vals = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const value of vals) {
      const resolved = resolveImageReference(value, isObjeFile);
      if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
    }
  }
  return candidates;
}

function isImageFileReference(value) {
  return /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|tiff?)(?:[?#].*)?$/i.test(String(value ?? "").trim());
}

function createEmbeddedImage(value, altText = "", allowUnknownExtension = false) {
  const src = resolveImageReference(value, allowUnknownExtension);
  if (!src) return null;
  const img = document.createElement("img");
  img.className = "field-image-preview";
  img.setAttribute("src", src);
  img.setAttribute("alt", altText || "Attached image");
  img.loading = "lazy";
  img.addEventListener("error", () => img.remove(), { once: true });
  return img;
}

function parseGedcomCoordinate(value, axis) {
  let raw = String(Array.isArray(value) ? value[0] : value ?? "").trim().toUpperCase();
  if (!raw) return null;
  raw = raw.replace(/,/g, ".").replace(/[;,]$/, "").trim();

  const hemiMatch = raw.match(/^([NSEW])\s*|\s*([NSEW])$/);
  const hemisphere = hemiMatch ? (hemiMatch[1] || hemiMatch[2]) : null;
  if (hemisphere && ((axis === "lat" && !/[NS]/.test(hemisphere)) || (axis === "lon" && !/[EW]/.test(hemisphere)))) return null;
  raw = raw.replace(/^[NSEW]\s*|\s*[NSEW]$/g, "").trim();

  // Accept decimal degrees, GEDCOM degrees/minutes/seconds, and colon DMS.
  const parts = raw.replace(/[°º]/g, " ").replace(/[′']/g, " ").replace(/[″"]/g, " ")
    .replace(/[DMS]/g, " ").replace(/:/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3 || parts.some(part => !/^[+-]?\d+(?:\.\d+)?$/.test(part))) return null;
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isFinite(n))) return null;
  let result = Math.abs(nums[0]);
  if (nums.length > 1) result += Math.abs(nums[1]) / 60;
  if (nums.length > 2) result += Math.abs(nums[2]) / 3600;
  const negative = hemisphere ? /[SW]/.test(hemisphere) : nums[0] < 0;
  if (negative) result *= -1;
  const limit = axis === "lat" ? 90 : 180;
  if (Math.abs(result) > limit || (nums.length > 1 && (nums[1] >= 60 || nums[1] < 0)) || (nums.length > 2 && (nums[2] >= 60 || nums[2] < 0))) return null;
  return result;
}

function findCoordinatePairs(doc) {
  const entries = Object.fromEntries((doc.entries || []).map(e => [e.key.toLowerCase(), e.value]));
  const latKeys = Object.keys(entries).filter(key => /(?:^|_)(?:lati|latitude)$/.test(key));
  const pairs = [];
  for (const latKey of latKeys) {
    const base = latKey.replace(/(?:^|_)(?:lati|latitude)$/, "");
    const longKey = Object.keys(entries).find(key =>
      key.replace(/(?:^|_)(?:long|longi|longitude)$/, "") === base && /(?:^|_)(?:long|longi|longitude)$/.test(key)
    );
    if (!longKey) continue;
    const lat = parseGedcomCoordinate(entries[latKey], "lat");
    const lon = parseGedcomCoordinate(entries[longKey], "lon");
    if (lat !== null && lon !== null && !pairs.some(p => p.lat === lat && p.lon === lon)) {
      pairs.push({ lat, lon, label: base.replace(/_/g, " ").trim(), latKey, longKey });
    }
  }
  return pairs;
}

let state = {
  docs: [],
  meta: {},
  dict: {},
  dictGroups: [],
  activeTab: "Individual",
  selectedId: null,
  editMode: false
};

function unquote(val) {
  if (typeof val !== "string") return val;
  const s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseYamlStream(text) {
  const chunks = text.split(/^---\s*$/gm);
  const docs = [];

  for (const rawChunk of chunks) {
    if (!rawChunk || !rawChunk.trim()) continue;
    const lines = rawChunk.split(/\r?\n/);
    const entries = [];
    let currentKey = null;
    let groupIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        if (entries.length > 0) groupIndex++;
        continue;
      }
      if (trimmed.startsWith("#")) continue;

      const listMatch = line.match(/^\s*-\s+(.*)$/);
      if (listMatch && currentKey !== null) {
        const last = entries[entries.length - 1];
        if (!Array.isArray(last.value)) last.value = [];
        last.value.push(unquote(listMatch[1]));
        continue;
      }

      const kvIdx = line.indexOf(":");
      if (kvIdx > 0) {
        const key = line.slice(0, kvIdx).trim();
        const rawVal = line.slice(kvIdx + 1).trim();
        currentKey = key;
        if (rawVal === "") {
          entries.push({ key, value: [], group: groupIndex });
        } else {
          entries.push({ key, value: unquote(rawVal), group: groupIndex });
        }
      }
    }

    if (entries.length > 0) {
      const map = {};
      entries.forEach(e => { map[e.key] = e.value; });
      docs.push({ id: map.id || "", type: map.type || "Record", entries, map });
    }
  }
  return docs;
}

function serializeYamlStream(docs) {
  return docs.map(doc => {
    const out = ["---"];
    let prevGroup = null;
    for (const entry of doc.entries) {
      if (prevGroup !== null && entry.group !== prevGroup) {
        out.push("");
      }
      prevGroup = entry.group;
      if (Array.isArray(entry.value)) {
        out.push(entry.key + ":");
        for (const item of entry.value) {
          out.push("  - " + formatScalar(item));
        }
      } else {
        out.push(entry.key + ": " + formatScalar(entry.value));
      }
    }
    return out.join("\n");
  }).join("\n") + "\n";
}

function formatScalar(val) {
  const s = String(val ?? "");
  if (s === "") return '""';
  if (
    s.startsWith("@") ||
    s.startsWith("~") ||
    s.startsWith("..") ||
    s.includes(": ") ||
    s.includes("#") ||
    s.includes("{")
  ) {
    return '"' + s.replace(/"/g, '\\"') + '"';
  }
  return s;
}

function explainDate(val) {
  if (typeof val !== "string") return null;
  const s = val.trim();
  const m = state.meta;
  if (s.includes("..")) {
    const [start, end] = s.split("..");
    if (start && end) {
      const tpl = m.date_range || "Between {start} and {end}";
      return tpl.replace("{start}", start).replace("{end}", end);
    }
    if (!start && end) {
      const tpl = m.date_before || "On or before {date}";
      return tpl.replace("{date}", end);
    }
    if (start && !end) {
      const tpl = m.date_after || "On or after {date}";
      return tpl.replace("{date}", start);
    }
  }
  if (s.endsWith("~")) {
    const tpl = m.date_approx || "About {date}";
    return tpl.replace("{date}", s.slice(0, -1));
  }
  if (s.endsWith("?")) {
    const tpl = m.date_uncertain || "Possibly {date}";
    return tpl.replace("{date}", s.slice(0, -1));
  }
  return null;
}

function getRecordTitle(doc, docMap) {
  const m = doc.map;
  if (doc.type === "Individual") {
    // GEDCOM NAME is retained verbatim by the structural importer.
    if (m.name !== undefined && m.name !== null) return String(m.name);
    const first = m.name_first || m.imie || m.given_name || "";
    const last = m.name_last || m.nazwisko || m.surname || m.name_maiden || m.nazwisko_rodowe || "";
    const full = (first + " " + last).trim() || m.full_name || m.name_alias || m.pseudonim;
    if (full) return full;
  }
  if (doc.type === "Source") {
    const sourceTitle = m.titl || m.title || m.abbr || m.auth;
    if (sourceTitle) return String(sourceTitle);
  }
  if (doc.type === "Family") {
    // GEDCOM family records use HUSB/WIFE; the structural importer stores
    // these tags as lowercase keys (husb/wife). Keep legacy OGF keys too.
    const hId = m.husb || m.husband_id || m.maz_id;
    const wId = m.wife || m.wife_id || m.zona_id;
    const hName = hId && docMap[hId] ? getRecordTitle(docMap[hId], docMap) : "";
    const wName = wId && docMap[wId] ? getRecordTitle(docMap[wId], docMap) : "";
    if (hName || wName) return [hName || "?", wName || "?"].join(" + ");
  }
  return m.title || doc.id || "Untitled";
}

function getRecordDate(doc) {
  const m = doc.map;
  return m.birth_date || m.urodzenie_data || m.birt_date || m.marriage_date || m.slub_data || m.marr_date || m.date || "";
}

function getRecordPlace(doc) {
  const m = doc.map;
  return m.birth_place || m.urodzenie_miejsce || m.birt_place || m.marriage_place || m.slub_miejsce || m.marr_place || m.place || "";
}

function rebuildFromEditor() {
  const editor = document.getElementById("yaml-editor");
  const status = document.getElementById("yaml-status");
  try {
    const docs = parseYamlStream(editor.value);
    state.docs = docs;
    state.meta = {};
    state.dict = {};
    state.dictGroups = [];

    for (const d of docs) {
      if (d.id === "@meta@" || d.type === "Meta") {
        state.meta = d.map;
      } else if (d.id === "@dictionary@" || d.type === "Dictionary") {
        for (const e of d.entries) {
          if (e.key === "id" || e.key === "type") continue;
          const raw = String(e.value || "");
          const parts = raw.split(/\s+[—-]\s+/);
          state.dict[e.key] = {
            label: parts.length > 1 ? parts[0].trim() : (raw || formatKeyLabel(e.key)),
            desc: parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
            group: e.group
          };
        }
      }
    }

    const lang = (state.meta.language || "en").toUpperCase();
    document.getElementById("lang-badge").textContent = "LANG: " + lang;
    status.textContent = "Valid (" + docs.length + " docs)";
    status.style.color = "#4ade80";

    renderDirectory();
    renderInspector();
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#f87171";
  }
}

function formatKeyLabel(key) {
  if (state.dict[key]) return state.dict[key].label;
  return key.replace(/_ids?$/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getDisplayDocs() {
  return state.docs.filter(d => d.id !== "@meta@" && d.id !== "@dictionary@" && d.type !== "Meta" && d.type !== "Dictionary");
}

function renderDirectory() {
  const allDisplay = getDisplayDocs();
  const docMap = Object.fromEntries(state.docs.map(d => [d.id, d]));

  const inds = allDisplay.filter(d => d.type === "Individual");
  const fams = allDisplay.filter(d => d.type === "Family");
  const sources = allDisplay.filter(d => d.type === "Source");

  document.getElementById("tab-ind").textContent = `Individuals (${inds.length})`;
  document.getElementById("tab-fam").textContent = `Families (${fams.length})`;
  const sourceTab = document.getElementById("tab-source");
  if (sourceTab) sourceTab.textContent = `Sources (${sources.length})`;
  document.getElementById("tab-all").textContent = `All (${allDisplay.length})`;

  let filtered = allDisplay;
  if (state.activeTab === "Individual") filtered = inds;
  else if (state.activeTab === "Family") filtered = fams;
  else if (state.activeTab === "Source") filtered = sources;

  const q = document.getElementById("search-input").value.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(d => {
      const title = getRecordTitle(d, docMap).toLowerCase();
      const raw = JSON.stringify(d.map).toLowerCase();
      return title.includes(q) || raw.includes(q);
    });
  }

  const sortMode = document.getElementById("sort-select").value;
  filtered = [...filtered];
  if (sortMode === "name_asc") {
    filtered.sort((a, b) => getRecordTitle(a, docMap).localeCompare(getRecordTitle(b, docMap)));
  } else if (sortMode === "name_desc") {
    filtered.sort((a, b) => getRecordTitle(b, docMap).localeCompare(getRecordTitle(a, docMap)));
  } else if (sortMode === "date_asc") {
    filtered.sort((a, b) => (getRecordDate(a) || "9999").localeCompare(getRecordDate(b) || "9999"));
  } else if (sortMode === "date_desc") {
    filtered.sort((a, b) => (getRecordDate(b) || "0000").localeCompare(getRecordDate(a) || "0000"));
  }

  if (!state.selectedId && filtered.length > 0) {
    state.selectedId = filtered[0].id;
  }

  const listEl = document.getElementById("record-list");
  listEl.innerHTML = "";

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted); font-size:13px;">No matching records</div>`;
    return;
  }

  for (const doc of filtered) {
    const item = document.createElement("div");
    item.className = "record-item" + (doc.id === state.selectedId ? " selected" : "");
    const title = getRecordTitle(doc, docMap);
    const dt = getRecordDate(doc);
    const pl = getRecordPlace(doc);
    const exp = dt ? explainDate(dt) : null;

    item.innerHTML = `
      <div class="record-title">
        <span>${escapeHtml(title)}</span>
        <span class="record-id">${escapeHtml(doc.id)}</span>
      </div>
      <div class="record-sub">
        ${dt ? `<span>📅 ${escapeHtml(dt)}</span>` : ""}
        ${exp ? `<span class="date-badge">${escapeHtml(exp)}</span>` : ""}
        ${pl ? `<span>📍 ${escapeHtml(pl)}</span>` : ""}
      </div>
    `;
    item.addEventListener("click", () => {
      state.selectedId = doc.id;
      state.editMode = false;
      renderDirectory();
      renderInspector();
    });
    listEl.appendChild(item);
  }
}

function renderInspector() {
  const container = document.getElementById("card-container");
  const docMap = Object.fromEntries(state.docs.map(d => [d.id, d]));
  const doc = docMap[state.selectedId];

  if (!doc) {
    container.innerHTML = `<div style="text-align:center; color:var(--muted); padding:40px;">Select a record from the list to inspect its details.</div>`;
    return;
  }

  if (state.editMode) {
    renderEditorCard(container, doc);
    return;
  }

  const title = getRecordTitle(doc, docMap);

  // Group entries either by dictionary group or YAML blank-line group
  const groups = [];
  let currentGroup = [];
  let lastGroupKey = null;

  for (const entry of doc.entries) {
    if (entry.key === "id" || entry.key === "type") continue;
    // YAML blank-line groups are the persisted card layout; dictionary groups
    // are metadata for the field picker, not an override of user layout.
    const gKey = "yaml_" + entry.group;
    if (lastGroupKey !== null && gKey !== lastGroupKey && currentGroup.length > 0) {
      groups.push({ key: lastGroupKey, entries: currentGroup });
      currentGroup = [];
    }
    currentGroup.push(entry);
    lastGroupKey = gKey;
  }
  if (currentGroup.length > 0) groups.push({ key: lastGroupKey, entries: currentGroup });

  function saveGroupLayout(nextGroups) {
    const identity = doc.entries.filter(e => e.key === "id" || e.key === "type");
    const ordered = nextGroups.flatMap((group, index) => {
      group.entries.forEach(entry => { entry.group = index + 1; });
      return group.entries;
    });
    doc.entries = [...identity, ...ordered];
    state.editMode = false;
    syncDocsToEditor();
  }

  // Find incoming backlinks
  const backlinks = [];
  for (const other of getDisplayDocs()) {
    if (other.id === doc.id) continue;
    for (const e of other.entries) {
      const vals = Array.isArray(e.value) ? e.value : [e.value];
      if (vals.includes(doc.id)) {
        backlinks.push({ from: other, key: e.key });
      }
    }
  }

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-meta">${escapeHtml(doc.type)} &bull; ${escapeHtml(doc.id)}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button id="edit-card-btn">Edit Card</button>
        <button id="delete-card-btn" style="color:var(--red-text)">Delete</button>
      </div>
    </div>
    <div class="card-body" id="card-fields"></div>
  `;

  const fieldsEl = card.querySelector("#card-fields");
  const contentLayout = document.createElement("div");
  contentLayout.className = "card-content-layout";
  // Replace only the fields container and keep the card attached to the page
  // before attempting any optional media lookup. A missing/unreadable image
  // must never prevent the record card or its ordinary fields from rendering.
  fieldsEl.replaceWith(contentLayout);
  contentLayout.appendChild(fieldsEl);
  container.innerHTML = "";
  container.appendChild(card);

  let portraitUrl = null;
  try {
    portraitUrl = getImageCandidates(doc)[0] || null;
  } catch (mediaError) {
    console.warn("Could not resolve record media; rendering the record without a portrait.", mediaError);
  }
  if (portraitUrl) {
    try {
      const portraitColumn = document.createElement("div");
      portraitColumn.className = "card-portrait-column";
      const portrait = document.createElement("img");
      portrait.className = "record-portrait";
      portrait.setAttribute("src", portraitUrl);
      portrait.setAttribute("alt", title);
      portrait.loading = "eager";
      portrait.addEventListener("error", () => {
        // A missing media folder affects only the optional portrait. Leave the
        // card and its OBJE.FILE path visible and do not replace the content.
        portraitColumn.remove();
        if (!card.querySelector(".media-load-hint")) {
          const hint = document.createElement("div");
          hint.className = "media-load-hint";
          hint.textContent = "Image unavailable. The record data is still displayed; use ‘Load media folder’ only if you want to view local images.";
          contentLayout.insertBefore(hint, fieldsEl);
        }
      }, { once: true });
      portraitColumn.appendChild(portrait);
      contentLayout.insertBefore(portraitColumn, fieldsEl);
    } catch (mediaError) {
      console.warn("Could not display record portrait; rendering the record without it.", mediaError);
    }
  }
  const coordinatePairs = findCoordinatePairs(doc);
  const mapLinksByLongKey = new Map();
  for (const coordinates of coordinatePairs) {
    const mapUrl = `https://www.google.com/maps/@${coordinates.lat},${coordinates.lon},15z`;
    const label = coordinates.label
      ? `Open ${coordinates.label} in Google Maps`
      : "Open coordinates in Google Maps";
    const mapLink = makeExternalLink(mapUrl, "📍 " + label);
    mapLink.className = "map-link";
    mapLink.title = `${coordinates.lat}, ${coordinates.lon}`;
    mapLinksByLongKey.set(coordinates.longKey, mapLink);
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const grp = groups[groupIndex];
    const grpDiv = document.createElement("div");
    grpDiv.className = "field-group";

    const groupToolbar = document.createElement("div");
    groupToolbar.className = "field-group-toolbar";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.title = "Move section up";
    upBtn.disabled = groupIndex === 0;
    upBtn.addEventListener("click", () => {
      const next = groups.map(g => ({ ...g, entries: [...g.entries] }));
      [next[groupIndex - 1], next[groupIndex]] = [next[groupIndex], next[groupIndex - 1]];
      saveGroupLayout(next);
    });
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.title = "Move section down";
    downBtn.disabled = groupIndex === groups.length - 1;
    downBtn.addEventListener("click", () => {
      const next = groups.map(g => ({ ...g, entries: [...g.entries] }));
      [next[groupIndex], next[groupIndex + 1]] = [next[groupIndex + 1], next[groupIndex]];
      saveGroupLayout(next);
    });
    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button";
    mergeBtn.textContent = "Merge with previous";
    mergeBtn.title = "Merge this section into the previous section";
    mergeBtn.disabled = groupIndex === 0;
    mergeBtn.addEventListener("click", () => {
      const next = groups.map(g => ({ ...g, entries: [...g.entries] }));
      next[groupIndex - 1].entries.push(...next[groupIndex].entries);
      next.splice(groupIndex, 1);
      saveGroupLayout(next);
    });
    groupToolbar.append(upBtn, downBtn, mergeBtn);
    grpDiv.appendChild(groupToolbar);

    for (let fieldIndex = 0; fieldIndex < grp.entries.length; fieldIndex++) {
      const entry = grp.entries[fieldIndex];
      const row = document.createElement("div");
      row.className = "field-row";

      const labelDiv = document.createElement("div");
      labelDiv.className = "field-label";
      const labelText = formatKeyLabel(entry.key);
      const dictInfo = state.dict[entry.key];

      const fieldDescription = dictInfo && typeof dictInfo.desc === "string"
        ? dictInfo.desc.trim()
        : "";
      if (fieldDescription) {
        labelDiv.innerHTML = `<span class="field-label-text">${escapeHtml(labelText)}</span><button type="button" class="tip-icon" aria-label="Show description for ${escapeHtml(labelText)}" title="Show field description">?</button>`;
        const tipIcon = labelDiv.querySelector(".tip-icon");
        tipIcon.addEventListener("mouseenter", e => showTooltip(e, entry.key, fieldDescription));
        tipIcon.addEventListener("mousemove", moveTooltip);
        tipIcon.addEventListener("mouseleave", hideTooltip);
        tipIcon.addEventListener("focus", e => showTooltip(e, entry.key, fieldDescription));
        tipIcon.addEventListener("blur", hideTooltip);
      } else {
        labelDiv.textContent = labelText;
        labelDiv.title = entry.key;
      }

      const valDiv = document.createElement("div");
      valDiv.className = "field-val";
      const values = Array.isArray(entry.value) ? entry.value : [entry.value];

      for (const v of values) {
        const valueSpan = document.createElement("span");
        appendLinkedText(valueSpan, v, docMap);
        valDiv.appendChild(valueSpan);

        // Embed image files directly beneath their GEDCOM/OGF field value.
        // This creates a real <img src="..."> element, not merely a link.
        const isObjeFile = /^obje_file(?:_\d+)?$/i.test(entry.key);
        // OBJE.FILE is represented once as the card portrait above; keep its
        // original path as text here, but never render a duplicate thumbnail.
        if (!isObjeFile && isImageFileReference(v) && /(?:^|_)file(?:_\d+)?$/i.test(entry.key)) {
          const embeddedImage = createEmbeddedImage(v, title, false);
          if (embeddedImage) valDiv.appendChild(embeddedImage);
        }

        const dateExp = explainDate(String(v));
        if (dateExp) {
          const badge = document.createElement("span");
          badge.className = "date-badge";
          badge.textContent = dateExp;
          valDiv.appendChild(badge);
        }
      }


      const mapLink = mapLinksByLongKey.get(entry.key.toLowerCase());
      if (mapLink) {
        const mapWrap = document.createElement("div");
        mapWrap.className = "map-link-wrap";
        mapWrap.appendChild(mapLink);
        valDiv.appendChild(mapWrap);
      }
      row.appendChild(labelDiv);
      row.appendChild(valDiv);
      if (fieldIndex < grp.entries.length - 1) {
        const splitBtn = document.createElement("button");
        splitBtn.type = "button";
        splitBtn.className = "split-field-btn";
        splitBtn.textContent = "✂";
        splitBtn.setAttribute("aria-label", "Split section after this field");
        splitBtn.title = "Split section after this field";
        splitBtn.addEventListener("click", () => {
          const next = groups.map(g => ({ ...g, entries: [...g.entries] }));
          const current = next[groupIndex];
          const before = current.entries.slice(0, fieldIndex + 1);
          const after = current.entries.slice(fieldIndex + 1);
          current.entries = before;
          next.splice(groupIndex + 1, 0, { key: "split_" + Date.now(), entries: after });
          saveGroupLayout(next);
        });
        row.appendChild(splitBtn);
      }
      grpDiv.appendChild(row);
    }
    fieldsEl.appendChild(grpDiv);
  }

  if (backlinks.length > 0) {
    const blDiv = document.createElement("div");
    blDiv.className = "backlinks";
    blDiv.innerHTML = `<h4>Referenced In</h4><div class="field-val" id="bl-list"></div>`;
    const blList = blDiv.querySelector("#bl-list");

    for (const bl of backlinks) {
      const pill = document.createElement("span");
      pill.className = "link-pill";
      pill.textContent = `${formatKeyLabel(bl.key)} in ${getRecordTitle(bl.from, docMap)}`;
      pill.addEventListener("click", () => {
        state.selectedId = bl.from.id;
        renderDirectory();
        renderInspector();
      });
      blList.appendChild(pill);
    }
    card.appendChild(blDiv);
  }

  card.querySelector("#edit-card-btn").addEventListener("click", () => {
    state.editMode = true;
    renderInspector();
  });

  card.querySelector("#delete-card-btn").addEventListener("click", () => {
    state.docs = state.docs.filter(d => d.id !== doc.id);
    state.selectedId = null;
    syncDocsToEditor();
  });
}

function renderEditorCard(container, doc) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">Editing ${escapeHtml(doc.id)}</div>
        <div class="card-meta">${escapeHtml(doc.type)}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button id="cancel-edit-btn">Cancel</button>
        <button class="primary" id="save-edit-btn">Save Changes</button>
      </div>
    </div>
    <div class="card-body">
      <p class="editor-hint">Fields available here come from <code>@dictionary@</code>. Add custom keys in Edit Dictionary first.</p>
      <div id="edit-rows"></div>
      <div>
        <button id="add-field-btn">+ Add Field</button>
      </div>
    </div>
  `;

  const rowsEl = card.querySelector("#edit-rows");
  const dictionaryOptions = Object.keys(state.dict).sort((a, b) => {
    const ga = Number(state.dict[a].group) || 0, gb = Number(state.dict[b].group) || 0;
    return ga - gb || state.dict[a].label.localeCompare(state.dict[b].label);
  });

  function addEditRow(key = "", value = "", group = 1) {
    const row = document.createElement("div");
    row.className = "edit-row";
    row.dataset.group = String(group);
    const keySelect = document.createElement("select");
    keySelect.className = "ekey";
    keySelect.appendChild(new Option("Select a dictionary field…", ""));
    for (const dictionaryKey of dictionaryOptions) {
      const info = state.dict[dictionaryKey];
      keySelect.appendChild(new Option(`${info.label} (${dictionaryKey})`, dictionaryKey));
    }
    if (key && !dictionaryOptions.includes(key)) {
      keySelect.appendChild(new Option(`${formatKeyLabel(key)} (${key}) — existing field`, key));
    }
    keySelect.value = key;

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "eval";
    valueInput.value = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    valueInput.placeholder = "Value or @id@ (comma-separated for list)";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.title = "Remove field";
    removeButton.textContent = "×";
    removeButton.style.cssText = "padding:4px 8px; color:var(--red-text)";
    removeButton.addEventListener("click", () => row.remove());

    row.append(keySelect, valueInput, removeButton);
    rowsEl.appendChild(row);
  }

  let maxGroup = 0;
  for (const entry of doc.entries) {
    if (entry.key === "id" || entry.key === "type") continue;
    maxGroup = Math.max(maxGroup, Number(entry.group) || 0);
    addEditRow(entry.key, entry.value, entry.group || 1);
  }

  card.querySelector("#add-field-btn").addEventListener("click", () => {
    if (dictionaryOptions.length === 0) {
      alert("Add a field to @dictionary@ first using Edit Dictionary.");
      return;
    }
    addEditRow("", "", maxGroup + 1);
  });
  card.querySelector("#cancel-edit-btn").addEventListener("click", () => {
    state.editMode = false;
    renderInspector();
  });

  card.querySelector("#save-edit-btn").addEventListener("click", () => {
    const newEntries = [
      { key: "id", value: doc.id, group: 0 },
      { key: "type", value: doc.type, group: 0 }
    ];
    const seen = new Set();
    let duplicate = null;
    rowsEl.querySelectorAll(".edit-row").forEach(r => {
      const k = r.querySelector(".ekey").value.trim();
      if (!k) return;
      if (seen.has(k)) duplicate = k;
      seen.add(k);
    });
    if (duplicate) {
      alert(`The field "${duplicate}" is selected more than once.`);
      return;
    }

    rowsEl.querySelectorAll(".edit-row").forEach(r => {
      const k = r.querySelector(".ekey").value.trim();
      const v = r.querySelector(".eval").value.trim();
      if (!k) return;
      const group = Number(r.dataset.group) || 1;
      if (k.endsWith("_ids") || v.includes(", @")) {
        const items = v.split(",").map(x => x.trim()).filter(Boolean);
        newEntries.push({ key: k, value: items, group });
      } else {
        newEntries.push({ key: k, value: v, group });
      }
    });
    doc.entries = newEntries;
    state.editMode = false;
    syncDocsToEditor();
  });

  container.innerHTML = "";
  container.appendChild(card);
}

function syncDocsToEditor() {
  const editor = document.getElementById("yaml-editor");
  editor.value = serializeYamlStream(state.docs);
  rebuildFromEditor();
}

// Tooltip helpers
const tooltipEl = document.getElementById("tooltip");
function showTooltip(e, key, desc) {
  tooltipEl.innerHTML = `<span class="tt-key">${escapeHtml(key)}</span>${escapeHtml(desc)}`;
  tooltipEl.style.display = "block";
  moveTooltip(e);
}
function moveTooltip(e) {
  const pad = 12;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 10) y = e.clientY - rect.height - pad;
  tooltipEl.style.left = Math.max(8, x) + "px";
  tooltipEl.style.top = Math.max(8, y) + "px";
}
function hideTooltip() {
  tooltipEl.style.display = "none";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateTabUI() {
  document.querySelectorAll(".tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === state.activeTab);
  });
}

// GEDCOM structural converter
// Preserve tag names, values, and complete tag paths without semantic mapping.
function convertGedcomToOgf(gedText) {
  const lines = gedText.split(/\r?\n/);
  const records = [];
  let currentRec = null;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const match = rawLine.replace(/\r$/, "").match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    const xref = match[2] || null;
    const tag = match[3];
    const val = match[4] ?? "";

    if (level === 0) {
      if (currentRec) records.push(currentRec);
      currentRec = { xref, tag, val, children: [] };
    } else if (currentRec) {
      const node = { level, tag, val, children: [] };
      let parent = currentRec;
      while (
        parent.children.length > 0 &&
        parent.children[parent.children.length - 1].level < level
      ) {
        parent = parent.children[parent.children.length - 1];
      }
      parent.children.push(node);
    }
  }
  if (currentRec) records.push(currentRec);

  // Keep GEDCOM xrefs as record IDs. GEDCOM relationship values such as
  // FAMC @F1@ and HUSB @I1@ must resolve to these exact IDs in the viewer.
  // Rewriting record IDs without rewriting every reference breaks the links.

  // GEDCOM 5.5.1 commonly stores media in a separate level-0 OBJE record:
  //   1 OBJE @O1@
  //   0 @O1@ OBJE
  //     1 FILE photos/person.jpg
  // Keep OBJE records out of the card directory, but resolve their FILE paths
  // onto the referencing record as additional `obje_file` fields. The original
  // `obje: @O1@` pointer is retained unchanged.
  const rawObjectFilesById = new Map();
  function collectObjectFiles(node, output) {
    if (node.tag === "FILE" && node.val) output.push(node.val);
    for (const child of node.children || []) collectObjectFiles(child, output);
  }
  for (const objectRecord of records) {
    if (objectRecord.tag !== "OBJE" || !objectRecord.xref) continue;
    const files = [];
    collectObjectFiles(objectRecord, files);
    if (files.length) rawObjectFilesById.set(objectRecord.xref, files);
  }

  function cleanTag(tag) {
    // Lowercase only. In particular, preserve leading underscores in extension tags.
    return tag.toLowerCase();
  }

  const outDocs = [
    {
      id: "@meta@",
      type: "Meta",
      entries: [
        { key: "id", value: "@meta@", group: 0 },
        { key: "type", value: "Meta", group: 0 },
        { key: "language", value: "en", group: 0 },
        { key: "encoding", value: "UTF-8", group: 0 },
        { key: "date_approx", value: "About {date}", group: 1 },
        { key: "date_uncertain", value: "Possibly {date}", group: 1 },
        { key: "date_range", value: "Between {start} and {end}", group: 1 },
        { key: "date_before", value: "On or before {date}", group: 1 },
        { key: "date_after", value: "On or after {date}", group: 1 }
      ]
    }
  ];

  const emittedRecordDocs = [];
  const rawFamilyById = new Map(records.filter(r => r.tag === "FAM" && r.xref).map(r => [r.xref, r]));

  for (const rec of records) {
    if (!rec.xref || !["INDI", "FAM", "SOUR"].includes(rec.tag)) continue;

    const type = rec.tag === "INDI" ? "Individual" : rec.tag === "FAM" ? "Family" : "Source";
    const id = rec.xref;
    const entries = [
      { key: "id", value: id, group: 0 },
      { key: "type", value: type, group: 0 }
    ];
    const keyCounts = {};
    let group = 0;

    function addEntry(baseKey, value) {
      // Empty GEDCOM values are meaningful and must not be discarded.
      if (value === null || value === undefined) return;
      keyCounts[baseKey] = (keyCounts[baseKey] || 0) + 1;
      const finalKey = keyCounts[baseKey] === 1
        ? baseKey
        : `${baseKey}_${keyCounts[baseKey]}`;
      entries.push({ key: finalKey, value, group });
    }

    function emitGedcomNode(node, parentPath) {
      const key = parentPath
        ? `${parentPath}_${cleanTag(node.tag)}`
        : cleanTag(node.tag);

      // GEDCOM uses slashes to delimit the surname in NAME values.
      // They are syntax markers, not part of the person's display name.
      // Remove them only from the top-level NAME value on INDI records;
      // keep all other GEDCOM values and NAME subfields unchanged.
      let value = node.val;
      if (rec.tag === "INDI" && parentPath === "" && node.tag === "NAME") {
        value = value.replace(/\//g, "").trim();
      }

      // Drop an Individual-side FAMC/FAMS pointer only when the referenced
      // Family record contains the matching reciprocal CHIL/HUSB/WIFE link.
      // Descendant data such as FAMC.PEDI remains flattened and preserved.
      if (rec.tag === "INDI" && parentPath === "" &&
          (node.tag === "FAMC" || node.tag === "FAMS")) {
        const family = rawFamilyById.get(value);
        const individualId = rec.xref;
        const reciprocal = family && family.children.some(child =>
          node.tag === "FAMS"
            ? ((child.tag === "HUSB" || child.tag === "WIFE") && child.val === individualId)
            : (child.tag === "CHIL" && child.val === individualId)
        );
        if (reciprocal) value = null;
      }

      // A valueless structural parent (e.g. BIRT) is only a path component;
      // do not create an extra empty OGF field for it. Keep values on parents
      // when present (e.g. NAME), and preserve empty leaf values.
      if (value !== null && (value !== "" || node.children.length === 0)) {
        addEntry(key, value);
      }

      // Resolve a pointer to a separate GEDCOM multimedia record. This adds
      // the actual file path needed by <img src="..."> while preserving the
      // original OBJE reference for round-tripping and navigation.
      if (node.tag === "OBJE" && /^@[^@]+@$/.test(String(value || ""))) {
        const objectFiles = rawObjectFilesById.get(value) || [];
        for (const filePath of objectFiles) addEntry("obje_file", filePath);
      }

      for (const child of node.children) {
        emitGedcomNode(child, key);
      }
    }

    for (const node of rec.children) {
      group++;
      emitGedcomNode(node, "");
    }

    const recordDoc = {
      id,
      type,
      entries,
      map: Object.fromEntries(entries.map(entry => [entry.key, entry.value]))
    };
    outDocs.push(recordDoc);
    emittedRecordDocs.push(recordDoc);
  }

  // Build a dictionary from exactly the keys emitted by this import.
  // Curated descriptions are intentionally limited to well-known GEDCOM paths;
  // unknown/custom keys receive neutral labels and no invented description.
  const curatedLabels = {
    name: "Name", name_givn: "Given Name", name_surn: "Surname",
    birt_date: "Birth Date", birt_plac: "Birth Place",
    deat_date: "Death Date", deat_plac: "Death Place",
    marr_date: "Marriage Date", marr_plac: "Marriage Place",
    husb: "Husband", wife: "Wife", chil: "Child",
    titl: "Title", auth: "Author", publ: "Publication",
    data_date: "Data Date", data_text: "Data Text"
  };
  const importedKeys = new Map();
  for (const recordDoc of emittedRecordDocs) {
    for (const entry of recordDoc.entries) {
      if (entry.key !== "id" && entry.key !== "type" && !importedKeys.has(entry.key)) {
        importedKeys.set(entry.key, entry.group);
      }
    }
  }
  const dictionaryEntries = [
    { key: "id", value: "@dictionary@", group: 0 },
    { key: "type", value: "Dictionary", group: 0 }
  ];
  for (const key of [...importedKeys.keys()].sort()) {
    const label = curatedLabels[key] || key.replace(/_\d+$/, "").replace(/^_+/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    dictionaryEntries.push({ key, value: label, group: importedKeys.get(key) });
  }
  outDocs.splice(1, 0, {
    id: "@dictionary@",
    type: "Dictionary",
    entries: dictionaryEntries,
    map: Object.fromEntries(dictionaryEntries.map(entry => [entry.key, entry.value]))
  });

  return serializeYamlStream(outDocs);
}

// Batch Key Replacer Logic
const replacerModal = document.getElementById("replacer-modal");
const replacerRowsEl = document.getElementById("replacer-rows");

document.getElementById("replace-keys-btn").addEventListener("click", () => {
  const counts = {};
  for (const doc of state.docs) {
    for (const e of doc.entries) {
      if (e.key === "id" || e.key === "type") continue;
      counts[e.key] = (counts[e.key] || 0) + 1;
    }
  }
  replacerRowsEl.innerHTML = "";
  const keys = Object.keys(counts);
  if (keys.length === 0) {
    replacerRowsEl.innerHTML = `<div style="color:var(--muted)">No custom keys found in the current YAML stream.</div>`;
  } else {
    for (const k of keys) {
      const row = document.createElement("div");
      row.className = "replacer-grid";
      row.innerHTML = `
        <code style="background:#f1f5f9; padding:4px 6px; border-radius:4px;">${escapeHtml(k)}</code>
        <span style="text-align:center; color:var(--muted);">&rarr;</span>
        <input type="text" data-old-key="${escapeHtml(k)}" value="${escapeHtml(k)}" placeholder="New key name">
        <span style="color:var(--muted); font-size:12px;">${counts[k]}x</span>
      `;
      replacerRowsEl.appendChild(row);
    }
  }
  replacerModal.classList.add("open");
});

document.getElementById("close-replacer-btn").addEventListener("click", () => replacerModal.classList.remove("open"));
document.getElementById("cancel-replacer-btn").addEventListener("click", () => replacerModal.classList.remove("open"));

document.getElementById("apply-replacer-btn").addEventListener("click", () => {
  const mapping = {};
  replacerRowsEl.querySelectorAll("input[data-old-key]").forEach(inp => {
    const oldK = inp.dataset.oldKey;
    const newK = inp.value.trim();
    if (newK && newK !== oldK) {
      mapping[oldK] = newK;
    }
  });

  if (Object.keys(mapping).length > 0) {
    // Refuse collisions rather than silently merging or overwriting fields.
    for (const doc of state.docs) {
      const resultingKeys = doc.entries.map(entry => mapping[entry.key] || entry.key);
      const seen = new Set();
      const duplicate = resultingKeys.find(key => seen.has(key) || !seen.add(key));
      if (duplicate) {
        alert(`Replacement would create duplicate key "${duplicate}" in ${doc.id}. No keys were changed.`);
        return;
      }
    }
    for (const doc of state.docs) {
      for (const e of doc.entries) {
        if (mapping[e.key]) e.key = mapping[e.key];
      }
    }
    syncDocsToEditor();
  }
  replacerModal.classList.remove("open");
});

// Dictionary editor: the dictionary is the only source of fields available in card editors.
const dictionaryModal = document.getElementById("dictionary-modal");
const dictionaryRowsEl = document.getElementById("dictionary-rows");

function addDictionaryEditorRow(key = "", label = "", desc = "", group = 1) {
  const row = document.createElement("div");
  row.className = "dictionary-row";
  row.innerHTML = `
    <input class="dict-key" type="text" value="${escapeHtml(key)}" placeholder="custom_field">
    <input class="dict-label" type="text" value="${escapeHtml(label)}" placeholder="Field label">
    <input class="dict-desc" type="text" value="${escapeHtml(desc)}" placeholder="Optional description">
    <input class="dict-group" type="number" min="1" step="1" value="${Number(group) || 1}" title="Display group">
    <button type="button" title="Remove dictionary entry">×</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  dictionaryRowsEl.appendChild(row);
}

function openDictionaryEditor() {
  dictionaryRowsEl.innerHTML = "";
  const dictionaryDoc = state.docs.find(d => d.id === "@dictionary@" || d.type === "Dictionary");
  if (dictionaryDoc) {
    for (const entry of dictionaryDoc.entries) {
      if (entry.key === "id" || entry.key === "type") continue;
      const raw = String(entry.value ?? "");
      const parts = raw.split(/\s+[—-]\s+/);
      addDictionaryEditorRow(entry.key, parts.length > 1 ? parts[0].trim() : raw,
        parts.length > 1 ? parts.slice(1).join(" - ").trim() : "", entry.group);
    }
  }
  dictionaryModal.classList.add("open");
}

document.getElementById("edit-dictionary-btn").addEventListener("click", openDictionaryEditor);
document.getElementById("close-dictionary-btn").addEventListener("click", () => dictionaryModal.classList.remove("open"));
document.getElementById("cancel-dictionary-btn").addEventListener("click", () => dictionaryModal.classList.remove("open"));
document.getElementById("add-dictionary-row-btn").addEventListener("click", () => addDictionaryEditorRow());

document.getElementById("save-dictionary-btn").addEventListener("click", () => {
  const entries = [
    { key: "id", value: "@dictionary@", group: 0 },
    { key: "type", value: "Dictionary", group: 0 }
  ];
  const keys = new Set();
  let error = "";
  dictionaryRowsEl.querySelectorAll(".dictionary-row").forEach(row => {
    const key = row.querySelector(".dict-key").value.trim();
    const label = row.querySelector(".dict-label").value.trim();
    const desc = row.querySelector(".dict-desc").value.trim();
    const group = Math.max(1, Number(row.querySelector(".dict-group").value) || 1);
    if (!key) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key === "id" || key === "type") {
      error = `Invalid dictionary key: ${key}`;
      return;
    }
    if (keys.has(key)) {
      error = `Duplicate dictionary key: ${key}`;
      return;
    }
    keys.add(key);
    entries.push({ key, value: label + (desc ? " — " + desc : ""), group });
  });
  if (error) {
    alert(error);
    return;
  }

  let dictionaryDoc = state.docs.find(d => d.id === "@dictionary@" || d.type === "Dictionary");
  if (!dictionaryDoc) {
    dictionaryDoc = { id: "@dictionary@", type: "Dictionary", entries: [], map: {} };
    state.docs.splice(1, 0, dictionaryDoc);
  }
  dictionaryDoc.entries = entries;
  dictionaryDoc.map = Object.fromEntries(entries.map(entry => [entry.key, entry.value]));
  dictionaryModal.classList.remove("open");
  syncDocsToEditor();
});

// UI Wiring
document.getElementById("toggle-yaml-btn").addEventListener("click", e => {
  const pane = document.getElementById("yaml-pane");
  pane.classList.toggle("hidden");
  e.target.textContent = pane.classList.contains("hidden") ? "Show YAML Editor" : "Hide YAML Editor";
});

async function loadSample(language) {
  const filename = SAMPLE_FILES[language];
  const status = document.getElementById("yaml-status");
  const editor = document.getElementById("yaml-editor");
  const buttons = [
    document.getElementById("sample-en-btn"),
    document.getElementById("sample-pl-btn")
  ];

  if (!filename) {
    status.textContent = `Unknown sample language: ${language}`;
    status.style.color = "#f87171";
    return;
  }

  buttons.forEach(button => { button.disabled = true; });
  status.textContent = `Loading ${filename}…`;
  status.style.color = "#fbbf24";

  try {
    const response = await fetch(new URL(filename, document.baseURI), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const yaml = await response.text();
    if (!yaml.trim()) throw new Error("The sample file is empty");

    // Validate the stream before replacing the currently loaded data.
    const docs = parseYamlStream(yaml);
    if (!docs.length) throw new Error("The file contains no YAML documents");

    editor.value = yaml;
    state.selectedId = null;
    state.editMode = false;
    state.activeTab = "Individual";
    updateTabUI();
    rebuildFromEditor();

    status.textContent = `Loaded ${filename} (${docs.length} docs)`;
    status.style.color = "#4ade80";
  } catch (error) {
    status.textContent = `Could not load ${filename}: ${error.message}`;
    status.style.color = "#f87171";
    const pane = document.getElementById("yaml-pane");
    pane.classList.remove("hidden");
    document.getElementById("toggle-yaml-btn").textContent = "Hide YAML Editor";
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

document.getElementById("sample-en-btn").addEventListener("click", () => loadSample("en"));
document.getElementById("sample-pl-btn").addEventListener("click", () => loadSample("pl"));

document.getElementById("yaml-editor").addEventListener("input", rebuildFromEditor);

document.querySelectorAll(".tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    state.activeTab = btn.dataset.tab;
    updateTabUI();
    renderDirectory();
  });
});

document.getElementById("search-input").addEventListener("input", renderDirectory);
document.getElementById("sort-select").addEventListener("change", renderDirectory);

document.getElementById("add-ind-btn").addEventListener("click", () => {
  const slug = Math.random().toString(36).slice(2, 7);
  const id = `@ind_${slug}@`;
  state.docs.push({
    id,
    type: "Individual",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Individual", group: 0 },
      { key: "name_first", value: "New Person", group: 1 }
    ],
    map: { id, type: "Individual", name_first: "New Person" }
  });
  state.activeTab = "Individual";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});

document.getElementById("add-fam-btn").addEventListener("click", () => {
  const slug = Math.random().toString(36).slice(2, 7);
  const id = `@fam_${slug}@`;
  state.docs.push({
    id,
    type: "Family",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Family", group: 0 },
      { key: "marriage_date", value: "", group: 1 }
    ],
    map: { id, type: "Family", marriage_date: "" }
  });
  state.activeTab = "Family";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});



document.getElementById("add-source-btn")?.addEventListener("click", () => {
  const slug = Math.random().toString(36).slice(2, 7);
  const id = `@src_${slug}@`;
  state.docs.push({
    id,
    type: "Source",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Source", group: 0 },
      { key: "titl", value: "New Source", group: 1 }
    ],
    map: { id, type: "Source", titl: "New Source" }
  });
  state.activeTab = "Source";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});

document.getElementById("load-media-btn")?.addEventListener("click", () => {
  document.getElementById("media-folder-input")?.click();
});

document.getElementById("import-ged-btn").addEventListener("click", () => {
  document.getElementById("ged-input").click();
});

document.getElementById("ged-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    state.selectedId = null;
    state.editMode = false;
    document.getElementById("yaml-editor").value = convertGedcomToOgf(ev.target.result);
    rebuildFromEditor();
  };
  reader.readAsText(file);
  e.target.value = "";
});

// Allow users to explicitly grant access to the GEDCOM media directory.
document.getElementById("media-folder-input")?.addEventListener("change", e => {
  for (const url of mediaObjectUrls.values()) URL.revokeObjectURL(url);
  mediaObjectUrls.clear();
  mediaFilesByPath.clear();
  mediaFilesByName.clear();

  for (const file of Array.from(e.target.files || [])) {
    if (!/\.(?:png|jpe?g|gif|webp|avif|bmp|svg|tiff?)$/i.test(file.name)) continue;
    const url = URL.createObjectURL(file);
    const relative = normalizeMediaPath(file.webkitRelativePath || file.name);
    mediaObjectUrls.set(relative, url);
    mediaFilesByPath.set(relative, url);
    const basename = relative.split("/").pop();
    if (!mediaFilesByName.has(basename)) mediaFilesByName.set(basename, []);
    mediaFilesByName.get(basename).push(url);
  }
  renderInspector();
  e.target.value = "";
});

document.getElementById("open-yaml-btn").addEventListener("click", () => {
  document.getElementById("yaml-input").click();
});

document.getElementById("yaml-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    state.selectedId = null;
    state.editMode = false;
    document.getElementById("yaml-editor").value = ev.target.result;
    rebuildFromEditor();
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("download-yaml-btn").addEventListener("click", () => {
  const blob = new Blob([document.getElementById("yaml-editor").value], { type: "text/yaml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "family-tree.ogf.yaml";
  a.click();
});

// Samples are stored next to index.html and loaded on startup.
loadSample("en");

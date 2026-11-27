const SUPPORTED_OGF_FORMAT_VERSION = 1;
const SUPPORTED_META_CONTRACT_VERSION = 3;

const SAMPLE_FILES = {
  "en-gedcom": "samples/sample-en-from-gedcom.ogf.yaml",
  pl: "samples/sample-pl.ogf.yaml",
  "en-custom": "samples/sample-en-custom-keys.ogf.yaml",
  "en-repeated": "samples/sample-en-repeated-events.ogf.yaml"
};

// The starter project is intentionally empty: it contains configuration and a
// human-readable dictionary, but no example people, families or sources.
// GEDCOM import does not use a built-in tag-to-field translation table. Unique
// source paths may be flattened; repeated structured occurrences remain nested
// ordered groups. The dictionary supplies OGF fields users may choose to adopt
// or rename imported fields to.

async function loadDefaultProjectDocs() {
  const files = ["defaults/meta.yaml", "defaults/dictionary.yaml"];
  const loaded = await Promise.all(files.map(async filename => {
    const response = await fetch(new URL(filename, document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${filename} (${response.status})`);
    const docs = parseYamlStream(await response.text());
    if (docs.length !== 1) throw new Error(`${filename} must contain exactly one YAML document`);
    return docs[0];
  }));
  const byId = new Map(loaded.map(doc => [doc.id, doc]));
  const meta = byId.get("@meta@");
  const dictionary = byId.get("@dictionary@");
  if (!meta || !dictionary) throw new Error("Default files must define @meta@ and @dictionary@ respectively.");
  return [meta, dictionary];
}

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
          // In the tree workspace, follow the reference in both views.
          if (document.querySelector("main")?.classList.contains("tree-mode") &&
              window.OGFTree?.navigateTo(token)) return;

          state.selectedId = token;
          state.editMode = false;
          if (["Individual", "Family", "Source", "Repository"].includes(target.type)) {
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

// Remote images use one provider-independent policy. Omit the page referrer
// for privacy and to reduce host-side hotlink restrictions; use the service
// worker cache where CORS permits, otherwise let the browser load the image.
const REMOTE_MEDIA_CACHE_PATH = new URL("__ogf_media_cache__", document.baseURI).pathname;
let remoteMediaCacheControllerReady = !!navigator.serviceWorker?.controller;
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register(new URL("media-cache-sw.js", document.baseURI), { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      remoteMediaCacheControllerReady = !!navigator.serviceWorker.controller;
    })
    .catch(error => console.warn("Remote image caching is unavailable; images will load directly.", error));
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    remoteMediaCacheControllerReady = true;
    if (state.selectedId) renderInspector();
  });
}

function configureRemoteImageRequest(img, url) {
  try {
    const parsed = new URL(url, document.baseURI);
    if (/^https?:$/.test(parsed.protocol) && parsed.origin !== location.origin) {
      img.referrerPolicy = "no-referrer";
    }
  } catch (_) {
    // Leave non-URL and local media untouched.
  }
}

function getRemoteMediaDisplayUrl(url) {
  try {
    const parsed = new URL(url, document.baseURI);
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin === location.origin) return url;
    if (!remoteMediaCacheControllerReady || !navigator.serviceWorker?.controller) return url;
    return `${REMOTE_MEDIA_CACHE_PATH}?url=${encodeURIComponent(parsed.href)}`;
  } catch (_) {
    return url;
  }
}

// The service worker stores CORS-readable remote images in Cache Storage.
// The page can read those cached Response objects directly even when the
// original image host would no longer allow a fresh cross-origin request.
// This deliberately does not attempt to read the browser's private HTTP cache:
// browsers do not expose that cache to page JavaScript.
async function getCachedRemoteImageBlob(url) {
  try {
    if (!('caches' in window) || !('serviceWorker' in navigator)) return null;
    const remoteUrl = new URL(url, document.baseURI);
    if (!/^https?:$/.test(remoteUrl.protocol) || remoteUrl.origin === location.origin) return null;

    const registration = await navigator.serviceWorker.getRegistration(new URL('.', document.baseURI));
    const scope = registration?.scope || new URL('./', document.baseURI).href;
    const cacheKeyUrl = new URL(`${'__ogf_media_cache__'}?url=${encodeURIComponent(remoteUrl.href)}`, scope);
    const cache = await caches.open('ogf-remote-media-v3');
    const response = await cache.match(new Request(cacheKeyUrl.href));
    if (!response || !response.ok) return null;

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    return await response.blob();
  } catch (error) {
    console.debug('Could not read cached OGF image:', error);
    return null;
  }
}

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

  // A relative OBJE.FILE value is a local media-folder reference, not a URL
  // relative to the viewer page. Never request it until the user has selected
  // the media directory; the selected files are resolved through object URLs.
  if (!/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(raw) && !/^file:/i.test(raw)) {
    return null;
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

function getConfiguredImageFieldKeys() {
  const configured = state.meta?.image_field;
  // One shared configuration applies to every record type. Accept the old
  // per-type mapping as an import compatibility form, flattening its fields
  // into one shared ordered list rather than selecting by record type.
  const selected = configured && typeof configured === "object" && !Array.isArray(configured)
    ? Object.values(configured).flatMap(value => Array.isArray(value) ? value : [value])
    : configured;
  const fields = Array.isArray(selected) ? selected : (typeof selected === "string" ? [selected] : []);
  return [...new Set(fields.filter(field => typeof field === "string" && field.trim()).map(field => field.trim()))];
}

function getImageCandidates(doc) {
  if (!doc || !doc.map) return [];
  const configuredFields = getConfiguredImageFieldKeys();
  if (!configuredFields.length) return [];
  const candidates = [];
  for (const field of configuredFields) {
    const value = doc.map[field];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      const resolved = resolveImageReference(item, true);
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
  const displaySrc = getRemoteMediaDisplayUrl(src);
  const link = document.createElement("a");
  link.className = "image-open-link";
  link.href = displaySrc;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `Open image: ${altText || "Attached image"}`);
  const img = document.createElement("img");
  img.className = "field-image-preview";
  configureRemoteImageRequest(img, src);
  img.setAttribute("src", displaySrc);
  img.setAttribute("alt", altText || "Attached image");
  img.loading = "lazy";
  img.addEventListener("error", () => {
    if (displaySrc !== src && !img.dataset.directFallback) {
      img.dataset.directFallback = "1";
      link.href = src;
      img.src = src;
      return;
    }
    link.remove();
  });
  link.appendChild(img);
  return link;
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

// Per-session ID high-water marks. Existing records are scanned on demand;
// counters remain in memory for the current session so deletions do not cause
// immediate ID reuse. No internal state document is written to project data.
const idCounters = Object.create(null);

function unquote(val) {
  if (typeof val !== "string") return val;
  const s = val.trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

// Parse the JSON-like inline collection forms allowed by YAML metadata, e.g.
// [husb, wife] and { date: birth_date, place: birth_place }. The OGF metadata
// parser intentionally remains small and dependency-free, but these forms
// must become real arrays/objects because the tree adapter consumes them.
function splitInlineYamlItems(source) {
  const items = [];
  let start = 0;
  let quote = null;
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote && source[i - 1] !== "\\\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    else if (char === "," && depth === 0) {
      items.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

function parseInlineYamlValue(raw) {
  const value = String(raw ?? "").trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    return body ? splitInlineYamlItems(body).map(parseInlineYamlValue) : [];
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const body = value.slice(1, -1).trim();
    const result = {};
    if (!body) return result;
    for (const item of splitInlineYamlItems(body)) {
      const colon = item.indexOf(":");
      if (colon <= 0) continue;
      const key = unquote(item.slice(0, colon).trim());
      result[key] = parseInlineYamlValue(item.slice(colon + 1));
    }
    return result;
  }
  return unquote(value);
}

// Generic optional selectable values use a dictionary companion key
// (<field>_values). Gender labels are configured separately in @meta@.gender.
function parseDictionaryValues(raw) {
  const values = {};
  for (const part of String(raw ?? "").split("|")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const code = part.slice(0, separator).trim();
    const label = part.slice(separator + 1).trim();
    if (code) values[code] = label || code;
  }
  return values;
}

function formatDictionaryValues(values) {
  return Object.entries(values).map(([code, label]) => `${code}=${label}`).join(" | ");
}

function getConfiguredFieldChoices(key) {
  const gender = state.meta?.gender || state.meta?.gender_mapping;
  const baseKey = String(key || "").replace(/_\d+$/, "");
  if (gender && gender.field === baseKey) {
    const labels = gender.labels && typeof gender.labels === "object" && !Array.isArray(gender.labels)
      ? gender.labels : {};
    if (Array.isArray(gender.values)) {
      return Object.fromEntries(gender.values.map(value => {
        const code = String(value);
        return [code, Object.prototype.hasOwnProperty.call(labels, code) ? String(labels[code]) : code];
      }));
    }
    if (Object.keys(labels).length) return labels;
  }
  return state.dict[baseKey] && state.dict[baseKey].values;
}

function dictionaryValueLabel(key, value) {
  const code = String(value ?? "");
  const baseKey = String(key || "").replace(/_\d+$/, "");
  const gender = state.meta?.gender || state.meta?.gender_mapping;
  if (gender && gender.field === baseKey && gender.labels && Object.prototype.hasOwnProperty.call(gender.labels, code)) {
    return String(gender.labels[code]);
  }
  const choices = getConfiguredFieldChoices(key);
  return choices && Object.prototype.hasOwnProperty.call(choices, code) ? choices[code] : code;
}


function parseNestedYamlValue(lines, startIndex, parentIndent) {
  const nextContent = from => {
    for (let i = from; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      return i;
    }
    return lines.length;
  };
  const first = nextContent(startIndex);
  if (first >= lines.length) return [{}, startIndex];
  const firstIndent = (lines[first].match(/^\s*/) || [""])[0].length;
  if (firstIndent <= parentIndent) return [{}, startIndex];

  function parseBlock(index, indent) {
    const isList = /^-\s*(.*)$/.test(lines[index].trim());
    const result = isList ? [] : {};
    let i = index;
    while (i < lines.length) {
      i = nextContent(i);
      if (i >= lines.length) break;
      const line = lines[i];
      const currentIndent = (line.match(/^\s*/) || [""])[0].length;
      if (currentIndent < indent) break;
      if (currentIndent > indent) break;
      const trimmed = line.trim();

      if (isList) {
        const listItem = trimmed.match(/^-\s*(.*)$/);
        if (!listItem) break;
        const raw = listItem[1].trim();
        if (raw) {
          const colon = raw.indexOf(":");
          if (colon > 0) {
            const itemObject = {};
            const itemKey = raw.slice(0, colon).trim();
            const itemRawValue = raw.slice(colon + 1).trim();
            itemObject[itemKey] = itemRawValue ? parseInlineYamlValue(itemRawValue) : {};
            const child = nextContent(i + 1);
            if (child < lines.length && (lines[child].match(/^\s*/) || [""])[0].length > indent) {
              const [continuation, next] = parseBlock(child, (lines[child].match(/^\s*/) || [""])[0].length);
              if (continuation && typeof continuation === "object" && !Array.isArray(continuation)) {
                Object.assign(itemObject, continuation);
              }
              i = next;
            } else {
              i++;
            }
            result.push(itemObject);
            continue;
          }
          result.push(parseInlineYamlValue(raw));
        } else {
          const child = nextContent(i + 1);
          if (child < lines.length && (lines[child].match(/^\s*/) || [""])[0].length > indent) {
            const [value, next] = parseBlock(child, (lines[child].match(/^\s*/) || [""])[0].length);
            result.push(value);
            i = next;
            continue;
          }
          result.push("");
        }
        i++;
        continue;
      }

      if (trimmed.startsWith("- ")) break;
      const colon = trimmed.indexOf(":");
      if (colon <= 0) { i++; continue; }
      const key = trimmed.slice(0, colon).trim();
      const raw = trimmed.slice(colon + 1).trim();
      if (raw !== "") {
        result[key] = parseInlineYamlValue(raw);
        i++;
      } else {
        const child = nextContent(i + 1);
        if (child < lines.length && (lines[child].match(/^\s*/) || [""])[0].length > indent) {
          const [value, next] = parseBlock(child, (lines[child].match(/^\s*/) || [""])[0].length);
          result[key] = value;
          i = next;
        } else {
          result[key] = {};
          i++;
        }
      }
    }
    return [result, i];
  }
  return parseBlock(first, firstIndent);
}

function appendYamlNestedValue(out, key, value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) { out.push(pad + key + ": []"); return; }
    out.push(pad + key + ":");
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        out.push(pad + "  -");
        for (const [childKey, childValue] of Object.entries(item)) {
          appendYamlNestedValue(out, childKey, childValue, indent + 4);
        }
      } else {
        out.push(pad + "  - " + formatScalar(item));
      }
    }
  } else if (value && typeof value === "object") {
    if (Object.keys(value).length === 0) { out.push(pad + key + ": {}"); return; }
    out.push(pad + key + ":");
    for (const [childKey, childValue] of Object.entries(value)) {
      appendYamlNestedValue(out, childKey, childValue, indent + 2);
    }
  } else {
    out.push(pad + key + ": " + formatScalar(value));
  }
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
        const isMetaDocument = entries.some(entry =>
          (entry.key === "id" && entry.value === "@meta@") ||
          (entry.key === "type" && entry.value === "Meta")
        );
        if (rawVal === "") {
          // Parse nested objects/lists for every document, not only @meta@.
          // This is required for repeated structured GEDCOM occurrences.
          const [nestedValue, nextIndex] = parseNestedYamlValue(lines, i + 1, (line.match(/^\s*/) || [""])[0].length);
          if (nextIndex > i + 1) {
            entries.push({ key, value: nestedValue, group: groupIndex });
            i = nextIndex - 1;
          } else {
            entries.push({ key, value: [], group: groupIndex });
          }
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
      if (entry.value && typeof entry.value === "object") {
        appendYamlNestedValue(out, entry.key, entry.value);
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
    /^[?:,\[\]{}&*!|>'"`#%@]/.test(s) ||
    /^-(?:\s|$)/.test(s) ||
    s.includes(": ") ||
    s.endsWith(":") ||
    s.includes("#") ||
    s.includes("{")
  ) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
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

function displayFieldValue(value) {
  const displayOne = item => {
    if (item === undefined || item === null) return "";
    if (Array.isArray(item)) return item.map(displayOne).filter(Boolean).join(", ");
    if (item && typeof item === "object") {
      if (Object.prototype.hasOwnProperty.call(item, "value")) return displayOne(item.value);
      return "";
    }
    return String(item).trim();
  };
  return displayOne(value);
}

function resolveDisplayTemplate(doc, template, docMap) {
  const source = String(template ?? "").trim();
  if (!source) return "";

  // A bare key is shorthand for the current record's field, e.g. "name".
  if (!/[{}]/.test(source)) {
    return displayFieldValue(doc.map[source]);
  }

  // {field_key} reads from the current record.
  // {$reference_key.field_key} follows an @id@ reference and reads that
  // field from the referenced record. Literal text between placeholders
  // (for example " & ") is preserved.
  let result = source.replace(/\{(\$?[^{}]+)\}/g, (token, expression) => {
    const expr = String(expression).trim();
    if (expr.startsWith("$")) {
      const path = expr.slice(1).split(".");
      if (path.length < 2) return "";
      const refKey = path.shift();
      const targetId = displayFieldValue(doc.map[refKey]);
      const target = targetId ? docMap[targetId] : null;
      if (!target) return "";
      return displayFieldValue(path.reduce((value, key) => {
        if (value && typeof value === "object" && !Array.isArray(value)) return value[key];
        return undefined;
      }, target.map));
    }
    return displayFieldValue(doc.map[expr]);
  });

  // Avoid dangling separators if one side of a relationship is absent.
  return result
    .replace(/\s*&\s*&\s*/g, " & ")
    .replace(/^\s*&\s*|\s*&\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getRecordTitle(doc, docMap) {
  const m = doc.map;
  if (doc.type === "Individual") {
    const configured = state.meta.individual_display_field;
    if (configured) {
      const display = resolveDisplayTemplate(doc, configured, docMap);
      if (display) return display;
    }
    // Backward-compatible fallback for datasets without display metadata.
    if (m.name !== undefined && m.name !== null) {
      const storedName = displayFieldValue(m.name);
      if (storedName) return storedName;
    }
    const first = m.name_first || m.imie || m.given_name || "";
    const last = m.name_last || m.nazwisko || m.surname || m.name_maiden || m.nazwisko_rodowe || "";
    const full = (first + " " + last).trim() || m.full_name || m.name_alias || m.pseudonim;
    if (full) return full;
  }
  if (doc.type === "Source") {
    const sourceTitle = m.source_title || m.titl || m.tytul || m.title || m.abbr || m.auth;
    if (sourceTitle) return String(sourceTitle);
  }
  if (doc.type === "Repository") {
    const repositoryName = m.repository_name || m.name || m.repo_name;
    if (repositoryName) return String(repositoryName);
  }
  if (doc.type === "Family") {
    const configured = state.meta.family_display_field;
    if (configured) {
      const display = resolveDisplayTemplate(doc, configured, docMap);
      if (display) return display;
    }
  }
  return m.title || doc.id || "Untitled";
}

function getConfiguredRecordSummaryValue(doc, part) {
  const tree = state.meta?.tree || {};
  let recordConfig = {};
  if (doc?.type === tree.individual_type) recordConfig = tree.individual || {};
  else if (doc?.type === tree.family_type) recordConfig = tree.family || {};
  const eventNames = doc?.type === tree.individual_type
    ? ["birth", "death", "burial"]
    : (doc?.type === tree.family_type ? ["marriage", "divorce"] : []);
  for (const eventName of eventNames) {
    const field = recordConfig?.[eventName]?.[part];
    if (typeof field !== "string" || !field) continue;
    let value = doc.map?.[field];
    if (value === undefined || value === null) {
      const separator = field.indexOf("_");
      if (separator > 0) {
        const parentKey = field.slice(0, separator);
        const childKey = field.slice(separator + 1);
        const parentValue = doc.map?.[parentKey];
        const occurrences = Array.isArray(parentValue) ? parentValue : [parentValue];
        for (const occurrence of occurrences) {
          if (occurrence && typeof occurrence === "object" && !Array.isArray(occurrence) &&
              occurrence[childKey] !== undefined && occurrence[childKey] !== null) {
            value = occurrence[childKey];
            if (value && typeof value === "object" && !Array.isArray(value) &&
                Object.prototype.hasOwnProperty.call(value, "value")) value = value.value;
            break;
          }
        }
      }
    }
    const values = Array.isArray(value) ? value : [value];
    const found = values.map(displayFieldValue).find(Boolean);
    if (found) return found;
  }
  return "";
}

function getRecordDate(doc) {
  return getConfiguredRecordSummaryValue(doc, "date");
}

function getRecordPlace(doc) {
  return getConfiguredRecordSummaryValue(doc, "place");
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
        const dictionaryEntries = new Map(d.entries.map(entry => [entry.key, entry]));
        state.dictGroups = {};
        for (const e of d.entries) {
          if (e.key === "id" || e.key === "type") continue;
          const groupLabelMatch = e.key.match(/^__group_(\d+)$/);
          if (groupLabelMatch) {
            state.dictGroups[Number(groupLabelMatch[1])] = String(e.value ?? "");
            continue;
          }
          const companionBase = e.key.endsWith("_values") ? e.key.slice(0, -7) : "";
          // A *_values entry is metadata for its base field, not a field itself.
          if (companionBase && dictionaryEntries.has(companionBase)) continue;
          const raw = String(e.value || "");
          const parts = raw.split(/\s+[—-]\s+/);
          const valuesEntry = dictionaryEntries.get(e.key + "_values");
          state.dict[e.key] = {
            label: parts.length > 1 ? parts[0].trim() : (raw || formatKeyLabel(e.key)),
            desc: parts.length > 1 ? parts.slice(1).join(" - ").trim() : "",
            group: e.group,
            values: valuesEntry ? parseDictionaryValues(valuesEntry.value) : null
          };
        }
      }
    }

    const formatVersion = state.meta.format_version;
    if (formatVersion !== undefined && formatVersion !== null && formatVersion !== "") {
      if (!Number.isInteger(Number(formatVersion)) || Number(formatVersion) < 1) {
        throw new Error(`Invalid OGF format version: ${formatVersion}. Expected a positive integer.`);
      }
      if (Number(formatVersion) !== SUPPORTED_OGF_FORMAT_VERSION) {
        throw new Error(`Unsupported OGF format version: ${formatVersion}. This viewer supports version ${SUPPORTED_OGF_FORMAT_VERSION}.`);
      }
    }
    const metaVersion = state.meta.version;
    if (metaVersion !== undefined && metaVersion !== null && metaVersion !== "") {
      if (!Number.isInteger(Number(metaVersion)) || Number(metaVersion) < 1) {
        throw new Error(`Invalid @meta@ contract version: ${metaVersion}. Expected a positive integer.`);
      }
      if (Number(metaVersion) > SUPPORTED_META_CONTRACT_VERSION) {
        throw new Error(`Unsupported @meta@ contract version: ${metaVersion}. This viewer supports versions up to ${SUPPORTED_META_CONTRACT_VERSION}.`);
      }
      // Older metadata contracts remain readable. The tree renderer also
      // understands the previous tree.relationships layout as a fallback.
    }
    const lang = (state.meta.language || "en").toUpperCase();
    status.textContent = "Valid · OGF format v" + (formatVersion || "legacy") + " · @meta@ v" + (metaVersion || "legacy") + " (" + docs.length + " docs)";
    status.style.color = "#4ade80";

    renderDirectory();
    renderInspector();
    window.dispatchEvent(new Event("ogf:data-updated"));
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
  const repositories = allDisplay.filter(d => d.type === "Repository");

  document.getElementById("tab-ind").textContent = `Individuals (${inds.length})`;
  document.getElementById("tab-fam").textContent = `Families (${fams.length})`;
  const sourceTab = document.getElementById("tab-source");
  if (sourceTab) sourceTab.textContent = `Sources (${sources.length})`;
  const repositoryTab = document.getElementById("tab-repository");
  if (repositoryTab) repositoryTab.textContent = `Repositories (${repositories.length})`;
  document.getElementById("tab-all").textContent = `All (${allDisplay.length})`;

  let filtered = allDisplay;
  if (state.activeTab === "Individual") filtered = inds;
  else if (state.activeTab === "Family") filtered = fams;
  else if (state.activeTab === "Source") filtered = sources;
  else if (state.activeTab === "Repository") filtered = repositories;

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

function renderInspectorDetailed() {
  const container = document.getElementById("card-container");
  const docMap = Object.fromEntries(state.docs.map(d => [d.id, d]));
  const doc = docMap[state.selectedId];

  if (!doc) {
    container.innerHTML = `
                            <div class="empty-state" style="text-align:center">
                              <h2>Start building your family history</h2>
                              <p>
                                Add your first person or family, or explore sample data
                                to see how Open Genealogy Format works.
                              </p>
                            </div>
                          `;
    return;
  }

  if (state.editMode) {
    renderEditorCard(container, doc);
    return;
  }

  const title = getRecordTitle(doc, docMap);

  // The dictionary is the sole source of card field order and grouping.
  // Record-local YAML groups never define presentation. Unknown fields remain
  // visible in a final fallback group so imported data is never hidden.
  const recordFields = new Map(doc.entries
    .filter(entry => entry.key !== "id" && entry.key !== "type")
    .map(entry => [entry.key, entry]));
  const groupedEntries = new Map();
  for (const key of Object.keys(state.dict)) {
    const entry = recordFields.get(key);
    if (!entry) continue;
    const groupKey = Number(state.dict[key].group) || 1;
    if (!groupedEntries.has(groupKey)) groupedEntries.set(groupKey, []);
    groupedEntries.get(groupKey).push(entry);
    recordFields.delete(key);
  }
  if (recordFields.size) groupedEntries.set("__ungrouped__", [...recordFields.values()]);
  const groups = [...groupedEntries.entries()].map(([key, entries]) => ({ key, entries }));

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
        <button id="edit-card-btn" title="Edit card"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit</button>
        <button id="delete-card-btn" class="icon-button delete-entry-btn" title="Delete record" aria-label="Delete record"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
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
      const portraitLink = document.createElement("a");
      portraitLink.className = "image-open-link portrait-open-link";
      const portraitDisplayUrl = getRemoteMediaDisplayUrl(portraitUrl);
      portraitLink.href = portraitDisplayUrl;
      portraitLink.target = "_blank";
      portraitLink.rel = "noopener noreferrer";
      portraitLink.setAttribute("aria-label", `Open image: ${title}`);
      const portrait = document.createElement("img");
      portrait.className = "record-portrait";
      configureRemoteImageRequest(portrait, portraitUrl);
      portrait.setAttribute("src", portraitDisplayUrl);
      portrait.setAttribute("alt", title);
      portrait.loading = "eager";
      portrait.addEventListener("error", () => {
        if (portraitDisplayUrl !== portraitUrl && !portrait.dataset.directFallback) {
          portrait.dataset.directFallback = "1";
          portraitLink.href = portraitUrl;
          portrait.src = portraitUrl;
          return;
        }
        // A missing optional image must not add an error message to the card
        // or interfere with the record fields.
        portraitColumn.remove();
      });
      portraitLink.appendChild(portrait);
      portraitColumn.appendChild(portraitLink);
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
    const groupLabel = grp.key === "__ungrouped__" ? "" : String(state.dictGroups?.[Number(grp.key)] || "").trim();
    if (groupLabel) {
      const heading = document.createElement("h3");
      heading.className = "field-group-heading";
      heading.textContent = groupLabel;
      grpDiv.appendChild(heading);
    }

    for (const entry of grp.entries) {
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
        labelDiv.innerHTML = `<span class="field-label-text">${escapeHtml(labelText)}</span><button type="button" class="tip-icon" aria-label="Show description for ${escapeHtml(labelText)}" title="Show field description"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button>`;
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
      const isStructuredValue = entry.value && typeof entry.value === "object" &&
        (Array.isArray(entry.value) ? entry.value.some(item => item && typeof item === "object") : true);
      if (isStructuredValue) {
        const occurrences = Array.isArray(entry.value) ? entry.value : [entry.value];
        occurrences.forEach((occurrence, occurrenceIndex) => {
          const occurrenceGroup = document.createElement("div");
          occurrenceGroup.className = "nested-occurrence-group";
          const fields = occurrence && typeof occurrence === "object" && !Array.isArray(occurrence)
            ? Object.entries(occurrence) : [["value", occurrence]];
          const appendOccurrenceField = (target, childKey, childValue, parentPath = entry.key) => {
            const childPath = `${parentPath}.${childKey}`;
            const childInfo = state.dict[childPath];
            const childLabelText = childInfo?.label || formatKeyLabel(childKey);
            const isScalarList = Array.isArray(childValue) && childValue.every(item =>
              item === null || item === undefined || typeof item !== "object"
            );
            if (childValue && typeof childValue === "object" && !isScalarList) {
              const nested = document.createElement("div");
              nested.className = "nested-occurrence-group nested-child-group";
              const nestedHeading = document.createElement("div");
              nestedHeading.className = "nested-occurrence-heading";
              nestedHeading.textContent = childLabelText;
              nested.appendChild(nestedHeading);
              if (Array.isArray(childValue)) {
                childValue.forEach((item, index) => {
                  if (item && typeof item === "object") {
                    const itemGroup = document.createElement("div");
                    itemGroup.className = "nested-occurrence-group";
                    Object.entries(item).forEach(([nestedKey, nestedValue]) => appendOccurrenceField(itemGroup, nestedKey, nestedValue, childPath));
                    nested.appendChild(itemGroup);
                  } else appendOccurrenceField(nested, childKey, item);
                });
              } else {
                Object.entries(childValue).forEach(([nestedKey, nestedValue]) => appendOccurrenceField(nested, nestedKey, nestedValue, childPath));
              }
              target.appendChild(nested);
              return;
            }
            const childRow = document.createElement("div");
            childRow.className = "nested-occurrence-row";
            const childLabel = document.createElement("div");
            childLabel.className = "field-label";
            childLabel.textContent = childLabelText;
            if (childInfo?.desc) childLabel.title = childInfo.desc;
            const childVal = document.createElement("div");
            childVal.className = "field-val";
            const childValues = Array.isArray(childValue) ? childValue : [childValue];
            for (const childItem of childValues) {
              const childSpan = document.createElement("span");
              appendLinkedText(childSpan, dictionaryValueLabel(childPath, childItem), docMap);
              childVal.appendChild(childSpan);
            }
            childRow.append(childLabel, childVal);
            target.appendChild(childRow);
          };
          for (const [childKey, childValue] of fields) appendOccurrenceField(occurrenceGroup, childKey, childValue);
          valDiv.appendChild(occurrenceGroup);
        });
      } else {
      const values = Array.isArray(entry.value) ? entry.value : [entry.value];

      for (const v of values) {
        const valueSpan = document.createElement("span");
        appendLinkedText(valueSpan, dictionaryValueLabel(entry.key, v), docMap);
        valDiv.appendChild(valueSpan);

        // Embed image files directly beneath their GEDCOM/OGF field value.
        // This creates a real <img src="..."> element, not merely a link.
        const isConfiguredRecordImage = getConfiguredImageFieldKeys().includes(entry.key);
        // Configured record images are represented once in the portrait area;
        // keep their original references in the field list without duplicating thumbnails.
        if (!isConfiguredRecordImage && isImageFileReference(v) && /(?:^|_)file(?:_\d+)?$/i.test(entry.key)) {
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
      pill.className = "link-pill backlink-pill";
      pill.textContent = `${formatKeyLabel(bl.key)} in ${getRecordTitle(bl.from, docMap)}`;
      pill.addEventListener("click", () => {
        // Keep tree navigation synchronized when following a "Referenced In" backlink.
        if (document.querySelector("main")?.classList.contains("tree-mode") &&
            window.OGFTree?.navigateTo(bl.from.id)) return;

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


// Keep the record readable even if an optional enhancement (media, map,
// links, or a malformed field value) throws while building the rich card.
function renderInspector() {
  const container = document.getElementById("card-container");
  try {
    return renderInspectorDetailed();
  } catch (error) {
    console.error("Detailed card rendering failed; using plain-field fallback.", error);

    const doc = state.docs.find(item => item.id === state.selectedId);
    container.innerHTML = "";

    if (!doc) {
      container.textContent = "Your genealogy starts here. Add your first person or family, or explore sample data to see how Open Genealogy Format works.";;
      return;
    }

    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "card-header";

    const heading = document.createElement("div");
    const title = document.createElement("div");
    title.className = "card-title";
    try {
      title.textContent = getRecordTitle(doc, Object.fromEntries(state.docs.map(item => [item.id, item])));
    } catch (_) {
      title.textContent = doc.id || "Untitled";
    }

    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `${doc.type || "Record"} • ${doc.id || ""}`;
    heading.append(title, meta);

    const warning = document.createElement("div");
    warning.className = "media-load-hint";
    warning.textContent = "Some enhanced card formatting failed. The original record fields are shown below.";
    heading.appendChild(warning);
    header.appendChild(heading);
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "card-body";

    for (const entry of (doc.entries || [])) {
      if (!entry || entry.key === "id" || entry.key === "type") continue;

      const row = document.createElement("div");
      row.className = "field-row";

      const label = document.createElement("div");
      label.className = "field-label";
      try {
        label.textContent = formatKeyLabel(entry.key);
      } catch (_) {
        label.textContent = String(entry.key || "");
      }

      const value = document.createElement("div");
      value.className = "field-val";
      const values = Array.isArray(entry.value) ? entry.value : [entry.value];
      for (const item of values) {
        const span = document.createElement("span");
        span.textContent = dictionaryValueLabel(entry.key, item);
        value.appendChild(span);
      }

      row.append(label, value);
      body.appendChild(row);
    }

    card.appendChild(body);
    container.appendChild(card);

    const status = document.getElementById("yaml-status");
    if (status) {
      status.textContent = "Data loaded; this card is displayed in compatibility mode.";
      status.style.color = "#fbbf24";
    }
  }
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
        <button id="cancel-edit-btn"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cancel</button>
        <button class="primary" id="save-edit-btn"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save</button>
      </div>
    </div>
    <div class="card-body">
      <p class="editor-hint">Fields available here come from <code>@dictionary@</code>. Add custom keys in Edit Dictionary first.</p>
      <div id="edit-rows"></div>
      <div>
        <button id="add-field-btn" class="secondary"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add Field</button>
      </div>
    </div>
  `;

  const rowsEl = card.querySelector("#edit-rows");
  // Dotted dictionary paths describe nested children; they are labels and
  // descriptions for structured values, not standalone top-level card fields.
  const dictionaryOptions = Object.keys(state.dict).filter(key => !key.includes(".")).sort((a, b) => {
    const ga = Number(state.dict[a].group) || 0, gb = Number(state.dict[b].group) || 0;
    return ga - gb || state.dict[a].label.localeCompare(state.dict[b].label);
  });

  function addEditRow(key = "", value = "", group = 1) {
    const row = document.createElement("div");
    row.className = "edit-row";
    row.dataset.group = String(group);
    row.dataset.multiple = Array.isArray(value) ? "true" : "false";
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

    const hasNestedDictionaryFields = !!key && Object.keys(state.dict).some(dictionaryKey =>
      dictionaryKey.startsWith(`${key}.`));
    const isStructuredValue = !!value && typeof value === "object" &&
      (Array.isArray(value)
        ? value.some(item => item && typeof item === "object") || hasNestedDictionaryFields
        : true);
    const isMultipleValue = Array.isArray(value) && !isStructuredValue;
    const initialValue = isStructuredValue ? "" :
      (Array.isArray(value) ? value.map(item => String(item ?? "")).join("\n") : String(value ?? ""));
    if (isStructuredValue) {
      row.dataset.structured = "true";
      keySelect.disabled = true;
      keySelect.title = "The field key is fixed while editing its structured occurrences.";
    }
    function createStructuredNode(nodeValue, nodeKey, parentPath) {
      const kind = Array.isArray(nodeValue) ? "array" :
        (nodeValue && typeof nodeValue === "object" ? "object" : "scalar");
      const node = document.createElement("div");
      node.className = `structured-editor-node structured-${kind}`;
      node.dataset.kind = kind;
      node.dataset.key = nodeKey || "";
      const fullPath = nodeKey ? (parentPath ? `${parentPath}.${nodeKey}` : nodeKey) : parentPath;
      if (kind === "scalar") {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "eval structured-scalar";
        input.value = String(nodeValue ?? "");
        input.placeholder = formatKeyLabel(nodeKey || "value");
        node.appendChild(input);
        return node;
      }
      if (kind === "object") {
        for (const [childKey, childValue] of Object.entries(nodeValue)) {
          const field = document.createElement("div");
          field.className = "structured-editor-field";
          const label = document.createElement("label");
          const childPath = fullPath ? `${fullPath}.${childKey}` : childKey;
          label.textContent = state.dict[childPath]?.label || formatKeyLabel(childKey);
          const child = createStructuredNode(childValue, childKey, fullPath);
          field.append(label, child);
          node.appendChild(field);
        }
        return node;
      }
      const items = document.createElement("div");
      items.className = "structured-array-items";
      const template = nodeValue.length ? nodeValue[0] : null;
      const blankFromTemplate = sample => {
        if (Array.isArray(sample)) return [];
        if (sample && typeof sample === "object") {
          return Object.fromEntries(Object.entries(sample).map(([key, child]) => [key, blankFromTemplate(child)]));
        }
        return "";
      };
      const addItem = itemValue => {
        const item = document.createElement("div");
        item.className = "structured-array-item";
        const child = createStructuredNode(itemValue, "", fullPath);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button delete-entry-btn";
        remove.title = "Remove occurrence";
        remove.setAttribute("aria-label", "Remove occurrence");
        remove.textContent = "×";
        remove.addEventListener("click", () => item.remove());
        item.append(child, remove);
        items.appendChild(item);
      };
      nodeValue.forEach(item => addItem(item));
      const add = document.createElement("button");
      add.type = "button";
      add.className = "secondary structured-add-item";
      add.textContent = "+ Add occurrence";
      add.addEventListener("click", () => {
        const blank = template && typeof template === "object" ? blankFromTemplate(template) : "";
        addItem(blank);
      });
      node.append(items, add);
      return node;
    }
    function readStructuredNode(node) {
      const kind = node.dataset.kind;
      if (kind === "scalar") return node.querySelector(":scope > .structured-scalar")?.value ?? "";
      if (kind === "array") return [...node.querySelector(":scope > .structured-array-items").children]
        .map(item => readStructuredNode(item.querySelector(":scope > .structured-editor-node")));
      const result = {};
      for (const field of node.querySelectorAll(":scope > .structured-editor-field")) {
        const child = field.querySelector(":scope > .structured-editor-node");
        if (child) result[child.dataset.key] = readStructuredNode(child);
      }
      return result;
    }
    function makeValueControl(fieldKey, currentValue) {
      if (isStructuredValue) {
        const wrapper = document.createElement("div");
        wrapper.className = "eval structured-editor-root";
        wrapper.appendChild(createStructuredNode(value, fieldKey, ""));
        return wrapper;
      }
      const choices = getConfiguredFieldChoices(fieldKey);
      if (choices && !Array.isArray(value)) {
        const select = document.createElement("select");
        select.className = "eval";
        select.appendChild(new Option("Select a value…", ""));
        for (const [code, label] of Object.entries(choices)) {
          select.appendChild(new Option(`${label} (${code})`, code));
        }
        // Keep an imported or manually entered code even if it is not listed.
        if (currentValue && !Object.prototype.hasOwnProperty.call(choices, currentValue)) {
          select.appendChild(new Option(`${currentValue} (not listed)`, currentValue));
        }
        select.value = currentValue;
        return select;
      }
      const input = isMultipleValue ? document.createElement("textarea") : document.createElement("input");
      if (input.tagName === "INPUT") input.type = "text";
      input.className = "eval";
      input.value = currentValue;
      input.placeholder = isMultipleValue ? "One value per line" : "Value or @id@";
      if (isMultipleValue) input.rows = Math.min(5, Math.max(2, String(currentValue).split("\n").length));
      return input;
    }
    let valueInput = makeValueControl(key, initialValue);
    keySelect.addEventListener("change", () => {
      const currentValue = row.querySelector(".eval").value;
      const nextControl = makeValueControl(keySelect.value, currentValue);
      row.querySelector(".eval").replaceWith(nextControl);
      valueInput = nextControl;
    });

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.title = "Remove field";
    removeButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
    removeButton.className = "icon-button delete-entry-btn";
    removeButton.setAttribute("aria-label", "Remove field");
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
    let structuredEditError = false;
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
      if (!k) return;
      const group = Number(r.dataset.group) || 1;
      if (r.dataset.structured === "true") {
        const structuredRoot = r.querySelector(".structured-editor-root > .structured-editor-node");
        if (!structuredRoot) return;
        newEntries.push({ key: k, value: readStructuredNode(structuredRoot), group });
        return;
      }
      const rawValue = r.querySelector(".eval").value;
      const v = rawValue.trim();
      if (r.dataset.multiple === "true") {
        const items = rawValue.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
        newEntries.push({ key: k, value: items, group });
      } else if (k.endsWith("_ids") || v.includes(", @")) {
        const items = v.split(",").map(x => x.trim()).filter(Boolean);
        newEntries.push({ key: k, value: items, group });
      } else {
        newEntries.push({ key: k, value: v, group });
      }
    });
    if (structuredEditError) return;
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
// Preserve source tag paths and repeated occurrence boundaries without semantic remapping.
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

  // Keep GEDCOM xrefs as record IDs. Relationship references must resolve to
  // these exact IDs in the viewer. Rewriting IDs without rewriting every
  // reference breaks the links.

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
        { key: "format_version", value: "1", group: 0 },
        { key: "version", value: "3", group: 0 },
        { key: "language", value: "en", group: 0 },
        { key: "encoding", value: "UTF-8", group: 0 },
        { key: "individual_display_field", value: "name", group: 0 },
        { key: "family_display_field", value: "{$wife.name} & {$husb.name}", group: 0 },
        { key: "gender", value: { field: "sex", values: ["M", "F", "U"], labels: { M: "Male", F: "Female", U: "Unknown" }, male: "M", female: "F" }, group: 0 },
        { key: "image_field", value: "obje_file", group: 0 },
        { key: "tree", value: {
          individual_type: "Individual",
          family_type: "Family",
          individual: {
            birth: { date: "birt_date", place: "birt_plac" },
            death: { date: "deat_date", place: "deat_plac" },
            burial: { date: "buri_date", place: "buri_plac" }
          },
          family: {
            partners: ["husb", "wife"],
            children: ["chil"],
            marriage: { date: "marr_date", place: "marr_plac" },
            divorce: { date: "div_date" }
          }
        }, group: 0 },
        { key: "date_approx", value: "About {date}", group: 1 },
        { key: "date_uncertain", value: "Possibly {date}", group: 1 },
        { key: "date_range", value: "Between {start} and {end}", group: 1 },
        { key: "date_before", value: "On or before {date}", group: 1 },
        { key: "date_after", value: "On or after {date}", group: 1 }
      ]
    }
  ];

  const emittedRecordDocs = [];
  const gedcomGroupIds = new Map();
  const rawFamilyById = new Map(records.filter(r => r.tag === "FAM" && r.xref).map(r => [r.xref, r]));

  for (const rec of records) {
    if (!rec.xref || !["INDI", "FAM", "SOUR", "REPO"].includes(rec.tag)) continue;

    const type = rec.tag === "INDI" ? "Individual" : rec.tag === "FAM" ? "Family" : rec.tag === "SOUR" ? "Source" : "Repository";
    const id = rec.xref;
    const entries = [
      { key: "id", value: id, group: 0 },
      { key: "type", value: type, group: 0 }
    ];
    let group = 0;

    function addEntry(key, value) {
      // Empty GEDCOM values are meaningful and must not be discarded.
      if (value === null || value === undefined) return;

      // OGF stores one field definition per key. Repeated source occurrences
      // become an ordered list of values instead of synthetic keys such as
      // name_2, name_3, etc. Keep the first occurrence's card group.
      const existing = entries.find(entry => entry.key === key);
      if (existing) {
        if (!Array.isArray(existing.value)) existing.value = [existing.value];
        existing.value.push(value);
        return;
      }
      entries.push({ key, value, group });
    }

    function buildStructuredOccurrence(node) {
      const occurrence = {};
      // Preserve a value carried by a structured parent without inventing a
      // semantic GEDCOM-to-OGF field name.
      if (node.val !== "") occurrence.value = node.val;
      const childGroups = new Map();
      for (const child of node.children || []) {
        if (!childGroups.has(child.tag)) childGroups.set(child.tag, []);
        childGroups.get(child.tag).push(child);
      }
      for (const [childTag, occurrences] of childGroups) {
        const childKey = cleanTag(childTag);
        if (occurrences.length > 1) {
          occurrence[childKey] = occurrences.map(child =>
            child.children && child.children.length ? buildStructuredOccurrence(child) : child.val
          );
        } else {
          const child = occurrences[0];
          occurrence[childKey] = child.children && child.children.length
            ? buildStructuredOccurrence(child)
            : child.val;
        }
      }
      return occurrence;
    }

    function emitGedcomChildren(children, parentPath) {
      const childGroups = new Map();
      for (const child of children || []) {
        if (!childGroups.has(child.tag)) childGroups.set(child.tag, []);
        childGroups.get(child.tag).push(child);
      }
      for (const [childTag, occurrences] of childGroups) {
        if (occurrences.length > 1 && occurrences.some(node => node.children && node.children.length)) {
          const groupedKey = parentPath
            ? `${parentPath.toLowerCase().replace(/\./g, "_")}_${cleanTag(childTag)}`
            : cleanTag(childTag);
          addEntry(groupedKey, occurrences.map(buildStructuredOccurrence));
        } else {
          for (const child of occurrences) emitGedcomNode(child, parentPath);
        }
      }
    }

    function emitGedcomNode(node, parentPath) {
      const gedcomPath = parentPath ? `${parentPath}.${node.tag}` : node.tag;
      const fallbackKey = parentPath
        ? `${parentPath.toLowerCase().replace(/\./g, "_")}_${cleanTag(node.tag)}`
        : cleanTag(node.tag);
      // Keep source tag names intact (lowercase) and flatten their hierarchy
      // with underscores. The importer does not translate GEDCOM semantics
      // into the project's human-readable dictionary fields.
      const key = fallbackKey;

      // GEDCOM uses slashes to delimit the surname in NAME values.
      // They are syntax markers, not part of the person's display name.
      // Remove them only from the top-level NAME value on INDI records;
      // keep all other GEDCOM values and NAME subfields unchanged.
      let value = node.val;
      if (rec.tag === "INDI" && parentPath === "" && node.tag === "NAME") {
        value = value.replace(/\//g, "").trim();
      }

      // Drop an Individual-side FAMC/FAMS pointer only when the referenced
      // Family record contains a reciprocal field configured in @meta@.tree.
      // The configured field names are also enumerated in @dictionary@; the
      // GEDCOM tags are lowercased by the normal fallback path, not hardcoded
      // here. Descendant data such as FAMC.PEDI remains preserved.
      if (rec.tag === "INDI" && parentPath === "" &&
          (node.tag === "FAMC" || node.tag === "FAMS")) {
        const family = rawFamilyById.get(value);
        const individualId = rec.xref;
        const treeConfig = state.meta?.tree || {};
        const familyConfig = treeConfig.family || {};
        const configuredFields = node.tag === "FAMS"
          ? (Array.isArray(familyConfig.partners) ? familyConfig.partners : [])
          : (Array.isArray(familyConfig.children) ? familyConfig.children : []);
        const configuredFieldSet = new Set(configuredFields.map(field => String(field).toLowerCase()));
        const reciprocal = family && family.children.some(child => {
          const familyField = cleanTag(child.tag);
          return configuredFieldSet.has(familyField) && child.val === individualId;
        });
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

      emitGedcomChildren(node.children, gedcomPath);
    }

    // Group repeated structured root tags as ordered lists of occurrence
    // objects. Repeated leaf tags remain ordered scalar lists. The dictionary
    // receives one key per source tag, never event_1/event_2-style keys.
    const rootGroups = new Map();
    for (const node of rec.children) {
      if (!rootGroups.has(node.tag)) rootGroups.set(node.tag, []);
      rootGroups.get(node.tag).push(node);
    }
    for (const [rootTagName, occurrences] of rootGroups) {
      const rootTag = cleanTag(rootTagName);
      if (!gedcomGroupIds.has(rootTag)) gedcomGroupIds.set(rootTag, gedcomGroupIds.size + 1);
      group = gedcomGroupIds.get(rootTag);
      if (occurrences.length > 1 && occurrences.some(node => node.children && node.children.length)) {
        addEntry(rootTag, occurrences.map(buildStructuredOccurrence));
        if (rootTagName === "OBJE") {
          for (const objectNode of occurrences) {
            const pointer = objectNode.val;
            const linkedFiles = /^@[^@]+@$/.test(String(pointer || ""))
              ? (rawObjectFilesById.get(pointer) || []) : [];
            const inlineFiles = [];
            collectObjectFiles(objectNode, inlineFiles);
            for (const filePath of [...linkedFiles, ...inlineFiles]) addEntry("obje_file", filePath);
          }
        }
      } else {
        for (const node of occurrences) emitGedcomNode(node, "");
      }
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

  // GEDCOM imports start with an import-specific dictionary, not the
  // curated starter-project dictionary. The starter defaults are reserved for
  // new empty projects; imported keys remain source-derived and unmodified.
  const dictionaryEntries = [
    { key: "id", value: "@dictionary@", group: 0 },
    { key: "type", value: "Dictionary", group: 0 }
  ];
  const importedKeys = new Map();
  for (const recordDoc of emittedRecordDocs) {
    for (const entry of recordDoc.entries) {
      if (entry.key === "id" || entry.key === "type") continue;
      if (!importedKeys.has(entry.key)) {
        importedKeys.set(entry.key, entry.group);
      }
    }
  }
  const nestedDictionaryPaths = new Map();
  function collectNestedDictionaryPaths(value, parentPath, importedGroup) {
    if (Array.isArray(value)) {
      for (const item of value) collectNestedDictionaryPaths(item, parentPath, importedGroup);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, childValue] of Object.entries(value)) {
      const path = `${parentPath}.${childKey}`;
      if (!nestedDictionaryPaths.has(path)) nestedDictionaryPaths.set(path, importedGroup);
      collectNestedDictionaryPaths(childValue, path, importedGroup);
    }
  }
  for (const recordDoc of emittedRecordDocs) {
    for (const entry of recordDoc.entries) {
      if (entry.key === "id" || entry.key === "type") continue;
      if (entry.value && typeof entry.value === "object") {
        collectNestedDictionaryPaths(entry.value, entry.key, entry.group);
      }
    }
  }
  for (const [key, importedGroup] of [...importedKeys.entries()].sort((a, b) => a[1] - b[1])) {
    const label = key.replace(/^_+/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    dictionaryEntries.push({ key, value: label, group: importedGroup });
  }
  // Nested paths provide one reusable definition per child field, independent
  // of how many repeated occurrences exist. They are not top-level record keys.
  for (const [path, importedGroup] of [...nestedDictionaryPaths.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))) {
    const leaf = path.split(".").pop();
    const label = leaf.replace(/^_+/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    dictionaryEntries.push({ key: path, value: label, group: importedGroup });
  }
  // Value-choice definitions are OGF presentation metadata, not GEDCOM facts.
  // Keep standard sex labels only when imported records actually use GEDCOM SEX.
  if (!importedKeys.has("sex")) {
    const metaDoc = outDocs.find(doc => doc.id === "@meta@");
    if (metaDoc) {
      metaDoc.entries = metaDoc.entries.filter(entry => entry.key !== "gender");
      metaDoc.map = Object.fromEntries(metaDoc.entries.map(entry => [entry.key, entry.value]));
    }
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
  function countNestedKeys(value) {
    if (Array.isArray(value)) {
      value.forEach(countNestedKeys);
    } else if (value && typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        counts[nestedKey] = (counts[nestedKey] || 0) + 1;
        countNestedKeys(nestedValue);
      }
    }
  }
  for (const doc of state.docs) {
    for (const e of doc.entries) {
      if (e.key === "id" || e.key === "type") continue;
      if (doc.id === "@dictionary@" && e.key.includes(".")) continue;
      counts[e.key] = (counts[e.key] || 0) + 1;
      if (doc.id !== "@meta@" && doc.id !== "@dictionary@") countNestedKeys(e.value);
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
      const mapDictionaryPath = key => key.split(".").map(part => mapping[part] || part).join(".");
      const resultingKeys = doc.entries.map(entry =>
        doc.id === "@dictionary@" && entry.key.includes(".")
          ? mapDictionaryPath(entry.key)
          : (mapping[entry.key] || entry.key)
      );
      const seen = new Set();
      const duplicate = resultingKeys.find(key => seen.has(key) || !seen.add(key));
      let nestedDuplicate = null;
      const checkNested = value => {
        if (Array.isArray(value)) { value.forEach(checkNested); return; }
        if (!value || typeof value !== "object") return;
        const nestedKeys = Object.keys(value).map(key => mapping[key] || key);
        const nestedSeen = new Set();
        nestedDuplicate = nestedKeys.find(key => nestedSeen.has(key) || !nestedSeen.add(key)) || nestedDuplicate;
        Object.values(value).forEach(checkNested);
      };
      if (doc.id !== "@meta@" && doc.id !== "@dictionary@") doc.entries.forEach(entry => checkNested(entry.value));
      if (duplicate || nestedDuplicate) {
        const conflict = duplicate || nestedDuplicate;
        alert(`Replacement would create duplicate key "${conflict}" in ${doc.id}. No keys were changed.`);
        return;
      }
    }
    for (const doc of state.docs) {
      for (const e of doc.entries) {
        if (doc.id === "@dictionary@" && e.key.includes(".")) {
          e.key = e.key.split(".").map(part => mapping[part] || part).join(".");
        } else if (mapping[e.key]) e.key = mapping[e.key];
        if (doc.id !== "@meta@" && doc.id !== "@dictionary@") {
          const renameNestedKeys = value => {
            if (Array.isArray(value)) return value.map(renameNestedKeys);
            if (value && typeof value === "object") {
              return Object.fromEntries(Object.entries(value).map(([nestedKey, nestedValue]) => [
                mapping[nestedKey] || nestedKey, renameNestedKeys(nestedValue)
              ]));
            }
            return value;
          };
          e.value = renameNestedKeys(e.value);
        }
      }
      // image_field stores field names as metadata values, not YAML keys.
      // Keep those references aligned with the renamed record/dictionary keys.
      if (doc.id === "@meta@" || doc.type === "Meta") {
        const genderEntry = doc.entries.find(entry => entry.key === "gender");
        if (genderEntry && genderEntry.value && typeof genderEntry.value === "object" && !Array.isArray(genderEntry.value)) {
          if (typeof genderEntry.value.field === "string") {
            genderEntry.value.field = mapping[genderEntry.value.field] || genderEntry.value.field;
          }
        }
        const imageFieldEntry = doc.entries.find(entry => entry.key === "image_field");
        if (imageFieldEntry) {
          const configured = imageFieldEntry.value;
          if (typeof configured === "string") {
            imageFieldEntry.value = mapping[configured] || configured;
          } else if (Array.isArray(configured)) {
            imageFieldEntry.value = configured.map(field => typeof field === "string" ? (mapping[field] || field) : field);
          } else if (configured && typeof configured === "object") {
            // Legacy per-record-type mappings are normalized to one shared
            // ordered field list. The shared configuration then applies to
            // every record type.
            const fields = Object.values(configured).flatMap(value => Array.isArray(value) ? value : [value]);
            imageFieldEntry.value = [...new Set(fields
              .filter(field => typeof field === "string")
              .map(field => mapping[field] || field))];
          }
        }
      }
    }
    syncDocsToEditor();
  }
  replacerModal.classList.remove("open");
});

// Dictionary editor: the dictionary is the only source of fields available in card editors.
const dictionaryModal = document.getElementById("dictionary-modal");
const dictionaryRowsEl = document.getElementById("dictionary-rows");

function addDictionaryEditorRow(key = "", label = "", desc = "", group = 1, choices = "", groupLabel = "") {
  const row = document.createElement("div");
  row.className = "dictionary-row";
  row.innerHTML = `
    <input class="dict-key" type="text" value="${escapeHtml(key)}" placeholder="custom_field or event.date">
    <input class="dict-label" type="text" value="${escapeHtml(label)}" placeholder="Field label">
    <input class="dict-desc" type="text" value="${escapeHtml(desc)}" placeholder="Optional description">
    <input class="dict-choices" type="text" value="${escapeHtml(choices)}" placeholder="M=Male | F=Female" title="Optional code=label choices, separated by |">
    <input class="dict-group" type="number" min="1" step="1" value="${Number(group) || 1}" title="Display group number">
    <input class="dict-group-label" type="text" value="${escapeHtml(groupLabel)}" placeholder="Group name" title="Card section heading">
    <div class="dict-order-controls">
      <button type="button" class="icon-button dict-move-up" title="Move field up" aria-label="Move field up"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
      <button type="button" class="icon-button dict-move-down" title="Move field down" aria-label="Move field down"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
      <button type="button" class="icon-button dict-group-up" title="Move entire group up" aria-label="Move entire group up"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
      <button type="button" class="icon-button dict-group-down" title="Move entire group down" aria-label="Move entire group down"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
    </div>
    <button type="button" class="icon-button delete-entry-btn" title="Remove dictionary entry" aria-label="Remove dictionary entry"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
  `;
  row.querySelector(".delete-entry-btn").addEventListener("click", () => row.remove());
  row.querySelector(".dict-move-up").addEventListener("click", () => {
    const previous = row.previousElementSibling;
    if (previous) dictionaryRowsEl.insertBefore(row, previous);
  });
  row.querySelector(".dict-move-down").addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) dictionaryRowsEl.insertBefore(next, row);
  });
  function shiftDictionaryGroup(delta) {
    const currentGroup = Math.max(1, Number(row.querySelector(".dict-group").value) || 1);
    const targetGroup = Math.max(1, currentGroup + delta);
    if (targetGroup === currentGroup) return;
    const rows = [...dictionaryRowsEl.querySelectorAll(".dictionary-row")];
    const currentLabel = rows.find(item => Number(item.querySelector(".dict-group").value) === currentGroup)
      ?.querySelector(".dict-group-label")?.value || "";
    const targetLabel = rows.find(item => Number(item.querySelector(".dict-group").value) === targetGroup)
      ?.querySelector(".dict-group-label")?.value || "";
    rows.forEach(item => {
      const input = item.querySelector(".dict-group");
      const value = Math.max(1, Number(input.value) || 1);
      if (value === currentGroup) {
        input.value = targetGroup;
        item.querySelector(".dict-group-label").value = targetLabel;
      } else if (value === targetGroup) {
        input.value = currentGroup;
        item.querySelector(".dict-group-label").value = currentLabel;
      }
    });
  }
  row.querySelector(".dict-group-up").addEventListener("click", () => shiftDictionaryGroup(-1));
  row.querySelector(".dict-group-down").addEventListener("click", () => shiftDictionaryGroup(1));
  dictionaryRowsEl.appendChild(row);
}

function openDictionaryEditor() {
  dictionaryRowsEl.innerHTML = "";
  const dictionaryDoc = state.docs.find(d => d.id === "@dictionary@" || d.type === "Dictionary");
  if (dictionaryDoc) {
    const entriesByKey = new Map(dictionaryDoc.entries.map(entry => [entry.key, entry]));
    const groupLabels = new Map(dictionaryDoc.entries
      .filter(entry => /^__group_\d+$/.test(entry.key))
      .map(entry => [Number(entry.key.slice(8)), String(entry.value ?? "")]));
    for (const entry of dictionaryDoc.entries) {
      if (entry.key === "id" || entry.key === "type" || /^__group_\d+$/.test(entry.key)) continue;
      const baseKey = entry.key.endsWith("_values") ? entry.key.slice(0, -7) : "";
      if (baseKey && entriesByKey.has(baseKey)) continue;
      const raw = String(entry.value ?? "");
      const parts = raw.split(/\s+[—-]\s+/);
      const choicesEntry = entriesByKey.get(entry.key + "_values");
      addDictionaryEditorRow(entry.key, parts.length > 1 ? parts[0].trim() : raw,
        parts.length > 1 ? parts.slice(1).join(" - ").trim() : "", entry.group,
        choicesEntry ? String(choicesEntry.value ?? "") : "",
        groupLabels.get(Number(entry.group) || 1) || "");
    }
  }
  dictionaryModal.classList.add("open");
}

document.getElementById("edit-dictionary-btn").addEventListener("click", openDictionaryEditor);
document.getElementById("close-dictionary-btn").addEventListener("click", () => dictionaryModal.classList.remove("open"));
document.getElementById("cancel-dictionary-btn").addEventListener("click", () => dictionaryModal.classList.remove("open"));
document.getElementById("add-dictionary-row-btn").addEventListener("click", () => addDictionaryEditorRow());

document.getElementById("save-dictionary-btn").addEventListener("click", () => {
  const existingDictionary = state.docs.find(d => d.id === "@dictionary@" || d.type === "Dictionary");
  const entries = [
    { key: "id", value: "@dictionary@", group: 0 },
    { key: "type", value: "Dictionary", group: 0 }
  ];
  const keys = new Set();
  const groupLabels = new Map();
  let error = "";
  dictionaryRowsEl.querySelectorAll(".dictionary-row").forEach(row => {
    const key = row.querySelector(".dict-key").value.trim();
    const label = row.querySelector(".dict-label").value.trim();
    const desc = row.querySelector(".dict-desc").value.trim();
    const choicesRaw = row.querySelector(".dict-choices").value.trim();
    const group = Math.max(1, Number(row.querySelector(".dict-group").value) || 1);
    const groupLabel = row.querySelector(".dict-group-label").value.trim();
    if (groupLabel && !groupLabels.has(group)) groupLabels.set(group, groupLabel);
    if (!key) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(key) || key === "id" || key === "type") {
      error = `Invalid dictionary key: ${key}`;
      return;
    }
    if (keys.has(key)) {
      error = `Duplicate dictionary key: ${key}`;
      return;
    }
    keys.add(key);
    entries.push({ key, value: label + (desc ? " — " + desc : ""), group });
    if (choicesRaw) {
      const parsed = parseDictionaryValues(choicesRaw);
      const choiceParts = choicesRaw.split("|").map(part => part.trim()).filter(Boolean);
      if (!choiceParts.length || choiceParts.some(part => !part.includes("=") || !part.slice(0, part.indexOf("=")).trim())) {
        error = `Invalid choices for ${key}. Use code=label pairs separated by |.`;
        return;
      }
      if (Object.keys(parsed).length !== choiceParts.length) {
        error = `Duplicate or invalid choice code for ${key}.`;
        return;
      }
      const valuesKey = key + "_values";
      if (keys.has(valuesKey)) {
        error = `Dictionary key conflict: ${valuesKey} is reserved for choices for ${key}.`;
        return;
      }
      keys.add(valuesKey);
      entries.push({ key: valuesKey, value: formatDictionaryValues(parsed), group });
    }
  });
  if (error) {
    alert(error);
    return;
  }
  for (const [group, label] of [...groupLabels.entries()].sort((a,b) => a[0] - b[0])) {
    entries.push({ key: `__group_${group}`, value: label, group: 0 });
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

// Metadata editor: edit nested metadata structures as independent fields/items.
const metadataModal = document.getElementById("metadata-modal");
const metadataRowsEl = document.getElementById("metadata-rows");

function metadataScalarInput(value) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "meta-node-value";
  input.value = value == null ? "" : String(value);
  input.dataset.originalType = value === null ? "null" : typeof value;
  input.placeholder = "Value";
  return input;
}

function metadataNode(key, value, options = {}) {
  const node = document.createElement("div");
  node.className = "meta-node";
  node.dataset.kind = Array.isArray(value) ? "array" :
    (value && typeof value === "object" ? "object" : "scalar");
  if (options.topLevel) node.classList.add("meta-top-node");
  if (options.arrayItem) node.classList.add("meta-array-item");

  const head = document.createElement("div");
  head.className = "meta-node-head";
  if (!options.arrayItem) {
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "meta-node-key";
    keyInput.value = key ?? "";
    keyInput.placeholder = "metadata_key";
    // Existing metadata keys are schema identifiers, not editable values.
    // A blank key is a newly-added field and can be named once.
    if (String(key ?? "").trim()) {
      keyInput.readOnly = true;
      keyInput.title = "Metadata keys are fixed; edit the value, not the key.";
      keyInput.setAttribute("aria-label", `Fixed metadata key ${key}`);
    } else {
      keyInput.title = "Enter the new metadata key.";
    }
    head.appendChild(keyInput);
  } else {
    const itemLabel = document.createElement("span");
    itemLabel.className = "meta-array-item-label";
    itemLabel.textContent = node.dataset.kind === "object" ? "Object item" :
      node.dataset.kind === "array" ? "List item" : "Item";
    head.appendChild(itemLabel);
  }

  const kindLabel = document.createElement("span");
  kindLabel.className = "meta-node-kind";
  kindLabel.textContent = node.dataset.kind === "object" ? "Object" :
    node.dataset.kind === "array" ? "List" : "Value";
  head.appendChild(kindLabel);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button meta-node-remove";
  remove.title = options.arrayItem ? "Remove item" : "Remove metadata field";
  remove.setAttribute("aria-label", remove.title);
  remove.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
  remove.addEventListener("click", () => node.remove());
  head.appendChild(remove);
  node.appendChild(head);

  if (node.dataset.kind === "scalar") {
    const valueInput = metadataScalarInput(value);
    node.appendChild(valueInput);
  } else {
    const children = document.createElement("div");
    children.className = "meta-node-children";
    if (node.dataset.kind === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        children.appendChild(metadataNode(childKey, childValue));
      }
      const add = document.createElement("button");
      add.type = "button";
      add.className = "secondary meta-add-child";
      add.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add nested field';
      add.addEventListener("click", () => children.insertBefore(
        metadataNode("", ""), add
      ));
      children.appendChild(add);
    } else {
      value.forEach(item => children.appendChild(metadataNode("", item, { arrayItem: true })));
      const add = document.createElement("button");
      add.type = "button";
      add.className = "secondary meta-add-child";
      add.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add item';
      add.addEventListener("click", () => {
        const firstItem = children.querySelector(":scope > .meta-node");
        const templateKind = firstItem?.dataset.kind || "scalar";
        const emptyValue = templateKind === "object" ? {} : templateKind === "array" ? [] : "";
        children.insertBefore(metadataNode("", emptyValue, { arrayItem: true }), add);
      });
      children.appendChild(add);
    }
    node.appendChild(children);
  }
  return node;
}

function addMetadataEditorRow(key = "", value = "") {
  metadataRowsEl.appendChild(metadataNode(key, value, { topLevel: true }));
}

function metadataNodeValue(node) {
  const kind = node.dataset.kind;
  if (kind === "scalar") {
    const input = node.querySelector(":scope > .meta-node-value");
    const raw = input ? input.value : "";
    const originalType = input?.dataset.originalType;
    if (originalType === "number" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
    if (originalType === "boolean") {
      if (raw.toLowerCase() === "true") return true;
      if (raw.toLowerCase() === "false") return false;
    }
    if (originalType === "null" && raw === "") return null;
    return raw;
  }
  const children = node.querySelector(":scope > .meta-node-children");
  if (kind === "array") {
    return [...children.querySelectorAll(":scope > .meta-node")].map(metadataNodeValue);
  }
  const result = {};
  for (const child of children.querySelectorAll(":scope > .meta-node")) {
    const keyInput = child.querySelector(":scope > .meta-node-head > .meta-node-key");
    const key = keyInput?.value.trim();
    if (key) result[key] = metadataNodeValue(child);
  }
  return result;
}

function openMetadataEditor() {
  metadataRowsEl.innerHTML = "";
  const metaDoc = state.docs.find(d => d.id === "@meta@" || d.type === "Meta");
  const entries = metaDoc ? metaDoc.entries : [
    { key: "format_version", value: 1 },
    { key: "version", value: 1 },
    { key: "language", value: "en" },
    { key: "encoding", value: "UTF-8" },
    { key: "individual_display_field", value: "name" },
    { key: "family_display_field", value: "{$wife.name} & {$husb.name}" },
    { key: "date_approx", value: "About {date}" },
    { key: "date_uncertain", value: "Possibly {date}" },
    { key: "date_range", value: "Between {start} and {end}" },
    { key: "date_before", value: "On or before {date}" },
    { key: "date_after", value: "On or after {date}" }
  ];
  for (const entry of entries) {
    if (entry.key === "id" || entry.key === "type") continue;
    let value = entry.value;
    // Normalize legacy per-record-type image mappings to the single shared
    // field/list control when opening metadata for editing.
    if (entry.key === "image_field" && value && typeof value === "object" && !Array.isArray(value)) {
      const sharedFields = [...new Set(Object.values(value)
        .flatMap(fields => Array.isArray(fields) ? fields : [fields])
        .filter(field => typeof field === "string" && field.trim())
        .map(field => field.trim()))];
      value = sharedFields.length === 1 ? sharedFields[0] : sharedFields;
    }
    addMetadataEditorRow(entry.key, value);
  }
  metadataModal.classList.add("open");
}
function closeMetadataEditor() { metadataModal.classList.remove("open"); }
document.getElementById("close-metadata-btn").addEventListener("click", closeMetadataEditor);
document.getElementById("cancel-metadata-btn").addEventListener("click", closeMetadataEditor);
document.getElementById("add-metadata-row-btn").addEventListener("click", () => addMetadataEditorRow());
document.getElementById("save-metadata-btn").addEventListener("click", () => {
  const entries = [
    { key: "id", value: "@meta@", group: 0 }, { key: "type", value: "Meta", group: 0 }
  ];
  const keys = new Set(["id", "type"]);
  let error = "";
  for (const [index, row] of [...metadataRowsEl.querySelectorAll(":scope > .meta-node")].entries()) {
    const key = row.querySelector(":scope > .meta-node-head > .meta-node-key")?.value.trim();
    if (!key) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key === "id" || key === "type") {
      error = `Invalid metadata key: ${key}`; break;
    }
    if (keys.has(key)) { error = `Duplicate metadata key: ${key}`; break; }
    keys.add(key);
    const storedValue = metadataNodeValue(row);
    if (["gender", "gender_mapping", "tree", "tree_relationships"].includes(key) &&
        (!storedValue || typeof storedValue !== "object" || Array.isArray(storedValue))) {
      error = `${key} must be an object.`; break;
    }
    if (["format_version", "version"].includes(key) &&
        (!Number.isInteger(Number(storedValue)) || Number(storedValue) < 1)) {
      error = `${key} must be a positive integer.`; break;
    }
    if (key === "image_field") {
      const validField = field => typeof field === "string" && field.trim().length > 0;
      const validConfig = typeof storedValue === "string"
        ? validField(storedValue)
        : Array.isArray(storedValue) && storedValue.length > 0 && storedValue.every(validField);
      if (!validConfig) { error = "image_field must contain field names."; break; }
    }
    entries.push({ key, value: storedValue, group: index + 1 });
  }
  if (error) { alert(error); return; }
  const metaDoc = state.docs.find(d => d.id === "@meta@" || d.type === "Meta") ||
    { id: "@meta@", type: "Meta", entries: [], map: {} };
  if (!state.docs.includes(metaDoc)) state.docs.unshift(metaDoc);
  metaDoc.entries = entries;
  metaDoc.map = Object.fromEntries(entries.map(entry => [entry.key, entry.value]));
  closeMetadataEditor();
  syncDocsToEditor();
});

document.getElementById("config-select").addEventListener("change", event => {
  const action = event.target.value; event.target.value = "";
  if (action === "replace-keys") document.getElementById("replace-keys-btn").click();
  if (action === "dictionary") openDictionaryEditor();
  if (action === "metadata") openMetadataEditor();
});

// Keep exactly one icon inside the YAML toggle. Clicks may originate on the
// nested <i>, so always update the button itself rather than event.target.
function updateYamlToggleButton() {
  const button = document.getElementById("toggle-yaml-btn");
  const pane = document.getElementById("yaml-pane");
  if (!button || !pane) return;

  const isHidden = pane.classList.contains("hidden");
  const icon = document.createElement("i");
  icon.className = isHidden ? "fa-solid fa-code" : "fa-solid fa-code-branch";
  icon.setAttribute("aria-hidden", "true");
  button.replaceChildren(icon);
  button.title = isHidden ? "Show YAML editor" : "Hide YAML editor";
  button.setAttribute("aria-label", button.title);
}

// UI Wiring
document.getElementById("toggle-yaml-btn").addEventListener("click", () => {
  const pane = document.getElementById("yaml-pane");
  pane.classList.toggle("hidden");
  updateYamlToggleButton();
});

async function loadNewProject() {
  const status = document.getElementById("yaml-status");
  status.textContent = "Loading reusable default configuration…";
  status.style.color = "";
  try {
    const docs = await loadDefaultProjectDocs();
    const editor = document.getElementById("yaml-editor");
    editor.value = serializeYamlStream(docs);
    state.selectedId = null;
    state.editMode = false;
    state.activeTab = "Individual";
    updateTabUI();
    rebuildFromEditor();
    status.textContent = "New empty project · defaults loaded from defaults/meta.yaml and defaults/dictionary.yaml";
    status.style.color = "#4ade80";
    document.getElementById("sample-select").value = "";
  } catch (error) {
    status.textContent = `Could not create a new project: ${error.message}`;
    status.style.color = "#f87171";
    console.error(error);
  }
}

async function loadSample(language) {
  const filename = SAMPLE_FILES[language];
  const status = document.getElementById("yaml-status");
  const editor = document.getElementById("yaml-editor");
  const sampleSelect = document.getElementById("sample-select");

  if (!filename) {
    status.textContent = `Unknown sample language: ${language}`;
    status.style.color = "#f87171";
    return;
  }

  sampleSelect.disabled = true;
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
    updateYamlToggleButton();
  } finally {
    sampleSelect.disabled = false;
    sampleSelect.value = "";
  }
}

document.getElementById("sample-select").addEventListener("change", event => {
  const language = event.target.value;
  if (language === "new") loadNewProject();
  else if (language) loadSample(language);
});

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

function nextRecordId(type) {
  const prefixes = { Individual: "I", Family: "F", Source: "S", Repository: "R" };
  const prefix = prefixes[type] || "R";
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("^" + escaped + "-(\\d+)$");
  let highest = Number(idCounters[type] || 0);

  // Existing IDs are authoritative. Scan the current project so imported OGF
  // identifiers and records added during this session are always respected.
  for (const doc of state.docs) {
    const match = String(doc.id || "").match(pattern);
    if (match) highest = Math.max(highest, Number(match[1]));
  }

  const id = `${prefix}-${highest + 1}`;
  idCounters[type] = highest + 1;
  return id;
}

document.getElementById("add-ind-btn").addEventListener("click", () => {
  const id = nextRecordId("Individual");
  state.docs.push({
    id,
    type: "Individual",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Individual", group: 0 }
    ],
    map: { id, type: "Individual" }
  });
  state.activeTab = "Individual";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});

document.getElementById("add-fam-btn").addEventListener("click", () => {
  const id = nextRecordId("Family");
  state.docs.push({
    id,
    type: "Family",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Family", group: 0 }
    ],
    map: { id, type: "Family" }
  });
  state.activeTab = "Family";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});



document.getElementById("add-source-btn")?.addEventListener("click", () => {
  const id = nextRecordId("Source");
  state.docs.push({
    id,
    type: "Source",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Source", group: 0 }
    ],
    map: { id, type: "Source" }
  });
  state.activeTab = "Source";
  state.selectedId = id;
  state.editMode = true;
  updateTabUI();
  syncDocsToEditor();
});

document.getElementById("add-repository-btn")?.addEventListener("click", () => {
  const id = nextRecordId("Repository");
  state.docs.push({
    id,
    type: "Repository",
    entries: [
      { key: "id", value: id, group: 0 },
      { key: "type", value: "Repository", group: 0 }
    ],
    map: { id, type: "Repository" }
  });
  state.activeTab = "Repository";
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

const saveModal = document.getElementById("save-modal");
const saveFileName = document.getElementById("save-file-name");
const saveFileFormat = document.getElementById("save-file-format");
const saveFormatHelp = document.getElementById("save-format-help");
const svgPrintOptions = document.getElementById("svg-print-options");
const svgPageSize = document.getElementById("svg-page-size");
const svgPageOrientation = document.getElementById("svg-page-orientation");
const pdfScaleMode = document.getElementById("pdf-scale-mode");
const advancedSvgButton = document.getElementById("export-svg-advanced-btn");
const confirmSaveButton = document.getElementById("confirm-save-btn");

function closeSaveModal() {
  saveModal?.classList.remove("open");
}

function normalizedExportName(rawName, extension) {
  let name = String(rawName || "").trim();
  name = name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ");
  name = name.replace(/\.(?:ogf\.)?ya?ml$|\.svg$/i, "");
  return (name || "family-tree") + extension;
}

function updateSaveFormatHelp() {
  const format = saveFileFormat.value;
  const isPdf = format === "pdf";
  if (svgPrintOptions) svgPrintOptions.hidden = !isPdf;
  saveFormatHelp.textContent = isPdf
    ? (window.OGFTree?.isAvailable?.()
      ? "Opens a print layout with the rendered tree and photographs. Choose Fit to one page or Actual size; the browser print dialog saves the PDF."
      : "PDF export is available when the tree view is open and a tree has been rendered. Open the tree view first.")
    : "Saves the complete OGF project, including records, dictionary and metadata.";
  if (isPdf) saveFileName.placeholder = "family-tree";
}

function openSaveModal() {
  // Keep the primary dialog focused on YAML and PDF. SVG remains available
  // under Advanced export formats.
  saveFileFormat.value = "yaml";
  updateSaveFormatHelp();
  saveModal?.classList.add("open");
  saveFileName?.focus();
  saveFileName?.select();
}

document.getElementById("save-project-btn")?.addEventListener("click", openSaveModal);
document.getElementById("tree-save-export-btn")?.addEventListener("click", openSaveModal);

saveFileFormat?.addEventListener("change", updateSaveFormatHelp);
document.getElementById("close-save-modal-btn")?.addEventListener("click", closeSaveModal);
document.getElementById("cancel-save-btn")?.addEventListener("click", closeSaveModal);
saveModal?.addEventListener("click", event => {
  if (event.target === saveModal) closeSaveModal();
});

async function runTreeExport(format) {
  if (!window.OGFTree?.isAvailable?.()) {
    saveFormatHelp.textContent = "Open the tree view and render a tree before exporting.";
    return;
  }
  const isPdf = format === "pdf";
  const filename = normalizedExportName(saveFileName.value, isPdf ? ".pdf" : ".svg");
  // Open synchronously from the click handler so popup blockers do not
  // prevent the browser's native print-to-PDF workflow.
  const printWindow = isPdf ? window.open("about:blank", "_blank") : null;
  if (isPdf && !printWindow) {
    saveFormatHelp.textContent = "The print window was blocked. Allow pop-ups for this OGF site and try again.";
    return;
  }
  const trigger = isPdf ? confirmSaveButton : advancedSvgButton;
  try {
    if (trigger) trigger.disabled = true;
    const exportOptions = {
      pageSize: svgPageSize?.value || "A1",
      orientation: svgPageOrientation?.value || "landscape",
      scaleMode: pdfScaleMode?.value || "fit"
    };
    const exportPromise = isPdf
      ? window.OGFTree.exportPrintPdf(filename, { ...exportOptions, printWindow })
      : window.OGFTree.exportSvg(filename, exportOptions);
    const result = await exportPromise;
    if (result?.printOpened || !isPdf) closeSaveModal();
  } catch (error) {
    console.error("Tree export failed:", error);
    saveFormatHelp.textContent = error?.message || "The current tree could not be exported.";
    if (printWindow && !printWindow.closed) printWindow.close();
  } finally {
    if (trigger) trigger.disabled = false;
  }
}

advancedSvgButton?.addEventListener("click", () => runTreeExport("svg"));

confirmSaveButton?.addEventListener("click", () => {
  const format = saveFileFormat.value;
  if (format === "pdf") {
    runTreeExport("pdf");
    return;
  }

  const filename = normalizedExportName(saveFileName.value, ".ogf.yaml");
  const yaml = document.getElementById("yaml-editor").value;
  const blob = new Blob([yaml], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeSaveModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && saveModal?.classList.contains("open")) closeSaveModal();
});

// Narrow public bridge for the optional OGF tree module. The tree reads the
// same in-memory records and delegates selection back to the existing card.
function getGenderClass(record) {
  const mapping = state.meta.gender || state.meta.gender_mapping;
  if (!mapping || typeof mapping !== "object" || !mapping.field) return "unknown";
  const rawValue = record && record.map ? record.map[mapping.field] : undefined;
  if (rawValue === undefined || rawValue === null || Array.isArray(rawValue)) return "unknown";
  const value = String(rawValue);
  if (value === String(mapping.male)) return "male";
  if (value === String(mapping.female)) return "female";
  if (Array.isArray(mapping.values) && !mapping.values.map(String).includes(value)) return "unknown";
  return "unknown";
}

window.OGFApp = {
  getDocs: () => state.docs,
  getMeta: () => state.meta,
  getDictionary: () => state.dict,
  getGenderClass,
  getSelectedId: () => state.selectedId,
  getRecordTitle: doc => getRecordTitle(doc, Object.fromEntries(state.docs.map(item => [item.id, item]))),
  getImageUrl: doc => getImageCandidates(doc)[0] || null,
  getImageDisplayUrl: url => getRemoteMediaDisplayUrl(url),
  getCachedImageBlob: url => getCachedRemoteImageBlob(url),
  configureImageRequest: (img,url) => configureRemoteImageRequest(img,url),
  selectRecord: id => {
    const doc = state.docs.find(item => item.id === id);
    if (!doc) return;
    state.selectedId = id;
    state.editMode = false;
    state.activeTab = doc.type || "All";
    updateTabUI();
    renderDirectory();
    renderInspector();
  }
};

// Start with a clean project; samples remain available as explicit examples.
loadNewProject();

#!/usr/bin/env node
// Lightweight release consistency check; requires only Node.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('VERSION.json'));
const spec = read('specs/SPECIFICATION.md');
const engine = read('js/open-genealogy-format.js');
const html = read('index.html');
const errors = [];

if (!html.includes('id="version-badge"')) {
  errors.push('index.html is missing the version badge');
}
if (!html.includes('fetch("./VERSION.json"')) {
  errors.push('Version badge must load VERSION.json dynamically');
}
if (/<span[^>]*id="version-badge"[^>]*>\s*v?\d+\.\d+\.\d+\s*<\/span>/i.test(html)) {
  errors.push('Version badge must not contain a hardcoded version');
}
if (!html.includes('version.projectVersion')) {
  errors.push('Version badge must use projectVersion from VERSION.json');
}

if (!spec.includes(`**Version:** ${manifest.specificationVersion}`)) {
  errors.push('specs/SPECIFICATION.md version does not match VERSION.json specificationVersion');
}
if (!engine.includes(`const SUPPORTED_OGF_FORMAT_VERSION = ${manifest.formatVersion};`)) {
  errors.push('Viewer supported format version does not match VERSION.json formatVersion');
}
if (!engine.includes(`const SUPPORTED_META_CONTRACT_VERSION = ${manifest.metadataContractVersion};`)) {
  errors.push('Viewer supported metadata contract version does not match VERSION.json metadataContractVersion');
}
for (const file of fs.readdirSync(path.join(root, 'samples')).filter(name => name.endsWith('.ogf.yaml'))) {
  const content = read(path.join('samples', file));
  const firstDocument = content.split(/^---\s*$/m).slice(1, 2).join('---');
  if (!new RegExp(`^format_version:\\s*${manifest.formatVersion}\\s*$`, 'm').test(firstDocument)) {
    errors.push(`${file} does not declare format_version ${manifest.formatVersion} in @meta@`);
  }
  if (!new RegExp(`^version:\\s*${manifest.metadataContractVersion}\\s*$`, 'm').test(firstDocument)) {
    errors.push(`${file} does not declare metadata contract version ${manifest.metadataContractVersion} in @meta@`);
  }
}
if (!engine.includes(`{ key: "format_version", value: "${manifest.formatVersion}"`)) {
  errors.push('GEDCOM import defaults do not use the manifest format version');
}
if (!engine.includes(`{ key: "version", value: "${manifest.metadataContractVersion}"`)) {
  errors.push('GEDCOM import defaults do not use the manifest metadata contract version');
}

for (const [file, id] of [
  ['defaults/meta.yaml', '@meta@'],
  ['defaults/dictionary.yaml', '@dictionary@']
]) {
  const content = read(file);
  if (!content.split(/^---\s*$/m).slice(1, 2).join('---').includes(`id: "${id}"`)) {
    errors.push(`${file} must define ${id}`);
  }
}
const defaultMeta = read('defaults/meta.yaml');
if (!new RegExp(`^format_version:\\s*${manifest.formatVersion}\\s*$`, 'm').test(defaultMeta)) {
  errors.push('defaults/meta.yaml format_version does not match VERSION.json');
}
if (!new RegExp(`^version:\\s*${manifest.metadataContractVersion}\\s*$`, 'm').test(defaultMeta)) {
  errors.push('defaults/meta.yaml metadata contract version does not match VERSION.json');
}

if (errors.length) {
  console.error('Version consistency check failed:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('Version consistency check passed.');
}

// Save / Export dialog must expose both native YAML and SVG options.
const saveUi = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const token of ['save-project-btn', 'save-modal', 'save-file-format', 'export-svg-advanced-btn', 'value="pdf"', 'value="actual"']) {
  if (!saveUi.includes(token)) throw new Error(`Missing Save / Export UI token: ${token}`);
}

if (!saveUi.includes('id="tree-save-export-btn"')) throw new Error('Missing tree toolbar Save / Export button');
const treeModule = read('js/ogf-tree.js');
if (!treeModule.includes('exportPrintPdf:')) throw new Error('Missing print PDF export bridge');
if (!treeModule.includes('imageNodes.forEach(imageNode => imageNode.remove())')) throw new Error('SVG export must omit photographs');

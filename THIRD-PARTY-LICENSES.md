# Third-party licenses

This repository loads the following third-party assets at runtime. They are
not relicensed under the repository's PolyForm Noncommercial License. Their
upstream copyright and license terms continue to apply.

| Component | Version used by this project | License | Upstream source / license |
|---|---:|---|---|
| D3.js | 5.16.0 | BSD 3-Clause | https://github.com/d3/d3 |
| dagre-d3 | 0.6.4 | MIT | https://github.com/dagrejs/dagre-d3 |
| Font Awesome Free | 6.7.2 | Code: MIT; fonts: SIL OFL 1.1; icons: CC BY 4.0 | https://fontawesome.com/license/free |
| Poppins (Google Fonts) | Requested weights 300, 400, 500, 600; exact served font build may change | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Poppins |

## Notes

- D3.js and dagre-d3 are loaded from cdnjs in `index.html`.
- Font Awesome Free CSS is loaded from cdnjs in `index.html`.
- Poppins is requested from Google Fonts. The exact font files delivered by
  the service may change; the font family is distributed under the SIL Open
  Font License.
- dagre-d3's browser distribution bundles its supporting graph-layout
  dependencies. The repository does not separately load Dagre, Graphlib, or
  Lodash from individual CDN URLs. Preserve the notices supplied with the
  upstream dagre-d3 distribution.
- This inventory is based on the external runtime references found in the
  supplied `index.html`. Re-check it whenever dependencies or CDN URLs change.

The licenses of these dependencies do not grant commercial-use permission
for the OGF application as a whole. They apply to their respective components.

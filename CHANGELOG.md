# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version numbers below 1.0.0 do not guarantee a stable public API.

## [0.1.6] - 2026-08-06

**First release candidate, and the first version published to npm.**

This is the version at which the port itself is considered finished. The
roadmap is complete through phase 5.7: the PDF object model, Type1 and embedded
TrueType fonts, declarative layout and pagination, SVG, raster images, tables,
charts, barcodes, links, forms, page labels and metadata/XMP are all ported from
dart_pdf 3.13.0. All eight retained upstream examples generate end to end under
Node.js and bare ClearScript V8.

It is a release candidate rather than a stable release because the port has not
yet been exercised by anyone outside the project. The API is expected to hold,
but is not frozen until 1.0.0.

### Added

- Remaining parity gaps with upstream closed across decoration, SVG gradients
  and text layout.

### Fixed

- Fonts using CFF outlines are now rejected with an explicit unsupported-format
  error instead of failing obscurely later.
- Upstream parity restored in several widgets, with bounded memory use when
  decoding large images.
- The oversized-image warning in `MemoryImage` states what it actually means.

### Packaging

- `publishConfig.access` set to `public`, required for a scoped package.
- `build` removes `dist/` before emitting, so superseded versioned artifacts no
  longer accumulate in the published tarball.
- `src/` removed from `files`. The unminified `dist/js_pdf.mjs` already ships
  the source in readable form alongside its declarations. The tarball went from
  2.3 MB to 659 kB, and from 320 files to 157.
- `prepublishOnly` runs the full `verify` gate, so a `dist/` that does not match
  `src/` cannot be published.
- Relative links in `AI_USAGE.md` and `NOTICE` now point at the repository by
  absolute URL, since the files they referenced are not part of the tarball.

### Documentation

- Warranty and support terms clarified.
- Rationale for the port reworded.

## Unpublished development versions

Versions 0.1.0 through 0.1.5 were tagged in the repository during the port and
were never published to npm. They are recorded here for provenance only.

### [0.1.5] - 2026-08-06

- Fixed stream compression and DEFLATE encoding.

### [0.1.4] - 2026-08-06

- Added `PdfString.fromDate` and `/CreationDate`; improved `/Producer` handling.
- Added the browser example with live preview.
- Added esm.sh configuration.

### [0.1.3] - 2026-08-06

- License headers and package metadata brought in line across the tree.

### [0.1.2] - 2026-08-06

- Phase 5.7 widgets: atomic pagination, lists, shapes, grid paper, inherited
  context, watermarks and footers, outlines and geometric annotations.

### [0.1.1] - 2026-08-06

- Phase 4.2: JPEG parsing reworked to support progressive frames.

### [0.1.0] - 2026-08-06

- First tagged version of the port, covering phases 1 through 5.6.
- Third-party font licenses and notices added for the bundled example
  resources.

[0.1.6]: https://github.com/romulocrj/js_pdf/releases/tag/v0.1.6
[0.1.5]: https://github.com/romulocrj/js_pdf/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/romulocrj/js_pdf/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/romulocrj/js_pdf/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/romulocrj/js_pdf/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/romulocrj/js_pdf/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/romulocrj/js_pdf/releases/tag/v0.1.0

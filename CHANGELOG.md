# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version numbers below 1.0.0 do not guarantee a stable public API.

## [Unreleased]

The 1.0 series. A comparison with upstream master `277b367` and with the open
upstream pull requests filed after the previous audit (chiefly
DavBfr/dart_pdf#1980) found about sixty defects that also affect this port,
plus several of the port's own. Upstream defects are listed in
[ORIGINAL-ISSUES.md](ORIGINAL-ISSUES.md); every fix has a regression test.

### Added

- `colorAlpha` option on `Document`, `createPdf` and `PdfDocument` (default
  `true`); see Changed.
- `Container({ color })`, upstream's option name; `background` remains an alias.
- `fallbackWidth` on both progress indicators and `fallbackHeight` on
  `CircularProgressIndicator`, used on unbounded axes.
- Directional layout (phase 6.9): `EdgeInsetsDirectional`, `AlignmentDirectional`
  (also as names such as `'topStart'`), `PositionedDirectional`,
  `resolveInsets` and `resolveAlignment`; right-to-left `Row`/`Flex`, `Wrap`,
  `Stack`, `GridView` and `Table` under the ambient direction; `textDirection`
  on `PageTheme`, `Page`, `MultiPage` and `Table`; directional page margins;
  `MultiPage.crossAxisAlignment`.
- PDF/A-2 and PDF/A-3, levels B and U (phase 6.11):
  `new Document({ pdfa: { part, conformance, colorProfile, outputCondition, attachments, extensionRdf } })`
  writes the `/GTS_PDFA1` output intent from a caller-supplied ICC profile, an
  XMP packet that agrees with `/Info`, a deterministic trailer `/ID` and, for
  PDF/A-3, embedded files with `/AF`. It throws on what PDF/A forbids and the
  port can detect cheaply: part 1, level A, a malformed profile, standard
  Type1 fonts, device colour the profile does not describe. The upstream
  parity classes `PdfaRdf`, `PdfaFacturxRdf`, `PdfaColorProfile`,
  `PdfaAttachedFile` and `PdfaAttachedFiles` are exported, with #1980's
  corrections. **Conformance has not been verified with veraPDF.** Documents
  without `pdfa` are byte-identical.
- `creationDate` option on `Document` for a fixed `/CreationDate`.

### Fixed

- **Text:** wrapped right-to-left paragraphs were emitted with their lines in
  reverse order, and justified or fallback-font runs inside them were mirrored
  (a port regression). RTL fragments inside LTR paragraphs are now shaped and
  reordered. Invisible format characters are no longer drawn; soft hyphens and
  U+200B are break opportunities; no-break spaces no longer break; CR/CRLF line
  endings, separators missing from a font, letter spacing at
  span boundaries, whitespace-only text and two Arabic isolated-form aliases are
  corrected. As upstream after #1980, a word longer than the line is cut after
  a hyphen (not before a digit) rather than mid-syllable, while ordinary
  wrapping still moves hyphenated words whole. A lam + haraka + alef sequence
  no longer drops its mark.
- **Strings and objects:** text strings use PDFDocEncoding-safe literals or
  UTF-16BE, so `€ — ’ “ ”` in titles, bookmarks and field values read back
  correctly. Names escape UTF-8 bytes. Non-finite and huge numbers are never
  written. `/Dests` keys are unique and byte-ordered rather than
  locale-ordered, outline `/Count` and page-label defaults follow ISO 32000-1,
  form widgets sharing a name become one field, and a table of contents in
  the same flow as its content shows the final page numbers.
- **Fonts:** cmap subtables are ranked and read correctly (formats 0 and 4,
  symbol and Mac subtables, glyph 0, malformed tables); subsets keep their
  hinting tables and spec-valid sfnt headers; ToUnicode handles supplementary
  characters in sections of at most 100; the standard fonts report WinAnsi
  coverage, so en dash, curly quotes and euro no longer fall back.
- **SVG:** cyclic `<use>` and gradient references, undecodable images,
  malformed transforms, colours, numbers and masks no longer abort the
  document. Hidden layers, percentage lengths, nested viewports, `<symbol>`
  and `<use>` sizing, `preserveAspectRatio`, tspan ordering, zero stroke
  widths, colour alpha, paint fallbacks, `hsl()` hues and transformed clips and
  masks are corrected.
- **Graphics and images:** arcs reach their end point, including rotated
  ellipses; `isLight`/`isDark` were swapped; nested opacity composes; Adobe
  CMYK JPEGs are inverted exactly when an Adobe marker is present;
  `RawImage` no longer copies its input.
- **Layout:** MultiPage tables are linear rather than quadratic in their row
  count; overflowing and tightly constrained tables keep words whole and
  proportional columns; `Transform.rotateBox` lays out against rotated
  constraints; a vertical chart axis reserves its labels' height; unbounded
  `Stack` and progress indicators no longer write `Infinity`; non-finite pie
  values are rejected; an oversized GridView cell is drawn; a split widget's
  last fragment no longer fills its page; `Header` no longer splits and
  duplicates its bookmark; negative axis label angles pick upstream's side.
  `Container({ color })` was silently ignored.

### Changed

- **Colour alpha is painted.** A `PdfColor` with alpha below 1 now paints
  translucent fills and strokes, multiplied by any enclosing `Opacity`, and
  nested `Opacity` widgets multiply. Opaque documents are byte-identical.
  Gradient stops paint their alpha through a luminosity soft mask. Pass
  `colorAlpha: false` for the previous behaviour.
- `isLight`/`isDark` now return the documented answer; callers that inverted
  them must stop.
- The default `textAlign` is `start`, as upstream; an explicit `left` in an
  RTL paragraph is now left-aligned.
- Generated destination names changed from `outline-N` to `__dest<n>`.
- Embedded TrueType subsets are a few kilobytes larger because they keep their
  hinting tables; ToUnicode streams use `Adobe-Identity-UCS` on every path.
- Cartesian charts with a vertical axis, overflowing tables and tables under a
  tight width change layout. One-colour gradients are flat fills.
- Progress indicators on an unbounded axis without a fallback size throw a
  `RangeError` instead of writing a broken PDF.
- The minified bundle is smaller: the Material palette, PDF417 codewords and
  Type1 widths are packed into strings: 434,364 bytes against 450,928 in 0.2.0
  (−3.67%); gzip grows 1.80%. See [BUNDLE-SIZE.md](docs/BUNDLE-SIZE.md).
- Under `textDirection: 'rtl'`, tables run right to left; pass
  `textDirection: 'ltr'` to keep a table's column order. `PositionedDirectional`
  defaults to the ambient direction instead of left-to-right.

## [0.2.0] - 2026-09-29

### Added

- DPI-aware image resizing, caching and quality-90 JPEG re-encoding.
- Page clipping and additional paper formats; configurable CJK line breaking
  and caller-supplied hyphenation.
- Synchronous output destinations and lazy JPEG serialization.
- Named color palettes, DeviceGray/DeviceCMYK output and HSV/HSL/RYB conversions.
- Optional simple TrueType/WinAnsi encoding, including the document-level
  `simpleTrueTypeFonts` setting, and full-program OpenType CFF1 embedding for
  name-keyed and CID-keyed fonts. Unicode TrueType subsetting stays the default.
- Text-note annotations, annotation border styles and reusable `PdfFormXObject`
  resources with nested forms and field appearances.
- `DefaultTextStyle.merge`, `PdfPageFormat`, `ChartValue`/`LineChartValue`,
  `PdfDict.merge` and `PdfArray.uniq`.
- Focused examples for the implemented phase-6 work, shared by the browser
  gallery and Node runner, with third-party font provenance and licenses.

### Fixed

- Rotated image DPI calculations, CMYK JPEG decoding and full-circle pie rounding.

### Changed

- Reduced layout allocations and added an ASCII single-word text fast path.
- Minified bundle size increased from 405,510 bytes in 0.1.6 to 450,928 bytes
  (+11.20%), with no runtime dependencies or embedded example fonts.

### Limitations

- Directional geometry, RTL Flex/table layout, baseline alignment and PDF/A
  integration remain unimplemented.
- CFF1 and simple TrueType embed the entire font program. CFF ink bounds are
  approximate; CFF subsetting, CFF2, variable-font instancing and raw Type1/PFB
  embedding are not supported.

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

[0.2.0]: https://github.com/romulocrj/js_pdf/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/romulocrj/js_pdf/releases/tag/v0.1.6
[0.1.5]: https://github.com/romulocrj/js_pdf/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/romulocrj/js_pdf/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/romulocrj/js_pdf/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/romulocrj/js_pdf/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/romulocrj/js_pdf/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/romulocrj/js_pdf/releases/tag/v0.1.0

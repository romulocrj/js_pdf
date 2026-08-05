# Roadmap

Ordered plan for the port. Current coverage is in
[PORTING-STATUS.md](PORTING-STATUS.md); conventions are in
[ARCHITECTURE.md](ARCHITECTURE.md).

**Last updated:** 2026-08-05

## Current position

The MVP is restructured into a module tree that mirrors `dart_pdf`, written in
TypeScript, with the runtime contract and attribution enforced by
`npm run check`. Output is a valid single-font PDF with selectable standard
Type1 fonts and real AFM metrics, written through a real indirect-object model.
Beyond that — TTF, SVG, tables, images — nothing is real yet.

**Phase 0.0 — TypeScript migration — landed 2026-08-05.** Every module is `.ts`;
`tsconfig.json` compiles against the ES2020 lib with no DOM and no host types,
which turns the runtime contract into a compile error rather than a convention.
`Widget<TData>` makes the `layout` → `paint` hand-off type-safe. Output is
byte-identical to the JavaScript it replaced. Done before the font work, not
during it, so the branded integer types that phase 1 needs (glyph id vs.
codepoint vs. CID) exist from the start.

**Phase 0.1 — Type1 font metrics — landed 2026-08-05.** Real AFM advance widths
for all 14 standard fonts behind a `PdfFont` interface, which is the seam phase 1
plugs embedded TTF into.

**Phase 0.2 — object model — landed 2026-08-05.** `src/pdf/format/` holds the
PDF value types and `src/pdf/obj/` the indirect objects; `document.ts` is a
registry that assigns serial numbers and writes the file. Output is
byte-identical to the string builder it replaced.

## Next step

> **Phase 0.3 — resource dictionary.** Replace the hardcoded single-font
> `/Resources` in `src/pdf/obj/page.ts` with per-page registration of `/Font`,
> `/XObject` and `/ExtGState`, naming entries `/F1`, `/F2`, … automatically.

This is the last thing standing between the port and more than one font per
document, so it gates all of phase 1. `PdfPage` already owns its `/Resources`
dictionary as of 0.2 — the work is a `PdfGraphicStream` equivalent that allocates
names, plus threading the chosen font from `PdfCanvas.text` through to the page
instead of the fixed `/F1`.

---

## Example gates

`examples/` holds JavaScript ports of the upstream `dart_pdf` examples. They are
**capability probes, not reduced approximations**: each one still references
every widget the Dart original used, and calls `requireFeatures()` to report the
public APIs `js_pdf` does not have yet. That turns the example set into an
executable definition of "done" for each phase.

```sh
npm run examples     # build, then try to generate all of them
```

Successful runs write `examples/<name>.pdf`; failures land in
`examples/generation-results.json` with the list of missing APIs, and one
failure does not stop the rest. **Expect a non-zero exit until phase 5** — that
is the gate working, not a broken build.

Every phase below carries an **Example gate** line naming the examples it
advances, and the phases marked ⇒ are the ones where an example first generates
end to end. When a phase lands, run `npm run examples` and check the PDFs it
was supposed to unlock.

| Example | Upstream source | Unlocks at | What it proves |
|---|---|---|---|
| `hello-world` | `pdf/example/main.dart` | ✅ now | document, page, text, serializer |
| `calendar` | `demo/lib/examples/calendar.dart` | **3.6** | TTF + theming + SVG + grid layout |
| `certificate` | `demo/lib/examples/certificate.dart` | **3.9** | absolute positioning, transforms, rich text |
| `report` | `demo/lib/examples/report.dart` | **5.1** | charts and tables — the only example needing no SVG and no images |
| `invoice` | `demo/lib/examples/invoice.dart` | **5.2** | tables, decoration, barcodes — the archetypal business document |
| `document` | `demo/lib/examples/document.dart` | **5.3** | long-form content: headers, paragraphs, TOC, links |
| `server` | `demo/lib/examples/server.dart` | **5.3** | charts + SVG + links together |
| `resume` | `demo/lib/examples/resume.dart` | **5.5** | everything: images, icons, clipping, partitions, progress |

`resume` is deliberately last — it is the widest probe in the set, so it doubles
as the acceptance test for the port as a whole.

---

## Phase 0 — foundations

Prerequisites that phases 1–3 all depend on. Do these before the big
subsystems, not alongside them.

**Example gate:** none — phase 0 unlocks no API requested by the upstream
examples. `hello-world` must keep generating through 0.3; its metrics-dependent
positions changed in 0.1 to match the AFM tables, and 0.2 left every byte alone.

### 0.0 TypeScript migration ✅ *(landed 2026-08-05)*

- `src/` is TypeScript under `strict` + `noUncheckedIndexedAccess`.
- `lib: ["ES2020"]`, `types: []` — the runtime contract is now a compiler
  setting, not just a grep in `tools/check-source.mjs`.
- `Widget<TData>` types the measure→paint hand-off; heterogeneous children use
  `AnyWidget = Widget<unknown>`, with no `any` anywhere in `src/`.
- Declarations ship in `dist/types/`, so consumers get autocomplete on the
  widget API for the first time.
- Node runs `src/*.ts` directly via type stripping, so tests need no build step.

### 0.1 Type1 font metrics ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/font/type1_fonts.dart`, `font/font_metrics.dart`
- **Into:** `src/pdf/font/type1_fonts.ts`, rewrite `src/pdf/font/font_metrics.ts`
- Real AFM widths for Helvetica (regular/bold/oblique/bold-oblique), Times,
  Courier, Symbol, ZapfDingbats. `PdfFontMetrics` with ascent, descent, and
  advance width.
- Introduce a `PdfFont` interface — `stringMetrics(text, size)`,
  `encodeText(text)`, `resourceDict()` — with `PdfType1Font` as the first
  implementation. Everything in phase 1 plugs into this seam.
- **Test:** width of a known string against the AFM table; a document using each
  standard font.

Landed with the complete 256-entry tables for the ten distinct proportional
faces (the four Courier faces use their fixed 0.600 em advance),
`PdfFontMetrics`, and the `PdfFont` seam. `DocumentOptions.font` selects one of
the 14 standard fonts through `PdfType1Font`; per-page multi-font registration
remains phase 0.3. The serializer structure is unchanged, while alignment and
wrapping now use the real advances.

### 0.2 Object model ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/obj/object.dart`, `object_dict.dart`,
  `object_stream.dart`, `catalog.dart`, `page.dart`, `page_list.dart`,
  `info.dart`, `format/base.dart`, `object_base.dart`, `dict.dart`, `array.dart`,
  `name.dart`, `indirect.dart`, `dict_stream.dart`, `bool.dart`,
  `null_value.dart`, `num.dart`, `string.dart`, `stream.dart`, `xref.dart`
- **Into:** `src/pdf/format/*.ts`, `src/pdf/obj/*.ts`
- Replace the flat object table in `src/pdf/document.ts` with real indirect
  objects that serialize themselves. Required before a document can hold a
  variable number of fonts, images, or XObjects.
- **Test:** byte-identical output to the current serializer for the existing
  fixtures — this phase must change nothing observable.

Landed as a 13-module `format/` layer (`PdfDataType` and the value types, plus
`PdfObjectBase`, `PdfStream` and `PdfXrefTable`) and a 6-module `obj/` layer
(`PdfObject`, `PdfObjectStream`, `PdfCatalog`, `PdfPageList`, `PdfPage`,
`PdfInfo`). Verified byte-identical across 20 fixtures — the 14 standard fonts,
both page formats, accented text, empty and full metadata, multi-page overflow
and vector drawing — and `hello-world` still generates at 740 bytes.

Divergences worth knowing, each noted in the file that makes it:

- `output(stream)` takes no settings object and no indent. Upstream's exist for
  compression, encryption and a verbose pretty-printer; the port has none of the
  three, so a value never consults its owning object.
- Dictionaries and arrays keep the port's spacing (`<< /Type /Page >>`,
  `[/A /B]`) rather than upstream's compact form. That is what made byte
  identity achievable, and it is what the tests assert.
- Object bodies are laid out in serial order, not creation order, so the xref
  table is a single contiguous block and the catalog can be object 1 while still
  referencing a page list created after it.
- `PdfName` also escapes `)`, which upstream's escape list omits.
- `PdfFont.resourceDict()` returns a `PdfDict` instead of a string, which is the
  seam TTF embedding needs in 1.3 — a descriptor and a `FontFile2` stream are
  references, and a reference cannot be spliced into text.

### 0.3 Resource dictionary ← **next**

- **Ports:** `pdf/lib/src/pdf/obj/graphic_stream.dart`, `page.dart`
- **Into:** `src/pdf/obj/graphic_stream.ts`
- Per-page resource registration: `/Font`, `/XObject`, `/ExtGState`, with
  automatic `/F1`, `/F2`, … naming. Ends the hardcoded single-font `/Resources`
  dict.
- **Test:** a page using two fonts emits two `/Font` entries and the right `Tf`
  operators.

---

## Phase 1 — TTF fonts

**The most technically important subsystem.** It removes the Latin-1 ceiling:
without it, any text outside WinAnsi is silently replaced with `?`.

Depends on phases 0.1–0.3.

**Example gate:** 1.4 is the single biggest unblock in the roadmap — *every*
failing example needs `Font`, `TextStyle` and `ThemeData`. None generates yet
after this phase, but all seven move.

### 1.1 TTF parser

- **Ports:** `pdf/lib/src/pdf/font/ttf_parser.dart` (693 lines)
- **Into:** `src/pdf/font/ttf_parser.ts`
- Table directory; `head`, `hhea`, `hmtx`, `maxp`, `name`, `post`, `OS/2`;
  `cmap` formats 4, 6 and 12; `loca`/`glyf` bounds; optional `CFF ` detection.
- Read from a `Uint8Array` with `DataView` — no host buffer API.
- **Test:** parse the fixtures already in `examples/assets/` (`OpenSans-Regular`,
  `Roboto-Regular`); assert unitsPerEm, a known advance width, and a known
  codepoint→glyph mapping.

### 1.2 TTF subsetting writer

- **Ports:** `pdf/lib/src/pdf/font/ttf_writer.dart` (399 lines)
- **Into:** `src/pdf/font/ttf_writer.ts`
- Build a subset containing only the used glyphs plus their composite
  dependencies; rebuild `loca`, `glyf`, `hmtx`, `cmap`; recompute checksums.
- **Test:** the subset re-parses with the phase-1.1 parser and retains the
  requested glyphs.

### 1.3 Embedding

- **Ports:** `pdf/lib/src/pdf/obj/ttffont.dart`, `unicode_cmap.dart`,
  `font_descriptor.dart`
- **Into:** `src/pdf/obj/ttf_font.ts`, `src/pdf/obj/unicode_cmap.ts`
- Type0/CIDFontType2 composite font, `/Identity-H` encoding, `FontDescriptor`
  with the real bbox and flags, `FontFile2` stream, and a `/ToUnicode` CMap so
  the PDF stays searchable and copyable.
- `pdfLiteral` gains a hex-string branch: with a TTF font, text is emitted as
  `<glyph indices>` rather than WinAnsi bytes.
- **Test:** a document with accented and CJK text; assert the `/ToUnicode`
  stream round-trips back to the source string.

### 1.4 Font selection and theming

- **Ports:** `pdf/lib/src/widgets/font.dart`, `theme.dart`, `text_style.dart`,
  `page_theme.dart`
- **Into:** `src/widgets/font.ts`, `src/widgets/theme.ts`,
  `src/widgets/text_style.ts`, `src/widgets/page_theme.ts`
- `Font`, `TextStyle`, `Theme`, `ThemeData`, `DefaultTextStyle`, `PageTheme`.
  Requires adding inherited values to the render context.
- **Test:** nested styles resolve to the expected font per text run.
- **Example gate:** unblocks `Font`/`TextStyle`/`ThemeData`/`PageTheme` for
  `calendar`, `certificate`, `document`, `invoice`, `report`, `resume`,
  `server` — all seven.

**Done when:** a document renders Portuguese, Japanese and Arabic *characters*
from an embedded TTF, with correct advance widths and working text selection.
(Arabic *shaping* is separate — `font/arabic.dart` and `bidi_utils.dart`, later.)

---

## Phase 2 — SVG

Depends on phase 2.1 landing first; the rest can proceed in parallel with
phase 1 once it does.

**Example gate:** `SvgImage` (2.7) is needed by six of the seven remaining
examples. `report` is the exception, which makes it the useful probe while this
phase is in flight.

### 2.1 Graphics path operators

- **Ports:** `pdf/lib/src/pdf/graphics.dart` (path and transform sections)
- **Into:** `src/pdf/graphics.ts`
- `moveTo`/`lineTo`/`curveTo`/`close`, fill rules (`f`/`f*`/`B`/`B*`), the CTM
  (`cm`), line join/cap/dash, and clipping (`W`/`W*`/`n`). Prerequisite for
  every remaining item in this phase.
- **Test:** assert on the emitted operator sequence for a known path.

### 2.2 Path data parser

- **Ports:** `pdf/lib/src/svg/path.dart` (320 lines)
- **Into:** `src/svg/path.ts`
- Full `d` grammar: `M m L l H h V v C c S s Q q T t A a Z z`, absolute and
  relative, implicit repeated commands, compact number syntax. Elliptical arcs
  converted to cubic Béziers.
- **Test:** a table of path strings → expected operator sequences, including the
  arc-conversion edge cases (zero radii, large-arc/sweep flag combinations).

### 2.3 XML reader

- **Into:** `src/svg/xml.ts`
- A minimal, dependency-free XML parser: elements, attributes, text, CDATA,
  comments, entities, namespaces. No `DOMParser` — it does not exist in
  ClearScript.
- **Test:** malformed input fails with a position; entity and namespace handling.

### 2.4 Transforms and viewBox

- **Ports:** `pdf/lib/src/svg/transform.dart`
- **Into:** `src/svg/transform.ts`
- `matrix translate scale rotate skewX skewY`, composed left-to-right, plus
  `viewBox` + `preserveAspectRatio` → the outer CTM.
- **Test:** composed transform matrices; each `preserveAspectRatio` alignment.

### 2.5 Painter, shapes, groups

- **Ports:** `pdf/lib/src/svg/painter.dart`, `operation.dart`, `shape` handling,
  `group.dart`, `use.dart`, `symbol.dart`, `brush.dart`, `color.dart`,
  `colors.dart`
- **Into:** `src/svg/painter.ts`, `src/svg/brush.ts`, `src/svg/color.ts`
- `rect circle ellipse line polyline polygon path`; `<g>` with inherited
  presentation attributes; `<use>`/`<symbol>` resolution; fill/stroke
  resolution including `currentColor`, `none`, opacity and stroke properties.
- **Test:** per-element operator assertions; attribute inheritance through
  nested groups.

### 2.6 Clipping and masks

- **Ports:** `pdf/lib/src/svg/clip_path.dart`, `mask_path.dart`
- **Into:** `src/svg/clip_path.ts`
- `clipPath` via `W n`; `clipPathUnits`; nested clips.
- **Test:** clip operators appear in the right `q`/`Q` scope.

### 2.7 Parser and widget

- **Ports:** `pdf/lib/src/svg/parser.dart`, `widgets/svg.dart`
- **Into:** `src/svg/parser.ts`, `src/widgets/svg.ts`
- An `SvgImage` widget taking an SVG string, sizing from `viewBox`/`width`/
  `height`, painting through the phase-2.1 canvas.
- **Test:** end-to-end fixtures rendering to expected operator streams.
- **Example gate:** the assets in `examples/assets/` are the real corpus —
  `logo.svg`, `invoice.svg`, `calendar.svg`, `document.svg`, `resume.svg`,
  `medail.svg`, the four `swirls*.svg`, `garland.svg`, and the inline SVG in
  `server-assets.json`. Unblocks `SvgImage` for `calendar`, `certificate`,
  `document`, `invoice`, `resume`, `server`.

### 2.8 Gradients *(optional)*

- **Ports:** `pdf/lib/src/svg/gradient.dart`, `pdf/obj/shading.dart`,
  `pattern.dart`, `function.dart`
- Linear and radial gradients as PDF shading patterns. Defer until 2.1–2.7 are
  solid.

**Done when:** a real-world SVG logo and a chart exported from a drawing tool
render correctly, including transforms, viewBox, groups and clipping.

---

## Phase 3 — layout completeness

Once text is real, the widget gaps become the limiting factor. This phase
produces the first two fully generated examples.

### 3.1 Table

- **Ports:** `widgets/table.dart`, `table_helper.dart`
- Column widths (fixed / flex / intrinsic), cell alignment, borders, repeating
  headers.
- **Example gate:** `TableHelper` for `document`, `invoice`, `report`, `server`.

### 3.2 Spanning widgets

- **Ports:** `widgets/multi_page.dart`'s `SpanningWidget` protocol
- A long table or paragraph splits across pages instead of throwing. Requires
  the layout protocol to grow a save/restore context.
- **Example gate:** no new API, but `document`, `invoice` and `report` all
  overflow a page — without this they will throw `RangeError` even once their
  widgets exist.

### 3.3 Basic widgets

- **Ports:** `widgets/basic.dart`, `widgets/geometry.dart`, `widgets/widget.dart`
- `Align`, `Center`, `Padding`, `SizedBox`, `AspectRatio`, `Transform`,
  `Opacity`, `FittedBox`, `Divider`, `FullPage`; `EdgeInsets` as a real exported
  type rather than the internal `normalizeInsets`; `StatelessWidget` for
  composition.
- **Example gate:** the second-largest unblock after 1.4 — all seven examples.

### 3.4 Full flex

- **Ports:** `widgets/flex.dart`
- `mainAxisAlignment`, `crossAxisAlignment`, `Expanded`, `Flexible`, `FlexFit`,
  `mainAxisSize`.
- **Example gate:** `Expanded`/`Flexible` for `calendar`, `certificate`,
  `invoice`, `report`, `server`.

### 3.5 Decoration

- **Ports:** `widgets/decoration.dart`, `box_border.dart`, `border_radius.dart`
- `BoxDecoration`, `Border`, `BorderSide`, `BorderRadius`: per-side borders,
  radii, gradients, shadows.
- **Example gate:** `calendar`, `certificate`, `document`, `invoice`, `resume`,
  `server`.

### 3.6 Stack, Wrap, Grid ⇒ `calendar`

- **Ports:** `widgets/stack.dart`, `wrap.dart`, `grid_view.dart`,
  `partitions.dart`
- `Stack`, `Positioned`, `Wrap`, `GridView`, `Partitions`.
- **Example gate:** ⇒ **`calendar` generates end to end here.** Also advances
  `certificate`, `invoice`, `resume`.

### 3.7 Rich text

- **Ports:** `widgets/text.dart`
- `RichText`, `TextSpan`, per-span styles, justification, decorations.
- **Example gate:** `certificate`, `document`, `invoice`, `server`.

### 3.8 Content widgets

- **Ports:** `widgets/content.dart`
- `Header`, `Paragraph`, `Bullet`, `TableOfContent`. `TableOfContent` also needs
  named destinations from `obj/names.dart` and `obj/outline.dart` — pull those
  in here rather than deferring to phase 5.
- **Example gate:** `document` (all four).

### 3.9 Placeholders ⇒ `certificate`

- **Ports:** `widgets/placeholders.dart`
- `PdfLogo`, `Lorem`, `LoremText`. Small, but four examples use them as filler.
- **Example gate:** ⇒ **`certificate` generates end to end here.** Also advances
  `document`, `invoice`, `resume`.

### 3.10 Clipping widgets

- **Ports:** `widgets/clip.dart`
- `ClipRect`, `ClipOval`, `ClipRRect`, on top of the phase-2.1 clip operators.
- **Example gate:** `ClipOval` for `resume`.

---

## Phase 4 — images

**Example gate:** only `resume` needs images (`profile.jpg`), so this phase can
slot in wherever convenient relative to phase 5.

- **4.1** PNG decoder (zlib inflate included — no host decompression API is
  available). `pdf/lib/src/pdf/obj/image.dart`, `smask.dart`.
- **4.2** Baseline JPEG: pass through as `/DCTDecode`, parse SOF for dimensions.
  This is what `examples/assets/profile.jpg` exercises.
- **4.3** `Image` widget and provider — `widgets/image.dart`,
  `image_provider.dart`. `Image`, `MemoryImage`. Bytes are supplied by the
  caller; the port never fetches.

---

## Phase 5 — document features

The last four examples all land here, one per sub-phase.

### 5.1 Charts ⇒ `report`

- **Ports:** `widgets/chart/*.dart` (1,989 lines)
- `Chart`, `CartesianGrid`, `FixedAxis`, `BarDataSet`, `LineDataSet`,
  `PieDataSet`, `PieGrid`, `ChartLegend`, `PointChartValue`.
- **Example gate:** ⇒ **`report` generates end to end here** (nine APIs, its
  last dependency). Also advances `server`.

### 5.2 Barcodes ⇒ `invoice`

- **Ports:** `widgets/barcode.dart`
- `Barcode`, `BarcodeWidget`. Upstream delegates to the separate `barcode`
  Dart package; that generator has to be ported too, or narrowed to the symbol
  types the examples use.
- **Example gate:** ⇒ **`invoice` generates end to end here.** Also advances
  `resume`.

### 5.3 Annotations and links ⇒ `document`, `server`

- **Ports:** `obj/annotation.dart`, `widgets/annotations.dart`
- `UrlLink`, `AnnotationUrl`, plus internal destinations.
- **Example gate:** ⇒ **`document` and `server` generate end to end here.**
  Also advances `resume`.

### 5.4 Icons

- **Ports:** `widgets/icon.dart`
- `Icon`, `IconData`, backed by the `MaterialIcons.ttf` already in
  `examples/assets/`. Depends on phase 1.
- **Example gate:** `resume`.

### 5.5 Progress ⇒ `resume`

- **Ports:** `widgets/progress.dart`
- `CircularProgressIndicator`, `LinearProgressIndicator`.
- **Example gate:** ⇒ **`resume` generates end to end here — the whole example
  set now passes.**

### 5.6 Remaining

Forms (`widgets/forms.dart`), page labels, metadata and XMP. No example depends
on these.

---

## Out of scope

- **Reading existing PDFs** — `pdf/document_parser.dart`.
- **Rasterizing** — `pdf/raster.dart` needs a PDF renderer.
- **Platform shims** — `pdf/io/*.dart` exist to abstract Dart VM vs. web; this
  port has one runtime target by construction.
- **Encryption and digital signatures** — need real crypto primitives, which the
  runtime contract rules out.
- **EXIF** — `pdf/exif.dart`, only relevant to image orientation.

---

## Working agreement

Every change that moves a checkbox must, in the same commit:

1. Update [PORTING-STATUS.md](PORTING-STATUS.md) — the affected rows and the
   header counts.
2. Update this file — mark the phase, and move the **Next step** callout.
3. Run `npm run examples` and commit the refreshed
   `examples/generation-results.json`. If the phase was marked ⇒, the named
   example must now appear as `generated`; say so in the commit.
4. Pass `npm run verify`.

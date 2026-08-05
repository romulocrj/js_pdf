# Roadmap

Ordered plan for the port. Current coverage is in
[PORTING-STATUS.md](PORTING-STATUS.md); conventions are in
[ARCHITECTURE.md](ARCHITECTURE.md).

**Last updated:** 2026-08-05

## Current position

The MVP is restructured into a module tree that mirrors `dart_pdf`, written in
TypeScript, with the runtime contract and attribution enforced by
`npm run check`. Output is a valid single-font PDF. Nothing beyond that is real
yet.

**Phase 0.0 — TypeScript migration — landed 2026-08-05.** All 19 modules are
`.ts`; `tsconfig.json` compiles against the ES2020 lib with no DOM and no node
types, which turns the runtime contract into a compile error rather than a
convention. `Widget<TData>` makes the `layout` → `paint` hand-off type-safe.
Output is byte-identical to the JavaScript it replaced. Done before the font
work, not during it, so the branded integer types that phase 1 needs
(glyph id vs. codepoint vs. CID) exist from the start.

## Next step

> **Phase 0.1 — real Type1 font metrics.** Replace the character-class width
> approximation in `src/pdf/font/font_metrics.ts` with the AFM advance-width
> table for Helvetica, ported from `pdf/lib/src/pdf/font/type1_fonts.dart`.

Small, self-contained, and it removes the single largest source of divergence
from dart_pdf in everyday documents. It is also the natural place to introduce
the `PdfFont` seam that phase 1 needs.

---

## Phase 0 — foundations

Prerequisites that phases 1–3 all depend on. Do these before the big
subsystems, not alongside them.

### 0.0 TypeScript migration ✅ *(landed 2026-08-05)*

- `src/` is TypeScript under `strict` + `noUncheckedIndexedAccess`.
- `lib: ["ES2020"]`, `types: []` — the runtime contract is now a compiler
  setting, not just a grep in `tools/check-source.mjs`.
- `Widget<TData>` types the measure→paint hand-off; heterogeneous children use
  `AnyWidget = Widget<unknown>`, with no `any` anywhere in `src/`.
- Declarations ship in `dist/types/`, so consumers get autocomplete on the
  widget API for the first time.
- Node runs `src/*.ts` directly via type stripping, so tests need no build step.

### 0.1 Type1 font metrics *(next)*

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

### 0.2 Object model

- **Ports:** `pdf/lib/src/pdf/obj/object.dart`, `object_dict.dart`,
  `format/dict.dart`, `array.dart`, `name.dart`, `indirect.dart`,
  `dict_stream.dart`
- **Into:** `src/pdf/format/*.ts`, `src/pdf/obj/object.ts`
- Replace the flat object table in `src/pdf/document.ts` with real indirect
  objects that serialize themselves. Required before a document can hold a
  variable number of fonts, images, or XObjects.
- **Test:** byte-identical output to the current serializer for the existing
  fixtures — this phase must change nothing observable.

### 0.3 Resource dictionary

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

### 1.1 TTF parser

- **Ports:** `pdf/lib/src/pdf/font/ttf_parser.dart` (693 lines)
- **Into:** `src/pdf/font/ttf_parser.ts`
- Table directory; `head`, `hhea`, `hmtx`, `maxp`, `name`, `post`, `OS/2`;
  `cmap` formats 4, 6 and 12; `loca`/`glyf` bounds; optional `CFF ` detection.
- Read from a `Uint8Array` with `DataView` — no host buffer API.
- **Test:** parse a small open-licensed TTF fixture; assert unitsPerEm, a known
  advance width, and a known codepoint→glyph mapping.

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

### 1.4 Font selection

- **Ports:** `pdf/lib/src/widgets/font.dart`, `theme.dart`, `text_style.dart`
- **Into:** `src/widgets/font.ts`, `src/widgets/theme.ts`
- A `TextStyle` carrying a font, and a `Theme` that supplies a default. Requires
  adding inherited values to the render context.
- **Test:** nested styles resolve to the expected font per text run.

**Done when:** a document renders Portuguese, Japanese and Arabic *characters*
from an embedded TTF, with correct advance widths and working text selection.
(Arabic *shaping* is separate — `font/arabic.dart` and `bidi_utils.dart`, later.)

---

## Phase 2 — SVG

Depends on phase 2.1 landing first; the rest can proceed in parallel with
phase 1 once it does.

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

### 2.8 Gradients *(optional)*

- **Ports:** `pdf/lib/src/svg/gradient.dart`, `pdf/obj/shading.dart`,
  `pattern.dart`, `function.dart`
- Linear and radial gradients as PDF shading patterns. Defer until 2.1–2.7 are
  solid.

**Done when:** a real-world SVG logo and a chart exported from a drawing tool
render correctly, including transforms, viewBox, groups and clipping.

---

## Phase 3 — layout completeness

Once text is real, the widget gaps become the limiting factor.

- **3.1 Table** — `widgets/table.dart`, `table_helper.dart`. Column widths
  (fixed / flex / intrinsic), cell alignment, borders, repeating headers.
- **3.2 Spanning widgets** — `widgets/multi_page.dart`'s `SpanningWidget`
  protocol, so a long table or paragraph splits across pages instead of
  throwing. Requires the layout protocol to grow a save/restore context.
- **3.3 Basic widgets** — `widgets/basic.dart`: `Align`, `Center`, `Padding`,
  `SizedBox`, `AspectRatio`, `Transform`, `Opacity`, `FittedBox`.
- **3.4 Full flex** — `widgets/flex.dart`: `mainAxisAlignment`,
  `crossAxisAlignment`, `Expanded`, `Flexible`, `FlexFit`, `mainAxisSize`.
- **3.5 Decoration** — `widgets/decoration.dart`, `box_border.dart`,
  `border_radius.dart`: per-side borders, radii, gradients, shadows.
- **3.6 Stack and Wrap** — `widgets/stack.dart`, `wrap.dart`.
- **3.7 Rich text** — `widgets/text.dart`: `TextSpan`, per-span styles,
  justification, decorations.

## Phase 4 — images

- **4.1** PNG decoder (zlib inflate included — no host decompression API is
  available). `pdf/lib/src/pdf/obj/image.dart`, `smask.dart`.
- **4.2** Baseline JPEG: pass through as `/DCTDecode`, parse SOF for dimensions.
- **4.3** `Image` widget and provider — `widgets/image.dart`,
  `image_provider.dart`. Bytes are supplied by the caller; the port never
  fetches.

## Phase 5 — document features

Charts (`widgets/chart/*`), barcodes (`widgets/barcode.dart`), annotations and
links (`obj/annotation.dart`, `widgets/annotations.dart`), forms
(`widgets/forms.dart`), outlines and page labels, metadata and XMP.

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
3. Pass `npm run verify`.

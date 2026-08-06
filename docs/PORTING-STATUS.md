# Porting status

Coverage of `DavBfr/dart_pdf` (`pdf/lib/`) by this port.

**Last updated:** 2026-08-06
**Upstream reference:** `pdf/lib/` — 137 Dart files, ~31,800 lines
**Ported:** 133 `.ts` files, ~29,100 lines (TypeScript)

Legend: **done** · **partial** — usable but materially narrower than upstream ·
**stub** — placeholder with a known-wrong implementation · **—** — not started

> Update this file in the same change that moves any row. See
> [ARCHITECTURE.md §7](ARCHITECTURE.md#7-adding-a-subsystem).

---

## Example coverage

The ported upstream examples in `examples/` are the end-to-end measure of this
table. Run `npm run examples`; current state, from
`examples/generation-results.json`:

| Example | Status | Missing APIs | Unlocks at |
|---|---|---:|---|
| `hello-world` | ✅ generated (743 bytes) | 0 | — |
| `calendar` | ✅ generated (22,027 bytes) | 0 | 3.6 |
| `certificate` | ✅ generated (126,677 bytes) | 0 | 3.9 |
| `report` | ✅ generated (30,332 bytes) | 0 | 5.1 |
| `invoice` | ✅ generated (102,709 bytes) | 0 | 5.2 |
| `document` | ✅ generated (101,311 bytes) | 0 | 5.3 |
| `server` | ✅ generated (81,692 bytes) | 0 | 5.3 |
| `resume` | ✅ generated (73,119 bytes) | 0 | 5.5 |

**8 of 8**, with the missing-API total down from 124 to 0 — phase 1.4 cleared
`Font`, `TextStyle`, `ThemeData`, `PageTheme`, `Theme` and `DefaultTextStyle`
from every one of the seven, phase 2.7 cleared `SvgImage` from six, and phase
3.1 cleared `TableHelper` from four. Phase 3.3 then cleared the composition
primitives `Transform`, `Opacity`, `FittedBox`, `AspectRatio`, `FullPage`,
`Builder` and `LayoutBuilder` wherever they occurred. Phase 3.4 cleared
`Expanded`/`Flexible` from five examples, phase 3.5 cleared decoration, borders
and radii from six, phase 3.6 cleared stack/grid/partitions from four and made
the calendar generate, phase 3.7 cleared rich text from four, and phase 3.8
cleared all four content widgets from document. Phase 3.9 then supplied the
placeholders used by four examples and made certificate generate; phase 3.10
then removed `ClipOval` from resume; phase 4.3 then removed `Image` and
`MemoryImage` from resume. Phase 5.2 supplied `Barcode` and `BarcodeWidget`,
making invoice generate and advancing resume. Phase 5.3 supplied URL and named
destination links, making document and server generate and leaving resume with
only icons and progress. Phase 5.4 then supplied `Icon`, `IconData` and the
inherited icon theme, leaving only progress. Phase 5.5 supplied both progress
indicators and made resume generate; while exercising the complete example it
also fixed `MultiPage.pageTheme`, so the theme and background/foreground layers
now reach every physical page. See
[ROADMAP.md § Example gates](ROADMAP.md#example-gates) for which phase clears
each one.

---

## Entry points

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `pdf.dart` + `widgets.dart` | 114 | `src/index.ts` | partial — exports the implemented subset |
| `src/base/exceptions.dart` | 15 | `src/base/assert.ts` | partial — runtime guards, no exception types |

## `src/pdf/format/` — object syntax

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `format/num.dart` | 96 | `src/pdf/format/num.ts` | done — `PdfNum`, `PdfNumList`; 4-decimal precision vs. upstream's 5 |
| `format/string.dart` | 204 | `src/pdf/format/string.ts` | partial — `PdfString`, literal + WinAnsi, hex strings for CIDs; no UTF-16BE, no PDF-date |
| `format/stream.dart` | 83 | `src/pdf/format/stream.ts` | done — growable `PdfStream` byte buffer |
| `format/base.dart` | 50 | `src/pdf/format/base.ts` | done — `PdfDataType`; `output(stream)` only, no settings or indent |
| `format/object_base.dart` | 118 | `src/pdf/format/object_base.ts` | partial — `PdfObjectBase`, `ref()`, `prepare()`; no `PdfSettings` |
| `format/dict.dart` | 135 | `src/pdf/format/dict.ts` | partial — `PdfDict`, insertion-ordered; no `merge`, no type parameter |
| `format/array.dart` | 126 | `src/pdf/format/array.ts` | partial — `PdfArray`, `fromNum`, `fromObjects`; no `uniq`, no `fromColor` |
| `format/dict_stream.dart` | 98 | `src/pdf/format/dict_stream.ts` | partial — `PdfDictStream`, derived `/Length`; no `/Filter`, no encryption |
| `format/name.dart` | 63 | `src/pdf/format/name.ts` | done — also escapes `)`, which upstream misses |
| `format/indirect.dart` | 44 | `src/pdf/format/indirect.ts` | done — `PdfIndirect` |
| `format/bool.dart`, `null_value.dart` | 78 | `src/pdf/format/bool.ts`, `null_value.ts` | done |
| `format/xref.dart` | 406 | `src/pdf/format/xref.ts` | partial — classic xref table; no xref streams, no incremental update |
| `format/ascii85.dart` | 91 | — | — needs `/Filter` support first |
| `format/diagnostic.dart` | 66 | — | n/a — drives upstream's verbose mode, which the port does not reproduce |

## `src/pdf/` — document and graphics

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `page_format.dart` | 171 | `src/pdf/page_format.ts` | partial — A4 and Letter, plus the physical-unit constants SVG lengths need |
| `color.dart` | 725 | `src/pdf/color.ts` | partial — RGB / DeviceRGB only |
| `colors.dart` | 406 | — | — named color constants |
| `graphics.dart` | 1415 | `src/pdf/graphics.ts`, `src/svg/path.ts` | partial — full path API (`m`/`l`/`c`/`h`/`re`, ellipses, rounded rects, elliptical arcs), SVG path drawing, fill rules, clipping, CTM, cap/join/miter/dash, colors, `gs`, image XObjects and shading-pattern paint; no direct `sh` operator |
| `graphic_state.dart` | 194 | `src/pdf/graphic_state.ts` | partial — `/ca`, `/CA`, `/BM`, deduplicated per page; no `PdfGraphicStates` document object, no `/SMask`, no `/TR` |
| *(no upstream file — `vector_math`)* | — | `src/pdf/matrix.ts` | done — the 2×3 affine `cm` operand, composition, inversion and the y-down conjugation |
| `document.dart` | 289 | `src/pdf/document.ts` | partial — `PdfDocument` object registry; one font/image object per distinct resource, created on first use |
| `point.dart`, `rect.dart` | 159 | `src/pdf/rect.ts` | done — `PdfPoint`, `PdfRect` as interfaces plus factory objects |
| `options.dart` | 8 | — | — |
| `document_parser.dart` | 40 | — | — reading existing PDFs is out of scope |
| `exif.dart` | 785 | `src/pdf/image/jpeg.ts` | partial — baseline SOF dimensions/components and Adobe CMYK transform; full EXIF metadata/orientation remains out of scope |
| `raster.dart` | 132 | — | — needs a rasterizer; out of scope |
| `io/*.dart` | 130 | — | n/a — platform shims the port does not need |

## `src/pdf/obj/` — indirect objects

Upstream models each indirect object as a `PdfObject` subclass. **Phase 0.2
reintroduced that hierarchy**, which is what the rest of this section was waiting
on: an object registers itself with the document, hands out references through
`ref()`, and resolves cross-object entries in `prepare()`.

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `obj/object.dart`, `object_dict.dart` | 93 | `src/pdf/obj/object.ts` | done — `PdfObject`, `PdfObjectDict` |
| `obj/object_stream.dart` | 51 | `src/pdf/obj/object_stream.ts` | partial — no Ascii85 flag, no deflate |
| `obj/catalog.dart` | 178 | `src/pdf/obj/catalog.ts` | partial — `/Type`, `/Pages`, `/Names`, `/Outlines`, outline page mode; no page labels or `/AcroForm` |
| `obj/page_list.dart` | 46 | `src/pdf/obj/page_list.ts` | done — flat page tree |
| `obj/page.dart` | 164 | `src/pdf/obj/page.ts` | partial — `/Resources` inherited from `PdfGraphicStream` and link `/Annots`; no `/Rotate` |
| `obj/info.dart` | 69 | `src/pdf/obj/info.ts` | partial — no `/CreationDate` (no clock) and no `/Keywords` |
| `obj/array.dart` | 30 | — | — |
| `obj/type1_font.dart`, `font.dart` | 397 | `src/pdf/font/font.ts`, `src/pdf/font/type1_fonts.ts` | partial — `PdfFont` seam and all 14 standard Type1 fonts; `resourceDict(registry)` returns a `PdfDict` and may create the objects it references |
| `obj/font_descriptor.dart` | 139 | `src/pdf/obj/font_descriptor.ts` | partial — bbox, flags, ascent/descent, `/FontFile2`; `/ItalicAngle`, `/CapHeight` and `/StemV` are upstream's constants |
| `obj/ttffont.dart`, `unicode_cmap.dart` | 278 | `src/pdf/obj/ttf_font.ts`, `src/pdf/obj/unicode_cmap.ts` | partial — Type0/CIDFontType2, `/Identity-H`, `/ToUnicode`; no simple `/TrueType` branch, no Arabic or bidi coupling |
| `obj/graphic_stream.dart` | 156 | `src/pdf/obj/graphic_stream.ts` | partial — `/Font`, `/XObject`, `/ExtGState` and `/Pattern` (inline dictionaries, per page); base class rather than a mixin, no `/ProcSet` or standalone `/Shading` resources |
| `obj/xobject.dart`, `formxobject.dart`, `formxobject_extensions.dart` | 206 | `src/pdf/obj/xobject.ts` | partial — binary image XObject base; form XObjects remain |
| `obj/image.dart`, `smask.dart` | 347 | `src/pdf/obj/image.ts`, `src/pdf/image/png.ts`, `src/pdf/image/jpeg.ts` | partial — **4.1–4.2 done:** PNG decode, baseline JPEG pass-through, RGB/gray/CMYK colour spaces and image alpha `/SMask`; generic luminosity form masks remain |
| `obj/shading.dart`, `pattern.dart`, `function.dart` | 349 | `src/pdf/obj/shading.ts`, `pattern.ts`, `function.ts` | partial — axial/radial DeviceRGB shadings, type-2 interpolation and type-3 stitching, direct shading-pattern dictionaries; no sampled streams or tiling patterns |
| `obj/names.dart`, `outline.dart` | 296 | `src/pdf/obj/names.ts`, `outline.ts` | done — sorted named destinations and hierarchical outline tree with title, style, colour, siblings and closed descendants |
| `obj/annotation.dart`, `border.dart` | 1070 | `src/pdf/obj/annotation.ts` | partial — borderless printable URL and named-destination link annotations; text notes, geometric annotations, custom borders and form fields remain |
| `obj/metadata.dart`, `page_label.dart` | 248 | — | — |
| `obj/encryption.dart`, `signature.dart` | 151 | — | — |
| `obj/pdfa/*.dart` | 342 | — | — |

## `src/pdf/font/` — font subsystem

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `font/font_metrics.dart` | 184 | `src/pdf/font/font_metrics.ts` | done — bounding box, bearings, ascent/descent and advance width |
| `font/type1_fonts.dart` | 304 | `src/pdf/font/type1_fonts.ts` | done — complete AFM widths for the 14 standard fonts |
| `font/ttf_parser.dart` | 693 | `src/pdf/font/ttf_parser.ts` | partial — tables, `cmap` 0/4/6/12, `loca`/`glyf`, composite glyphs, `CFF ` detection; no `CBLC`/`CBDT` bitmaps, no bidi isolated-form mapping |
| `font/ttf_writer.dart` | 399 | `src/pdf/font/ttf_writer.ts` | done — glyph subset, rebuilt `loca`/`glyf`/`hmtx`/`cmap`, recomputed checksums; keeps the CID-to-glyph identity upstream loses |
| `font/bidi_utils.dart`, `arabic.dart` | 502 | — | — |

## `src/svg/` — SVG subsystem

The `d` grammar landed in phase 2.2. The corpus is the SVG already in
`examples/assets/` — twelve files plus the inline markup in
`server-assets.json`; every `d` attribute in it parses.

Upstream's own `svg/path.dart` holds only the *shapes* — a `<rect>` written out
as a `d` string, and so on — and delegates the grammar to the `path_parsing`
package. The port has no runtime dependencies, so `src/svg/path.ts` carries
both, and will grow the shape factories in 2.5.

| Upstream | Lines | Port / status |
|---|---:|---|
| `svg/parser.dart` | 219 | `src/svg/parser.ts` — done: `SvgNumeric` and units, attribute helpers, `SvgParser` with intrinsic size, viewBox, colour filter and `findById` |
| `svg/path.dart` | 320 | `src/svg/path.ts` — done: full `d` grammar, `drawShape`, tight bounding boxes, basic shape factories and fill/stroke paint |
| `svg/painter.dart`, `operation.dart` | 251 | `src/svg/painter.ts`, `operation.ts` — partial: scoped transforms, clipping, opacity/blend states, visibility and operation dispatch; text/image later |
| `svg/transform.dart` | 124 | `src/svg/transform.ts` — done: `matrix translate scale rotate skewX skewY`, composed left to right |
| `svg/group.dart`, `use.dart`, `symbol.dart` | 287 | `src/svg/group.ts`, `use.ts`, `symbol.ts` — done: inherited groups and local or namespaced references |
| `svg/brush.dart`, `color.dart`, `colors.dart` | 609 | `src/svg/brush.ts`, `color.ts`, `colors.ts` — partial: complete named table, functional/hex colours, `currentColor`, inherited solid and gradient paint, stroke state |
| `svg/clip_path.dart`, `mask_path.dart` | 148 | `src/svg/clip_path.ts` — partial: `clipPath`, `clip-rule`, user-space/object-bounding-box units and nested scopes; soft masks wait for phase 4 form XObjects and `/SMask` |
| `svg/gradient.dart` | 436 | `src/svg/gradient.ts` — partial: linear/radial gradients, stops, transforms, units and inherited references; varying stop alpha and true repeat/reflect wait on soft masks/tiling patterns |
| `svg/text.dart` | 221 | — |
| `svg/image.dart` | 150 | — |
| *(no upstream file — the `xml` package)* | — | `src/svg/xml.ts` — done: elements, attributes, text, CDATA, comments, entities, namespaces; no DTD subset, no validation |

## `src/widgets/` — layout tree

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `widgets/widget.dart` | 444 | `src/widgets/widget.ts` | partial — pure layout protocol, `StatelessWidget`, immutable `SpanningWidget` continuation state and theme on the render context; no `InheritedWidget` |
| `widgets/geometry.dart` | 1018 | `src/widgets/geometry.ts` | partial — `BoxConstraints` with factories/transforms, `EdgeInsets`, `Alignment`, `inscribe`; no directional geometry or `TextDirection` |
| `widgets/text.dart`, `text_style.dart` | 1846 | `src/widgets/text.ts`, `src/widgets/text_style.ts` | partial — `InlineSpan`, `TextSpan`, `WidgetSpan`, `RichText`, inherited per-run styles, annotations and fallback fonts, wrapping, immutable page continuation, LTR/explicit RTL placement, justification, backgrounds and combined decorations; no Arabic shaping or Unicode bidi reordering |
| `widgets/flex.dart` | 727 | `src/widgets/flex.ts` | partial — full `Flex`/`Row`/`Column` allocation, all main/cross alignments, `mainAxisSize`, vertical direction, `Expanded`, `Flexible`, proportional `Spacer`, plus `gap`/weighted-row extensions; no `ListView`, bidi direction or baseline alignment |
| `widgets/container.dart`, `decoration.dart`, `box_border.dart` | 881 | `src/widgets/container.ts`, `decoration.ts`, `box_border.ts` | partial — `Container`, `DecoratedBox`, background/foreground `BoxDecoration`, per-side/dashed borders, axial/radial gradients and vector shadows; no decoration image painter yet |
| `widgets/page.dart`, `page_theme.dart` | 395 | `src/widgets/page.ts`, `src/widgets/page_theme.ts` | partial — `PageTheme` with theme, margins, orientation, background and foreground; **one document may mix orientations and paper sizes**, per section; no `clip` |
| `widgets/multi_page.dart` | 678 | `src/widgets/multi_page.ts` | partial — header/footer, atomic page breaks, direct spanning children, `maxPages` and per-section `orientation` |
| `widgets/document.dart` | 153 | `src/widgets/document.ts` | partial — synchronous `save()`; owns the theme and the per-document font cache |
| `widgets/shape.dart`, `svg.dart` | 400 | `src/widgets/shape.ts`, `src/widgets/svg.ts` | partial — imperative `Vector`; public `SvgImage` with all `BoxFit` modes, alignment, clipping and colour filter; no SVG text or embedded raster content |
| `widgets/basic.dart` | 1090 | `src/widgets/basic.ts` | done — all upstream public classes, including tight `SizedBox`, `ConstrainedBox`, minimum-preserving `LimitedBox` and aligned `OverflowBox`; dividers paint the equivalent rule directly |
| `widgets/table.dart`, `table_helper.dart` | 834 | `src/widgets/table.ts`, `table_helper.ts` | partial — fixed/flex/intrinsic/fraction tracks, alignment, decorations, borders, `TableHelper`, page spanning and repeatable headers; no bidi direction |
| `widgets/theme.dart`, `font.dart` | 461 | `src/widgets/theme.ts`, `src/widgets/font.ts` | partial — `Font`, `ThemeData`, `Theme`, `DefaultTextStyle` and `iconTheme`; no `DefaultTextStyle.merge` |
| `widgets/image.dart`, `image_provider.dart` | 423 | `src/widgets/image.ts`, `src/widgets/image_provider.ts` | partial — `Image`, all seven `BoxFit` modes, alignment, DPI-aware decoded PNG/Raw resizing, `ImageProvider`, `ImageProxy`, `MemoryImage`, `RawImage`; bytes are caller-supplied and encoded JPEGs remain pass-through |
| `widgets/border_radius.dart` | 466 | `src/widgets/border_radius.ts` | done — physical/directional circular or elliptical radii, with oversized radii scaled to a valid path |
| `widgets/stack.dart`, `wrap.dart`, `grid_view.dart`, `partitions.dart` | 1376 | `src/widgets/stack.ts`, `wrap.ts`, `grid_view.ts`, `partitions.ts` | done — positioned overlays/clipping, multi-run wrap, fixed-track grid and parallel partitions; immutable continuation for wrap/grid/partitions |
| `widgets/clip.dart` | 134 | `src/widgets/clip.ts` | done — rectangular, scaled rounded-rectangle and elliptical clip scopes over immutable child layout |
| `widgets/chart/*.dart` | 1989 | `src/widgets/chart/*.ts` | done — `Chart`, `CartesianGrid`, `PieGrid`, `RadialGrid`, `FixedAxis`, `ChartLegend`, `PointDataSet`, `BarDataSet`, `LineDataSet`, `PieDataSet`; grids resolve a frame at layout and hand it to the data sets, in place of upstream's mutable boxes |
| `widgets/annotations.dart`, `forms.dart` | 1244 | `src/widgets/annotations.ts` | partial — `Annotation`, `Link`, `UrlLink`, inline builders and `Anchor`; forms remain for 5.6 |
| `widgets/barcode.dart` | 298 | `src/widgets/barcode.ts` | done — `Barcode`, `BarcodeWidget`; symbol operations are immutable layout data |
| `widgets/content.dart` | 360 | `src/widgets/content.ts` | partial — `Header`, `Paragraph`, `Bullet`, clickable `TableOfContent`, named destinations and conditional two-pass TOC; no `Watermark` or `Footer` |
| `widgets/placeholders.dart` | 187 | `src/widgets/placeholders.ts` | done — `Placeholder`, vector `PdfLogo`, SVG `FlutterLogo`, deterministic `LoremText` and stable `Lorem` widget |
| `widgets/icon.dart` | 146 | `src/widgets/icon.ts` | done — `Icon`, `IconData`, `IconThemeData`, themed size/color/opacity and RTL mirroring over a caller-supplied font |
| `widgets/progress.dart` | 202 | `src/widgets/progress.ts` | done — `CircularProgressIndicator`, `LinearProgressIndicator`, clamped values, defaults and custom colours/thickness |
| `widgets/grid_paper.dart` | 338 | — | — no example depends on it |

---

## Summary

| Subsystem | Upstream lines | State |
|---|---:|---|
| Object syntax / serialization | ~1,700 | self-serializing value types; no filters, no xref streams |
| Graphics | ~1,600 | paths, transforms, clipping, graphic states, shading patterns and raster image XObjects done; no direct `sh` operator |
| Indirect objects | ~4,300 | object model in place; catalog, pages, info, content streams, page resources, embedded fonts |
| Fonts | ~2,100 | Type1 AFM metrics and embedded TrueType both done: parse, subset, embed as Type0/Identity-H with a `/ToUnicode` CMap |
| SVG | ~2,800 | public widget, paths, XML, transforms, units, shapes, groups, references, clipping and gradients done; SVG text and embedded raster content remain |
| Widgets | ~14,000 | ~85 public widget/value constructors, plus tables, rich styles, content and themes |

**Phases 0, 1 and 2 are complete.** The WinAnsi ceiling is gone: a TrueType font
is parsed, subset to the glyphs a document used, embedded as a
Type0/CIDFontType2 composite with `/Identity-H`, and selected through `Font`,
`TextStyle` and `ThemeData`. Text outside Latin-1 is no longer replaced with `?`
— it is drawn from the embedded font and stays searchable through the
`/ToUnicode` CMap. The public SVG pipeline now reaches PDF shading patterns.

**Phase 5.5 is complete.** Both progress indicators use pure layout data and
the existing PDF path surface. All eight upstream examples now generate with
zero missing APIs; `resume` exercises images, SVG, icons, clipping, partitions,
links and circular progress together. See [ROADMAP.md](ROADMAP.md).

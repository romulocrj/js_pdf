# Porting status

Coverage of `DavBfr/dart_pdf` (`pdf/lib/`) by this port.

**Last updated:** 2026-08-05
**Upstream reference:** `pdf/lib/` — 137 Dart files, ~31,800 lines
**Ported:** 38 `.ts` files, ~3,610 lines (TypeScript)

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
| `hello-world` | ✅ generated (740 bytes) | 0 | — |
| `calendar` | failed | 14 | 3.6 |
| `certificate` | failed | 19 | 3.9 |
| `report` | failed | 18 | 5.1 |
| `invoice` | failed | 23 | 5.2 |
| `document` | failed | 22 | 5.3 |
| `server` | failed | 22 | 5.3 |
| `resume` | failed | 29 | 5.5 |

**1 of 8.** See [ROADMAP.md § Example gates](ROADMAP.md#example-gates) for which
phase clears each one.

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
| `format/string.dart` | 204 | `src/pdf/format/string.ts` | partial — `PdfString`, literal + WinAnsi; no hex, no UTF-16BE, no PDF-date |
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
| `page_format.dart` | 171 | `src/pdf/page_format.ts` | partial — A4 and Letter only |
| `color.dart` | 725 | `src/pdf/color.ts` | partial — RGB / DeviceRGB only |
| `colors.dart` | 406 | — | — named color constants |
| `graphics.dart` | 1415 | `src/pdf/graphics.ts` | partial — fill/stroke rect, line, circle, text, per-page font registration; no paths, transforms, clipping, alpha, shading |
| `graphic_state.dart` | 194 | folded into `src/pdf/graphics.ts` | stub — `q`/`Q` only; no ExtGState objects |
| `document.dart` | 289 | `src/pdf/document.ts` | partial — `PdfDocument` object registry; one font object per distinct font, created on first use |
| `point.dart`, `rect.dart` | 159 | folded into `src/widgets/geometry.ts` | partial |
| `options.dart` | 8 | — | — |
| `document_parser.dart` | 40 | — | — reading existing PDFs is out of scope |
| `exif.dart` | 785 | — | — |
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
| `obj/catalog.dart` | 178 | `src/pdf/obj/catalog.ts` | partial — `/Type`, `/Pages`; no outlines, names, page labels, `/AcroForm` |
| `obj/page_list.dart` | 46 | `src/pdf/obj/page_list.ts` | done — flat page tree |
| `obj/page.dart` | 164 | `src/pdf/obj/page.ts` | partial — `/Resources` inherited from `PdfGraphicStream`; no `/Rotate`, no `/Annots` |
| `obj/info.dart` | 69 | `src/pdf/obj/info.ts` | partial — no `/CreationDate` (no clock) and no `/Keywords` |
| `obj/array.dart` | 30 | — | — |
| `obj/type1_font.dart`, `font.dart` | 397 | `src/pdf/font/font.ts`, `src/pdf/font/type1_fonts.ts` | partial — `PdfFont` seam and all 14 standard Type1 fonts; `resourceDict()` returns a `PdfDict`; any number per document as of 0.3 |
| `obj/font_descriptor.dart` | 139 | — | — needed for embedded TTF in **phase 1.3** |
| `obj/ttffont.dart`, `unicode_cmap.dart` | 278 | — | — **phase 1.3** |
| `obj/graphic_stream.dart` | 156 | `src/pdf/obj/graphic_stream.ts` | partial — `/Font`, `/XObject`, `/ExtGState`; base class rather than a mixin, no `/ProcSet`, `/Shading` or `/Pattern` |
| `obj/xobject.dart`, `formxobject.dart`, `formxobject_extensions.dart` | 206 | — | — form XObjects, **phase 4** |
| `obj/image.dart`, `smask.dart` | 347 | — | — **phase 4.1–4.2** |
| `obj/shading.dart`, `pattern.dart`, `function.dart` | 349 | — | — SVG gradients, **phase 2.8** |
| `obj/annotation.dart`, `border.dart`, `names.dart`, `outline.dart` | 1366 | — | — links **phase 5.3**; names/outlines needed by `TableOfContent` in **3.8** |
| `obj/metadata.dart`, `page_label.dart` | 248 | — | — |
| `obj/encryption.dart`, `signature.dart` | 151 | — | — |
| `obj/pdfa/*.dart` | 342 | — | — |

## `src/pdf/font/` — font subsystem

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `font/font_metrics.dart` | 184 | `src/pdf/font/font_metrics.ts` | done — bounding box, bearings, ascent/descent and advance width |
| `font/type1_fonts.dart` | 304 | `src/pdf/font/type1_fonts.ts` | done — complete AFM widths for the 14 standard fonts |
| `font/ttf_parser.dart` | 693 | — | — **phase 1.1** |
| `font/ttf_writer.dart` | 399 | — | — **phase 1.2** |
| `font/bidi_utils.dart`, `arabic.dart` | 502 | — | — |

## `src/svg/` — SVG subsystem

Nothing ported. `src/widgets/shape.ts` (`Vector`) is the drawing surface this
subsystem will target. **Roadmap phase 2.** The corpus is the SVG already in
`examples/assets/` — twelve files plus the inline markup in
`server-assets.json`.

| Upstream | Lines | Status |
|---|---:|---|
| `svg/parser.dart` | 219 | — **phase 2.7** |
| `svg/path.dart` | 320 | — **phase 2.2** |
| `svg/painter.dart`, `operation.dart` | 251 | — **phase 2.5** |
| `svg/transform.dart` | 124 | — **phase 2.4** |
| `svg/group.dart`, `use.dart`, `symbol.dart` | 287 | — **phase 2.5** |
| `svg/brush.dart`, `color.dart`, `colors.dart` | 609 | — **phase 2.5** |
| `svg/clip_path.dart`, `mask_path.dart` | 148 | — **phase 2.6** |
| `svg/gradient.dart` | 436 | — **phase 2.8**, optional |
| `svg/text.dart` | 221 | — |
| `svg/image.dart` | 150 | — |

## `src/widgets/` — layout tree

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `widgets/widget.dart` | 444 | `src/widgets/widget.ts` | partial — layout protocol; no `Context` inheritance, `InheritedWidget`, `StatelessWidget` (**phase 3.3**) |
| `widgets/geometry.dart` | 1018 | `src/widgets/geometry.ts` | partial — inset normalization; no exported `EdgeInsets` (**phase 3.3**) |
| `widgets/text.dart`, `text_style.dart` | 1846 | `src/widgets/text.ts` | partial — single style, greedy wrap, per-widget `font`; no `TextStyle` (**1.4**), `RichText`/`TextSpan` (**3.7**) |
| `widgets/flex.dart` | 727 | `src/widgets/flex.ts` | partial — `Column`, `Row`, `Spacer`; no alignment, `Expanded`, `Flexible` (**phase 3.4**) |
| `widgets/container.dart`, `decoration.dart`, `box_border.dart` | 881 | `src/widgets/container.ts` | partial — fill, single border; no `BoxDecoration`, `Border`, `BorderSide` (**phase 3.5**) |
| `widgets/page.dart`, `page_theme.dart` | 395 | `src/widgets/page.ts` | partial — no `PageTheme` (**phase 1.4**) |
| `widgets/multi_page.dart` | 678 | `src/widgets/multi_page.ts` | partial — header/footer and page breaks; no `SpanningWidget` (**phase 3.2**) |
| `widgets/document.dart` | 153 | `src/widgets/document.ts` | partial — synchronous `save()`; `font` is the default a widget falls back to, not the document's only font |
| `widgets/shape.dart`, `svg.dart` | 400 | `src/widgets/shape.ts` | partial — imperative `Vector`; no `SvgImage` (**phase 2.7**) |
| `widgets/basic.dart` | 1090 | — | — `Align`, `Padding`, `SizedBox`, `Transform`, `FittedBox`, `Divider`, `FullPage` — **phase 3.3** |
| `widgets/table.dart`, `table_helper.dart` | 834 | — | — **phase 3.1** |
| `widgets/theme.dart`, `font.dart` | 461 | — | — `Theme`, `ThemeData`, `DefaultTextStyle`, `Font` — **phase 1.4** |
| `widgets/image.dart`, `image_provider.dart` | 423 | — | — `Image`, `MemoryImage` — **phase 4.3** |
| `widgets/border_radius.dart` | 466 | — | — `BorderRadius` — **phase 3.5** |
| `widgets/stack.dart`, `wrap.dart`, `grid_view.dart`, `partitions.dart` | 1376 | — | — `Stack`, `Positioned`, `GridView`, `Partitions` — **phase 3.6** |
| `widgets/clip.dart` | 134 | — | — `ClipOval`, `ClipRect`, `ClipRRect` — **phase 3.10** |
| `widgets/chart/*.dart` | 1989 | — | — `Chart`, grids, data sets — **phase 5.1** |
| `widgets/annotations.dart`, `forms.dart` | 1244 | — | — `UrlLink`, `AnnotationUrl` — **phase 5.3**; forms 5.6 |
| `widgets/barcode.dart` | 298 | — | — `Barcode`, `BarcodeWidget` — **phase 5.2** |
| `widgets/content.dart` | 360 | — | — `Header`, `Paragraph`, `Bullet`, `TableOfContent` — **phase 3.8** |
| `widgets/placeholders.dart` | 187 | — | — `PdfLogo`, `Lorem`, `LoremText` — **phase 3.9** |
| `widgets/icon.dart` | 146 | — | — `Icon`, `IconData` — **phase 5.4** |
| `widgets/progress.dart` | 202 | — | — `CircularProgressIndicator` — **phase 5.5** |
| `widgets/grid_paper.dart` | 338 | — | — no example depends on it |

---

## Summary

| Subsystem | Upstream lines | State |
|---|---:|---|
| Object syntax / serialization | ~1,700 | self-serializing value types; no filters, no xref streams |
| Graphics | ~1,600 | ~15% of the operator surface |
| Indirect objects | ~4,300 | object model in place; catalog, pages, info, content streams, page resources |
| Fonts | ~2,100 | Type1 AFM metrics done, any number per document; no TTF parsing or embedding |
| SVG | ~2,800 | not started |
| Widgets | ~14,000 | ~10 widgets of ~60 |

**Phase 0 is complete.** The object model landed in 0.2 and the per-page resource
dictionary in 0.3, so neither the object graph nor the single-font limit is a
blocker any more. The next gate is **phase 1**, embedded TTF — until it lands,
any text outside WinAnsi is silently replaced with `?`. See
[ROADMAP.md](ROADMAP.md).

# Porting status

Coverage of `DavBfr/dart_pdf` (`pdf/lib/`) by this port.

**Last updated:** 2026-08-05
**Upstream reference:** `pdf/lib/` — 137 Dart files, ~31,800 lines
**Ported:** 19 `.ts` files, ~1,690 lines (TypeScript)

Legend: **done** · **partial** — usable but materially narrower than upstream ·
**stub** — placeholder with a known-wrong implementation · **—** — not started

> Update this file in the same change that moves any row. See
> [ARCHITECTURE.md §7](ARCHITECTURE.md#7-adding-a-subsystem).

---

## Entry points

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `pdf.dart` + `widgets.dart` | 114 | `src/index.ts` | partial — exports the implemented subset |
| `src/base/exceptions.dart` | 15 | `src/base/assert.ts` | partial — runtime guards, no exception types |

## `src/pdf/format/` — object syntax

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `format/num.dart` | 96 | `src/pdf/format/num.ts` | done for the operators in use |
| `format/string.dart` | 204 | `src/pdf/format/string.ts` | partial — literal + WinAnsi; no hex, no UTF-16BE, no PDF-date |
| `format/stream.dart`, `format/base.dart` | 133 | `src/pdf/format/stream.ts` | partial — byte helpers only |
| `format/xref.dart` | 406 | folded into `src/pdf/document.ts` | partial — classic xref table; no xref streams, no incremental update |
| `format/dict.dart`, `dict_stream.dart`, `array.dart`, `name.dart`, `bool.dart`, `null_value.dart`, `indirect.dart`, `object_base.dart` | 574 | — | — inlined as string building; needs extraction before images/TTF |
| `format/ascii85.dart` | 91 | — | — |
| `format/diagnostic.dart` | 66 | — | — |

## `src/pdf/` — document and graphics

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `page_format.dart` | 171 | `src/pdf/page_format.ts` | partial — A4 and Letter only |
| `color.dart` | 725 | `src/pdf/color.ts` | partial — RGB / DeviceRGB only |
| `colors.dart` | 406 | — | — named color constants |
| `graphics.dart` | 1415 | `src/pdf/graphics.ts` | partial — fill/stroke rect, line, circle, text; no paths, transforms, clipping, alpha, shading |
| `graphic_state.dart` | 194 | folded into `src/pdf/graphics.ts` | stub — `q`/`Q` only; no ExtGState objects |
| `document.dart` | 289 | `src/pdf/document.ts` | partial — catalog, page list, info, one Type1 font |
| `point.dart`, `rect.dart` | 159 | folded into `src/widgets/geometry.ts` | partial |
| `options.dart` | 8 | — | — |
| `document_parser.dart` | 40 | — | — reading existing PDFs is out of scope |
| `exif.dart` | 785 | — | — |
| `raster.dart` | 132 | — | — needs a rasterizer; out of scope |
| `io/*.dart` | 130 | — | n/a — platform shims the port does not need |

## `src/pdf/obj/` — indirect objects

Upstream models each indirect object as a `PdfObject` subclass. The port emits a
flat object table instead; reintroducing the hierarchy is a prerequisite for
almost everything in this section.

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `obj/object.dart`, `object_dict.dart`, `object_stream.dart`, `array.dart` | 174 | folded into `src/pdf/document.ts` | stub — no reusable object model |
| `obj/catalog.dart`, `page.dart`, `page_list.dart`, `info.dart` | 457 | folded into `src/pdf/document.ts` | partial |
| `obj/type1_font.dart`, `font.dart`, `font_descriptor.dart` | 536 | folded into `src/pdf/document.ts` | stub — a single hardcoded `/Helvetica` `/WinAnsiEncoding` dict |
| `obj/ttffont.dart`, `unicode_cmap.dart` | 278 | — | — **roadmap phase 1** |
| `obj/graphic_stream.dart`, `xobject.dart`, `formxobject.dart`, `formxobject_extensions.dart` | 362 | — | — |
| `obj/image.dart`, `smask.dart` | 347 | — | — |
| `obj/shading.dart`, `pattern.dart`, `function.dart` | 349 | — | — |
| `obj/annotation.dart`, `border.dart`, `names.dart`, `outline.dart` | 1366 | — | — |
| `obj/metadata.dart`, `page_label.dart` | 248 | — | — |
| `obj/encryption.dart`, `signature.dart` | 151 | — | — |
| `obj/pdfa/*.dart` | 342 | — | — |

## `src/pdf/font/` — font subsystem

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `font/font_metrics.dart` | 184 | `src/pdf/font/font_metrics.ts` | **stub** — character-class approximation, not real metrics |
| `font/type1_fonts.dart` | 304 | — | — AFM widths for the 14 standard fonts |
| `font/ttf_parser.dart` | 693 | — | — **roadmap phase 1** |
| `font/ttf_writer.dart` | 399 | — | — **roadmap phase 1** |
| `font/bidi_utils.dart`, `arabic.dart` | 502 | — | — |

## `src/svg/` — SVG subsystem

Nothing ported. `src/widgets/shape.ts` (`Vector`) is the drawing surface this
subsystem will target. **Roadmap phase 2.**

| Upstream | Lines | Status |
|---|---:|---|
| `svg/parser.dart` | 219 | — |
| `svg/path.dart` | 320 | — |
| `svg/painter.dart`, `operation.dart` | 251 | — |
| `svg/transform.dart` | 124 | — |
| `svg/group.dart`, `use.dart`, `symbol.dart` | 287 | — |
| `svg/brush.dart`, `color.dart`, `colors.dart` | 609 | — |
| `svg/clip_path.dart`, `mask_path.dart` | 148 | — |
| `svg/gradient.dart` | 436 | — |
| `svg/text.dart` | 221 | — |
| `svg/image.dart` | 150 | — |

## `src/widgets/` — layout tree

| Upstream | Lines | Port | Status |
|---|---:|---|---|
| `widgets/widget.dart` | 444 | `src/widgets/widget.ts` | partial — layout protocol; no `Context` inheritance, no `InheritedWidget` |
| `widgets/geometry.dart` | 1018 | `src/widgets/geometry.ts` | partial — inset normalization only |
| `widgets/text.dart`, `text_style.dart` | 1846 | `src/widgets/text.ts` | partial — single style, greedy wrap; no `RichText`, `TextSpan`, justification, decorations |
| `widgets/flex.dart` | 727 | `src/widgets/flex.ts` | partial — `Column`, `Row`, `Spacer`; no alignment or `Expanded` |
| `widgets/container.dart`, `decoration.dart`, `box_border.dart` | 881 | `src/widgets/container.ts` | partial — fill, single border, padding, margin |
| `widgets/page.dart`, `page_theme.dart` | 395 | `src/widgets/page.ts` | partial — no page theme |
| `widgets/multi_page.dart` | 678 | `src/widgets/multi_page.ts` | partial — header/footer and page breaks; no `SpanningWidget` |
| `widgets/document.dart` | 153 | `src/widgets/document.ts` | partial — synchronous `save()` |
| `widgets/shape.dart`, `svg.dart` | 400 | `src/widgets/shape.ts` | partial — imperative `Vector` only |
| `widgets/basic.dart` | 1090 | — | — `Align`, `Padding`, `SizedBox`, `Transform`, `Opacity`, … |
| `widgets/table.dart`, `table_helper.dart` | 834 | — | — **roadmap phase 3** |
| `widgets/theme.dart`, `font.dart` | 461 | — | — needed once fonts are selectable |
| `widgets/image.dart`, `image_provider.dart` | 423 | — | — |
| `widgets/border_radius.dart` | 466 | — | — |
| `widgets/stack.dart`, `wrap.dart`, `grid_view.dart`, `partitions.dart` | 1376 | — | — |
| `widgets/clip.dart` | 134 | — | — |
| `widgets/chart/*.dart` | 1989 | — | — |
| `widgets/annotations.dart`, `forms.dart` | 1244 | — | — |
| `widgets/barcode.dart`, `icon.dart`, `progress.dart`, `grid_paper.dart`, `placeholders.dart`, `content.dart` | 1531 | — | — |

---

## Summary

| Subsystem | Upstream lines | State |
|---|---:|---|
| Object syntax / serialization | ~1,700 | minimal but correct output |
| Graphics | ~1,600 | ~15% of the operator surface |
| Indirect objects | ~4,300 | flat table; no object model |
| Fonts | ~2,100 | **stub metrics, no embedding** |
| SVG | ~2,800 | not started |
| Widgets | ~14,000 | ~10 widgets of ~60 |

The two entries that gate everything downstream are **fonts** and **the object
model**. See [ROADMAP.md](ROADMAP.md).

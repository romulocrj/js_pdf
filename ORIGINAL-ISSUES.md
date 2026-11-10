# Issues found in the original implementation

> **Disclaimer:** These issues have not been reported to the original project.
> A substantial part of this port and its analysis was produced with the
> assistance of AI, so reporting them without independent validation could
> create false or misleading bug reports for the upstream maintainers. They are
> documented here as observations from the porting process and should be
> independently reproduced before being reported upstream.

This file records defective behavior found in `dart_pdf-master` during the
translation. The port preserves the intent of the API without reproducing
these defects.

## Radii larger than the box (`border_radius.dart`)

**How to reproduce:** paint a box with width 40 and horizontal radii of 30 on
both corners of the same edge. The original path adds them to 60 on an edge of
40, causing the curves to cross.

**Correction in the port:** `BorderRadius.paint` proportionally reduces all
radii when the sum of two corners exceeds the available width or height. The
same validated path is used by `ClipRRect`, preventing the intersection in the
rounded clip as well.

## `Positioned` reads the size of a previous layout (`stack.dart`)

**How to reproduce:** during the first layout of a `Stack`, the code checks
`positioned.width`/`height` before calling `positioned.layout`. These getters
read `box?.width`/`height`, so they return null on the first pass and may return
a stale size when the instance is reused.

**Correction in the port:** width and height are immutable optional inputs of
`Positioned`; the measured result exists only in `StackLayoutData`.

## `GridView.hasMoreWidgets` is always true (`grid_view.dart`)

**How to reproduce:** finish all children of a `GridView` inside `MultiPage`
and inspect `hasMoreWidgets`. The original getter returns `true` without
checking the cursor, allowing empty pages or repetition up to the page limit.

**Correction in the port:** `GridViewState.firstChild` is compared with the
actual number of children, and `hasMore` becomes false exactly after the final
fragment.

## Grid aspect ratio is reduced to fit (`grid_view.dart`)

**How to reproduce:** use a finite `childAspectRatio` with several rows and
little available height. The original chooses the minimum of the proportional
size and the page height divided by the total row count, compressing the cells
and no longer respecting the requested ratio.

**Correction in the port:** a finite ratio determines a stable cell size; full
rows that do not fit continue in the next fragment. The default mode without an
explicit ratio still distributes rows across a finite height, as required by
the original calendar example.

## `Partitions` stops when the first column ends (`partitions.dart`)

**How to reproduce:** create two paginated partitions, one with two fragments
and another with four. `hasMoreWidgets` negates `any(!hasMoreWidgets)`, meaning
that every partition must still contain data; the longer column is truncated
when the shorter one ends.

**Correction in the port:** continuation remains active while any column has
content. Completed column states produce empty fragments while the remaining
columns continue normally.

## Justification divides by zero for a line with one span (`text.dart`)

**How to reproduce:** use `TextAlign.justify` at a width that forces one long
word to occupy a broken line by itself. `_Line.realign` computes the interval
as `(totalWidth - wordsWidth) / (spans.length - 1)`; with one span, the
denominator is zero and the next offset is no longer finite.

**Correction in the port:** slack is distributed only when a broken line has
at least one real interval between words. Lines without an interval keep their
normal position, and every offset remains finite.

## Header destinations can collide (`content.dart`)

**How to reproduce:** create two `Header` widgets with the same `text`, or two
headers that use only `child` and `title`. The original uses
`text.hashCode.toString()` as the destination name; equal text produces equal
names, and the case without `text` uses the same null hash, causing one
`PdfNames` entry to overwrite another.

**Correction in the port:** each painted header receives a unique sequential
anchor in document order (`outline-1`, `outline-2`, ...). The replay used by the
table of contents reuses these anchors without creating duplicates.

## The final lorem word is never selected (`placeholders.dart`)

**How to reproduce:** force the generator to return the highest allowed index
in `LoremText.word()`. The original calls `nextInt(words.length - 1)`, whose
upper bound is exclusive, so the final entry (`voluptate`) can never appear.

**Correction in the port:** the upper bound is the complete list length; a test
with a controlled generator confirms that `voluptate` can be selected.

## Lorem paragraphs exceed the requested length (`placeholders.dart`)

**How to reproduce:** call `LoremText().paragraph(15)`. The original expression
applies `max(10, min(3, ...))`, which always produces at least 10, and limits it
by the full length instead of the remaining words; two sentences may produce
20 words for a request of 15.

**Correction in the port:** each sentence receives between 3 and 10 words,
limited by the remaining total. The loop ends with exactly the requested word
count.

## A JPEG APP14 marker after SOF is ignored (`exif.dart`)

**How to reproduce:** build a valid baseline CMYK JPEG with an SOF0 marker
before an `Adobe` APP14 marker whose transform is zero. This segment order is
valid, but `PdfJpegInfo` stops scanning as soon as it encounters SOF and never
sees the later APP14 marker. Without that value, it assumes the components are
inverted and emits a `/Decode` entry that changes the colors of direct CMYK.

**Correction in the port:** `parseJpeg` retains the SOF data and continues
examining segments until SOS/EOI, so an Adobe marker is found in every valid
position before the compressed data.

**Revised in phase 7.5:** the original note assumed that transform 0 means
direct CMYK. Adobe writers store four-component samples inverted whatever the
transform byte, and only the absence of an Adobe marker means straight
samples. The port now emits the inverting `/Decode` exactly when an Adobe
APP14 marker is present, which also matches its own decoder. Upstream PR #1980
proposes the same rule.

## A two-point open polygon paints nothing (`shape.dart`)

**How to reproduce:** create `Polygon` with two points and `close: false`, as
`PolyLineAnnotation` does for its visible content. The original returns before
painting whenever there are fewer than three points. With three or more points,
its loop also emits a line back to the first point immediately after moving
there, creating a redundant zero-length segment.

**Correction in the port:** closed polygons still require three points, while
open paths require two. Painting starts with the second point after `moveTo`, so
a two-point polyline emits exactly one visible segment.

## Roman numeral 400 contains a comma (`page_label.dart`)

**How to reproduce:** format page 400 with `PdfPageLabel.romanUpper`. The
original table associates 400 with `CD,`, producing `CD,` instead of the Roman
numeral `CD`.

**Correction in the port:** the table uses `CD`; a test directly covers page
400 and prevents the stray character from being reintroduced.

The same method added `subsequent` before adding one to the result, even though
it writes that value directly as `/St`. Consequently, `/St 5` appeared as 6 in
the widget context. The port subtracts the internal offset so the context text
matches the label displayed by the reader.


## MultiPage omits PageTheme.clip (`widgets/multi_page.dart`)

**Source observation:** at audit reference `b97c4a63dc`, `Page.paint` applies
`pageTheme.clip`, but `MultiPage._paintChild` calls `child.paint` directly
(with an optional orientation transform). The same path paints body fragments,
headers, footers and page layers without the margin clip.

**How to reproduce:** create a MultiPage with `PageTheme(clip: true)`, nonzero
margins, and a custom painter that draws outside its measured box. Its paint
can enter the margins despite clipping being enabled. Repeat with a page break
and asymmetric margins to check every physical page.

**Port correction:** route all page child painting through a shared
save/rectangle-clip/paint/restore scope using the resolved paper and margins.
The regression is in `test/page_clipping_formats.test.mjs`; the visual proof is
`examples/page-formats-phase-6.3.mjs`. This is a source-level finding; an upstream
Dart runtime reproduction has not been run in this change.


## PdfStream.putStream copies unused capacity (`pdf/format/stream.dart`)

**Source observation:** at audit reference `b97c4a63dc`, `putStream` passes the
source's complete `_stream` allocation to `putBytes`, rather than limiting it
to `_offset` written bytes.

**How to reproduce:** write two bytes into a default source stream and copy it
into another stream with `putStream`. The source allocation begins at 65,536
bytes, so the destination receives its unused capacity as trailing zero bytes.

**Port correction:** copy the source's `output()` (only the used prefix).
`test/synchronous_output.test.mjs` verifies both bytes and destination offset.
This was confirmed from the upstream source; no Dart runtime reproduction was
run in this change.


## RGB conversion edge cases (`pdf/color.dart`)

**Source observation:** at audit reference `b97c4a63dc`,
`PdfColorCmyk.fromRgb` uses a nested maximum expression which returns red
whenever red exceeds green, even if blue is larger. It also divides by zero
for black. `PdfColorHsl.fromRgb` only guards white before computing saturation;
black reaches `0 / 0` before clamping instead of the achromatic zero case.

**How to reproduce:** convert RGB `(0.5, 0.2, 0.8)` to CMYK: the maximum must
be 0.8 and black 0.2. Convert `(0, 0, 0)` to CMYK: expected components are
`(0, 0, 0, 1)`, all finite. Convert black to HSL: expected saturation is zero.

**Port correction:** use the maximum of all three RGB channels, special-case
zero maximum for CMYK and zero delta for HSL. Tests in
`test/color_values.test.mjs` cover these values and all hue sectors. The
existing private linear-progress shade translation also reached non-finite
components for black; it now delegates to the corrected public conversion.
A regression test renders a black `LinearProgressIndicator` and checks that
no non-finite number reaches the PDF. Upstream issues were confirmed by source
inspection; no Dart runtime reproduction was run in this change.


## Phase 7 audit: defects also reported in open upstream pull requests

**Context:** on 2026-11-10 the port was compared with upstream master
`277b367` and with the open pull requests filed after the previous audit,
chiefly the bug sweep [DavBfr/dart_pdf#1980](https://github.com/DavBfr/dart_pdf/pull/1980)
by Baghdady92, plus #1716, #2005, #2009, #2011, #2029 and issues #1989, #2000
and #2028. Unlike the entries above, most of these defects are already public
upstream; none of those pull requests was merged at the time. Rows marked †
were found while porting and are not described in those pull requests. Each
was checked against the port before it was fixed, and each fix has a
regression test that failed first. Defects that existed only in the port are recorded in CHANGELOG.md, not
here. "Upstream" below means master at `277b367`.

| Area | Upstream behaviour | Port correction (phase) |
|---|---|---|
| `format/num.dart` | `NaN`, `Infinity` and exponent notation reach the file; readers drop the whole operator | `0` for non-finite values, plain digits clamped to ±3.403e38 (7.1) |
| `format/name.dart` | escapes UTF-16 code units, so `/中` becomes `/#4e2d` | escapes UTF-8 bytes (7.1) |
| `format/string.dart` | text strings are written as Latin-1 literals, which PDFDocEncoding reads differently in 0x80–0xA0 | literals only for PDFDocEncoding-safe characters, UTF-16BE otherwise (7.1) |
| `obj/outline.dart` | a closed item's `/Count` counts its whole subtree | immediate children, per ISO 32000-1 Table 153 (7.1) |
| `obj/page_label.dart` | no `/Nums` entry for page 0 when the first label starts later | `0 << /S /D >>` is written first (7.1) |
| `document.dart` | widgets sharing a field name become separate root fields | one parent field with kids (7.1) |
| `font/ttf_parser.dart` | cmap format 0 is read two bytes early | read at subtable offset 6 (7.2) |
| `font/ttf_parser.dart` | Mac Roman and symbol subtables are merged as Unicode; symbol fonts miss their low-byte codes | subtables ranked, symbol low bytes aliased, Mac Roman only as an ASCII fallback (7.2) |
| `font/ttf_parser.dart` | format 4 ignores `idDelta` with a glyph-id array; glyph 0 counts as coverage | delta applied; glyph 0 skipped so fallback fonts are reached (7.2) |
| `font/ttf_parser.dart` | a malformed subtable throws; glyph bytes are not clamped to `loca` | bad subtables skipped; glyphs clamped (7.2) |
| `font/ttf_writer.dart` | subsets drop `cvt `, `fpgm`, `prep` and `gasp`, which the copied glyph programs call | hinting tables copied (7.2) |
| `font/ttf_writer.dart` | sfnt search fields written as 256/2/96; directory in layout order | spec values; records sorted by tag (7.2, #2009) |
| `obj/unicode_cmap.dart` | non-BMP code points written as five or six hex digits; one section over 100 entries | UTF-16BE surrogates; sections of at most 100 (7.2, #2011, #2029) |
| `font/type1_font.dart` | rune support follows Latin-1, so en dash, curly quotes and euro go to the fallback font (#1989) | WinAnsi coverage (7.2) |
| `widgets/text.dart` | format characters drawn; soft hyphen drawn and never breaks; no break at U+200B; NBSP breaks | ignorables stripped; soft hyphen and ZWSP are break opportunities; no-break spaces kept (7.3) |
| `widgets/text.dart` | CR/CRLF lines, letter spacing at span boundaries, whitespace-only text, hyphenated-word breaks | corrected (7.3) |
| `font/bidi_utils.dart` | isolated yeh aliased to U+FEEF; U+0649 missing (#2000) | U+064A→U+FEF1, U+0649→U+FEEF (7.3) |
| `widgets/text.dart` | an RTL fragment inside an LTR paragraph is neither shaped nor reordered | bidi runs whenever strong RTL characters are present (7.3) |
| `svg/use.dart` | a cyclic `<use>` overflows the stack | cycles skipped (7.4) |
| `svg/*` | undecodable `<image>`, malformed `transform`, unparsable functional colours and unresolved masks abort the document | the offending element or value is ignored (7.4) |
| `svg/painter.dart` | `style="display:none"` / `visibility:hidden` ignored | style flattened before the test (7.4) |
| `svg/parser.dart` | percentages divided by 100 instead of resolved | resolved against the viewport; root percentages leave sizing to the widget (7.4) |
| `svg/*` | nested `<svg>` viewport, `<symbol viewBox>`, `<use width/height>` and `preserveAspectRatio` ignored | one viewport-fit helper (7.4) |
| `svg/text.dart` | tspan runs drawn out of order, anchors per run by ink width | runs in document order on one pen; chunk anchors by advance (7.4) |
| `svg/*` | zero stroke width paints a hairline; `transparent` and colour alpha ignored; `url(#id) fallback` unmatched | corrected (7.4) |
| `svg/color.dart` † | `hsl()` hue divided by 255 instead of 360, which #1980 keeps | divided by 360 (7.4) |
| `svg/operation.dart` † | clip-path applied before the element's own transform, which #1980 keeps | applied in the element's user space (7.4) |
| `pdf/graphics.dart` | a colour's alpha is discarded by fill and stroke | constant alpha through `/ExtGState`, with a `colorAlpha: false` opt-out (7.5) |
| `pdf/graphics.dart` | `setGraphicState` replaces the opacity, so nested `Opacity` does not compose | opacities multiply (7.5) |
| `pdf/color.dart` | `isLight` and `isDark` are swapped | corrected (7.5) |
| `pdf/graphics.dart` | `bezierArc` keeps a radius ratio of 1 after scaling the radii, so the arc misses its end point | ratio 0 (7.5) |
| `pdf/graphics.dart` † | `bezierArc` with a rotation is solved at the origin and never rotated back, which #1980 keeps | solved in the ellipse's axes and rotated (7.5) |
| `widgets/table.dart` | MultiPage tables re-measure widths and all remaining rows on every page | widths carried in the span state; rows stop at the page end (7.6) |
| `widgets/table.dart` | an overflowing table scales every column, splitting words (#1716) | min-content floors per column (7.6) |
| `widgets/basic.dart` | `Transform.rotateBox` lays its child out against unrotated constraints | quarter turns swap constraints; overflow rescales (7.6) |
| `chart/grid_axis.dart` | a vertical axis reserves its labels' width where it needs their height | height (7.6) |
| `widgets/stack.dart`, `progress.dart` | unbounded axes write `Infinity` | bounded axes only; progress fallbacks (7.6) |
| `chart/pie_chart.dart` | a NaN value writes `NaN` coordinates | rejected with a `RangeError` (7.6) |
| `widgets/grid_view.dart` | a cell taller than a single page draws nothing | one overflowing run (7.6) |
| `widgets/stack.dart` † | `PositionedDirectional` sets its edges only inside its own layout, after `Stack` has read them, so the first layout sees null edges and later ones reuse stale values | edges resolved from the ambient direction before layout (6.9) |
| `widgets/table_helper.dart` † | a directional cell alignment resolves as left-to-right when no context is passed | resolved by the cell text at layout as `start`/`end` (6.9) |
| `svg/gradient.dart` † | a gradient `href` cycle recurses until the stack overflows, which #1980 keeps | the cycle is treated as unresolved (7.7) |
| `svg/parser.dart` | a malformed number such as `opacity="abc"` throws out of `save()` | the attribute counts as absent (7.7) |
| `widgets/progress.dart` | the default track is a `shade` of the value colour, which drops alpha, so a translucent bar gets an opaque track | the track keeps the value colour's alpha (7.7) |
| `obj/pdfa/pdfa_attached_files.dart` | `/Params /Size` is the UTF-16 code-unit count of a UTF-8 payload, so an accented Factur-X file declares fewer bytes than it holds | the byte count of the encoded payload (6.11) |
| `obj/pdfa/pdfa_attached_files.dart` | the `/EmbeddedFiles` name tree is in caller order, and its keys, `/F` and `/UF` are written unescaped and truncated to one byte per code unit | sorted by the bytes written; every key and name through the text-string writer (6.11) |
| `obj/pdfa/pdfa_rdf.dart` | caller values are interpolated into the XMP template, so markup rewrites the packet, the `pdfaid` claim included | values escaped, characters XML forbids dropped (6.11) |
| `obj/pdfa/pdfa_rdf.dart` | every unset field writes the literal `null` | unset elements, and empty descriptions, omitted (6.11) |
| `obj/pdfa/pdfa_rdf.dart` † | `/Info /Producer` always carries the library URL and `pdf:Producer` never does, so the two disagree, which PDF/A forbids | both written from one `/Producer` string (6.11) |
| `obj/pdfa/pdfa_rdf.dart` † | `xmp:CreateDate` and `/Info /CreationDate` come from two clock reads, so they can differ by a second, and always differ when `creationDate` is passed | one instant for both, plus `/ModDate` and `xmp:ModifyDate` (6.11) |
| `obj/pdfa/pdfa_attached_files.dart` † | `/ModDate` is the local wall-clock time labelled `+00'00'`, so it is off by the zone offset | UTC (6.11) |
| `obj/pdfa/pdfa_color_profile.dart` † | `/N` is always 3 and every profile is named `sRGB2014.icc`, so a CMYK profile is declared with three components | `/N` and the colour space read from the ICC header, which is validated; the caller's output condition (6.11) |
| `obj/pdfa/pdfa_facturx_rdf.dart` † | the file name, version and level are interpolated unescaped | escaped (6.11) |

Upstream behaviour was confirmed by source inspection at `277b367` and, where
the pull request includes them, by its tests. No Dart runtime reproduction was
run.


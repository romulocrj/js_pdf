# Roadmap

Ordered plan for the port. Current coverage is in
[PORTING-STATUS.md](PORTING-STATUS.md); conventions are in
[ARCHITECTURE.md](ARCHITECTURE.md).

**Last updated:** 2026-08-05

## Current position

The MVP is restructured into a module tree that mirrors `dart_pdf`, written in
TypeScript, with the runtime contract and attribution enforced by
`npm run check`. Output is a valid PDF written through a real indirect-object
model, with per-page resource dictionaries and **embedded TrueType fonts** —
subset, written as Type0/CIDFontType2 composites, and selected through a theme.
Beyond text, `SvgImage` exposes the SVG painter with fitting, alignment,
clipping and PDF shading-pattern gradients, and tables lay out fixed, intrinsic
and flexible tracks across as many pages as their rows require. Raster images
are still absent.

**Phases 0, 1 and 2 are complete.** The foundations are in place, the WinAnsi
ceiling is gone and the vector pipeline is public; phase 3 (layout) is what the
examples now wait on.

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

**Phase 0.3 — resource dictionary — landed 2026-08-05.** `PdfGraphicStream`
collects `/Font`, `/XObject` and `/ExtGState` per page; `PdfCanvas` allocates
`/F1`, `/F2`, … as it writes, and `PdfDocument` binds those names to one font
object per distinct font. The single-font limit is gone.

**Phase 3.3 — basic widgets — completed 2026-08-05.** Its foundation landed
early: `Padding`, `Align`, `Center`, `SizedBox`, `Divider`, `EdgeInsets`,
`Alignment` and `StatelessWidget`. Once graphics and `/ExtGState` were ready,
the phase closed with `Transform`, `Opacity`, `FittedBox`, `AspectRatio`,
`FullPage`, builder/custom-paint primitives, `LimitedBox` and `VerticalDivider`.
The two widgets that fundamentally need minimum constraints move into 3.4. The
phase reduced the example missing-API total first from 147 to 124, then 84 to
75.

**Mixed page orientations — landed 2026-08-05.** One document can hold pages in
different orientations *and* different paper sizes. `orientation` is a per-section
option on `Page` and `MultiPage` as well as on `PageTheme`, and every physical
page is written with its own `/MediaBox`. Requested by the user, who could not
get this to work in dart_pdf. See the dedicated section below.

**Phase 2.4 — SVG transforms and units — landed 2026-08-05.**
`src/svg/transform.ts` reads the `transform` attribute and `src/svg/parser.ts`
the numeric half of upstream's parser — `SvgNumeric` with its length units,
`splitDoubles`, `convertStyle`.

**Phase 2.5 — SVG painter, shapes and groups — landed 2026-08-05.**
`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` and `path` paint with
inherited fill/stroke state; groups scope transforms and opacity; `<use>`
resolves both `href` forms and symbols. Every SVG asset used by the examples
now produces operators, although no public widget drives the painter until 2.7.

**Phase 2.6 — SVG clipping — landed 2026-08-05.** Referenced clip paths emit
`W n` or `W* n` in the target operation's saved graphics scope, including
`objectBoundingBox` units and nesting. Soft masks remain explicitly coupled to
phase 4's form XObjects and `/SMask`; upstream cannot create one without them.

**Phase 2.7 — SVG parser and widget — landed 2026-08-05.** Public `SvgImage`
sizes from explicit or intrinsic dimensions, supports every `BoxFit`, aligns a
cropped viewBox, clips its box and installs the y-down-to-PDF matrix. It removed
`SvgImage` from six example dependency lists; the total fell from 94 to 88.

**Phase 2.8 — SVG gradients — landed 2026-08-05.** Linear and radial paint
servers now serialize as PDF axial/radial shadings, with type-2 interpolation
or type-3 stitching for multiple stops. Units, transforms, inherited
references, fill/stroke selection and the real invoice/document assets are
covered end to end.

**Phase 3.1 — tables — landed 2026-08-05.** `Table` computes shared fixed,
flex, fraction or intrinsic column tracks, aligns cells vertically and paints
row/cell decoration plus exterior/interior rules. `TableHelper.fromTextArray`
adds theme-aware text, padding, formatting callbacks and repeatable headers. It
removed `TableHelper` from four example gates; the missing total fell 88 → 84.

**Phase 3.2 — spanning widgets — landed 2026-08-05.** `SpanningWidget` returns
an immutable continuation snapshot with each page fragment. `MultiPage` drives
those fragments inside the space left by its header/footer, and `Table` resumes
at the next unpainted row while repeating marked headers.

**Phase 2.3 — XML reader — landed 2026-08-05.** `src/svg/xml.ts` reads
elements, attributes, text, CDATA, comments, entities and namespaces. Every SVG
in `examples/assets/` and the inline markup in `server-assets.json` parse.

**Phase 2.2 — SVG path data parser — landed 2026-08-05.** `src/svg/path.ts`
reads the whole `d` grammar and reduces it to move / line / cubic / close, plus
`drawShape` and `shapeBoundingBox`. Every `d` attribute in `examples/assets/`
parses.

**Phase 2.1 — graphics path operators — landed 2026-08-05.** The canvas grew
the whole path surface — segments, ellipses, rounded rectangles, elliptical arcs,
both fill rules, clipping, the CTM, cap/join/miter/dash and `/ExtGState` — plus
`src/pdf/matrix.ts` and `src/pdf/rect.ts`. No example advances directly, but the
four widgets phase 3.3 left open and all of phase 2 were waiting on it.

**Phase 1 — TTF fonts — landed 2026-08-05.** 1.1 reads a font, 1.2 subsets it,
1.3 embeds it, 1.4 selects it. Portuguese, Japanese and Arabic *characters* all
draw from an embedded font with the font's own advance widths, and the
`/ToUnicode` CMap round-trips them back to the source string, so selection and
search still work. The missing-API total across the seven examples fell from 124
to 94: `Font`, `TextStyle`, `ThemeData`, `PageTheme`, `Theme` and
`DefaultTextStyle` are gone from every list.

## Next step

> **Phase 3.4 — full flex and constraints.** Replace the max-only constraint
> protocol with real `BoxConstraints`, then port flex allocation, alignment,
> `Expanded`, `Flexible`, `FlexFit`, `mainAxisSize`, `ConstrainedBox` and
> `OverflowBox`.

Tables paginate and the basic composition set is complete. The next blockers
are minimum constraints and the full flex algorithm shared by five examples.

---

## Mixed page orientations ✅

**One document, several orientations and paper sizes.** An A4 portrait cover, an
A4 landscape table and a Letter appendix are three sections of one `save()`:

```js
createPdf({}, api => [
  new api.Page({ pageFormat: api.PageFormat.A4, build: () => cover }),
  new api.MultiPage({
    pageFormat: api.PageFormat.A4,
    orientation: 'landscape',       // this section only
    build: () => wideRows
  }),
  new api.Page({ pageFormat: api.PageFormat.LETTER, build: () => appendix })
]);
```

`orientation` takes `'natural'` (the format as declared), `'portrait'` or
`'landscape'`, and is accepted by `Page`, `MultiPage` and `PageTheme` alike.

Why this works, and what to be careful of if it is ever refactored:

- **Nothing in the pipeline holds a document-wide page size.** A section renders
  to `SerializedPage[]`, each carrying its own `format`; `PdfDocument.addPage`
  hands that format to a fresh `PdfPage`, which writes its own `/MediaBox`. A
  change that hoisted the format up to `PdfDocument` would break this silently —
  the file would still open, at the wrong size.
- **The rotation is real, not a `/MediaBox` edit.** `RenderContext.pageFormat`
  reports the resolved dimensions, so a widget sizing itself against the page
  follows the turn, and margins rotate with the paper (a `left` margin on
  portrait becomes the `top` margin on landscape).
- **`PageTheme.mustRotate` swaps the paper's dimensions rather than rotating the
  content through the CTM**, which is what upstream does. The page a reader sees
  is the same. Now that phase 2.1 has the `cm` operator the other approach is
  possible, but swapping is the better one *for this feature*: `/MediaBox` then
  states the true page size, which is what a printer's imposition step reads.

**Test:** `test/page_orientation.test.mjs`, nine cases.

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

Completed implementation phases also keep a synchronous, host-free proof
generator named `examples/*-phase-X.Y.mjs`. The module returns PDF bytes without
performing I/O, so the same file can be imported by the local runner and by
`test/v8/run.sh`; the latter writes its copy to `test/v8/out/` and proves the
shipped bundle works under bare ClearScript V8.

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
examples. `hello-world` kept generating throughout: its metrics-dependent
positions changed in 0.1 to match the AFM tables, 0.2 left every byte alone, and
0.3 renumbered its objects without changing its length (740 bytes).

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

### 0.3 Resource dictionary ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/obj/graphic_stream.dart`, `page.dart`
- **Into:** `src/pdf/obj/graphic_stream.ts`
- Per-page resource registration: `/Font`, `/XObject`, `/ExtGState`, with
  automatic `/F1`, `/F2`, … naming. Ends the hardcoded single-font `/Resources`
  dict.
- **Test:** a page using two fonts emits two `/Font` entries and the right `Tf`
  operators.

Landed as `PdfGraphicStream`, which `PdfPage` extends. Names are allocated by
`PdfCanvas.addFont` in first-use order as the content stream is written, and
`PdfDocument.addPage` binds each one to a font object created on first use, so a
font shared by twenty pages is written once. A page that drew no text gets no
`/Resources` key at all.

Divergences worth knowing, each noted in the file that makes it:

- Upstream is a `mixin ... on PdfObject<PdfDict>` so `PdfGraphicXObject` can
  take it too. TypeScript has no mixin that survives `strict` without an `any`,
  so this is a base class; when form XObjects land in phase 4, lift
  `resources()` into a free function rather than duplicating it.
- Names are **page-local**, not `/F$objser` as upstream derives them. A canvas
  renders to operators before any document exists, so the serial is not
  available at the point the name is written. Consequence: two pages using the
  same font both call it `/F1` and share one font object.
- No `/ProcSet`. Upstream emits it for readers predating PDF 1.4, gated on an
  `altered` flag the port does not have.
- `/Pattern` and `/ExtGState` entries are direct, per-page dictionaries rather
  than pointing at document-wide objects. Standalone `/Shading` resources are
  still absent; SVG gradients nest their shading inside a pattern.

Two consequences outside `obj/`. `Text` and `Vector`'s `text()` accept a `font`,
the minimal ancestor of upstream's `TextStyle.font` — a per-page resource dict is
pointless if nothing can ask for a second font, and phase 1.4 folds the option
into a real `TextStyle`. `Vector`'s text also stopped encoding with the library
default while the page's one `/Font` entry named the document's font; the two
disagreed for any non-default font.

---

## Phase 1 — TTF fonts

**The most technically important subsystem.** It removed the Latin-1 ceiling:
without it, any text outside WinAnsi was silently replaced with `?`.

Depended on phases 0.1–0.3.

**Example gate:** 1.4 was the single biggest unblock in the roadmap — *every*
failing example needs `Font`, `TextStyle` and `ThemeData`. None generates as a
result, but all seven moved: 124 missing APIs down to 94.

### 1.1 TTF parser ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/font/ttf_parser.dart` (693 lines)
- **Into:** `src/pdf/font/ttf_parser.ts`
- Table directory; `head`, `hhea`, `hmtx`, `maxp`, `name`, `post`, `OS/2`;
  `cmap` formats 4, 6 and 12; `loca`/`glyf` bounds; optional `CFF ` detection.
- Read from a `Uint8Array` with `DataView` — no host buffer API.
- **Test:** parse the fixtures already in `examples/assets/` (`OpenSans-Regular`,
  `Roboto-Regular`); assert unitsPerEm, a known advance width, and a known
  codepoint→glyph mapping.

Landed with `cmap` format 0 as well, per-glyph `PdfFontMetrics` normalized to em
units, and `readGlyph` walking both simple and composite glyph programs. The
parser is **internal** — nothing is exported from `src/index.ts` until 1.3 has
something to embed, the same way the object model stayed internal through 0.2.

Divergences, each noted in the file:

- Upstream asserts its way through malformed input, which a Dart release build
  compiles out. The port throws: a font failing these checks cannot be subset or
  embedded either, so parse time is where the error is cheapest to read.
- No `CBLC`/`CBDT` bitmap glyphs. Colour emoji is a separate feature from the
  outline path phase 1 needs, with its own metrics shape.
- No bidi coupling. Upstream's format 4 reader also maps each Arabic codepoint's
  isolated form to the same glyph; that belongs with the unported
  `font/arabic.dart` and `bidi_utils.dart`.

**Test coverage:** all eleven fonts in `examples/assets/` parse; `loca` offsets
are monotonic and in bounds; every glyph in `OpenSans-Regular` and
`Roboto-Regular` reads without overrunning its `loca` entry and refers only to
glyphs inside the font; `MaterialIcons` resolves Private Use Area codepoints,
which is what phase 5.4 needs.

### 1.2 TTF subsetting writer ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/font/ttf_writer.dart` (399 lines)
- **Into:** `src/pdf/font/ttf_writer.ts`
- Build a subset containing only the used glyphs plus their composite
  dependencies; rebuild `loca`, `glyf`, `hmtx`, `cmap`; recompute checksums.
- **Test:** the subset re-parses with the phase-1.1 parser and retains the
  requested glyphs.

Landed as `TtfWriter.withChars(codePoints)`. All eleven fonts in
`examples/assets/` subset and re-parse; `OpenSans-Regular` goes from 130 kB to
under 4 kB for a typical page of text. The whole-file `checkSumAdjustment` is
asserted, not just assumed.

Divergences, each noted in the file:

- **The CID-to-glyph identity is kept.** Glyph `i` of the subset is the glyph for
  code point `i` of the input, always — that identity is what lets 1.3 declare
  `/CIDToGIDMap /Identity`. Upstream breaks it twice: it drops a code point the
  font has no glyph for, and it substitutes an arbitrary glyph when two code
  points resolve to one. Either shifts every later CID onto the wrong glyph.
  `MaterialIcons.ttf`, which phase 5.4 needs, has no space glyph and hits the
  first case. The port emits a blank placeholder instead.
- Upstream's compound-glyph rewriter advances 6 or 8 bytes per component and
  never skips the optional scale or 2×2 transform, though its own reader does.
  The port skips them; otherwise a composite with a scaled component has its
  later component indices rewritten at the wrong offsets.
- A font without `OS/2` or `post` is written anyway rather than throwing.
- Glyph traversal is guarded against a composite that reaches itself.
- The sfnt header's `searchRange`/`entrySelector`/`rangeShift` are upstream's
  values, which do not follow the specified formulas. They are binary-search
  hints no reader depends on, and matching upstream keeps the two
  implementations byte-comparable.

### 1.3 Embedding ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/obj/ttffont.dart`, `unicode_cmap.dart`,
  `font_descriptor.dart`
- **Into:** `src/pdf/obj/ttf_font.ts`, `src/pdf/obj/unicode_cmap.ts`,
  `src/pdf/obj/font_descriptor.ts`
- Type0/CIDFontType2 composite font, `/Identity-H` encoding, `FontDescriptor`
  with the real bbox and flags, `FontFile2` stream, and a `/ToUnicode` CMap so
  the PDF stays searchable and copyable.
- `format/string.ts` gained `pdfHexString`: with a TTF font, text is emitted as
  `<glyph indices>` rather than WinAnsi bytes.
- **Test:** a document with accented and CJK text; the `/ToUnicode` stream
  round-trips back to the source string.

`PdfFont.resourceDict` grew a registry argument, which is the change that made
this possible: a font can now create the objects its dictionary references.
`PdfTtfFont` hands out CIDs from `encodeText` as pages are drawn and builds its
subset, descriptor, widths array and CMap afterwards, in `resourceDict`. That
ordering works because this port renders every page to operators before any
document exists; upstream defers the same work to `prepare()`, since its fonts
are indirect objects from birth.

Divergences, each noted in the file:

- No simple `/TrueType` branch. Upstream falls back to a WinAnsi single-byte
  font, embedding the file whole, when the sfnt version is not `0x00010000`.
  That branch reintroduces the ceiling phase 1 exists to remove, so the port
  rejects such a font at construction instead — as it does a `CFF `-flavoured
  OpenType, which has no `glyf`/`loca` to subset.
- No Arabic or bidi coupling: upstream zeroes a diacritic's advance width when
  its shaping options are on, and `font/arabic.dart` is unported.
- `/ItalicAngle`, `/CapHeight` and `/StemV` are upstream's constants rather than
  measurements. They are required entries no reader consults when the program is
  embedded.

### 1.4 Font selection and theming ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/widgets/font.dart`, `theme.dart`, `text_style.dart`,
  `page_theme.dart`
- **Into:** `src/widgets/font.ts`, `src/widgets/theme.ts`,
  `src/widgets/text_style.ts`, `src/widgets/page_theme.ts`
- `Font`, `TextStyle`, `Theme`, `ThemeData`, `DefaultTextStyle`, `PageTheme`.
- **Test:** nested styles resolve to the expected font per text run.
- **Example gate:** unblocked `Font`/`TextStyle`/`ThemeData`/`PageTheme` for
  `calendar`, `certificate`, `document`, `invoice`, `report`, `resume`,
  `server` — all seven.

Landed with the four font slots (`fontNormal`/`fontBold`/`fontItalic`/
`fontBoldItalic`) that make `fontWeight` and `fontStyle` work, `TextStyle.merge`
with upstream's `inherit` rule, and the full `ThemeData` style set.

The port has no `InheritedWidget` and no `Context.dependsOn`. **Inherited values
ride on the render context instead:** `RenderContext` gained a `theme` field, and
`Theme` and `DefaultTextStyle` lay out and paint their child with a context
carrying a different one. That is the same scoping with none of the machinery,
and `Theme.of(context)` is a field read.

Other divergences worth knowing:

- `TextStyle.defaultStyle()` uses `height: 1.2`, not upstream's `1`. The port has
  used 1.2 since before styles existed, and changing it would move every line of
  every existing document. `letterSpacing` and `wordSpacing` default to `0`
  rather than upstream's `0`/`1`, and are absolute PDF units — the `Tc` and `Tw`
  operands, which `PdfCanvas.text` now emits when they are non-zero.
- `PageTheme.mustRotate` swaps the paper's dimensions rather than rotating the
  content through the CTM, which needs **2.1**. The page a reader sees is the
  same; `/MediaBox` reports the rotated size.
- `fontFallback` is stored and merged but never consulted, and `decoration` is
  stored but not painted. Both need the real line breaker in **3.7**.
- `justify` is accepted by `TextAlign` and painted as `left`, for the same
  reason.
- No `iconTheme` on `ThemeData` — `IconThemeData` belongs with `Icon` in **5.4**.
- No `DefaultTextStyle.merge`, which upstream builds out of `Builder` — one of
  the widgets **3.3** left open.
- `Font` is a pure declaration; the built `PdfFont` is cached on the `Document`
  rather than on the declaration, because an embedded font accumulates the code
  points it has encoded and two documents must not share a subset.
- `DocumentOptions.font` still works, as shorthand for a one-face theme.
- `pdf/graphics.ts`'s exported `TextStyle` was renamed `CanvasTextStyle`, since
  `TextStyle` is now the widget-level value type.

**Done when:** a document renders Portuguese, Japanese and Arabic *characters*
from an embedded TTF, with correct advance widths and working text selection.
(Arabic *shaping* is separate — `font/arabic.dart` and `bidi_utils.dart`, later.)

✅ **Done.** A code point the chosen font has no glyph for draws blank but still
gets its own CID and its own `/ToUnicode` entry, so the text remains selectable
and copyable either way; none of the fonts in `examples/assets/` carries CJK or
Arabic outlines, which is a corpus limit rather than a port limit.

---

## Phase 2 — SVG

Depends on phase 2.1 landing first; the rest can proceed in any order once it
does. Phase 1 is complete, so nothing here is waiting on fonts.

**Example gate:** `SvgImage` (2.7) is needed by six of the seven remaining
examples. `report` is the exception, which makes it the useful probe while this
phase is in flight.

### 2.1 Graphics path operators ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/pdf/graphics.dart` (path and transform sections),
  `pdf/lib/src/pdf/graphic_state.dart`, `pdf/lib/src/pdf/rect.dart`,
  `pdf/lib/src/pdf/point.dart`
- **Into:** `src/pdf/graphics.ts`, `src/pdf/graphic_state.ts`,
  `src/pdf/matrix.ts`, `src/pdf/rect.ts`
- `moveTo`/`lineTo`/`curveTo`/`close`, fill rules (`f`/`f*`/`B`/`B*`), the CTM
  (`cm`), line join/cap/dash, and clipping (`W`/`W*`/`n`). Prerequisite for
  every remaining item in this phase.
- **Test:** assert on the emitted operator sequence for a known path.

Landed with `drawRect`/`drawRRect`/`drawEllipse`, the SVG-compatible
`bezierArc`, `setMiterLimit`, `setLineDashPattern`, `setFillColor`/
`setStrokeColor`, and `setGraphicState`. 23 tests assert on operator sequences.

Divergences, each noted in the file that makes it:

- **Two coordinate systems now live in `graphics.ts`.** The path API is a
  literal port and takes PDF user space (y up); the older shape helpers
  (`fillRect`, `line`, `circle`, `text`) take the widget layer's y-down
  coordinates and flip them. `toPdfY` and `flipMatrix` are the bridge, and
  `flipMatrix` is what a widget setting a `cm` has to conjugate with — a
  transform written in y-down coordinates rotates and translates the wrong way
  otherwise.
- **No `Matrix4`.** Upstream takes one from the `vector_math` package and throws
  away ten of its sixteen cells at the point it writes `cm`. `src/pdf/matrix.ts`
  carries the six PDF stores. Nothing the port transforms is three-dimensional.
- **`PdfLineCap`, `PdfLineJoin` and `PdfBlendMode` are string unions**, not
  `enum`s — `src/` has to stay erasable TypeScript — with the operand looked up
  in a frozen table.
- **`/ExtGState` entries are inline dictionaries registered per page**, keyed by
  value so a page drawing fifty half-transparent boxes writes one dictionary.
  Upstream keeps a single `PdfGraphicStates` indirect object for the whole
  document; the port cannot, for the same reason `/F1` is page-local — a canvas
  is rendered to operators before any document exists.
- `restoreContext` with nothing saved writes no `Q`, where upstream's is also a
  no-op but leaves the buffer's indent counter shifted.
- Dart's `%` on doubles returns a non-negative remainder and JavaScript's does
  not, so `bezierArc` normalizes the sweep angle's sign before correcting it.
  Missing this draws the complement of the requested arc.
- `setMiterLimit` throws below 1, where upstream asserts — which a Dart release
  build compiles out.

### 2.2 Path data parser ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/svg/path.dart` (320 lines)
- **Into:** `src/svg/path.ts`
- Full `d` grammar: `M m L l H h V v C c S s Q q T t A a Z z`, absolute and
  relative, implicit repeated commands, compact number syntax. Elliptical arcs
  converted to cubic Béziers.
- **Test:** a table of path strings → expected operator sequences, including the
  arc-conversion edge cases (zero radii, large-arc/sweep flag combinations).

Landed as `writeSvgPathDataToPath`, `drawShape` and `shapeBoundingBox`, with 24
tests. The module is **internal** — nothing is exported from `src/index.ts`
until 2.7 has an `SvgImage` to export, the same way the TTF parser stayed
internal through 1.1.

Divergences, each noted in the file:

- **Upstream does not implement this.** `svg/path.dart` holds the shape-to-`d`
  factories (a `<rect>` written out as a path, which is **2.5** here) and hands
  the grammar to the `path_parsing` package — itself a translation of Chromium's
  SVG path parser. The port has no runtime dependencies, so the grammar is
  translated here, keeping `path_parsing`'s two-stage shape (a string source
  that yields segments, a normalizer that turns them absolute and emits them) so
  the two stay comparable when a path renders differently.
- **The command letter is the command.** `path_parsing` has an
  `SvgPathSegType` enum and a letter-to-enum table; `enum` is not erasable
  TypeScript, and the letter carries the same information.
- `parseSegments` returns an array, not a generator. A `d` string is bounded and
  the port is synchronous, so nothing is gained by streaming.
- `drawShape` and `shapeBoundingBox` are free functions here, not `PdfCanvas`
  methods as in `graphics.dart`. The port's import direction is one-way: `svg/`
  may reach into `pdf/`, never the reverse. Upstream can put them on the canvas
  because `path_parsing` is an external package to it.
- Upstream throws `StateError` for every malformed input; the port distinguishes
  `SyntaxError` (a grammar violation) from `RangeError` (a number out of range),
  so a caller can tell a broken file from an unrepresentable one.

### 2.3 XML reader ✅ *(landed 2026-08-05)*

- **Into:** `src/svg/xml.ts`
- A minimal, dependency-free XML parser: elements, attributes, text, CDATA,
  comments, entities, namespaces. No `DOMParser` — it does not exist in
  ClearScript.
- **Test:** malformed input fails with a position; entity and namespace handling.

Landed with 22 tests. There is no upstream file to translate — dart_pdf calls
`XmlDocument.parse` from the `xml` package — so what is reproduced is the
*interface* `svg/parser.dart` and `widgets/svg.dart` consume, under the Dart
names, so those two modules read the same in both languages:
`XmlDocument.parse`, `rootElement`, `getAttribute(name, namespace)`,
`setAttribute`, `children`, `descendants`, `name.local`.

Deliberately out of scope, each a silent no-op rather than an error because an
SVG exporter may emit them and none changes what is drawn:

- The internal DTD subset is skipped, so a custom `<!ENTITY>` is not expanded;
  the reference survives into the text rather than the text being dropped.
- No attribute-value normalization: a newline inside an attribute stays one.
  Every attribute the port reads is split on whitespace anyway.
- No DTD validation, no XInclude, no `xml:space`.

The tree is **mutable by design** — `setAttribute` exists because upstream's
`SvgParser.convertStyle` flattens a `style` attribute into real attributes on
the element it found it on.

### 2.4 Transforms and viewBox ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/svg/transform.dart`, the numeric half of
  `pdf/lib/src/svg/parser.dart`
- **Into:** `src/svg/transform.ts`, `src/svg/parser.ts`
- `matrix translate scale rotate skewX skewY`, composed left-to-right, plus
  `viewBox` + `preserveAspectRatio` → the outer CTM.
- **Test:** composed transform matrices; each `preserveAspectRatio` alignment.

Landed with 19 tests. `src/svg/parser.ts` carries the pieces transforms need
now — `SvgNumeric` and its units (`px pt em cm mm in %`), `splitDoubles`,
`splitNumeric`, `getDouble`, `getNumeric` and `convertStyle`; the `SvgParser`
class itself, with the viewBox and `findById`, lands with the rest of the file
in 2.7. `PageUnit` was added to `src/pdf/page_format.ts` for the physical units.

Divergences:

- **`SvgTransform.none` is distinct from the identity matrix.** Upstream writes
  no `cm` operator at all for an element with no `transform` attribute, and the
  emitted content stream stays comparable only if the port does the same.
- **No `preserveAspectRatio`, in either implementation.** Upstream fits the
  viewBox into the widget's box with `BoxFit` and `Alignment`, which covers
  every alignment the attribute can express but is stated by the caller instead
  of read from the document. That fitting is **2.7**.
- **`sizeValue` returns `value / 100` for a percentage**, which is upstream's
  behaviour and wrong in the general case — a percentage is relative to the
  viewport. Kept, because changing it would silently move every SVG that has
  one; fixing it needs the viewport threaded down to every attribute lookup.
- `convertStyle` lets a `style` declaration **overwrite** the presentation
  attribute of the same name, as CSS specificity requires and as upstream does.
- A malformed number throws `SyntaxError` where upstream's `double.parse`
  throws `FormatException`; an unrecognized `transform()` function is ignored
  rather than fatal, matching upstream's switch with no default.

### 2.5 Painter, shapes, groups ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/svg/painter.dart`, `operation.dart`, `shape` handling,
  `group.dart`, `use.dart`, `symbol.dart`, `brush.dart`, `color.dart`,
  `colors.dart`
- **Into:** `src/svg/painter.ts`, `src/svg/brush.ts`, `src/svg/color.ts`
- `rect circle ellipse line polyline polygon path`; `<g>` with inherited
  presentation attributes; `<use>`/`<symbol>` resolution; fill/stroke
  resolution including `currentColor`, `none`, opacity and stroke properties.
- **Test:** per-element operator assertions; attribute inheritance through
  nested groups.

Landed with the full named-colour table, hex/RGB/RGBA/HSL and `currentColor`,
all seven basic shape elements, inherited presentation state, scoped transforms,
opacity/blend modes, visibility, groups, symbols and both `href` spellings.
Ninety-four SVG tests cover the individual operator streams and paint every
asset in the examples corpus. The document-level half of `SvgParser` moved here
from 2.7 because `<use>` needs `findById`; only the widget remains there.

### 2.6 Clipping and masks ✅ *(clipping landed 2026-08-05)*

- **Ports:** `pdf/lib/src/svg/clip_path.dart`, `mask_path.dart`
- **Into:** `src/svg/clip_path.ts`
- `clipPath` via `W n`; `clipPathUnits`; nested clips.
- **Test:** clip operators appear in the right `q`/`Q` scope.

Landed with referenced paths, even-odd clipping, `userSpaceOnUse`,
`objectBoundingBox`, missing-reference fallback and nested target scopes.
Four operator-level tests bring the SVG suite to 98 tests. `mask_path.dart` is
deferred intact to phase 4: its first executable line constructs a form XObject
and its result is a `/SMask` graphic state, neither of which exists earlier.

### 2.7 Parser and widget ✅ *(landed 2026-08-05)*

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

Landed as a public `SvgImage` in named exports, `js_pdf` and the `createPdf`
callback API. Nine tests cover pure layout data, intrinsic/explicit sizes, all
seven fits, crop alignment, clipping, the coordinate-flip matrix, colour
filtering, malformed input and an end-to-end serialized PDF. The six example
gates no longer report `SvgImage`; none generates yet because each still has
later layout dependencies.

### 2.8 Gradients ✅ *(landed 2026-08-05)*

- **Ports:** `pdf/lib/src/svg/gradient.dart`, `pdf/lib/src/pdf/obj/shading.dart`,
  `pattern.dart`, `function.dart`
- Linear and radial gradients as PDF shading patterns. Defer until 2.1–2.7 are
  solid.

Landed with direct PDF shading-pattern dictionaries, axial and radial
coordinates, type-2 interpolation for a two-colour ramp and type-3 stitching
for longer stop lists. `gradientUnits`, `gradientTransform`, object bounding
boxes, `href`/namespaced inheritance, fill, stroke, group inheritance and
colour filtering all work. Ten tests bring the SVG suite to 117 and render both
`invoice.svg` and `document.svg` through the complete serializer.
`examples/svg-gradients-phase-2.8.mjs` is the retained visual/V8 proof.

Two fidelity limits stay explicit in `src/svg/gradient.ts`. Different opacity
at each stop requires the luminosity soft mask coupled to phase 4's form
XObjects; uniform opacity works now. `repeat` and `reflect` currently extend the
edge colours, as upstream's current shading output does; a true repeated ramp
needs a tiling pattern. The port uses direct type-2/type-3 dictionaries instead
of upstream's indirect sampled streams because pages are painted before a
`PdfDocument` exists; the resulting RGB interpolation is equivalent and keeps
pattern resources page-local.

**Done when:** a real-world SVG logo and a chart exported from a drawing tool
render correctly, including transforms, viewBox, groups and clipping.

---

## Phase 3 — layout completeness

Once text is real, the widget gaps become the limiting factor. This phase
produces the first two fully generated examples.

### 3.1 Table ✅ *(landed 2026-08-05)*

- **Ports:** `widgets/table.dart`, `table_helper.dart`
- Column widths (fixed / flex / intrinsic), cell alignment, borders, repeating
  headers.
- **Example gate:** `TableHelper` for `document`, `invoice`, `report`, `server`.

Landed as a pure `TableLayoutData` hand-off: column and row measurements, cell
offsets and allocated tracks all travel from `layout()` to `paint()` without
being cached on the widget. Fixed, flex, intrinsic and fractional column-width
strategies work with `min`/`max` table sizing; top, middle, bottom and full cell
alignment remain distinct. `TableBorder` paints each exterior and interior
side in widget coordinates, while structural decorations keep the helper
compatible with the `BoxDecoration`/`Border` objects arriving in 3.5.

`TableHelper.fromTextArray` covers headers from a separate array or leading
data rows, repeat markers, theme table styles, per-column alignment, padding,
minimum heights, format/build/style/decoration callbacks and odd-row variants.
Ten tests assert layout numbers and emitted operators. Repeat markers are part
of the layout data consumed by 3.2's continuation protocol.
`examples/table-phase-3.1.mjs` is the retained visual/V8 proof.

### 3.2 Spanning widgets ✅ *(landed 2026-08-05)*

- **Ports:** `widgets/multi_page.dart`'s `SpanningWidget` protocol
- A long table or paragraph splits across pages instead of throwing. Requires
  the layout protocol to grow a save/restore context.
- **Example gate:** no new API, but `document`, `invoice` and `report` all
  overflow a page — without this they will throw `RangeError` even once their
  widgets exist.

Landed as a public `SpanningWidget<TData, TState>` base. In place of upstream's
mutable `WidgetContext.clone/apply`, `layoutSpan()` takes an immutable state and
returns the fragment box, its successor state and `hasMore`. This preserves the
repository's central rule that layout never caches on `this`: replaying one
snapshot produces the same rows and cannot overwrite a fragment already
assigned to an earlier page.

`MultiPage` detects direct spanning children, constrains every fragment to the
space left after its header/footer, starts a fresh page while `hasMore`, and
guards the loop with upstream's `maxPages` option. `Table` keeps column widths
stable across fragments, resumes at the next row and includes every `repeat`
row on continuations. Four tests cover immutable replay, three-page output,
headers/footers, repeated table headers, page limits and an indivisible row.
`examples/table-spanning-phase-3.2.mjs` is the retained visual/V8 proof.

### 3.3 Basic widgets ✅ *(completed 2026-08-05)*

- **Ports:** `widgets/basic.dart`, `widgets/geometry.dart`, `widgets/widget.dart`
- **Into:** `src/widgets/basic.ts`
- `Align`, `Center`, `Padding`, `SizedBox`, `AspectRatio`, `Transform`,
  `Opacity`, `FittedBox`, `Divider`, `FullPage`; `EdgeInsets` as a real exported
  type rather than the internal `normalizeInsets`; `StatelessWidget` for
  composition.
- **Example gate:** the second-largest unblock after 1.4 — all seven examples.

The first batch landed `Padding`, `Align`, `Center`, `SizedBox`, `Divider`,
`EdgeInsets`, `Alignment` + `inscribe`, and `StatelessWidget`; it reduced the
missing-API total 147 → 124. The closing batch ports `Transform` (including
origin/alignment and layout-adjusting transforms), alpha/blend graphic-state
scoping through `Opacity`, every `BoxFit` mode in `FittedBox`, `AspectRatio`,
`FullPage`, `Builder`, `LayoutBuilder`, `CustomPaint`, `LimitedBox` and
`VerticalDivider`. Ten focused tests cover public surfaces, pure layout data and
emitted transform, clip, alpha and paint-order operators. It removes nine more
feature occurrences from the examples, taking the total 84 → 75.
`examples/basic-widgets-phase-3.3.mjs` is the retained visual/V8 proof.

`ConstrainedBox` and `OverflowBox` move to **3.4** because faithfully porting
them requires minimum constraints. `LimitedBox` currently contributes its
max-only useful branch; 3.4 will complete its minimum-preserving behaviour.

Two divergences worth knowing:

- `Align` fills an axis unless given a factor, which is upstream's rule under
  finite constraints. But upstream's `Flex` hands children an *infinite*
  main-axis constraint, so an `Align` inside a `Column` shrink-wraps there and
  here it does not — it claims the remaining page height until **3.4** replaces
  the flex algorithm. `heightFactor: 1` is the workaround.
- `Divider` fills its rule directly rather than composing `SizedBox` + `Center` +
  `Container` + `BoxDecoration` + `Border` + `BorderSide`, since decoration is
  **3.5**. The emitted `re f` is what upstream's bottom border produces anyway.

### 3.4 Full flex and constraints

- **Ports:** `widgets/flex.dart`, the constraint-dependent pieces of
  `widgets/basic.dart` and `widgets/geometry.dart`
- `mainAxisAlignment`, `crossAxisAlignment`, `Expanded`, `Flexible`, `FlexFit`,
  `mainAxisSize`, `BoxConstraints`, `ConstrainedBox`, `OverflowBox`; complete
  `LimitedBox`.
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

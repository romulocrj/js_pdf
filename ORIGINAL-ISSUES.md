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
examining segments until SOS/EOI. The Adobe transform is therefore honored in
every valid position before the compressed data.

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

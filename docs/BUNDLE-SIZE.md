# Bundle size

## 1.0 series — phases 7.0–7.7 and 6.9

Measured 2026-11-10 on branch `release/1.0` against **v0.2.0** (`961db0d`).
Values are bytes of the canonical `dist/js_pdf.min.mjs`.

| Revision | Minified, uncompressed | gzip level 9 | Brotli quality 11 |
|---|---:|---:|---:|
| v0.2.0 | 450,928 | 138,393 | 111,811 |
| After phase 7.0 (table packing) | 422,764 | 135,763 | 110,972 |
| 1.0 series (7.0–7.7 + 6.9) | 434,364 | 140,884 | 115,362 |

The complete series is **16,564 bytes smaller (−3.67%)** than v0.2.0 when
minified, and **2,491 bytes (+1.80%)** larger under gzip. The target agreed for
1.0 was at most about +5% minified.

Phase 7.0 packs three literal tables into strings with no behaviour change —
the Material palette (~10.6 KB), the PDF417 codeword clusters (~9.7 KB) and the
standard Type1 widths (~6.4 KB). Packed tables compress less well than the
repetitive literals they replace, which is why the compressed sizes shrink by
less. `test/static_tables.test.mjs` fingerprints the decoded tables against
the original literals, and example PDFs from both bundles are byte-identical.

Integration order and running minified size:

| Step | Minified | Δ |
|---|---:|---:|
| 7.0 table packing | 422,764 | −28,164 |
| 7.2 fonts | 422,503 | −261 |
| 7.1 serialization and PDF objects | 423,476 | +973 |
| 7.5 graphics, colour alpha and images | 424,561 | +1,085 |
| 7.6 layout and tables + 7.4 SVG | 429,339 | +4,778 |
| 7.3 text, bidi and Arabic | 431,690 | +2,351 |
| 7.7 follow-ups | 432,112 | +422 |
| 6.9 directional layout | 434,364 | +2,252 |

The font fixes are net negative because ToUnicode generation was unified. The
largest additions are the SVG viewport/text/alpha work and the per-line bidi
reordering. Remaining packing candidates, not applied: the barcode lookup
maps (~7 KB minified) and the SVG named colours.

Output size also changes: embedded TrueType subsets now keep their hinting
tables (`cvt `, `fpgm`, `prep`, `gasp`), adding roughly 1–6 KB per embedded
font before compression (e.g. the upstream `report` example grows from 14,739
to 20,729 bytes).

Reproduce with:

```sh
npm run build
node examples/measure-bundle-size.mjs 961db0d 9cb031c
```

The retained report is
[`examples/benchmarks/bundle-1.0-series.json`](../examples/benchmarks/bundle-1.0-series.json).

## Phases 6.8, 6.10 and 6.12

Measured 2026-09-29 against the latest published release, **v0.1.6**
(2026-08-07), and the PR #11 merge `68d5b1b`. Values are bytes of the canonical
`dist/js_pdf.min.mjs`, not the sum of duplicate distribution files or font assets.

| Revision | Minified, uncompressed | gzip level 9 | Brotli quality 11 |
|---|---:|---:|---:|
| v0.1.6 | 405,510 | 123,848 | 101,264 |
| After phase 6.7 | 434,635 | 132,179 | 107,389 |
| Phases 6.8 + 6.10 + 6.12 | 450,928 | 138,394 | 111,755 |

This PR adds **16,293 uncompressed bytes (+3.75%)**.
Relative to v0.1.6, the complete minified bundle is **45,418 bytes larger
(+11.20%)**. gzip grows by
**14,546 bytes (+11.75%)**.
The canonical unminified module is 820,719 bytes.

### What contributes to the growth

The new code includes full-program WinAnsi/CFF1 embedding, CFF charset/ROS and
standard SID data, annotation borders/notes, reusable form resources and the
requested API conveniences. No runtime dependency or font program was added
to dist. The Source Sans 3 fixtures remain separate example assets.

CFF1 embeds the supplied font in full, using existing sfnt metrics and a small
metadata reader instead of a CFF subsetter/charstring interpreter. This bounds
new library machinery but trades against generated PDF size for large CFF
inputs. TrueType Unicode subsetting remains the default. Simple TrueType also
embeds its entire source font. Exact CFF ink bounds, CFF2, variable-font
instancing and raw Type1/PFB programs are not implemented.

Compression measurements describe potential transfer/storage size. They do
not measure parse time, execution time or runtime heap. ClearScript hosts still
load the decompressed JavaScript; font assets contribute separately when used.
No public features were removed to achieve these figures.

### Reproduce

```sh
npm run build
node examples/measure-bundle-size.mjs v0.1.6 68d5b1b
```

The runner reads historical artifacts with `git show` and the current bundle
from disk, then reports raw/gzip/Brotli lengths. The
[retained report](../examples/benchmarks/bundle-phases-6.8-6.10-6.12.json) records
Node/compression settings, the baseline commit and the candidate bundle hash.

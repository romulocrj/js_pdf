# Bundle size — phases 6.8, 6.10 and 6.12

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

## What contributes to the growth

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

## Reproduce

```sh
npm run build
node examples/measure-bundle-size.mjs v0.1.6 68d5b1b
```

The runner reads historical artifacts with `git show` and the current bundle
from disk, then reports raw/gzip/Brotli lengths. The
[retained report](../examples/benchmarks/bundle-phases-6.8-6.10-6.12.json) records
Node/compression settings, the baseline commit and the candidate bundle hash.

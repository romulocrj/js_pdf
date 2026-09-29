# Layout and text performance — phase 6.6

The port adapts three optimizations from David PHAM-VAN's
[dart_pdf](https://github.com/DavBfr/dart_pdf): unchanged constraint reuse
(`5e820c33c7`), Flex sublist removal (`0a8b89bdb2`) and single-word splitting
(`b97c4a63dc`). The baseline is this port's PR #9 merge, `707426a`.

## Reproduce

From the repository root, with dependencies installed:

```sh
git show 707426a:dist/js_pdf.mjs > /tmp/js_pdf-baseline.mjs
npm run build
node examples/benchmark-layout.mjs /tmp/js_pdf-baseline.mjs
# Optional same-version control:
node examples/benchmark-layout.mjs /tmp/js_pdf-baseline.mjs /tmp/js_pdf-baseline.mjs
npm run phase-examples
```

The runner warms each case three times and alternates baseline/candidate order
across nine timed samples. It checks matching geometry checksums and compares
the shared paginated ticket PDF byte for byte. Only the fixed-width
`CreationDate` metadata is normalized, because generation uses the current
clock. Compression, content, resources and cross-reference offsets remain in
the comparison. Timing includes workload setup. No timing threshold is used
in tests.

## Observed results

Measured 2026-09-29 on macOS arm64, Node 26.8.1, V8 14.6.202.34-node.28.
[Raw results](../examples/benchmarks/layout-phase-6.6.json) retain bundle hashes,
medians, minima/maxima and the same-version control.

| Workload | Iterations | Baseline median | Candidate median | Time change |
|---|---:|---:|---:|---:|
| Unchanged `BoxConstraints.enforce` | 1,000,000 | 22.102 ms | 9.582 ms | −56.6% |
| Paginated Flex fragments | 10,000 | 7.553 ms | 6.743 ms | −10.7% |
| Printable ASCII words | 12,000 | 52.682 ms | 50.666 ms | −3.8% |
| Mixed text, including spaces and Unicode | 12,000 | 19.328 ms | 18.184 ms | −5.9% |

Same-version control changes ranged from −0.30% to +0.60%. It loads one module
for both sides; the comparison loads distinct baseline and candidate modules.
Absolute times between those runs are therefore not directly comparable.
Mixed text also includes an ASCII word and shares the constraints path; its
result does not measure a Unicode-specific optimization.

The visual workload produces a 2,038-byte PDF with identical normalized bytes:
SHA-256 `5930b0bf079d445f61dc4f06ac1baabc136f94800570eaa8599f2905107a131a`.
The same generator appears as **Layout performance**, after phase 6.5 in
[Browser.html](../examples/Browser.html), and writes
`examples/out/layout-performance-phase-6.6.pdf` through the phase runner.

These are local microbenchmarks on Node's V8, not ClearScript measurements or
whole-document speedup claims. Hardware, JIT state, engine versions and input
mix affect results. Constraints remain immutable values; callers must not
rely on `enforce` allocating a new object. Flex retains independent layout
results, and the ASCII shortcut preserves custom callbacks and normal wrapping.

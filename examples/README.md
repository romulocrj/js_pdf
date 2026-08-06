<!--
 js_pdf ported examples index.
 Copyright (C) 2026, Romulo Campos
 Licensed under the Apache License, Version 2.0.
-->

# Original dart_pdf examples

These files are JavaScript ports of the examples at upstream commit
`bdb6f81dcb453360c58d6dceb628d95d154a1f13`:

| JavaScript port | Original Dart source |
|---|---|
| `hello-world.mjs` | `pdf/example/main.dart` |
| `calendar.mjs` | `demo/lib/examples/calendar.dart` |
| `certificate.mjs` | `demo/lib/examples/certificate.dart` |
| `document.mjs` | `demo/lib/examples/document.dart` |
| `invoice.mjs` | `demo/lib/examples/invoice.dart` |
| `report.mjs` | `demo/lib/examples/report.dart` |
| `resume.mjs` | `demo/lib/examples/resume.dart` |
| `server.mjs` | `demo/lib/examples/server.dart` |

The ports intentionally retain references to widgets and PDF features that are
not implemented by `js_pdf` yet. They are capability probes for porting work,
not reduced visual approximations. `requireFeatures()` reports the missing
public APIs before each document is built.

Run all examples:

```sh
npm run examples        # builds first
npm run phase-examples  # retained visual proofs for completed phases
```

Successful PDFs are written to `out/`. Failures are collected in
`generation-results.json`; one failure does not stop the remaining examples.
The assets and fonts are the same resources referenced by the Dart examples.
Both runners place generated PDFs in `out/`.

`annotations-phase-5.3.mjs` is the focused visual proof for whole-widget URL
links, inline span annotations and internal named destinations.
`icons-phase-5.4.mjs` proves themed glyph size, colour, opacity and RTL
mirroring using the retained Material Icons font.
`progress-phase-5.5.mjs` compares circular values, track colours, stroke widths,
elliptical constraints and linear values/heights.

`npm run examples` now generates the complete 8/8 upstream set.

## Roadmap gates

Each example is the acceptance test for a specific roadmap phase: the phase that
lands its *last* missing API. See
[docs/ROADMAP.md § Example gates](../docs/ROADMAP.md#example-gates) for the
per-phase breakdown of which APIs each one is still waiting on.

| Example | Unlocks at | What it proves |
|---|---|---|
| `hello-world` | ✅ init | document, page, text, serializer |
| `calendar` | ✅ **3.6** | TTF + theming + SVG + grid layout |
| `certificate` | ✅ **3.9** | absolute positioning, transforms, rich text |
| `report` | ✅ **5.1** | charts and tables — the only example needing no SVG and no images |
| `invoice` | ✅ **5.2** | tables, decoration, barcodes |
| `document` | ✅ **5.3** | long-form content: headers, paragraphs, TOC, links |
| `server` | ✅ **5.3** | charts + SVG + links together |
| `resume` | ✅ **5.5** | everything: images, icons, clipping, partitions, progress |

When a phase lands, run `npm run examples`, commit the refreshed
`generation-results.json`, and inspect the PDFs the phase was supposed to
unlock.

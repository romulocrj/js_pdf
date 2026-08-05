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

Run all examples independently:

```sh
node examples/run-upstream-examples.mjs
```

Successful files are written beside the sources. Failures are collected in
`generation-results.json`; one failure does not stop the remaining examples.
The assets and fonts are the same resources referenced by the Dart examples.

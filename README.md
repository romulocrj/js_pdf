# js_pdf

A JavaScript port of [dart_pdf](https://github.com/DavBfr/dart_pdf) by David PHAM-VAN.

`js_pdf` composes PDF documents from a widget tree using only standard ECMAScript.
It has no runtime dependencies and touches no host API — no DOM, no Canvas, no
Node globals, no timers, no filesystem, no network. The build output is a single
ES module intended for a browser importmap or a bare V8 host such as ClearScript.

Written in TypeScript and shipped with type declarations; the compiler is
configured against the ES2020 lib alone, so the host-free guarantee is enforced
at build time rather than by convention.

## Status

Early. The low-level PDF writer, the layout protocol and a small widget set are
in place; fonts are limited to built-in Helvetica with WinAnsi text, and there is
no SVG, image, or table subsystem yet.

- [docs/PORTING-STATUS.md](docs/PORTING-STATUS.md) — what has been ported so far, file by file
- [docs/ROADMAP.md](docs/ROADMAP.md) — the next steps, in order
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the port is organized and where it diverges from dart_pdf

## Install and build

```sh
npm install
npm run build      # tsc + rollup: src/ -> dist/
npm run verify     # source gate + type check + build + tests
```

The build emits four single-file ES modules plus declarations:

| Artifact | |
|---|---|
| `dist/js_pdf.mjs` | readable, canonical — what `import 'js_pdf'` resolves to |
| `dist/js_pdf.min.mjs` | minified, canonical — `import 'js_pdf/min'` |
| `dist/js_pdf-0.1.0.mjs` | readable, versioned — for vendoring into a host directory |
| `dist/js_pdf-0.1.0.min.mjs` | minified, versioned |
| `dist/types/**.d.ts` | type declarations |

Each JavaScript artifact carries the attribution banner and no other comment.

## Use

Node, or any bundler:

```js
import { createPdf } from 'js_pdf';

const bytes = createPdf({ title: 'Report' }, ({ Page, Text }) => [
  new Page({ build: () => new Text('Hello js_pdf') })
]);
// bytes instanceof Uint8Array
```

Browser, via importmap — no build step on the consumer side:

```html
<script type="importmap">
  { "imports": { "js_pdf": "/vendor/js_pdf.mjs" } }
</script>
<script type="module">
  import { createPdf } from 'js_pdf';
</script>
```

ClearScript, as a standard module:

```csharp
using var engine = new V8ScriptEngine();
engine.DocumentSettings.AccessFlags = DocumentAccessFlags.EnableFileLoading;
engine.DocumentSettings.SearchPath = modulesDirectory;

engine.Script.model = model;
dynamic result = engine.Evaluate(new DocumentInfo { Category = ModuleCategory.Standard }, @"
    import { createSalesReport } from 'create-sales-report.mjs';
    createSalesReport(model);
");
```

The result is a `Uint8Array`, produced synchronously. Converting it to `byte[]`
depends on your ClearScript version and host binding strategy.

## Public API

`createPdf`, `Document`, `Page`, `MultiPage`, `Text`, `Column`, `Row`,
`Container`, `Spacer`, `Vector`, `PageFormat`, `Widget`.

## Example

[examples/create-sales-report.mjs](examples/create-sales-report.mjs) builds a
paginated sales report with a header, footer, metric cards, a bar chart and a
table. Run it with `npm run example`.

## Current limitations

- Helvetica / WinAnsi only; no embedded TTF, so no CJK and no arbitrary Unicode.
- Glyph advance widths are approximated, so text measurement drifts from dart_pdf.
- `Vector` emits PDF vector operators directly; there is no SVG parser yet.
- No image, table, spanning widget, RTL shaping, encryption, signature or PDF/A support.
- A `MultiPage` child taller than one content area is rejected rather than split.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the order in which these are being addressed.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Notice

This project contains a JavaScript port of portions of dart_pdf.

Original project:
https://github.com/DavBfr/dart_pdf

Original author:
David PHAM-VAN

Original code licensed under the Apache License, Version 2.0.

The JavaScript port and subsequent modifications are Copyright (C) 2026
Romulo Campos

Full attribution is in [NOTICE](NOTICE). Every ported file under `src/` names the
upstream Dart sources it derives from in its header.

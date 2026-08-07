# PDF for pure JavaScript

This is an independent JavaScript port of [dart_pdf](https://github.com/DavBfr/dart_pdf)
by David PHAM-VAN.

This port is based on **dart_pdf 3.13.0**, specifically upstream commit
[`5cc542`](https://github.com/DavBfr/dart_pdf/commit/0833cd2fc8cf3e62b0228732e81402afca5cc542).

js_pdf is an independent and unofficial JavaScript port of dart_pdf.
It is not affiliated with or endorsed by the original project maintainers.

`js_pdf` composes PDF documents from a widget tree using only standard ECMAScript.
It has no runtime dependencies and touches no host API — no DOM, no Canvas, no
Node globals, no timers, no filesystem, no network. The build output is a single
ES module intended for a browser importmap or a bare V8 host such as ClearScript.

Written in TypeScript and shipped with type declarations; the compiler is
configured against the ES2020 lib alone, so the host-free guarantee is enforced
at build time rather than by convention.

## Why this port exists

I have used many PDF libraries across different languages and ecosystems,
including iText, PDFKit, pdfmake, jsPDF and React-pdf. Of all of them, I have
always considered dart_pdf the best library for generating PDFs because its
declarative API makes documents remarkably simple to compose. I have used it
successfully in mobile applications, on servers, in desktop applications and
on the web.

What I still wanted was a 100% JavaScript declarative PDF library. React-pdf is
the closest alternative, but it depends on React. I wanted a framework-free
library that could run in a browser with plain JavaScript, in Node.js, or
directly in a bare V8 host.

That is why I decided to port dart_pdf. This port was only possible because of
the great and beautiful work David PHAM-VAN put into the original project, and
because of the advances in LLM agents that made translating and validating a
project of this scale feasible.

## Status

The implementation roadmap is complete through phase 5.7. The port includes
the PDF object model, Type1 and embedded TrueType fonts, declarative layout and
pagination, SVG, raster images, tables, charts, barcodes, links, forms, page
labels and metadata/XMP. All eight retained upstream examples generate end to
end under Node.js and bare ClearScript V8.

- [docs/PORTING-STATUS.md](docs/PORTING-STATUS.md) — what has been ported so far, file by file
- [docs/ROADMAP.md](docs/ROADMAP.md) — the next steps, in order
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the port is organized and where it diverges from dart_pdf
- [AI_USAGE.md](AI_USAGE.md) — instructions for LLMs generating js_pdf code from dart_pdf knowledge

## Install and build

```sh
npm install
npm run build      # tsc + rollup: src/ -> dist/
npm run verify     # source gate + type check + build + tests
```

The build emits four single-file ES modules plus declarations:

| Artifact | |
|---|---|
| `dist/js_pdf.mjs` | readable, canonical — what `import '@romulocrj/js_pdf'` resolves to |
| `dist/js_pdf.min.mjs` | minified, canonical — `import '@romulocrj/js_pdf/min'` |
| `dist/js_pdf-0.1.6.mjs` | readable, versioned — for vendoring into a host directory |
| `dist/js_pdf-0.1.6.min.mjs` | minified, versioned |
| `dist/types/**.d.ts` | type declarations |

Each JavaScript artifact carries the attribution banner and no other comment.

## Installation via CDN

Import the latest minified ES module directly from jsDelivr:

```js
import * as pw from 'https://cdn.jsdelivr.net/gh/romulocrj/js_pdf/dist/js_pdf.min.mjs';
```

## Use

Node, or any bundler:

```js
import * as pw from '@romulocrj/js_pdf';

const document = new pw.Document({ title: 'Report' });

document.addPage(new pw.Page({
  build: () => new pw.Center({
    child: new pw.Text('Hello js_pdf')
  })
}));

const bytes = document.save();
// bytes instanceof Uint8Array
```

Browser, via importmap — no build step on the consumer side:

```html
<script type="importmap">
  { "imports": { "js_pdf": "/vendor/js_pdf.mjs" } }
</script>
<script type="module">
  import * as pw from 'js_pdf';

  const document = new pw.Document();
  document.addPage(new pw.Page({
    build: () => new pw.Text('Hello from the browser')
  }));
  const bytes = document.save();
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

Highlights include `Document`, `Page`, `MultiPage`, `Text`,
`Column`, `Row`, `Container`, `Table`, `Chart`, `SvgImage`, `Image`,
`BarcodeWidget`, `Inseparable`, `ListView`, `GridPaper`, geometric annotation
widgets, `TextField`, `ChoiceField`, `Checkbox`, `FlatButton`,
`PageFormat`, `PdfType1Font`, `PdfTtfFont` and `Widget`.

See [docs/PORTING-STATUS.md](docs/PORTING-STATUS.md) for the complete implemented
surface and the remaining upstream gaps.

## Example

[examples/create-sales-report.mjs](examples/create-sales-report.mjs) builds a
paginated sales report with a header, footer, metric cards, a bar chart and a
table using the `Document`/`MultiPage` API. Run it with `npm run example`.

[examples/widgets-phase-5.7.mjs](examples/widgets-phase-5.7.mjs) exercises all
widgets added in phase 5.7. The English-only
[examples/production-pagination.mjs](examples/production-pagination.mjs) is a
production-sized regression example showing how `Inseparable` keeps a chart
heading and chart on the same page.

## Current limitations

- Reading existing PDFs, rasterizing PDFs, encryption and digital signatures
  are out of scope.
- PDF/A output intents are not implemented.
- Library code performs no host I/O. Fonts, images and other external assets
  must be supplied by the caller as bytes or text.
- An indivisible `MultiPage` child taller than one content area is rejected;
  spanning widgets such as text, columns and tables paginate normally.

See [docs/PORTING-STATUS.md](docs/PORTING-STATUS.md) for details about each
remaining gap.

## License

Apache License 2.0. See [LICENSE](LICENSE).

Bundled example fonts and visual resources retain their respective licenses.
See [examples/assets/THIRD-PARTY-NOTICES.md](examples/assets/THIRD-PARTY-NOTICES.md)
for copyright, license and provenance details.

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

## Warranty and support

This software is provided “as is”, without warranties of any kind. No support
is provided or implied.

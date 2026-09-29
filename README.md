# PDF for pure JavaScript

[Live demo](https://romulocrj.github.io/js_pdf/examples/Browser.html)

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

Read the full history: [I ported dart_pdf to pure JavaScript](https://daily.dev/posts/i-ported-dart-pdf-to-pure-javascript--ypugbs6sa).



## Status

The implementation roadmap is complete through phase 5.7. The port includes
the PDF object model, Type1 and embedded TrueType fonts, declarative layout and
pagination, SVG, raster images, tables, charts, barcodes, links, forms, page
labels and metadata/XMP. All eight retained upstream examples generate end to
end under Node.js and bare ClearScript V8.

Version 0.1.6 is the first release candidate, and the first version published to
npm. The port itself is finished; it is a candidate rather than a stable release
because nothing outside the project has exercised it yet. The API is expected to
hold, but is not frozen until 1.0.0.

- [CHANGELOG.md](CHANGELOG.md) — what changed in each version
- [docs/PORTING-STATUS.md](docs/PORTING-STATUS.md) — what has been ported so far, file by file
- [docs/ROADMAP.md](docs/ROADMAP.md) — the next steps, in order
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the port is organized and where it diverges from dart_pdf
- [AI_USAGE.md](AI_USAGE.md) — instructions for LLMs generating js_pdf code from dart_pdf knowledge

## Install

```sh
npm install @romulocrj/js_pdf
```

The package is ESM-only and has no runtime dependencies. Type declarations ship
with it, so TypeScript needs no separate `@types` package.

## Build from source

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
| `dist/js_pdf-<version>.mjs` | readable, versioned — for vendoring into a host directory |
| `dist/js_pdf-<version>.min.mjs` | minified, versioned |
| `dist/types/**.d.ts` | type declarations |

Each JavaScript artifact carries the attribution banner and no other comment.

## Install via CDN

Import the minified ES module directly from jsDelivr, with no install step.
Pinning the version is recommended — the unpinned URL follows whatever the
latest published release is:

```js
import * as pw from 'https://cdn.jsdelivr.net/npm/@romulocrj/js_pdf@0.1.6/dist/js_pdf.min.mjs';
```

unpkg serves the same file at
`https://unpkg.com/@romulocrj/js_pdf@0.1.6/dist/js_pdf.min.mjs`.

## Use

The same document, [examples/hello-world.mjs](examples/hello-world.mjs), on each
supported host. Only the wiring around it changes — the composition and
`save()` are identical everywhere, because the library touches no host API.

Node, or any bundler:

```js
import * as pw from '@romulocrj/js_pdf';

const pdf = new pw.Document();

pdf.addPage(new pw.Page({
  build: () => new pw.Text('Hello World!', { align: 'center' })
}));

const bytes = pdf.save();
// bytes instanceof Uint8Array
```

Browser, via importmap (cdn or vendoring) — no build step on the consumer side (see [examples/Browser.html](examples/Browser.html) or [live demo](https://romulocrj.github.io/js_pdf/examples/Browser.html)):

```html
<script type="importmap">
  { "imports": { "@romulocrj/js_pdf": "https://cdn.jsdelivr.net/npm/@romulocrj/js_pdf@0.1.6/dist/js_pdf.min.mjs" } }
</script>
<script type="module">
  import * as pw from '@romulocrj/js_pdf';

  const pdf = new pw.Document();

  pdf.addPage(new pw.Page({
    build: () => new pw.Text('Hello World!', { align: 'center' })
  }));

  const bytes = pdf.save();
</script>
```

ClearScript, as a standard module. 
Copy the `js_pdf.min.mjs` file from npm or CDN and place it in modules directory that is accessible to your host. 
Then run the following code:

```csharp
using var engine = new V8ScriptEngine();
engine.DocumentSettings.AccessFlags = DocumentAccessFlags.EnableFileLoading;
engine.DocumentSettings.SearchPath = modulesDirectory;

dynamic result = engine.Evaluate(new DocumentInfo { Category = ModuleCategory.Standard }, @"
      import * as pw from 'js_pdf.min.mjs';

      const pdf = new pw.Document();

      pdf.addPage(new pw.Page({
        build: () => new pw.Text('Hello World!', { align: 'center' })
      }));

      const bytes = pdf.save();
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

## Examples

The eight examples retained from dart_pdf. Each is a synchronous, host-free
module that returns PDF bytes, so the same file runs under Node.js and under
bare ClearScript V8.

| Example | What it shows |
|---|---|
| [hello-world.mjs](examples/hello-world.mjs) | Minimal `Document`, `Page`, `Text` and synchronous `save()` |
| [calendar.mjs](examples/calendar.mjs) | Grid layout, TrueType fonts, SVG and themed text |
| [certificate.mjs](examples/certificate.mjs) | Stack/positioned layout, transformations, clipping, rich text and decorative SVG |
| [document.mjs](examples/document.mjs) | Long-form multipage document, headers, paragraphs, table of content, outlines and links |
| [invoice.mjs](examples/invoice.mjs) | Business invoice, repeated table headers, SVG, barcode, totals, header and footer |
| [report.mjs](examples/report.mjs) | Cartesian and pie charts, legends, tables and embedded fonts |
| [resume.mjs](examples/resume.mjs) | Images, icons, progress indicators, partitions, QR code and two-page layout |
| [server.mjs](examples/server.mjs) | Charts, SVG, feature cards, pricing table and external links |

Generate all eight with `npm run examples`.

[examples/](examples/) also holds a browser page, a project sales report and one
focused example per implementation phase. They are indexed, with what each one
covers, in [AI_USAGE.md](AI_USAGE.md).

## Current limitations

- Reading existing PDFs, rasterizing PDFs, encryption and digital signatures
  are out of scope.
- Directional layout geometry, right-to-left (RTL) layout for Flex and tables,
  and baseline alignment are not implemented (phase 6.9).
- PDF/A integration, including output intents and the required conformance
  handling, is not implemented (phase 6.11).
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

### Image resolution

`Image`, `DecorationImage` and image providers accept a `dpi` setting. It
reduces images to their displayed resolution without enlarging the source.
Reduced JPEGs stay JPEG-compressed at quality 90 (lossy) and omit source EXIF
metadata. Without reduction, the original JPEG bytes are embedded unchanged.
PNG and raw-image reductions preserve their alpha channel.

Review the three-page **Image DPI & JPEG** example in
[the browser gallery](examples/Browser.html), or run `npm run phase-examples`
and open `examples/out/image-dpi-phase-6.1.pdf`. It compares original and
reduced JPEGs, all eight orientations, and PNG transparency on two backgrounds.
To serve the local gallery, run `python3 -m http.server 8000` from the repository
root and open `http://localhost:8000/examples/Browser.html` after building.

The **Pie full circles** gallery card compares exact and rounded one-category
pies and donuts with partial-slice controls. Its shared generator is
[pie-full-circle-phase-6.2.mjs](examples/pie-full-circle-phase-6.2.mjs);
`npm run phase-examples` writes `examples/out/pie-full-circle-phase-6.2.pdf`.


The **Page clipping & formats** gallery card compares clipping off/on, rotated
margins, MultiPage and content-sized receipts/labels. Run `npm run phase-examples`
to generate `examples/out/page-formats-phase-6.3.pdf` from
[page-formats-phase-6.3.mjs](examples/page-formats-phase-6.3.mjs).


The **Custom line breaking** card compares CJK prefix wrapping, punctuation
rules and hyphenation. Its [shared generator](examples/text-breaking-phase-6.4.mjs)
uses a small, licensed CJK font subset; `npm run phase-examples` writes
`examples/out/text-breaking-phase-6.4.pdf`.


The **Synchronous output** card demonstrates `Document.write(output)` and lazy
JPEG reuse, with executable checks against `save()`. After building, run
`node examples/run-synchronous-output.mjs` for direct file output and a JPEG
source read in 1 KB chunks. The [gallery generator](examples/synchronous-output-phase-6.5.mjs)
is also included in `npm run phase-examples`.


The **Layout performance** card generates paginated tickets from the
[phase 6.6 generator](examples/layout-performance-phase-6.6.mjs).
`npm run phase-examples` writes `examples/out/layout-performance-phase-6.6.pdf`.
See [performance measurements and reproduction](docs/PERFORMANCE.md) for the
comparative Node/V8 benchmark and its equivalence checks.


The **Color values & device spaces** card demonstrates the Material palette,
RGB/gray/CMYK painting, HSV/HSL/RYB conversions and flattened alpha. Its
[shared generator](examples/colors-phase-6.7.mjs) follows phase 6.6 in the browser;
`npm run phase-examples` writes `examples/out/colors-phase-6.7.pdf`.
See [color usage](AI_USAGE.md#color-values-and-device-spaces) for constructors
and the distinction between color alpha and painting opacity.


The combined **6.8 / 6.10 / 6.12** PR adds three ordered gallery cards:
**TrueType & CFF fonts**, **Reusable forms & notes**, and **API conveniences**.
They share [one generator module](examples/fonts-objects-api-phases.mjs) with
`npm run phase-examples`. The CFF fixtures retain Adobe's copyright and the
complete SIL OFL; they are external assets, not part of dist. See
[usage and limitations](AI_USAGE.md#font-compatibility-and-cff) and the
[release-to-current bundle comparison](docs/BUNDLE-SIZE.md).

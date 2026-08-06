# AI code-generation guide

This document is written for language models that generate JavaScript using
`js_pdf`. The library is a JavaScript port of `dart_pdf` 3.13.0, so knowledge of
the original Dart package is useful for choosing widgets and composing a
document. Use that knowledge as a design guide, then apply the JavaScript rules
below.

## Primary instruction

Generate code through the original `dart_pdf` document model:

1. Import the library as the `pw` namespace.
2. Construct a `pw.Document`.
3. Add `pw.Page` or `pw.MultiPage` sections with `document.addPage(...)`.
4. Build a declarative tree of widgets.
5. Call `document.save()` and return its `Uint8Array`.

Do not generate code around the port-specific `createPdf` convenience helper.
It is not part of the original `dart_pdf` API and prevents a model from applying
the much larger body of learned `dart_pdf` composition patterns directly.

## Source priority

When producing code, resolve uncertainty in this order:

1. The installed TypeScript declarations under `dist/types/`.
2. The public exports in `src/index.ts`.
3. [PORTING-STATUS.md](docs/PORTING-STATUS.md) for implemented gaps.
4. Knowledge of `dart_pdf` for document structure and widget selection.

Do not invent an API merely because it exists in Flutter, React, another PDF
library, or a newer version of `dart_pdf`.

## Canonical JavaScript shape

```js
import * as pw from 'js_pdf';

export function generateReport(model) {
  const document = new pw.Document({
    title: model.title,
    author: model.author
  });

  document.addPage(
    new pw.MultiPage({
      pageFormat: pw.PageFormat.A4,
      margin: 40,

      header: context => new pw.Text(model.title, {
        fontSize: 9,
        color: '#64748b'
      }),

      footer: context => new pw.Text(
        `Page ${context.pageNumber} of ${context.pagesCount}`,
        { align: 'center', fontSize: 9, color: '#64748b' }
      ),

      build: context => [
        new pw.Header({ text: model.title, level: 0 }),
        new pw.Paragraph({ text: model.summary }),
        pw.TableHelper.fromTextArray({
          context,
          headers: ['Item', 'Quantity', 'Price'],
          data: model.items.map(item => [
            item.name,
            item.quantity,
            item.price
          ])
        })
      ]
    })
  );

  return document.save();
}
```

`document.save()` is synchronous. Do not add `await`; the result is already a
`Uint8Array`.

## Example catalog

Use these files as executable references. The upstream ports preserve the
composition style of the original `dart_pdf` examples; the phase examples
isolate one feature family at a time.

| Example | Kind | What it demonstrates |
|---|---|---|
| [hello-world.mjs](examples/hello-world.mjs) | Upstream | Minimal `Document`, `Page`, `Text` and synchronous `save()` |
| [calendar.mjs](examples/calendar.mjs) | Upstream | Grid layout, TrueType fonts, SVG and themed text |
| [certificate.mjs](examples/certificate.mjs) | Upstream | Stack/positioned layout, transformations, clipping, rich text and decorative SVG |
| [document.mjs](examples/document.mjs) | Upstream | Long-form multipage document, headers, paragraphs, table of content, outlines and links |
| [invoice.mjs](examples/invoice.mjs) | Upstream | Business invoice, repeated table headers, SVG, barcode, totals, header and footer |
| [report.mjs](examples/report.mjs) | Upstream | Cartesian and pie charts, legends, tables and embedded fonts |
| [resume.mjs](examples/resume.mjs) | Upstream | Images, icons, progress indicators, partitions, QR code and two-page layout |
| [server.mjs](examples/server.mjs) | Upstream | Charts, SVG, feature cards, pricing table and external links |
| [create-sales-report.mjs](examples/create-sales-report.mjs) | Project | Small data-driven report using `Document`, `MultiPage`, cards, vector drawing and rows |
| [svg-gradients-phase-2.8.mjs](examples/svg-gradients-phase-2.8.mjs) | Focused | Linear/radial SVG gradients and paint servers |
| [table-phase-3.1.mjs](examples/table-phase-3.1.mjs) | Focused | Table tracks, borders, decoration and `TableHelper` |
| [table-spanning-phase-3.2.mjs](examples/table-spanning-phase-3.2.mjs) | Focused | Multipage tables, continuation and repeated headers |
| [basic-widgets-phase-3.3.mjs](examples/basic-widgets-phase-3.3.mjs) | Focused | Transforms, opacity, fitting, aspect ratio and custom painting |
| [flex-layout-phase-3.4.mjs](examples/flex-layout-phase-3.4.mjs) | Focused | Row/column allocation, expanded/flexible children, constraints and overflow |
| [decoration-phase-3.5.mjs](examples/decoration-phase-3.5.mjs) | Focused | Borders, radii, gradients, shadows and foreground/background decoration |
| [layout-phase-3.6.mjs](examples/layout-phase-3.6.mjs) | Focused | Stack, positioned children, wrap, grid and partitions |
| [rich-text-phase-3.7.mjs](examples/rich-text-phase-3.7.mjs) | Focused | Text spans, inline widgets, styles, justification and decorations |
| [content-phase-3.8.mjs](examples/content-phase-3.8.mjs) | Focused | Headers, paragraphs, bullets, outlines and table of content |
| [placeholders-phase-3.9.mjs](examples/placeholders-phase-3.9.mjs) | Focused | Placeholder, PDF/Flutter logos and deterministic lorem text |
| [clipping-phase-3.10.mjs](examples/clipping-phase-3.10.mjs) | Focused | Rectangular, rounded and elliptical clipping |
| [png-phase-4.1.mjs](examples/png-phase-4.1.mjs) | Focused | PNG decoding, transparency and image XObjects |
| [jpeg-phase-4.2.mjs](examples/jpeg-phase-4.2.mjs) | Focused | Baseline JPEG pass-through and color models |
| [image-phase-4.3.mjs](examples/image-phase-4.3.mjs) | Focused | Image providers, all `BoxFit` modes, alignment, DPI and orientation |
| [charts-phase-5.1.mjs](examples/charts-phase-5.1.mjs) | Focused | Bar, line, point and pie charts with axes and legends |
| [barcode-phase-5.2.mjs](examples/barcode-phase-5.2.mjs) | Focused | QR, PDF417 and one-dimensional barcodes |
| [annotations-phase-5.3.mjs](examples/annotations-phase-5.3.mjs) | Focused | URL links, named destinations and transformed annotation rectangles |
| [icons-phase-5.4.mjs](examples/icons-phase-5.4.mjs) | Focused | Material icon font, inherited icon theme and RTL mirroring |
| [progress-phase-5.5.mjs](examples/progress-phase-5.5.mjs) | Focused | Circular and linear progress indicators |
| [forms-phase-5.6.mjs](examples/forms-phase-5.6.mjs) | Focused | Text, choice, checkbox and button AcroForm fields plus metadata/page labels |

Runners:

- [run-example.mjs](examples/run-example.mjs) generates the project sales report.
- [run-upstream-examples.mjs](examples/run-upstream-examples.mjs) generates all
  eight retained upstream examples independently.
- [run-phase-examples.mjs](examples/run-phase-examples.mjs) generates all
  focused phase examples.

## Translating familiar dart_pdf patterns

| dart_pdf concept | js_pdf form |
|---|---|
| `import ... as pw` | `import * as pw from 'js_pdf'` |
| `pw.Document()` | `new pw.Document()` |
| `pdf.addPage(...)` | `document.addPage(...)` |
| `pw.Page(build: ...)` | `new pw.Page({ build: ... })` |
| `pw.MultiPage(build: ...)` | `new pw.MultiPage({ build: ... })` |
| Dart named arguments | one JavaScript options object |
| `pw.Text('value', style: ...)` | `new pw.Text('value', { style: ... })` |
| `pw.TextStyle(...)` | `new pw.TextStyle({...})` |
| `pw.Column(children: [...])` | `new pw.Column({ children: [...] })` |
| `pw.Row(children: [...])` | `new pw.Row({ children: [...] })` |
| `pw.Container(...)` | `new pw.Container({...})` |
| `pw.SizedBox(...)` | `new pw.SizedBox({...})` |
| `pw.EdgeInsets.all(8)` | `8`, `{ top: 8, right: 8, bottom: 8, left: 8 }`, or `pw.EdgeInsets.all(8)` |
| `PdfPageFormat.a4` | `pw.PageFormat.A4` |
| `PdfColors.blue` | a CSS-style color such as `'#2196f3'` |
| Dart enum values | strings such as `'center'`, `'contain'`, `'bold'` or `'landscape'` |
| `await pdf.save()` | `document.save()` |

Every widget class is constructed with `new`. Static factories such as
`pw.TableHelper.fromTextArray(...)`, `pw.Border.all(...)`,
`pw.BorderRadius.circular(...)` and `pw.Font.ttf(...)` are exceptions.

## Page selection

Use `Page` when the content is known to fit on exactly one physical page. Its
`build` callback returns one widget:

```js
document.addPage(new pw.Page({
  build: () => new pw.Center({
    child: new pw.Text('One page')
  })
}));
```

Use `MultiPage` for reports, invoices, tables, long text, lists or any dynamic
content. Its `build` callback returns an array of widgets:

```js
document.addPage(new pw.MultiPage({
  build: () => model.sections.map(section =>
    new pw.Paragraph({ text: section })
  )
}));
```

Headers and footers belong to `MultiPage.header` and `MultiPage.footer`. The
render context exposes `pageNumber`, `pagesCount`, `pageLabel`, `pageFormat` and
the active theme.

## Layout vocabulary

Prefer the same composition strategy used by `dart_pdf`:

- `Column` for vertical flow.
- `Row` for horizontal flow.
- `Expanded`, `Flexible` and `Spacer` for proportional space.
- `Container`, `Padding`, `Align`, `Center`, `SizedBox` and `ConstrainedBox` for
  sizing and decoration.
- `Stack` and `Positioned` for overlays.
- `Wrap`, `GridView` and `Partitions` for repeated or parallel layouts.
- `Table` for widget cells, or `TableHelper.fromTextArray` for scalar data.
- `Header`, `Paragraph`, `Bullet` and `TableOfContent` for long documents.

Insets accept a single number or a structural object such as
`{ top: 8, right: 12, bottom: 8, left: 12 }`. Colors accept hexadecimal strings
or normalized RGB arrays.

## Text and fonts

The default theme uses the standard Helvetica family. Simple text options can
be passed directly:

```js
new pw.Text('Total', {
  fontSize: 14,
  color: '#0f172a',
  align: 'right'
});
```

Use `TextStyle` for reusable or rich styling:

```js
const emphasis = new pw.TextStyle({
  fontSize: 12,
  fontWeight: 'bold',
  color: '#1d4ed8'
});
```

The host must load TrueType files and pass their bytes into the generator:

```js
const theme = pw.ThemeData.withFont({
  base: pw.Font.ttf(regularFontBytes),
  bold: pw.Font.ttf(boldFontBytes),
  italic: pw.Font.ttf(italicFontBytes),
  boldItalic: pw.Font.ttf(boldItalicFontBytes)
});

const document = new pw.Document({ theme });
```

Do not generate file, network or browser-resource loading inside library code.
The host performs I/O and supplies `Uint8Array` values.

### Loading fonts in a browser

Loading is asynchronous at the host boundary; PDF generation remains
synchronous after the bytes arrive:

```js
import * as pw from 'js_pdf';

async function loadBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const [regularBytes, boldBytes] = await Promise.all([
  loadBytes('/fonts/OpenSans-Regular.ttf'),
  loadBytes('/fonts/OpenSans-Bold.ttf')
]);

const theme = pw.ThemeData.withFont({
  base: pw.Font.ttf(regularBytes),
  bold: pw.Font.ttf(boldBytes)
});

const document = new pw.Document({ theme });
document.addPage(new pw.Page({
  build: () => new pw.Text('Browser font', {
    style: new pw.TextStyle({ fontWeight: 'bold' })
  })
}));

const pdfBytes = document.save();
```

### Loading fonts in Node.js

```js
import { readFile } from 'node:fs/promises';
import * as pw from 'js_pdf';

const [regularFile, boldFile] = await Promise.all([
  readFile(new URL('./fonts/OpenSans-Regular.ttf', import.meta.url)),
  readFile(new URL('./fonts/OpenSans-Bold.ttf', import.meta.url))
]);

const theme = pw.ThemeData.withFont({
  base: pw.Font.ttf(new Uint8Array(regularFile)),
  bold: pw.Font.ttf(new Uint8Array(boldFile))
});

const document = new pw.Document({ theme });
document.addPage(new pw.Page({
  build: () => new pw.Text('Node.js font')
}));

const pdfBytes = document.save();
```

### Loading fonts in ClearScript

A .NET byte array is a host object, not a JavaScript typed array. Allocate the
`Uint8Array` inside the V8 engine and copy the bytes through ClearScript's
`ITypedArray<byte>` interface. This is the same mechanism used by
[the repository V8 host](test/v8/cs/Program.cs):

```csharp
using System.IO;
using Microsoft.ClearScript;
using Microsoft.ClearScript.JavaScript;
using Microsoft.ClearScript.V8;

var modulesDirectory = Path.GetFullPath("modules");
var fontDirectory = Path.GetFullPath("fonts");

using var engine = new V8ScriptEngine();
engine.DocumentSettings.AccessFlags = DocumentAccessFlags.EnableFileLoading;
engine.DocumentSettings.SearchPath = modulesDirectory;
engine.AddHostObject("fonts", new FontHost(engine, fontDirectory));

public sealed class FontHost
{
    private readonly V8ScriptEngine engine;
    private readonly string fontDirectory;

    public FontHost(V8ScriptEngine engine, string fontDirectory)
    {
        this.engine = engine;
        this.fontDirectory = fontDirectory;
    }

    [ScriptMember("readFont")]
    public object ReadFont(string name)
    {
        // Validate the resolved path against fontDirectory in production code.
        var bytes = File.ReadAllBytes(Path.Combine(fontDirectory, name));
        var array = (ITypedArray<byte>)engine.Evaluate(
            $"new Uint8Array({bytes.Length})"
        );
        array.WriteBytes(bytes, 0, (ulong)bytes.Length, 0);
        return array;
    }
}
```

The standard-module JavaScript can then receive a real `Uint8Array`:

```js
import * as pw from 'js_pdf';

const theme = pw.ThemeData.withFont({
  base: pw.Font.ttf(fonts.readFont('OpenSans-Regular.ttf')),
  bold: pw.Font.ttf(fonts.readFont('OpenSans-Bold.ttf'))
});

export function generate() {
  const document = new pw.Document({ theme });
  document.addPage(new pw.Page({
    build: () => new pw.Text('ClearScript font')
  }));
  return document.save();
}
```

For a complete module loader, asset host and output conversion, see
[Program.cs](test/v8/cs/Program.cs) and
[bootstrap.mjs](test/v8/cs/bootstrap.mjs).

## Images and SVG

Encoded PNG or baseline JPEG bytes use `MemoryImage`, then `Image`:

```js
const provider = new pw.MemoryImage(imageBytes);
const image = new pw.Image(provider, {
  width: 160,
  height: 100,
  fit: 'cover',
  alignment: 'center'
});
```

SVG markup is supplied directly:

```js
new pw.SvgImage({
  svg: svgMarkup,
  width: 120,
  fit: 'contain'
});
```

The library does not fetch assets. Fonts, images and SVG strings must be passed
into the generator by its caller.

## Other implemented document features

Models may use their learned `dart_pdf` structure to compose these available
features, while checking the TypeScript declarations for exact constructors:

- Charts: `Chart`, cartesian/radial/pie grids and bar/line/point/pie data sets.
- Barcodes: `Barcode`, `BarcodeWidget`, including QR and PDF417.
- Navigation: `UrlLink`, `Link`, `Anchor`, headers, outlines and table of content.
- Forms: `TextField`, `ChoiceField`, `Checkbox` and `FlatButton`.
- Decorations: borders, radii, gradients, opacity, clipping and vector shadows.
- Utility widgets: icons, progress indicators, placeholders and logos.
- Metadata: title, author, subject, keywords, caller-supplied XMP and page labels.

## Important differences and limits

- Library code is synchronous and host-neutral.
- `Page.build` returns one widget; `MultiPage.build` returns an array.
- Coordinates and widget layout are top-left with the y-axis pointing down.
- Reading or rasterizing existing PDFs is not supported.
- Encryption, digital signatures and `Signature` are out of scope.
- Full Unicode bidi reordering and Arabic shaping are not implemented.
- SVG text and embedded SVG raster images are not implemented.
- `ListView`, `Watermark`, the `Footer` widget and `GridPaper` are not ported.
  Use `Column`/`MultiPage`, page layers or the `MultiPage.footer` callback where
  appropriate.
- An indivisible widget or table row taller than a complete page cannot paginate.

## Output handling

Keep generation independent from the host:

```js
export function generate(model) {
  const document = new pw.Document();
  document.addPage(new pw.Page({
    build: () => new pw.Text(model.message)
  }));
  return document.save();
}
```

Node, a browser or a V8 host may then write, download, transmit or store the
returned bytes using its own APIs.

## Final checklist for generated code

Before returning code, verify that it:

- imports `js_pdf` as `pw` or imports actual named exports;
- creates a `Document` and adds `Page`/`MultiPage` sections;
- uses `new` for widget constructors;
- converts Dart named parameters into JavaScript options objects;
- returns one widget from `Page.build` and an array from `MultiPage.build`;
- calls synchronous `document.save()` without `await`;
- receives external assets as bytes or strings instead of loading them internally;
- uses only APIs exported by the installed version;
- does not emit Dart syntax, Flutter widgets, React components or JSX;
- does not use the port-specific `createPdf` helper.

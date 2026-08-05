# Architecture

How the port is organized, what it guarantees at runtime, and where it
deliberately diverges from `dart_pdf`.

Companion documents: [PORTING-STATUS.md](PORTING-STATUS.md) (what exists today)
and [ROADMAP.md](ROADMAP.md) (what comes next).

---

## 1. Runtime contract

Everything under `src/` must run on a bare ECMAScript engine. Concretely, the
only globals it may touch are:

`Object` `Array` `String` `Number` `Math` `RegExp` `Map` `Set` `Uint8Array`
`DataView` `ArrayBuffer` `Error` `TypeError` `RangeError` `JSON`

Forbidden anywhere in `src/`, without exception:

| Category | Examples |
|---|---|
| Node | `require`, `node:*` imports, `process`, `Buffer`, `__dirname` |
| Browser | `window`, `document`, `Canvas`, `Image`, `Blob`, `FileReader` |
| Both | `fetch`, `XMLHttpRequest`, `setTimeout`, `setInterval`, `queueMicrotask` |
| Encoding | `TextEncoder`, `TextDecoder` — byte conversion is done by hand |

**The compiler enforces this.** `tsconfig.json` sets `"lib": ["ES2020"]` and
`"types": []` — no DOM, no `@types/node`. Every name in that table is an
unresolved identifier inside `src/`, so a violation is a type error rather than
a lint finding. Do not add `"DOM"` to `lib` or `"node"` to `types`.

Two checks cover what the type system cannot:
`tools/check-source.mjs` catches forbidden names in *comments* (they would
survive into the bundle) and asynchrony, and `test/dist.test.mjs` re-greps the
built artifacts. Build tooling, tests and the example *runner* are exempt; they
are Node programs by design.

**Everything is synchronous.** Upstream `Document.save()` returns a
`Future<Uint8List>` because it may await image decode and font load. This port
returns a `Uint8Array` directly. A ClearScript host has no event loop to pump, so
introducing a promise anywhere in the pipeline would break the primary target.
`async`, `await` and `Promise` are rejected in `src/` by the source gate. Any
future subsystem that would want async I/O (loading a TTF, decoding a PNG) takes
bytes the caller already has instead.

## 1b. Language

`src/` is TypeScript, compiled by `tsc` and bundled by rollup. The settings that
matter:

| Setting | Why |
|---|---|
| `lib: ["ES2020"]`, `types: []` | the runtime contract, as a compiler setting (above) |
| `strict`, `noUncheckedIndexedAccess` | indexing returns `T \| undefined`; the byte-level font work ahead is exactly where this pays |
| `erasableSyntaxOnly`, `verbatimModuleSyntax` | no `enum`, no `namespace`, no parameter properties — so Node can run `src/*.ts` directly by stripping types |
| `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` | relative imports are written `./color.ts` and rewritten to `.js` on emit |
| `noImplicitOverride` | every `override` on a widget method is explicit |

Relative imports carry the **`.ts`** extension. That is what lets `node --test`
import `../src/index.ts` and run the real sources with no build step; tsc
rewrites the specifiers when it emits. The source gate enforces it.

Why TypeScript at all, for a port: dart_pdf is statically typed, so translating
typed→typed keeps information that translating typed→untyped throws away and
forces you to re-derive from the Dart on every read.

## 2. Layer map

Three layers, bottom to top. A layer may only import from itself and the layers
below it.

```
  ┌────────────────────────────────────────────────────────────┐
  │  src/index.ts            public API, createPdf()           │
  ├────────────────────────────────────────────────────────────┤
  │  src/widgets/            layout tree: measure, then paint  │
  │    widget · geometry · text · flex · container · shape     │
  │    page · multi_page · document                            │
  ├────────────────────────────────────────────────────────────┤
  │  src/pdf/                PDF model: operators and objects  │
  │    graphics · document · color · page_format               │
  │    format/{num,string,stream} · font/font_metrics          │
  ├────────────────────────────────────────────────────────────┤
  │  src/base/               port-level primitives             │
  └────────────────────────────────────────────────────────────┘
```

The directory names mirror `dart_pdf`'s own `pdf/lib/src/` tree so an upstream
path maps to a port path by inspection. Every file header names the Dart sources
it derives from; when one `.ts` merges several `.dart` files, all of them are
listed.

### `src/base/`

Runtime guards that Dart expresses in its type system (`assert`, sound null
safety) and that JavaScript has to check by hand.

### `src/pdf/` — the PDF model

- **`format/num.ts`** — number serialization for content-stream operators: no
  exponent form, no trailing zeros, no negative zero.
- **`format/string.ts`** — PDF literal strings, plus the Unicode→WinAnsi
  (CP1252) down-conversion. This is the layer that will grow a hex/CID branch
  when TTF embedding lands.
- **`format/stream.ts`** — byte helpers. Content is assembled as Latin-1
  strings and encoded once at the end, which is why no text-encoding host API
  is needed.
- **`color.ts`** — `#RRGGBB` or `[r,g,b]` → normalized triple, plus the
  `rg`/`RG` operators. DeviceRGB only.
- **`page_format.ts`** — page dimensions in PDF points.
- **`font/font_metrics.ts`** — glyph and string bounding metrics, including
  ascent, descent, bearings and advance width.
- **`font/font.ts` / `font/type1_fonts.ts`** — the common font seam and AFM
  widths for all 14 standard Type1 fonts. A document may use any number.
- **`obj/graphic_stream.ts`** — the `/Resources` dictionary: `/Font`,
  `/XObject` and `/ExtGState` registered per page.
- **`obj/page.ts`, `page_list.ts`, `catalog.ts`, `info.ts`, `object.ts`,
  `object_stream.ts`** — the indirect objects a document is made of.
- **`graphics.ts`** — `PdfCanvas`, the content-stream builder. It owns the
  coordinate flip (see §4) and appends operator strings to a buffer it never
  re-reads. It also allocates the `/F1`, `/F2`, … names it writes, because the
  resource dictionary has to agree with the operators.
- **`document.ts`** — the object registry, xref table and trailer. Produces the
  final `Uint8Array`.

### `src/widgets/` — the layout tree

- **`widget.ts`** — the `Widget` base class and the layout protocol (§3).
- **`geometry.ts`** — inset normalization (upstream `EdgeInsets`).
- **`text.ts`** — greedy line breaker plus the `Text` widget.
- **`flex.ts`** — `Column`, `Row`, `Spacer`.
- **`container.ts`** — `Container`: padding, margin, fill, border.
- **`shape.ts`** — `Vector`, the imperative drawing surface.
- **`page.ts`** — one physical page; overflow is an error.
- **`multi_page.ts`** — pagination with per-page header and footer.
- **`document.ts`** — `Document`, which renders sections and serializes.

## 3. The layout protocol

This is the one structural divergence from upstream worth knowing before
touching any widget.

**dart_pdf:** `layout()` mutates the widget — it assigns `widget.box`. The
widget instance therefore carries the result of its most recent layout.

**js_pdf:** `layout()` is pure and *returns* a box.

```ts
abstract class Widget<TData = unknown> {
  abstract layout(context: RenderContext, constraints: Constraints): LayoutBox<TData>;
  abstract paint(context: RenderContext, box: PositionedBox<TData>): void;
}
```

`TData` is the widget's private hand-off from measure to paint — wrapped lines
for `Text`, child boxes for `Column`, a scale factor for `Vector`. The type
parameter is what makes the hand-off safe: the box `layout()` returns is exactly
the box `paint()` receives, so the two cannot drift. The parent decides `x`/`y`
and passes them in via `PositionedBox`.

Two consequences:

- A widget instance is reusable. `MultiPage` re-lays the same child against a
  fresh page after a break; with upstream's mutating design that would clobber
  the first result.
- A widget must never cache layout state on `this`. If you find yourself
  writing `this.something = ...` inside `layout()`, it belongs in `TData`.

**Heterogeneous children.** `Column`, `Row` and `Container` hold children of
unrelated data types, typed as `AnyWidget = Widget<unknown>`. That is not an
escape hatch: `paint` is declared with method syntax, which TypeScript relates
bivariantly, so a `Widget<TextLayoutData>` is assignable to `Widget<unknown>`
and no `any` appears in the public types.

**Render context** — the object threaded through both calls:

```ts
interface RenderContext {
  document: Document;
  canvas: PdfCanvas;
  pageFormat: PageSize;
  pageNumber: number;
}
```

A section builds this from a `DocumentContext` (`{ document }`) once it has a
canvas. Upstream's `Context` also carries an inherited-widget map for `Theme`
and `Font`; the port has no theming yet, so the context stays flat.

## 4. Coordinates

PDF user space has its origin at the **bottom-left** with **y growing upward**.
The widget layer works in **top-left, y-down** coordinates, like every other
layout system.

The flip happens in exactly one place: `PdfCanvas`. Every method takes top-left
coordinates and converts internally (`bottom = pageHeight - top - height`).

> Widget code must never perform the flip itself. If a widget subtracts from
> `pageHeight`, that is a bug.

## 5. Known divergences

Beyond "not implemented yet", these are places where the port behaves
*differently* from upstream and will keep doing so until the corresponding
roadmap phase lands.

| Area | dart_pdf | js_pdf |
|---|---|---|
| Font metrics | Real AFM tables for the 14 standard fonts; `hmtx` for TTF | Real Type1 AFM tables; no TTF metrics until phase 1.1 |
| Text encoding | WinAnsi *or* hex-encoded CID strings for TTF | WinAnsi only; anything outside becomes `?` |
| Object model | One `PdfObject` subclass per indirect object, each self-serializing | Flat object table in `pdf/document.ts` |
| Colors | `PdfColor` value type with CMYK and HSL variants | RGB triple, DeviceRGB only |
| Flex | Full Flutter flex: alignments, `Expanded`, `FlexFit`, `mainAxisSize` | `gap`, and fixed ratio `widths` on `Row` |
| Pagination | `SpanningWidget` splits a tall widget across pages | Tall widget throws `RangeError` |
| Decoration | `BoxDecoration`: gradients, shapes, radii, shadows, per-side borders | Flat `background` / `borderColor` / `borderWidth` |
| Async | `save()` returns a `Future` | `save()` returns `Uint8Array` |

Type1 line breaks and alignment now match dart_pdf's AFM inputs. The remaining
font-metrics divergence belongs to embedded TTF, which starts in phase 1.1.

## 6. Build

Two stages. `tsc` compiles `src/*.ts` to `build/` and writes declarations
straight to `dist/types/`; rollup then bundles `build/index.js` into single-file
ES modules.

| Artifact | Purpose |
|---|---|
| `dist/js_pdf.mjs` | canonical readable build — what `package.json` `exports` resolves to |
| `dist/js_pdf.min.mjs` | canonical minified build — `exports` `./min`, plus `unpkg`/`jsdelivr` |
| `dist/js_pdf-<version>.mjs` | versioned copy, for vendoring into a host directory |
| `dist/js_pdf-<version>.min.mjs` | versioned minified copy |
| `dist/types/**.d.ts` | declarations, emitted by tsc; `package.json` `types` |

The canonical pair and the declarations are committed; the versioned pair is
gitignored and regenerated per release, so the repository does not accumulate
one file per version. Everything ships in the npm tarball. `build/` is an
intermediate and is gitignored.

**Why rollup consumes tsc's output** rather than transpiling TypeScript itself:
TypeScript 7 ships the native compiler and no longer exposes the old JavaScript
compiler API, so `@rollup/plugin-typescript` and `rollup-plugin-dts` both fail
against it unless a legacy-compiler compatibility package is added back. Routing
through `tsc` keeps the compiler as the single source of truth for both the
emitted JavaScript and the declarations, and costs no extra dependency. The
trade is that declarations ship as a tree under `dist/types/` rather than one
flattened `.d.ts`.

**Comments.** Every artifact carries the attribution banner and *no other
comment*. Terser handles both builds — `compress`/`mangle` off for the readable
one, on for the minified one — with `format.comments: false` plus an explicit
`format.preamble`. A comment filter would be fragile; stripping everything and
re-adding the banner is not.

This is why a comment in `src/` that merely *mentions* a forbidden identifier
fails the build: the source comment is gone from `dist`, but `test/dist.test.mjs`
greps the built output, and the check in `tools/check-source.mjs` only skips a
file's own header. Describe host APIs in prose, not by name.

Consumption targets:

- **Node / bundlers** — `js_pdf` resolves to the readable build with types;
  `js_pdf/min` is exported too.
- **Browser** — one `<script type="importmap">` entry, no build step.
- **ClearScript** — `ModuleCategory.Standard`, loaded from the filesystem.

`test/dist.test.mjs` asserts, for each of the four JavaScript artifacts, that it
opens with the exact banner, contains exactly one block comment and no line
comments, has no imports or host APIs, is minified or readable as intended, and
produces byte-identical PDFs to `src/`. The tests import `src/index.ts` directly
— Node strips the types — so they exercise the sources, not the bundle.

## 7. Adding a subsystem

1. Find the upstream file(s) in `dart_pdf`'s `pdf/lib/src/`.
2. Create the mirror path under `src/`.
3. Copy the attribution header from an existing file, and list every `.dart`
   file the new module draws from.
4. Implement in TypeScript (§1b). Stay inside the runtime contract (§1) and the
   layout protocol (§3). Relative imports end in `.ts`.
5. Add tests under `test/`. Assert on emitted PDF operators, not on rendering.
6. Run `npm run verify`.
7. **Update [PORTING-STATUS.md](PORTING-STATUS.md) and [ROADMAP.md](ROADMAP.md).**
   This is not optional — those two files are how the next session knows where
   the work stands.

/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/format/diagnostic.dart
 *
 * DIVERGENCE: upstream's diagnostics are written into the PDF itself — with
 * `verbose` on, every object gains comments describing how it was built, which
 * a developer reads by opening the file in a text editor. That is a debugging
 * aid for the document's structure.
 *
 * This is a different thing wearing the same name: a channel for warning the
 * caller about a choice that will cost them, while there is still time to make
 * another one. The caller may supply the sink, and then decides whether the
 * message ends up on a terminal, in a log aggregator, or nowhere. With no sink
 * installed the warning goes to the host console, if the host has one.
 *
 * That console is the one deliberate exception to the rule in AGENTS.md §2 that
 * `src/` references no host API, and it is written to survive the rule being
 * true: the reference is optional at every step, so a host that provides no
 * console is not a host this code breaks on. It is reached through `globalThis`
 * rather than as a bare name for exactly that reason — optional chaining guards
 * a value that is `undefined`, but a bare `console` that was never declared is
 * a `ReferenceError` before the chain is ever consulted. The local `ConsoleLike`
 * is what keeps `tsconfig.json` honest; widening `lib` to `dom` to get the real
 * declaration would drop `document`, `window` and `fetch` into `src/` with it.
 */

/** Receives a warning. Called synchronously, during document construction. */
export type PdfDiagnosticHandler = (message: string) => void;

/** As much of the host console as this module is willing to depend on. */
interface ConsoleLike {
  warn?(message: string): void;
}

let handler: PdfDiagnosticHandler | null = null;

/**
 * Install the sink warnings are delivered to, replacing any previous one.
 *
 * Pass `null` to go back to the default, which is the host console.
 */
export function setPdfDiagnosticHandler(next: PdfDiagnosticHandler | null): void {
  handler = next;
}

/** The installed sink, or `null` when the host console is being used. */
export function pdfDiagnosticHandler(): PdfDiagnosticHandler | null {
  return handler;
}

/** Deliver `message` to the installed sink, or to the host console. */
export function reportPdfDiagnostic(message: string): void {
  if (handler !== null) {
    handler(message);
    return;
  }

  const console = (globalThis as { console?: ConsoleLike }).console;
  console?.warn?.(message);
}

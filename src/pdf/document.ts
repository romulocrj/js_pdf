/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/document.dart
 *   - pdf/lib/src/pdf/format/xref.dart
 *   - pdf/lib/src/pdf/obj/object.dart
 *   - pdf/lib/src/pdf/obj/catalog.dart
 *   - pdf/lib/src/pdf/obj/page.dart
 *   - pdf/lib/src/pdf/obj/page_list.dart
 *   - pdf/lib/src/pdf/obj/info.dart
 *   - pdf/lib/src/pdf/obj/type1_font.dart
 *
 * Upstream keeps one class per indirect object and lets each serialize itself.
 * The port collapses that hierarchy into a flat object table because the
 * currently supported object set is small and fixed. Reintroducing the
 * `PdfObject` hierarchy is phase 0.2 of docs/ROADMAP.md and a prerequisite for
 * images, TTF fonts and annotations.
 */

import { formatNumber } from './format/num.ts';
import { pdfLiteral } from './format/string.ts';
import { concatBytes, encodeLatin1 } from './format/stream.ts';
import type { PageSize } from './page_format.ts';

export interface DocumentMetadata {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;
}

/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
  readonly format: PageSize;
  readonly content: string;
}

function metadataDictionary(metadata: DocumentMetadata): string {
  const entries: string[] = [];
  if (metadata.title) entries.push(`/Title ${pdfLiteral(metadata.title)}`);
  if (metadata.author) entries.push(`/Author ${pdfLiteral(metadata.author)}`);
  if (metadata.subject) entries.push(`/Subject ${pdfLiteral(metadata.subject)}`);
  if (metadata.creator) entries.push(`/Creator ${pdfLiteral(metadata.creator)}`);
  if (metadata.producer) entries.push(`/Producer ${pdfLiteral(metadata.producer)}`);
  return `<< ${entries.join(' ')} >>`;
}

/** Write the object table, the classic cross-reference table and the trailer. */
export function serializePdf(
  pages: readonly SerializedPage[],
  metadata: DocumentMetadata
): Uint8Array {
  // Index 0 is the free head of the xref table and is never emitted as an
  // object; `null` marks an id that has been reserved but not yet filled.
  const objects: (string | null)[] = [null];
  const allocate = (body: string): number => {
    objects.push(body);
    return objects.length - 1;
  };

  const catalogId = allocate('');
  const pagesId = allocate('');
  const fontId = allocate('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const infoId = allocate(metadataDictionary(metadata));
  const pageIds: number[] = [];

  for (const page of pages) {
    const contentBytes = encodeLatin1(page.content);
    const contentId = allocate(`<< /Length ${contentBytes.length} >>\nstream\n${page.content}endstream`);
    const pageId = allocate(
      `<< /Type /Page /Parent ${pagesId} 0 R ` +
      `/MediaBox [0 0 ${formatNumber(page.format.width)} ${formatNumber(page.format.height)}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  const header = encodeLatin1('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
  const chunks: Uint8Array[] = [header];
  const xrefLines: string[] = ['0000000000 65535 f \n'];
  let byteOffset = header.length;

  for (let id = 1; id < objects.length; id++) {
    const body = objects[id];
    if (body == null) {
      throw new Error(`PDF object ${id} was allocated but never filled`);
    }

    xrefLines.push(`${String(byteOffset).padStart(10, '0')} 00000 n \n`);
    const bytes = encodeLatin1(`${id} 0 obj\n${body}\nendobj\n`);
    chunks.push(bytes);
    byteOffset += bytes.length;
  }

  const xrefOffset = byteOffset;
  const trailer = [
    `xref\n0 ${objects.length}\n`,
    xrefLines.join(''),
    `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`
  ].join('');
  chunks.push(encodeLatin1(trailer));

  return concatBytes(chunks);
}

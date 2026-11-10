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
 *   - pdf/lib/src/pdf/obj/pdfa/pdfa_rdf.dart
 *
 * `create()` returns the packet as a string; upstream returns a parsed
 * `XmlDocument`, and the port has no XML library. Values are escaped and
 * unset fields omitted from the start, as upstream #1980 (Baghdady92) fixed:
 * interpolating caller values into the template let markup rewrite the
 * packet, the `pdfaid` claim included, and every unset field wrote `null`.
 *
 * Port additions: `part`, `conformance` and `modificationDate`. Upstream
 * always claims PDF/A-3B and writes no `xmp:ModifyDate`. Dates are UTC with a
 * `Z`, like the `/Info` dates, where upstream writes local time with its
 * offset. The packet is wrapped in `x:xmpmeta`, as XMP writers conventionally
 * do; upstream starts at `rdf:RDF`, which XMP also allows.
 */

import { PdfaDateFormat } from './pdfa_date_format.ts';

export interface PdfaRdfOptions {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly creator?: string | null;
  readonly subject?: string | null;
  readonly keywords?: string | null;
  readonly producer?: string | null;
  /** `xmp:CreateDate`; now when omitted. */
  readonly creationDate?: Date | null;
  /** `xmp:ModifyDate`, written only when given. */
  readonly modificationDate?: Date | null;
  readonly part?: number;
  readonly conformance?: string;
  /** Raw RDF inserted inside `rdf:RDF`, such as `PdfaFacturxRdf().create()`. */
  readonly invoiceRdf?: string;
}

/**
 * Drop the characters XML 1.0 forbids: escaping alone would leave a NUL or a
 * stray control character no parser reads back. Lone surrogates and the two
 * noncharacters go too, since they cannot be written as UTF-8.
 */
export function pdfaClean(value: string): string {
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '');
}

/** `value` as XML character data. `\r` is a reference, or a parser reads `\n`. */
export function xmlText(value: string): string {
  return pdfaClean(value).replace(/[&<>\r]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&#xD;'));
}

const iso = (date: Date): string => `${new PdfaDateFormat().format({ dt: date, asIso: true })}Z`;

/** The XMP packet a PDF/A file carries as its catalog `/Metadata`. */
export class PdfaRdf {
  readonly title: string | null;
  readonly author: string | null;
  readonly creator: string | null;
  readonly subject: string | null;
  readonly keywords: string | null;
  readonly producer: string | null;
  readonly creationDate: Date;
  readonly modificationDate: Date | null;
  readonly part: number;
  readonly conformance: string;
  readonly invoiceRdf: string;

  constructor({
    title = null, author = null, creator = null, subject = null, keywords = null, producer = null,
    creationDate = null, modificationDate = null, part = 3, conformance = 'B', invoiceRdf = ''
  }: PdfaRdfOptions = {}) {
    this.title = title;
    this.author = author;
    this.creator = creator;
    this.subject = subject;
    this.keywords = keywords;
    this.producer = producer;
    this.creationDate = creationDate ?? new Date();
    this.modificationDate = modificationDate;
    this.part = part;
    this.conformance = conformance;
    this.invoiceRdf = invoiceRdf;
  }

  create(): string {
    const property = (name: string, value: string | null, wrap = (text: string): string => text): string | null =>
      value === null ? null : `<${name}>${wrap(xmlText(value))}</${name}>`;
    const alt = (text: string): string => `<rdf:Alt><rdf:li xml:lang="x-default">${text}</rdf:li></rdf:Alt>`;
    // A description with no properties is left out rather than written empty.
    const description = (prefix: string, uri: string, properties: readonly (string | null)[]): string => {
      const present = properties.filter(entry => entry !== null);
      return present.length === 0 ? ''
        : `  <rdf:Description rdf:about="" xmlns:${prefix}="${uri}">\n    ${present.join('\n    ')}\n  </rdf:Description>\n`;
    };
    return '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
      + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
      + description('pdf', 'http://ns.adobe.com/pdf/1.3/', [property('pdf:Producer', this.producer), property('pdf:Keywords', this.keywords)])
      + description('xmp', 'http://ns.adobe.com/xap/1.0/', [
        `<xmp:CreateDate>${iso(this.creationDate)}</xmp:CreateDate>`,
        this.modificationDate === null ? null : `<xmp:ModifyDate>${iso(this.modificationDate)}</xmp:ModifyDate>`,
        property('xmp:CreatorTool', this.creator)
      ])
      + description('dc', 'http://purl.org/dc/elements/1.1/', [
        property('dc:creator', this.author, text => `<rdf:Seq><rdf:li>${text}</rdf:li></rdf:Seq>`),
        property('dc:title', this.title, alt),
        property('dc:description', this.subject, alt)
      ])
      + description('pdfaid', 'http://www.aiim.org/pdfa/ns/id/', [
        property('pdfaid:part', String(this.part)), property('pdfaid:conformance', this.conformance)
      ])
      + (this.invoiceRdf === '' ? '' : `${this.invoiceRdf}\n`)
      + '</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="r"?>';
  }
}

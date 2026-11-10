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
 *   - pdf/lib/src/pdf/obj/pdfa/pdfa_facturx_rdf.dart
 *
 * The four values are XML-escaped; upstream interpolates them raw, so a file
 * name holding `&` produced a packet no parser reads.
 */

import { xmlText } from './pdfa_rdf.ts';

/** One `pdfaProperty` entry of the extension schema. */
const property = (name: string, description: string): string => `<rdf:li rdf:parseType="Resource">
<pdfaProperty:name>${name}</pdfaProperty:name>
<pdfaProperty:valueType>Text</pdfaProperty:valueType>
<pdfaProperty:category>external</pdfaProperty:category>
<pdfaProperty:description>${description}</pdfaProperty:description>
</rdf:li>
`;

/**
 * The Factur-X / ZUGFeRD RDF for `PdfaRdf`'s `invoiceRdf` (or a document's
 * `pdfa.extensionRdf`): the `fx` properties plus the PDF/A extension schema
 * that declares them, which PDF/A requires for any non-standard namespace.
 * Indentation is dropped; XML ignores it between elements.
 */
export class PdfaFacturxRdf {
  create({
    filename = 'factur-x.xml',
    namespace = 'urn:cen.eu:invoice:1p0:schema#',
    conformanceLevel = 'BASIC',
    version = '1.0'
  }: {
    readonly filename?: string;
    readonly namespace?: string;
    readonly conformanceLevel?: string;
    readonly version?: string;
  } = {}): string {
    const uri = xmlText(namespace);
    return `<rdf:Description xmlns:fx="${uri.replace(/"/g, '&quot;')}" rdf:about="">
<fx:DocumentType>INVOICE</fx:DocumentType>
<fx:DocumentFileName>${xmlText(filename)}</fx:DocumentFileName>
<fx:Version>${xmlText(version)}</fx:Version>
<fx:ConformanceLevel>${xmlText(conformanceLevel)}</fx:ConformanceLevel>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" \
xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Invoice PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>${uri}</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
${property('DocumentFileName', 'name of the embedded XML invoice file')}${property('DocumentType', 'INVOICE')}\
${property('Version', 'The actual version of the ZUGFeRD data')}${property('ConformanceLevel', 'The conformance level of the ZUGFeRD data')}\
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>`;
  }
}

/*
 * js_pdf PDF/A phase 6.11 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

const ITEMS = [
  ['1', 'Archival storage, 12 months', '1', '240.00'],
  ['2', 'Document conversion', '35', '1.50'],
  ['3', 'Télécommunications & support', '2', '45.00']
];

/** A minimal Factur-X (UN/CEFACT CII) payload. Sample data, not a complete invoice. */
const INVOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter>
    <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
  </ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument><ram:ID>JSPDF-2026-611</ram:ID><ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">20261110</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction><ram:ApplicableHeaderTradeSettlement>
    <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
    <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      <ram:TaxBasisTotalAmount>382.50</ram:TaxBasisTotalAmount>
      <ram:DuePayableAmount>459.00</ram:DuePayableAmount>
    </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
  </ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;

/**
 * A PDF/A-3B invoice with an embedded Factur-X XML, then a page that tries
 * three documents PDF/A forbids and prints the errors `save()` raised.
 *
 * `assets` holds the bytes of examples/assets/OpenSans-Regular.ttf and
 * OpenSans-Bold.ttf (SIL OFL 1.1) and of examples/assets/JsPdfSrgbExample.icc,
 * the port-authored example profile. Production PDF/A should embed a standard
 * profile such as the ICC's sRGB2014. Conformance has not been verified with
 * veraPDF.
 */
export function generatePdfaPhase611(api = defaultApi, compress = true, assets = {}) {
  const { regular, bold, colorProfile } = assets;
  if (![regular, bold, colorProfile].every(bytes => bytes instanceof Uint8Array)) {
    throw new TypeError('generatePdfaPhase611 needs { regular, bold, colorProfile }: OpenSans-Regular.ttf, OpenSans-Bold.ttf and JsPdfSrgbExample.icc');
  }
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, Container, SizedBox, Expanded, BoxDecoration,
    Border, BorderRadius, LinearGradient, Opacity, TableHelper, TableBorder, UrlLink, SquareAnnotation, TextField,
    Checkbox, ThemeData, Font, PdfColors, PdfColor, PdfColorGrey, PdfColorCmyk, PdfaFacturxRdf } = api;

  const regularFont = Font.ttf(regular);
  const boldFont = Font.ttf(bold);
  const theme = ThemeData.withFont({ base: regularFont, bold: boldFont, italic: regularFont, boldItalic: boldFont });
  const created = new Date(Date.UTC(2026, 10, 10, 9, 0, 0));
  const pdfa = {
    part: 3,
    conformance: 'B',
    colorProfile,
    outputCondition: 'js_pdf sRGB-like example profile',
    attachments: [{
      name: 'factur-x.xml',
      data: INVOICE_XML,
      mimeType: 'text/xml',
      relationship: 'Alternative',
      description: 'Factur-X invoice data',
      modificationDate: created
    }],
    extensionRdf: new PdfaFacturxRdf().create({ conformanceLevel: 'MINIMUM' })
  };
  const document = new Document({
    compress,
    theme,
    title: 'PDF/A-3B archive - phase 6.11',
    author: 'Romulo Campos',
    subject: 'Output intent, XMP metadata, /ID and an embedded invoice',
    keywords: 'js_pdf, PDF/A-3, Factur-X',
    creator: 'js_pdf examples',
    creationDate: created,
    pdfa
  });

  const ink = PdfColors.blueGrey900;
  const text = (value, size = 9, color = ink, weight = 'normal') =>
    new Text(value, { style: new TextStyle({ fontSize: size, color, fontWeight: weight }) });
  const caption = value => text(value, 8, PdfColors.blueGrey600);
  const heading = value => text(value, 13, PdfColors.indigo, 'bold');
  const panel = (title, ...children) => new Container({
    padding: 8,
    decoration: new BoxDecoration({ color: PdfColors.grey50, border: Border.all({ color: PdfColors.blueGrey200, width: 0.5 }) }),
    child: new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 4, children: [text(title, 10, PdfColors.indigo, 'bold'), ...children] })
  });
  const fact = (label, value) => new Row({ crossAxisAlignment: 'start', children: [
    new SizedBox({ width: 92, child: caption(label) }), new Expanded({ child: text(value, 8) })
  ] });
  const swatch = (label, color, child = null) => new Column({ mainAxisSize: 'min', gap: 2, children: [
    child ?? new Container({ width: 46, height: 24, decoration: new BoxDecoration({ color, borderRadius: BorderRadius.circular(3) }) }),
    caption(label)
  ] });

  const total = ITEMS.reduce((sum, [, , qty, price]) => sum + Number(qty) * Number(price), 0);
  document.addPage(new Page({
    pageFormat: PageFormat.A4,
    margin: 36,
    build: () => new Column({ crossAxisAlignment: 'start', gap: 10, children: [
      new Row({ children: [
        new Expanded({ child: new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 2, children: [
          text('INVOICE JSPDF-2026-611', 18, PdfColors.indigo, 'bold'),
          caption('Issued 10 November 2026 - archived as PDF/A-3B with its Factur-X data embedded')
        ] }) }),
        new UrlLink({ destination: 'https://github.com/romulocrj/js_pdf', child: text('github.com/romulocrj/js_pdf', 8, PdfColors.blue700) })
      ] }),
      TableHelper.fromTextArray({
        headers: ['#', 'Item', 'Qty', 'Price'],
        data: ITEMS,
        cellAlignments: { 2: 'centerRight', 3: 'centerRight' },
        headerStyle: new TextStyle({ fontSize: 9, color: PdfColors.white, fontWeight: 'bold' }),
        headerDecoration: new BoxDecoration({ color: PdfColors.indigo }),
        cellStyle: new TextStyle({ fontSize: 9 }),
        border: TableBorder.all({ color: PdfColors.blueGrey300, width: 0.5 })
      }),
      new Row({ mainAxisAlignment: 'end', children: [text(`Total EUR ${total.toFixed(2)} + VAT 20% = ${(total * 1.2).toFixed(2)}`, 11, ink, 'bold')] }),
      heading('What the file declares'),
      new Row({ crossAxisAlignment: 'start', gap: 10, children: [
        new Expanded({ child: panel('Conformance',
          fact('XMP pdfaid', 'part 3, conformance B'),
          fact('Output intent', 'GTS_PDFA1, an RGB ICC v2 profile (/N 3)'),
          fact('Trailer /ID', '16 bytes hashed from the content: save() is repeatable'),
          fact('Fonts', 'Open Sans, embedded as subsets with ToUnicode maps'),
          fact('Info and XMP', 'title, author, subject, keywords, creator, producer and both dates agree')
        ) }),
        new Expanded({ child: panel('Attachment (PDF/A-3)',
          fact('Name', 'factur-x.xml, in /EmbeddedFiles and /AF'),
          fact('Relationship', '/AFRelationship /Alternative'),
          fact('Subtype', 'text/xml, /Params /Size in bytes'),
          fact('XMP extension', 'the Factur-X fx schema, declared through pdfaExtension')
        ) })
      ] }),
      heading('Colour and transparency under an RGB output intent'),
      new Row({ gap: 12, children: [
        swatch('RGB', PdfColors.teal),
        swatch('Gray', new PdfColorGrey(0.35)),
        swatch('Alpha 0.5', new PdfColor(0.9, 0.2, 0.2, 0.5)),
        swatch('Opacity', null, new Opacity({ opacity: 0.4, child: new Container({ width: 46, height: 24, color: PdfColors.indigo }) })),
        swatch('Gradient', null, new Container({ width: 92, height: 24, decoration: new BoxDecoration({
          gradient: new LinearGradient({ colors: [PdfColors.amber, PdfColors.deepOrange, PdfColors.purple] }) }) }))
      ] }),
      caption('PDF/A-2 and -3 allow transparency; PDF/A-1, which forbids it, is rejected. DeviceCMYK is rejected under an RGB profile.'),
      heading('Annotations: printable, with a normal appearance'),
      new Row({ gap: 12, crossAxisAlignment: 'center', children: [
        new SquareAnnotation({ color: PdfColors.red, content: 'Reviewed', child: new Container({ width: 60, height: 22, alignment: 'center',
          decoration: new BoxDecoration({ border: Border.all({ color: PdfColors.red, width: 1 }) }), child: text('Reviewed', 8, PdfColors.red) }) }),
        new TextField({ name: 'reference', width: 120, height: 18, value: 'JSPDF-2026-611', textStyle: new TextStyle({ fontSize: 9 }) }),
        new Checkbox({ name: 'archived', value: true, width: 14, height: 14 }),
        caption('Square: an empty /AP over its painted child. Field and checkbox: /N only, /F 4.')
      ] })
    ] })
  }));

  // What PDF/A forbids and the port can see is refused at save().
  const attempt = (label, options, child) => {
    try {
      const probe = new Document({ creationDate: created, ...options });
      probe.addPage(new Page({ build: () => child }));
      probe.save();
      return [label, 'saved'];
    } catch (error) {
      return [label, `${error.constructor.name}: ${error.message}`];
    }
  };
  const refusals = [
    attempt('Default Helvetica theme', { pdfa: { colorProfile } }, new Text('Helvetica')),
    attempt('PdfColorCmyk under an RGB profile', { theme, pdfa: { colorProfile } },
      new Text('CMYK', { style: new TextStyle({ color: new PdfColorCmyk(0, 0.8, 1, 0) }) })),
    attempt('Part 1', { theme, pdfa: { colorProfile, part: 1 } }, new Text('Part 1')),
    attempt('An attachment in PDF/A-2', { theme, pdfa: { colorProfile, part: 2, attachments: [{ name: 'a.xml', data: '<a/>' }] } }, new Text('A-2')),
    attempt('A truncated ICC profile', { theme, pdfa: { colorProfile: colorProfile.subarray(0, 64) } }, new Text('ICC'))
  ];
  document.addPage(new Page({
    pageFormat: PageFormat.A4,
    margin: 36,
    build: () => new Column({ crossAxisAlignment: 'start', gap: 10, children: [
      heading('Refused before a byte is written'),
      caption('Each row builds a second document that PDF/A forbids, calls save() and prints the error it raised.'),
      ...refusals.map(([label, message]) => panel(label, text(message, 8))),
      caption('Not checked: veraPDF has not been run on this file. See AI_USAGE.md, "PDF/A", for what the port checks and what it leaves to a validator.')
    ] })
  }));
  return document.save();
}

/*
 * js_pdf port of demo/lib/examples/document.dart from dart_pdf.
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';
import { customData, requireFeatures } from './upstream-example-helpers.mjs';

export function generateDocument(format = pw.PageFormat.A4, data = customData, resources = {}) {
  requireFeatures(pw, 'document', [
    'Align', 'Bullet', 'Center', 'EdgeInsets', 'Font',
    'Header', 'Padding', 'PageTheme', 'Paragraph', 'PdfLogo', 'RichText', 'SizedBox',
    'SvgImage', 'TableOfContent', 'TextSpan', 'TextStyle',
    'Theme', 'ThemeData', 'UrlLink'
  ]);

  const doc = new pw.Document({ pageMode: 'outlines' });
  const font1 = data.testing ? pw.Font.helvetica() : pw.Font.ttf(resources.openSans);
  const font2 = data.testing ? pw.Font.helveticaBold() : pw.Font.ttf(resources.openSansBold);
  const theme = pw.ThemeData.withFont({ base: font1, bold: font2 });

  doc.addPage(
    new pw.Page({
      pageTheme: new pw.PageTheme({
        pageFormat: { ...format, marginBottom: 0, marginLeft: 0, marginRight: 0, marginTop: 0 },
        orientation: 'portrait',
        buildBackground: () => new pw.SvgImage({ svg: resources.documentSvg, fit: 'fill' }),
        theme
      }),
      build: () => new pw.Padding({
        padding: new pw.EdgeInsets({ left: 60, right: 60, bottom: 30 }),
        child: new pw.Column({
          children: [
            new pw.Spacer(),
            new pw.RichText({
              text: new pw.TextSpan({
                children: [
                  new pw.TextSpan({
                    text: `${new Date().getFullYear()}\n`,
                    style: new pw.TextStyle({ fontWeight: 'bold', color: '#757575', fontSize: 40 })
                  }),
                  new pw.TextSpan({
                    text: 'Portable Document Format',
                    style: new pw.TextStyle({ fontWeight: 'bold', fontSize: 40 })
                  })
                ]
              })
            }),
            new pw.Spacer(),
            new pw.Container({ alignment: 'topRight', height: 150, child: new pw.PdfLogo() }),
            new pw.Spacer(2),
            new pw.Align({
              alignment: 'topLeft',
              child: new pw.UrlLink({
                destination: 'https://wikipedia.org/wiki/PDF',
                child: new pw.Text('https://wikipedia.org/wiki/PDF', {
                  style: new pw.TextStyle({ color: '#f8bbd0' })
                })
              })
            })
          ]
        })
      })
    })
  );

  doc.addPage(
    new pw.Page({
      theme,
      pageFormat: { ...format, marginBottom: 42.52 },
      orientation: 'portrait',
      build: context => new pw.Column({
        children: [
          new pw.Center({ child: new pw.Text('Table of content', { style: pw.Theme.of(context).header0 }) }),
          new pw.SizedBox({ height: 20 }),
          new pw.TableOfContent(),
          new pw.Spacer(),
          new pw.Center({ child: new pw.SvgImage({ svg: resources.swirls2Svg, width: 100, colorFilter: '#9e9e9e' }) }),
          new pw.Spacer()
        ]
      })
    })
  );

  const paragraphs = [
    new pw.Header({
      level: 0,
      title: 'Portable Document Format',
      child: new pw.Row({
        mainAxisAlignment: 'spaceBetween',
        children: [new pw.Text('Portable Document Format', { textScaleFactor: 2 }), new pw.PdfLogo()]
      })
    }),
    new pw.Paragraph({ text: 'The Portable Document Format (PDF) is a file format developed by Adobe in the 1990s to present documents, including text formatting and images, in a manner independent of application software, hardware, and operating systems. Based on the PostScript language, each PDF file encapsulates a complete description of a fixed-layout flat document, including the text, fonts, vector graphics, raster images and other information needed to display it. PDF was standardized as an open format, ISO 32000, in 2008, and no longer requires any royalties for its implementation.' }),
    new pw.Paragraph({ text: 'Today, PDF files may contain a variety of content besides flat text and graphics including logical structuring elements, interactive elements such as annotations and form-fields, layers, rich media (including video content) and three dimensional objects using U3D or PRC, and various other data formats. The PDF specification also provides for encryption and digital signatures, file attachments and metadata to enable workflows requiring these features.' }),
    new pw.Header({ level: 1, text: 'History and standardization' }),
    new pw.Paragraph({ text: "Adobe Systems made the PDF specification available free of charge in 1993. In the early years PDF was popular mainly in desktop publishing workflows, and competed with a variety of formats such as DjVu, Envoy, Common Ground Digital Paper, Farallon Replica and even Adobe's own PostScript format." }),
    new pw.Paragraph({ text: 'PDF was a proprietary format controlled by Adobe until it was released as an open standard on July 1, 2008, and published by the International Organization for Standardization as ISO 32000-1:2008, at which time control of the specification passed to an ISO Committee of volunteer industry experts. In 2008, Adobe published a Public Patent License to ISO 32000-1 granting royalty-free rights for all patents owned by Adobe that are necessary to make, use, sell, and distribute PDF compliant implementations.' }),
    new pw.Paragraph({ text: "PDF 1.7, the sixth edition of the PDF specification that became ISO 32000-1, includes some proprietary technologies defined only by Adobe, such as Adobe XML Forms Architecture (XFA) and JavaScript extension for Acrobat, which are referenced by ISO 32000-1 as normative and indispensable for the full implementation of the ISO 32000-1 specification. These proprietary technologies are not standardized and their specification is published only on Adobe's website. Many of them are also not supported by popular third-party implementations of PDF." }),
    new pw.Paragraph({ text: 'On July 28, 2017, ISO 32000-2:2017 (PDF 2.0) was published. ISO 32000-2 does not include any proprietary technologies as normative references.' }),
    new pw.Header({ level: 1, text: 'Technical foundations' }),
    new pw.Paragraph({ text: 'The PDF combines three technologies:' }),
    new pw.Bullet({ text: 'A subset of the PostScript page description programming language, for generating the layout and graphics.' }),
    new pw.Bullet({ text: 'A font-embedding/replacement system to allow fonts to travel with the documents.' }),
    new pw.Bullet({ text: 'A structured storage system to bundle these elements and any associated content into a single file, with data compression where appropriate.' }),
    new pw.Header({ level: 2, text: 'PostScript' }),
    new pw.Paragraph({ text: 'PostScript is a page description language run in an interpreter to generate an image, a process requiring many resources. It can handle graphics and standard features of programming languages such as if and loop commands. PDF is largely based on PostScript but simplified to remove flow control features like these, while graphics commands such as lineto remain.' }),
    new pw.Paragraph({ text: 'Often, the PostScript-like PDF code is generated from a source PostScript file. The graphics commands that are output by the PostScript code are collected and tokenized. Any files, graphics, or fonts to which the document refers also are collected. Then, everything is compressed to a single file. Therefore, the entire PostScript world (fonts, layout, measurements) remains intact.' }),
    new pw.Column({
      crossAxisAlignment: 'start',
      children: [
        new pw.Paragraph({ text: 'As a document format, PDF has several advantages over PostScript:' }),
        new pw.Bullet({ text: 'PDF contains tokenized and interpreted results of the PostScript source code, for direct correspondence between changes to items in the PDF page description and changes to the resulting page appearance.' }),
        new pw.Bullet({ text: 'PDF (from version 1.4) supports graphic transparency; PostScript does not.' }),
        new pw.Bullet({ text: 'PostScript is an interpreted programming language with an implicit global state, so instructions accompanying the description of one page can affect the appearance of any following page. Therefore, all preceding pages in a PostScript document must be processed to determine the correct appearance of a given page, whereas each page in a PDF document is unaffected by the others. As a result, PDF viewers allow the user to quickly jump to the final pages of a long document, whereas a PostScript viewer needs to process all pages sequentially before being able to display the destination page (unless the optional PostScript Document Structuring Conventions have been carefully complied with).' })
      ]
    }),
    new pw.Header({ level: 1, text: 'Content' }),
    new pw.Paragraph({ text: 'A PDF file is often a combination of vector graphics, text, and bitmap graphics. The basic types of content in a PDF are:' }),
    new pw.Bullet({ text: 'Text stored as content streams (i.e., not encoded in plain text)' }),
    new pw.Bullet({ text: 'Vector graphics for illustrations and designs that consist of shapes and lines' }),
    new pw.Bullet({ text: 'Raster graphics for photographs and other types of image' }),
    new pw.Bullet({ text: 'Multimedia objects in the document' }),
    new pw.Paragraph({ text: 'In later PDF revisions, a PDF document can also support links (inside document or web page), forms, JavaScript (initially available as plugin for Acrobat 3.0), or any other types of embedded contents that can be handled using plug-ins.' }),
    new pw.Paragraph({ text: 'PDF 1.6 supports interactive 3D documents embedded in the PDF - 3D drawings can be embedded using U3D or PRC and various other data formats.' }),
    new pw.Paragraph({ text: 'Two PDF files that look similar on a computer screen may be of very different sizes. For example, a high resolution raster image takes more space than a low resolution one. Typically higher resolution is needed for printing documents than for displaying them on screen. Other things that may increase the size of a file is embedding full fonts, especially for Asiatic scripts, and storing text as graphics. ' }),
    new pw.Header({ level: 1, text: 'File formats and Adobe Acrobat versions' }),
    new pw.Paragraph({ text: 'The PDF file format has changed several times, and continues to evolve, along with the release of new versions of Adobe Acrobat. There have been nine versions of PDF and the corresponding version of the software:' }),
    pw.TableHelper.fromTextArray({
      data: [
        ['Date', 'PDF Version', 'Acrobat Version'], ['1993', 'PDF 1.0', 'Acrobat 1'],
        ['1994', 'PDF 1.1', 'Acrobat 2'], ['1996', 'PDF 1.2', 'Acrobat 3'],
        ['1999', 'PDF 1.3', 'Acrobat 4'], ['2001', 'PDF 1.4', 'Acrobat 5'],
        ['2003', 'PDF 1.5', 'Acrobat 6'], ['2005', 'PDF 1.6', 'Acrobat 7'],
        ['2006', 'PDF 1.7', 'Acrobat 8'], ['2008', 'PDF 1.7', 'Acrobat 9'],
        ['2009', 'PDF 1.7', 'Acrobat 9.1'], ['2010', 'PDF 1.7', 'Acrobat X'],
        ['2012', 'PDF 1.7', 'Acrobat XI'], ['2017', 'PDF 2.0', 'Acrobat DC']
      ]
    }),
    new pw.Padding({ padding: new pw.EdgeInsets({ all: 10 }) }),
    new pw.Paragraph({ text: 'Text is available under the Creative Commons Attribution Share Alike License.' })
  ];

  doc.addPage(
    new pw.MultiPage({
      theme,
      pageFormat: { ...format, marginBottom: 42.52 },
      orientation: 'portrait',
      crossAxisAlignment: 'start',
      header: context => context.pageNumber === 1
        ? new pw.SizedBox()
        : new pw.Container({
            alignment: 'centerRight',
            margin: new pw.EdgeInsets({ bottom: 8.5 }),
            padding: new pw.EdgeInsets({ bottom: 8.5 }),
            decoration: new pw.BoxDecoration({ border: new pw.Border({ bottom: new pw.BorderSide({ width: 0.5, color: '#9e9e9e' }) }) }),
            child: new pw.Text('Portable Document Format', { style: new pw.TextStyle({ color: '#9e9e9e' }) })
          }),
      footer: context => new pw.Container({
        alignment: 'centerRight',
        margin: new pw.EdgeInsets({ top: 28.35 }),
        child: new pw.Text(`Page ${context.pageNumber} of ${context.pagesCount}`, { style: new pw.TextStyle({ color: '#9e9e9e' }) })
      }),
      build: () => paragraphs
    })
  );

  return doc.save();
}

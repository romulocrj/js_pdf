/*
 * js_pdf phase 6.11 PDF/A tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * No external validator runs here. These tests parse the generated file and
 * check the PDF/A-2B/3B (and U) requirements that can be checked structurally;
 * conformance has not been confirmed with veraPDF.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';
import { D50, srgbColorants, srgbCurve, srgbIccProfile, withColorSpace } from './support/icc-profile.mjs';

const asset = name => new Uint8Array(readFileSync(new URL('../examples/assets/' + name, import.meta.url)));
const regular = Pdf.Font.ttf(asset('OpenSans-Regular.ttf'));
const bold = Pdf.Font.ttf(asset('OpenSans-Bold.ttf'));
const icc = srgbIccProfile();
const DATE = new Date(Date.UTC(2026, 10, 10, 12, 30, 45));
const theme = () => Pdf.ThemeData.withFont({ base: regular, bold, italic: regular, boldItalic: bold });

function pdfaDocument({ pdfa = {}, ...options } = {}, children = [new Pdf.Text('Archived text')]) {
  const document = new Pdf.Document({
    title: 'PDF/A test',
    author: 'Ada Lovelace',
    subject: 'Archiving',
    keywords: 'pdfa, archive',
    creator: 'js_pdf tests',
    creationDate: DATE,
    theme: theme(),
    compress: false,
    ...options,
    pdfa: { colorProfile: icc, ...pdfa }
  });
  document.addPage(new Pdf.Page({ build: () => new Pdf.Column({ crossAxisAlignment: 'start', children }) }));
  return document;
}

/** The objects, trailer and catalog of a file, with every stream inflated. */
function parse(bytes) {
  const raw = Buffer.from(bytes).toString('latin1');
  const text = latin1(bytes);
  const objects = new Map();
  for (const match of text.matchAll(/(?:^|\n)(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(match[1]), match[2]);
  const trailer = /trailer\n(<<[\s\S]*?>>)\nstartxref/.exec(text)[1];
  const ref = (body, key) => Number(new RegExp(`\\${key} (\\d+) 0 R`).exec(body)?.[1]);
  return { raw, text, objects, trailer, ref, root: objects.get(ref(trailer, '/Root')), info: objects.get(ref(trailer, '/Info')) };
}

/** The raw data of stream object `id`, located by its `/Length`. */
function streamBytes(bytes, id) {
  const raw = Buffer.from(bytes).toString('latin1');
  const start = raw.indexOf(`\n${id} 0 obj\n`) + 1;
  const marker = raw.indexOf('\nstream\n', start);
  const length = Number(/\/Length (\d+)/.exec(raw.slice(start, marker))[1]);
  return Buffer.from(bytes).subarray(marker + 8, marker + 8 + length);
}

function xmpOf(bytes) {
  const pdf = parse(bytes);
  return streamBytes(bytes, pdf.ref(pdf.root, '/Metadata')).toString('utf8');
}

const unescapeXml = value => value.replace(/<[^>]+>/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The text content of every `name` element in an XMP packet. */
const xmpValues = (xmp, name) => [...xmp.matchAll(new RegExp(`<${name}(?: [^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))]
  .map(match => unescapeXml(match[1]));

/** Decode a PDF text string token: a literal or UTF-16BE hex. */
function pdfText(token) {
  if (token.startsWith('<')) {
    const hex = token.slice(1, -1);
    const units = [];
    for (let index = hex.toLowerCase().startsWith('feff') ? 4 : 0; index < hex.length; index += 4) units.push(parseInt(hex.slice(index, index + 4), 16));
    return String.fromCharCode(...units);
  }
  return token.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, escape) => (
    { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[escape] ?? (/^[0-7]/.test(escape) ? String.fromCharCode(parseInt(escape, 8)) : escape)
  ));
}

const infoValue = (info, key) => {
  const match = new RegExp(`\\${key} (\\((?:\\\\.|[^\\\\)])*\\)|<[0-9a-fA-F]*>)`).exec(info);
  return match === null ? null : pdfText(match[1]);
};

const pdfDate = value => {
  const [, y, mo, d, h, mi, s] = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  return Date.UTC(+y, mo - 1, +d, +h, +mi, +s);
};

test('the example ICC profile is a well-formed v2 display profile', () => {
  const view = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
  const tag = offset => String.fromCharCode(...icc.subarray(offset, offset + 4));
  assert.equal(view.getUint32(0), icc.length, 'the size field is the length');
  assert.equal(icc.length % 4, 0);
  assert.equal(view.getUint8(8), 2, 'version 2');
  assert.equal(view.getUint8(9), 0x10, 'version 2.1');
  assert.deepEqual([tag(12), tag(16), tag(20), tag(36)], ['mntr', 'RGB ', 'XYZ ', 'acsp']);
  assert.deepEqual([68, 72, 76].map(offset => view.getInt32(offset) / 65536), D50.map(v => Math.round(v * 65536) / 65536));
  assert.ok(icc.subarray(84, 128).every(byte => byte === 0), 'no profile id, reserved bytes zero');

  const count = view.getUint32(128);
  const tags = new Map();
  for (let index = 0; index < count; index++) {
    const at = 132 + index * 12;
    const offset = view.getUint32(at + 4);
    const size = view.getUint32(at + 8);
    assert.equal(offset % 4, 0, `${tag(at)} is 4-byte aligned`);
    assert.ok(offset >= 132 + count * 12 && offset + size <= icc.length, `${tag(at)} lies inside the profile`);
    tags.set(tag(at), { offset, size, type: tag(offset) });
  }
  assert.deepEqual([...tags.keys()], ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']);
  assert.deepEqual([...tags.values()].map(entry => entry.type),
    ['desc', 'text', 'XYZ ', 'XYZ ', 'XYZ ', 'XYZ ', 'curv', 'curv', 'curv']);
  for (const [name, entry] of tags) {
    if (entry.type === 'XYZ ') assert.equal(entry.size, 20, name);
  }

  // The colorants, read back from the file, are the sRGB primaries in D50.
  const read = name => [0, 1, 2].map(i => view.getInt32(tags.get(name).offset + 8 + i * 4) / 65536);
  const published = [[0.4360747, 0.2225045, 0.0139322], [0.3850649, 0.7168786, 0.0971045], [0.1430804, 0.0606169, 0.7141733]];
  ['rXYZ', 'gXYZ', 'bXYZ'].forEach((name, index) => read(name).forEach((value, i) => {
    assert.ok(Math.abs(value - published[index][i]) < 5e-4, `${name}[${i}] = ${value}`);
  }));
  const white = [0, 1, 2].map(i => srgbColorants().reduce((sum, colorant) => sum + colorant[i], 0));
  white.forEach((value, i) => assert.ok(Math.abs(value - D50[i]) < 1e-6, 'the colorants sum to the white point'));

  const curve = srgbCurve();
  assert.equal(view.getUint32(tags.get('rTRC').offset + 8), curve.length);
  assert.equal(curve[0], 0);
  assert.equal(curve.at(-1), 65535);
  assert.ok(curve.every((value, index) => index === 0 || value > curve[index - 1]), 'monotonic');
});

test('the committed example profile is the generator output', () => {
  assert.deepEqual(asset('JsPdfSrgbExample.icc'), icc);
});

test('PdfaRdf never writes the word null and omits unset fields', () => {
  const packet = new Pdf.PdfaRdf({ creationDate: DATE }).create();
  assert.equal(typeof packet, 'string');
  assert.doesNotMatch(packet, /null/);
  for (const element of ['pdf:Producer', 'pdf:Keywords', 'xmp:CreatorTool', 'dc:creator', 'dc:title', 'dc:description']) {
    assert.ok(!packet.includes(element), element);
  }
  assert.match(packet, /^<\?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"\?>/);
  assert.match(packet, /<\?xpacket end="r"\?>$/);
  assert.deepEqual(xmpValues(packet, 'pdfaid:part'), ['3']);
  assert.deepEqual(xmpValues(packet, 'pdfaid:conformance'), ['B']);
  assert.deepEqual(xmpValues(packet, 'xmp:CreateDate'), ['2026-11-10T12:30:45Z']);
  assert.doesNotMatch(packet, /pdf:ns|<rdf:Description[^>]*>\s*<\/rdf:Description>/, 'no empty descriptions');

  const titled = new Pdf.PdfaRdf({ title: 'T', creationDate: DATE }).create();
  assert.deepEqual(xmpValues(titled, 'dc:title'), ['T']);
  assert.ok(!titled.includes('dc:creator'));
});

test('PdfaRdf escapes every value and cannot be rewritten by one', () => {
  const hostile = 'a <b> & "c" \'d\' &amp; e\r]]>';
  const packet = new Pdf.PdfaRdf({
    title: hostile, author: hostile, creator: hostile, subject: hostile, keywords: hostile, producer: hostile, creationDate: DATE
  }).create();
  for (const element of ['dc:title', 'dc:creator', 'dc:description', 'xmp:CreatorTool', 'pdf:Keywords', 'pdf:Producer']) {
    assert.deepEqual(xmpValues(packet, element), [hostile], element);
  }
  assert.ok(!packet.includes('<b>'));

  const injected = new Pdf.PdfaRdf({
    title: '</rdf:li></rdf:Alt></dc:title><pdfaid:part>1</pdfaid:part><dc:title><rdf:Alt><rdf:li>',
    creationDate: DATE, part: 2, conformance: 'U'
  }).create();
  assert.deepEqual(xmpValues(injected, 'pdfaid:part'), ['2']);
  assert.deepEqual(xmpValues(injected, 'pdfaid:conformance'), ['U']);

  // Characters XML 1.0 forbids are dropped, not escaped.
  assert.deepEqual(xmpValues(new Pdf.PdfaRdf({ title: 'a\u0000b\u0001c￿', creationDate: DATE }).create(), 'dc:title'), ['abc']);
});

test('PdfaFacturxRdf describes the invoice with an extension schema', () => {
  const rdf = new Pdf.PdfaFacturxRdf().create({ filename: 'factur-x.xml', conformanceLevel: 'EN 16931' });
  assert.deepEqual(xmpValues(rdf, 'fx:DocumentFileName'), ['factur-x.xml']);
  assert.deepEqual(xmpValues(rdf, 'fx:ConformanceLevel'), ['EN 16931']);
  assert.deepEqual(xmpValues(rdf, 'fx:DocumentType'), ['INVOICE']);
  assert.match(rdf, /<pdfaSchema:prefix>fx<\/pdfaSchema:prefix>/);
  assert.deepEqual(xmpValues(rdf, 'pdfaProperty:name'), ['DocumentFileName', 'DocumentType', 'Version', 'ConformanceLevel']);
  assert.deepEqual(xmpValues(new Pdf.PdfaFacturxRdf().create({ filename: 'a&b.xml' }), 'fx:DocumentFileName'), ['a&b.xml']);
});

test('a PDF/A document carries the output intent, the XMP packet and a binary header', () => {
  const bytes = pdfaDocument().save();
  const pdf = parse(bytes);

  // ISO 19005-2 6.1.2: a comment of four bytes above 127 on line two.
  assert.equal(pdf.raw.slice(0, 9), '%PDF-1.7\n');
  assert.ok([...pdf.raw.slice(10, 14)].every(c => c.charCodeAt(0) > 127));

  const intents = /\/OutputIntents \[(<<[\s\S]*?>>)\]/.exec(pdf.root)[1];
  assert.match(intents, /\/Type \/OutputIntent/);
  assert.match(intents, /\/S \/GTS_PDFA1/);
  assert.match(intents, /\/OutputConditionIdentifier \(Custom\)/);
  const profileId = pdf.ref(intents, '/DestOutputProfile');
  assert.match(pdf.objects.get(profileId), /\/N 3\b/);
  assert.deepEqual(new Uint8Array(streamBytes(bytes, profileId)), icc);

  const metadata = pdf.objects.get(pdf.ref(pdf.root, '/Metadata'));
  assert.match(metadata, /\/Type \/Metadata/);
  assert.match(metadata, /\/Subtype \/XML/);
  assert.doesNotMatch(metadata, /\/Filter/, 'the XMP stream is never filtered');
  const xmp = xmpOf(bytes);
  assert.deepEqual(xmpValues(xmp, 'pdfaid:part'), ['3']);
  assert.deepEqual(xmpValues(xmp, 'pdfaid:conformance'), ['B']);
  assert.doesNotMatch(xmp, /null/);

  assert.doesNotMatch(pdf.text, /\/Encrypt|\/JavaScript|\/JS\b|\/AA\b|\/Launch/);
});

test('the output condition and the profile colour space are honoured', () => {
  const cmyk = withColorSpace(icc, 'CMYK');
  const document = pdfaDocument({ pdfa: { colorProfile: cmyk, outputCondition: 'FOGRA39' } },
    [new Pdf.Text('Black', { style: new Pdf.TextStyle({ color: new Pdf.PdfColorCmyk(0, 0, 0, 1) }) })]);
  const pdf = parse(document.save());
  const intents = /\/OutputIntents \[(<<[\s\S]*?>>)\]/.exec(pdf.root)[1];
  assert.match(intents, /\/OutputConditionIdentifier \(FOGRA39\)/);
  assert.match(intents, /\/Info \(FOGRA39\)/);
  assert.match(pdf.objects.get(pdf.ref(intents, '/DestOutputProfile')), /\/N 4\b/);
});

test('the Info dictionary and the XMP packet agree', () => {
  const title = 'Relatório <2026-001> & "Q" – €\u0001';
  const bytes = pdfaDocument({ title, producer: 'Acme service' }).save();
  const pdf = parse(bytes);
  const xmp = xmpOf(bytes);

  assert.equal(infoValue(pdf.info, '/Title'), 'Relatório <2026-001> & "Q" – €', 'the control character is dropped from both');
  const pairs = [
    ['/Title', 'dc:title'], ['/Author', 'dc:creator'], ['/Subject', 'dc:description'],
    ['/Keywords', 'pdf:Keywords'], ['/Creator', 'xmp:CreatorTool'], ['/Producer', 'pdf:Producer']
  ];
  for (const [key, element] of pairs) {
    assert.deepEqual(xmpValues(xmp, element), [infoValue(pdf.info, key)], `${key} = ${element}`);
  }
  assert.equal(infoValue(pdf.info, '/Producer'), 'Acme service (https://github.com/romulocrj/js_pdf)');
  assert.equal(pdfDate(infoValue(pdf.info, '/CreationDate')), DATE.getTime());
  assert.equal(pdfDate(infoValue(pdf.info, '/ModDate')), DATE.getTime());
  assert.equal(Date.parse(xmpValues(xmp, 'xmp:CreateDate')[0]), DATE.getTime());
  assert.equal(Date.parse(xmpValues(xmp, 'xmp:ModifyDate')[0]), DATE.getTime());
  assert.match(xmpValues(xmp, 'xmp:CreateDate')[0], /Z$/);
});

test('an unset Info field has no XMP property, and the clock is read once', () => {
  const document = new Pdf.Document({ theme: theme(), pdfa: { colorProfile: icc } });
  document.addPage(new Pdf.Page({ build: () => new Pdf.Text('x') }));
  const bytes = document.save();
  const pdf = parse(bytes);
  const xmp = xmpOf(bytes);
  for (const element of ['dc:title', 'dc:creator', 'dc:description', 'pdf:Keywords', 'xmp:CreatorTool']) {
    assert.ok(!xmp.includes(element), element);
  }
  assert.deepEqual(xmpValues(xmp, 'pdf:Producer'), ['https://github.com/romulocrj/js_pdf']);
  assert.equal(Date.parse(xmpValues(xmp, 'xmp:CreateDate')[0]), pdfDate(infoValue(pdf.info, '/CreationDate')));
});

test('extensionRdf is written inside the packet', () => {
  const extensionRdf = new Pdf.PdfaFacturxRdf().create();
  const xmp = xmpOf(pdfaDocument({ pdfa: { extensionRdf } }).save());
  assert.ok(xmp.includes(extensionRdf));
  assert.ok(xmp.indexOf(extensionRdf) < xmp.indexOf('</rdf:RDF>'));
});

test('the trailer carries a stable 16-byte /ID', () => {
  const document = pdfaDocument();
  const first = document.save();
  const second = document.save();
  assert.deepEqual(first, second, 'save() is repeatable');
  const id = /\/ID \[<([0-9a-f]{32})> <([0-9a-f]{32})>\]/.exec(parse(first).trailer);
  assert.ok(id, 'two 16-byte hex strings');
  assert.equal(id[1], id[2]);
  assert.notEqual(id[1], '0'.repeat(32));

  const idOf = bytes => /\/ID \[<([0-9a-f]{32})>/.exec(parse(bytes).trailer)[1];
  assert.equal(idOf(pdfaDocument().save()), id[1], 'the same input gives the same identifier');
  assert.notEqual(idOf(pdfaDocument({ title: 'Other title' }).save()), id[1]);
  assert.notEqual(idOf(pdfaDocument({}, [new Pdf.Text('Different text')]).save()), id[1]);
  assert.notEqual(idOf(pdfaDocument({ creationDate: new Date(DATE.getTime() + 1000) }).save()), id[1]);
});

test('every stream ends with an end-of-line marker that /Length does not count', () => {
  // ISO 19005-2 6.1.7.1. Uncompressed content ends with a line feed, which the
  // plain writer lets stand in for the marker.
  for (const compress of [false, true]) {
    const bytes = pdfaDocument({ compress }).save();
    const raw = Buffer.from(bytes).toString('latin1');
    let count = 0;
    for (const match of raw.matchAll(/\/Length (\d+)[^\n]*>>\nstream\n/g)) {
      const end = match.index + match[0].length + Number(match[1]);
      assert.match(raw.slice(end, end + 10), /^(\r\n|\n)endstream/, `stream at ${match.index}`);
      count++;
    }
    assert.ok(count > 3);
  }
});

test('all fonts are embedded and have a ToUnicode map', () => {
  const pdf = parse(pdfaDocument({ pdfa: { conformance: 'U' } },
    [new Pdf.Text('Regular'), new Pdf.Text('Bold', { style: new Pdf.TextStyle({ fontWeight: 'bold' }) })]).save());
  const fonts = [...pdf.objects.values()].filter(body => /^<< \/Type \/Font \/Subtype/.test(body));
  assert.equal(fonts.length, 2);
  for (const font of fonts) {
    assert.match(font, /\/Subtype \/Type0/);
    assert.match(font, /\/ToUnicode \d+ 0 R/);
  }
  const descriptors = [...pdf.objects.values()].filter(body => body.includes('/Type /FontDescriptor'));
  assert.equal(descriptors.length, 2);
  for (const descriptor of descriptors) assert.match(descriptor, /\/FontFile[23] \d+ 0 R/);
  assert.deepEqual(xmpValues(xmpOf(pdfaDocument({ pdfa: { conformance: 'U' } }).save()), 'pdfaid:conformance'), ['U']);
});

test('an embedded CFF encoding CMap carries its required dictionary keys', () => {
  // ISO 32000-1 Table 120 requires /Type, /CMapName and /CIDSystemInfo, and a
  // PDF/A validator compares the last with the CIDFont's (ISO 19005-2
  // 6.2.11.3.1). Written under PDF/A only, so other output is unchanged.
  for (const name of ['JsPdfCffExample.otf', 'JsPdfCffCidExample.otf']) {
    const cff = Pdf.Font.ttf(asset(name));
    const style = new Pdf.TextStyle({ font: cff });
    const pdf = parse(pdfaDocument({}, [new Pdf.Text('Café', { style })]).save());
    const font = [...pdf.objects.values()].find(body => body.includes('/CIDFontType0'));
    const encoding = pdf.objects.get(pdf.ref(font, '/Encoding'));
    const info = /\/CIDSystemInfo (<< [^>]* >>)/.exec(font)[1];
    assert.match(encoding, /\/Type \/CMap \/CMapName \/JsPdfEncoding/, name);
    assert.ok(encoding.includes(`/CIDSystemInfo ${info}`), name);

    const plain = latin1(new Pdf.Document({ compress: false }).addPage(new Pdf.Page({ build: () => new Pdf.Text('Café', { style }) })).save());
    assert.doesNotMatch(plain, /\/Type \/CMap/, 'unchanged without pdfa');
  }
});

test('PDF/A-3 attachments: byte sizes, a sorted escaped name tree and /AF', () => {
  const content = '<facture>Télécommunications & Électricité</facture>';
  const binary = Uint8Array.from([0, 1, 2, 255]);
  const modified = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
  const bytes = pdfaDocument({
    pdfa: {
      attachments: [
        { name: 'zeta.xml', data: content, description: 'Invoice data', modificationDate: modified },
        { name: 'alpha.bin', data: binary, mimeType: 'application/octet-stream', relationship: 'Source' },
        { name: 'we(ird\\.xml', data: '<a/>', relationship: 'Data' },
        { name: 'facture-€.xml', data: 'a\u{1F600}', relationship: 'Supplement' }
      ]
    }
  }).save();
  const pdf = parse(bytes);

  const af = /\/AF \[([^\]]*)\]/.exec(pdf.root)[1].match(/\d+ 0 R/g).map(ref => Number.parseInt(ref, 10));
  assert.equal(af.length, 4);
  const specs = af.map(id => pdf.objects.get(id));
  assert.match(specs[0], /\(zeta\.xml\)/, '/AF keeps the caller order');
  specs.forEach(spec => {
    assert.match(spec, /\/Type \/Filespec/);
    assert.match(spec, /\/F (\(|<)/);
    assert.match(spec, /\/UF (\(|<)/);
    assert.match(spec, /\/EF << \/F \d+ 0 R >>/);
  });
  assert.deepEqual(specs.map(spec => /\/AFRelationship \/(\w+)/.exec(spec)[1]), ['Alternative', 'Source', 'Data', 'Supplement']);
  assert.match(specs[0], /\/Desc \(Invoice data\)/);
  assert.match(specs[2], /we\\\(ird\\\\\.xml/, 'the name is escaped');
  assert.match(specs[3], /\/F <feff/, 'a non-Latin-1 name is UTF-16BE');

  const file = id => pdf.objects.get(id);
  const fileOf = spec => file(pdf.ref(spec, '/F'));
  const embedded = specs.map(spec => fileOf(/\/EF << (\/F \d+ 0 R) >>/.exec(spec)[1]));
  embedded.forEach(body => assert.match(body, /\/Type \/EmbeddedFile/));
  assert.match(embedded[0], /\/Subtype \/text#2fxml/);
  assert.match(embedded[1], /\/Subtype \/application#2foctet-stream/);
  const size = body => Number(/\/Params << \/Size (\d+)/.exec(body)[1]);
  assert.equal(size(embedded[0]), Buffer.byteLength(content, 'utf8'));
  assert.ok(size(embedded[0]) > content.length, 'bytes, not UTF-16 code units');
  assert.equal(size(embedded[1]), 4);
  assert.equal(size(embedded[3]), 5, 'four bytes for a non-BMP character');
  assert.match(embedded[0], /\/ModDate \(D:20260102030405Z\)/);
  embedded.slice(1).forEach(body => assert.match(body, /\/ModDate \(D:20261110123045Z\)/, 'defaults to the creation date'));
  const zetaFile = pdf.ref(specs[0], '/EF << /F');
  assert.equal(streamBytes(bytes, zetaFile).toString('utf8'), content);

  // The name tree under /Names /EmbeddedFiles, keyed in byte order.
  const names = pdf.objects.get(pdf.ref(pdf.root, '/Names'));
  const tree = pdf.objects.get(pdf.ref(names, '/EmbeddedFiles'));
  const keys = [...tree.matchAll(/(\((?:\\.|[^\\)])*\)|<[0-9a-f]+>) \d+ 0 R/g)].map(match => pdfText(match[1]));
  assert.deepEqual(keys, ['alpha.bin', 'we(ird\\.xml', 'zeta.xml', 'facture-€.xml']);
  assert.doesNotMatch(tree, /\/Limits/, 'a root node has no /Limits');
});

test('attachments need part 3', () => {
  assert.throws(() => pdfaDocument({ pdfa: { part: 2, attachments: [{ name: 'a.xml', data: '<a/>' }] } }), /PDF\/A-2.*part 3/s);
  const bytes = pdfaDocument({ pdfa: { part: 2 } }).save();
  assert.deepEqual(xmpValues(xmpOf(bytes), 'pdfaid:part'), ['2']);
  assert.doesNotMatch(parse(bytes).root, /\/AF|\/Names/);
});

test('standard Type1 fonts are rejected with a hint to embed a TrueType theme', () => {
  const document = new Pdf.Document({ pdfa: { colorProfile: icc } });
  document.addPage(new Pdf.Page({ build: () => new Pdf.Text('Helvetica') }));
  assert.throws(() => document.save(), error => {
    assert.match(error.message, /PDF\/A/);
    assert.match(error.message, /Helvetica/);
    assert.match(error.message, /ThemeData\.withFont/);
    assert.match(error.message, /Font\.ttf/);
    return true;
  });
  // A bold face left to the default theme is caught as well.
  const partial = new Pdf.Document({ theme: Pdf.ThemeData.withFont({ base: regular }), pdfa: { colorProfile: icc } });
  partial.addPage(new Pdf.Page({ build: () => new Pdf.Text('Bold', { style: new Pdf.TextStyle({ fontWeight: 'bold' }) }) }));
  assert.throws(() => partial.save(), /Helvetica-Bold/);
});

test('device colour must match the output intent', () => {
  const cmykText = new Pdf.Text('CMYK', { style: new Pdf.TextStyle({ color: new Pdf.PdfColorCmyk(0, 1, 1, 0) }) });
  assert.throws(() => pdfaDocument({}, [cmykText]).save(), /DeviceCMYK.*RGB/s);

  const cmyk = withColorSpace(icc, 'CMYK');
  assert.throws(() => pdfaDocument({ pdfa: { colorProfile: cmyk } }, [new Pdf.Text('RGB')]).save(), /DeviceRGB.*CMYK/s);
  const gradient = new Pdf.Container({ width: 20, height: 20, decoration: new Pdf.BoxDecoration({
    gradient: new Pdf.LinearGradient({ colors: [new Pdf.PdfColorCmyk(0, 0, 0, 1), new Pdf.PdfColorCmyk(0, 0, 0, 0)] }) }) });
  assert.throws(() => pdfaDocument({ pdfa: { colorProfile: cmyk } }, [gradient]).save(), /DeviceRGB/);

  // Gray is allowed under either intent.
  const gray = new Pdf.Text('Gray', { style: new Pdf.TextStyle({ color: new Pdf.PdfColorGrey(0.2) }) });
  assert.doesNotThrow(() => pdfaDocument({ pdfa: { colorProfile: cmyk } }, [gray]).save());
  assert.doesNotThrow(() => pdfaDocument({}, [gray]).save());
});

test('implementation limits and annotation colours are checked', () => {
  // ISO 19005-2 6.1.13: page boundaries of 3 to 14400 units, q nesting of 28.
  const tiny = new Pdf.Document({ theme: theme(), pdfa: { colorProfile: icc } });
  tiny.addPage(new Pdf.Page({ pageFormat: { width: 2, height: 2 }, margin: 0, build: () => new Pdf.SizedBox() }));
  assert.throws(() => tiny.save(), /3 to 14400/);

  const nest = (depth, child) => (depth === 0 ? child : new Pdf.Opacity({ opacity: 0.9, child: nest(depth - 1, child) }));
  assert.throws(() => pdfaDocument({}, [nest(30, new Pdf.Text('deep'))]).save(), /q nesting to 28, not 30/);
  assert.doesNotThrow(() => pdfaDocument({}, [nest(20, new Pdf.Text('deep'))]).save());

  // 6.3.3: /C and /IC only under an RGB output intent.
  const gray = withColorSpace(icc, 'GRAY');
  const square = new Pdf.SquareAnnotation({ child: new Pdf.SizedBox({ width: 10, height: 10 }), color: new Pdf.PdfColorGrey(0) });
  assert.throws(() => pdfaDocument({ pdfa: { colorProfile: gray } }, [square]).save(), /annotation colours/);
});

test('unsupported parts and levels, malformed profiles and conflicting XMP fail early', () => {
  const make = pdfa => new Pdf.Document({ theme: theme(), pdfa: { colorProfile: icc, ...pdfa } });
  assert.throws(() => make({ part: 1 }), /PDF\/A-1.*transparency/s);
  assert.throws(() => make({ part: 4 }), RangeError);
  assert.throws(() => make({ conformance: 'A' }), /level A/);
  assert.throws(() => new Pdf.Document({ pdfa: {} }), /colorProfile/);
  assert.throws(() => new Pdf.Document({ xmpMetadata: '<x/>', pdfa: { colorProfile: icc } }), /xmpMetadata.*extensionRdf/s);

  const broken = (mutate) => { const copy = icc.slice(); mutate(copy, new DataView(copy.buffer)); return copy; };
  assert.throws(() => make({ colorProfile: icc.subarray(0, 100) }), /ICC/);
  assert.throws(() => make({ colorProfile: broken((_, view) => view.setUint32(0, icc.length + 4)) }), /size/);
  assert.throws(() => make({ colorProfile: broken(copy => copy.set([0x61, 0x62, 0x63, 0x64], 36)) }), /acsp/);
  assert.throws(() => make({ colorProfile: withColorSpace(icc, 'Lab ') }), /colour space/);
  assert.throws(() => make({ colorProfile: broken(copy => copy.set([0x73, 0x63, 0x6e, 0x72], 12)) }), /class/);
  assert.throws(() => make({ colorProfile: broken((_, view) => view.setUint32(136, icc.length)) }), /tag/);
  assert.throws(() => make({ attachments: [{ name: '', data: 'x' }] }), /name/);
  assert.throws(() => make({ attachments: [{ name: 'a', data: 'x', relationship: 'Other' }] }), /relationship/);

  const protectedFont = Pdf.Font.ttf(asset('OpenSans-Regular.ttf'), { protect: true });
  const document = new Pdf.Document({ theme: Pdf.ThemeData.withFont({ base: protectedFont }), pdfa: { colorProfile: icc, conformance: 'U' } });
  document.addPage(new Pdf.Page({ build: () => new Pdf.Text('Protected') }));
  assert.throws(() => document.save(), /protect/);
});

test('annotations print and carry a normal appearance only', () => {
  const box = () => new Pdf.SizedBox({ width: 40, height: 20 });
  const children = [
    new Pdf.UrlLink({ destination: 'https://example.com', child: new Pdf.Text('Link') }),
    new Pdf.SquareAnnotation({ child: box(), color: '#ff0000' }),
    new Pdf.TextAnnotation({ child: box(), content: 'A note' }),
    new Pdf.TextField({ name: 'empty', width: 80, height: 16 }),
    new Pdf.TextField({ name: 'filled', width: 80, height: 16, value: 'Ada' }),
    new Pdf.Checkbox({ name: 'agree', value: true }),
    new Pdf.FlatButton({ name: 'push', child: new Pdf.Text('Push') })
  ];
  const pdf = parse(pdfaDocument({}, children).save());
  const annots = [...pdf.objects.entries()].filter(([, body]) => body.startsWith('<< /Type /Annot'));
  assert.equal(annots.length, 7);
  for (const [id, body] of annots) {
    const flags = Number(/\/F (\d+)/.exec(body)[1]);
    assert.equal(flags & 4, 4, `${id} prints`);
    assert.equal(flags & (1 | 2 | 32 | 256), 0, `${id} is not hidden`);
    if (body.includes('/Subtype /Link')) continue;
    const ap = /\/AP << ([\s\S]*?) >>(?: \/|\s*>>|$)/.exec(body);
    assert.ok(ap, `${id} has an appearance: ${body}`);
    assert.doesNotMatch(body, /\/AP << .*\/[DR] \d+ 0 R/, `${id} has only /N`);
    if (body.includes('/FT /Btn')) assert.match(body, /\/AP << \/N << \/\w+ \d+ 0 R/, `${id}: a button's /N is a state dictionary`);
    else assert.match(body, /\/AP << \/N \d+ 0 R >>/, `${id}: /N is a stream`);
  }
  assert.match(pdf.text, /\/AS \/On/);

  // Without PDF/A nothing changes: no generated appearance for markup or empty fields.
  const plain = parse(new Pdf.Document({ compress: false }).addPage(new Pdf.Page({ build: () => new Pdf.Column({ children: [
    new Pdf.SquareAnnotation({ child: box() }), new Pdf.TextField({ name: 'empty', width: 80, height: 16 }),
    new Pdf.FlatButton({ name: 'push', child: new Pdf.Text('Push') })
  ] }) })).save());
  const plainAnnots = [...plain.objects.values()].filter(body => body.startsWith('<< /Type /Annot'));
  assert.doesNotMatch(plainAnnots[0], /\/AP/);
  assert.doesNotMatch(plainAnnots[1], /\/AP/);
  assert.match(plainAnnots[2], /\/AP << \/N \d+ 0 R \/D \d+ 0 R \/R \d+ 0 R >>/);
});

test('without pdfa the writer is unchanged', () => {
  const document = new Pdf.Document({ compress: false, title: 'Plain' });
  document.addPage(new Pdf.Page({ build: () => new Pdf.Text('Plain') }));
  const bytes = document.save();
  const pdf = parse(bytes);
  assert.doesNotMatch(pdf.trailer, /\/ID/);
  assert.doesNotMatch(pdf.root, /\/Metadata|\/OutputIntents|\/AF/);
  assert.doesNotMatch(pdf.info, /\/ModDate/);
  // The uncompressed content stream ends with a line feed that stands in for
  // the marker before `endstream`, exactly as before.
  const raw = Buffer.from(bytes).toString('latin1');
  assert.match(raw, /ET\nendstream/);

  const dated = new Pdf.Document({ creationDate: DATE });
  dated.addPage(new Pdf.Page({ build: () => new Pdf.Text('x') }));
  assert.match(parse(dated.save()).info, /\/CreationDate \(D:20261110123045Z\)/);
});

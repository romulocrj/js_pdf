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
 *   - pdf/lib/src/pdf/font/ttf_parser.dart
 *
 * Port-specific CFF metadata reader extending the upstream sfnt parser.
 * Based on Adobe CFF1 and ISO 32000-1; charstrings remain in the font program.
 */

/** CFF1 charset metadata for full OpenType embedding (ISO 32000-1, 9.7.4.2).
 * The port reads metadata only; it does not interpret or rewrite charstrings.
 */
export function cffFontMetadata(bytes: Uint8Array, glyphCount: number): {
  cids: Uint16Array; registry: string; ordering: string; supplement: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireBytes = (at: number, size: number): void => {
    if (!Number.isInteger(at) || at < 0 || at + size > bytes.length) throw new TypeError('Truncated CFF metadata');
  };
  const byte = (at: number): number => { requireBytes(at, 1); return bytes[at]!; };
  const word = (at: number): number => { requireBytes(at, 2); return view.getUint16(at); };
  const index = (at: number): { end: number; first: Uint8Array; count: number; item: (index: number) => Uint8Array } => {
    const count = word(at);
    if (count === 0) return { end: at + 2, first: new Uint8Array(), count, item: () => { throw new TypeError('Missing CFF string'); } };
    const size = byte(at + 2);
    if (size < 1 || size > 4) throw new TypeError('Invalid CFF INDEX offset size');
    const data = at + 3 + (count + 1) * size;
    requireBytes(at + 3, (count + 1) * size);
    const offset = (i: number): number => {
      let value = 0;
      for (let j = 0; j < size; j++) value = value * 256 + byte(at + 3 + i * size + j);
      return value;
    };
    const first = offset(0), second = offset(1), last = offset(count);
    if (first !== 1 || second < first || last < second) throw new TypeError('Invalid CFF INDEX offsets');
    requireBytes(data, last - 1);
    return { end: data + last - 1, first: bytes.subarray(data, data + second - 1), count,
      item: i => {
        if (i < 0 || i >= count) throw new TypeError('Invalid CFF string index');
        const start = offset(i), end = offset(i + 1);
        if (start < 1 || end < start || end > last) throw new TypeError('Invalid CFF INDEX range');
        return bytes.subarray(data + start - 1, data + end - 1);
      } };
  };
  if (byte(0) !== 1 || byte(2) < 4) throw new TypeError('Only CFF1 OpenType outlines are supported');
  const names = index(byte(2)), top = index(names.end);
  if (names.count !== 1 || top.count !== 1) throw new TypeError('OpenType CFF must contain exactly one font');
  const strings = index(top.end);
  const dict = top.first;
  let ros: number[] = [];
  const operands: number[] = [];
  let charset = 0, cidKeyed = false, charStrings = -1;
  for (let i = 0; i < dict.length;) {
    const b = dict[i++]!;
    if (b >= 32 && b <= 246) operands.push(b - 139);
    else if (b >= 247 && b <= 254) {
      if (i >= dict.length) throw new TypeError('Truncated CFF DICT operand');
      const next = dict[i++]!;
      operands.push(b <= 250 ? (b - 247) * 256 + next + 108 : -(b - 251) * 256 - next - 108);
    } else if (b === 28 || b === 29) {
      const size = b === 28 ? 2 : 4;
      if (i + size > dict.length) throw new TypeError('Truncated CFF DICT number');
      const dv = new DataView(dict.buffer, dict.byteOffset + i, size);
      operands.push(size === 2 ? dv.getInt16(0) : dv.getInt32(0)); i += size;
    } else if (b === 30) {
      let ended = false;
      while (i < dict.length && !ended) { const n = dict[i++]!; ended = (n & 15) === 15 || (n >> 4) === 15; }
      if (!ended) throw new TypeError('Truncated CFF real number');
      operands.push(0); // Real-valued font metrics are not needed for charset lookup.
    } else {
      const op = b === 12 ? 1200 + (dict[i++] ?? -1) : b;
      if (op === 1230) { cidKeyed = true; ros = [...operands]; }
      if (op === 15) charset = operands[0] ?? -1;
      if (op === 17) charStrings = operands[0] ?? -1;
      operands.length = 0;
    }
  }
  if (charStrings < 0 || index(charStrings).count !== glyphCount) throw new TypeError('CFF glyph count does not match maxp');
  const result = new Uint16Array(glyphCount);
  const string = (sid: number): string => {
    if (sid < 0 || !Number.isInteger(sid)) throw new TypeError('Invalid CFF string identifier');
    if (sid < 391) return CFF_STANDARD_STRINGS[sid]!;
    let value = '';
    for (const b of strings.item(sid - 391)) value += String.fromCharCode(b);
    return value;
  };
  const metadata = { cids: result, registry: cidKeyed ? string(ros[0] ?? -1) : 'Adobe',
    ordering: cidKeyed ? string(ros[1] ?? -1) : 'Identity', supplement: cidKeyed ? ros[2] ?? 0 : 0 };
  if (!cidKeyed) { for (let i = 0; i < glyphCount; i++) result[i] = i; return metadata; }
  if (charset <= 2) throw new TypeError('CID-keyed CFF requires an explicit charset');
  const format = byte(charset++);
  if (format > 2) throw new TypeError('Invalid CFF charset format');
  let glyph = 1;
  while (glyph < glyphCount) {
    const first = word(charset); charset += 2;
    const remaining = format === 0 ? 0 : format === 1 ? byte(charset++) : word(charset);
    if (format === 2) charset += 2;
    if (glyph + remaining >= glyphCount || first + remaining > 65535) throw new TypeError('CFF charset range exceeds glyph count');
    for (let i = 0; i <= remaining; i++) result[glyph++] = first + i;
  }
  return metadata;
}

// Standard SID names: Adobe Technical Note 5176, Appendix A (format data).
const CFF_STANDARD_STRINGS = '.notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron exclamsmall Hungarumlautsmall dollaroldstyle dollarsuperior ampersandsmall Acutesmall parenleftsuperior parenrightsuperior twodotenleader onedotenleader zerooldstyle oneoldstyle twooldstyle threeoldstyle fouroldstyle fiveoldstyle sixoldstyle sevenoldstyle eightoldstyle nineoldstyle commasuperior threequartersemdash periodsuperior questionsmall asuperior bsuperior centsuperior dsuperior esuperior isuperior lsuperior msuperior nsuperior osuperior rsuperior ssuperior tsuperior ff ffi ffl parenleftinferior parenrightinferior Circumflexsmall hyphensuperior Gravesmall Asmall Bsmall Csmall Dsmall Esmall Fsmall Gsmall Hsmall Ismall Jsmall Ksmall Lsmall Msmall Nsmall Osmall Psmall Qsmall Rsmall Ssmall Tsmall Usmall Vsmall Wsmall Xsmall Ysmall Zsmall colonmonetary onefitted rupiah Tildesmall exclamdownsmall centoldstyle Lslashsmall Scaronsmall Zcaronsmall Dieresissmall Brevesmall Caronsmall Dotaccentsmall Macronsmall figuredash hypheninferior Ogoneksmall Ringsmall Cedillasmall questiondownsmall oneeighth threeeighths fiveeighths seveneighths onethird twothirds zerosuperior foursuperior fivesuperior sixsuperior sevensuperior eightsuperior ninesuperior zeroinferior oneinferior twoinferior threeinferior fourinferior fiveinferior sixinferior seveninferior eightinferior nineinferior centinferior dollarinferior periodinferior commainferior Agravesmall Aacutesmall Acircumflexsmall Atildesmall Adieresissmall Aringsmall AEsmall Ccedillasmall Egravesmall Eacutesmall Ecircumflexsmall Edieresissmall Igravesmall Iacutesmall Icircumflexsmall Idieresissmall Ethsmall Ntildesmall Ogravesmall Oacutesmall Ocircumflexsmall Otildesmall Odieresissmall OEsmall Oslashsmall Ugravesmall Uacutesmall Ucircumflexsmall Udieresissmall Yacutesmall Thornsmall Ydieresissmall 001.000 001.001 001.002 001.003 Black Bold Book Light Medium Regular Roman Semibold'.split(' ');

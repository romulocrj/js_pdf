/*
 * romulocrj/js_pdf — JavaScript port of DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 */

const PageFormat = Object.freeze({
  A4: Object.freeze({
    width: 595.28,
    height: 841.89
  }),
  LETTER: Object.freeze({
    width: 612,
    height: 792
  })
});

const DEFAULT_MARGIN = 40;

const PageUnit = Object.freeze({
  point: 1,
  inch: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pica: 12
});

class PdfFontMetrics {
  constructor({left, top, right, bottom, ascent = bottom, descent = top, advanceWidth = right - left, leftBearing = left}) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.ascent = ascent;
    this.descent = descent;
    this.advanceWidth = advanceWidth;
    this.leftBearing = leftBearing;
  }
  static append(metrics, letterSpacing = 0) {
    let left;
    let top;
    let bottom;
    let ascent;
    let descent;
    let advanceWidth = 0;
    let firstBearing;
    let lastBearing = 0;
    let lastSpacing = 0;
    for (const metric of metrics) {
      left ?? (left = metric.left);
      top = Math.min(top ?? metric.top, metric.top);
      bottom = Math.max(bottom ?? metric.bottom, metric.bottom);
      ascent = Math.max(ascent ?? metric.ascent, metric.ascent);
      descent = Math.min(descent ?? metric.descent, metric.descent);
      firstBearing ?? (firstBearing = metric.leftBearing);
      lastBearing = metric.rightBearing;
      lastSpacing = metric.advanceWidth > 0 ? letterSpacing : 0;
      advanceWidth += metric.advanceWidth + lastSpacing;
    }
    if (left === undefined || top === undefined || bottom === undefined || ascent === undefined || descent === undefined || firstBearing === undefined) {
      return PdfFontMetrics.zero;
    }
    return new PdfFontMetrics({
      left,
      top,
      right: advanceWidth - lastBearing - lastSpacing,
      bottom,
      ascent,
      descent,
      advanceWidth: advanceWidth - lastSpacing,
      leftBearing: firstBearing
    });
  }
  get width() {
    return this.right - this.left;
  }
  get height() {
    return this.bottom - this.top;
  }
  get maxWidth() {
    return Math.max(this.advanceWidth, this.right) + Math.max(-this.leftBearing, 0);
  }
  get maxHeight() {
    return this.ascent - this.descent;
  }
  get effectiveLeft() {
    return Math.min(this.leftBearing, 0);
  }
  get rightBearing() {
    return this.advanceWidth - this.right;
  }
  scale(factor) {
    return new PdfFontMetrics({
      left: this.left * factor,
      top: this.top * factor,
      right: this.right * factor,
      bottom: this.bottom * factor,
      ascent: this.ascent * factor,
      descent: this.descent * factor,
      advanceWidth: this.advanceWidth * factor,
      leftBearing: this.leftBearing * factor
    });
  }
}

PdfFontMetrics.zero = new PdfFontMetrics({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0
});

const GROW = 65536;

class PdfStream {
  constructor() {
    this.buffer = new Uint8Array(GROW);
    this.length = 0;
  }
  get offset() {
    return this.length;
  }
  ensure(size) {
    if (this.buffer.length - this.length >= size) {
      return;
    }
    const grown = new Uint8Array(this.length + size + GROW);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }
  putByte(byte) {
    this.ensure(1);
    this.buffer[this.length++] = byte;
  }
  putBytes(bytes) {
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }
  putString(value) {
    this.ensure(value.length);
    for (let index = 0; index < value.length; index++) {
      this.buffer[this.length++] = value.charCodeAt(index) & 255;
    }
  }
  output() {
    return this.buffer.slice(0, this.length);
  }
}

function encodeLatin1(value) {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    result[index] = value.charCodeAt(index) & 255;
  }
  return result;
}

class PdfDataType {
  toString() {
    const stream = new PdfStream;
    this.output(stream);
    let result = "";
    for (const byte of stream.output()) {
      result += String.fromCharCode(byte);
    }
    return result;
  }
}

class PdfDict extends PdfDataType {
  constructor(values) {
    super();
    this.values = new Map(values);
  }
  static fromObjectMap(objects) {
    const dict = new PdfDict;
    for (const [key, object] of objects) {
      dict.set(key, object.ref());
    }
    return dict;
  }
  get isEmpty() {
    return this.values.size === 0;
  }
  has(key) {
    return this.values.has(key);
  }
  get(key) {
    return this.values.get(key);
  }
  set(key, value) {
    this.values.set(key, value);
  }
  output(s) {
    s.putString("<< ");
    let first = true;
    for (const [key, value] of this.values) {
      if (!first) {
        s.putByte(32);
      }
      first = false;
      s.putString(key);
      s.putByte(32);
      value.output(s);
    }
    s.putString(" >>");
  }
}

class PdfName extends PdfDataType {
  constructor(value) {
    super();
    if (value.charCodeAt(0) !== 47) {
      throw new TypeError(`PDF name must start with "/": ${value}`);
    }
    this.value = value;
  }
  output(s) {
    for (let index = 0; index < this.value.length; index++) {
      const code = this.value.charCodeAt(index);
      if (code < 33 || code > 126 || code === 35 || code === 47 && index > 0 || code === 91 || code === 93 || code === 40 || code === 41 || code === 60 || code === 62) {
        s.putString(`#${code.toString(16).padStart(2, "0")}`);
      } else {
        s.putByte(code);
      }
    }
  }
}

const CP1252 = Object.freeze({
  8364: 128,
  8218: 130,
  402: 131,
  8222: 132,
  8230: 133,
  8224: 134,
  8225: 135,
  710: 136,
  8240: 137,
  352: 138,
  8249: 139,
  338: 140,
  381: 142,
  8216: 145,
  8217: 146,
  8220: 147,
  8221: 148,
  8226: 149,
  8211: 150,
  8212: 151,
  732: 152,
  8482: 153,
  353: 154,
  8250: 155,
  339: 156,
  382: 158,
  376: 159
});

function toWinAnsiByte(codePoint) {
  if (codePoint <= 255) return codePoint;
  return CP1252[codePoint] ?? 63;
}

function pdfLiteral(value) {
  let output = "";
  for (const character of String(value)) {
    const byte = toWinAnsiByte(character.codePointAt(0) ?? 63);
    if (byte === 40 || byte === 41 || byte === 92) {
      output += `\\${String.fromCharCode(byte)}`;
    } else if (byte === 10) {
      output += "\\n";
    } else if (byte === 13) {
      output += "\\r";
    } else if (byte < 32 || byte > 126) {
      output += `\\${byte.toString(8).padStart(3, "0")}`;
    } else {
      output += String.fromCharCode(byte);
    }
  }
  return `(${output})`;
}

function pdfHexString(values, digits = 4) {
  let output = "";
  for (const value of values) {
    output += value.toString(16).padStart(digits, "0");
  }
  return `<${output}>`;
}

class PdfString extends PdfDataType {
  constructor(value) {
    super();
    this.value = value;
  }
  output(s) {
    s.putString(pdfLiteral(this.value));
  }
}

const helveticaWidths = Object.freeze([ .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .278, .278, .355, .556, .556, .889, .667, .191, .333, .333, .389, .584, .278, .333, .278, .278, .556, .556, .556, .556, .556, .556, .556, .556, .556, .556, .278, .278, .584, .584, .584, .556, 1.015, .667, .667, .722, .722, .667, .611, .778, .722, .278, .5, .667, .556, .833, .722, .778, .667, .778, .722, .667, .611, .722, .667, .944, .667, .667, .611, .278, .278, .277, .469, .556, .333, .556, .556, .5, .556, .556, .278, .556, .556, .222, .222, .5, .222, .833, .556, .556, .556, .556, .333, .5, .278, .556, .5, .722, .5, .5, .5, .334, .26, .334, .584, .5, .655, .5, .222, .278, .333, 1, .556, .556, .333, 1, .667, .25, 1, .5, .611, .5, .5, .222, .221, .333, .333, .35, .556, 1, .333, 1, .5, .25, .938, .5, .5, .667, .278, .278, .556, .556, .556, .556, .26, .556, .333, .737, .37, .448, .584, .333, .737, .333, .606, .584, .35, .35, .333, .556, .537, .278, .333, .35, .365, .448, .869, .869, .879, .556, .667, .667, .667, .667, .667, .667, 1, .722, .667, .667, .667, .667, .278, .278, .278, .278, .722, .722, .778, .778, .778, .778, .778, .584, .778, .722, .722, .722, .722, .667, .666, .611, .556, .556, .556, .556, .556, .556, .896, .5, .556, .556, .556, .556, .251, .251, .251, .251, .556, .556, .556, .556, .556, .556, .556, .584, .611, .556, .556, .556, .556, .5, .555, .5 ]);

const helveticaBoldWidths = Object.freeze([ .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .333, .474, .556, .556, .889, .722, .238, .333, .333, .389, .584, .278, .333, .278, .278, .556, .556, .556, .556, .556, .556, .556, .556, .556, .556, .333, .333, .584, .584, .584, .611, .975, .722, .722, .722, .722, .667, .611, .778, .722, .278, .556, .722, .611, .833, .722, .778, .667, .778, .722, .667, .611, .722, .667, .944, .667, .667, .611, .333, .278, .333, .584, .556, .333, .556, .611, .556, .611, .556, .333, .611, .611, .278, .278, .556, .278, .889, .611, .611, .611, .611, .389, .556, .333, .611, .556, .778, .556, .556, .5, .389, .28, .389, .584, .35, .556, .35, .278, .556, .5, 1, .556, .556, .333, 1, .667, .333, 1, .35, .611, .35, .35, .278, .278, .5, .5, .35, .556, 1, .333, 1, .556, .333, .944, .35, .5, .667, .278, .333, .556, .556, .556, .556, .28, .556, .333, .737, .37, .556, .584, .333, .737, .333, .4, .584, .333, .333, .333, .611, .556, .278, .333, .333, .365, .556, .834, .834, .834, .611, .722, .722, .722, .722, .722, .722, 1, .722, .667, .667, .667, .667, .278, .278, .278, .278, .722, .722, .778, .778, .778, .778, .778, .584, .778, .722, .722, .722, .722, .667, .667, .611, .556, .556, .556, .556, .556, .556, .889, .556, .556, .556, .556, .556, .278, .278, .278, .278, .611, .611, .611, .611, .611, .611, .611, .584, .611, .611, .611, .611, .611, .556, .611, .556 ]);

const helveticaBoldObliqueWidths = Object.freeze([ .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .333, .474, .556, .556, .889, .722, .238, .333, .333, .389, .584, .278, .333, .278, .278, .556, .556, .556, .556, .556, .556, .556, .556, .556, .556, .333, .333, .584, .584, .584, .611, .975, .722, .722, .722, .722, .667, .611, .778, .722, .278, .556, .722, .611, .833, .722, .778, .667, .778, .722, .667, .611, .722, .667, .944, .667, .667, .611, .333, .278, .333, .584, .556, .333, .556, .611, .556, .611, .556, .333, .611, .611, .278, .278, .556, .278, .889, .611, .611, .611, .611, .389, .556, .333, .611, .556, .778, .556, .556, .5, .389, .28, .389, .584, .35, .556, .35, .278, .556, .5, 1, .556, .556, .333, 1, .667, .333, 1, .35, .611, .35, .35, .278, .278, .5, .5, .35, .556, 1, .333, 1, .556, .333, .944, .35, .5, .667, .278, .333, .556, .556, .556, .556, .28, .556, .333, .737, .37, .556, .584, .333, .737, .333, .4, .584, .333, .333, .333, .611, .556, .278, .333, .333, .365, .556, .834, .834, .834, .611, .722, .722, .722, .722, .722, .722, 1, .722, .667, .667, .667, .667, .278, .278, .278, .278, .722, .722, .778, .778, .778, .778, .778, .584, .778, .722, .722, .722, .722, .667, .667, .611, .556, .556, .556, .556, .556, .556, .889, .556, .556, .556, .556, .556, .278, .278, .278, .278, .611, .611, .611, .611, .611, .611, .611, .584, .611, .611, .611, .611, .611, .556, .611, .556 ]);

const helveticaObliqueWidths = Object.freeze([ .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .278, .355, .556, .556, .889, .667, .191, .333, .333, .389, .584, .278, .333, .278, .278, .556, .556, .556, .556, .556, .556, .556, .556, .556, .556, .278, .278, .584, .584, .584, .556, 1.015, .667, .667, .722, .722, .667, .611, .778, .722, .278, .5, .667, .556, .833, .722, .778, .667, .778, .722, .667, .611, .722, .667, .944, .667, .667, .611, .278, .278, .278, .469, .556, .333, .556, .556, .5, .556, .556, .278, .556, .556, .222, .222, .5, .222, .833, .556, .556, .556, .556, .333, .5, .278, .556, .5, .722, .5, .5, .5, .334, .26, .334, .584, .35, .556, .35, .222, .556, .333, 1, .556, .556, .333, 1, .667, .333, 1, .35, .611, .35, .35, .222, .222, .333, .333, .35, .556, 1, .333, 1, .5, .333, .944, .35, .5, .667, .278, .333, .556, .556, .556, .556, .26, .556, .333, .737, .37, .556, .584, .333, .737, .333, .4, .584, .333, .333, .333, .556, .537, .278, .333, .333, .365, .556, .834, .834, .834, .611, .667, .667, .667, .667, .667, .667, 1, .722, .667, .667, .667, .667, .278, .278, .278, .278, .722, .722, .778, .778, .778, .778, .778, .584, .778, .722, .722, .722, .722, .667, .667, .611, .556, .556, .556, .556, .556, .556, .889, .5, .556, .556, .556, .556, .278, .278, .278, .278, .556, .556, .556, .556, .556, .556, .556, .584, .611, .556, .556, .556, .556, .5, .556, .5 ]);

const timesWidths = Object.freeze([ .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .333, .408, .5, .5, .833, .778, .18, .333, .333, .5, .564, .25, .333, .25, .278, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .278, .278, .564, .564, .564, .444, .921, .722, .667, .667, .722, .611, .556, .722, .722, .333, .389, .722, .611, .889, .722, .722, .556, .722, .667, .556, .611, .722, .722, .944, .722, .722, .611, .333, .278, .333, .469, .5, .333, .444, .5, .444, .5, .444, .333, .5, .5, .278, .278, .5, .278, .778, .5, .5, .5, .5, .333, .389, .278, .5, .5, .722, .5, .5, .444, .48, .2, .48, .541, .35, .5, .35, .333, .5, .444, 1, .5, .5, .333, 1, .556, .333, .889, .35, .611, .35, .35, .333, .333, .444, .444, .35, .5, 1, .333, .98, .389, .333, .722, .35, .444, .722, .25, .333, .5, .5, .5, .5, .2, .5, .333, .76, .276, .5, .564, .333, .76, .333, .4, .564, .3, .3, .333, .5, .453, .25, .333, .3, .31, .5, .75, .75, .75, .444, .722, .722, .722, .722, .722, .722, .889, .667, .611, .611, .611, .611, .333, .333, .333, .333, .722, .722, .722, .722, .722, .722, .722, .564, .722, .722, .722, .722, .722, .722, .556, .5, .444, .444, .444, .444, .444, .444, .667, .444, .444, .444, .444, .444, .278, .278, .278, .278, .5, .5, .5, .5, .5, .5, .5, .564, .5, .5, .5, .5, .5, .5, .5, .5 ]);

const timesBoldWidths = Object.freeze([ .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .333, .555, .5, .5, 1, .833, .278, .333, .333, .5, .57, .25, .333, .25, .278, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .333, .333, .57, .57, .57, .5, .93, .722, .667, .722, .722, .667, .611, .778, .778, .389, .5, .778, .667, .944, .722, .778, .611, .778, .722, .556, .667, .722, .722, 1, .722, .722, .667, .333, .278, .333, .581, .5, .333, .5, .556, .444, .556, .444, .333, .5, .556, .278, .333, .556, .278, .833, .556, .5, .556, .556, .444, .389, .333, .556, .5, .722, .5, .5, .444, .394, .22, .394, .52, .35, .5, .35, .333, .5, .5, 1, .5, .5, .333, 1, .556, .333, 1, .35, .667, .35, .35, .333, .333, .5, .5, .35, .5, 1, .333, 1, .389, .333, .722, .35, .444, .722, .25, .333, .5, .5, .5, .5, .22, .5, .333, .747, .3, .5, .57, .333, .747, .333, .4, .57, .3, .3, .333, .556, .54, .25, .333, .3, .33, .5, .75, .75, .75, .5, .722, .722, .722, .722, .722, .722, 1, .722, .667, .667, .667, .667, .389, .389, .389, .389, .722, .722, .778, .778, .778, .778, .778, .57, .778, .722, .722, .722, .722, .722, .611, .556, .5, .5, .5, .5, .5, .5, .722, .444, .444, .444, .444, .444, .278, .278, .278, .278, .5, .556, .5, .5, .5, .5, .5, .57, .5, .556, .556, .556, .556, .5, .556, .5 ]);

const timesBoldItalicWidths = Object.freeze([ .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .389, .555, .5, .5, .833, .778, .278, .333, .333, .5, .57, .25, .333, .25, .278, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .333, .333, .57, .57, .57, .5, .832, .667, .667, .667, .722, .667, .667, .722, .778, .389, .5, .667, .611, .889, .722, .722, .611, .722, .667, .556, .611, .722, .667, .889, .667, .611, .611, .333, .278, .333, .57, .5, .333, .5, .5, .444, .5, .444, .333, .5, .556, .278, .278, .5, .278, .778, .556, .5, .5, .5, .389, .389, .278, .556, .444, .667, .5, .444, .389, .348, .22, .348, .57, .35, .5, .35, .333, .5, .5, 1, .5, .5, .333, 1, .556, .333, .944, .35, .611, .35, .35, .333, .333, .5, .5, .35, .5, 1, .333, 1, .389, .333, .722, .35, .389, .611, .25, .389, .5, .5, .5, .5, .22, .5, .333, .747, .266, .5, .606, .333, .747, .333, .4, .57, .3, .3, .333, .576, .5, .25, .333, .3, .3, .5, .75, .75, .75, .5, .667, .667, .667, .667, .667, .667, .944, .667, .667, .667, .667, .667, .389, .389, .389, .389, .722, .722, .722, .722, .722, .722, .722, .57, .722, .722, .722, .722, .722, .611, .611, .5, .5, .5, .5, .5, .5, .5, .722, .444, .444, .444, .444, .444, .278, .278, .278, .278, .5, .556, .5, .5, .5, .5, .5, .57, .5, .556, .556, .556, .556, .444, .5, .444 ]);

const timesItalicWidths = Object.freeze([ .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .25, .333, .42, .5, .5, .833, .778, .214, .333, .333, .5, .675, .25, .333, .25, .278, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .333, .333, .675, .675, .675, .5, .92, .611, .611, .667, .722, .611, .611, .722, .722, .333, .444, .667, .556, .833, .667, .722, .611, .722, .611, .5, .556, .722, .611, .833, .611, .556, .556, .389, .278, .389, .422, .5, .333, .5, .5, .444, .5, .444, .278, .5, .5, .278, .278, .444, .278, .722, .5, .5, .5, .5, .389, .389, .278, .5, .444, .667, .444, .444, .389, .4, .275, .4, .541, .35, .5, .35, .333, .5, .556, .889, .5, .5, .333, 1, .5, .333, .944, .35, .556, .35, .35, .333, .333, .556, .556, .35, .5, .889, .333, .98, .389, .333, .667, .35, .389, .556, .25, .389, .5, .5, .5, .5, .275, .5, .333, .76, .276, .5, .675, .333, .76, .333, .4, .675, .3, .3, .333, .5, .523, .25, .333, .3, .31, .5, .75, .75, .75, .5, .611, .611, .611, .611, .611, .611, .889, .667, .611, .611, .611, .611, .333, .333, .333, .333, .722, .667, .722, .722, .722, .722, .722, .675, .722, .722, .722, .722, .722, .556, .611, .5, .5, .5, .5, .5, .5, .5, .667, .444, .444, .444, .444, .444, .278, .278, .278, .278, .5, .5, .5, .5, .5, .5, .5, .675, .5, .5, .5, .5, .5, .444, .5, .444 ]);

const symbolWidths = Object.freeze([ .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .25, .333, .713, .5, .549, .833, .778, .439, .333, .333, .5, .549, .25, .549, .25, .278, .5, .5, .5, .5, .5, .5, .5, .5, .5, .5, .278, .278, .549, .549, .549, .444, .549, .722, .667, .722, .612, .611, .763, .603, .722, .333, .631, .722, .686, .889, .722, .722, .768, .741, .556, .592, .611, .69, .439, .768, .645, .795, .611, .333, .863, .333, .658, .5, .5, .631, .549, .549, .494, .439, .521, .411, .603, .329, .603, .549, .549, .576, .521, .549, .549, .521, .549, .603, .439, .576, .713, .686, .493, .686, .494, .48, .2, .48, .549, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .587, .75, .62, .247, .549, .167, .713, .5, .753, .753, .753, .753, 1.042, .987, .603, .987, .603, .4, .549, .411, .549, .549, .713, .494, .46, .549, .549, .549, .549, 1, .603, 1, .658, .823, .686, .795, .987, .768, .768, .823, .768, .768, .713, .713, .713, .713, .713, .713, .713, .768, .713, .79, .79, .89, .823, .549, .25, .713, .603, .603, 1.042, .987, .603, .987, .603, .494, .329, .79, .79, .786, .713, .384, .384, .384, .384, .384, .384, .494, .494, .494, .494, .587, .329, .274, .686, .686, .686, .384, .384, .384, .384, .384, .384, .494, .494, .494, .587 ]);

const zapfDingbatsWidths = Object.freeze([ .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .278, .974, .961, .974, .98, .719, .789, .79, .791, .69, .96, .939, .549, .855, .911, .933, .911, .945, .974, .755, .846, .762, .761, .571, .677, .763, .76, .759, .754, .494, .552, .537, .577, .692, .786, .788, .788, .79, .793, .794, .816, .823, .789, .841, .823, .833, .816, .831, .923, .744, .723, .749, .79, .792, .695, .776, .768, .792, .759, .707, .708, .682, .701, .826, .815, .789, .789, .707, .687, .696, .689, .786, .787, .713, .791, .785, .791, .873, .761, .762, .762, .759, .759, .892, .892, .788, .784, .438, .138, .277, .415, .392, .392, .668, .668, .746, .39, .39, .317, .317, .276, .276, .509, .509, .41, .41, .234, .234, .334, .334, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .746, .732, .544, .544, .91, .667, .76, .76, .776, .595, .694, .626, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .788, .894, .838, 1.016, .458, .748, .924, .748, .918, .927, .928, .928, .834, .873, .828, .924, .924, .917, .93, .931, .463, .883, .836, .836, .867, .867, .696, .696, .874, .746, .874, .76, .946, .771, .865, .771, .888, .967, .888, .831, .873, .927, .97, .918, .746 ]);

class PdfType1Font {
  constructor({fontName, ascent, descent, widths = [], missingWidth = .6}) {
    this.fontName = fontName;
    this.ascent = ascent;
    this.descent = descent;
    this.widths = widths;
    this.missingWidth = missingWidth;
  }
  static courier() {
    return new PdfType1Font({
      fontName: "Courier",
      ascent: .91,
      descent: -.22
    });
  }
  static courierBold() {
    return new PdfType1Font({
      fontName: "Courier-Bold",
      ascent: .91,
      descent: -.22
    });
  }
  static courierBoldOblique() {
    return new PdfType1Font({
      fontName: "Courier-BoldOblique",
      ascent: .91,
      descent: -.22
    });
  }
  static courierOblique() {
    return new PdfType1Font({
      fontName: "Courier-Oblique",
      ascent: .91,
      descent: -.22
    });
  }
  static helvetica() {
    return new PdfType1Font({
      fontName: "Helvetica",
      ascent: .931,
      descent: -.225,
      widths: helveticaWidths
    });
  }
  static helveticaBold() {
    return new PdfType1Font({
      fontName: "Helvetica-Bold",
      ascent: .962,
      descent: -.228,
      widths: helveticaBoldWidths
    });
  }
  static helveticaBoldOblique() {
    return new PdfType1Font({
      fontName: "Helvetica-BoldOblique",
      ascent: .962,
      descent: -.228,
      widths: helveticaBoldObliqueWidths
    });
  }
  static helveticaOblique() {
    return new PdfType1Font({
      fontName: "Helvetica-Oblique",
      ascent: .931,
      descent: -.225,
      widths: helveticaObliqueWidths
    });
  }
  static times() {
    return new PdfType1Font({
      fontName: "Times-Roman",
      ascent: .898,
      descent: -.218,
      widths: timesWidths
    });
  }
  static timesBold() {
    return new PdfType1Font({
      fontName: "Times-Bold",
      ascent: .935,
      descent: -.218,
      widths: timesBoldWidths
    });
  }
  static timesBoldItalic() {
    return new PdfType1Font({
      fontName: "Times-BoldItalic",
      ascent: .921,
      descent: -.218,
      widths: timesBoldItalicWidths
    });
  }
  static timesItalic() {
    return new PdfType1Font({
      fontName: "Times-Italic",
      ascent: .883,
      descent: -.217,
      widths: timesItalicWidths
    });
  }
  static symbol() {
    return new PdfType1Font({
      fontName: "Symbol",
      ascent: 1.01,
      descent: -.293,
      widths: symbolWidths
    });
  }
  static zapfDingbats() {
    return new PdfType1Font({
      fontName: "ZapfDingbats",
      ascent: .82,
      descent: -.143,
      widths: zapfDingbatsWidths
    });
  }
  glyphMetrics(charCode) {
    const advanceWidth = this.widths[charCode] ?? this.missingWidth;
    return new PdfFontMetrics({
      left: 0,
      top: this.descent,
      right: advanceWidth,
      bottom: this.ascent
    });
  }
  stringMetrics(text, size, letterSpacing = 0) {
    const metrics = [];
    for (const character of String(text)) {
      metrics.push(this.glyphMetrics(toWinAnsiByte(character.codePointAt(0) ?? 63)).scale(size));
    }
    return PdfFontMetrics.append(metrics, letterSpacing);
  }
  encodeText(text) {
    return pdfLiteral(text);
  }
  resourceDict() {
    return new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/Subtype", new PdfName("/Type1") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/Encoding", new PdfName("/WinAnsiEncoding") ] ]);
  }
}

const defaultPdfFont = PdfType1Font.helvetica();

const TtfParserName = Object.freeze({
  copyright: 0,
  fontFamily: 1,
  fontSubfamily: 2,
  uniqueID: 3,
  fullName: 4,
  version: 5,
  postScriptName: 6,
  trademark: 7,
  manufacturer: 8,
  designer: 9,
  description: 10,
  manufacturerURL: 11,
  designerURL: 12,
  license: 13,
  licenseURL: 14,
  reserved: 15,
  preferredFamily: 16,
  preferredSubfamily: 17,
  compatibleFullName: 18,
  sampleText: 19,
  postScriptFindFontName: 20,
  wwsFamily: 21,
  wwsSubfamily: 22
});

const TtfTable = Object.freeze({
  head: "head",
  name: "name",
  hmtx: "hmtx",
  hhea: "hhea",
  cmap: "cmap",
  maxp: "maxp",
  loca: "loca",
  glyf: "glyf",
  post: "post",
  os2: "OS/2",
  cff: "CFF "
});

const REQUIRED_TABLES = [ TtfTable.head, TtfTable.name, TtfTable.hmtx, TtfTable.hhea, TtfTable.cmap, TtfTable.maxp ];

class TtfParser {
  constructor(bytes) {
    this.tableOffsets = new Map;
    this.tableSize = new Map;
    this.charToGlyphIndexMap = new Map;
    this.glyphOffsets = [];
    this.glyphSizes = [];
    this.glyphInfoMap = new Map;
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const numTables = this.view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const name = this.readTag(i * 16 + 12);
      this.tableOffsets.set(name, this.view.getUint32(i * 16 + 20));
      this.tableSize.set(name, this.view.getUint32(i * 16 + 24));
    }
    for (const table of REQUIRED_TABLES) {
      if (!this.tableOffsets.has(table)) {
        throw new TypeError(`Unable to find the \`${table}\` table. This file is not a supported TTF font`);
      }
    }
    this.parseCMap();
    if (this.tableOffsets.has(TtfTable.loca) && this.tableOffsets.has(TtfTable.glyf)) {
      this.parseIndexes();
      this.parseGlyphs();
    }
  }
  readTag(offset) {
    let tag = "";
    for (let i = 0; i < 4; i++) {
      tag += String.fromCharCode(this.bytes[offset + i] ?? 0);
    }
    return tag;
  }
  tableOffset(name) {
    const offset = this.tableOffsets.get(name);
    if (offset === undefined) {
      throw new TypeError(`This font has no \`${name}\` table`);
    }
    return offset;
  }
  get unitsPerEm() {
    return this.view.getUint16(this.tableOffset(TtfTable.head) + 18);
  }
  get xMin() {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 36);
  }
  get yMin() {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 38);
  }
  get xMax() {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 40);
  }
  get yMax() {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 42);
  }
  get indexToLocFormat() {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 50);
  }
  get ascent() {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 4);
  }
  get descent() {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 6);
  }
  get lineGap() {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 8);
  }
  get numOfLongHorMetrics() {
    return this.view.getUint16(this.tableOffset(TtfTable.hhea) + 34);
  }
  get numGlyphs() {
    return this.view.getUint16(this.tableOffset(TtfTable.maxp) + 4);
  }
  get fontName() {
    return this.getNameID(TtfParserName.postScriptName) ?? "UnnamedFont";
  }
  get unicode() {
    return this.view.getUint32(0) === 65536;
  }
  get hasCff() {
    return this.tableOffsets.has(TtfTable.cff);
  }
  getNameID(nameID) {
    const basePosition = this.tableOffsets.get(TtfTable.name);
    if (basePosition === undefined) {
      return null;
    }
    const count = this.view.getUint16(basePosition + 2);
    const stringOffset = this.view.getUint16(basePosition + 4);
    let pos = basePosition + 6;
    let macintoshName = null;
    for (let i = 0; i < count; i++) {
      const platformID = this.view.getUint16(pos);
      const id = this.view.getUint16(pos + 6);
      const length = this.view.getUint16(pos + 8);
      const offset = this.view.getUint16(pos + 10);
      pos += 12;
      if (id !== nameID) {
        continue;
      }
      const start = basePosition + stringOffset + offset;
      if (start + length > this.bytes.length) {
        continue;
      }
      if (platformID === 3) {
        return decodeUtf16Be(this.bytes.subarray(start, start + length));
      }
      if (platformID === 1) {
        macintoshName = decodeLatin1(this.bytes.subarray(start, start + length));
      }
    }
    return macintoshName;
  }
  parseCMap() {
    const basePosition = this.tableOffset(TtfTable.cmap);
    const numSubTables = this.view.getUint16(basePosition + 2);
    for (let i = 0; i < numSubTables; i++) {
      const offset = this.view.getUint32(basePosition + i * 8 + 8);
      const format = this.view.getUint16(basePosition + offset);
      switch (format) {
       case 0:
        this.parseCMapFormat0(basePosition + offset + 2);
        break;

       case 4:
        this.parseCMapFormat4(basePosition + offset + 2);
        break;

       case 6:
        this.parseCMapFormat6(basePosition + offset + 2);
        break;

       case 12:
        this.parseCMapFormat12(basePosition + offset + 2);
        break;
      }
    }
  }
  parseCMapFormat0(basePosition) {
    for (let i = 0; i < 256; i++) {
      const glyphIndex = this.view.getUint8(basePosition + i + 2);
      if (glyphIndex > 0) {
        this.charToGlyphIndexMap.set(i, glyphIndex);
      }
    }
  }
  parseCMapFormat4(basePosition) {
    const segCount = Math.floor(this.view.getUint16(basePosition + 4) / 2);
    const endCodes = [];
    for (let i = 0; i < segCount; i++) {
      endCodes.push(this.view.getUint16(basePosition + i * 2 + 12));
    }
    const startCodes = [];
    for (let i = 0; i < segCount; i++) {
      startCodes.push(this.view.getUint16(basePosition + (segCount + i) * 2 + 14));
    }
    const idDeltas = [];
    for (let i = 0; i < segCount; i++) {
      idDeltas.push(this.view.getUint16(basePosition + (segCount * 2 + i) * 2 + 14));
    }
    const idRangeOffsetBasePos = basePosition + segCount * 6 + 14;
    const idRangeOffsets = [];
    for (let i = 0; i < segCount; i++) {
      idRangeOffsets.push(this.view.getUint16(idRangeOffsetBasePos + i * 2));
    }
    for (let s = 0; s < segCount - 1; s++) {
      const startCode = startCodes[s];
      const endCode = endCodes[s];
      const idDelta = idDeltas[s];
      const idRangeOffset = idRangeOffsets[s];
      const idRangeOffsetAddress = idRangeOffsetBasePos + s * 2;
      for (let c = startCode; c <= endCode; c++) {
        let glyphIndex;
        if (idRangeOffset === 0) {
          glyphIndex = (idDelta + c) % 65536;
        } else {
          const glyphIndexAddress = idRangeOffset + 2 * (c - startCode) + idRangeOffsetAddress;
          if (glyphIndexAddress + 1 >= this.bytes.length) {
            continue;
          }
          glyphIndex = this.view.getUint16(glyphIndexAddress);
        }
        this.charToGlyphIndexMap.set(c, glyphIndex);
      }
    }
  }
  parseCMapFormat6(basePosition) {
    const firstCode = this.view.getUint16(basePosition + 4);
    const entryCount = this.view.getUint16(basePosition + 6);
    for (let i = 0; i < entryCount; i++) {
      const glyphIndex = this.view.getUint16(basePosition + i * 2 + 8);
      if (glyphIndex > 0) {
        this.charToGlyphIndexMap.set(firstCode + i, glyphIndex);
      }
    }
  }
  parseCMapFormat12(basePosition) {
    const numGroups = this.view.getUint32(basePosition + 10);
    for (let i = 0; i < numGroups; i++) {
      const startCharCode = this.view.getUint32(basePosition + i * 12 + 14);
      const endCharCode = this.view.getUint32(basePosition + i * 12 + 18);
      const startGlyphID = this.view.getUint32(basePosition + i * 12 + 22);
      for (let j = startCharCode; j <= endCharCode; j++) {
        this.charToGlyphIndexMap.set(j, startGlyphID + j - startCharCode);
      }
    }
  }
  parseIndexes() {
    const basePosition = this.tableOffset(TtfTable.loca);
    const shortFormat = this.indexToLocFormat === 0;
    let prevOffset = shortFormat ? this.view.getUint16(basePosition) * 2 : this.view.getUint32(basePosition);
    for (let i = 1; i < this.numGlyphs + 1; i++) {
      const offset = shortFormat ? this.view.getUint16(basePosition + i * 2) * 2 : this.view.getUint32(basePosition + i * 4);
      this.glyphOffsets.push(prevOffset);
      this.glyphSizes.push(offset - prevOffset);
      prevOffset = offset;
    }
  }
  parseGlyphs() {
    const baseOffset = this.tableOffset(TtfTable.glyf);
    const hmtxOffset = this.tableOffset(TtfTable.hmtx);
    const unitsPerEm = this.unitsPerEm;
    const numOfLongHorMetrics = this.numOfLongHorMetrics;
    const ascent = this.ascent;
    const descent = this.descent;
    const defaultAdvanceWidth = this.view.getUint16(hmtxOffset + (numOfLongHorMetrics - 1) * 4);
    for (let glyphIndex = 0; glyphIndex < this.numGlyphs; glyphIndex++) {
      const advanceWidth = glyphIndex < numOfLongHorMetrics ? this.view.getUint16(hmtxOffset + glyphIndex * 4) : defaultAdvanceWidth;
      const leftBearing = glyphIndex < numOfLongHorMetrics ? this.view.getInt16(hmtxOffset + glyphIndex * 4 + 2) : this.view.getInt16(hmtxOffset + numOfLongHorMetrics * 4 + (glyphIndex - numOfLongHorMetrics) * 2);
      if (this.glyphSizes[glyphIndex] === 0) {
        this.glyphInfoMap.set(glyphIndex, new PdfFontMetrics({
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          ascent: 0,
          descent: 0,
          advanceWidth: advanceWidth / unitsPerEm,
          leftBearing: leftBearing / unitsPerEm
        }));
        continue;
      }
      const offset = baseOffset + this.glyphOffsets[glyphIndex];
      this.glyphInfoMap.set(glyphIndex, new PdfFontMetrics({
        left: this.view.getInt16(offset + 2) / unitsPerEm,
        top: this.view.getInt16(offset + 4) / unitsPerEm,
        right: this.view.getInt16(offset + 6) / unitsPerEm,
        bottom: this.view.getInt16(offset + 8) / unitsPerEm,
        ascent: ascent / unitsPerEm,
        descent: descent / unitsPerEm,
        advanceWidth: advanceWidth / unitsPerEm,
        leftBearing: leftBearing / unitsPerEm
      }));
    }
  }
  readGlyph(index) {
    if (index < 0 || index >= this.glyphOffsets.length) {
      throw new RangeError(`Glyph ${index} is outside this font's ${this.glyphOffsets.length} glyphs`);
    }
    const glyfOffset = this.tableOffset(TtfTable.glyf);
    const start = glyfOffset + this.glyphOffsets[index];
    const glyfEnd = glyfOffset + (this.tableSize.get(TtfTable.glyf) ?? 0);
    if (start >= glyfEnd || start === 0 || this.glyphSizes[index] === 0) {
      return {
        index,
        data: new Uint8Array(0),
        compounds: []
      };
    }
    const numberOfContours = this.view.getInt16(start);
    return numberOfContours === -1 ? this.readCompoundGlyph(index, start, start + 10) : this.readSimpleGlyph(index, start, start + 10, numberOfContours);
  }
  readSimpleGlyph(glyph, start, offset, numberOfContours) {
    const xIsByte = 2;
    const yIsByte = 4;
    const repeat = 8;
    const xDelta = 16;
    const yDelta = 32;
    let numPoints = 1;
    for (let i = 0; i < numberOfContours; i++) {
      numPoints = Math.max(numPoints, this.view.getUint16(offset) + 1);
      offset += 2;
    }
    offset += this.view.getUint16(offset) + 2;
    if (numberOfContours === 0) {
      return {
        index: glyph,
        data: this.bytes.subarray(start, offset),
        compounds: []
      };
    }
    const flags = [];
    for (let i = 0; i < numPoints; i++) {
      const flag = this.view.getUint8(offset++);
      flags.push(flag);
      if ((flag & repeat) !== 0) {
        let repeatCount = this.view.getUint8(offset++);
        i += repeatCount;
        while (repeatCount-- > 0) {
          flags.push(flag);
        }
      }
    }
    let byteFlag = xIsByte;
    let deltaFlag = xDelta;
    for (let a = 0; a < 2; a++) {
      for (let i = 0; i < numPoints; i++) {
        const flag = flags[i];
        if ((flag & byteFlag) !== 0) {
          offset++;
        } else if ((~flag & deltaFlag) !== 0) {
          offset += 2;
        }
      }
      byteFlag = yIsByte;
      deltaFlag = yDelta;
    }
    return {
      index: glyph,
      data: this.bytes.subarray(start, offset),
      compounds: []
    };
  }
  readCompoundGlyph(glyph, start, offset) {
    const arg1And2AreWords = 1;
    const hasScale = 8;
    const moreComponents = 32;
    const hasXYScale = 64;
    const hasTransformationMatrix = 128;
    const weHaveInstructions = 256;
    const components = [];
    let hasInstructions = false;
    let flags = moreComponents;
    while ((flags & moreComponents) !== 0) {
      flags = this.view.getUint16(offset);
      components.push(this.view.getUint16(offset + 2));
      offset += (flags & arg1And2AreWords) !== 0 ? 8 : 6;
      if ((flags & hasScale) !== 0) {
        offset += 2;
      } else if ((flags & hasXYScale) !== 0) {
        offset += 4;
      } else if ((flags & hasTransformationMatrix) !== 0) {
        offset += 8;
      }
      if ((flags & weHaveInstructions) !== 0) {
        hasInstructions = true;
      }
    }
    if (hasInstructions) {
      offset += this.view.getUint16(offset) + 2;
    }
    return {
      index: glyph,
      data: this.bytes.subarray(start, offset),
      compounds: components
    };
  }
}

function decodeUtf16Be(bytes) {
  let text = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode(bytes[i] << 8 | bytes[i + 1]);
  }
  return text;
}

function decodeLatin1(bytes) {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

function wordAlign(offset, align = 4) {
  return offset + (align - offset % align) % align;
}

function calcTableChecksum(table) {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let sum = 0;
  for (let i = 0; i < table.byteLength - 3; i += 4) {
    sum = sum + view.getUint32(i) >>> 0;
  }
  return sum;
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function updateCompoundGlyph(glyph, compoundMap) {
  const arg1And2AreWords = 1;
  const hasScale = 8;
  const moreComponents = 32;
  const hasXYScale = 64;
  const hasTransformationMatrix = 128;
  const view = viewOf(glyph.data);
  let offset = 10;
  let flags = moreComponents;
  while ((flags & moreComponents) !== 0) {
    flags = view.getUint16(offset);
    const glyphIndex = view.getUint16(offset + 2);
    const mapped = compoundMap.get(glyphIndex);
    if (mapped === undefined || mapped < 0) {
      throw new TypeError(`Composite glyph ${glyph.index} refers to glyph ${glyphIndex}, which is not in the subset`);
    }
    view.setUint16(offset + 2, mapped);
    offset += (flags & arg1And2AreWords) !== 0 ? 8 : 6;
    if ((flags & hasScale) !== 0) {
      offset += 2;
    } else if ((flags & hasXYScale) !== 0) {
      offset += 4;
    } else if ((flags & hasTransformationMatrix) !== 0) {
      offset += 8;
    }
  }
}

class TtfWriter {
  constructor(ttf) {
    this.ttf = ttf;
  }
  withChars(chars) {
    const ttf = this.ttf;
    const source = viewOf(ttf.bytes);
    const tables = new Map;
    const tablesLength = new Map;
    const glyphsMap = new Map;
    const compounds = new Map;
    const visited = new Set;
    const addGlyph = glyphIndex => {
      if (visited.has(glyphIndex)) {
        return;
      }
      visited.add(glyphIndex);
      const glyph = ttf.readGlyph(glyphIndex);
      for (const component of glyph.compounds) {
        compounds.set(component, -1);
        addGlyph(component);
      }
      glyphsMap.set(glyphIndex, {
        index: glyphIndex,
        data: glyph.data.slice(),
        compounds: glyph.compounds
      });
    };
    const glyphsInfo = [];
    const placed = new Set;
    const place = glyph => {
      glyphsInfo.push(glyph);
      placed.add(glyph);
    };
    for (const char of chars) {
      if (char === 32) {
        const spaceIndex = ttf.charToGlyphIndexMap.get(32);
        place(spaceIndex === undefined ? {
          index: 0,
          data: new Uint8Array(0),
          compounds: [],
          placeholder: true
        } : {
          index: spaceIndex,
          data: new Uint8Array(0),
          compounds: []
        });
        continue;
      }
      const glyphIndex = ttf.charToGlyphIndexMap.get(char) ?? 0;
      if (glyphIndex >= ttf.glyphOffsets.length) {
        place({
          index: 0,
          data: new Uint8Array(0),
          compounds: [],
          placeholder: true
        });
        continue;
      }
      addGlyph(glyphIndex);
      const glyph = glyphsMap.get(glyphIndex);
      place(glyph ?? {
        index: glyphIndex,
        data: new Uint8Array(0),
        compounds: [],
        placeholder: true
      });
    }
    for (const glyph of glyphsMap.values()) {
      if (!placed.has(glyph)) {
        place(glyph);
      }
    }
    for (const compound of compounds.keys()) {
      const position = glyphsInfo.findIndex(glyph => !glyph.placeholder && glyph.index === compound);
      if (position < 0) {
        throw new TypeError(`Unable to find glyph ${compound} in the subset`);
      }
      compounds.set(compound, position);
    }
    const rewritten = new Set;
    for (const glyph of glyphsInfo) {
      if (glyph.compounds.length > 0 && !rewritten.has(glyph)) {
        rewritten.add(glyph);
        updateCompoundGlyph(glyph, compounds);
      }
    }
    let glyphsTableLength = 0;
    for (const glyph of glyphsInfo) {
      glyphsTableLength = wordAlign(glyphsTableLength + glyph.data.length);
    }
    const glyphsTable = new Uint8Array(wordAlign(glyphsTableLength));
    tables.set(TtfTable.glyf, glyphsTable);
    tablesLength.set(TtfTable.glyf, glyphsTableLength);
    const shortLoca = ttf.indexToLocFormat === 0;
    const locaLength = (glyphsInfo.length + 1) * (shortLoca ? 2 : 4);
    const locaTable = new Uint8Array(wordAlign(locaLength));
    const locaView = viewOf(locaTable);
    tables.set(TtfTable.loca, locaTable);
    tablesLength.set(TtfTable.loca, locaLength);
    let glyphOffset = 0;
    let locaIndex = 0;
    for (const glyph of glyphsInfo) {
      if (shortLoca) {
        locaView.setUint16(locaIndex, glyphOffset / 2);
        locaIndex += 2;
      } else {
        locaView.setUint32(locaIndex, glyphOffset);
        locaIndex += 4;
      }
      glyphsTable.set(glyph.data, glyphOffset);
      glyphOffset = wordAlign(glyphOffset + glyph.data.length);
    }
    if (shortLoca) {
      locaView.setUint16(locaIndex, glyphOffset / 2);
    } else {
      locaView.setUint32(locaIndex, glyphOffset);
    }
    for (const name of [ TtfTable.head, TtfTable.maxp, TtfTable.hhea, TtfTable.os2 ]) {
      const start = ttf.tableOffsets.get(name);
      if (start === undefined) {
        continue;
      }
      const length = ttf.tableSize.get(name) ?? 0;
      const data = new Uint8Array(wordAlign(length));
      data.set(ttf.bytes.subarray(start, Math.min(start + data.length, ttf.bytes.length)));
      tables.set(name, data);
      tablesLength.set(name, length);
    }
    const head = tables.get(TtfTable.head);
    const maxp = tables.get(TtfTable.maxp);
    const hhea = tables.get(TtfTable.hhea);
    if (head === undefined || maxp === undefined || hhea === undefined) {
      throw new TypeError("This font has no `head`, `maxp` or `hhea` table and cannot be subset");
    }
    viewOf(head).setUint32(8, 0);
    viewOf(maxp).setUint16(4, glyphsInfo.length);
    viewOf(hhea).setUint16(34, glyphsInfo.length);
    {
      const length = 32;
      const data = new Uint8Array(wordAlign(length));
      const start = ttf.tableOffsets.get(TtfTable.post);
      if (start !== undefined) {
        data.set(ttf.bytes.subarray(start, Math.min(start + data.length, ttf.bytes.length)));
      }
      viewOf(data).setUint32(0, 196608);
      tables.set(TtfTable.post, data);
      tablesLength.set(TtfTable.post, length);
    }
    {
      const length = 4 * glyphsInfo.length;
      const hmtx = new Uint8Array(wordAlign(length));
      const hmtxView = viewOf(hmtx);
      const hmtxOffset = ttf.tableOffsets.get(TtfTable.hmtx) ?? 0;
      const numOfLongHorMetrics = ttf.numOfLongHorMetrics;
      const defaultAdvanceWidth = source.getUint16(hmtxOffset + (numOfLongHorMetrics - 1) * 4);
      let index = 0;
      for (const glyph of glyphsInfo) {
        const advanceWidth = glyph.index < numOfLongHorMetrics ? source.getUint16(hmtxOffset + glyph.index * 4) : defaultAdvanceWidth;
        const leftBearing = glyph.index < numOfLongHorMetrics ? source.getInt16(hmtxOffset + glyph.index * 4 + 2) : source.getInt16(hmtxOffset + numOfLongHorMetrics * 4 + (glyph.index - numOfLongHorMetrics) * 2);
        hmtxView.setUint16(index, advanceWidth);
        hmtxView.setInt16(index + 2, leftBearing);
        index += 4;
      }
      tables.set(TtfTable.hmtx, hmtx);
      tablesLength.set(TtfTable.hmtx, length);
    }
    {
      const length = 40;
      const cmap = new Uint8Array(wordAlign(length));
      const cmapView = viewOf(cmap);
      cmapView.setUint16(0, 0);
      cmapView.setUint16(2, 1);
      cmapView.setUint16(4, 3);
      cmapView.setUint16(6, 10);
      cmapView.setUint32(8, 12);
      cmapView.setUint16(12, 12);
      cmapView.setUint32(16, 28);
      cmapView.setUint32(20, 1);
      cmapView.setUint32(24, 1);
      cmapView.setUint32(28, 32);
      cmapView.setUint32(32, chars.length + 31);
      cmapView.setUint32(36, 0);
      tables.set(TtfTable.cmap, cmap);
      tablesLength.set(TtfTable.cmap, length);
    }
    {
      const length = 18;
      const nameTable = new Uint8Array(wordAlign(length));
      const nameView = viewOf(nameTable);
      nameView.setUint16(0, 0);
      nameView.setUint16(2, 0);
      nameView.setUint16(4, 6);
      tables.set(TtfTable.name, nameTable);
      tablesLength.set(TtfTable.name, length);
    }
    return this.writeFile(tables, tablesLength);
  }
  writeFile(tables, tablesLength) {
    const tableKeys = [ TtfTable.head, TtfTable.hhea, TtfTable.maxp, TtfTable.os2, TtfTable.hmtx, TtfTable.cmap, TtfTable.loca, TtfTable.glyf, TtfTable.name, TtfTable.post ].filter(name => tables.has(name));
    const numTables = tableKeys.length;
    const directoryLength = 12 + numTables * 16;
    let total = directoryLength;
    for (const name of tableKeys) {
      total += tables.get(name).length;
    }
    const output = new Uint8Array(total);
    const view = viewOf(output);
    view.setUint32(0, 65536);
    view.setUint16(4, numTables);
    let pot = numTables;
    while ((pot & pot - 1) !== 0) {
      pot++;
    }
    view.setUint16(6, pot * 16);
    view.setUint16(8, Math.trunc(Math.log(pot)));
    view.setUint16(10, pot * 16 - numTables * 16);
    let offset = directoryLength;
    let headOffset = 0;
    let count = 0;
    for (const name of tableKeys) {
      const data = tables.get(name);
      const entry = 12 + count * 16;
      for (let i = 0; i < 4; i++) {
        output[entry + i] = name.charCodeAt(i);
      }
      view.setUint32(entry + 4, calcTableChecksum(data));
      view.setUint32(entry + 8, offset);
      view.setUint32(entry + 12, tablesLength.get(name) ?? data.length);
      if (name === TtfTable.head) {
        headOffset = offset;
      }
      output.set(data, offset);
      offset += data.length;
      count++;
    }
    view.setUint32(headOffset + 8, 2981146554 - calcTableChecksum(output) >>> 0);
    return output;
  }
}

function formatNumber(value) {
  const rounded = Math.abs(value) < 1e-6 ? 0 : value;
  return Number(rounded.toFixed(4)).toString();
}

class PdfNum extends PdfDataType {
  constructor(value) {
    super();
    this.value = value;
  }
  output(s) {
    s.putString(formatNumber(this.value));
  }
}

class PdfArray extends PdfDataType {
  constructor(values = []) {
    super();
    this.values = [ ...values ];
  }
  static fromNum(values) {
    return new PdfArray(values.map(value => new PdfNum(value)));
  }
  static fromObjects(objects) {
    return new PdfArray(objects.map(object => object.ref()));
  }
  get length() {
    return this.values.length;
  }
  add(value) {
    this.values.push(value);
  }
  output(s) {
    s.putString("[");
    for (let index = 0; index < this.values.length; index++) {
      if (index > 0) {
        s.putByte(32);
      }
      this.values[index]?.output(s);
    }
    s.putString("]");
  }
}

class PdfIndirect extends PdfDataType {
  constructor(ser, gen) {
    super();
    this.ser = ser;
    this.gen = gen;
  }
  equals(other) {
    return this.ser === other.ser && this.gen === other.gen;
  }
  output(s) {
    s.putString(`${this.ser} ${this.gen} R`);
  }
}

class PdfObjectBase {
  constructor(objser, params, objgen = 0) {
    this.objser = objser;
    this.objgen = objgen;
    this.params = params;
  }
  ref() {
    return new PdfIndirect(this.objser, this.objgen);
  }
  prepare() {}
  output(s) {
    const offset = s.offset;
    s.putString(`${this.objser} ${this.objgen} obj\n`);
    this.writeContent(s);
    s.putString("endobj\n");
    return offset;
  }
  writeContent(s) {
    this.params.output(s);
    s.putByte(10);
  }
}

class PdfObject extends PdfObjectBase {
  constructor(document, params, objser) {
    super(objser ?? document.genSerial(), params);
    document.register(this);
  }
}

class PdfFontDescriptor extends PdfObject {
  constructor(document, options) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/FontDescriptor") ], [ "/FontName", new PdfName(`/${options.fontName}`) ], [ "/FontFile2", options.file.ref() ], [ "/Flags", new PdfNum(options.flags) ], [ "/FontBBox", PdfArray.fromNum([ ...options.fontBBox ]) ], [ "/Ascent", new PdfNum(Math.trunc(options.ascent * 1e3)) ], [ "/Descent", new PdfNum(Math.trunc(options.descent * 1e3)) ], [ "/ItalicAngle", new PdfNum(0) ], [ "/CapHeight", new PdfNum(10) ], [ "/StemV", new PdfNum(79) ] ]));
  }
}

class PdfDictStream extends PdfDict {
  constructor(data = new Uint8Array(0), values) {
    super(values);
    this.data = data;
  }
  output(s) {
    this.set("/Length", new PdfNum(this.data.length));
    super.output(s);
    s.putString("\nstream\n");
    s.putBytes(this.data);
    if (this.data.length === 0 || this.data[this.data.length - 1] !== 10) {
      s.putByte(10);
    }
    s.putString("endstream");
  }
}

class PdfObjectStream extends PdfObject {
  constructor(document, data) {
    super(document, new PdfDictStream(data));
  }
}

function hex4(value) {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

function unicodeCmapStream(cmap, protect = false) {
  const values = protect ? cmap.map((value, index) => index === 0 ? value : 32) : cmap;
  let output = "/CIDInit/ProcSet\nfindresource begin\n" + "12 dict begin\n" + "begincmap\n" + "/CIDSystemInfo<<\n" + "/Registry (Adobe)\n" + "/Ordering (UCS)\n" + "/Supplement 0\n" + ">> def\n" + "/CMapName/Adobe-Identity-UCS def\n" + "/CMapType 2 def\n" + "1 begincodespacerange\n" + "<0000> <FFFF>\n" + "endcodespacerange\n" + `${values.length} beginbfchar\n`;
  for (let key = 0; key < values.length; key++) {
    output += `<${hex4(key)}> <${hex4(values[key] ?? 0)}>\n`;
  }
  output += "endbfchar\n" + "endcmap\n" + "CMapName currentdict /CMap defineresource pop\n" + "end\n" + "end";
  return output;
}

class PdfUnicodeCmap extends PdfObjectStream {
  constructor(document, cmap, protect = false) {
    super(document, encodeLatin1(unicodeCmapStream(cmap, protect)));
  }
}

class PdfTtfFont {
  constructor(bytes, {protect = false} = {}) {
    this.cmap = [ 0 ];
    this.cidByRune = new Map([ [ 0, 0 ] ]);
    this.font = new TtfParser(bytes);
    this.protect = protect;
    if (this.font.hasCff) {
      throw new TypeError(`\`${this.font.fontName}\` has PostScript (CFF) outlines, which this port cannot subset`);
    }
    if (!this.font.unicode) {
      throw new TypeError(`\`${this.font.fontName}\` is not a 0x00010000 TrueType font, which this port requires to embed`);
    }
  }
  get fontName() {
    return this.font.fontName;
  }
  get ascent() {
    return this.font.ascent / this.font.unitsPerEm;
  }
  get descent() {
    return this.font.descent / this.font.unitsPerEm;
  }
  get unitsPerEm() {
    return this.font.unitsPerEm;
  }
  isRuneSupported(codePoint) {
    return this.font.charToGlyphIndexMap.has(codePoint);
  }
  glyphMetrics(codePoint) {
    const glyph = this.font.charToGlyphIndexMap.get(codePoint);
    if (glyph === undefined) {
      return PdfFontMetrics.zero;
    }
    return this.font.glyphInfoMap.get(glyph) ?? PdfFontMetrics.zero;
  }
  stringMetrics(text, size, letterSpacing = 0) {
    const metrics = [];
    for (const character of String(text)) {
      metrics.push(this.glyphMetrics(character.codePointAt(0) ?? 0).scale(size));
    }
    return PdfFontMetrics.append(metrics, letterSpacing);
  }
  encodeText(text) {
    const cids = [];
    for (const character of String(text)) {
      const rune = character.codePointAt(0) ?? 0;
      let cid = this.cidByRune.get(rune);
      if (cid === undefined) {
        cid = this.cmap.length;
        this.cmap.push(rune);
        this.cidByRune.set(rune, cid);
      }
      cids.push(cid);
    }
    return pdfHexString(cids);
  }
  resourceDict(document) {
    const subset = new TtfWriter(this.font).withChars(this.cmap);
    const file = new PdfObjectStream(document, subset);
    file.params.set("/Length1", new PdfNum(subset.length));
    const unitsPerEm = this.font.unitsPerEm;
    const descriptor = new PdfFontDescriptor(document, {
      fontName: this.fontName,
      file,
      flags: 4,
      fontBBox: [ Math.trunc(this.font.xMin / unitsPerEm * 1e3), Math.trunc(this.font.yMin / unitsPerEm * 1e3), Math.trunc(this.font.xMax / unitsPerEm * 1e3), Math.trunc(this.font.yMax / unitsPerEm * 1e3) ],
      ascent: this.ascent,
      descent: this.descent
    });
    const widths = new PdfObject(document, PdfArray.fromNum(this.cmap.map(rune => Math.trunc(this.glyphMetrics(rune).advanceWidth * 1e3))));
    const unicodeCmap = new PdfUnicodeCmap(document, this.cmap, this.protect);
    const descendant = new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/FontFile2", file.ref() ], [ "/FontDescriptor", descriptor.ref() ], [ "/W", new PdfArray([ new PdfNum(0), widths.ref() ]) ], [ "/CIDToGIDMap", new PdfName("/Identity") ], [ "/DW", new PdfNum(1e3) ], [ "/Subtype", new PdfName("/CIDFontType2") ], [ "/CIDSystemInfo", new PdfDict([ [ "/Supplement", new PdfNum(0) ], [ "/Registry", new PdfString("Adobe") ], [ "/Ordering", new PdfString("Identity-H") ] ]) ] ]);
    return new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/Subtype", new PdfName("/Type0") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/Encoding", new PdfName("/Identity-H") ], [ "/DescendantFonts", new PdfArray([ descendant ]) ], [ "/ToUnicode", unicodeCmap.ref() ] ]);
  }
}

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(value, fallback = [ 0, 0, 0 ]) {
  if (value == null) return fallback;
  if (Array.isArray(value)) {
    const [r, g, b] = value;
    return [ clamp(Number(r), 0, 1), clamp(Number(g), 0, 1), clamp(Number(b), 0, 1) ];
  }
  if (typeof value === "string") {
    const hex = value.startsWith("#") ? value.slice(1) : value;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [ parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255 ];
    }
  }
  throw new TypeError("Color must be [r,g,b] with values from 0 to 1 or #RRGGBB");
}

function colorOperator(color, stroke = false) {
  const [r, g, b] = normalizeColor(color);
  return `${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} ${stroke ? "RG" : "rg"}`;
}

function normalizeInsets(value = 0) {
  if (typeof value === "number") {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  }
  return {
    top: Number(value.top ?? value.vertical ?? 0),
    right: Number(value.right ?? value.horizontal ?? 0),
    bottom: Number(value.bottom ?? value.vertical ?? 0),
    left: Number(value.left ?? value.horizontal ?? 0)
  };
}

const EdgeInsets = Object.freeze({
  zero: Object.freeze({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  }),
  all(value) {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  },
  symmetric({vertical = 0, horizontal = 0}) {
    return {
      top: vertical,
      right: horizontal,
      bottom: vertical,
      left: horizontal
    };
  },
  only({top = 0, right = 0, bottom = 0, left = 0} = {}) {
    return {
      top,
      right,
      bottom,
      left
    };
  },
  fromLTRB(left, top, right, bottom) {
    return {
      top,
      right,
      bottom,
      left
    };
  }
});

function insetsHorizontal(insets) {
  return insets.left + insets.right;
}

function insetsVertical(insets) {
  return insets.top + insets.bottom;
}

const Alignment = Object.freeze({
  topLeft: Object.freeze({
    x: -1,
    y: 1
  }),
  topCenter: Object.freeze({
    x: 0,
    y: 1
  }),
  topRight: Object.freeze({
    x: 1,
    y: 1
  }),
  centerLeft: Object.freeze({
    x: -1,
    y: 0
  }),
  center: Object.freeze({
    x: 0,
    y: 0
  }),
  centerRight: Object.freeze({
    x: 1,
    y: 0
  }),
  bottomLeft: Object.freeze({
    x: -1,
    y: -1
  }),
  bottomCenter: Object.freeze({
    x: 0,
    y: -1
  }),
  bottomRight: Object.freeze({
    x: 1,
    y: -1
  })
});

function inscribe(alignment, childWidth, childHeight, boxWidth, boxHeight) {
  const halfWidthDelta = (boxWidth - childWidth) / 2;
  const halfHeightDelta = (boxHeight - childHeight) / 2;
  return {
    dx: halfWidthDelta + alignment.x * halfWidthDelta,
    dy: halfHeightDelta - alignment.y * halfHeightDelta
  };
}

class Widget {}

class StatelessWidget extends Widget {
  layout(context, constraints) {
    const childBox = this.build(context).layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class Padding extends Widget {
  constructor({padding = 0, child = null} = {}) {
    super();
    this.padding = normalizeInsets(padding);
    this.child = child;
  }
  layout(context, constraints) {
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);
    if (this.child === null) {
      return {
        widget: this,
        width: Math.min(constraints.maxWidth, horizontal),
        height: Math.min(constraints.maxHeight, vertical),
        data: {
          childBox: null
        }
      };
    }
    const childBox = this.child.layout(context, {
      maxWidth: Math.max(0, constraints.maxWidth - horizontal),
      maxHeight: Math.max(0, constraints.maxHeight - vertical)
    });
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, childBox.width + horizontal),
      height: childBox.height + vertical,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null) return;
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left,
      y: box.y + this.padding.top
    });
  }
}

class Align extends Widget {
  constructor({alignment = Alignment.center, widthFactor = null, heightFactor = null, child = null} = {}) {
    super();
    this.alignment = alignment;
    this.widthFactor = widthFactor;
    this.heightFactor = heightFactor;
    this.child = child;
  }
  layout(context, constraints) {
    if (this.child === null) {
      return {
        widget: this,
        width: this.widthFactor === null ? constraints.maxWidth : 0,
        height: this.heightFactor === null ? constraints.maxHeight : 0,
        data: {
          childBox: null,
          dx: 0,
          dy: 0
        }
      };
    }
    const childBox = this.child.layout(context, constraints);
    const width = this.widthFactor === null ? constraints.maxWidth : Math.min(constraints.maxWidth, childBox.width * this.widthFactor);
    const height = this.heightFactor === null ? constraints.maxHeight : Math.min(constraints.maxHeight, childBox.height * this.heightFactor);
    const offset = inscribe(this.alignment, childBox.width, childBox.height, width, height);
    return {
      widget: this,
      width,
      height,
      data: {
        childBox,
        dx: offset.dx,
        dy: offset.dy
      }
    };
  }
  paint(context, box) {
    const {childBox, dx, dy} = box.data;
    if (childBox === null) return;
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + dx,
      y: box.y + dy
    });
  }
}

class Center extends Align {
  constructor({widthFactor = null, heightFactor = null, child = null} = {}) {
    super({
      alignment: Alignment.center,
      widthFactor,
      heightFactor,
      child
    });
  }
}

class SizedBox extends Widget {
  constructor({width = null, height = null, child = null} = {}) {
    super();
    this.width = width === null ? null : Number(width);
    this.height = height === null ? null : Number(height);
    this.child = child;
  }
  layout(context, constraints) {
    const maxWidth = Math.min(constraints.maxWidth, this.width ?? constraints.maxWidth);
    const maxHeight = Math.min(constraints.maxHeight, this.height ?? constraints.maxHeight);
    const childBox = this.child === null ? null : this.child.layout(context, {
      maxWidth,
      maxHeight
    });
    return {
      widget: this,
      width: this.width ?? childBox?.width ?? 0,
      height: this.height ?? childBox?.height ?? 0,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null) return;
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

const DEFAULT_DIVIDER_HEIGHT = 16;

const DEFAULT_DIVIDER_THICKNESS = 1;

class Divider extends Widget {
  constructor({height = DEFAULT_DIVIDER_HEIGHT, thickness = DEFAULT_DIVIDER_THICKNESS, indent = 0, endIndent = 0, color = "#000000"} = {}) {
    super();
    this.height = Math.max(0, Number(height));
    this.thickness = Math.max(0, Number(thickness));
    this.indent = Math.max(0, Number(indent));
    this.endIndent = Math.max(0, Number(endIndent));
    this.color = normalizeColor(color);
  }
  layout(_context, constraints) {
    return {
      widget: this,
      width: constraints.maxWidth,
      height: Math.min(constraints.maxHeight, this.height),
      data: null
    };
  }
  paint(context, box) {
    const width = Math.max(0, box.width - this.indent - this.endIndent);
    if (width === 0 || this.thickness === 0) return;
    context.canvas.fillRect(box.x + this.indent, box.y + (box.height - this.thickness) / 2, width, this.thickness, this.color);
  }
}

class Container extends Widget {
  constructor({child = null, width = null, height = null, padding = 0, margin = 0, background = null, borderColor = null, borderWidth = 1} = {}) {
    super();
    this.child = child;
    this.width = width == null ? null : Number(width);
    this.height = height == null ? null : Number(height);
    this.padding = normalizeInsets(padding);
    this.margin = normalizeInsets(margin);
    this.background = background == null ? null : normalizeColor(background);
    this.borderColor = borderColor == null ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
  }
  layout(context, constraints) {
    const outerMaxWidth = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right);
    const desiredWidth = this.width == null ? outerMaxWidth : Math.min(this.width, outerMaxWidth);
    const innerMaxWidth = Math.max(0, desiredWidth - this.padding.left - this.padding.right);
    const childBox = this.child ? this.child.layout(context, {
      maxWidth: innerMaxWidth,
      maxHeight: constraints.maxHeight
    }) : null;
    const contentHeight = childBox?.height ?? 0;
    const contentWidth = childBox?.width ?? 0;
    const boxWidth = this.width == null ? Math.min(outerMaxWidth, Math.max(contentWidth + this.padding.left + this.padding.right, desiredWidth)) : desiredWidth;
    const boxHeight = this.height == null ? contentHeight + this.padding.top + this.padding.bottom : this.height;
    return {
      widget: this,
      width: boxWidth + this.margin.left + this.margin.right,
      height: boxHeight + this.margin.top + this.margin.bottom,
      data: {
        childBox,
        boxWidth,
        boxHeight
      }
    };
  }
  paint(context, box) {
    const x = box.x + this.margin.left;
    const y = box.y + this.margin.top;
    const {boxWidth, boxHeight, childBox} = box.data;
    if (this.background) {
      context.canvas.fillRect(x, y, boxWidth, boxHeight, this.background);
    }
    if (this.borderColor && this.borderWidth > 0) {
      context.canvas.strokeRect(x, y, boxWidth, boxHeight, this.borderColor, this.borderWidth);
    }
    if (childBox) {
      childBox.widget.paint(context, {
        ...childBox,
        x: x + this.padding.left,
        y: y + this.padding.top
      });
    }
  }
}

function legacyRef(xref, free = false) {
  const offset = String(xref.offset).padStart(10, "0");
  const gen = String(xref.gen).padStart(5, "0");
  return `${offset} ${gen} ${free ? "f" : "n"} `;
}

class PdfXrefTable {
  constructor() {
    this.params = new PdfDict;
    this.objects = [];
  }
  add(object) {
    this.objects.push(object);
  }
  writeBlock(s, firstId, block) {
    s.putString(`${firstId} ${block.length}\n`);
    for (const row of block) {
      s.putString(row);
      s.putByte(10);
    }
  }
  output(s) {
    s.putString("%PDF-1.7\n%âãÏÓ\n");
    const ordered = [ ...this.objects ].sort((a, b) => a.objser - b.objser);
    const xrefList = [];
    for (const object of ordered) {
      const offset = object.output(s);
      xrefList.push({
        ser: object.objser,
        gen: object.objgen,
        offset
      });
    }
    const xrefOffset = s.offset;
    s.putString("xref\n");
    let firstId = 0;
    let lastId = 0;
    let block = [ legacyRef({
      gen: 65535,
      offset: 0
    }, true) ];
    for (const xref of xrefList) {
      if (xref.ser !== lastId + 1) {
        this.writeBlock(s, firstId, block);
        block = [];
        firstId = xref.ser;
      }
      block.push(legacyRef(xref));
      lastId = xref.ser;
    }
    this.writeBlock(s, firstId, block);
    const trailer = new PdfDict;
    trailer.set("/Size", new PdfNum(lastId + 1));
    for (const [key, value] of this.params.values) {
      trailer.set(key, value);
    }
    s.putString("trailer\n");
    trailer.output(s);
    s.putByte(10);
    s.putString(`startxref\n${xrefOffset}\n%%EOF\n`);
  }
}

class PdfCatalog extends PdfObject {
  constructor(document, pageList, objser) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/Catalog") ] ]), objser);
    this.pageList = pageList;
  }
  prepare() {
    this.params.set("/Pages", this.pageList.ref());
  }
}

class PdfInfo extends PdfObject {
  constructor(document, metadata) {
    super(document, new PdfDict);
    const entries = [ [ "/Title", metadata.title ], [ "/Author", metadata.author ], [ "/Subject", metadata.subject ], [ "/Creator", metadata.creator ], [ "/Producer", metadata.producer ] ];
    for (const [key, value] of entries) {
      if (value) {
        this.params.set(key, new PdfString(value));
      }
    }
  }
}

class PdfGraphicStream extends PdfObject {
  constructor() {
    super(...arguments);
    this.fonts = new Map;
    this.xObjects = new Map;
    this.graphicStates = new Map;
  }
  addFont(name, font) {
    if (!this.fonts.has(name)) {
      this.fonts.set(name, font);
    }
  }
  addXObject(name, xObject) {
    if (!this.xObjects.has(name)) {
      this.xObjects.set(name, xObject);
    }
  }
  addGraphicState(name, state) {
    if (!this.graphicStates.has(name)) {
      this.graphicStates.set(name, state);
    }
  }
  resources() {
    const resources = new PdfDict;
    if (this.fonts.size > 0) {
      resources.set("/Font", PdfDict.fromObjectMap(this.fonts));
    }
    if (this.xObjects.size > 0) {
      resources.set("/XObject", PdfDict.fromObjectMap(this.xObjects));
    }
    if (this.graphicStates.size > 0) {
      resources.set("/ExtGState", new PdfDict(this.graphicStates));
    }
    return resources.isEmpty ? null : resources;
  }
  prepare() {
    const resources = this.resources();
    if (resources !== null) {
      this.params.set("/Resources", resources);
    }
  }
}

class PdfPage extends PdfGraphicStream {
  constructor(document, pageList, pageFormat) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/Page") ] ]));
    this.contents = [];
    this.pageFormat = pageFormat;
    this.pageList = pageList;
    pageList.pages.push(this);
  }
  prepare() {
    this.params.set("/Parent", this.pageList.ref());
    this.params.set("/MediaBox", PdfArray.fromNum([ 0, 0, this.pageFormat.width, this.pageFormat.height ]));
    super.prepare();
    if (this.contents.length === 1) {
      this.params.set("/Contents", this.contents[0].ref());
    } else if (this.contents.length > 1) {
      this.params.set("/Contents", PdfArray.fromObjects(this.contents));
    }
  }
}

class PdfPageList extends PdfObject {
  constructor(document, objser) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/Pages") ] ]), objser);
    this.pages = [];
  }
  prepare() {
    this.params.set("/Count", new PdfNum(this.pages.length));
    this.params.set("/Kids", PdfArray.fromObjects(this.pages));
  }
}

class PdfDocument {
  constructor(metadata) {
    this.serial = 0;
    this.xref = new PdfXrefTable;
    this.fontObjects = new Map;
    const catalogSerial = this.genSerial();
    this.pageList = new PdfPageList(this);
    this.catalog = new PdfCatalog(this, this.pageList, catalogSerial);
    this.info = new PdfInfo(this, metadata);
  }
  get objects() {
    return this.xref.objects;
  }
  genSerial() {
    return ++this.serial;
  }
  register(object) {
    this.xref.add(object);
  }
  fontObject(font) {
    const existing = this.fontObjects.get(font);
    if (existing !== undefined) {
      return existing;
    }
    const object = new PdfObject(this, font.resourceDict(this));
    this.fontObjects.set(font, object);
    return object;
  }
  addPage(format, content, fonts = new Map, graphicStates = new Map) {
    const resources = [];
    for (const [font, name] of fonts) {
      resources.push([ name, this.fontObject(font) ]);
    }
    const stream = new PdfObjectStream(this, encodeLatin1(content));
    const page = new PdfPage(this, this.pageList, format);
    for (const [name, object] of resources) {
      page.addFont(name, object);
    }
    for (const [name, state] of graphicStates) {
      page.addGraphicState(name, state);
    }
    page.contents.push(stream);
    return page;
  }
  save() {
    for (const object of this.objects) {
      object.prepare();
    }
    this.xref.params.set("/Root", this.catalog.ref());
    this.xref.params.set("/Info", this.info.ref());
    const stream = new PdfStream;
    this.xref.output(stream);
    return stream.output();
  }
}

function serializePdf(pages, metadata) {
  const document = new PdfDocument(metadata);
  for (const page of pages) {
    document.addPage(page.format, page.content, page.fonts, page.graphicStates);
  }
  return document.save();
}

const TYPE1_FACES = Object.freeze({
  courier: PdfType1Font.courier,
  courierBold: PdfType1Font.courierBold,
  courierBoldOblique: PdfType1Font.courierBoldOblique,
  courierOblique: PdfType1Font.courierOblique,
  helvetica: PdfType1Font.helvetica,
  helveticaBold: PdfType1Font.helveticaBold,
  helveticaBoldOblique: PdfType1Font.helveticaBoldOblique,
  helveticaOblique: PdfType1Font.helveticaOblique,
  times: PdfType1Font.times,
  timesBold: PdfType1Font.timesBold,
  timesBoldItalic: PdfType1Font.timesBoldItalic,
  timesItalic: PdfType1Font.timesItalic,
  symbol: PdfType1Font.symbol,
  zapfDingbats: PdfType1Font.zapfDingbats
});

class Font {
  constructor(create) {
    this.create = create;
  }
  static type1(face) {
    const factory = TYPE1_FACES[face];
    if (factory === undefined) {
      throw new TypeError(`\`${face}\` is not one of the 14 standard Type1 fonts`);
    }
    return new Font(factory);
  }
  static courier() {
    return Font.type1("courier");
  }
  static courierBold() {
    return Font.type1("courierBold");
  }
  static courierBoldOblique() {
    return Font.type1("courierBoldOblique");
  }
  static courierOblique() {
    return Font.type1("courierOblique");
  }
  static helvetica() {
    return Font.type1("helvetica");
  }
  static helveticaBold() {
    return Font.type1("helveticaBold");
  }
  static helveticaBoldOblique() {
    return Font.type1("helveticaBoldOblique");
  }
  static helveticaOblique() {
    return Font.type1("helveticaOblique");
  }
  static times() {
    return Font.type1("times");
  }
  static timesBold() {
    return Font.type1("timesBold");
  }
  static timesBoldItalic() {
    return Font.type1("timesBoldItalic");
  }
  static timesItalic() {
    return Font.type1("timesItalic");
  }
  static symbol() {
    return Font.type1("symbol");
  }
  static zapfDingbats() {
    return Font.type1("zapfDingbats");
  }
  static ttf(data, options) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("Font.ttf expects the font file as a Uint8Array");
    }
    return new Font(() => new PdfTtfFont(data, options));
  }
  static fromPdfFont(font) {
    return new Font(() => font);
  }
  build() {
    return this.create();
  }
  getFont(context) {
    return context.document.resolveFont(this);
  }
}

const identityMatrix = Object.freeze([ 1, 0, 0, 1, 0, 0 ]);

function multiplyMatrix(first, second) {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [ a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1 ];
}

function composeMatrices(matrices) {
  let result = identityMatrix;
  for (const matrix of matrices) {
    result = multiplyMatrix(result, matrix);
  }
  return result;
}

function translationMatrix(tx, ty) {
  return [ 1, 0, 0, 1, tx, ty ];
}

function scaleMatrix(sx, sy = sx) {
  return [ sx, 0, 0, sy, 0, 0 ];
}

function rotationMatrix(radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [ cos, sin, -sin, cos, 0, 0 ];
}

function skewMatrix(alpha, beta) {
  return [ 1, Math.tan(beta), Math.tan(alpha), 1, 0, 0 ];
}

function transformPoint(matrix, x, y) {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f
  };
}

function invertMatrix(matrix) {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (determinant === 0 || !Number.isFinite(determinant)) {
    return null;
  }
  return [ d / determinant, -b / determinant, -c / determinant, a / determinant, (c * f - d * e) / determinant, (b * e - a * f) / determinant ];
}

function flipMatrix(matrix, height) {
  const flip = [ 1, 0, 0, -1, 0, height ];
  return multiplyMatrix(flip, multiplyMatrix(matrix, flip));
}

const LINE_CAP_OPERAND = Object.freeze({
  butt: 0,
  round: 1,
  square: 2
});

const LINE_JOIN_OPERAND = Object.freeze({
  miter: 0,
  round: 1,
  bevel: 2
});

const M4 = .551784;

function operands(values) {
  return values.map(formatNumber).join(" ");
}

class PdfCanvas {
  constructor(pageHeight) {
    this.commands = [];
    this.fontNames = new Map;
    this.stateNames = new Map;
    this.stateDicts = new Map;
    this.currentTransform = identityMatrix;
    this.transformStack = [];
    this.pageHeight = pageHeight;
  }
  push(command) {
    this.commands.push(command);
  }
  toPdfY(top) {
    return this.pageHeight - top;
  }
  addFont(font) {
    const existing = this.fontNames.get(font);
    if (existing !== undefined) {
      return existing;
    }
    const name = `/F${this.fontNames.size + 1}`;
    this.fontNames.set(font, name);
    return name;
  }
  get fonts() {
    return this.fontNames;
  }
  get graphicStates() {
    return this.stateDicts;
  }
  saveContext() {
    this.push("q");
    this.transformStack.push(this.currentTransform);
  }
  restoreContext() {
    const restored = this.transformStack.pop();
    if (restored === undefined) {
      return;
    }
    this.push("Q");
    this.currentTransform = restored;
  }
  save() {
    this.saveContext();
  }
  restore() {
    this.restoreContext();
  }
  setTransform(matrix) {
    this.push(`${operands(matrix)} cm`);
    this.currentTransform = multiplyMatrix(this.currentTransform, matrix);
  }
  getTransform() {
    return this.currentTransform;
  }
  setGraphicState(state) {
    if (state.isEmpty) {
      return null;
    }
    const existing = this.stateNames.get(state.key);
    if (existing !== undefined) {
      this.push(`${existing} gs`);
      return existing;
    }
    const name = `/g${this.stateDicts.size + 1}`;
    this.stateNames.set(state.key, name);
    this.stateDicts.set(name, state.output());
    this.push(`${name} gs`);
    return name;
  }
  moveTo(x, y) {
    this.push(`${operands([ x, y ])} m`);
  }
  lineTo(x, y) {
    this.push(`${operands([ x, y ])} l`);
  }
  curveTo(x1, y1, x2, y2, x3, y3) {
    this.push(`${operands([ x1, y1, x2, y2, x3, y3 ])} c`);
  }
  closePath() {
    this.push("h");
  }
  drawLine(x1, y1, x2, y2) {
    this.moveTo(x1, y1);
    this.lineTo(x2, y2);
  }
  drawRect(x, y, width, height) {
    this.push(`${operands([ x, y, width, height ])} re`);
  }
  drawBox(box) {
    this.drawRect(box.x, box.y, box.width, box.height);
  }
  drawRRect(x, y, width, height, rv, rh) {
    this.moveTo(x, y + rv);
    this.curveTo(x, y - M4 * rv + rv, x - M4 * rh + rh, y, x + rh, y);
    this.lineTo(x + width - rh, y);
    this.curveTo(x + M4 * rh + width - rh, y, x + width, y - M4 * rv + rv, x + width, y + rv);
    this.lineTo(x + width, y + height - rv);
    this.curveTo(x + width, y + M4 * rv + height - rv, x + M4 * rh + width - rh, y + height, x + width - rh, y + height);
    this.lineTo(x + rh, y + height);
    this.curveTo(x - M4 * rh + rh, y + height, x, y + M4 * rv + height - rv, x, y + height - rv);
    this.lineTo(x, y + rv);
  }
  drawEllipse(x, y, r1, r2, clockwise = true) {
    this.moveTo(x, y - r2);
    if (clockwise) {
      this.curveTo(x + M4 * r1, y - r2, x + r1, y - M4 * r2, x + r1, y);
      this.curveTo(x + r1, y + M4 * r2, x + M4 * r1, y + r2, x, y + r2);
      this.curveTo(x - M4 * r1, y + r2, x - r1, y + M4 * r2, x - r1, y);
      this.curveTo(x - r1, y - M4 * r2, x - M4 * r1, y - r2, x, y - r2);
    } else {
      this.curveTo(x - M4 * r1, y - r2, x - r1, y - M4 * r2, x - r1, y);
      this.curveTo(x - r1, y + M4 * r2, x - M4 * r1, y + r2, x, y + r2);
      this.curveTo(x + M4 * r1, y + r2, x + r1, y + M4 * r2, x + r1, y);
      this.curveTo(x + r1, y - M4 * r2, x + M4 * r1, y - r2, x, y - r2);
    }
  }
  bezierArc(x1, y1, rx, ry, x2, y2, {large = false, sweep = false, phi = 0} = {}) {
    if (x1 === x2 && y1 === y2) {
      return;
    }
    if (Math.abs(rx) <= 1e-10 || Math.abs(ry) <= 1e-10) {
      this.lineTo(x2, y2);
      return;
    }
    if (phi !== 0) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const cos = Math.cos(-phi);
      const sin = Math.sin(-phi);
      this.endToCenterParameters(0, 0, cos * dx - sin * dy, sin * dx + cos * dy, large, sweep, rx, ry);
    } else {
      this.endToCenterParameters(x1, y1, x2, y2, large, sweep, rx, ry);
    }
  }
  vectorAngle(ux, uy, vx, vy) {
    const d = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    if (d === 0) {
      return 0;
    }
    let c = (ux * vx + uy * vy) / d;
    if (c < -1) c = -1; else if (c > 1) c = 1;
    const s = ux * vy - uy * vx;
    c = Math.acos(c);
    return Math.sign(c) === Math.sign(s) ? c : -c;
  }
  endToCenterParameters(x1, y1, x2, y2, large, sweep, rx, ry) {
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const x1d = .5 * (x1 - x2);
    const y1d = .5 * (y1 - y2);
    let r = x1d * x1d / (rx * rx) + y1d * y1d / (ry * ry);
    if (r > 1) {
      const rr = Math.sqrt(r);
      rx *= rr;
      ry *= rr;
      r = x1d * x1d / (rx * rx) + y1d * y1d / (ry * ry);
    } else if (r !== 0) {
      r = 1 / r - 1;
    }
    if (r > -1e-10 && r < 0) {
      r = 0;
    }
    r = Math.sqrt(r);
    if (large === sweep) {
      r = -r;
    }
    const cxd = r * rx * y1d / ry;
    const cyd = -(r * ry * x1d) / rx;
    const cx = cxd + .5 * (x1 + x2);
    const cy = cyd + .5 * (y1 + y2);
    const theta = this.vectorAngle(1, 0, (x1d - cxd) / rx, (y1d - cyd) / ry);
    const tau = Math.PI * 2;
    let dTheta = this.vectorAngle((x1d - cxd) / rx, (y1d - cyd) / ry, (-x1d - cxd) / rx, (-y1d - cyd) / ry) % tau;
    if (dTheta < 0) {
      dTheta += tau;
    }
    if (!sweep && dTheta > 0) {
      dTheta -= tau;
    } else if (sweep && dTheta < 0) {
      dTheta += tau;
    }
    this.bezierArcFromCentre(cx, cy, rx, ry, -theta, -dTheta);
  }
  bezierArcFromCentre(cx, cy, rx, ry, startAngle, extent) {
    let fragmentsCount;
    let fragmentsAngle;
    if (Math.abs(extent) <= Math.PI / 2) {
      fragmentsCount = 1;
      fragmentsAngle = extent;
    } else {
      fragmentsCount = Math.ceil(Math.abs(extent) / (Math.PI / 2));
      fragmentsAngle = extent / fragmentsCount;
    }
    if (fragmentsAngle === 0) {
      return;
    }
    const halfFragment = fragmentsAngle * .5;
    let kappa = Math.abs(4 / 3 * (1 - Math.cos(halfFragment)) / Math.sin(halfFragment));
    if (fragmentsAngle < 0) {
      kappa = -kappa;
    }
    let theta = startAngle;
    const startFragment = theta + fragmentsAngle;
    let c1 = Math.cos(theta);
    let s1 = Math.sin(theta);
    for (let i = 0; i < fragmentsCount; i++) {
      const c0 = c1;
      const s0 = s1;
      theta = startFragment + i * fragmentsAngle;
      c1 = Math.cos(theta);
      s1 = Math.sin(theta);
      this.curveTo(cx + rx * (c0 - kappa * s0), cy - ry * (s0 + kappa * c0), cx + rx * (c1 + kappa * s1), cy - ry * (s1 - kappa * c1), cx + rx * c1, cy - ry * s1);
    }
  }
  fillPath({evenOdd = false} = {}) {
    this.push(evenOdd ? "f*" : "f");
  }
  strokePath({close = false} = {}) {
    this.push(close ? "s" : "S");
  }
  fillAndStrokePath({evenOdd = false, close = false} = {}) {
    this.push(`${close ? "b" : "B"}${evenOdd ? "*" : ""}`);
  }
  clipPath({evenOdd = false, end = true} = {}) {
    this.push(`W${evenOdd ? "*" : ""}${end ? " n" : ""}`);
  }
  setLineWidth(width) {
    this.push(`${formatNumber(width)} w`);
  }
  setLineCap(cap) {
    this.push(`${LINE_CAP_OPERAND[cap]} J`);
  }
  setLineJoin(join) {
    this.push(`${LINE_JOIN_OPERAND[join]} j`);
  }
  setMiterLimit(limit) {
    if (limit < 1) {
      throw new RangeError("miter limit must be at least 1");
    }
    this.push(`${formatNumber(limit)} M`);
  }
  setLineDashPattern(array = [], phase = 0) {
    this.push(`[${operands(array)}] ${formatNumber(phase)} d`);
  }
  setFillColor(color) {
    this.push(colorOperator(color));
  }
  setStrokeColor(color) {
    this.push(colorOperator(color, true));
  }
  setColor(color) {
    this.setFillColor(color);
    this.setStrokeColor(color);
  }
  fillRect(x, top, width, height, color) {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color)} ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re f`);
  }
  strokeRect(x, top, width, height, color, lineWidth = 1) {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`);
  }
  text(text, x, baselineFromTop, style) {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const font = style.font ?? defaultPdfFont;
    const letterSpacing = style.letterSpacing ?? 0;
    const wordSpacing = style.wordSpacing ?? 0;
    const command = [ "BT", this.addFont(font), formatNumber(fontSize), "Tf", colorOperator(style.color), ...letterSpacing !== 0 ? [ formatNumber(letterSpacing), "Tc" ] : [], ...wordSpacing !== 0 ? [ formatNumber(wordSpacing), "Tw" ] : [], "1 0 0 1", formatNumber(x), formatNumber(baseline), "Tm", font.encodeText(text), "Tj", "ET" ].join(" ");
    this.push(command);
  }
  line(x1, top1, x2, top2, color = "#000000", lineWidth = 1) {
    const y1 = this.pageHeight - top1;
    const y2 = this.pageHeight - top2;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
  }
  circle(cx, topCenter, radius, {fill = null, stroke = null, lineWidth = 1} = {}) {
    const cy = this.pageHeight - topCenter;
    const k = .5522847498;
    const ox = radius * k;
    const oy = radius * k;
    const path = [ `${formatNumber(cx + radius)} ${formatNumber(cy)} m`, `${formatNumber(cx + radius)} ${formatNumber(cy + oy)} ${formatNumber(cx + ox)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`, `${formatNumber(cx - ox)} ${formatNumber(cy + radius)} ${formatNumber(cx - radius)} ${formatNumber(cy + oy)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`, `${formatNumber(cx - radius)} ${formatNumber(cy - oy)} ${formatNumber(cx - ox)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`, `${formatNumber(cx + ox)} ${formatNumber(cy - radius)} ${formatNumber(cx + radius)} ${formatNumber(cy - oy)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c` ].join(" ");
    if (fill && stroke) {
      this.push(`${colorOperator(fill)} ${colorOperator(stroke, true)} ${formatNumber(lineWidth)} w ${path} B`);
    } else if (fill) {
      this.push(`${colorOperator(fill)} ${path} f`);
    } else {
      this.push(`${colorOperator(stroke ?? "#000000", true)} ${formatNumber(lineWidth)} w ${path} S`);
    }
  }
  output() {
    return `${this.commands.join("\n")}\n`;
  }
}

class PageTheme {
  constructor({pageFormat = PageFormat.A4, buildBackground = null, buildForeground = null, theme = null, orientation = "natural", margin = null, clip = false} = {}) {
    this.pageFormat = {
      width: Number(pageFormat.width),
      height: Number(pageFormat.height)
    };
    this.orientation = orientation;
    this.buildBackground = buildBackground;
    this.buildForeground = buildForeground;
    this.theme = theme;
    this.clip = clip;
    this.declaredMargin = margin == null ? null : normalizeInsets(margin);
  }
  get mustRotate() {
    return this.orientation === "landscape" && this.pageFormat.height > this.pageFormat.width || this.orientation === "portrait" && this.pageFormat.width > this.pageFormat.height;
  }
  get resolvedFormat() {
    return this.mustRotate ? {
      width: this.pageFormat.height,
      height: this.pageFormat.width
    } : this.pageFormat;
  }
  get margin() {
    const declared = this.declaredMargin ?? normalizeInsets(DEFAULT_MARGIN);
    return this.mustRotate ? {
      left: declared.bottom,
      top: declared.left,
      right: declared.top,
      bottom: declared.right
    } : declared;
  }
  copyWith(options = {}) {
    return new PageTheme({
      pageFormat: options.pageFormat ?? this.pageFormat,
      buildBackground: options.buildBackground ?? this.buildBackground,
      buildForeground: options.buildForeground ?? this.buildForeground,
      theme: options.theme ?? this.theme,
      orientation: options.orientation ?? this.orientation,
      margin: options.margin ?? this.declaredMargin,
      clip: options.clip ?? this.clip
    });
  }
}

class MultiPage {
  constructor({format = undefined, pageFormat = undefined, margin = DEFAULT_MARGIN, orientation = "natural", gap = 8, theme = undefined, build, header = null, footer = null, background = null}) {
    if (typeof build !== "function") throw new TypeError("MultiPage.build must be a function");
    this.pageTheme = new PageTheme({
      pageFormat: pageFormat ?? format ?? PageFormat.A4,
      margin,
      orientation
    });
    this.theme = theme ?? null;
    this.gap = Number(gap);
    this.build = build;
    this.header = header;
    this.footer = footer;
    this.background = background;
  }
  get format() {
    return this.pageTheme.resolvedFormat;
  }
  get margin() {
    return this.pageTheme.margin;
  }
  render(documentContext) {
    const children = this.build(documentContext);
    if (!Array.isArray(children)) throw new TypeError("MultiPage.build must return an array of widgets");
    const canvases = [];
    const startPage = () => {
      const canvas = new PdfCanvas(this.format.height);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);
      const pageNumber = canvases.length + 1;
      const context = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber,
        theme: this.theme ?? documentContext.document.theme
      };
      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;
      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, {
          maxWidth,
          maxHeight: bottom - top
        });
        headerWidget.paint(context, {
          ...headerBox,
          x: this.margin.left,
          y: top
        });
        top += headerBox.height + this.gap;
      }
      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, {
          maxWidth,
          maxHeight: bottom - top
        });
        bottom -= footerBox.height + this.gap;
        footerWidget.paint(context, {
          ...footerBox,
          x: this.margin.left,
          y: bottom + this.gap
        });
      }
      canvases.push(canvas);
      return {
        canvas,
        context,
        maxWidth,
        top,
        bottom,
        cursor: top
      };
    };
    let page = startPage();
    for (const child of children) {
      let box = child.layout(page.context, {
        maxWidth: page.maxWidth,
        maxHeight: page.bottom - page.cursor
      });
      if (page.cursor + box.height > page.bottom + .001) {
        if (box.height > page.bottom - page.top + .001) {
          throw new RangeError(`Widget height ${box.height.toFixed(2)} exceeds a full MultiPage content area`);
        }
        page = startPage();
        box = child.layout(page.context, {
          maxWidth: page.maxWidth,
          maxHeight: page.bottom - page.cursor
        });
      }
      child.paint(page.context, {
        ...box,
        x: this.margin.left,
        y: page.cursor
      });
      page.cursor += box.height + this.gap;
    }
    return canvases.map(canvas => ({
      format: this.format,
      content: canvas.output(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates
    }));
  }
}

class Page {
  constructor({pageTheme = undefined, pageFormat = undefined, format = undefined, margin = undefined, theme = undefined, orientation = undefined, build, background = null}) {
    if (typeof build !== "function") throw new TypeError("Page.build must be a function");
    const base = pageTheme ?? new PageTheme;
    this.pageTheme = base.copyWith({
      pageFormat: pageFormat ?? format,
      margin,
      theme,
      orientation
    });
    this.build = build;
    this.background = background;
  }
  get format() {
    return this.pageTheme.resolvedFormat;
  }
  render(documentContext) {
    const format = this.pageTheme.resolvedFormat;
    const margin = this.pageTheme.margin;
    const canvas = new PdfCanvas(format.height);
    if (this.background) canvas.fillRect(0, 0, format.width, format.height, this.background);
    const context = {
      ...documentContext,
      canvas,
      pageFormat: format,
      pageNumber: 1,
      theme: this.pageTheme.theme ?? documentContext.document.theme
    };
    const maxWidth = format.width - margin.left - margin.right;
    const maxHeight = format.height - margin.top - margin.bottom;
    this.paintLayer(this.pageTheme.buildBackground, context, format);
    const widget = this.build(context);
    const box = widget.layout(context, {
      maxWidth,
      maxHeight
    });
    if (box.height > maxHeight + .001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }
    widget.paint(context, {
      ...box,
      x: margin.left,
      y: margin.top
    });
    this.paintLayer(this.pageTheme.buildForeground, context, format);
    return [ {
      format,
      content: canvas.output(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates
    } ];
  }
  paintLayer(build, context, format) {
    if (build === null) {
      return;
    }
    const widget = build(context);
    const box = widget.layout(context, {
      maxWidth: format.width,
      maxHeight: format.height
    });
    widget.paint(context, {
      ...box,
      x: 0,
      y: 0
    });
  }
}

const DEFAULT_FONT_SIZE = 12;

const DEFAULT_LINE_HEIGHT = 1.2;

class TextStyle {
  constructor({inherit = true, color = null, font = null, fontNormal = null, fontBold = null, fontItalic = null, fontBoldItalic = null, fontFallback = null, fontSize = null, fontWeight = null, fontStyle = null, letterSpacing = null, wordSpacing = null, lineSpacing = null, height = null, decoration = null, decorationColor = null, decorationStyle = null, decorationThickness = null} = {}) {
    const isItalic = fontStyle === "italic";
    const isBold = fontWeight === "bold";
    this.inherit = inherit;
    this.color = color == null ? null : normalizeColor(color);
    this.fontNormal = fontNormal ?? (!isItalic && !isBold ? font : null);
    this.fontBold = fontBold ?? (!isItalic && isBold ? font : null);
    this.fontItalic = fontItalic ?? (isItalic && !isBold ? font : null);
    this.fontBoldItalic = fontBoldItalic ?? (isItalic && isBold ? font : null);
    this.fontFallback = fontFallback ?? [];
    this.fontSize = fontSize;
    this.fontWeight = fontWeight;
    this.fontStyle = fontStyle;
    this.letterSpacing = letterSpacing;
    this.wordSpacing = wordSpacing;
    this.lineSpacing = lineSpacing;
    this.height = height;
    this.decoration = decoration;
    this.decorationColor = decorationColor == null ? null : normalizeColor(decorationColor);
    this.decorationStyle = decorationStyle;
    this.decorationThickness = decorationThickness;
  }
  static defaultStyle() {
    return new TextStyle({
      inherit: false,
      color: "#000000",
      fontNormal: Font.helvetica(),
      fontBold: Font.helveticaBold(),
      fontItalic: Font.helveticaOblique(),
      fontBoldItalic: Font.helveticaBoldOblique(),
      fontSize: DEFAULT_FONT_SIZE,
      fontWeight: "normal",
      fontStyle: "normal",
      letterSpacing: 0,
      wordSpacing: 0,
      lineSpacing: 0,
      height: DEFAULT_LINE_HEIGHT,
      decoration: "none",
      decorationStyle: "solid",
      decorationThickness: 1
    });
  }
  get font() {
    if (this.fontWeight !== "bold") {
      if (this.fontStyle !== "italic") {
        return this.fontNormal ?? this.fontBold ?? this.fontItalic ?? this.fontBoldItalic;
      }
      return this.fontItalic ?? this.fontNormal ?? this.fontBold ?? this.fontBoldItalic;
    }
    if (this.fontStyle !== "italic") {
      return this.fontBold ?? this.fontNormal ?? this.fontItalic ?? this.fontBoldItalic;
    }
    return this.fontBoldItalic ?? this.fontBold ?? this.fontItalic ?? this.fontNormal;
  }
  copyWith(options = {}) {
    return new TextStyle({
      inherit: this.inherit,
      color: options.color ?? this.color,
      font: options.font ?? this.font,
      fontNormal: options.fontNormal ?? this.fontNormal,
      fontBold: options.fontBold ?? this.fontBold,
      fontItalic: options.fontItalic ?? this.fontItalic,
      fontBoldItalic: options.fontBoldItalic ?? this.fontBoldItalic,
      fontFallback: options.fontFallback ?? this.fontFallback,
      fontSize: options.fontSize ?? this.fontSize,
      fontWeight: options.fontWeight ?? this.fontWeight,
      fontStyle: options.fontStyle ?? this.fontStyle,
      letterSpacing: options.letterSpacing ?? this.letterSpacing,
      wordSpacing: options.wordSpacing ?? this.wordSpacing,
      lineSpacing: options.lineSpacing ?? this.lineSpacing,
      height: options.height ?? this.height,
      decoration: options.decoration ?? this.decoration,
      decorationColor: options.decorationColor ?? this.decorationColor,
      decorationStyle: options.decorationStyle ?? this.decorationStyle,
      decorationThickness: options.decorationThickness ?? this.decorationThickness
    });
  }
  merge(other) {
    if (other == null) {
      return this;
    }
    if (!other.inherit) {
      return other;
    }
    return this.copyWith({
      color: other.color,
      font: other.font,
      fontNormal: other.fontNormal,
      fontBold: other.fontBold,
      fontItalic: other.fontItalic,
      fontBoldItalic: other.fontBoldItalic,
      fontFallback: [ ...other.fontFallback, ...this.fontFallback ],
      fontSize: other.fontSize,
      fontWeight: other.fontWeight,
      fontStyle: other.fontStyle,
      letterSpacing: other.letterSpacing,
      wordSpacing: other.wordSpacing,
      lineSpacing: other.lineSpacing,
      height: other.height,
      decoration: other.decoration,
      decorationColor: other.decorationColor,
      decorationStyle: other.decorationStyle,
      decorationThickness: other.decorationThickness
    });
  }
}

class ThemeData {
  constructor(fields) {
    this.defaultTextStyle = fields.defaultTextStyle;
    this.paragraphStyle = fields.paragraphStyle;
    this.header0 = fields.header0;
    this.header1 = fields.header1;
    this.header2 = fields.header2;
    this.header3 = fields.header3;
    this.header4 = fields.header4;
    this.header5 = fields.header5;
    this.bulletStyle = fields.bulletStyle;
    this.tableHeader = fields.tableHeader;
    this.tableCell = fields.tableCell;
    this.softWrap = fields.softWrap;
    this.overflow = fields.overflow;
    this.textAlign = fields.textAlign;
    this.maxLines = fields.maxLines;
  }
  static withFont({base = null, bold = null, italic = null, boldItalic = null, fontFallback = null} = {}) {
    const defaultStyle = TextStyle.defaultStyle().copyWith({
      font: base,
      fontNormal: base,
      fontBold: bold,
      fontItalic: italic,
      fontBoldItalic: boldItalic,
      fontFallback
    });
    const fontSize = defaultStyle.fontSize ?? 12;
    return new ThemeData({
      defaultTextStyle: defaultStyle,
      paragraphStyle: defaultStyle.copyWith({
        lineSpacing: 5
      }),
      bulletStyle: defaultStyle.copyWith({
        lineSpacing: 5
      }),
      header0: defaultStyle.copyWith({
        fontSize: fontSize * 2
      }),
      header1: defaultStyle.copyWith({
        fontSize: fontSize * 1.5
      }),
      header2: defaultStyle.copyWith({
        fontSize: fontSize * 1.4
      }),
      header3: defaultStyle.copyWith({
        fontSize: fontSize * 1.3
      }),
      header4: defaultStyle.copyWith({
        fontSize: fontSize * 1.2
      }),
      header5: defaultStyle.copyWith({
        fontSize: fontSize * 1.1
      }),
      tableHeader: defaultStyle.copyWith({
        fontSize: fontSize * .8,
        fontWeight: "bold"
      }),
      tableCell: defaultStyle.copyWith({
        fontSize: fontSize * .8
      }),
      softWrap: true,
      overflow: "visible",
      textAlign: null,
      maxLines: null
    });
  }
  static base() {
    return ThemeData.withFont();
  }
  static create(options = {}) {
    return ThemeData.base().copyWith(options);
  }
  copyWith(options = {}) {
    return new ThemeData({
      defaultTextStyle: this.defaultTextStyle.merge(options.defaultTextStyle),
      paragraphStyle: this.paragraphStyle.merge(options.paragraphStyle),
      bulletStyle: this.bulletStyle.merge(options.bulletStyle),
      header0: this.header0.merge(options.header0),
      header1: this.header1.merge(options.header1),
      header2: this.header2.merge(options.header2),
      header3: this.header3.merge(options.header3),
      header4: this.header4.merge(options.header4),
      header5: this.header5.merge(options.header5),
      tableHeader: this.tableHeader.merge(options.tableHeader),
      tableCell: this.tableCell.merge(options.tableCell),
      softWrap: options.softWrap ?? this.softWrap,
      overflow: options.overflow ?? this.overflow,
      textAlign: options.textAlign ?? this.textAlign,
      maxLines: options.maxLines ?? this.maxLines
    });
  }
}

class InheritedTheme extends Widget {
  constructor(child) {
    super();
    this.child = child;
  }
  scope(context) {
    return {
      ...context,
      theme: this.themeFor(context)
    };
  }
  layout(context, constraints) {
    const childBox = this.child.layout(this.scope(context), constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox.widget.paint(this.scope(context), {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class Theme extends InheritedTheme {
  constructor({data, child}) {
    super(child);
    this.data = data;
  }
  static of(context) {
    return context.theme;
  }
  themeFor() {
    return this.data;
  }
}

class DefaultTextStyle extends InheritedTheme {
  constructor({style, child, textAlign = null, softWrap = true, overflow = null, maxLines = null}) {
    super(child);
    this.style = style;
    this.textAlign = textAlign;
    this.softWrap = softWrap;
    this.overflow = overflow;
    this.maxLines = maxLines;
  }
  themeFor(context) {
    return context.theme.copyWith({
      defaultTextStyle: this.style,
      textAlign: this.textAlign,
      softWrap: this.softWrap,
      overflow: this.overflow ?? undefined,
      maxLines: this.maxLines
    });
  }
}

class Document {
  constructor({title = null, author = null, subject = null, creator = "js_pdf", producer = "js_pdf", theme = undefined, font = undefined} = {}) {
    this.sections = [];
    this.fonts = new Map;
    this.fallbackFont = Font.helvetica();
    this.metadata = {
      title,
      author,
      subject,
      creator,
      producer
    };
    this.theme = theme ?? (font === undefined ? ThemeData.base() : ThemeData.withFont({
      base: Font.fromPdfFont(font)
    }));
  }
  resolveFont(declaration) {
    const existing = this.fonts.get(declaration);
    if (existing !== undefined) {
      return existing;
    }
    const font = declaration.build();
    this.fonts.set(declaration, font);
    return font;
  }
  get font() {
    return this.resolveFont(this.theme.defaultTextStyle.font ?? this.fallbackFont);
  }
  addPage(page) {
    if (!(page instanceof Page) && !(page instanceof MultiPage)) {
      throw new TypeError("Document.addPage expects Page or MultiPage");
    }
    this.sections.push(page);
    return this;
  }
  save() {
    const documentContext = {
      document: this
    };
    const pages = [];
    for (const section of this.sections) {
      pages.push(...section.render(documentContext));
    }
    if (pages.length === 0) {
      throw new Error("Document must contain at least one page");
    }
    return serializePdf(pages, this.metadata);
  }
}

class Spacer extends Widget {
  constructor(height = 8) {
    super();
    this.requestedHeight = Number(height);
  }
  layout(_context, constraints) {
    return {
      widget: this,
      width: constraints.maxWidth,
      height: Math.max(0, this.requestedHeight),
      data: null
    };
  }
  paint() {}
}

class Column extends Widget {
  constructor({children = [], gap = 0, margin = 0} = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.margin = normalizeInsets(margin);
  }
  layout(context, constraints) {
    const innerWidth = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right);
    const childBoxes = [];
    let height = this.margin.top + this.margin.bottom;
    let width = 0;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const childBox = child.layout(context, {
        maxWidth: innerWidth,
        maxHeight: constraints.maxHeight
      });
      childBoxes.push(childBox);
      height += childBox.height;
      width = Math.max(width, childBox.width);
      if (index < this.children.length - 1) height += this.gap;
    }
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, width + this.margin.left + this.margin.right),
      height,
      data: {
        childBoxes
      }
    };
  }
  paint(context, box) {
    let y = box.y + this.margin.top;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, {
        ...childBox,
        x: box.x + this.margin.left,
        y
      });
      y += childBox.height + this.gap;
    }
  }
}

class Row extends Widget {
  constructor({children = [], gap = 0, widths = null, margin = 0} = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.widths = widths;
    this.margin = normalizeInsets(margin);
  }
  layout(context, constraints) {
    const available = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right - Math.max(0, this.children.length - 1) * this.gap);
    const ratios = this.widths ?? this.children.map(() => 1);
    const totalRatio = ratios.reduce((sum, value) => sum + Number(value), 0) || 1;
    const childBoxes = [];
    let height = 0;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const width = available * Number(ratios[index] ?? 1) / totalRatio;
      const childBox = child.layout(context, {
        maxWidth: width,
        maxHeight: constraints.maxHeight
      });
      childBoxes.push({
        ...childBox,
        allocatedWidth: width
      });
      height = Math.max(height, childBox.height);
    }
    return {
      widget: this,
      width: constraints.maxWidth,
      height: height + this.margin.top + this.margin.bottom,
      data: {
        childBoxes
      }
    };
  }
  paint(context, box) {
    let x = box.x + this.margin.left;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, {
        ...childBox,
        x,
        y: box.y + this.margin.top
      });
      x += childBox.allocatedWidth + this.gap;
    }
  }
}

class Vector extends Widget {
  constructor({width, height, draw}) {
    super();
    this.width = Number(width);
    this.height = Number(height);
    this.draw = draw;
  }
  layout(_context, constraints) {
    const scale = Math.min(1, constraints.maxWidth / this.width);
    return {
      widget: this,
      width: this.width * scale,
      height: this.height * scale,
      data: {
        scale
      }
    };
  }
  paint(context, box) {
    const scale = box.data.scale;
    const api = {
      rect: ({x, y, width, height, fill = null, stroke = null, lineWidth = 1}) => {
        if (fill) context.canvas.fillRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, fill);
        if (stroke) context.canvas.strokeRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, stroke, lineWidth * scale);
      },
      line: ({x1, y1, x2, y2, color = "#000000", lineWidth = 1}) => {
        context.canvas.line(box.x + x1 * scale, box.y + y1 * scale, box.x + x2 * scale, box.y + y2 * scale, color, lineWidth * scale);
      },
      circle: ({cx, cy, radius, fill = null, stroke = null, lineWidth = 1}) => {
        context.canvas.circle(box.x + cx * scale, box.y + cy * scale, radius * scale, {
          fill,
          stroke,
          lineWidth: lineWidth * scale
        });
      },
      text: ({value, x, y, fontSize = 12, color = "#000000", font}) => {
        context.canvas.text(String(value), box.x + x * scale, box.y + y * scale, {
          fontSize: fontSize * scale,
          color: normalizeColor(color),
          font: font ?? context.document.font
        });
      }
    };
    this.draw(api);
  }
}

const svgColors = Object.freeze({
  indigo: "#4b0082",
  gold: "#ffd700",
  hotpink: "#ff69b4",
  firebrick: "#b22222",
  indianred: "#cd5c5c",
  yellow: "#ffff00",
  mistyrose: "#ffe4e1",
  darkolivegreen: "#556b2f",
  olive: "#808000",
  darkseagreen: "#8fbc8f",
  pink: "#ffc0cb",
  tomato: "#ff6347",
  lightcoral: "#f08080",
  orangered: "#ff4500",
  navajowhite: "#ffdead",
  lime: "#00ff00",
  palegreen: "#98fb98",
  darkslategrey: "#2f4f4f",
  greenyellow: "#adff2f",
  burlywood: "#deb887",
  seashell: "#fff5ee",
  mediumspringgreen: "#00fa9a",
  fuchsia: "#ff00ff",
  papayawhip: "#ffefd5",
  blanchedalmond: "#ffebcd",
  chartreuse: "#7fff00",
  dimgray: "#696969",
  transparent: "#ffffff",
  black: "#000000",
  peachpuff: "#ffdab9",
  springgreen: "#00ff7f",
  aquamarine: "#7fffd4",
  white: "#ffffff",
  orange: "#ffa500",
  lightsalmon: "#ffa07a",
  darkslategray: "#2f4f4f",
  brown: "#a52a2a",
  ivory: "#fffff0",
  dodgerblue: "#1e90ff",
  peru: "#cd853f",
  lawngreen: "#7cfc00",
  chocolate: "#d2691e",
  crimson: "#dc143c",
  forestgreen: "#228b22",
  darkgrey: "#a9a9a9",
  lightseagreen: "#20b2aa",
  cyan: "#00ffff",
  mintcream: "#f5fffa",
  silver: "#c0c0c0",
  antiquewhite: "#faebd7",
  mediumorchid: "#ba55d3",
  skyblue: "#87ceeb",
  gray: "#808080",
  darkturquoise: "#00ced1",
  goldenrod: "#daa520",
  darkgreen: "#006400",
  floralwhite: "#fffaf0",
  darkviolet: "#9400d3",
  darkgray: "#a9a9a9",
  moccasin: "#ffe4b5",
  saddlebrown: "#8b4513",
  grey: "#808080",
  darkslateblue: "#483d8b",
  lightskyblue: "#87cefa",
  lightpink: "#ffb6c1",
  mediumvioletred: "#c71585",
  slategrey: "#708090",
  red: "#ff0000",
  deeppink: "#ff1493",
  limegreen: "#32cd32",
  darkmagenta: "#8b008b",
  palegoldenrod: "#eee8aa",
  plum: "#dda0dd",
  turquoise: "#40e0d0",
  lightgrey: "#d3d3d3",
  lightgoldenrodyellow: "#fafad2",
  darkgoldenrod: "#b8860b",
  lavender: "#e6e6fa",
  maroon: "#800000",
  yellowgreen: "#9acd32",
  sandybrown: "#f4a460",
  thistle: "#d8bfd8",
  violet: "#ee82ee",
  navy: "#000080",
  magenta: "#ff00ff",
  dimgrey: "#696969",
  tan: "#d2b48c",
  rosybrown: "#bc8f8f",
  olivedrab: "#6b8e23",
  blue: "#0000ff",
  lightblue: "#add8e6",
  ghostwhite: "#f8f8ff",
  honeydew: "#f0fff0",
  cornflowerblue: "#6495ed",
  slateblue: "#6a5acd",
  linen: "#faf0e6",
  darkblue: "#00008b",
  powderblue: "#b0e0e6",
  seagreen: "#2e8b57",
  darkkhaki: "#bdb76b",
  snow: "#fffafa",
  sienna: "#a0522d",
  mediumblue: "#0000cd",
  royalblue: "#4169e1",
  lightcyan: "#e0ffff",
  green: "#008000",
  mediumpurple: "#9370db",
  midnightblue: "#191970",
  cornsilk: "#fff8dc",
  paleturquoise: "#afeeee",
  bisque: "#ffe4c4",
  slategray: "#708090",
  darkcyan: "#008b8b",
  khaki: "#f0e68c",
  wheat: "#f5deb3",
  teal: "#008080",
  darkorchid: "#9932cc",
  deepskyblue: "#00bfff",
  salmon: "#fa8072",
  darkred: "#8b0000",
  steelblue: "#4682b4",
  palevioletred: "#db7093",
  lightslategray: "#778899",
  aliceblue: "#f0f8ff",
  lightslategrey: "#778899",
  lightgreen: "#90ee90",
  orchid: "#da70d6",
  gainsboro: "#dcdcdc",
  mediumseagreen: "#3cb371",
  lightgray: "#d3d3d3",
  mediumturquoise: "#48d1cc",
  lemonchiffon: "#fffacd",
  cadetblue: "#5f9ea0",
  lightyellow: "#ffffe0",
  lavenderblush: "#fff0f5",
  coral: "#ff7f50",
  purple: "#800080",
  aqua: "#00ffff",
  whitesmoke: "#f5f5f5",
  mediumslateblue: "#7b68ee",
  darkorange: "#ff8c00",
  mediumaquamarine: "#66cdaa",
  darksalmon: "#e9967a",
  beige: "#f5f5dc",
  blueviolet: "#8a2be2",
  azure: "#f0ffff",
  lightsteelblue: "#b0c4de",
  oldlace: "#fdf5e6"
});

const PdfPoint = Object.freeze({
  zero: Object.freeze({
    x: 0,
    y: 0
  }),
  translate(point, dx, dy) {
    return {
      x: point.x + dx,
      y: point.y + dy
    };
  }
});

const PdfRect = Object.freeze({
  zero: Object.freeze({
    x: 0,
    y: 0,
    width: 0,
    height: 0
  }),
  fromLTRB(left, bottom, right, top) {
    return {
      x: left,
      y: bottom,
      width: right - left,
      height: top - bottom
    };
  },
  left(rect) {
    return rect.x;
  },
  bottom(rect) {
    return rect.y;
  },
  right(rect) {
    return rect.x + rect.width;
  },
  top(rect) {
    return rect.y + rect.height;
  },
  horizontalCenter(rect) {
    return rect.x + rect.width / 2;
  },
  verticalCenter(rect) {
    return rect.y + rect.height / 2;
  },
  inflate(rect, delta) {
    return {
      x: rect.x - delta,
      y: rect.y - delta,
      width: rect.width + delta * 2,
      height: rect.height + delta * 2
    };
  },
  deflate(rect, delta) {
    return PdfRect.inflate(rect, -delta);
  },
  scale(rect, factor) {
    return {
      x: rect.x * factor,
      y: rect.y * factor,
      width: rect.width * factor,
      height: rect.height * factor
    };
  }
});

const UNIT_SUFFIXES = Object.freeze({
  px: "pixels",
  mm: "millimeters",
  cm: "centimeters",
  in: "inch",
  em: "em",
  "%": "percent",
  pt: "points",
  "": "direct"
});

class SvgNumeric {
  constructor(value, brush, unit = "direct") {
    this.value = value;
    this.unit = unit;
    this.brush = brush;
  }
  static parse(text, brush) {
    const match = /([-+]?[\d.]+)\s*(px|pt|em|cm|mm|in|%|)/.exec(text);
    if (match === null) {
      throw new SyntaxError(`Not a number: "${text}"`);
    }
    const value = Number.parseFloat(match[1]);
    if (!Number.isFinite(value)) {
      throw new SyntaxError(`Not a number: "${text}"`);
    }
    return new SvgNumeric(value, brush, UNIT_SUFFIXES[match[2] ?? ""] ?? "direct");
  }
  get colorValue() {
    if (this.unit === "percent") {
      return this.value / 100;
    }
    if (this.unit === "direct") {
      return this.value / 255;
    }
    throw new SyntaxError(`Invalid color value ${this.value} (${this.unit})`);
  }
  get sizeValue() {
    switch (this.unit) {
     case "percent":
      return this.value / 100;

     case "direct":
     case "pixels":
     case "points":
      return this.value;

     case "millimeters":
      return this.value * PageUnit.mm;

     case "centimeters":
      return this.value * PageUnit.cm;

     case "inch":
      return this.value * PageUnit.inch;

     case "em":
      {
        const fontSize = this.brush?.fontSize;
        if (fontSize === null || fontSize === undefined) {
          throw new SyntaxError("An em length needs a font size in scope");
        }
        return this.value * fontSize.sizeValue;
      }
    }
  }
}

const PARAMETER = /[\w.-]+(px|pt|em|cm|mm|in|%|)/g;

function splitNumeric(parameters, brush) {
  return [ ...parameters.matchAll(PARAMETER) ].map(match => SvgNumeric.parse(match[0], brush));
}

function splitDoubles(parameters) {
  return [ ...parameters.matchAll(PARAMETER) ].map(match => {
    const value = Number.parseFloat(match[0]);
    if (!Number.isFinite(value)) {
      throw new SyntaxError(`Not a number: "${match[0]}"`);
    }
    return value;
  });
}

function getDouble(element, name, {namespace, defaultValue = 0} = {}) {
  const attribute = element.getAttribute(name, namespace);
  if (attribute === null) {
    return defaultValue;
  }
  const value = Number.parseFloat(attribute);
  if (!Number.isFinite(value)) {
    throw new SyntaxError(`Attribute ${name}="${attribute}" is not a number`);
  }
  return value;
}

function getNumeric(element, name, brush, {namespace, defaultValue = null} = {}) {
  const attribute = element.getAttribute(name, namespace);
  if (attribute === null) {
    return defaultValue === null ? null : new SvgNumeric(defaultValue, null);
  }
  return SvgNumeric.parse(attribute, brush);
}

const STYLE_DECLARATION = /([\w-]+)\s*:\s*(.*)/;

function convertStyle(element) {
  const style = element.getAttribute("style")?.trim();
  if (style === undefined || style === null || style.length === 0) {
    return;
  }
  for (const declaration of style.split(";")) {
    if (declaration.trim().length === 0) {
      continue;
    }
    const match = STYLE_DECLARATION.exec(declaration);
    if (match === null) {
      continue;
    }
    element.setAttribute(match[1], match[2].trim());
  }
}

class SvgParser {
  constructor(width, height, viewBox, root, colorFilter) {
    this.width = width;
    this.height = height;
    this.viewBox = viewBox;
    this.root = root;
    this.colorFilter = colorFilter;
  }
  static fromXml({xml, colorFilter = null}) {
    const root = xml.rootElement;
    const viewBoxAttribute = root.getAttribute("viewBox");
    const width = getNumeric(root, "width", null)?.sizeValue ?? null;
    const height = getNumeric(root, "height", null)?.sizeValue ?? null;
    const parsed = viewBoxAttribute === null ? [ 0, 0, width ?? 1e3, height ?? 1e3 ] : splitDoubles(viewBoxAttribute);
    if (parsed.length === 0 || parsed.length > 4) {
      throw new SyntaxError("viewBox must contain 1..4 parameters");
    }
    const box = [ ...new Array(4 - parsed.length).fill(0), ...parsed ];
    return new SvgParser(width, height, {
      x: box[0],
      y: box[1],
      width: box[2],
      height: box[3]
    }, root, colorFilter);
  }
  findById(id) {
    for (const element of this.root.descendants) {
      if (element.getAttribute("id") === id) {
        return element;
      }
    }
    return this.root.getAttribute("id") === id ? this.root : null;
  }
}

function hslToRgb(hue, saturation, lightness) {
  const h = (hue % 1 + 1) % 1;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h * 6 % 2 - 1));
  const m = l - c / 2;
  const sector = Math.floor(h * 6);
  const table = [ [ c, x, 0 ], [ x, c, 0 ], [ 0, c, x ], [ 0, x, c ], [ x, 0, c ], [ c, 0, x ] ];
  const [r, g, b] = table[sector % 6];
  return [ r + m, g + m, b + m ];
}

function functionArguments(value) {
  return value.slice(value.indexOf("(") + 1, value.lastIndexOf(")"));
}

class SvgColor {
  constructor(color = null, inherit = false, opacity = 1) {
    this.color = color;
    this.inherit = inherit;
    this.opacity = opacity;
  }
  get isEmpty() {
    return this.color === null;
  }
  get isNotEmpty() {
    return !this.isEmpty;
  }
  merge(other) {
    return new SvgColor(other.color ?? this.color, false, other.color === null ? this.opacity : other.opacity);
  }
  setFillColor(canvas) {
    if (this.color !== null) {
      canvas.setFillColor(this.color);
    }
  }
  setStrokeColor(canvas) {
    if (this.color !== null) {
      canvas.setStrokeColor(this.color);
    }
  }
  static fromXml(color, parser, currentColor = SvgColor.defaultColor) {
    if (color === null || color === undefined) {
      return SvgColor.inherited;
    }
    const value = color.trim();
    if (value === "none") {
      return SvgColor.none;
    }
    if (value.toLowerCase() === "currentcolor") {
      return currentColor;
    }
    if (parser.colorFilter !== null) {
      return new SvgColor(parser.colorFilter);
    }
    const named = svgColors[value.toLowerCase()];
    if (named !== undefined) {
      return new SvgColor(normalizeColor(named));
    }
    const lower = value.toLowerCase();
    if (lower.startsWith("rgba")) {
      const parts = splitNumeric(functionArguments(value), null);
      if (parts.length >= 3) {
        return new SvgColor([ parts[0].colorValue, parts[1].colorValue, parts[2].colorValue ], false, Math.min(1, Math.max(0, parts[3]?.value ?? 1)));
      }
      return SvgColor.unknown;
    }
    if (lower.startsWith("hsl")) {
      const parts = splitNumeric(functionArguments(value), null);
      if (parts.length >= 3) {
        return new SvgColor(hslToRgb(parts[0].colorValue, parts[1].colorValue, parts[2].colorValue));
      }
      return SvgColor.unknown;
    }
    if (lower.startsWith("rgb")) {
      const parts = splitNumeric(functionArguments(value), null);
      if (parts.length >= 3) {
        return new SvgColor([ parts[0].colorValue, parts[1].colorValue, parts[2].colorValue ]);
      }
      return SvgColor.unknown;
    }
    if (lower.startsWith("url(#")) {
      return SvgColor.unknown;
    }
    try {
      return new SvgColor(normalizeColor(SvgColor.expandHex(value)));
    } catch {
      return SvgColor.unknown;
    }
  }
  static expandHex(value) {
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      const [, r, g, b] = value;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return value;
  }
}

SvgColor.unknown = new SvgColor;

SvgColor.defaultColor = new SvgColor([ 0, 0, 0 ]);

SvgColor.none = new SvgColor;

SvgColor.inherited = new SvgColor(null, true);

const BLEND_MODES = Object.freeze({
  normal: "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "colorDodge",
  "color-burn": "colorBurn",
  "hard-light": "hardLight",
  "soft-light": "softLight",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity"
});

const LINE_CAPS = Object.freeze({
  butt: "butt",
  round: "round",
  square: "square"
});

const LINE_JOINS = Object.freeze({
  miter: "miter",
  bevel: "bevel",
  round: "round"
});

const TEXT_ANCHORS = Object.freeze({
  start: "start",
  middle: "middle",
  end: "end"
});

class SvgBrush {
  constructor(fields) {
    this.color = fields.color;
    this.opacity = fields.opacity;
    this.fill = fields.fill;
    this.fillEvenOdd = fields.fillEvenOdd;
    this.fillOpacity = fields.fillOpacity;
    this.stroke = fields.stroke;
    this.strokeOpacity = fields.strokeOpacity;
    this.strokeWidth = fields.strokeWidth;
    this.strokeDashArray = fields.strokeDashArray;
    this.strokeDashOffset = fields.strokeDashOffset;
    this.strokeLineCap = fields.strokeLineCap;
    this.strokeLineJoin = fields.strokeLineJoin;
    this.strokeMiterLimit = fields.strokeMiterLimit;
    this.fontSize = fields.fontSize;
    this.fontFamily = fields.fontFamily;
    this.fontStyle = fields.fontStyle;
    this.fontWeight = fields.fontWeight;
    this.textAnchor = fields.textAnchor;
    this.blendMode = fields.blendMode;
  }
  merge(other) {
    if (other === null) {
      return this;
    }
    let fill = other.fill ?? this.fill;
    if (fill?.inherit === true && this.fill !== null && other.fill !== null) {
      fill = this.fill.merge(other.fill);
    }
    let stroke = other.stroke ?? this.stroke;
    if (stroke?.inherit === true && this.stroke !== null && other.stroke !== null) {
      stroke = this.stroke.merge(other.stroke);
    }
    return new SvgBrush({
      color: other.color?.inherit === true ? this.color : other.color ?? this.color,
      opacity: other.opacity ?? 1,
      blendMode: other.blendMode,
      fillOpacity: other.fillOpacity ?? this.fillOpacity,
      strokeOpacity: other.strokeOpacity ?? this.strokeOpacity,
      fill,
      fillEvenOdd: other.fillEvenOdd ?? this.fillEvenOdd,
      stroke,
      strokeWidth: other.strokeWidth ?? this.strokeWidth,
      strokeDashArray: other.strokeDashArray ?? this.strokeDashArray,
      strokeDashOffset: other.strokeDashOffset ?? this.strokeDashOffset,
      fontSize: other.fontSize ?? this.fontSize,
      fontFamily: other.fontFamily ?? this.fontFamily,
      fontStyle: other.fontStyle ?? this.fontStyle,
      fontWeight: other.fontWeight ?? this.fontWeight,
      textAnchor: other.textAnchor ?? this.textAnchor,
      strokeLineCap: other.strokeLineCap ?? this.strokeLineCap,
      strokeLineJoin: other.strokeLineJoin ?? this.strokeLineJoin,
      strokeMiterLimit: other.strokeMiterLimit ?? this.strokeMiterLimit
    });
  }
  copyWith(fields) {
    return new SvgBrush({
      color: fields.color ?? this.color,
      opacity: fields.opacity ?? this.opacity,
      fill: fields.fill ?? this.fill,
      fillEvenOdd: fields.fillEvenOdd ?? this.fillEvenOdd,
      fillOpacity: fields.fillOpacity ?? this.fillOpacity,
      stroke: fields.stroke ?? this.stroke,
      strokeOpacity: fields.strokeOpacity ?? this.strokeOpacity,
      strokeWidth: fields.strokeWidth ?? this.strokeWidth,
      strokeDashArray: fields.strokeDashArray ?? this.strokeDashArray,
      strokeDashOffset: fields.strokeDashOffset ?? this.strokeDashOffset,
      strokeLineCap: fields.strokeLineCap ?? this.strokeLineCap,
      strokeLineJoin: fields.strokeLineJoin ?? this.strokeLineJoin,
      strokeMiterLimit: fields.strokeMiterLimit ?? this.strokeMiterLimit,
      fontSize: fields.fontSize ?? this.fontSize,
      fontFamily: fields.fontFamily ?? this.fontFamily,
      fontStyle: fields.fontStyle ?? this.fontStyle,
      fontWeight: fields.fontWeight ?? this.fontWeight,
      textAnchor: fields.textAnchor ?? this.textAnchor,
      blendMode: fields.blendMode ?? this.blendMode
    });
  }
  static fromXml(element, parent, parser) {
    convertStyle(element);
    const strokeDashArray = element.getAttribute("stroke-dasharray");
    const fillRule = element.getAttribute("fill-rule");
    const strokeLineCap = element.getAttribute("stroke-linecap");
    const strokeLineJoin = element.getAttribute("stroke-linejoin");
    const blendMode = element.getAttribute("mix-blend-mode");
    const color = SvgColor.fromXml(element.getAttribute("color"), parser, parent.color ?? SvgColor.defaultColor);
    const currentColor = color.inherit ? parent.color ?? SvgColor.defaultColor : color;
    return parent.merge(new SvgBrush({
      color,
      opacity: getDouble(element, "opacity", {
        defaultValue: null
      }),
      blendMode: blendMode === null ? null : BLEND_MODES[blendMode] ?? null,
      fillOpacity: getDouble(element, "fill-opacity", {
        defaultValue: null
      }),
      strokeOpacity: getDouble(element, "stroke-opacity", {
        defaultValue: null
      }),
      strokeLineCap: strokeLineCap === null ? null : LINE_CAPS[strokeLineCap] ?? null,
      strokeLineJoin: strokeLineJoin === null ? null : LINE_JOINS[strokeLineJoin] ?? null,
      strokeMiterLimit: getDouble(element, "stroke-miterlimit", {
        defaultValue: null
      }),
      fill: SvgColor.fromXml(element.getAttribute("fill"), parser, currentColor),
      fillEvenOdd: fillRule === null ? null : fillRule === "evenodd",
      stroke: SvgColor.fromXml(element.getAttribute("stroke"), parser, currentColor),
      strokeWidth: getNumeric(element, "stroke-width", parent),
      strokeDashArray: strokeDashArray === null ? null : strokeDashArray === "none" ? [] : splitNumeric(strokeDashArray, parent).map(n => n.value),
      strokeDashOffset: getNumeric(element, "stroke-dashoffset", parent)?.sizeValue ?? null,
      fontSize: getNumeric(element, "font-size", parent),
      fontFamily: element.getAttribute("font-family"),
      fontStyle: element.getAttribute("font-style"),
      fontWeight: element.getAttribute("font-weight"),
      textAnchor: TEXT_ANCHORS[element.getAttribute("text-anchor") ?? ""] ?? null
    }));
  }
}

SvgBrush.defaultContext = new SvgBrush({
  color: SvgColor.defaultColor,
  opacity: 1,
  blendMode: null,
  fillOpacity: 1,
  strokeOpacity: 1,
  fill: SvgColor.defaultColor,
  fillEvenOdd: false,
  stroke: SvgColor.none,
  strokeLineCap: "butt",
  strokeLineJoin: "miter",
  strokeMiterLimit: 4,
  strokeWidth: new SvgNumeric(1, null, "pixels"),
  strokeDashArray: [],
  strokeDashOffset: 0,
  fontSize: new SvgNumeric(16, null),
  fontFamily: "sans-serif",
  fontWeight: "normal",
  fontStyle: "normal",
  textAnchor: "start"
});

class SvgClipPath {
  constructor(children, units = "userSpaceOnUse", evenOdd = false) {
    this.children = children;
    this.units = units;
    this.evenOdd = evenOdd;
  }
  get isEmpty() {
    return this.children.length === 0;
  }
  get isNotEmpty() {
    return !this.isEmpty;
  }
  static fromXml(element, painter, parent) {
    const attribute = element.getAttribute("clip-path");
    if (attribute?.startsWith("url(#") !== true) {
      return SvgClipPath.empty;
    }
    const closing = attribute.lastIndexOf(")");
    if (closing < 5) {
      return SvgClipPath.empty;
    }
    const referenced = painter.parser.findById(attribute.slice(5, closing));
    if (referenced === null || referenced.name.local !== "clipPath") {
      return SvgClipPath.empty;
    }
    const brush = SvgBrush.fromXml(referenced, parent, painter.parser);
    const children = [];
    let evenOdd = referenced.getAttribute("clip-rule") === "evenodd";
    for (const child of referenced.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
        evenOdd || (evenOdd = child.getAttribute("clip-rule") === "evenodd");
      }
    }
    const units = referenced.getAttribute("clipPathUnits") === "objectBoundingBox" ? "objectBoundingBox" : "userSpaceOnUse";
    return new SvgClipPath(children, units, evenOdd);
  }
  apply(canvas, target) {
    if (this.isEmpty) {
      return;
    }
    if (this.units === "objectBoundingBox") {
      canvas.saveContext();
      canvas.setTransform(multiplyMatrix(translationMatrix(target.x, target.y), scaleMatrix(target.width, target.height)));
    }
    for (const child of this.children) {
      child.draw(canvas);
    }
    if (this.units === "objectBoundingBox") {
      canvas.restoreContext();
    }
    canvas.clipPath({
      evenOdd: this.evenOdd
    });
  }
}

SvgClipPath.empty = new SvgClipPath([]);

const BLEND_MODE_NAMES = Object.freeze({
  normal: "/Normal",
  multiply: "/Multiply",
  screen: "/Screen",
  overlay: "/Overlay",
  darken: "/Darken",
  lighten: "/Lighten",
  colorDodge: "/ColorDodge",
  colorBurn: "/ColorBurn",
  hardLight: "/HardLight",
  softLight: "/SoftLight",
  difference: "/Difference",
  exclusion: "/Exclusion",
  hue: "/Hue",
  saturation: "/Saturation",
  color: "/Color",
  luminosity: "/Luminosity"
});

class PdfGraphicState {
  constructor({opacity = null, fillOpacity = null, strokeOpacity = null, blendMode = null} = {}) {
    this.fillOpacity = fillOpacity ?? opacity;
    this.strokeOpacity = strokeOpacity ?? opacity;
    this.blendMode = blendMode;
  }
  get isEmpty() {
    return this.fillOpacity === null && this.strokeOpacity === null && this.blendMode === null;
  }
  get key() {
    return `${this.fillOpacity}|${this.strokeOpacity}|${this.blendMode}`;
  }
  output() {
    const params = new PdfDict;
    if (this.strokeOpacity !== null) {
      params.set("/CA", new PdfNum(this.strokeOpacity));
    }
    if (this.fillOpacity !== null) {
      params.set("/ca", new PdfNum(this.fillOpacity));
    }
    if (this.blendMode !== null) {
      params.set("/BM", new PdfName(BLEND_MODE_NAMES[this.blendMode]));
    }
    return params;
  }
}

class SvgOperation {
  constructor(brush, clip, transform, painter) {
    this.brush = brush;
    this.clip = clip;
    this.transform = transform;
    this.painter = painter;
  }
  paint(canvas) {
    canvas.saveContext();
    this.clip.apply(canvas, this.boundingBox());
    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }
    if ((this.brush.opacity ?? 1) < 1 || this.brush.blendMode !== null) {
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.brush.opacity === 1 ? null : this.brush.opacity,
        blendMode: this.brush.blendMode
      }));
    }
    this.paintShape(canvas);
    canvas.restoreContext();
  }
  draw(canvas) {
    canvas.saveContext();
    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }
    this.drawShape(canvas);
    canvas.restoreContext();
  }
}

const TRANSFORM = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

class SvgTransform {
  constructor(matrix) {
    this.matrix = matrix;
  }
  get isEmpty() {
    return this.matrix === null;
  }
  get isNotEmpty() {
    return this.matrix !== null;
  }
  static fromXml(element) {
    return SvgTransform.fromString(element.getAttribute("transform"));
  }
  static fromString(transform) {
    if (transform === null || transform === undefined) {
      return SvgTransform.none;
    }
    let matrix = identityMatrix;
    for (const match of transform.matchAll(TRANSFORM)) {
      const name = match[1];
      const parameters = splitDoubles(match[2]);
      switch (name) {
       case "matrix":
        {
          const m = [ ...parameters, 0, 0, 0, 0, 0, 0 ].slice(0, 6);
          matrix = multiplyMatrix(matrix, m);
          break;
        }

       case "translate":
        {
          const dx = parameters[0] ?? 0;
          const dy = parameters[1] ?? 0;
          matrix = multiplyMatrix(matrix, translationMatrix(dx, dy));
          break;
        }

       case "scale":
        {
          const sx = parameters[0] ?? 1;
          const sy = parameters[1] ?? sx;
          matrix = multiplyMatrix(matrix, scaleMatrix(sx, sy));
          break;
        }

       case "rotate":
        {
          const degrees = parameters[0] ?? 0;
          const ox = parameters[1] ?? 0;
          const oy = parameters[2] ?? 0;
          if (parameters.length > 1) {
            matrix = multiplyMatrix(matrix, translationMatrix(ox, oy));
          }
          matrix = multiplyMatrix(matrix, rotationMatrix(toRadians(degrees)));
          if (ox !== 0 || oy !== 0) {
            matrix = multiplyMatrix(matrix, translationMatrix(-ox, -oy));
          }
          break;
        }

       case "skewX":
        matrix = multiplyMatrix(matrix, skewMatrix(toRadians(parameters[0] ?? 0), 0));
        break;

       case "skewY":
        matrix = multiplyMatrix(matrix, skewMatrix(0, toRadians(parameters[0] ?? 0)));
        break;
      }
    }
    return new SvgTransform(matrix);
  }
}

SvgTransform.none = new SvgTransform(null);

class SvgGroup extends SvgOperation {
  constructor(children, brush, clip, transform, painter) {
    super(brush, clip, transform, painter);
    this.children = children;
  }
  static fromXml(element, painter, parent) {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const children = [];
    for (const child of element.elements) {
      if (child.name.local === "symbol") {
        continue;
      }
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }
    return new SvgGroup(children, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
  paintShape(canvas) {
    for (const child of this.children) {
      child.paint(canvas);
    }
  }
  drawShape(canvas) {
    for (const child of this.children) {
      child.draw(canvas);
    }
  }
  boundingBox() {
    if (this.children.length === 0) {
      return PdfRect.zero;
    }
    let left = Infinity;
    let bottom = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    for (const child of this.children) {
      const box = child.boundingBox();
      left = Math.min(left, PdfRect.left(box));
      bottom = Math.min(bottom, PdfRect.bottom(box));
      right = Math.max(right, PdfRect.right(box));
      top = Math.max(top, PdfRect.top(box));
    }
    return PdfRect.fromLTRB(left, bottom, right, top);
  }
}

const ZERO = Object.freeze({
  dx: 0,
  dy: 0
});

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";

function commandOf(character) {
  return COMMANDS.includes(character) ? character : "?";
}

function isCubicCommand(command) {
  return command === "C" || command === "c" || command === "S" || command === "s";
}

function isQuadraticCommand(command) {
  return command === "Q" || command === "q" || command === "T" || command === "t";
}

function newSegment() {
  return {
    command: "?",
    targetPoint: ZERO,
    point1: ZERO,
    point2: ZERO,
    arcAngle: 0,
    arcLarge: false,
    arcSweep: false
  };
}

const SPACE = 32;

const NEWLINE = 10;

const TAB = 9;

const RETURN = 13;

const FORM_FEED = 12;

const COMMA = 44;

const PLUS = 43;

const MINUS = 45;

const PERIOD = 46;

const DIGIT_0 = 48;

const DIGIT_1 = 49;

const DIGIT_9 = 57;

const LOWER_E = 101;

const UPPER_E = 69;

const LOWER_X = 120;

const LOWER_M = 109;

class SvgPathStringSource {
  constructor(source) {
    this.index = 0;
    this.previousCommand = "?";
    this.source = source;
    this.length = source.length;
    this.skipOptionalSpaces();
  }
  get hasMoreData() {
    return this.index < this.length;
  }
  parseSegments() {
    const segments = [];
    while (this.hasMoreData) {
      segments.push(this.parseSegment());
    }
    return segments;
  }
  isSpace(code) {
    return code <= SPACE && (code === SPACE || code === NEWLINE || code === TAB || code === RETURN || code === FORM_FEED);
  }
  skipOptionalSpaces() {
    for (;;) {
      if (this.index >= this.length) {
        return -1;
      }
      const code = this.source.charCodeAt(this.index);
      if (!this.isSpace(code)) {
        return code;
      }
      this.index++;
    }
  }
  skipOptionalSpacesOrDelimiter(delimiter = COMMA) {
    if (this.skipOptionalSpaces() === delimiter) {
      this.index++;
      this.skipOptionalSpaces();
    }
  }
  static isNumberStart(code) {
    return code >= DIGIT_0 && code <= DIGIT_9 || code === PLUS || code === MINUS || code === PERIOD;
  }
  readCodeUnit() {
    if (this.index >= this.length) {
      return -1;
    }
    return this.source.charCodeAt(this.index++);
  }
  maybeImplicitCommand(lookahead, next) {
    if (!SvgPathStringSource.isNumberStart(lookahead) || this.previousCommand === "Z" || this.previousCommand === "z") {
      return next;
    }
    if (this.previousCommand === "M") return "L";
    if (this.previousCommand === "m") return "l";
    return this.previousCommand;
  }
  parseNumber() {
    this.skipOptionalSpaces();
    let sign = 1;
    let c = this.readCodeUnit();
    if (c === PLUS) {
      c = this.readCodeUnit();
    } else if (c === MINUS) {
      sign = -1;
      c = this.readCodeUnit();
    }
    if ((c < DIGIT_0 || c > DIGIT_9) && c !== PERIOD) {
      throw new SyntaxError("First character of a number must be one of [0-9+-.]");
    }
    let integer = 0;
    while (c >= DIGIT_0 && c <= DIGIT_9) {
      integer = integer * 10 + (c - DIGIT_0);
      c = this.readCodeUnit();
    }
    if (!Number.isFinite(integer)) {
      throw new RangeError("Numeric overflow in path data");
    }
    let decimal = 0;
    if (c === PERIOD) {
      c = this.readCodeUnit();
      if (c < DIGIT_0 || c > DIGIT_9) {
        throw new SyntaxError("There must be at least one digit following the .");
      }
      let frac = 1;
      while (c >= DIGIT_0 && c <= DIGIT_9) {
        frac *= .1;
        decimal += (c - DIGIT_0) * frac;
        c = this.readCodeUnit();
      }
    }
    let number = (integer + decimal) * sign;
    if (this.index < this.length && (c === LOWER_E || c === UPPER_E) && this.source.charCodeAt(this.index) !== LOWER_X && this.source.charCodeAt(this.index) !== LOWER_M) {
      c = this.readCodeUnit();
      let exponentIsNegative = false;
      if (c === PLUS) {
        c = this.readCodeUnit();
      } else if (c === MINUS) {
        c = this.readCodeUnit();
        exponentIsNegative = true;
      }
      if (c < DIGIT_0 || c > DIGIT_9) {
        throw new SyntaxError("Missing exponent in path data");
      }
      let exponent = 0;
      while (c >= DIGIT_0 && c <= DIGIT_9) {
        exponent = exponent * 10 + (c - DIGIT_0);
        c = this.readCodeUnit();
      }
      if (exponentIsNegative) {
        exponent = -exponent;
      }
      if (exponent < -37 || exponent > 38) {
        throw new RangeError(`Invalid exponent ${exponent} in path data`);
      }
      if (exponent !== 0) {
        number *= Math.pow(10, exponent);
      }
    }
    if (!Number.isFinite(number)) {
      throw new RangeError("Numeric overflow in path data");
    }
    if (c !== -1) {
      this.index--;
      this.skipOptionalSpacesOrDelimiter();
    }
    return number;
  }
  parseArcFlag() {
    if (!this.hasMoreData) {
      throw new SyntaxError("Expected an arc flag");
    }
    const flag = this.source.charCodeAt(this.index++);
    this.skipOptionalSpacesOrDelimiter();
    if (flag === DIGIT_0) return false;
    if (flag === DIGIT_1) return true;
    throw new SyntaxError("Arc flag must be 0 or 1");
  }
  parseSegment() {
    const segment = newSegment();
    const lookahead = this.source.charCodeAt(this.index);
    let command = commandOf(this.source[this.index]);
    if (this.previousCommand === "?") {
      if (command !== "M" && command !== "m") {
        throw new SyntaxError("Path data must begin with a moveTo command");
      }
      this.index++;
    } else if (command === "?") {
      command = this.maybeImplicitCommand(lookahead, command);
      if (command === "?") {
        throw new SyntaxError(`Expected a path command at offset ${this.index}`);
      }
    } else {
      this.index++;
    }
    segment.command = command;
    this.previousCommand = command;
    switch (command) {
     case "C":
     case "c":
      segment.point1 = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      segment.point2 = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      break;

     case "S":
     case "s":
      segment.point2 = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      break;

     case "M":
     case "m":
     case "L":
     case "l":
     case "T":
     case "t":
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      break;

     case "H":
     case "h":
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: 0
      };
      break;

     case "V":
     case "v":
      segment.targetPoint = {
        dx: 0,
        dy: this.parseNumber()
      };
      break;

     case "Z":
     case "z":
      this.skipOptionalSpaces();
      break;

     case "Q":
     case "q":
      segment.point1 = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      break;

     case "A":
     case "a":
      segment.point1 = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      segment.arcAngle = this.parseNumber();
      segment.arcLarge = this.parseArcFlag();
      segment.arcSweep = this.parseArcFlag();
      segment.targetPoint = {
        dx: this.parseNumber(),
        dy: this.parseNumber()
      };
      break;

     default:
      throw new SyntaxError("Unknown path command");
    }
    return segment;
  }
}

function add(a, b) {
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy
  };
}

function subtract(a, b) {
  return {
    dx: a.dx - b.dx,
    dy: a.dy - b.dy
  };
}

function times(a, factor) {
  return {
    dx: a.dx * factor,
    dy: a.dy * factor
  };
}

function reflectedPoint(reflectedIn, pointToReflect) {
  return {
    dx: 2 * reflectedIn.dx - pointToReflect.dx,
    dy: 2 * reflectedIn.dy - pointToReflect.dy
  };
}

const ONE_OVER_THREE = 1 / 3;

function blendPoints(p1, p2) {
  return {
    dx: (p1.dx + 2 * p2.dx) * ONE_OVER_THREE,
    dy: (p1.dy + 2 * p2.dy) * ONE_OVER_THREE
  };
}

const TWO_PI = Math.PI * 2;

const PI_OVER_TWO = Math.PI / 2;

class SvgPathNormalizer {
  constructor() {
    this.currentPoint = ZERO;
    this.subPathPoint = ZERO;
    this.controlPoint = ZERO;
    this.lastCommand = "?";
  }
  emitSegment(segment, path) {
    const command = segment.command;
    switch (command) {
     case "q":
      segment.point1 = add(segment.point1, this.currentPoint);
      segment.targetPoint = add(segment.targetPoint, this.currentPoint);
      break;

     case "c":
      segment.point1 = add(segment.point1, this.currentPoint);
      segment.point2 = add(segment.point2, this.currentPoint);
      segment.targetPoint = add(segment.targetPoint, this.currentPoint);
      break;

     case "s":
      segment.point2 = add(segment.point2, this.currentPoint);
      segment.targetPoint = add(segment.targetPoint, this.currentPoint);
      break;

     case "m":
     case "l":
     case "h":
     case "v":
     case "t":
     case "a":
      segment.targetPoint = add(segment.targetPoint, this.currentPoint);
      break;

     case "H":
      segment.targetPoint = {
        dx: segment.targetPoint.dx,
        dy: this.currentPoint.dy
      };
      break;

     case "V":
      segment.targetPoint = {
        dx: this.currentPoint.dx,
        dy: segment.targetPoint.dy
      };
      break;

     case "Z":
     case "z":
      segment.targetPoint = this.subPathPoint;
      break;
    }
    switch (command) {
     case "M":
     case "m":
      this.subPathPoint = segment.targetPoint;
      path.moveTo(segment.targetPoint.dx, segment.targetPoint.dy);
      break;

     case "L":
     case "l":
     case "H":
     case "h":
     case "V":
     case "v":
      path.lineTo(segment.targetPoint.dx, segment.targetPoint.dy);
      break;

     case "Z":
     case "z":
      path.close();
      break;

     case "S":
     case "s":
     case "C":
     case "c":
      {
        if (command === "S" || command === "s") {
          segment.point1 = isCubicCommand(this.lastCommand) ? reflectedPoint(this.currentPoint, this.controlPoint) : this.currentPoint;
        }
        this.controlPoint = segment.point2;
        path.cubicTo(segment.point1.dx, segment.point1.dy, segment.point2.dx, segment.point2.dy, segment.targetPoint.dx, segment.targetPoint.dy);
        break;
      }

     case "T":
     case "t":
     case "Q":
     case "q":
      {
        if (command === "T" || command === "t") {
          segment.point1 = isQuadraticCommand(this.lastCommand) ? reflectedPoint(this.currentPoint, this.controlPoint) : this.currentPoint;
        }
        this.controlPoint = segment.point1;
        const p1 = blendPoints(this.currentPoint, this.controlPoint);
        const p2 = blendPoints(segment.targetPoint, this.controlPoint);
        path.cubicTo(p1.dx, p1.dy, p2.dx, p2.dy, segment.targetPoint.dx, segment.targetPoint.dy);
        break;
      }

     case "A":
     case "a":
      if (!this.decomposeArcToCubic(this.currentPoint, segment, path)) {
        path.lineTo(segment.targetPoint.dx, segment.targetPoint.dy);
      }
      break;

     default:
      throw new SyntaxError("Invalid command type in path");
    }
    this.currentPoint = segment.targetPoint;
    if (!isCubicCommand(command) && !isQuadraticCommand(command)) {
      this.controlPoint = this.currentPoint;
    }
    this.lastCommand = command;
  }
  decomposeArcToCubic(currentPoint, segment, path) {
    let rx = Math.abs(segment.point1.dx);
    let ry = Math.abs(segment.point1.dy);
    if (rx === 0 || ry === 0) {
      return false;
    }
    if (segment.targetPoint.dx === currentPoint.dx && segment.targetPoint.dy === currentPoint.dy) {
      return false;
    }
    const angle = segment.arcAngle * Math.PI / 180;
    const midPointDistance = times(subtract(currentPoint, segment.targetPoint), .5);
    const unrotate = rotationMatrix(-angle);
    const transformedMidPoint = transformPoint(unrotate, midPointDistance.dx, midPointDistance.dy);
    const squareRx = rx * rx;
    const squareRy = ry * ry;
    const squareX = transformedMidPoint.x * transformedMidPoint.x;
    const squareY = transformedMidPoint.y * transformedMidPoint.y;
    const radiiScale = squareX / squareRx + squareY / squareRy;
    if (radiiScale > 1) {
      rx *= Math.sqrt(radiiScale);
      ry *= Math.sqrt(radiiScale);
    }
    const toUnitCircle = multiplyMatrix(scaleMatrix(1 / rx, 1 / ry), rotationMatrix(-angle));
    const mapped1 = transformPoint(toUnitCircle, currentPoint.dx, currentPoint.dy);
    const mapped2 = transformPoint(toUnitCircle, segment.targetPoint.dx, segment.targetPoint.dy);
    let point1 = {
      dx: mapped1.x,
      dy: mapped1.y
    };
    let point2 = {
      dx: mapped2.x,
      dy: mapped2.y
    };
    let delta = subtract(point2, point1);
    const d = delta.dx * delta.dx + delta.dy * delta.dy;
    const scaleFactorSquared = Math.max(1 / d - .25, 0);
    let scaleFactor = Math.sqrt(scaleFactorSquared);
    if (!Number.isFinite(scaleFactor)) {
      scaleFactor = 0;
    }
    if (segment.arcSweep === segment.arcLarge) {
      scaleFactor = -scaleFactor;
    }
    delta = times(delta, scaleFactor);
    const midpoint = times(add(point1, point2), .5);
    const centerPoint = {
      dx: midpoint.dx - delta.dy,
      dy: midpoint.dy + delta.dx
    };
    const theta1 = Math.atan2(point1.dy - centerPoint.dy, point1.dx - centerPoint.dx);
    const theta2 = Math.atan2(point2.dy - centerPoint.dy, point2.dx - centerPoint.dx);
    let thetaArc = theta2 - theta1;
    if (thetaArc < 0 && segment.arcSweep) {
      thetaArc += TWO_PI;
    } else if (thetaArc > 0 && !segment.arcSweep) {
      thetaArc -= TWO_PI;
    }
    const fromUnitCircle = multiplyMatrix(rotationMatrix(angle), scaleMatrix(rx, ry));
    const segments = Math.ceil(Math.abs(thetaArc / (PI_OVER_TWO + .001)));
    for (let i = 0; i < segments; i++) {
      const startTheta = theta1 + i * thetaArc / segments;
      const endTheta = theta1 + (i + 1) * thetaArc / segments;
      const t = 8 / 6 * Math.tan(.25 * (endTheta - startTheta));
      if (!Number.isFinite(t)) {
        return false;
      }
      const sinStart = Math.sin(startTheta);
      const cosStart = Math.cos(startTheta);
      const sinEnd = Math.sin(endTheta);
      const cosEnd = Math.cos(endTheta);
      point1 = {
        dx: cosStart - t * sinStart + centerPoint.dx,
        dy: sinStart + t * cosStart + centerPoint.dy
      };
      const targetPoint = {
        dx: cosEnd + centerPoint.dx,
        dy: sinEnd + centerPoint.dy
      };
      point2 = {
        dx: targetPoint.dx + t * sinEnd,
        dy: targetPoint.dy - t * cosEnd
      };
      const c1 = transformPoint(fromUnitCircle, point1.dx, point1.dy);
      const c2 = transformPoint(fromUnitCircle, point2.dx, point2.dy);
      const end = transformPoint(fromUnitCircle, targetPoint.dx, targetPoint.dy);
      path.cubicTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }
    return true;
  }
}

function writeSvgPathDataToPath(d, path) {
  if (d === null || d === undefined || d === "") {
    return;
  }
  const source = new SvgPathStringSource(d);
  const normalizer = new SvgPathNormalizer;
  for (const segment of source.parseSegments()) {
    normalizer.emitSegment(segment, path);
  }
}

class CanvasPathProxy {
  constructor(canvas) {
    this.canvas = canvas;
  }
  moveTo(x, y) {
    this.canvas.moveTo(x, y);
  }
  lineTo(x, y) {
    this.canvas.lineTo(x, y);
  }
  cubicTo(x1, y1, x2, y2, x3, y3) {
    this.canvas.curveTo(x1, y1, x2, y2, x3, y3);
  }
  close() {
    this.canvas.closePath();
  }
}

function drawShape(canvas, d) {
  writeSvgPathDataToPath(d, new CanvasPathProxy(canvas));
}

class BoundingBoxPathProxy {
  constructor() {
    this.xMin = Infinity;
    this.yMin = Infinity;
    this.xMax = -Infinity;
    this.yMax = -Infinity;
    this.px = 0;
    this.py = 0;
  }
  get box() {
    if (this.xMin > this.xMax || this.yMin > this.yMax) {
      return PdfRect.zero;
    }
    return PdfRect.fromLTRB(this.xMin, this.yMin, this.xMax, this.yMax);
  }
  moveTo(x, y) {
    this.px = x;
    this.py = y;
    this.updateMinMax(x, y);
  }
  lineTo(x, y) {
    this.px = x;
    this.py = y;
    this.updateMinMax(x, y);
  }
  close() {}
  cubicTo(x1, y1, x2, y2, x3, y3) {
    const tValues = [];
    for (let axis = 0; axis < 2; axis++) {
      let a;
      let b;
      let c;
      if (axis === 0) {
        b = 6 * this.px - 12 * x1 + 6 * x2;
        a = -3 * this.px + 9 * x1 - 9 * x2 + 3 * x3;
        c = 3 * x1 - 3 * this.px;
      } else {
        b = 6 * this.py - 12 * y1 + 6 * y2;
        a = -3 * this.py + 9 * y1 - 9 * y2 + 3 * y3;
        c = 3 * y1 - 3 * this.py;
      }
      if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) < 1e-12) {
          continue;
        }
        const t = -c / b;
        if (t > 0 && t < 1) {
          tValues.push(t);
        }
        continue;
      }
      const b2ac = b * b - 4 * c * a;
      if (b2ac < 0) {
        if (Math.abs(b2ac) < 1e-12) {
          const t = -b / (2 * a);
          if (t > 0 && t < 1) {
            tValues.push(t);
          }
        }
        continue;
      }
      const sqrtB2ac = Math.sqrt(b2ac);
      const t1 = (-b + sqrtB2ac) / (2 * a);
      if (t1 > 0 && t1 < 1) {
        tValues.push(t1);
      }
      const t2 = (-b - sqrtB2ac) / (2 * a);
      if (t2 > 0 && t2 < 1) {
        tValues.push(t2);
      }
    }
    for (const t of tValues) {
      const mt = 1 - t;
      this.updateMinMax(mt * mt * mt * this.px + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3, mt * mt * mt * this.py + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3);
    }
    this.updateMinMax(this.px, this.py);
    this.updateMinMax(x3, y3);
    this.px = x3;
    this.py = y3;
  }
  updateMinMax(x, y) {
    this.xMin = Math.min(this.xMin, x);
    this.yMin = Math.min(this.yMin, y);
    this.xMax = Math.max(this.xMax, x);
    this.yMax = Math.max(this.yMax, y);
  }
}

function shapeBoundingBox(d) {
  const proxy = new BoundingBoxPathProxy;
  writeSvgPathDataToPath(d, proxy);
  return proxy.box;
}

class SvgPath extends SvgOperation {
  constructor(d, brush, clip, transform, painter) {
    super(brush, clip, transform, painter);
    this.d = d;
  }
  static fromXmlElement(element, painter, parent) {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    let d;
    switch (element.name.local) {
     case "path":
      {
        const attribute = element.getAttribute("d");
        if (attribute === null) {
          throw new SyntaxError("Path element must contain a d attribute");
        }
        d = attribute;
        break;
      }

     case "rect":
      d = SvgPath.rectData(element, brush);
      break;

     case "circle":
      {
        const cx = SvgPath.numeric(element, "cx", brush);
        const cy = SvgPath.numeric(element, "cy", brush);
        const r = SvgPath.numeric(element, "r", brush);
        d = `M${cx - r},${cy}A${r},${r} 0,0,0 ${cx + r},${cy}` + `A${r},${r} 0,0,0 ${cx - r},${cy}z`;
        break;
      }

     case "ellipse":
      {
        const cx = SvgPath.numeric(element, "cx", brush);
        const cy = SvgPath.numeric(element, "cy", brush);
        const rx = SvgPath.numeric(element, "rx", brush);
        const ry = SvgPath.numeric(element, "ry", brush);
        d = `M${cx - rx},${cy}A${rx},${ry} 0,0,0 ${cx + rx},${cy}` + `A${rx},${ry} 0,0,0 ${cx - rx},${cy}z`;
        break;
      }

     case "line":
      {
        const x1 = SvgPath.numeric(element, "x1", brush);
        const y1 = SvgPath.numeric(element, "y1", brush);
        const x2 = SvgPath.numeric(element, "x2", brush);
        const y2 = SvgPath.numeric(element, "y2", brush);
        d = `M${x1} ${y1} ${x2} ${y2}`;
        break;
      }

     case "polyline":
      d = `M${element.getAttribute("points") ?? "0, 0"}`;
      break;

     case "polygon":
      d = `M${element.getAttribute("points") ?? "0, 0"}z`;
      break;

     default:
      throw new SyntaxError(`Unsupported SVG shape: ${element.name.local}`);
    }
    return new SvgPath(d, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
  static numeric(element, name, brush) {
    return getNumeric(element, name, brush, {
      defaultValue: 0
    }).sizeValue;
  }
  static rectData(element, brush) {
    const x = SvgPath.numeric(element, "x", brush);
    const y = SvgPath.numeric(element, "y", brush);
    const width = SvgPath.numeric(element, "width", brush);
    const height = SvgPath.numeric(element, "height", brush);
    let rx = getNumeric(element, "rx", brush)?.sizeValue ?? null;
    let ry = getNumeric(element, "ry", brush)?.sizeValue ?? null;
    ry = ry ?? rx ?? 0;
    rx = rx ?? ry;
    const topRight = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${rx} ${ry}` : "";
    const bottomRight = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${-rx} ${ry}` : "";
    const bottomLeft = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${-rx} ${-ry}` : "";
    const topLeft = rx !== 0 || ry !== 0 ? `a ${rx} ${ry} 0 0 1 ${rx} ${-ry}` : "";
    return `M${x + rx} ${y}h${width - rx * 2}${topRight}` + `v${height - ry * 2}${bottomRight}` + `h${-(width - rx * 2)}${bottomLeft}` + `v${-(height - ry * 2)}${topLeft}z`;
  }
  paintShape(canvas) {
    const fill = this.brush.fill;
    if (fill?.isNotEmpty === true) {
      fill.setFillColor(canvas);
      const opacity = (this.brush.fillOpacity ?? 1) * fill.opacity;
      if (opacity < 1) {
        canvas.saveContext();
        canvas.setGraphicState(new PdfGraphicState({
          opacity
        }));
      }
      drawShape(canvas, this.d);
      canvas.fillPath({
        evenOdd: this.brush.fillEvenOdd ?? false
      });
      if (opacity < 1) {
        canvas.restoreContext();
      }
    }
    const stroke = this.brush.stroke;
    if (stroke?.isNotEmpty === true) {
      stroke.setStrokeColor(canvas);
      const opacity = (this.brush.strokeOpacity ?? 1) * stroke.opacity;
      if (opacity < 1) {
        canvas.setGraphicState(new PdfGraphicState({
          opacity
        }));
      }
      drawShape(canvas, this.d);
      canvas.setLineCap(this.brush.strokeLineCap ?? "butt");
      canvas.setLineJoin(this.brush.strokeLineJoin ?? "miter");
      canvas.setMiterLimit(Math.max(1, this.brush.strokeMiterLimit ?? 4));
      canvas.setLineDashPattern(this.brush.strokeDashArray ?? [], this.brush.strokeDashOffset ?? 0);
      canvas.setLineWidth(this.brush.strokeWidth?.sizeValue ?? 1);
      canvas.strokePath();
    }
  }
  drawShape(canvas) {
    drawShape(canvas, this.d);
  }
  boundingBox() {
    return shapeBoundingBox(this.d);
  }
}

class SvgSymbol extends SvgGroup {
  static fromXml(element, painter, parent) {
    const brush = painter.brushFor(element, parent);
    const children = [];
    for (const child of element.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }
    return new SvgSymbol(children, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
}

const XLINK = [ "http:", "", "www.w3.org", "1999", "xlink" ].join("/");

class SvgUse extends SvgOperation {
  constructor(x, y, width, height, href, brush, clip, transform, painter) {
    super(brush, clip, transform, painter);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.href = href;
  }
  static fromXml(element, painter, parent) {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const x = getNumeric(element, "x", brush, {
      defaultValue: 0
    }).sizeValue;
    const y = getNumeric(element, "y", brush, {
      defaultValue: 0
    }).sizeValue;
    const width = getNumeric(element, "width", brush, {
      defaultValue: 0
    }).sizeValue;
    const height = getNumeric(element, "height", brush, {
      defaultValue: 0
    }).sizeValue;
    const hrefAttribute = element.getAttribute("href") ?? element.getAttribute("href", XLINK);
    let href = null;
    if (hrefAttribute?.startsWith("#") === true) {
      const referenced = painter.parser.findById(hrefAttribute.slice(1));
      if (referenced !== null && referenced !== element) {
        href = painter.operationFromXml(referenced, brush);
      }
    }
    return new SvgUse(x, y, width, height, href, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
  paintShape(canvas) {
    if (this.x !== 0 || this.y !== 0) {
      canvas.setTransform(translationMatrix(this.x, this.y));
    }
    this.href?.paint(canvas);
  }
  drawShape(canvas) {
    if (this.x !== 0 || this.y !== 0) {
      canvas.setTransform(translationMatrix(this.x, this.y));
    }
    this.href?.draw(canvas);
  }
  boundingBox() {
    return this.href?.boundingBox() ?? PdfRect.zero;
  }
}

class SvgPainter {
  constructor(parser, canvas, boundingBox) {
    this.parser = parser;
    this.canvas = canvas;
    this.boundingBox = boundingBox;
  }
  brushFor(element, parent) {
    return SvgBrush.fromXml(element, parent, this.parser);
  }
  operationFromXml(element, brush) {
    if (element.getAttribute("visibility") === "hidden" || element.getAttribute("display") === "none") {
      return null;
    }
    switch (element.name.local) {
     case "circle":
     case "ellipse":
     case "line":
     case "path":
     case "polygon":
     case "polyline":
     case "rect":
      return SvgPath.fromXmlElement(element, this, brush);

     case "g":
     case "svg":
      return SvgGroup.fromXml(element, this, brush);

     case "symbol":
      return SvgSymbol.fromXml(element, this, brush);

     case "use":
      return SvgUse.fromXml(element, this, brush);

     default:
      return null;
    }
  }
  rootOperation() {
    return SvgGroup.fromXml(this.parser.root, this, SvgBrush.defaultContext);
  }
  paint() {
    this.rootOperation().paint(this.canvas);
  }
}

class XmlText {
  constructor(value) {
    this.value = value;
  }
}

function splitName(qualified) {
  const colon = qualified.indexOf(":");
  if (colon < 0) {
    return {
      qualified,
      local: qualified,
      prefix: null
    };
  }
  return {
    qualified,
    local: qualified.slice(colon + 1),
    prefix: qualified.slice(0, colon)
  };
}

class XmlElement {
  constructor(qualifiedName, namespaces) {
    this.children = [];
    this.attributes = new Map;
    this.parent = null;
    this.name = splitName(qualifiedName);
    this.namespaces = namespaces;
  }
  getAttribute(name, namespace) {
    if (namespace === undefined) {
      return this.attributes.get(name) ?? null;
    }
    for (const [key, value] of this.attributes) {
      const attributeName = splitName(key);
      if (attributeName.local !== name || attributeName.prefix === null) {
        continue;
      }
      if (this.namespaces.get(attributeName.prefix) === namespace) {
        return value;
      }
    }
    return null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  get elements() {
    return this.children.filter(node => node instanceof XmlElement);
  }
  get descendants() {
    const found = [];
    const walk = element => {
      for (const child of element.elements) {
        found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  get text() {
    let output = "";
    for (const child of this.children) {
      output += child instanceof XmlText ? child.value : child.text;
    }
    return output;
  }
  findElements(localName) {
    return this.elements.filter(element => element.name.local === localName);
  }
}

class XmlDocument {
  constructor(rootElement) {
    this.rootElement = rootElement;
  }
  static parse(source) {
    return parseXml(source);
  }
}

const PREDEFINED_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'"
});

function describePosition(source, index) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return `line ${line}, column ${column}`;
}

class XmlParser {
  constructor(source) {
    this.index = 0;
    this.source = source;
  }
  fail(message, at = this.index) {
    throw new SyntaxError(`${message} at ${describePosition(this.source, at)}`);
  }
  get atEnd() {
    return this.index >= this.source.length;
  }
  skipWhitespace() {
    while (!this.atEnd && /\s/.test(this.source[this.index])) {
      this.index++;
    }
  }
  startsWith(text) {
    return this.source.startsWith(text, this.index);
  }
  expect(text) {
    if (!this.startsWith(text)) {
      this.fail(`Expected "${text}"`);
    }
    this.index += text.length;
  }
  skipUntil(terminator, what) {
    const start = this.index;
    const end = this.source.indexOf(terminator, this.index);
    if (end < 0) {
      this.fail(`Unterminated ${what}`, start);
    }
    this.index = end + terminator.length;
  }
  skipDoctype() {
    this.index += "<!DOCTYPE".length;
    let depth = 0;
    while (!this.atEnd) {
      const character = this.source[this.index];
      if (character === "[") depth++; else if (character === "]") depth--; else if (character === ">" && depth <= 0) {
        this.index++;
        return;
      }
      this.index++;
    }
    this.fail("Unterminated DOCTYPE");
  }
  skipMisc() {
    let skipped = false;
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith("<?")) {
        this.skipUntil("?>", "processing instruction");
      } else if (this.startsWith("\x3c!--")) {
        this.skipUntil("--\x3e", "comment");
      } else if (this.startsWith("<!DOCTYPE")) {
        this.skipDoctype();
      } else {
        return skipped;
      }
      skipped = true;
    }
  }
  readName() {
    const start = this.index;
    while (!this.atEnd && /[^\s/>=]/.test(this.source[this.index])) {
      this.index++;
    }
    if (this.index === start) {
      this.fail("Expected a name");
    }
    return this.source.slice(start, this.index);
  }
  decode(text) {
    if (!text.includes("&")) {
      return text;
    }
    return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[^;\s&]+);/g, (match, reference) => {
      if (reference.startsWith("#x") || reference.startsWith("#X")) {
        const code = Number.parseInt(reference.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (reference.startsWith("#")) {
        const code = Number.parseInt(reference.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return PREDEFINED_ENTITIES[reference] ?? match;
    });
  }
  readAttributeValue() {
    const quote = this.source[this.index];
    if (quote !== '"' && quote !== "'") {
      this.fail("Attribute value must be quoted");
    }
    this.index++;
    const start = this.index;
    const end = this.source.indexOf(quote, this.index);
    if (end < 0) {
      this.fail("Unterminated attribute value", start);
    }
    this.index = end + 1;
    return this.decode(this.source.slice(start, end));
  }
  parseElement(inherited) {
    const openedAt = this.index;
    this.expect("<");
    const qualifiedName = this.readName();
    const attributes = [];
    let selfClosing = false;
    for (;;) {
      this.skipWhitespace();
      if (this.atEnd) {
        this.fail(`Unterminated element <${qualifiedName}>`, openedAt);
      }
      if (this.startsWith("/>")) {
        this.index += 2;
        selfClosing = true;
        break;
      }
      if (this.startsWith(">")) {
        this.index++;
        break;
      }
      const attributeName = this.readName();
      this.skipWhitespace();
      this.expect("=");
      this.skipWhitespace();
      attributes.push([ attributeName, this.readAttributeValue() ]);
    }
    let namespaces = inherited;
    const declarations = attributes.filter(([name]) => name === "xmlns" || name.startsWith("xmlns:"));
    if (declarations.length > 0) {
      const merged = new Map(inherited);
      for (const [name, value] of declarations) {
        merged.set(name === "xmlns" ? "" : name.slice("xmlns:".length), value);
      }
      namespaces = merged;
    }
    const element = new XmlElement(qualifiedName, namespaces);
    for (const [name, value] of attributes) {
      element.attributes.set(name, value);
    }
    if (selfClosing) {
      return element;
    }
    this.parseContent(element, qualifiedName, openedAt);
    return element;
  }
  parseContent(element, qualifiedName, openedAt) {
    let text = "";
    const flushText = () => {
      if (text.length > 0) {
        element.children.push(new XmlText(this.decode(text)));
        text = "";
      }
    };
    for (;;) {
      if (this.atEnd) {
        this.fail(`Unterminated element <${qualifiedName}>`, openedAt);
      }
      if (this.startsWith("</")) {
        flushText();
        this.index += 2;
        const closing = this.readName();
        if (closing !== qualifiedName) {
          this.fail(`Closing tag </${closing}> does not match <${qualifiedName}>`);
        }
        this.skipWhitespace();
        this.expect(">");
        return;
      }
      if (this.startsWith("<![CDATA[")) {
        flushText();
        const start = this.index + "<![CDATA[".length;
        const end = this.source.indexOf("]]>", start);
        if (end < 0) {
          this.fail("Unterminated CDATA section");
        }
        element.children.push(new XmlText(this.source.slice(start, end)));
        this.index = end + "]]>".length;
        continue;
      }
      if (this.startsWith("\x3c!--")) {
        flushText();
        this.skipUntil("--\x3e", "comment");
        continue;
      }
      if (this.startsWith("<?")) {
        flushText();
        this.skipUntil("?>", "processing instruction");
        continue;
      }
      if (this.startsWith("<!DOCTYPE")) {
        flushText();
        this.skipDoctype();
        continue;
      }
      if (this.startsWith("<")) {
        flushText();
        const child = this.parseElement(element.namespaces);
        child.parent = element;
        element.children.push(child);
        continue;
      }
      text += this.source[this.index];
      this.index++;
    }
  }
  parseDocument() {
    this.skipMisc();
    if (this.atEnd || !this.startsWith("<")) {
      this.fail("Document has no root element");
    }
    const root = this.parseElement(new Map);
    this.skipMisc();
    if (!this.atEnd) {
      this.fail("Content after the root element");
    }
    return new XmlDocument(root);
  }
}

function parseXml(source) {
  if (typeof source !== "string") {
    throw new TypeError("XML source must be a string");
  }
  return new XmlParser(source).parseDocument();
}

function size(width, height) {
  return {
    width: Math.max(0, width),
    height: Math.max(0, height)
  };
}

function applyBoxFit(fit, input, output) {
  const iw = input.width;
  const ih = input.height;
  const ow = output.width;
  const oh = output.height;
  if (iw <= 0 || ih <= 0 || ow <= 0 || oh <= 0) {
    return {
      source: size(0, 0),
      destination: size(0, 0)
    };
  }
  switch (fit) {
   case "fill":
    return {
      source: size(iw, ih),
      destination: size(ow, oh)
    };

   case "contain":
    {
      const scale = Math.min(ow / iw, oh / ih);
      return {
        source: size(iw, ih),
        destination: size(iw * scale, ih * scale)
      };
    }

   case "cover":
    {
      const scale = Math.max(ow / iw, oh / ih);
      return {
        source: size(ow / scale, oh / scale),
        destination: size(ow, oh)
      };
    }

   case "fitWidth":
    {
      const scale = ow / iw;
      const height = ih * scale;
      return height > oh ? {
        source: size(iw, oh / scale),
        destination: size(ow, oh)
      } : {
        source: size(iw, ih),
        destination: size(ow, height)
      };
    }

   case "fitHeight":
    {
      const scale = oh / ih;
      const width = iw * scale;
      return width > ow ? {
        source: size(ow / scale, ih),
        destination: size(ow, oh)
      } : {
        source: size(iw, ih),
        destination: size(width, oh)
      };
    }

   case "none":
    {
      const source = size(Math.min(iw, ow), Math.min(ih, oh));
      return {
        source,
        destination: source
      };
    }

   case "scaleDown":
    {
      const scale = Math.min(1, ow / iw, oh / ih);
      return {
        source: size(iw, ih),
        destination: size(iw * scale, ih * scale)
      };
    }

   default:
    throw new TypeError(`Unknown BoxFit: ${fit}`);
  }
}

function resolveAlignment(value) {
  if (typeof value !== "string") {
    return value;
  }
  const resolved = Alignment[value];
  if (resolved === undefined) {
    throw new TypeError(`Unknown alignment: ${value}`);
  }
  return resolved;
}

function constrain(value, maximum) {
  return Math.max(0, Math.min(value, maximum));
}

class SvgImage extends Widget {
  constructor({svg, fit = "contain", alignment = Alignment.center, clip = true, width = null, height = null, colorFilter = null}) {
    super();
    this.parser = SvgParser.fromXml({
      xml: parseXml(svg),
      colorFilter: colorFilter === null ? null : normalizeColor(colorFilter)
    });
    this.fit = fit;
    this.alignment = resolveAlignment(alignment);
    this.clip = Boolean(clip);
    this.width = width === null ? null : Number(width);
    this.height = height === null ? null : Number(height);
  }
  layout(_context, constraints) {
    const offeredWidth = this.width !== null || this.parser.width !== null ? constrain(this.width ?? this.parser.width, constraints.maxWidth) : Number.isFinite(constraints.maxWidth) ? constraints.maxWidth : constrain(this.parser.viewBox.width, constraints.maxWidth);
    const offeredHeight = this.height !== null || this.parser.height !== null ? constrain(this.height ?? this.parser.height, constraints.maxHeight) : Number.isFinite(constraints.maxHeight) ? constraints.maxHeight : constrain(this.parser.viewBox.height, constraints.maxHeight);
    const fitted = applyBoxFit(this.fit, size(this.parser.viewBox.width, this.parser.viewBox.height), size(offeredWidth, offeredHeight));
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, this.parser.viewBox.width, this.parser.viewBox.height);
    return {
      widget: this,
      width: fitted.destination.width,
      height: fitted.destination.height,
      data: {
        source: fitted.source,
        destination: fitted.destination,
        sourceX: this.parser.viewBox.x + sourceOffset.dx,
        sourceY: this.parser.viewBox.y + sourceOffset.dy
      }
    };
  }
  paint(context, box) {
    const {source, destination, sourceX, sourceY} = box.data;
    if (source.width <= 0 || source.height <= 0) {
      return;
    }
    const sx = destination.width / source.width;
    const sy = destination.height / source.height;
    const matrix = [ sx, 0, 0, -sy, box.x - sourceX * sx, context.canvas.pageHeight - box.y + sourceY * sy ];
    context.canvas.saveContext();
    if (this.clip) {
      context.canvas.drawRect(box.x, context.canvas.pageHeight - box.y - box.height, box.width, box.height);
      context.canvas.clipPath();
    }
    context.canvas.setTransform(matrix);
    new SvgPainter(this.parser, context.canvas, {
      x: 0,
      y: 0,
      width: context.pageFormat.width,
      height: context.pageFormat.height
    }).paint();
    context.canvas.restoreContext();
  }
}

function textWidth(font, text, fontSize, letterSpacing = 0) {
  return font.stringMetrics(text, fontSize, letterSpacing).advanceWidth;
}

function breakLongWord(word, maxWidth, fontSize, font) {
  const chunks = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && textWidth(font, candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(value, maxWidth, fontSize, font = defaultPdfFont) {
  const lines = [];
  const paragraphs = String(value).replace(/\r\n?/g, "\n").split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const rawWords = paragraph.split(/\s+/);
    let current = "";
    for (const rawWord of rawWords) {
      const words = textWidth(font, rawWord, fontSize) <= maxWidth ? [ rawWord ] : breakLongWord(rawWord, maxWidth, fontSize, font);
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && textWidth(font, candidate, fontSize) > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [ "" ];
}

class Text extends Widget {
  constructor(value, {style = undefined, fontSize = undefined, lineHeight = undefined, color = undefined, align = undefined, margin = 0, maxLines = undefined, font = undefined} = {}) {
    super();
    this.value = String(value);
    this.style = style ?? null;
    this.fontSize = fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), "fontSize");
    this.lineHeight = lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), "lineHeight");
    this.color = color === undefined ? null : normalizeColor(color);
    this.align = align ?? null;
    this.margin = normalizeInsets(margin);
    this.maxLines = maxLines ?? null;
    this.font = font ?? null;
  }
  resolveStyle(context) {
    const theme = context.theme;
    const merged = theme.defaultTextStyle.merge(this.style);
    const fontSize = this.fontSize ?? merged.fontSize ?? DEFAULT_FONT_SIZE;
    const declaredFont = merged.font;
    return {
      font: this.font ?? (declaredFont === null ? context.document.font : declaredFont.getFont(context)),
      fontSize,
      color: this.color ?? merged.color ?? [ 0, 0, 0 ],
      align: this.align ?? theme.textAlign ?? "left",
      lineAdvance: fontSize * (this.lineHeight ?? merged.height ?? DEFAULT_LINE_HEIGHT) + (merged.lineSpacing ?? 0),
      letterSpacing: merged.letterSpacing ?? 0,
      wordSpacing: merged.wordSpacing ?? 0,
      maxLines: this.maxLines ?? theme.maxLines
    };
  }
  layout(context, constraints) {
    const style = this.resolveStyle(context);
    const contentWidth = Math.max(1, constraints.maxWidth - this.margin.left - this.margin.right);
    const wrapped = wrapText(this.value, contentWidth, style.fontSize, style.font);
    const lines = style.maxLines === null ? wrapped : wrapped.slice(0, Math.max(1, style.maxLines));
    const contentHeight = lines.length * style.lineAdvance;
    const widest = Math.max(...lines.map(line => textWidth(style.font, line, style.fontSize, style.letterSpacing)), 0);
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, widest + this.margin.left + this.margin.right),
      height: contentHeight + this.margin.top + this.margin.bottom,
      data: {
        lines,
        lineAdvance: style.lineAdvance,
        contentWidth,
        style
      }
    };
  }
  paint(context, box) {
    const {canvas} = context;
    const {lines, lineAdvance, contentWidth, style} = box.data;
    const xStart = box.x + this.margin.left;
    let baseline = box.y + this.margin.top + style.fontSize;
    for (const line of lines) {
      const lineWidth = textWidth(style.font, line, style.fontSize, style.letterSpacing);
      let x = xStart;
      if (style.align === "center") x += (contentWidth - lineWidth) / 2;
      if (style.align === "right") x += contentWidth - lineWidth;
      canvas.text(line, x, baseline, {
        fontSize: style.fontSize,
        color: style.color,
        font: style.font,
        letterSpacing: style.letterSpacing,
        wordSpacing: style.wordSpacing
      });
      baseline += lineAdvance;
    }
  }
}

const publicApi = Object.freeze({
  Document,
  Page,
  MultiPage,
  Text,
  Column,
  Row,
  Container,
  Spacer,
  Vector,
  Padding,
  Align,
  Center,
  SizedBox,
  Divider,
  SvgImage,
  Alignment,
  EdgeInsets,
  PageFormat,
  PdfType1Font,
  PdfTtfFont,
  Font,
  TextStyle,
  Theme,
  ThemeData,
  DefaultTextStyle,
  PageTheme
});

function createPdf(options, build) {
  if (typeof build !== "function") {
    throw new TypeError("createPdf requires a build function");
  }
  const document = new Document(options);
  const sections = build(publicApi);
  const normalized = Array.isArray(sections) ? sections : [ sections ];
  for (const section of normalized) {
    document.addPage(section);
  }
  return document.save();
}

const js_pdf = Object.freeze({
  ...publicApi,
  createPdf
});

export { Align, Alignment, Center, Column, Container, DefaultTextStyle, Divider, Document, EdgeInsets, Font, MultiPage, Padding, Page, PageFormat, PageTheme, PdfFontMetrics, PdfGraphicState, PdfPoint, PdfRect, PdfTtfFont, PdfType1Font, Row, SizedBox, Spacer, StatelessWidget, SvgImage, Text, TextStyle, Theme, ThemeData, Vector, Widget, composeMatrices, createPdf, flipMatrix, identityMatrix, invertMatrix, js_pdf, multiplyMatrix, rotationMatrix, scaleMatrix, skewMatrix, transformPoint, translationMatrix };

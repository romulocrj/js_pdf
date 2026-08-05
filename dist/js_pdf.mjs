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

class BitReader {
  constructor(bytes) {
    this.offset = 0;
    this.bits = 0;
    this.bitCount = 0;
    this.bytes = bytes;
  }
  read(count) {
    while (this.bitCount < count) {
      const byte = this.bytes[this.offset++];
      if (byte === undefined) throw new RangeError("Truncated DEFLATE stream");
      this.bits |= byte << this.bitCount;
      this.bitCount += 8;
    }
    const mask = count === 0 ? 0 : (1 << count) - 1;
    const value = this.bits & mask;
    this.bits >>>= count;
    this.bitCount -= count;
    return value;
  }
  align() {
    this.bits = 0;
    this.bitCount = 0;
  }
}

function reverseBits(value, count) {
  let result = 0;
  for (let index = 0; index < count; index++) {
    result = result << 1 | value >>> index & 1;
  }
  return result;
}

function huffman(lengths) {
  let maxBits = 0;
  for (const length of lengths) maxBits = Math.max(maxBits, length);
  if (maxBits === 0) throw new RangeError("Empty DEFLATE Huffman table");
  const counts = new Array(maxBits + 1).fill(0);
  for (const length of lengths) {
    if (length > 0) counts[length] = (counts[length] ?? 0) + 1;
  }
  const next = new Array(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = code + (counts[bits - 1] ?? 0) << 1;
    next[bits] = code;
  }
  const symbols = new Map;
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol] ?? 0;
    if (length === 0) continue;
    const canonical = next[length] ?? 0;
    next[length] = canonical + 1;
    symbols.set(length * 65536 + reverseBits(canonical, length), symbol);
  }
  return {
    symbols,
    maxBits
  };
}

function readSymbol(reader, table) {
  let code = 0;
  for (let length = 1; length <= table.maxBits; length++) {
    code |= reader.read(1) << length - 1;
    const symbol = table.symbols.get(length * 65536 + code);
    if (symbol !== undefined) return symbol;
  }
  throw new RangeError("Invalid DEFLATE Huffman code");
}

const LENGTH_BASE = Object.freeze([ 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258 ]);

const LENGTH_EXTRA = Object.freeze([ 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 ]);

const DISTANCE_BASE = Object.freeze([ 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 ]);

const DISTANCE_EXTRA = Object.freeze([ 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 ]);

function compressedBlock(reader, output, literals, distances) {
  for (;;) {
    const symbol = readSymbol(reader, literals);
    if (symbol < 256) {
      output.push(symbol);
      continue;
    }
    if (symbol === 256) return;
    const lengthIndex = symbol - 257;
    const baseLength = LENGTH_BASE[lengthIndex];
    const lengthBits = LENGTH_EXTRA[lengthIndex];
    if (baseLength === undefined || lengthBits === undefined) {
      throw new RangeError(`Invalid DEFLATE length symbol ${symbol}`);
    }
    const length = baseLength + reader.read(lengthBits);
    const distanceSymbol = readSymbol(reader, distances);
    const baseDistance = DISTANCE_BASE[distanceSymbol];
    const distanceBits = DISTANCE_EXTRA[distanceSymbol];
    if (baseDistance === undefined || distanceBits === undefined) {
      throw new RangeError(`Invalid DEFLATE distance symbol ${distanceSymbol}`);
    }
    const distance = baseDistance + reader.read(distanceBits);
    if (distance > output.length) throw new RangeError("DEFLATE distance exceeds output");
    for (let index = 0; index < length; index++) {
      output.push(output[output.length - distance]);
    }
  }
}

function fixedTables() {
  const literalLengths = new Array(288);
  for (let symbol = 0; symbol <= 143; symbol++) literalLengths[symbol] = 8;
  for (let symbol = 144; symbol <= 255; symbol++) literalLengths[symbol] = 9;
  for (let symbol = 256; symbol <= 279; symbol++) literalLengths[symbol] = 7;
  for (let symbol = 280; symbol <= 287; symbol++) literalLengths[symbol] = 8;
  return [ huffman(literalLengths), huffman(new Array(32).fill(5)) ];
}

function dynamicTables(reader) {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeCount = reader.read(4) + 4;
  const order = [ 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];
  const codeLengths = new Array(19).fill(0);
  for (let index = 0; index < codeCount; index++) {
    codeLengths[order[index]] = reader.read(3);
  }
  const codes = huffman(codeLengths);
  const lengths = [];
  const total = literalCount + distanceCount;
  while (lengths.length < total) {
    const symbol = readSymbol(reader, codes);
    if (symbol <= 15) {
      lengths.push(symbol);
    } else if (symbol === 16) {
      if (lengths.length === 0) throw new RangeError("DEFLATE repeat has no previous length");
      const repeat = reader.read(2) + 3;
      const previous = lengths[lengths.length - 1];
      for (let index = 0; index < repeat; index++) lengths.push(previous);
    } else if (symbol === 17) {
      const repeat = reader.read(3) + 3;
      for (let index = 0; index < repeat; index++) lengths.push(0);
    } else if (symbol === 18) {
      const repeat = reader.read(7) + 11;
      for (let index = 0; index < repeat; index++) lengths.push(0);
    } else {
      throw new RangeError(`Invalid DEFLATE code-length symbol ${symbol}`);
    }
    if (lengths.length > total) throw new RangeError("DEFLATE code lengths overflow");
  }
  const literals = huffman(lengths.slice(0, literalCount));
  const distanceLengths = lengths.slice(literalCount);
  const distances = distanceLengths.every(length => length === 0) ? [ 1, ...distanceLengths.slice(1) ] : distanceLengths;
  return [ literals, huffman(distances) ];
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16 | a) >>> 0;
}

function inflateZlib(bytes) {
  if (bytes.length < 6) throw new RangeError("Truncated zlib stream");
  const cmf = bytes[0];
  const flags = bytes[1];
  if ((cmf & 15) !== 8 || cmf >>> 4 > 7) throw new RangeError("Unsupported zlib method");
  if ((cmf << 8 | flags) % 31 !== 0) throw new RangeError("Invalid zlib header");
  if ((flags & 32) !== 0) throw new RangeError("Preset zlib dictionaries are unsupported");
  const reader = new BitReader(bytes.subarray(2, bytes.length - 4));
  const output = [];
  let final = false;
  while (!final) {
    final = reader.read(1) === 1;
    const type = reader.read(2);
    if (type === 0) {
      reader.align();
      const length = reader.read(8) | reader.read(8) << 8;
      const complement = reader.read(8) | reader.read(8) << 8;
      if (((length ^ 65535) & 65535) !== complement) {
        throw new RangeError("Invalid stored DEFLATE block length");
      }
      for (let index = 0; index < length; index++) output.push(reader.read(8));
    } else if (type === 1) {
      const [literals, distances] = fixedTables();
      compressedBlock(reader, output, literals, distances);
    } else if (type === 2) {
      const [literals, distances] = dynamicTables(reader);
      compressedBlock(reader, output, literals, distances);
    } else {
      throw new RangeError("Reserved DEFLATE block type");
    }
  }
  const expected = (bytes[bytes.length - 4] << 24 | bytes[bytes.length - 3] << 16 | bytes[bytes.length - 2] << 8 | bytes[bytes.length - 1]) >>> 0;
  if (adler32(output) !== expected) throw new RangeError("Invalid zlib checksum");
  return Uint8Array.from(output);
}

function readU32(bytes, offset) {
  return bytes[offset] * 16777216 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3] >>> 0;
}

function crc32(bytes, start, end) {
  let crc = 4294967295;
  for (let index = start; index < end; index++) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc >>> 1 ^ ((crc & 1) === 0 ? 0 : 3988292384);
    }
  }
  return (crc ^ 4294967295) >>> 0;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const dl = Math.abs(estimate - left);
  const da = Math.abs(estimate - above);
  const dul = Math.abs(estimate - upperLeft);
  return dl <= da && dl <= dul ? left : da <= dul ? above : upperLeft;
}

function unfilter(data, offset, width, height, bitsPerPixel) {
  const rowBytes = Math.ceil(width * bitsPerPixel / 8);
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rows = [];
  let cursor = offset;
  for (let y = 0; y < height; y++) {
    const filter = data[cursor++];
    if (filter === undefined || filter > 4) throw new RangeError(`Invalid PNG filter ${String(filter)}`);
    if (cursor + rowBytes > data.length) throw new RangeError("Truncated PNG scanline");
    const row = new Uint8Array(rowBytes);
    const above = rows[y - 1];
    for (let index = 0; index < rowBytes; index++) {
      const raw = data[cursor++];
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
      const upper = above?.[index] ?? 0;
      const upperLeft = index >= bytesPerPixel ? above?.[index - bytesPerPixel] ?? 0 : 0;
      let predictor = 0;
      if (filter === 1) predictor = left; else if (filter === 2) predictor = upper; else if (filter === 3) predictor = Math.floor((left + upper) / 2); else if (filter === 4) predictor = paeth(left, upper, upperLeft);
      row[index] = raw + predictor & 255;
    }
    rows.push(row);
  }
  return {
    rows,
    offset: cursor
  };
}

function sample(row, index, bitDepth) {
  if (bitDepth === 8) return row[index];
  if (bitDepth === 16) return row[index * 2] << 8 | row[index * 2 + 1];
  const perByte = 8 / bitDepth;
  const shift = (perByte - 1 - index % perByte) * bitDepth;
  return row[Math.floor(index / perByte)] >>> shift & (1 << bitDepth) - 1;
}

function sample8(value, bitDepth) {
  if (bitDepth === 16) return value >>> 8;
  if (bitDepth === 8) return value;
  return Math.round(value * 255 / ((1 << bitDepth) - 1));
}

function writePixels(target, row, passWidth, y, xStart, xStep, colorType, bitDepth, palette, transparency) {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  let hasAlpha = false;
  const transparentGray = transparency !== null && colorType === 0 ? transparency[0] << 8 | transparency[1] : -1;
  const transparentRgb = transparency !== null && colorType === 2 ? [ transparency[0] << 8 | transparency[1], transparency[2] << 8 | transparency[3], transparency[4] << 8 | transparency[5] ] : null;
  for (let x = 0; x < passWidth; x++) {
    const values = new Array(channels);
    for (let channel = 0; channel < channels; channel++) {
      values[channel] = sample(row, x * channels + channel, bitDepth);
    }
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 255;
    if (colorType === 0 || colorType === 4) {
      red = green = blue = sample8(values[0], bitDepth);
      if (colorType === 4) alpha = sample8(values[1], bitDepth); else if (values[0] === transparentGray) alpha = 0;
    } else if (colorType === 2 || colorType === 6) {
      red = sample8(values[0], bitDepth);
      green = sample8(values[1], bitDepth);
      blue = sample8(values[2], bitDepth);
      if (colorType === 6) alpha = sample8(values[3], bitDepth); else if (transparentRgb !== null && values[0] === transparentRgb[0] && values[1] === transparentRgb[1] && values[2] === transparentRgb[2]) alpha = 0;
    } else {
      const paletteIndex = values[0];
      const paletteOffset = paletteIndex * 3;
      if (palette === null || paletteOffset + 2 >= palette.length) {
        throw new RangeError(`PNG palette index ${paletteIndex} is out of range`);
      }
      red = palette[paletteOffset];
      green = palette[paletteOffset + 1];
      blue = palette[paletteOffset + 2];
      alpha = transparency?.[paletteIndex] ?? 255;
    }
    const offset = (y + xStart + x * xStep) * 4;
    target[offset] = red;
    target[offset + 1] = green;
    target[offset + 2] = blue;
    target[offset + 3] = alpha;
    if (alpha !== 255) hasAlpha = true;
  }
  return hasAlpha;
}

function passSize(size, start, step) {
  return size <= start ? 0 : Math.floor((size - start + step - 1) / step);
}

function decodePng(bytes) {
  const signature = [ 137, 80, 78, 71, 13, 10, 26, 10 ];
  if (bytes.length < 33 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw new TypeError("Invalid PNG signature");
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette = null;
  let transparency = null;
  const idat = [];
  let sawHeader = false;
  let sawEnd = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (dataEnd + 4 > bytes.length) throw new RangeError("Truncated PNG chunk");
    const typeCodes = bytes.subarray(offset + 4, offset + 8);
    let type = "";
    for (const code of typeCodes) type += String.fromCharCode(code);
    const expectedCrc = readU32(bytes, crcOffset);
    if (crc32(bytes, offset + 4, dataEnd) !== expectedCrc) {
      throw new RangeError(`Invalid PNG CRC for ${type}`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== 8) throw new RangeError("Invalid PNG IHDR");
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      if (width === 0 || height === 0) throw new RangeError("PNG dimensions must be positive");
      if (data[10] !== 0 || data[11] !== 0) throw new RangeError("Unsupported PNG compression or filter method");
      interlace = data[12];
      if (interlace !== 0 && interlace !== 1) throw new RangeError(`Unsupported PNG interlace method ${interlace}`);
      const validDepths = colorType === 0 ? [ 1, 2, 4, 8, 16 ] : colorType === 3 ? [ 1, 2, 4, 8 ] : [ 8, 16 ];
      if (![ 0, 2, 3, 4, 6 ].includes(colorType) || !validDepths.includes(bitDepth)) {
        throw new RangeError(`Unsupported PNG colour type ${colorType} at ${bitDepth} bits`);
      }
      sawHeader = true;
    } else if (type === "PLTE") {
      palette = data.slice();
    } else if (type === "tRNS") {
      transparency = data.slice();
    } else if (type === "IDAT") {
      for (const byte of data) idat.push(byte);
    } else if (type === "IEND") {
      sawEnd = true;
      offset = dataEnd + 4;
      break;
    } else if ((typeCodes[0] & 32) === 0) {
      throw new RangeError(`Unsupported critical PNG chunk ${type}`);
    }
    offset = dataEnd + 4;
  }
  if (!sawHeader || !sawEnd || idat.length === 0) throw new RangeError("Incomplete PNG file");
  if (colorType === 3 && palette === null) throw new RangeError("Indexed PNG has no palette");
  const inflated = inflateZlib(Uint8Array.from(idat));
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * bitDepth;
  const pixels = new Uint8Array(width * height * 4);
  pixels.fill(255);
  let cursor = 0;
  let hasAlpha = false;
  if (interlace === 0) {
    const decoded = unfilter(inflated, cursor, width, height, bitsPerPixel);
    cursor = decoded.offset;
    for (let y = 0; y < height; y++) {
      hasAlpha = writePixels(pixels, decoded.rows[y], width, y * width, 0, 1, colorType, bitDepth, palette, transparency) || hasAlpha;
    }
  } else {
    const startsX = [ 0, 4, 0, 2, 0, 1, 0 ];
    const startsY = [ 0, 0, 4, 0, 2, 0, 1 ];
    const stepsX = [ 8, 8, 4, 4, 2, 2, 1 ];
    const stepsY = [ 8, 8, 8, 4, 4, 2, 2 ];
    for (let pass = 0; pass < 7; pass++) {
      const passWidth = passSize(width, startsX[pass], stepsX[pass]);
      const passHeight = passSize(height, startsY[pass], stepsY[pass]);
      if (passWidth === 0 || passHeight === 0) continue;
      const decoded = unfilter(inflated, cursor, passWidth, passHeight, bitsPerPixel);
      cursor = decoded.offset;
      for (let row = 0; row < passHeight; row++) {
        const targetY = startsY[pass] + row * stepsY[pass];
        hasAlpha = writePixels(pixels, decoded.rows[row], passWidth, targetY * width, startsX[pass], stepsX[pass], colorType, bitDepth, palette, transparency) || hasAlpha;
      }
    }
  }
  if (cursor !== inflated.length) throw new RangeError("PNG scanline data has trailing bytes");
  return {
    width,
    height,
    pixels,
    hasAlpha
  };
}

const SOF_MARKERS = Object.freeze([ 192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207 ]);

function u16(bytes, offset) {
  const high = bytes[offset];
  const low = bytes[offset + 1];
  if (high === undefined || low === undefined) throw new RangeError("Truncated JPEG segment");
  return high << 8 | low;
}

function parseJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216) {
    throw new TypeError("Invalid JPEG start marker");
  }
  let offset = 2;
  let width = 0;
  let height = 0;
  let bitsPerComponent = 0;
  let components = 0;
  let adobeTransform = null;
  let foundBaseline = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 255) throw new RangeError(`Invalid JPEG marker at offset ${offset}`);
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) throw new RangeError("Truncated JPEG marker");
    if (marker === 217 || marker === 218) break;
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) continue;
    const length = u16(bytes, offset);
    if (length < 2) throw new RangeError(`Invalid JPEG segment length ${length}`);
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (dataEnd > bytes.length) throw new RangeError("Truncated JPEG segment");
    if (SOF_MARKERS.includes(marker)) {
      if (marker !== 192) throw new RangeError("Only baseline JPEG images are supported");
      if (length < 8) throw new RangeError("Truncated JPEG baseline frame");
      bitsPerComponent = bytes[dataStart];
      height = u16(bytes, dataStart + 1);
      width = u16(bytes, dataStart + 3);
      components = bytes[dataStart + 5];
      const expectedLength = 8 + components * 3;
      if (length < expectedLength) throw new RangeError("Truncated JPEG component table");
      foundBaseline = true;
    } else if (marker === 238 && length >= 14 && bytes[dataStart] === 65 && bytes[dataStart + 1] === 100 && bytes[dataStart + 2] === 111 && bytes[dataStart + 3] === 98 && bytes[dataStart + 4] === 101) {
      adobeTransform = bytes[dataStart + 11];
    }
    offset = dataEnd;
  }
  if (!foundBaseline) throw new RangeError("Unable to find a baseline JPEG frame");
  if (width <= 0 || height <= 0) throw new RangeError("JPEG dimensions must be positive");
  if (bitsPerComponent !== 8) throw new RangeError(`Unsupported JPEG precision ${bitsPerComponent}`);
  const colorSpace = components === 1 ? "gray" : components === 3 ? "rgb" : components === 4 ? "cmyk" : null;
  if (colorSpace === null) throw new RangeError(`Unsupported JPEG component count ${components}`);
  return {
    width,
    height,
    bitsPerComponent,
    components,
    colorSpace,
    inverted: colorSpace === "cmyk" && adobeTransform !== 0
  };
}

class PdfXObject extends PdfObjectStream {
  constructor(document, subtype, data = new Uint8Array(0)) {
    super(document, data);
    this.params.set("/Type", new PdfName("/XObject"));
    if (subtype !== null) this.params.set("/Subtype", new PdfName(subtype));
  }
  get name() {
    return `/X${this.objser}`;
  }
}

class PdfImage {
  constructor(options) {
    const encoded = "jpeg" in options;
    const width = encoded ? options.info.width : options.width;
    const height = encoded ? options.info.height : options.height;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("Image dimensions must be positive integers");
    }
    if (!encoded && options.pixels.length !== width * height * 4) {
      throw new RangeError(`RGBA image needs ${width * height * 4} bytes, received ${options.pixels.length}`);
    }
    this.pixels = encoded ? null : options.pixels.slice();
    this.jpeg = encoded ? options.jpeg.slice() : null;
    this.jpegInfo = encoded ? options.info : null;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.hasAlpha = encoded ? false : Boolean(options.hasAlpha ?? true);
    this.orientation = options.orientation ?? "topLeft";
  }
  static fromPng(bytes, orientation = "topLeft") {
    const decoded = decodePng(bytes);
    return new PdfImage({
      ...decoded,
      orientation
    });
  }
  static fromJpeg(bytes, orientation = "topLeft") {
    return new PdfImage({
      jpeg: bytes,
      info: parseJpeg(bytes),
      orientation
    });
  }
  get width() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceHeight : this.sourceWidth;
  }
  get height() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceWidth : this.sourceHeight;
  }
}

class PdfImageObject extends PdfXObject {
  constructor(document, image, channel) {
    const jpeg = image.jpeg;
    let data;
    if (jpeg !== null) {
      if (channel === "alpha") throw new RangeError("A JPEG image has no separate alpha channel");
      data = jpeg;
    } else {
      const pixels = image.pixels;
      const pixelCount = image.sourceWidth * image.sourceHeight;
      data = new Uint8Array(pixelCount * (channel === "rgb" ? 3 : 1));
      for (let index = 0; index < pixelCount; index++) {
        if (channel === "rgb") {
          data[index * 3] = pixels[index * 4];
          data[index * 3 + 1] = pixels[index * 4 + 1];
          data[index * 3 + 2] = pixels[index * 4 + 2];
        } else {
          data[index] = pixels[index * 4 + 3];
        }
      }
    }
    super(document, "/Image", data);
    this.params.set("/Width", new PdfNum(image.sourceWidth));
    this.params.set("/Height", new PdfNum(image.sourceHeight));
    this.params.set("/BitsPerComponent", new PdfNum(8));
    const info = image.jpegInfo;
    if (info !== null) {
      this.params.set("/Intent", new PdfName("/RelativeColorimetric"));
      this.params.set("/Filter", new PdfName("/DCTDecode"));
      this.params.set("/ColorSpace", new PdfName(info.colorSpace === "gray" ? "/DeviceGray" : info.colorSpace === "cmyk" ? "/DeviceCMYK" : "/DeviceRGB"));
      if (info.inverted) this.params.set("/Decode", PdfArray.fromNum([ 1, 0, 1, 0, 1, 0, 1, 0 ]));
    } else {
      this.params.set("/ColorSpace", new PdfName(channel === "rgb" ? "/DeviceRGB" : "/DeviceGray"));
    }
  }
  setSoftMask(mask) {
    this.params.set("/SMask", mask.ref());
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

function constraintNumber(value, name) {
  if (Number.isNaN(value) || value < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
  return value;
}

function clampConstraint(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

class BoxConstraints {
  constructor({minWidth = 0, maxWidth = Infinity, minHeight = 0, maxHeight = Infinity} = {}) {
    this.minWidth = constraintNumber(Number(minWidth), "minWidth");
    this.maxWidth = constraintNumber(Number(maxWidth), "maxWidth");
    this.minHeight = constraintNumber(Number(minHeight), "minHeight");
    this.maxHeight = constraintNumber(Number(maxHeight), "maxHeight");
    if (this.minWidth > this.maxWidth || this.minHeight > this.maxHeight) {
      throw new RangeError("BoxConstraints minimums must not exceed maximums");
    }
  }
  static from(value) {
    return value instanceof BoxConstraints ? value : new BoxConstraints(value);
  }
  static tightFor({width = null, height = null} = {}) {
    return new BoxConstraints({
      minWidth: width ?? 0,
      maxWidth: width ?? Infinity,
      minHeight: height ?? 0,
      maxHeight: height ?? Infinity
    });
  }
  static tight(size) {
    return new BoxConstraints({
      minWidth: size.width,
      maxWidth: size.width,
      minHeight: size.height,
      maxHeight: size.height
    });
  }
  static expand({width = Infinity, height = Infinity} = {}) {
    return BoxConstraints.tightFor({
      width,
      height
    });
  }
  static tightForFinite({width = Infinity, height = Infinity} = {}) {
    return BoxConstraints.tightFor({
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null
    });
  }
  get hasBoundedWidth() {
    return Number.isFinite(this.maxWidth);
  }
  get hasBoundedHeight() {
    return Number.isFinite(this.maxHeight);
  }
  get hasInfiniteWidth() {
    return !Number.isFinite(this.minWidth);
  }
  get hasInfiniteHeight() {
    return !Number.isFinite(this.minHeight);
  }
  get hasTightWidth() {
    return this.minWidth >= this.maxWidth;
  }
  get hasTightHeight() {
    return this.minHeight >= this.maxHeight;
  }
  get isTight() {
    return this.hasTightWidth && this.hasTightHeight;
  }
  get biggest() {
    return {
      width: this.constrainWidth(),
      height: this.constrainHeight()
    };
  }
  get smallest() {
    return {
      width: this.constrainWidth(0),
      height: this.constrainHeight(0)
    };
  }
  constrainWidth(width = Infinity) {
    return clampConstraint(width, this.minWidth, this.maxWidth);
  }
  constrainHeight(height = Infinity) {
    return clampConstraint(height, this.minHeight, this.maxHeight);
  }
  constrain(size) {
    return {
      width: this.constrainWidth(size.width),
      height: this.constrainHeight(size.height)
    };
  }
  constrainSizeAndAttemptToPreserveAspectRatio(size) {
    if (this.isTight) return this.smallest;
    if (size.width <= 0 || size.height <= 0) return this.constrain(size);
    const ratio = size.width / size.height;
    let width = size.width;
    let height = size.height;
    if (width > this.maxWidth) {
      width = this.maxWidth;
      height = width / ratio;
    }
    if (height > this.maxHeight) {
      height = this.maxHeight;
      width = height * ratio;
    }
    if (width < this.minWidth) {
      width = this.minWidth;
      height = width / ratio;
    }
    if (height < this.minHeight) {
      height = this.minHeight;
      width = height * ratio;
    }
    return this.constrain({
      width,
      height
    });
  }
  tighten({width = null, height = null} = {}) {
    const tightWidth = width === null ? null : clampConstraint(width, this.minWidth, this.maxWidth);
    const tightHeight = height === null ? null : clampConstraint(height, this.minHeight, this.maxHeight);
    return new BoxConstraints({
      minWidth: tightWidth ?? this.minWidth,
      maxWidth: tightWidth ?? this.maxWidth,
      minHeight: tightHeight ?? this.minHeight,
      maxHeight: tightHeight ?? this.maxHeight
    });
  }
  deflate(edges) {
    const insets = normalizeInsets(edges);
    const horizontal = insetsHorizontal(insets);
    const vertical = insetsVertical(insets);
    const minWidth = Math.max(0, this.minWidth - horizontal);
    const minHeight = Math.max(0, this.minHeight - vertical);
    return new BoxConstraints({
      minWidth,
      maxWidth: Math.max(minWidth, this.maxWidth - horizontal),
      minHeight,
      maxHeight: Math.max(minHeight, this.maxHeight - vertical)
    });
  }
  loosen() {
    return new BoxConstraints({
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight
    });
  }
  enforce(other) {
    const constraints = BoxConstraints.from(other);
    return new BoxConstraints({
      minWidth: clampConstraint(this.minWidth, constraints.minWidth, constraints.maxWidth),
      maxWidth: clampConstraint(this.maxWidth, constraints.minWidth, constraints.maxWidth),
      minHeight: clampConstraint(this.minHeight, constraints.minHeight, constraints.maxHeight),
      maxHeight: clampConstraint(this.maxHeight, constraints.minHeight, constraints.maxHeight)
    });
  }
  copyWith(values = {}) {
    return new BoxConstraints({
      minWidth: values.minWidth ?? this.minWidth,
      maxWidth: values.maxWidth ?? this.maxWidth,
      minHeight: values.minHeight ?? this.minHeight,
      maxHeight: values.maxHeight ?? this.maxHeight
    });
  }
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
  const all = value.all;
  return {
    top: Number(value.top ?? value.vertical ?? all ?? 0),
    right: Number(value.right ?? value.horizontal ?? all ?? 0),
    bottom: Number(value.bottom ?? value.vertical ?? all ?? 0),
    left: Number(value.left ?? value.horizontal ?? all ?? 0)
  };
}

function edgeInsetsConstructor(value = 0) {
  return normalizeInsets(value);
}

const EdgeInsets = Object.freeze(Object.assign(edgeInsetsConstructor, {
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
}));

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

class SpanningWidget extends Widget {
  constructor() {
    super(...arguments);
    this.canSpan = true;
  }
}

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
    const parent = BoxConstraints.from(constraints);
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);
    if (this.child === null) {
      const size = parent.constrain({
        width: horizontal,
        height: vertical
      });
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          childBox: null
        }
      };
    }
    const childBox = this.child.layout(context, parent.deflate(this.padding));
    const size = parent.constrain({
      width: childBox.width + horizontal,
      height: childBox.height + vertical
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
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
    const parent = BoxConstraints.from(constraints);
    const shrinkWidth = this.widthFactor !== null || !parent.hasBoundedWidth;
    const shrinkHeight = this.heightFactor !== null || !parent.hasBoundedHeight;
    if (this.child === null) {
      const size = parent.constrain({
        width: shrinkWidth ? 0 : Infinity,
        height: shrinkHeight ? 0 : Infinity
      });
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          childBox: null,
          dx: 0,
          dy: 0
        }
      };
    }
    const childBox = this.child.layout(context, parent.loosen());
    const size = parent.constrain({
      width: shrinkWidth ? childBox.width * (this.widthFactor ?? 1) : Infinity,
      height: shrinkHeight ? childBox.height * (this.heightFactor ?? 1) : Infinity
    });
    const offset = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
    return {
      widget: this,
      width: size.width,
      height: size.height,
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

class ConstrainedBox extends Widget {
  constructor({constraints, child = null}) {
    super();
    this.constraints = BoxConstraints.from(constraints);
    this.child = child;
  }
  layout(context, constraints) {
    const enforced = this.constraints.enforce(BoxConstraints.from(constraints));
    const childBox = this.child?.layout(context, enforced) ?? null;
    const size = childBox === null ? enforced.smallest : enforced.constrain(childBox);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
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
    const tight = BoxConstraints.from(constraints).tighten({
      width: this.width,
      height: this.height
    });
    const childBox = this.child === null ? null : this.child.layout(context, tight);
    const size = childBox === null ? tight.smallest : tight.constrain(childBox);
    return {
      widget: this,
      width: size.width,
      height: size.height,
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
    const size = BoxConstraints.from(constraints).constrain({
      width: Infinity,
      height: this.height
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    const width = Math.max(0, box.width - this.indent - this.endIndent);
    if (width === 0 || this.thickness === 0) return;
    context.canvas.fillRect(box.x + this.indent, box.y + (box.height - this.thickness) / 2, width, this.thickness, this.color);
  }
}

function resolveBasicAlignment(value) {
  if (typeof value !== "string") return value;
  const result = Alignment[value];
  if (result === undefined) throw new TypeError(`Unknown alignment: ${value}`);
  return result;
}

function finiteMatrix(value) {
  const values = value.map((entry, index) => assertFiniteNumber(Number(entry), `transform[${index}]`));
  if (values.length !== 6) throw new TypeError("transform must contain six numbers");
  return [ values[0], values[1], values[2], values[3], values[4], values[5] ];
}

function pointCoordinates(value) {
  if (value === null) return {
    x: 0,
    y: 0
  };
  if ("dx" in value) return {
    x: value.dx,
    y: value.dy
  };
  return value;
}

class Transform extends Widget {
  constructor({transform = null, rotate = null, rotateBox = null, translate = null, scale = null, origin = null, alignment = undefined, adjustLayout = false, unconstrained = false, child = null} = {}) {
    super();
    const transformCount = [ transform, rotate, rotateBox, translate, scale ].filter(value => value !== null).length;
    if (transformCount > 1) {
      throw new TypeError("Transform accepts one transform, rotate, rotateBox, translate or scale");
    }
    if (transform !== null) {
      this.transform = finiteMatrix(transform);
    } else if (rotateBox !== null) {
      this.transform = rotationMatrix(-assertFiniteNumber(Number(rotateBox), "rotateBox"));
    } else if (rotate !== null) {
      this.transform = rotationMatrix(-assertFiniteNumber(Number(rotate), "rotate"));
    } else if (translate !== null) {
      const offset = pointCoordinates(translate);
      this.transform = translationMatrix(offset.x, offset.y);
    } else if (scale !== null) {
      this.transform = scaleMatrix(assertFiniteNumber(Number(scale), "scale"));
    } else {
      this.transform = identityMatrix;
    }
    this.origin = pointCoordinates(origin);
    const defaultAlignment = rotate !== null || scale !== null ? Alignment.center : null;
    this.alignment = alignment === undefined ? defaultAlignment : alignment === null ? null : resolveBasicAlignment(alignment);
    this.adjustLayout = rotateBox !== null ? true : Boolean(adjustLayout);
    this.unconstrained = Boolean(unconstrained);
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    if (this.child === null) {
      const size = parent.smallest;
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          childBox: null,
          layoutDx: 0,
          layoutDy: 0
        }
      };
    }
    const childBox = this.child.layout(context, this.adjustLayout && this.unconstrained ? new BoxConstraints : parent);
    if (!this.adjustLayout) {
      const size = parent.constrain(childBox);
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          childBox,
          layoutDx: 0,
          layoutDy: 0
        }
      };
    }
    const corners = [ transformPoint(this.transform, 0, 0), transformPoint(this.transform, childBox.width, 0), transformPoint(this.transform, childBox.width, childBox.height), transformPoint(this.transform, 0, childBox.height) ];
    const minimumX = Math.min(...corners.map(point => point.x));
    const maximumX = Math.max(...corners.map(point => point.x));
    const minimumY = Math.min(...corners.map(point => point.y));
    const maximumY = Math.max(...corners.map(point => point.y));
    const size = parent.constrain({
      width: maximumX - minimumX,
      height: maximumY - minimumY
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox,
        layoutDx: -minimumX,
        layoutDy: -minimumY
      }
    };
  }
  paint(context, box) {
    const {childBox, layoutDx, layoutDy} = box.data;
    if (childBox === null) return;
    let widgetMatrix;
    if (this.adjustLayout) {
      widgetMatrix = multiplyMatrix(translationMatrix(box.x + layoutDx, box.y + layoutDy), multiplyMatrix(this.transform, translationMatrix(-box.x, -box.y)));
    } else {
      const alignedX = this.alignment === null ? 0 : (this.alignment.x + 1) * box.width / 2;
      const alignedY = this.alignment === null ? 0 : (1 - this.alignment.y) * box.height / 2;
      const anchorX = box.x + alignedX + this.origin.x;
      const anchorY = box.y + alignedY + this.origin.y;
      widgetMatrix = multiplyMatrix(translationMatrix(anchorX, anchorY), multiplyMatrix(this.transform, translationMatrix(-anchorX, -anchorY)));
    }
    context.canvas.saveContext();
    context.canvas.setTransform(flipMatrix(widgetMatrix, context.canvas.pageHeight));
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    context.canvas.restoreContext();
  }
}

class Opacity extends Widget {
  constructor({opacity, child = null}) {
    super();
    const value = assertFiniteNumber(Number(opacity), "opacity");
    if (value < 0 || value > 1) throw new RangeError("opacity must be between 0 and 1");
    this.opacity = value;
    this.child = child;
  }
  layout(context, constraints) {
    const childBox = this.child?.layout(context, constraints) ?? null;
    const size = BoxConstraints.from(constraints).constrain(childBox ?? {
      width: 0,
      height: 0
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null || this.opacity === 0 && childBox.width === 0 && childBox.height === 0) return;
    context.canvas.saveContext();
    context.canvas.setGraphicState(new PdfGraphicState({
      opacity: this.opacity
    }));
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    context.canvas.restoreContext();
  }
}

function applyBoxFit$1(fit, input, output) {
  const {width: iw, height: ih} = input;
  const {width: ow, height: oh} = output;
  if (iw <= 0 || ih <= 0 || ow <= 0 || oh <= 0) {
    const zero = {
      width: 0,
      height: 0
    };
    return {
      source: zero,
      destination: zero
    };
  }
  if (fit === "fill") return {
    source: input,
    destination: output
  };
  if (fit === "contain" || fit === "scaleDown") {
    const factor = Math.min(fit === "scaleDown" ? 1 : Number.POSITIVE_INFINITY, ow / iw, oh / ih);
    return {
      source: input,
      destination: {
        width: iw * factor,
        height: ih * factor
      }
    };
  }
  if (fit === "cover") {
    const factor = Math.max(ow / iw, oh / ih);
    return {
      source: {
        width: ow / factor,
        height: oh / factor
      },
      destination: output
    };
  }
  if (fit === "fitWidth") {
    const factor = ow / iw;
    const height = ih * factor;
    return height > oh ? {
      source: {
        width: iw,
        height: oh / factor
      },
      destination: output
    } : {
      source: input,
      destination: {
        width: ow,
        height
      }
    };
  }
  if (fit === "fitHeight") {
    const factor = oh / ih;
    const width = iw * factor;
    return width > ow ? {
      source: {
        width: ow / factor,
        height: ih
      },
      destination: output
    } : {
      source: input,
      destination: {
        width,
        height: oh
      }
    };
  }
  if (fit === "none") {
    const value = {
      width: Math.min(iw, ow),
      height: Math.min(ih, oh)
    };
    return {
      source: value,
      destination: value
    };
  }
  throw new TypeError(`Unknown BoxFit: ${fit}`);
}

class FittedBox extends Widget {
  constructor({fit = "contain", alignment = "center", child = null} = {}) {
    super();
    applyBoxFit$1(fit, {
      width: 1,
      height: 1
    }, {
      width: 1,
      height: 1
    });
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    if (this.child === null) {
      const size = parent.smallest;
      return {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          childBox: null
        }
      };
    }
    const childBox = this.child.layout(context, new BoxConstraints);
    const size = parent.constrainSizeAndAttemptToPreserveAspectRatio(childBox);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null || childBox.width <= 0 || childBox.height <= 0) return;
    const fitted = applyBoxFit$1(this.fit, {
      width: childBox.width,
      height: childBox.height
    }, {
      width: box.width,
      height: box.height
    });
    if (fitted.source.width <= 0 || fitted.source.height <= 0) return;
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, childBox.width, childBox.height);
    const destinationOffset = inscribe(this.alignment, fitted.destination.width, fitted.destination.height, box.width, box.height);
    const scaleX = fitted.destination.width / fitted.source.width;
    const scaleY = fitted.destination.height / fitted.source.height;
    const widgetMatrix = multiplyMatrix(translationMatrix(box.x + destinationOffset.dx, box.y + destinationOffset.dy), multiplyMatrix(scaleMatrix(scaleX, scaleY), translationMatrix(-box.x - sourceOffset.dx, -box.y - sourceOffset.dy)));
    context.canvas.saveContext();
    context.canvas.drawRect(box.x, context.canvas.pageHeight - box.y - box.height, box.width, box.height);
    context.canvas.clipPath();
    context.canvas.setTransform(flipMatrix(widgetMatrix, context.canvas.pageHeight));
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    context.canvas.restoreContext();
  }
}

class AspectRatio extends Widget {
  constructor({aspectRatio, child = null}) {
    super();
    const value = assertFiniteNumber(Number(aspectRatio), "aspectRatio");
    if (value <= 0) throw new RangeError("aspectRatio must be greater than zero");
    this.aspectRatio = value;
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    let size;
    if (parent.isTight) {
      size = parent.smallest;
    } else {
      let width = parent.maxWidth;
      let height;
      if (Number.isFinite(width)) {
        height = width / this.aspectRatio;
      } else {
        height = parent.maxHeight;
        width = height * this.aspectRatio;
      }
      if (width > parent.maxWidth) {
        width = parent.maxWidth;
        height = width / this.aspectRatio;
      }
      if (height > parent.maxHeight) {
        height = parent.maxHeight;
        width = height * this.aspectRatio;
      }
      if (width < parent.minWidth) {
        width = parent.minWidth;
        height = width / this.aspectRatio;
      }
      if (height < parent.minHeight) {
        height = parent.minHeight;
        width = height * this.aspectRatio;
      }
      size = parent.constrain({
        width,
        height
      });
    }
    const childBox = this.child?.layout(context, BoxConstraints.tight(size)) ?? null;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class Builder extends StatelessWidget {
  constructor({builder}) {
    super();
    if (typeof builder !== "function") throw new TypeError("Builder.builder must be a function");
    this.builder = builder;
  }
  build(context) {
    return this.builder(context);
  }
}

class LayoutBuilder extends Widget {
  constructor({builder}) {
    super();
    if (typeof builder !== "function") throw new TypeError("LayoutBuilder.builder must be a function");
    this.builder = builder;
  }
  layout(context, constraints) {
    const childBox = this.builder(context, constraints).layout(context, constraints);
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

class CustomPaint extends Widget {
  constructor({painter = null, foregroundPainter = null, size = {
    x: 0,
    y: 0
  }, child = null} = {}) {
    super();
    this.painter = painter;
    this.foregroundPainter = foregroundPainter;
    this.size = size;
    this.child = child;
  }
  layout(context, constraints) {
    const childBox = this.child?.layout(context, constraints) ?? null;
    const size = BoxConstraints.from(constraints).constrain(childBox ?? {
      width: Math.max(0, this.size.x),
      height: Math.max(0, this.size.y)
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paintWithLocalCanvas(context, box, painter) {
    context.canvas.saveContext();
    context.canvas.setTransform([ 1, 0, 0, 1, box.x, context.canvas.pageHeight - box.y - box.height ]);
    painter(context.canvas, {
      x: box.width,
      y: box.height
    });
    context.canvas.restoreContext();
  }
  paint(context, box) {
    if (this.painter !== null) this.paintWithLocalCanvas(context, box, this.painter);
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    if (this.foregroundPainter !== null) {
      this.paintWithLocalCanvas(context, box, this.foregroundPainter);
    }
  }
}

class FullPage extends Widget {
  constructor({ignoreMargins, child = null}) {
    super();
    this.ignoreMargins = Boolean(ignoreMargins);
    this.child = child;
  }
  layout(context, constraints) {
    const page = BoxConstraints.tight({
      width: context.pageFormat.width,
      height: context.pageFormat.height
    });
    const offered = this.ignoreMargins ? page : BoxConstraints.from(constraints);
    const size = offered.biggest;
    const childBox = this.child?.layout(context, offered) ?? null;
    const width = size.width;
    const height = size.height;
    return {
      widget: this,
      width,
      height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null) return;
    const inverse = this.ignoreMargins ? context.canvas.getTransform() : identityMatrix;
    context.canvas.saveContext();
    if (this.ignoreMargins) {
      const determinant = inverse[0] * inverse[3] - inverse[1] * inverse[2];
      if (determinant !== 0) {
        context.canvas.setTransform([ inverse[3] / determinant, -inverse[1] / determinant, -inverse[2] / determinant, inverse[0] / determinant, (inverse[2] * inverse[5] - inverse[3] * inverse[4]) / determinant, (inverse[1] * inverse[4] - inverse[0] * inverse[5]) / determinant ]);
      }
    }
    childBox.widget.paint(context, {
      ...childBox,
      x: this.ignoreMargins ? 0 : box.x,
      y: this.ignoreMargins ? 0 : box.y,
      width: box.width,
      height: box.height
    });
    context.canvas.restoreContext();
  }
}

class LimitedBox extends Widget {
  constructor({maxWidth = Number.POSITIVE_INFINITY, maxHeight = Number.POSITIVE_INFINITY, child = null} = {}) {
    super();
    this.maxWidth = Number(maxWidth);
    this.maxHeight = Number(maxHeight);
    if (this.maxWidth < 0 || this.maxHeight < 0 || Number.isNaN(this.maxWidth) || Number.isNaN(this.maxHeight)) {
      throw new RangeError("LimitedBox maxima must be non-negative numbers");
    }
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const limited = new BoxConstraints({
      minWidth: parent.minWidth,
      maxWidth: parent.hasBoundedWidth ? parent.maxWidth : parent.constrainWidth(this.maxWidth),
      minHeight: parent.minHeight,
      maxHeight: parent.hasBoundedHeight ? parent.maxHeight : parent.constrainHeight(this.maxHeight)
    });
    const childBox = this.child?.layout(context, limited) ?? null;
    const size = parent.constrain(childBox ?? limited.smallest);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class OverflowBox extends Widget {
  constructor({alignment = "center", minWidth = null, maxWidth = null, minHeight = null, maxHeight = null, child = null} = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
    this.minWidth = minWidth === null ? null : Number(minWidth);
    this.maxWidth = maxWidth === null ? null : Number(maxWidth);
    this.minHeight = minHeight === null ? null : Number(minHeight);
    this.maxHeight = maxHeight === null ? null : Number(maxHeight);
    this.child = child;
    new BoxConstraints({
      minWidth: this.minWidth ?? 0,
      maxWidth: this.maxWidth ?? Infinity,
      minHeight: this.minHeight ?? 0,
      maxHeight: this.maxHeight ?? Infinity
    });
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const size = parent.smallest;
    const childBox = this.child?.layout(context, new BoxConstraints({
      minWidth: this.minWidth ?? parent.minWidth,
      maxWidth: this.maxWidth ?? parent.maxWidth,
      minHeight: this.minHeight ?? parent.minHeight,
      maxHeight: this.maxHeight ?? parent.maxHeight
    })) ?? null;
    const offset = childBox === null ? {
      dx: 0,
      dy: 0
    } : inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox,
        dx: offset.dx,
        dy: offset.dy
      }
    };
  }
  paint(context, box) {
    const {childBox, dx, dy} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x + dx,
      y: box.y + dy
    });
  }
}

class VerticalDivider extends Widget {
  constructor({width = DEFAULT_DIVIDER_HEIGHT, thickness = DEFAULT_DIVIDER_THICKNESS, indent = 0, endIndent = 0, color = "#000000"} = {}) {
    super();
    this.width = Math.max(0, assertFiniteNumber(Number(width), "divider width"));
    this.thickness = Math.max(0, assertFiniteNumber(Number(thickness), "divider thickness"));
    this.indent = Math.max(0, assertFiniteNumber(Number(indent), "divider indent"));
    this.endIndent = Math.max(0, assertFiniteNumber(Number(endIndent), "divider endIndent"));
    this.color = normalizeColor(color);
  }
  layout(_context, constraints) {
    const size = BoxConstraints.from(constraints).constrain({
      width: this.width,
      height: Infinity
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    const height = Math.max(0, box.height - this.indent - this.endIndent);
    if (height === 0 || this.thickness === 0) return;
    context.canvas.fillRect(box.x + (box.width - this.thickness) / 2, box.y + this.indent, this.thickness, height, this.color);
  }
}

class Radius {
  constructor(x, y = x) {
    this.x = Math.max(0, Number(x));
    this.y = Math.max(0, Number(y));
  }
  static circular(radius) {
    return new Radius(radius);
  }
  static elliptical(x, y) {
    return new Radius(x, y);
  }
  equals(other) {
    return this.x === other.x && this.y === other.y;
  }
}

Radius.zero = new Radius(0, 0);

function radius(value = Radius.zero) {
  if (typeof value === "number") return Radius.circular(value);
  if (value instanceof Radius) return value;
  return new Radius(value.x, value.y ?? value.x);
}

class BorderRadiusGeometry {}

class BorderRadius extends BorderRadiusGeometry {
  constructor({topLeft = Radius.zero, topRight = Radius.zero, bottomLeft = Radius.zero, bottomRight = Radius.zero} = {}) {
    super();
    this.topLeft = radius(topLeft);
    this.topRight = radius(topRight);
    this.bottomLeft = radius(bottomLeft);
    this.bottomRight = radius(bottomRight);
  }
  static all(value) {
    const resolved = radius(value);
    return new BorderRadius({
      topLeft: resolved,
      topRight: resolved,
      bottomLeft: resolved,
      bottomRight: resolved
    });
  }
  static circular(value) {
    return BorderRadius.all(value);
  }
  static vertical({top = Radius.zero, bottom = Radius.zero} = {}) {
    return new BorderRadius({
      topLeft: top,
      topRight: top,
      bottomLeft: bottom,
      bottomRight: bottom
    });
  }
  static horizontal({left = Radius.zero, right = Radius.zero} = {}) {
    return new BorderRadius({
      topLeft: left,
      bottomLeft: left,
      topRight: right,
      bottomRight: right
    });
  }
  static only(options = {}) {
    return new BorderRadius(options);
  }
  get isUniform() {
    return this.topLeft.equals(this.topRight) && this.topLeft.equals(this.bottomLeft) && this.topLeft.equals(this.bottomRight);
  }
  get uniform() {
    return this.isUniform ? this.topLeft : Radius.zero;
  }
  resolve() {
    return this;
  }
  paint(canvas, x, top, width, height) {
    const bottom = canvas.pageHeight - top - height;
    const scale = Math.min(1, width / Math.max(1, this.topLeft.x + this.topRight.x, this.bottomLeft.x + this.bottomRight.x), height / Math.max(1, this.topLeft.y + this.bottomLeft.y, this.topRight.y + this.bottomRight.y));
    const tl = new Radius(this.topLeft.x * scale, this.topLeft.y * scale);
    const tr = new Radius(this.topRight.x * scale, this.topRight.y * scale);
    const bl = new Radius(this.bottomLeft.x * scale, this.bottomLeft.y * scale);
    const br = new Radius(this.bottomRight.x * scale, this.bottomRight.y * scale);
    const m4 = .551784;
    canvas.moveTo(x, bottom + bl.y);
    canvas.curveTo(x, bottom + bl.y * (1 - m4), x + bl.x * (1 - m4), bottom, x + bl.x, bottom);
    canvas.lineTo(x + width - br.x, bottom);
    canvas.curveTo(x + width - br.x * (1 - m4), bottom, x + width, bottom + br.y * (1 - m4), x + width, bottom + br.y);
    canvas.lineTo(x + width, bottom + height - tr.y);
    canvas.curveTo(x + width, bottom + height - tr.y * (1 - m4), x + width - tr.x * (1 - m4), bottom + height, x + width - tr.x, bottom + height);
    canvas.lineTo(x + tl.x, bottom + height);
    canvas.curveTo(x + tl.x * (1 - m4), bottom + height, x, bottom + height - tl.y * (1 - m4), x, bottom + height - tl.y);
    canvas.lineTo(x, bottom + bl.y);
    canvas.closePath();
  }
}

BorderRadius.zero = BorderRadius.all(0);

class BorderRadiusDirectional extends BorderRadiusGeometry {
  constructor({topStart = Radius.zero, topEnd = Radius.zero, bottomStart = Radius.zero, bottomEnd = Radius.zero} = {}) {
    super();
    this.topStart = radius(topStart);
    this.topEnd = radius(topEnd);
    this.bottomStart = radius(bottomStart);
    this.bottomEnd = radius(bottomEnd);
  }
  static all(value) {
    const resolved = radius(value);
    return new BorderRadiusDirectional({
      topStart: resolved,
      topEnd: resolved,
      bottomStart: resolved,
      bottomEnd: resolved
    });
  }
  static circular(value) {
    return BorderRadiusDirectional.all(value);
  }
  static vertical({top = Radius.zero, bottom = Radius.zero} = {}) {
    return new BorderRadiusDirectional({
      topStart: top,
      topEnd: top,
      bottomStart: bottom,
      bottomEnd: bottom
    });
  }
  static horizontal({start = Radius.zero, end = Radius.zero} = {}) {
    return new BorderRadiusDirectional({
      topStart: start,
      bottomStart: start,
      topEnd: end,
      bottomEnd: end
    });
  }
  static only(options = {}) {
    return new BorderRadiusDirectional(options);
  }
  get isUniform() {
    return this.topStart.equals(this.topEnd) && this.topStart.equals(this.bottomStart) && this.topStart.equals(this.bottomEnd);
  }
  get uniform() {
    return this.isUniform ? this.topStart : Radius.zero;
  }
  resolve(direction = "ltr") {
    if (direction === "rtl") {
      return new BorderRadius({
        topLeft: this.topEnd,
        topRight: this.topStart,
        bottomLeft: this.bottomEnd,
        bottomRight: this.bottomStart
      });
    }
    return new BorderRadius({
      topLeft: this.topStart,
      topRight: this.topEnd,
      bottomLeft: this.bottomStart,
      bottomRight: this.bottomEnd
    });
  }
}

BorderRadiusDirectional.zero = BorderRadiusDirectional.all(0);

class BorderStyle {
  constructor({paint = true, pattern = null, phase = 0} = {}) {
    this.paint = Boolean(paint);
    this.pattern = pattern === null ? null : pattern.map(Number);
    this.phase = Number(phase);
  }
  setStyle(canvas) {
    if (!this.paint || this.pattern === null) return false;
    canvas.saveContext();
    canvas.setLineCap("butt");
    canvas.setLineDashPattern(this.pattern, this.phase);
    return true;
  }
  unsetStyle(canvas, saved) {
    if (saved) canvas.restoreContext();
  }
}

BorderStyle.none = new BorderStyle({
  paint: false
});

BorderStyle.solid = new BorderStyle;

BorderStyle.dashed = new BorderStyle({
  pattern: [ 3, 3 ]
});

BorderStyle.dotted = new BorderStyle({
  pattern: [ 1, 1 ]
});

function normalizeStyle(value) {
  if (value instanceof BorderStyle) return value;
  return BorderStyle[value];
}

class BorderSide {
  constructor({color = "#000000", width = 1, style = BorderStyle.solid} = {}) {
    this.color = normalizeColor(color);
    this.width = Math.max(0, Number(width));
    this.style = normalizeStyle(style);
  }
  copyWith({color, width, style} = {}) {
    return new BorderSide({
      color: color ?? this.color,
      width: width ?? this.width,
      style: style ?? this.style
    });
  }
  equals(other) {
    return this.width === other.width && this.style.paint === other.style.paint && this.style.phase === other.style.phase && String(this.style.pattern) === String(other.style.pattern) && this.color[0] === other.color[0] && this.color[1] === other.color[1] && this.color[2] === other.color[2];
  }
}

BorderSide.none = new BorderSide({
  width: 0,
  style: BorderStyle.none
});

function side$1(value) {
  if (value === null || value === undefined) return BorderSide.none;
  return value instanceof BorderSide ? value : new BorderSide(value);
}

class BoxBorder {}

class Border extends BoxBorder {
  constructor({top = null, right = null, bottom = null, left = null} = {}) {
    super();
    this.top = side$1(top);
    this.right = side$1(right);
    this.bottom = side$1(bottom);
    this.left = side$1(left);
  }
  static all(options = {}) {
    return Border.fromBorderSide(new BorderSide(options));
  }
  static fromBorderSide(value) {
    const resolved = side$1(value);
    return new Border({
      top: resolved,
      right: resolved,
      bottom: resolved,
      left: resolved
    });
  }
  static symmetric({vertical = BorderSide.none, horizontal = BorderSide.none} = {}) {
    return new Border({
      top: horizontal,
      right: vertical,
      bottom: horizontal,
      left: vertical
    });
  }
  get isUniform() {
    return this.top.equals(this.right) && this.top.equals(this.bottom) && this.top.equals(this.left);
  }
  paintUniform(context, x, y, width, height, shape, borderRadius) {
    const {canvas} = context;
    const value = this.top;
    if (!value.style.paint || value.width <= 0) return;
    const saved = value.style.setStyle(canvas);
    canvas.setStrokeColor(value.color);
    canvas.setLineWidth(value.width);
    canvas.setLineJoin("miter");
    canvas.setMiterLimit(4);
    if (shape === "circle") {
      canvas.drawEllipse(x + width / 2, canvas.pageHeight - y - height / 2, width / 2, height / 2);
    } else if (borderRadius !== null) {
      borderRadius.paint(canvas, x, y, width, height);
    } else {
      canvas.drawRect(x, canvas.pageHeight - y - height, width, height);
    }
    canvas.strokePath();
    value.style.unsetStyle(canvas, saved);
  }
  paintSide(canvas, value, x1, y1, x2, y2) {
    if (!value.style.paint || value.width <= 0) return;
    const saved = value.style.setStyle(canvas);
    canvas.setStrokeColor(value.color);
    canvas.setLineWidth(value.width);
    canvas.drawLine(x1, canvas.toPdfY(y1), x2, canvas.toPdfY(y2));
    canvas.strokePath();
    value.style.unsetStyle(canvas, saved);
  }
  paint(context, x, y, width, height, {shape = "rectangle", borderRadius = null} = {}) {
    if (this.isUniform) {
      this.paintUniform(context, x, y, width, height, shape, borderRadius);
      return;
    }
    if (shape !== "rectangle") {
      throw new Error("A non-uniform Border can only paint a rectangle");
    }
    if (borderRadius !== null) {
      throw new Error("A border radius requires a uniform Border");
    }
    const {canvas} = context;
    canvas.setLineCap("square");
    canvas.setLineJoin("miter");
    canvas.setMiterLimit(4);
    this.paintSide(canvas, this.top, x, y, x + width, y);
    this.paintSide(canvas, this.right, x + width, y, x + width, y + height);
    this.paintSide(canvas, this.bottom, x + width, y + height, x, y + height);
    this.paintSide(canvas, this.left, x, y + height, x, y);
  }
}

function normalizeBoxBorder(value) {
  if (value === null || value === undefined) return null;
  return value instanceof BoxBorder ? value : new Border(value);
}

function interpolation(start, end) {
  return new PdfDict([ [ "/FunctionType", new PdfNum(2) ], [ "/Domain", PdfArray.fromNum([ 0, 1 ]) ], [ "/C0", PdfArray.fromNum(start) ], [ "/C1", PdfArray.fromNum(end) ], [ "/N", new PdfNum(1) ] ]);
}

class PdfBaseFunction {
  static colorsAndStops(colors, stops = []) {
    if (colors.length === 0) {
      throw new RangeError("A gradient needs at least one colour");
    }
    if (stops.length > 0 && colors.length !== stops.length) {
      throw new RangeError("The number of gradient colours must match the number of stops");
    }
    const normalizedColors = [ ...colors ];
    const normalizedStops = stops.length === 0 ? normalizedColors.map((_, index) => normalizedColors.length === 1 ? 0 : index / (normalizedColors.length - 1)) : stops.map(value => Math.min(1, Math.max(0, value)));
    if (normalizedColors.length === 1) {
      normalizedColors.push(normalizedColors[0]);
      normalizedStops.push(1);
    }
    for (let index = 1; index < normalizedStops.length; index++) {
      normalizedStops[index] = Math.max(normalizedStops[index], normalizedStops[index - 1]);
    }
    if (normalizedStops[0] > 0) {
      normalizedStops.unshift(0);
      normalizedColors.unshift(normalizedColors[0]);
    }
    if (normalizedStops[normalizedStops.length - 1] < 1) {
      normalizedStops.push(1);
      normalizedColors.push(normalizedColors[normalizedColors.length - 1]);
    }
    if (normalizedColors.length === 2) {
      return interpolation(normalizedColors[0], normalizedColors[1]);
    }
    const functions = [];
    for (let index = 1; index < normalizedColors.length; index++) {
      functions.push(interpolation(normalizedColors[index - 1], normalizedColors[index]));
    }
    const encode = [];
    for (let index = 0; index < functions.length; index++) {
      encode.push(0, 1);
    }
    return new PdfDict([ [ "/FunctionType", new PdfNum(3) ], [ "/Domain", PdfArray.fromNum([ 0, 1 ]) ], [ "/Functions", new PdfArray(functions) ], [ "/Bounds", PdfArray.fromNum(normalizedStops.slice(1, -1)) ], [ "/Encode", PdfArray.fromNum(encode) ] ]);
  }
}

class PdfShadingPattern {
  constructor({shading, matrix = null}) {
    this.shading = shading;
    this.matrix = matrix;
  }
  output() {
    const result = new PdfDict([ [ "/PatternType", new PdfNum(2) ], [ "/Shading", this.shading.output() ] ]);
    if (this.matrix !== null) {
      result.set("/Matrix", PdfArray.fromNum(this.matrix));
    }
    return result;
  }
  get key() {
    return this.output().toString();
  }
}

class PdfBool extends PdfDataType {
  constructor(value) {
    super();
    this.value = value;
  }
  output(s) {
    s.putString(this.value ? "true" : "false");
  }
}

class PdfShading {
  constructor(options) {
    this.options = options;
    if (options.type === "radial" && (options.radius0 == null || options.radius1 == null)) {
      throw new TypeError("A radial shading needs both radii");
    }
  }
  output() {
    const {options} = this;
    const result = new PdfDict([ [ "/ShadingType", new PdfNum(options.type === "axial" ? 2 : 3) ] ]);
    if (options.boundingBox !== null && options.boundingBox !== undefined) {
      const box = options.boundingBox;
      result.set("/BBox", PdfArray.fromNum([ box.x, box.y, box.x + box.width, box.y + box.height ]));
    }
    result.set("/AntiAlias", new PdfBool(true));
    result.set("/ColorSpace", new PdfName("/DeviceRGB"));
    result.set("/Coords", options.type === "axial" ? PdfArray.fromNum([ options.start.x, options.start.y, options.end.x, options.end.y ]) : PdfArray.fromNum([ options.start.x, options.start.y, options.radius0, options.end.x, options.end.y, options.radius1 ]));
    if (options.extendStart === true || options.extendEnd === true) {
      result.set("/Extend", new PdfArray([ new PdfBool(options.extendStart ?? false), new PdfBool(options.extendEnd ?? false) ]));
    }
    result.set("/Function", options.fn);
    return result;
  }
}

function alignmentPoint(alignment, box) {
  return {
    x: box.x + (alignment.x + 1) * box.width / 2,
    y: box.y + (alignment.y + 1) * box.height / 2
  };
}

class Gradient {
  constructor({colors, stops = null}) {
    if (colors.length === 0) throw new RangeError("A gradient needs at least one colour");
    if (stops !== null && stops.length !== colors.length) {
      throw new RangeError("The number of gradient colours must match the number of stops");
    }
    this.colors = colors.map(color => normalizeColor(color));
    this.stops = stops === null ? [] : stops.map(value => Math.min(1, Math.max(0, Number(value))));
  }
}

class LinearGradient extends Gradient {
  constructor({colors, stops = null, begin = Alignment.centerLeft, end = Alignment.centerRight, tileMode = "clamp"}) {
    super({
      colors,
      stops
    });
    this.begin = begin;
    this.end = end;
    this.tileMode = tileMode;
  }
  paint(context, box) {
    const pattern = new PdfShadingPattern({
      shading: new PdfShading({
        type: "axial",
        boundingBox: box,
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: alignmentPoint(this.begin, box),
        end: alignmentPoint(this.end, box),
        extendStart: true,
        extendEnd: true
      })
    });
    context.canvas.setFillPattern(pattern);
    context.canvas.drawBox(box);
    context.canvas.fillPath();
  }
}

class RadialGradient extends Gradient {
  constructor({colors, stops = null, center = Alignment.center, radius = .5, tileMode = "clamp", focal = null, focalRadius = 0}) {
    super({
      colors,
      stops
    });
    this.center = center;
    this.radius = Math.max(0, Number(radius));
    this.tileMode = tileMode;
    this.focal = focal;
    this.focalRadius = Math.max(0, Number(focalRadius));
  }
  paint(context, box) {
    const scale = Math.min(box.width, box.height);
    const pattern = new PdfShadingPattern({
      shading: new PdfShading({
        type: "radial",
        boundingBox: box,
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: alignmentPoint(this.focal ?? this.center, box),
        end: alignmentPoint(this.center, box),
        radius0: this.focalRadius * scale,
        radius1: this.radius * scale,
        extendStart: true,
        extendEnd: true
      })
    });
    context.canvas.setFillPattern(pattern);
    context.canvas.drawBox(box);
    context.canvas.fillPath();
  }
}

class BoxShadow {
  constructor({color = "#000000", offset = {
    x: 0,
    y: 0
  }, blurRadius = 0, spreadRadius = 0, opacity = .25} = {}) {
    this.color = normalizeColor(color);
    this.offset = {
      x: Number(offset.x),
      y: Number(offset.y)
    };
    this.blurRadius = Math.max(0, Number(blurRadius));
    this.spreadRadius = Number(spreadRadius);
    this.opacity = Math.min(1, Math.max(0, Number(opacity)));
  }
}

function appendShape(context, x, y, width, height, shape, borderRadius) {
  const {canvas} = context;
  if (shape === "circle") {
    canvas.drawEllipse(x + width / 2, canvas.pageHeight - y - height / 2, width / 2, height / 2);
  } else if (borderRadius !== null) {
    borderRadius.paint(canvas, x, y, width, height);
  } else {
    canvas.drawRect(x, canvas.pageHeight - y - height, width, height);
  }
}

function paintShadow(context, shadow, x, y, width, height, shape, borderRadius) {
  if (shadow.opacity === 0) return;
  const steps = shadow.blurRadius === 0 ? 1 : Math.max(4, Math.min(16, Math.ceil(shadow.blurRadius)));
  for (let index = steps; index >= 1; index--) {
    const blur = shadow.blurRadius * index / steps;
    const spread = shadow.spreadRadius + blur;
    const alpha = shadow.opacity * (steps === 1 ? 1 : (1 - index / (steps + 1)) / steps);
    context.canvas.saveContext();
    context.canvas.setGraphicState(new PdfGraphicState({
      fillOpacity: alpha
    }));
    context.canvas.setFillColor(shadow.color);
    appendShape(context, x + shadow.offset.x - spread, y + shadow.offset.y - spread, width + spread * 2, height + spread * 2, shape, borderRadius);
    context.canvas.fillPath();
    context.canvas.restoreContext();
  }
}

class BoxDecoration {
  constructor({color = null, border = null, borderRadius = null, boxShadow = null, gradient = null, shape = "rectangle"} = {}) {
    this.color = color === null ? null : normalizeColor(color);
    this.border = normalizeBoxBorder(border);
    this.borderRadius = borderRadius === null ? null : borderRadius instanceof BorderRadiusGeometry ? borderRadius : BorderRadius.all(borderRadius);
    this.boxShadow = boxShadow === null ? [] : boxShadow.map(value => value instanceof BoxShadow ? value : new BoxShadow(value));
    this.gradient = gradient;
    this.shape = shape;
    if (shape === "circle" && borderRadius !== null) {
      throw new Error("A circular BoxDecoration cannot have a border radius");
    }
  }
  paint(context, x, y, width, height, phase = "all", direction = "ltr") {
    const resolvedRadius = this.borderRadius?.resolve(direction) ?? null;
    const box = {
      x,
      y: context.canvas.pageHeight - y - height,
      width,
      height
    };
    if (phase === "all" || phase === "background") {
      for (const shadow of this.boxShadow) {
        paintShadow(context, shadow, x, y, width, height, this.shape, resolvedRadius);
      }
      if (this.color !== null) {
        if (this.shape === "rectangle" && resolvedRadius === null) {
          context.canvas.fillRect(x, y, width, height, this.color);
        } else {
          context.canvas.setFillColor(this.color);
          appendShape(context, x, y, width, height, this.shape, resolvedRadius);
          context.canvas.fillPath();
        }
      }
      if (this.gradient !== null) {
        context.canvas.saveContext();
        appendShape(context, x, y, width, height, this.shape, resolvedRadius);
        context.canvas.clipPath();
        this.gradient.paint(context, box);
        context.canvas.restoreContext();
      }
    }
    if (phase === "all" || phase === "foreground") {
      this.border?.paint(context, x, y, width, height, {
        shape: this.shape,
        borderRadius: resolvedRadius
      });
    }
  }
}

function normalizeBoxDecoration(value) {
  if (value === null || value === undefined) return null;
  return value instanceof BoxDecoration ? value : new BoxDecoration(value);
}

class DecoratedBox extends Widget {
  constructor({decoration, position = "background", child = null}) {
    super();
    this.decoration = normalizeBoxDecoration(decoration);
    this.position = position;
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? {
      width: 0,
      height: 0
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    if (this.position === "background") {
      this.decoration.paint(context, box.x, box.y, box.width, box.height);
    }
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    if (this.position === "foreground") {
      this.decoration.paint(context, box.x, box.y, box.width, box.height);
    }
  }
}

class Container extends Widget {
  constructor({child = null, width = null, height = null, padding = 0, margin = 0, background = null, borderColor = null, borderWidth = 1, decoration = null, foregroundDecoration = null, alignment = null} = {}) {
    super();
    this.child = child;
    this.width = width == null ? null : Number(width);
    this.height = height == null ? null : Number(height);
    this.padding = normalizeInsets(padding);
    this.margin = normalizeInsets(margin);
    this.background = background == null ? null : normalizeColor(background);
    this.borderColor = borderColor == null ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
    this.decoration = normalizeBoxDecoration(decoration);
    this.foregroundDecoration = normalizeBoxDecoration(foregroundDecoration);
    this.alignment = alignment === null ? null : resolveBasicAlignment(alignment);
    if (this.background !== null && this.decoration !== null) {
      throw new Error("Container cannot have both background and decoration");
    }
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const outer = parent.deflate(this.margin);
    const desired = outer.tighten({
      width: this.width ?? (outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height
    });
    const inner = desired.deflate(this.padding);
    const childBox = this.child?.layout(context, this.alignment === null ? inner : inner.loosen()) ?? null;
    const content = childBox ?? {
      width: 0,
      height: 0
    };
    const decorated = desired.constrain({
      width: content.width + this.padding.left + this.padding.right,
      height: content.height + this.padding.top + this.padding.bottom
    });
    const boxWidth = decorated.width;
    const boxHeight = decorated.height;
    const contentWidth = Math.max(0, boxWidth - this.padding.left - this.padding.right);
    const contentHeight = Math.max(0, boxHeight - this.padding.top - this.padding.bottom);
    const childOffset = childBox === null || this.alignment === null ? {
      dx: 0,
      dy: 0
    } : inscribe(this.alignment, childBox.width, childBox.height, contentWidth, contentHeight);
    const size = parent.constrain({
      width: boxWidth + this.margin.left + this.margin.right,
      height: boxHeight + this.margin.top + this.margin.bottom
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox,
        boxWidth,
        boxHeight,
        childX: childOffset.dx,
        childY: childOffset.dy
      }
    };
  }
  paint(context, box) {
    const x = box.x + this.margin.left;
    const y = box.y + this.margin.top;
    const {boxWidth, boxHeight, childBox, childX, childY} = box.data;
    if (this.decoration !== null) {
      this.decoration.paint(context, x, y, boxWidth, boxHeight);
    } else if (this.background) {
      context.canvas.fillRect(x, y, boxWidth, boxHeight, this.background);
    }
    if (this.borderColor && this.borderWidth > 0) {
      context.canvas.strokeRect(x, y, boxWidth, boxHeight, this.borderColor, this.borderWidth);
    }
    if (childBox) {
      childBox.widget.paint(context, {
        ...childBox,
        x: x + this.padding.left + childX,
        y: y + this.padding.top + childY
      });
    }
    this.foregroundDecoration?.paint(context, x, y, boxWidth, boxHeight);
  }
}

class ClipWidget extends Widget {
  constructor({child = null} = {}) {
    super();
    this.child = child;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? parent.smallest);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    if (childBox === null) return;
    context.canvas.saveContext();
    this.appendClip(context, box);
    context.canvas.clipPath();
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    context.canvas.restoreContext();
  }
}

class ClipRect extends ClipWidget {
  appendClip(context, box) {
    context.canvas.drawRect(box.x, context.canvas.pageHeight - box.y - box.height, box.width, box.height);
  }
}

class ClipRRect extends ClipWidget {
  constructor({child = null, horizontalRadius = 0, verticalRadius = 0} = {}) {
    super({
      child
    });
    this.horizontalRadius = Math.max(0, Number(horizontalRadius));
    this.verticalRadius = Math.max(0, Number(verticalRadius));
  }
  appendClip(context, box) {
    BorderRadius.all(new Radius(this.horizontalRadius, this.verticalRadius)).paint(context.canvas, box.x, box.y, box.width, box.height);
  }
}

class ClipOval extends ClipWidget {
  appendClip(context, box) {
    context.canvas.drawEllipse(box.x + box.width / 2, context.canvas.pageHeight - box.y - box.height / 2, box.width / 2, box.height / 2);
  }
}

function finiteNonNegative$1(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function childMain(box, direction) {
  return direction === "horizontal" ? box.width : box.height;
}

function childCross(box, direction) {
  return direction === "horizontal" ? box.height : box.width;
}

function axisConstraints(direction, minMain, maxMain, minCross, maxCross) {
  return direction === "horizontal" ? new BoxConstraints({
    minWidth: minMain,
    maxWidth: maxMain,
    minHeight: minCross,
    maxHeight: maxCross
  }) : new BoxConstraints({
    minWidth: minCross,
    maxWidth: maxCross,
    minHeight: minMain,
    maxHeight: maxMain
  });
}

class EmptyFlexChild extends Widget {
  layout(_context, constraints) {
    const size = BoxConstraints.from(constraints).smallest;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint() {}
}

class Flexible extends Widget {
  constructor({flex = 1, fit = "loose", child}) {
    super();
    this.flex = finiteNonNegative$1(Number(flex), "flex");
    if (fit !== "tight" && fit !== "loose") {
      throw new TypeError(`Unknown FlexFit: ${fit}`);
    }
    this.fit = fit;
    this.child = child;
  }
  layout(context, constraints) {
    const childBox = this.child.layout(context, constraints);
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

class Expanded extends Flexible {
  constructor({flex = 1, fit = "tight", child}) {
    super({
      flex,
      fit,
      child
    });
  }
}

class Spacer extends Expanded {
  constructor(options = 1) {
    const flex = typeof options === "number" ? options : options.flex ?? 1;
    super({
      flex,
      child: new EmptyFlexChild
    });
  }
}

class Flex extends Widget {
  constructor({direction, children = [], mainAxisAlignment = "start", mainAxisSize = "max", crossAxisAlignment = "center", verticalDirection = "down", gap = 0, margin = 0, widths = null}) {
    super();
    if (direction !== "horizontal" && direction !== "vertical") {
      throw new TypeError(`Unknown Axis: ${direction}`);
    }
    if (![ "start", "end", "center", "spaceBetween", "spaceAround", "spaceEvenly" ].includes(mainAxisAlignment)) {
      throw new TypeError(`Unknown MainAxisAlignment: ${mainAxisAlignment}`);
    }
    if (mainAxisSize !== "min" && mainAxisSize !== "max") {
      throw new TypeError(`Unknown MainAxisSize: ${mainAxisSize}`);
    }
    if (![ "start", "end", "center", "stretch" ].includes(crossAxisAlignment)) {
      throw new TypeError(`Unknown CrossAxisAlignment: ${crossAxisAlignment}`);
    }
    if (verticalDirection !== "up" && verticalDirection !== "down") {
      throw new TypeError(`Unknown VerticalDirection: ${verticalDirection}`);
    }
    if (widths !== null && direction !== "horizontal") {
      throw new TypeError("Flex.widths is only valid on a horizontal flex");
    }
    this.direction = direction;
    this.children = children;
    this.mainAxisAlignment = mainAxisAlignment;
    this.mainAxisSize = mainAxisSize;
    this.crossAxisAlignment = crossAxisAlignment;
    this.verticalDirection = verticalDirection;
    this.gap = finiteNonNegative$1(Number(gap), "gap");
    this.margin = normalizeInsets(margin);
    this.widths = widths;
  }
  crossConstraints(constraints) {
    const maximum = this.direction === "horizontal" ? constraints.maxHeight : constraints.maxWidth;
    if (this.crossAxisAlignment === "stretch" && Number.isFinite(maximum)) {
      return [ maximum, maximum ];
    }
    return [ 0, maximum ];
  }
  layout(context, incoming) {
    const outer = BoxConstraints.from(incoming);
    const constraints = outer.deflate(this.margin);
    const horizontal = this.direction === "horizontal";
    const maxMain = horizontal ? constraints.maxWidth : constraints.maxHeight;
    const minMain = horizontal ? constraints.minWidth : constraints.minHeight;
    const maxCross = horizontal ? constraints.maxHeight : constraints.maxWidth;
    const minCross = horizontal ? constraints.minHeight : constraints.minWidth;
    const canFlex = Number.isFinite(maxMain);
    const baseGap = this.gap * Math.max(0, this.children.length - 1);
    const measured = new Array(this.children.length);
    let allocated = 0;
    let crossSize = 0;
    const measure = (index, childConstraints) => {
      const box = this.children[index].layout(context, childConstraints);
      measured[index] = box;
      allocated += childMain(box, this.direction);
      crossSize = Math.max(crossSize, childCross(box, this.direction));
      return box;
    };
    if (this.widths !== null) {
      if (!canFlex) throw new RangeError("Row.widths requires a bounded width");
      const available = Math.max(0, maxMain - baseGap);
      const weights = this.children.map((_, index) => finiteNonNegative$1(Number(this.widths?.[index] ?? 1), `widths[${index}]`));
      const total = weights.reduce((sum, value) => sum + value, 0) || 1;
      const [childMinCross, childMaxCross] = this.crossConstraints(constraints);
      let used = 0;
      for (let index = 0; index < this.children.length; index++) {
        const extent = index === this.children.length - 1 ? available - used : available * weights[index] / total;
        used += extent;
        measure(index, axisConstraints(this.direction, extent, extent, childMinCross, childMaxCross));
      }
    } else {
      let totalFlex = 0;
      const flexible = [];
      const [childMinCross, childMaxCross] = this.crossConstraints(constraints);
      for (let index = 0; index < this.children.length; index++) {
        const child = this.children[index];
        if (child instanceof Flexible && child.flex > 0) {
          if (!canFlex && (this.mainAxisSize === "max" || child.fit === "tight")) {
            throw new RangeError("Flex children require a bounded main-axis constraint");
          }
          totalFlex += child.flex;
          flexible.push(index);
        } else {
          measure(index, axisConstraints(this.direction, 0, Infinity, childMinCross, childMaxCross));
        }
      }
      const freeSpace = Math.max(0, (canFlex ? maxMain : 0) - allocated - baseGap);
      let allocatedFlex = 0;
      for (let flexIndex = 0; flexIndex < flexible.length; flexIndex++) {
        const index = flexible[flexIndex];
        const child = this.children[index];
        const extent = canFlex ? flexIndex === flexible.length - 1 ? freeSpace - allocatedFlex : freeSpace * child.flex / totalFlex : Infinity;
        allocatedFlex += extent;
        measure(index, axisConstraints(this.direction, child.fit === "tight" ? extent : 0, extent, childMinCross, childMaxCross));
      }
    }
    allocated += baseGap;
    const idealMain = canFlex && this.mainAxisSize === "max" ? maxMain : allocated;
    const actualMain = Math.min(maxMain, Math.max(minMain, idealMain));
    const actualCross = Math.min(maxCross, Math.max(minCross, crossSize));
    const remaining = Math.max(0, actualMain - allocated);
    let leading = 0;
    let between = this.gap;
    const count = this.children.length;
    switch (this.mainAxisAlignment) {
     case "end":
      leading = remaining;
      break;

     case "center":
      leading = remaining / 2;
      break;

     case "spaceBetween":
      between += count > 1 ? remaining / (count - 1) : 0;
      break;

     case "spaceAround":
      {
        const extra = count > 0 ? remaining / count : 0;
        leading = extra / 2;
        between += extra;
        break;
      }

     case "spaceEvenly":
      {
        const extra = count > 0 ? remaining / (count + 1) : 0;
        leading = extra;
        between += extra;
        break;
      }
    }
    const reverse = this.direction === "vertical" && this.verticalDirection === "up";
    let cursor = reverse ? actualMain - leading : leading;
    const children = [];
    for (let index = 0; index < measured.length; index++) {
      const box = measured[index];
      const main = childMain(box, this.direction);
      const cross = childCross(box, this.direction);
      const crossPosition = this.crossAxisAlignment === "end" ? actualCross - cross : this.crossAxisAlignment === "center" ? (actualCross - cross) / 2 : 0;
      const mainPosition = reverse ? cursor - main : cursor;
      children.push({
        box,
        dx: this.margin.left + (horizontal ? mainPosition : crossPosition),
        dy: this.margin.top + (horizontal ? crossPosition : mainPosition)
      });
      cursor += reverse ? -(main + between) : main + between;
    }
    const innerWidth = horizontal ? actualMain : actualCross;
    const innerHeight = horizontal ? actualCross : actualMain;
    const size = outer.constrain({
      width: innerWidth + this.margin.left + this.margin.right,
      height: innerHeight + this.margin.top + this.margin.bottom
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        children
      }
    };
  }
  paint(context, box) {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}

class Row extends Flex {
  constructor(options = {}) {
    super({
      ...options,
      direction: "horizontal"
    });
  }
}

class Column extends Flex {
  constructor(options = {}) {
    super({
      ...options,
      direction: "vertical"
    });
  }
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

const DEFAULT_FONT_SIZE = 12;

const DEFAULT_LINE_HEIGHT = 1.2;

class TextStyle {
  constructor({inherit = true, color = null, font = null, fontNormal = null, fontBold = null, fontItalic = null, fontBoldItalic = null, fontFallback = null, fontSize = null, fontWeight = null, fontStyle = null, letterSpacing = null, wordSpacing = null, lineSpacing = null, height = null, background = null, decoration = null, decorationColor = null, decorationStyle = null, decorationThickness = null} = {}) {
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
    this.background = normalizeBoxDecoration(background);
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
      background: options.background ?? this.background,
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
      background: other.background,
      decoration: other.decoration,
      decorationColor: other.decorationColor,
      decorationStyle: other.decorationStyle,
      decorationThickness: other.decorationThickness
    });
  }
}

class InlineSpan {
  constructor({style = null, baseline = 0, annotation = null} = {}) {
    this.style = style;
    this.baseline = assertFiniteNumber(Number(baseline), "baseline");
    this.annotation = annotation;
  }
  toPlainText() {
    let value = "";
    this.visitChildren(span => {
      if (span instanceof TextSpan && span.text !== null) value += span.text;
      return true;
    }, TextStyle.defaultStyle());
    return value;
  }
}

class TextSpan extends InlineSpan {
  constructor({text = null, children = null, ...options} = {}) {
    super(options);
    this.text = text === null ? null : String(text);
    this.children = children === null ? [] : [ ...children ];
  }
  copyWith(options = {}) {
    return new TextSpan({
      text: options.text ?? this.text,
      children: options.children ?? this.children,
      style: options.style ?? this.style,
      baseline: options.baseline ?? this.baseline,
      annotation: options.annotation ?? this.annotation
    });
  }
  visitChildren(visitor, parentStyle, annotation = null) {
    const style = parentStyle.merge(this.style);
    const effectiveAnnotation = this.annotation ?? annotation;
    if (this.text !== null && !visitor(this, style, effectiveAnnotation)) return false;
    for (const child of this.children) {
      if (!child.visitChildren(visitor, style, effectiveAnnotation)) return false;
    }
    return true;
  }
}

class WidgetSpan extends InlineSpan {
  constructor({child, ...options}) {
    super(options);
    this.child = child;
  }
  copyWith(options = {}) {
    return new WidgetSpan({
      child: this.child,
      style: options.style ?? this.style,
      baseline: options.baseline ?? this.baseline,
      annotation: options.annotation ?? this.annotation
    });
  }
  visitChildren(visitor, parentStyle, annotation = null) {
    return visitor(this, parentStyle.merge(this.style), this.annotation ?? annotation);
  }
}

function countSpaces(value) {
  let count = 0;
  for (const character of value) if (/\s/u.test(character)) count++;
  return count;
}

function textWidth(style, value) {
  return style.font.stringMetrics(value, style.fontSize, style.letterSpacing).advanceWidth + countSpaces(value) * style.wordSpacing;
}

function supportsRune(font, codePoint) {
  const candidate = font;
  return candidate.isRuneSupported?.(codePoint) ?? codePoint <= 255;
}

function decorationNames(style) {
  const value = style.decoration ?? "none";
  const values = Array.isArray(value) ? value : [ value ];
  return values.filter(name => name !== "none");
}

function resolveStyle(context, style, baseline, scale, directFont = null) {
  const fontSize = (style.fontSize ?? DEFAULT_FONT_SIZE) * scale;
  const declaredFont = style.font;
  const font = directFont ?? (declaredFont === null ? context.document.font : declaredFont.getFont(context));
  return {
    font,
    fontSize,
    color: style.color ?? [ 0, 0, 0 ],
    lineAdvance: fontSize * (style.height ?? DEFAULT_LINE_HEIGHT) + (style.lineSpacing ?? 0) * scale,
    letterSpacing: (style.letterSpacing ?? 0) * scale,
    wordSpacing: (style.wordSpacing ?? 0) * scale,
    baseline: baseline * scale,
    background: style.background,
    decorations: decorationNames(style),
    decorationColor: style.decorationColor ?? style.color ?? [ 0, 0, 0 ],
    decorationStyle: style.decorationStyle ?? "solid",
    decorationThickness: style.decorationThickness ?? 1
  };
}

function splitLongWord(value, maxWidth, style) {
  const parts = [];
  let current = "";
  for (const character of value) {
    const candidate = current + character;
    if (current !== "" && textWidth(style, candidate) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current !== "") parts.push(current);
  return parts.length === 0 ? [ "" ] : parts;
}

function trimTrailingGaps(line) {
  while (line.tokens[line.tokens.length - 1]?.kind === "gap") {
    line.width -= line.tokens.pop()?.width ?? 0;
  }
}

function positionLine(line, y, contentWidth, align, direction) {
  let ascent = line.emptyStyle.fontSize + Math.max(0, line.emptyStyle.baseline);
  let descent = Math.max(0, line.emptyStyle.lineAdvance - line.emptyStyle.fontSize - line.emptyStyle.baseline);
  let minimumHeight = line.emptyStyle.lineAdvance;
  for (const token of line.tokens) {
    minimumHeight = Math.max(minimumHeight, token.style.lineAdvance);
    if (token.kind === "widget") {
      ascent = Math.max(ascent, token.height + token.style.baseline);
      descent = Math.max(descent, -token.style.baseline);
    } else {
      ascent = Math.max(ascent, token.style.fontSize + token.style.baseline);
      descent = Math.max(descent, token.style.lineAdvance - token.style.fontSize - token.style.baseline);
    }
  }
  const height = Math.max(minimumHeight, ascent + descent);
  const effectiveAlign = align === "start" ? direction === "rtl" ? "right" : "left" : align === "end" ? direction === "rtl" ? "left" : "right" : align;
  let offset = 0;
  if (effectiveAlign === "right") offset = contentWidth - line.width;
  if (effectiveAlign === "center") offset = (contentWidth - line.width) / 2;
  const gapCount = line.wrapped && effectiveAlign === "justify" ? line.tokens.filter(token => token.kind === "gap").length : 0;
  const extraPerGap = gapCount === 0 ? 0 : Math.max(0, contentWidth - line.width) / gapCount;
  const paintTokens = [];
  for (const token of line.tokens) {
    const previous = paintTokens[paintTokens.length - 1];
    if (extraPerGap === 0 && token.kind !== "widget" && previous !== undefined && previous.kind !== "widget" && previous.style === token.style) {
      paintTokens[paintTokens.length - 1] = {
        kind: "text",
        text: previous.text + token.text,
        width: previous.width + token.width,
        style: token.style
      };
    } else {
      paintTokens.push(token);
    }
  }
  let x = offset;
  let accumulatedExtra = 0;
  const runs = [];
  for (const token of paintTokens) {
    let runX = x + accumulatedExtra;
    if (direction === "rtl") runX = contentWidth - runX - token.width;
    const tokenBaseline = y + ascent - token.style.baseline;
    const tokenY = token.kind === "widget" ? tokenBaseline - token.height : tokenBaseline - token.style.fontSize;
    runs.push({
      kind: token.kind,
      text: token.kind === "widget" ? "" : token.text,
      x: runX,
      y: tokenY,
      width: token.width,
      height: token.kind === "widget" ? token.height : token.style.lineAdvance,
      baseline: tokenBaseline,
      style: token.style,
      childBox: token.kind === "widget" ? token.childBox : null
    });
    x += token.width;
    if (token.kind === "gap") accumulatedExtra += extraPerGap;
  }
  const usedWidth = extraPerGap === 0 ? line.width : contentWidth;
  return {
    runs,
    y,
    width: usedWidth,
    height,
    wrapped: line.wrapped
  };
}

function rebaseLines(lines, top) {
  return lines.map(line => ({
    ...line,
    y: line.y - top,
    runs: line.runs.map(run => ({
      ...run,
      y: run.y - top,
      baseline: run.baseline - top
    }))
  }));
}

class RichText extends SpanningWidget {
  constructor({text, textAlign = null, textDirection = "ltr", softWrap = null, tightBounds = false, textScaleFactor = 1, maxLines = null, overflow = null, margin = 0}) {
    super();
    this.text = text;
    this.textAlign = textAlign;
    this.textDirection = textDirection;
    this.softWrap = softWrap;
    this.tightBounds = tightBounds;
    this.textScaleFactor = assertFiniteNumber(Number(textScaleFactor), "textScaleFactor");
    this.maxLines = maxLines;
    this.overflow = overflow;
    this.margin = normalizeInsets(margin);
  }
  initialSpanState() {
    return {
      lineIndex: 0
    };
  }
  inputTokens(context, maxWidth) {
    const result = [];
    const scale = this.textScaleFactor;
    this.text.visitChildren((span, textStyle) => {
      const baseStyle = resolveStyle(context, textStyle, span.baseline, scale);
      if (span instanceof WidgetSpan) {
        const childBox = span.child.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: Infinity
        }));
        result.push({
          kind: "widget",
          width: childBox.width,
          height: childBox.height,
          style: baseStyle,
          childBox
        });
        return true;
      }
      if (!(span instanceof TextSpan) || span.text === null) return true;
      let group = "";
      let groupFont = baseStyle.font;
      const flush = () => {
        if (group === "") return;
        const style = groupFont === baseStyle.font ? baseStyle : {
          ...baseStyle,
          font: groupFont
        };
        for (const part of group.replace(/\r\n?/g, "\n").split(/(\n|[^\S\n]+|[^\s]+)/u)) {
          if (part === "") continue;
          if (part === "\n") result.push({
            kind: "break",
            style
          }); else result.push({
            kind: /^\s+$/u.test(part) ? "gap" : "text",
            text: part,
            width: textWidth(style, part),
            style
          });
        }
        group = "";
      };
      for (const character of span.text) {
        const codePoint = character.codePointAt(0) ?? 0;
        let font = baseStyle.font;
        if (!supportsRune(font, codePoint)) {
          for (const fallback of textStyle.fontFallback) {
            const candidate = fallback.getFont(context);
            if (supportsRune(candidate, codePoint)) {
              font = candidate;
              break;
            }
          }
        }
        if (font !== groupFont && group !== "") flush();
        groupFont = font;
        group += character;
      }
      flush();
      return true;
    }, context.theme.defaultTextStyle);
    return result;
  }
  allLines(context, contentWidth) {
    const align = this.textAlign ?? context.theme.textAlign ?? "left";
    const softWrap = this.softWrap ?? context.theme.softWrap;
    const maxLines = this.maxLines ?? context.theme.maxLines;
    const tokens = this.inputTokens(context, contentWidth);
    const fallbackStyle = resolveStyle(context, context.theme.defaultTextStyle, 0, this.textScaleFactor);
    const raw = [];
    let current = {
      tokens: [],
      width: 0,
      wrapped: false,
      emptyStyle: fallbackStyle
    };
    const pushLine = wrapped => {
      trimTrailingGaps(current);
      current.wrapped = wrapped;
      raw.push(current);
      current = {
        tokens: [],
        width: 0,
        wrapped: false,
        emptyStyle: current.emptyStyle
      };
    };
    for (const token of tokens) {
      current.emptyStyle = token.style;
      if (token.kind === "break") {
        pushLine(false);
        continue;
      }
      if (token.kind === "gap" && current.tokens.length === 0) continue;
      if (softWrap && current.tokens.length > 0 && current.width + token.width > contentWidth + 1e-5) {
        pushLine(true);
        if (token.kind === "gap") continue;
      }
      if (token.kind === "text" && softWrap && token.width > contentWidth + 1e-5) {
        const pieces = splitLongWord(token.text, contentWidth, token.style);
        for (let index = 0; index < pieces.length; index++) {
          const piece = pieces[index] ?? "";
          const part = {
            ...token,
            text: piece,
            width: textWidth(token.style, piece)
          };
          if (current.tokens.length > 0) pushLine(true);
          current.tokens.push(part);
          current.width = part.width;
          if (index < pieces.length - 1) pushLine(true);
        }
        continue;
      }
      current.tokens.push(token);
      current.width += token.width;
    }
    if (current.tokens.length > 0 || raw.length === 0 || tokens[tokens.length - 1]?.kind === "break") pushLine(false);
    const limited = maxLines === null ? raw : raw.slice(0, Math.max(1, maxLines));
    const targetWidth = limited.some(line => line.wrapped || align === "justify") ? contentWidth : Math.max(0, ...limited.map(line => line.width));
    let y = 0;
    const lines = [];
    for (const line of limited) {
      const positioned = positionLine(line, y, targetWidth, align, this.textDirection);
      lines.push(positioned);
      y += positioned.height;
    }
    return lines;
  }
  fragment(context, constraints, lineIndex, spanning) {
    const parent = BoxConstraints.from(constraints);
    const contentWidth = Math.max(1, parent.maxWidth - this.margin.left - this.margin.right);
    const all = this.allLines(context, contentWidth);
    const topMargin = lineIndex === 0 ? this.margin.top : 0;
    const availableHeight = Math.max(0, parent.maxHeight - topMargin);
    let end = lineIndex;
    let height = 0;
    while (end < all.length) {
      const nextHeight = all[end]?.height ?? 0;
      const finalBottom = end === all.length - 1 ? this.margin.bottom : 0;
      if (spanning && height + nextHeight + finalBottom > availableHeight + 1e-5) break;
      height += nextHeight;
      end++;
      if (!spanning && height > availableHeight + 1e-5) break;
    }
    if (!spanning) end = all.length;
    const isFinal = end >= all.length;
    const bottomMargin = isFinal ? this.margin.bottom : 0;
    const lineTop = all[lineIndex]?.y ?? 0;
    const selected = rebaseLines(all.slice(lineIndex, end), lineTop - topMargin);
    const widest = Math.max(0, ...selected.map(line => line.width));
    const naturalHeight = topMargin + selected.reduce((sum, line) => sum + line.height, 0) + bottomMargin;
    const size = parent.constrain({
      width: widest + this.margin.left + this.margin.right,
      height: naturalHeight
    });
    const effectiveOverflow = this.overflow ?? context.theme.overflow;
    return {
      box: {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          lines: selected,
          contentWidth: Math.max(0, size.width - this.margin.left - this.margin.right),
          clip: effectiveOverflow === "clip" || naturalHeight > size.height + 1e-5
        }
      },
      nextState: {
        lineIndex: end
      },
      hasMore: end < all.length
    };
  }
  layout(context, constraints) {
    return this.fragment(context, constraints, 0, false).box;
  }
  layoutSpan(context, constraints, state) {
    return this.fragment(context, constraints, state.lineIndex, true);
  }
  paint(context, box) {
    const {canvas} = context;
    if (box.data.clip) {
      canvas.saveContext();
      canvas.drawRect(box.x, canvas.pageHeight - box.y - box.height, box.width, box.height);
      canvas.clipPath();
    }
    for (const line of box.data.lines) {
      for (const run of line.runs) {
        const x = box.x + this.margin.left + run.x;
        const y = box.y + run.y;
        if (run.style.background !== null && run.width > 0) {
          run.style.background.paint(context, x, y, run.width, run.height, "all", this.textDirection);
        }
      }
    }
    for (const line of box.data.lines) {
      for (const run of line.runs) {
        const x = box.x + this.margin.left + run.x;
        if (run.kind === "text") {
          canvas.text(run.text, x, box.y + run.baseline, {
            font: run.style.font,
            fontSize: run.style.fontSize,
            color: run.style.color,
            letterSpacing: run.style.letterSpacing,
            wordSpacing: run.style.wordSpacing
          });
        } else if (run.kind === "widget" && run.childBox !== null) {
          run.childBox.widget.paint(context, {
            ...run.childBox,
            x,
            y: box.y + run.y
          });
        }
      }
    }
    for (const line of box.data.lines) {
      for (const run of line.runs) {
        if (run.style.decorations.length === 0 || run.width <= 0) continue;
        const x = box.x + this.margin.left + run.x;
        const width = Math.max(.25, run.style.fontSize * .05 * run.style.decorationThickness);
        for (const decoration of run.style.decorations) {
          const top = decoration === "underline" ? box.y + run.baseline + run.style.fontSize * .08 : decoration === "overline" ? box.y + run.baseline - run.style.fontSize : box.y + run.baseline - run.style.fontSize * .35;
          canvas.line(x, top, x + run.width, top, run.style.decorationColor, width);
          if (run.style.decorationStyle === "double") {
            const gap = Math.max(width * 2, run.style.fontSize * .04);
            canvas.line(x, top + gap, x + run.width, top + gap, run.style.decorationColor, width);
          }
        }
      }
    }
    if (box.data.clip) canvas.restoreContext();
  }
}

class Text extends RichText {
  constructor(value, {style = undefined, fontSize = undefined, lineHeight = undefined, color = undefined, align = undefined, textAlign = undefined, textDirection = "ltr", softWrap = undefined, tightBounds = false, textScaleFactor = 1, margin = 0, maxLines = undefined, overflow = undefined, font = undefined} = {}) {
    const overrides = new TextStyle({
      color: color === undefined ? null : normalizeColor(color),
      font: font === undefined ? null : undefined,
      fontSize: fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), "fontSize"),
      height: lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), "lineHeight")
    });
    const merged = (style ?? new TextStyle).merge(overrides);
    super({
      text: new TextSpan({
        text: String(value),
        style: merged
      }),
      textAlign: textAlign ?? align ?? null,
      textDirection,
      softWrap: softWrap ?? null,
      tightBounds,
      textScaleFactor,
      maxLines: maxLines ?? null,
      overflow: overflow ?? null,
      margin
    });
    this.value = String(value);
    this.directFont = font ?? null;
  }
  inputTokens(context, maxWidth) {
    if (this.directFont === null) return super.inputTokens(context, maxWidth);
    const tokens = super.inputTokens(context, maxWidth);
    return tokens.map(token => ({
      ...token,
      style: {
        ...token.style,
        font: this.directFont
      }
    }));
  }
}

class Header extends StatelessWidget {
  constructor({level = 1, text = null, child = null, decoration = null, margin = undefined, padding = undefined, textStyle = null, title = undefined, outlineColor = null, outlineStyle = "normal"} = {}) {
    super();
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      throw new RangeError("Header.level must be an integer from 0 through 5");
    }
    if (child === null && text === null) throw new Error("Header needs text or a child");
    this.level = level;
    this.text = text;
    this.child = child;
    this.decoration = decoration;
    this.margin = margin;
    this.padding = padding;
    this.textStyle = textStyle;
    this.title = title === undefined ? text : title;
    this.outlineColor = outlineColor === null ? null : normalizeColor(outlineColor);
    this.outlineStyle = outlineStyle;
  }
  build(context) {
    const millimeter = PageUnit.mm;
    let margin = this.margin;
    let padding = this.padding;
    let decoration = this.decoration;
    let style = this.textStyle;
    if (this.level === 0) {
      margin ?? (margin = {
        bottom: 5 * millimeter
      });
      padding ?? (padding = {
        bottom: millimeter
      });
      decoration ?? (decoration = new BoxDecoration({
        border: new Border({
          bottom: new BorderSide
        })
      }));
      style ?? (style = context.theme.header0);
    } else if (this.level === 1) {
      margin ?? (margin = {
        top: 3 * millimeter,
        bottom: 5 * millimeter
      });
      decoration ?? (decoration = new BoxDecoration({
        border: new Border({
          bottom: new BorderSide({
            width: .2
          })
        })
      }));
      style ?? (style = context.theme.header1);
    } else {
      margin ?? (margin = {
        top: 2 * millimeter,
        bottom: 4 * millimeter
      });
      style ?? (style = [ context.theme.header0, context.theme.header1, context.theme.header2, context.theme.header3, context.theme.header4, context.theme.header5 ][this.level] ?? context.theme.header5);
    }
    return new Container({
      alignment: "topLeft",
      margin: margin ?? 0,
      padding: padding ?? 0,
      decoration,
      child: this.child ?? new Text(this.text ?? "", {
        style
      })
    });
  }
  paint(context, box) {
    if (this.title !== null) {
      context.document.registerOutline({
        title: this.title,
        level: this.level,
        pageNumber: context.pageNumber,
        y: context.pageFormat.height - box.y,
        color: this.outlineColor,
        style: this.outlineStyle
      });
    }
    super.paint(context, box);
  }
}

class Paragraph extends StatelessWidget {
  constructor({text = "", textAlign = "justify", style = null, margin = {
    bottom: 5 * PageUnit.mm
  }, padding = 0} = {}) {
    super();
    this.text = text ?? "";
    this.textAlign = textAlign;
    this.style = style;
    this.margin = margin;
    this.padding = padding;
  }
  build(context) {
    return new Container({
      margin: this.margin,
      padding: this.padding,
      child: new Text(this.text, {
        textAlign: this.textAlign,
        style: this.style ?? context.theme.paragraphStyle,
        overflow: "span"
      })
    });
  }
}

class Bullet extends StatelessWidget {
  constructor({text = null, textAlign = "left", style = null, margin = {
    bottom: 2 * PageUnit.mm
  }, padding = 0, bulletMargin = {
    top: 1.5 * PageUnit.mm,
    left: 5 * PageUnit.mm,
    right: 2 * PageUnit.mm
  }, bulletSize = 2 * PageUnit.mm, bulletShape = "circle", bulletColor = "#000000"} = {}) {
    super();
    this.text = text;
    this.textAlign = textAlign;
    this.style = style;
    this.margin = margin;
    this.padding = padding;
    this.bulletMargin = bulletMargin;
    this.bulletSize = Number(bulletSize);
    this.bulletShape = bulletShape;
    this.bulletColor = normalizeColor(bulletColor);
  }
  build(context) {
    return new Container({
      margin: this.margin,
      padding: this.padding,
      child: new Row({
        crossAxisAlignment: "start",
        children: [ new Container({
          width: this.bulletSize,
          height: this.bulletSize,
          margin: this.bulletMargin,
          decoration: new BoxDecoration({
            color: this.bulletColor,
            shape: this.bulletShape
          })
        }), new Expanded({
          child: this.text === null ? new SizedBox : new Text(this.text, {
            textAlign: this.textAlign,
            style: context.theme.bulletStyle.merge(this.style)
          })
        }) ]
      })
    });
  }
}

class TableOfContent extends StatelessWidget {
  constructor({indent = 10, gap = 8, textStyle = null} = {}) {
    super();
    this.indent = Number(indent);
    this.gap = Number(gap);
    this.textStyle = textStyle;
  }
  build(context) {
    context.document.requestOutlineRerender();
    const rows = context.document.outlines.map(entry => new Padding({
      padding: {
        bottom: 2
      },
      child: new Row({
        children: [ new SizedBox({
          width: this.indent * entry.level
        }), new Text(entry.title, {
          style: this.textStyle ?? undefined
        }), new SizedBox({
          width: this.gap
        }), new Expanded({
          child: new Divider({
            height: 4,
            thickness: .2
          })
        }), new SizedBox({
          width: this.gap
        }), new Text(String(entry.page), {
          style: this.textStyle ?? undefined
        }) ]
      })
    }));
    return new Column({
      crossAxisAlignment: "start",
      mainAxisSize: "min",
      children: rows
    });
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
    this.names = null;
    this.outline = null;
    this.showOutlines = false;
    this.pageList = pageList;
  }
  prepare() {
    this.params.set("/Pages", this.pageList.ref());
    if (this.names !== null) this.params.set("/Names", this.names.ref());
    if (this.outline !== null) this.params.set("/Outlines", this.outline.ref());
    if (this.showOutlines) this.params.set("/PageMode", new PdfName("/UseOutlines"));
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
    this.patterns = new Map;
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
  addPattern(name, pattern) {
    if (!this.patterns.has(name)) {
      this.patterns.set(name, pattern);
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
    if (this.patterns.size > 0) {
      resources.set("/Pattern", new PdfDict(this.patterns));
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

class PdfNull extends PdfDataType {
  output(s) {
    s.putString("null");
  }
}

class PdfNames extends PdfObject {
  constructor(document) {
    super(document, new PdfDict);
    this.destinations = [];
  }
  addDestination(name, page, {x = null, y = null, zoom = null} = {}) {
    this.destinations.push({
      name,
      page,
      x,
      y,
      zoom
    });
  }
  prepare() {
    const sorted = [ ...this.destinations ].sort((a, b) => a.name.localeCompare(b.name));
    const values = new PdfArray;
    for (const destination of sorted) {
      values.add(new PdfString(destination.name));
      values.add(new PdfDict([ [ "/D", new PdfArray([ destination.page.ref(), new PdfName("/XYZ"), destination.x === null ? new PdfNull : new PdfNum(destination.x), destination.y === null ? new PdfNull : new PdfNum(destination.y), destination.zoom === null ? new PdfNull : new PdfNum(destination.zoom) ]) ] ]));
    }
    const destinations = new PdfDict;
    if (sorted.length > 0) {
      destinations.set("/Names", values);
      destinations.set("/Limits", new PdfArray([ new PdfString(sorted[0].name), new PdfString(sorted[sorted.length - 1].name) ]));
    }
    this.params.set("/Dests", destinations);
  }
}

const STYLE_NUMBER = Object.freeze({
  normal: 0,
  italic: 1,
  bold: 2,
  italicBold: 3
});

class PdfOutline extends PdfObject {
  constructor(document, {title = null, anchor = null, color = null, style = "normal"} = {}) {
    super(document, new PdfDict);
    this.children = [];
    this.parent = null;
    this.title = title;
    this.anchor = anchor;
    this.color = color;
    this.style = style;
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
  }
  descendantCount() {
    return this.children.reduce((count, child) => count + 1 + child.descendantCount(), 0);
  }
  prepare() {
    if (this.parent !== null) {
      this.params.set("/Title", new PdfString(this.title ?? ""));
      if (this.color !== null) this.params.set("/C", PdfArray.fromNum(this.color));
      if (this.style !== "normal") this.params.set("/F", new PdfNum(STYLE_NUMBER[this.style]));
      if (this.anchor !== null) this.params.set("/Dest", new PdfString(this.anchor));
      this.params.set("/Parent", this.parent.ref());
      const index = this.parent.children.indexOf(this);
      if (index > 0) this.params.set("/Prev", this.parent.children[index - 1].ref());
      if (index + 1 < this.parent.children.length) {
        this.params.set("/Next", this.parent.children[index + 1].ref());
      }
      const descendants = this.descendantCount();
      if (descendants > 0) this.params.set("/Count", new PdfNum(-descendants));
    } else {
      this.params.set("/Count", new PdfNum(this.children.length));
    }
    if (this.children.length > 0) {
      this.params.set("/First", this.children[0].ref());
      this.params.set("/Last", this.children[this.children.length - 1].ref());
    }
  }
}

class PdfDocument {
  constructor(metadata) {
    this.serial = 0;
    this.xref = new PdfXrefTable;
    this.fontObjects = new Map;
    this.imageObjects = new Map;
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
  imageObject(image) {
    const existing = this.imageObjects.get(image);
    if (existing !== undefined) return existing;
    const mask = image.hasAlpha ? new PdfImageObject(this, image, "alpha") : null;
    const object = new PdfImageObject(this, image, "rgb");
    if (mask !== null) object.setSoftMask(mask);
    this.imageObjects.set(image, object);
    return object;
  }
  addPage(format, content, fonts = new Map, graphicStates = new Map, patterns = new Map, images = new Map) {
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
    for (const [name, pattern] of patterns) {
      page.addPattern(name, pattern);
    }
    for (const [image, name] of images) {
      page.addXObject(name, this.imageObject(image));
    }
    page.contents.push(stream);
    return page;
  }
  addNavigation(outlines, pageMode) {
    if (outlines.length === 0) {
      this.catalog.showOutlines = pageMode === "outlines";
      return;
    }
    const names = new PdfNames(this);
    const root = new PdfOutline(this);
    const levels = [ root ];
    for (const entry of outlines) {
      const page = this.pageList.pages[entry.page - 1];
      if (page === undefined) continue;
      names.addDestination(entry.anchor, page, {
        y: entry.y
      });
      const node = new PdfOutline(this, {
        title: entry.title,
        anchor: entry.anchor,
        color: entry.color ?? null,
        style: entry.style ?? "normal"
      });
      const parentIndex = Math.min(entry.level, levels.length - 1);
      const parent = levels[parentIndex] ?? root;
      parent.add(node);
      levels.length = parentIndex + 1;
      levels.push(node);
    }
    this.catalog.names = names;
    this.catalog.outline = root;
    this.catalog.showOutlines = pageMode === "outlines";
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

function serializePdf(pages, metadata, outlines = [], pageMode = "none") {
  const document = new PdfDocument(metadata);
  for (const page of pages) {
    document.addPage(page.format, page.content, page.fonts, page.graphicStates, page.patterns, page.images);
  }
  document.addNavigation(outlines, pageMode);
  return document.save();
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
    this.patternNames = new Map;
    this.patternDicts = new Map;
    this.imageNames = new Map;
    this.currentTransform = identityMatrix;
    this.transformStack = [];
    this.currentLetterSpacing = 0;
    this.currentWordSpacing = 0;
    this.textSpacingStack = [];
    this.textSpacingDirty = false;
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
  get patterns() {
    return this.patternDicts;
  }
  get images() {
    return this.imageNames;
  }
  addImage(image) {
    const existing = this.imageNames.get(image);
    if (existing !== undefined) return existing;
    const name = `/I${this.imageNames.size + 1}`;
    this.imageNames.set(image, name);
    return name;
  }
  saveContext() {
    this.push("q");
    this.transformStack.push(this.currentTransform);
    this.textSpacingStack.push([ this.currentLetterSpacing, this.currentWordSpacing ]);
  }
  restoreContext() {
    const restored = this.transformStack.pop();
    const spacing = this.textSpacingStack.pop();
    if (restored === undefined) {
      return;
    }
    this.push("Q");
    this.currentTransform = restored;
    if (spacing !== undefined) {
      this.currentLetterSpacing = spacing[0];
      this.currentWordSpacing = spacing[1];
    }
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
  addPattern(pattern) {
    const existing = this.patternNames.get(pattern.key);
    if (existing !== undefined) {
      return existing;
    }
    const name = `/p${this.patternDicts.size + 1}`;
    this.patternNames.set(pattern.key, name);
    this.patternDicts.set(name, pattern.output());
    return name;
  }
  setFillPattern(pattern) {
    const name = this.addPattern(pattern);
    this.push(`/Pattern cs ${name} scn`);
    return name;
  }
  setStrokePattern(pattern) {
    const name = this.addPattern(pattern);
    this.push(`/Pattern CS ${name} SCN`);
    return name;
  }
  drawImage(image, x, y, width = image.width, height) {
    const resolvedHeight = height ?? image.height * width / image.width;
    const name = this.addImage(image);
    let matrix;
    switch (image.orientation) {
     case "topRight":
      matrix = [ -width, 0, 0, resolvedHeight, width + x, y ];
      break;

     case "bottomRight":
      matrix = [ -width, 0, 0, -resolvedHeight, width + x, resolvedHeight + y ];
      break;

     case "bottomLeft":
      matrix = [ width, 0, 0, -resolvedHeight, x, resolvedHeight + y ];
      break;

     case "leftTop":
      matrix = [ 0, -resolvedHeight, -width, 0, width + x, resolvedHeight + y ];
      break;

     case "rightTop":
      matrix = [ 0, -resolvedHeight, width, 0, x, resolvedHeight + y ];
      break;

     case "rightBottom":
      matrix = [ 0, resolvedHeight, width, 0, x, y ];
      break;

     case "leftBottom":
      matrix = [ 0, resolvedHeight, -width, 0, width + x, y ];
      break;

     default:
      matrix = [ width, 0, 0, resolvedHeight, x, y ];
      break;
    }
    this.push("q");
    this.push(`${operands(matrix)} cm`);
    this.push(`${name} Do`);
    this.push("Q");
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
    const spacingOperators = [];
    if (letterSpacing === 0 && wordSpacing === 0 && this.textSpacingDirty) {
      spacingOperators.push("0", "Tc", "0", "Tw");
      this.currentLetterSpacing = 0;
      this.currentWordSpacing = 0;
      this.textSpacingDirty = false;
    } else {
      if (letterSpacing !== this.currentLetterSpacing) {
        spacingOperators.push(formatNumber(letterSpacing), "Tc");
        this.currentLetterSpacing = letterSpacing;
      }
      if (wordSpacing !== this.currentWordSpacing) {
        spacingOperators.push(formatNumber(wordSpacing), "Tw");
        this.currentWordSpacing = wordSpacing;
      }
      if (letterSpacing !== 0 || wordSpacing !== 0) {
        this.textSpacingDirty = true;
      }
    }
    const command = [ "BT", this.addFont(font), formatNumber(fontSize), "Tf", colorOperator(style.color), ...spacingOperators, "1 0 0 1", formatNumber(x), formatNumber(baseline), "Tm", font.encodeText(text), "Tj", "ET" ].join(" ");
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
  constructor({format = undefined, pageFormat = undefined, margin = DEFAULT_MARGIN, orientation = "natural", gap = 8, theme = undefined, build, header = null, footer = null, background = null, maxPages = 20}) {
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
    this.maxPages = Math.trunc(Number(maxPages));
    if (!Number.isFinite(this.maxPages) || this.maxPages <= 0) {
      throw new RangeError("MultiPage.maxPages must be a positive finite integer");
    }
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
      if (canvases.length >= this.maxPages) {
        throw new RangeError(`MultiPage exceeded its ${this.maxPages} page limit`);
      }
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
        const headerBox = headerWidget.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: bottom - top
        }));
        headerWidget.paint(context, {
          ...headerBox,
          x: this.margin.left,
          y: top
        });
        top += headerBox.height + this.gap;
      }
      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: bottom - top
        }));
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
      if (child instanceof SpanningWidget && child.canSpan) {
        let state = child.initialSpanState();
        while (true) {
          const available = page.bottom - page.cursor;
          const fragment = child.layoutSpan(page.context, new BoxConstraints({
            maxWidth: page.maxWidth,
            maxHeight: available
          }), state);
          const box = fragment.box;
          if (box.height > available + .001) {
            throw new RangeError("A spanning widget returned a fragment taller than its constraint");
          }
          if (box.height <= .001 && fragment.hasMore) {
            if (page.cursor > page.top + .001) {
              page = startPage();
              continue;
            }
            throw new RangeError("A spanning row exceeds a full MultiPage content area");
          }
          if (box.height > 0) {
            child.paint(page.context, {
              ...box,
              x: this.margin.left,
              y: page.cursor
            });
          }
          if (!fragment.hasMore) {
            page.cursor += box.height + this.gap;
            break;
          }
          state = fragment.nextState;
          page = startPage();
        }
        continue;
      }
      let box = child.layout(page.context, new BoxConstraints({
        maxWidth: page.maxWidth,
        maxHeight: Infinity
      }));
      if (page.cursor + box.height > page.bottom + .001) {
        if (box.height > page.bottom - page.top + .001) {
          throw new RangeError(`Widget height ${box.height.toFixed(2)} exceeds a full MultiPage content area`);
        }
        page = startPage();
        box = child.layout(page.context, new BoxConstraints({
          maxWidth: page.maxWidth,
          maxHeight: Infinity
        }));
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
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      images: canvas.images
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
    const box = widget.layout(context, new BoxConstraints({
      maxWidth,
      maxHeight
    }));
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
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      images: canvas.images
    } ];
  }
  paintLayer(build, context, format) {
    if (build === null) {
      return;
    }
    const widget = build(context);
    const box = widget.layout(context, new BoxConstraints({
      maxWidth: format.width,
      maxHeight: format.height
    }));
    widget.paint(context, {
      ...box,
      x: 0,
      y: 0
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
  constructor({title = null, author = null, subject = null, creator = "js_pdf", producer = "js_pdf", theme = undefined, font = undefined, pageMode = "none"} = {}) {
    this.sections = [];
    this.outlineEntries = [];
    this.outlineReplay = false;
    this.outlineCursor = 0;
    this.outlineRerenderRequested = false;
    this.renderPageOffset = 0;
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
    this.pageMode = pageMode;
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
  get outlines() {
    return this.outlineEntries;
  }
  requestOutlineRerender() {
    this.outlineRerenderRequested = true;
  }
  registerOutline({title, level, pageNumber, y, color = null, style = "normal"}) {
    const page = this.renderPageOffset + pageNumber;
    if (this.outlineReplay) {
      const existing = this.outlineEntries[this.outlineCursor];
      if (existing !== undefined) {
        existing.page = page;
        existing.y = y;
      } else {
        this.outlineEntries.push({
          title,
          level,
          anchor: `outline-${this.outlineCursor + 1}`,
          page,
          y,
          color,
          style
        });
      }
      this.outlineCursor++;
      return;
    }
    this.outlineEntries.push({
      title,
      level,
      anchor: `outline-${this.outlineEntries.length + 1}`,
      page,
      y,
      color,
      style
    });
  }
  renderSections(replay) {
    this.outlineReplay = replay;
    this.outlineCursor = 0;
    const pages = [];
    for (const section of this.sections) {
      this.renderPageOffset = pages.length;
      pages.push(...section.render({
        document: this
      }));
    }
    return pages;
  }
  save() {
    this.outlineEntries.length = 0;
    this.outlineRerenderRequested = false;
    let pages = this.renderSections(false);
    if (this.outlineRerenderRequested) {
      pages = this.renderSections(true);
    }
    if (pages.length === 0) {
      throw new Error("Document must contain at least one page");
    }
    const outlines = this.outlineEntries.map(entry => ({
      ...entry
    }));
    return serializePdf(pages, this.metadata, outlines, this.pageMode);
  }
}

function finiteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

class GridView extends SpanningWidget {
  constructor({direction = "vertical", padding = 0, crossAxisCount, mainAxisSpacing = 0, crossAxisSpacing = 0, childAspectRatio = Infinity, children = []}) {
    super();
    if (direction !== "horizontal" && direction !== "vertical") {
      throw new TypeError(`Unknown GridView axis: ${direction}`);
    }
    this.direction = direction;
    this.padding = normalizeInsets(padding);
    this.crossAxisCount = Math.trunc(Number(crossAxisCount));
    if (!Number.isFinite(this.crossAxisCount) || this.crossAxisCount <= 0) {
      throw new RangeError("GridView.crossAxisCount must be a positive integer");
    }
    this.mainAxisSpacing = finiteNonNegative(Number(mainAxisSpacing), "mainAxisSpacing");
    this.crossAxisSpacing = finiteNonNegative(Number(crossAxisSpacing), "crossAxisSpacing");
    this.childAspectRatio = Number(childAspectRatio);
    if (!(this.childAspectRatio > 0)) {
      throw new RangeError("GridView.childAspectRatio must be positive");
    }
    this.children = children;
  }
  initialSpanState() {
    return {
      firstChild: 0,
      childCrossAxis: null,
      childMainAxis: null
    };
  }
  fragment(context, incoming, state) {
    const parent = BoxConstraints.from(incoming);
    if (state.firstChild >= this.children.length) {
      const size = parent.constrain({
        width: 0,
        height: 0
      });
      const data = {
        children: [],
        firstChild: state.firstChild,
        lastChild: state.firstChild,
        childCrossAxis: state.childCrossAxis ?? 0,
        childMainAxis: state.childMainAxis ?? 0
      };
      return {
        box: {
          widget: this,
          width: size.width,
          height: size.height,
          data
        },
        nextState: state,
        hasMore: false
      };
    }
    const inner = parent.deflate(this.padding);
    const vertical = this.direction === "vertical";
    const maxMain = vertical ? inner.maxHeight : inner.maxWidth;
    const maxCross = vertical ? inner.maxWidth : inner.maxHeight;
    if (!Number.isFinite(maxCross)) {
      throw new RangeError("GridView requires a bounded cross axis");
    }
    const childCrossAxis = state.childCrossAxis ?? Math.max(0, (maxCross - this.crossAxisSpacing * (this.crossAxisCount - 1)) / this.crossAxisCount);
    const remaining = this.children.length - state.firstChild;
    const neededRuns = Math.ceil(remaining / this.crossAxisCount);
    let childMainAxis = state.childMainAxis;
    if (childMainAxis === null) {
      if (Number.isFinite(this.childAspectRatio)) {
        childMainAxis = childCrossAxis * this.childAspectRatio;
      } else {
        if (!Number.isFinite(maxMain)) {
          throw new RangeError("GridView needs a bounded main axis or childAspectRatio");
        }
        childMainAxis = Math.max(0, (maxMain - this.mainAxisSpacing * (neededRuns - 1)) / neededRuns);
      }
    }
    const runCapacity = Number.isFinite(maxMain) ? Math.max(0, Math.floor((maxMain + this.mainAxisSpacing + 1e-6) / (childMainAxis + this.mainAxisSpacing))) : neededRuns;
    const childCapacity = runCapacity * this.crossAxisCount;
    const count = Math.min(remaining, childCapacity);
    const runCount = count === 0 ? 0 : Math.ceil(count / this.crossAxisCount);
    const children = [];
    for (let local = 0; local < count; local++) {
      const index = state.firstChild + local;
      const run = Math.floor(local / this.crossAxisCount);
      const cross = local % this.crossAxisCount;
      const childConstraints = vertical ? BoxConstraints.tight({
        width: childCrossAxis,
        height: childMainAxis
      }) : BoxConstraints.tight({
        width: childMainAxis,
        height: childCrossAxis
      });
      const childBox = this.children[index].layout(context, childConstraints);
      children.push({
        box: childBox,
        dx: this.padding.left + (vertical ? cross * (childCrossAxis + this.crossAxisSpacing) : run * (childMainAxis + this.mainAxisSpacing)),
        dy: this.padding.top + (vertical ? run * (childMainAxis + this.mainAxisSpacing) : cross * (childCrossAxis + this.crossAxisSpacing))
      });
    }
    const totalMain = runCount === 0 ? 0 : runCount * childMainAxis + (runCount - 1) * this.mainAxisSpacing;
    const totalCross = this.crossAxisCount * childCrossAxis + (this.crossAxisCount - 1) * this.crossAxisSpacing;
    const natural = vertical ? {
      width: totalCross + this.padding.left + this.padding.right,
      height: totalMain + this.padding.top + this.padding.bottom
    } : {
      width: totalMain + this.padding.left + this.padding.right,
      height: totalCross + this.padding.top + this.padding.bottom
    };
    const size = parent.constrain(natural);
    const lastChild = state.firstChild + count;
    const data = {
      children,
      firstChild: state.firstChild,
      lastChild,
      childCrossAxis,
      childMainAxis
    };
    const nextState = {
      firstChild: lastChild,
      childCrossAxis,
      childMainAxis
    };
    return {
      box: {
        widget: this,
        width: size.width,
        height: size.height,
        data
      },
      nextState,
      hasMore: lastChild < this.children.length
    };
  }
  layout(context, constraints) {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }
  layoutSpan(context, constraints, state) {
    return this.fragment(context, constraints, state);
  }
  paint(context, box) {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}

class Partition extends SpanningWidget {
  constructor({child, width = null, flex = 1}) {
    super();
    this.child = child;
    this.width = width === null ? null : Math.max(0, Number(width));
    this.flex = this.width === null ? Math.max(0, Number(flex)) : 0;
  }
  initialSpanState() {
    return {
      done: false,
      childState: this.child instanceof SpanningWidget ? this.child.initialSpanState() : null
    };
  }
  layout(context, constraints) {
    const childBox = this.child.layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: {
        childBox
      }
    };
  }
  layoutSpan(context, constraints, state) {
    if (state.done) {
      const size = BoxConstraints.from(constraints).constrain({
        width: 0,
        height: 0
      });
      return {
        box: {
          widget: this,
          width: size.width,
          height: 0,
          data: {
            childBox: null
          }
        },
        nextState: state,
        hasMore: false
      };
    }
    if (this.child instanceof SpanningWidget) {
      const fragment = this.child.layoutSpan(context, constraints, state.childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: {
            childBox: fragment.box
          }
        },
        nextState: {
          done: !fragment.hasMore,
          childState: fragment.nextState
        },
        hasMore: fragment.hasMore
      };
    }
    const childBox = this.child.layout(context, constraints);
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: {
          childBox
        }
      },
      nextState: {
        done: true,
        childState: null
      },
      hasMore: false
    };
  }
  paint(context, box) {
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class Partitions extends SpanningWidget {
  constructor({children, mainAxisSize = "max"}) {
    super();
    if (mainAxisSize !== "min" && mainAxisSize !== "max") {
      throw new TypeError(`Unknown MainAxisSize: ${mainAxisSize}`);
    }
    this.children = children;
    this.mainAxisSize = mainAxisSize;
  }
  initialSpanState() {
    return {
      children: this.children.map(child => child.initialSpanState())
    };
  }
  widths(constraints) {
    const fixed = this.children.reduce((sum, child) => sum + (child.width ?? 0), 0);
    const flex = this.children.reduce((sum, child) => sum + child.flex, 0);
    if (flex > 0 && !constraints.hasBoundedWidth) {
      throw new RangeError("Flexible Partition children require a bounded width");
    }
    const available = Math.max(0, (constraints.hasBoundedWidth ? constraints.maxWidth : fixed) - fixed);
    return this.children.map(child => child.width ?? (flex === 0 ? 0 : available * child.flex / flex));
  }
  fragment(context, incoming, state) {
    const constraints = BoxConstraints.from(incoming);
    const widths = this.widths(constraints);
    const children = [];
    const nextStates = [];
    let x = 0;
    let height = 0;
    let hasMore = false;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const width = widths[index];
      const fragment = child.layoutSpan(context, new BoxConstraints({
        minWidth: width,
        maxWidth: width,
        maxHeight: constraints.maxHeight
      }), state.children[index] ?? child.initialSpanState());
      children.push({
        box: fragment.box,
        dx: x
      });
      nextStates.push(fragment.nextState);
      x += width;
      height = Math.max(height, fragment.box.height);
      hasMore || (hasMore = fragment.hasMore);
    }
    const naturalWidth = this.mainAxisSize === "max" && constraints.hasBoundedWidth ? constraints.maxWidth : x;
    const size = constraints.constrain({
      width: naturalWidth,
      height
    });
    return {
      box: {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          children
        }
      },
      nextState: {
        children: nextStates
      },
      hasMore
    };
  }
  layout(context, constraints) {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }
  layoutSpan(context, constraints, state) {
    return this.fragment(context, constraints, state);
  }
  paint(context, box) {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y
      });
    }
  }
}

class Image extends Widget {
  constructor(image, {fit = "contain", alignment = "center", width = null, height = null, dpi = null} = {}) {
    super();
    applyBoxFit$1(fit, {
      width: 1,
      height: 1
    }, {
      width: 1,
      height: 1
    });
    if (width !== null && (!Number.isFinite(width) || width < 0)) throw new RangeError("Image width must be non-negative");
    if (height !== null && (!Number.isFinite(height) || height < 0)) throw new RangeError("Image height must be non-negative");
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.width = width;
    this.height = height;
    this.dpi = dpi;
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const image = this.image.resolve();
    const offered = {
      width: parent.constrainWidth(this.width ?? (parent.hasBoundedWidth ? parent.maxWidth : this.image.width)),
      height: parent.constrainHeight(this.height ?? (parent.hasBoundedHeight ? parent.maxHeight : this.image.height))
    };
    const fitted = applyBoxFit$1(this.fit, {
      width: this.image.width,
      height: this.image.height
    }, offered);
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, this.image.width, this.image.height);
    const destinationOffset = inscribe(this.alignment, fitted.destination.width, fitted.destination.height, offered.width, offered.height);
    return {
      widget: this,
      width: fitted.destination.width,
      height: fitted.destination.height,
      data: {
        image,
        source: fitted.source,
        destination: fitted.destination,
        sourceX: sourceOffset.dx,
        sourceY: sourceOffset.dy,
        destinationX: destinationOffset.dx,
        destinationY: destinationOffset.dy
      }
    };
  }
  paint(context, box) {
    const data = box.data;
    if (data.source.width <= 0 || data.source.height <= 0) return;
    const scaleX = data.destination.width / data.source.width;
    const scaleY = data.destination.height / data.source.height;
    const destinationX = box.x + data.destinationX;
    const destinationY = box.y + data.destinationY;
    const fullWidth = this.image.width * scaleX;
    const fullHeight = this.image.height * scaleY;
    const fullX = destinationX - data.sourceX * scaleX;
    const fullTop = destinationY - data.sourceY * scaleY;
    context.canvas.saveContext();
    context.canvas.drawRect(destinationX, context.canvas.pageHeight - destinationY - data.destination.height, data.destination.width, data.destination.height);
    context.canvas.clipPath();
    context.canvas.drawImage(data.image, fullX, context.canvas.pageHeight - fullTop - fullHeight, fullWidth, fullHeight);
    context.canvas.restoreContext();
  }
}

class ImageProvider {
  constructor(width, height, orientation, dpi) {
    this.cached = null;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.orientation = orientation;
    this.dpi = dpi;
  }
  get width() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceHeight : this.sourceWidth;
  }
  get height() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceWidth : this.sourceHeight;
  }
  resolve(_size, _dpi) {
    this.cached ?? (this.cached = this.buildImage());
    return this.cached;
  }
}

class ImageProxy extends ImageProvider {
  constructor(image, {dpi = null} = {}) {
    super(image.sourceWidth, image.sourceHeight, image.orientation, dpi);
    this.image = image;
  }
  buildImage() {
    return this.image;
  }
}

class MemoryImage extends ImageProvider {
  constructor(bytes, {orientation = "topLeft", dpi = null} = {}) {
    let image;
    if (bytes[0] === 255 && bytes[1] === 216) {
      image = PdfImage.fromJpeg(bytes, orientation);
    } else if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
      image = PdfImage.fromPng(bytes, orientation);
    } else {
      throw new TypeError(`Unable to determine image type from ${bytes.length} bytes`);
    }
    super(image.sourceWidth, image.sourceHeight, orientation, dpi);
    this.bytes = bytes.slice();
    this.image = image;
  }
  buildImage() {
    return this.image;
  }
}

class RawImage extends ImageProvider {
  constructor({bytes, width, height, orientation = "topLeft", dpi = null}) {
    const image = new PdfImage({
      pixels: bytes,
      width,
      height,
      orientation,
      hasAlpha: true
    });
    super(width, height, orientation, dpi);
    this.image = image;
  }
  buildImage() {
    return this.image;
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
  setFillColor(_operation, canvas) {
    if (this.color !== null) {
      canvas.setFillColor(this.color);
    }
  }
  setStrokeColor(_operation, canvas) {
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

function readStops(element, parser) {
  const colors = [];
  const stops = [];
  const opacities = [];
  let previous = 0;
  for (const child of element.elements) {
    if (child.name.local !== "stop") {
      continue;
    }
    convertStyle(child);
    const color = SvgColor.fromXml(child.getAttribute("stop-color") ?? "black", parser);
    const offset = Math.min(1, Math.max(previous, getNumeric(child, "offset", null, {
      defaultValue: 0
    }).sizeValue));
    previous = offset;
    colors.push(color.color ?? [ 0, 0, 0 ]);
    stops.push(offset);
    opacities.push(Math.min(1, Math.max(0, getDouble(child, "stop-opacity", {
      defaultValue: 1
    }) ?? 1)) * color.opacity);
  }
  return {
    colors,
    stops,
    opacities
  };
}

function hrefElement(element, parser) {
  const xlink = [ "http:", "", "www.w3.org", "1999", "xlink" ].join("/");
  const href = element.getAttribute("href") ?? element.getAttribute("href", xlink);
  return href?.startsWith("#") === true ? parser.findById(href.slice(1)) : null;
}

class SvgGradient extends SvgColor {
  constructor(gradientUnits, transform, colors, stops, opacityList, spreadMethod) {
    const uniformOpacity = opacityList.length > 0 && opacityList.every(value => value === opacityList[0]) ? opacityList[0] : 1;
    super(null, false, uniformOpacity);
    this.gradientUnits = gradientUnits;
    this.transform = transform;
    this.colors = colors;
    this.stops = stops;
    this.opacityList = opacityList;
    this.spreadMethod = spreadMethod ?? "pad";
    this.hasSpreadMethod = spreadMethod !== null;
  }
  get isEmpty() {
    return this.colors.length === 0;
  }
  get isNotEmpty() {
    return !this.isEmpty;
  }
  patternMatrix(operation, canvas) {
    let matrix = canvas.getTransform();
    if (this.gradientUnits !== "userSpaceOnUse") {
      const box = operation.boundingBox();
      matrix = multiplyMatrix(matrix, translationMatrix(box.x, box.y));
      matrix = multiplyMatrix(matrix, scaleMatrix(box.width, box.height));
    }
    if (this.transform.matrix !== null) {
      matrix = multiplyMatrix(matrix, this.transform.matrix);
    }
    return matrix;
  }
  setFillColor(operation, canvas) {
    if (this.isNotEmpty) {
      canvas.setFillPattern(this.buildGradient(operation, canvas));
    }
  }
  setStrokeColor(operation, canvas) {
    if (this.isNotEmpty) {
      canvas.setStrokePattern(this.buildGradient(operation, canvas));
    }
  }
  static fromReference(value, parser) {
    const match = /^url\(\s*#([^)\s]+)\s*\)$/.exec(value.trim());
    if (match === null) {
      return null;
    }
    const element = parser.findById(match[1]);
    if (element?.name.local === "linearGradient") {
      return SvgLinearGradient.fromElement(element, parser);
    }
    if (element?.name.local === "radialGradient") {
      return SvgRadialGradient.fromElement(element, parser);
    }
    return null;
  }
}

class SvgLinearGradient extends SvgGradient {
  constructor(gradientUnits, x1, y1, x2, y2, transform, colors, stops, opacities, spreadMethod) {
    super(gradientUnits, transform, colors, stops, opacities, spreadMethod);
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
  }
  static fromElement(element, parser, seen = []) {
    const id = element.getAttribute("id");
    if (id !== null && seen.includes(id)) {
      throw new SyntaxError(`Circular gradient reference: ${id}`);
    }
    const nextSeen = id === null ? seen : [ ...seen, id ];
    const stopData = readStops(element, parser);
    const local = new SvgLinearGradient(SvgLinearGradient.units(element), getNumeric(element, "x1", null)?.sizeValue ?? null, getNumeric(element, "y1", null)?.sizeValue ?? null, getNumeric(element, "x2", null)?.sizeValue ?? null, getNumeric(element, "y2", null)?.sizeValue ?? null, SvgTransform.fromString(element.getAttribute("gradientTransform")), stopData.colors, stopData.stops, stopData.opacities, SvgLinearGradient.spread(element));
    const inherited = hrefElement(element, parser);
    return inherited?.name.local === "linearGradient" ? SvgLinearGradient.fromElement(inherited, parser, nextSeen).mergeWith(local) : local;
  }
  static units(element) {
    const value = element.getAttribute("gradientUnits");
    return value === "userSpaceOnUse" || value === "objectBoundingBox" ? value : null;
  }
  static spread(element) {
    const value = element.getAttribute("spreadMethod");
    return value === "pad" || value === "reflect" || value === "repeat" ? value : null;
  }
  mergeWith(other) {
    return new SvgLinearGradient(other.gradientUnits ?? this.gradientUnits, other.x1 ?? this.x1, other.y1 ?? this.y1, other.x2 ?? this.x2, other.y2 ?? this.y2, other.transform.isNotEmpty ? other.transform : this.transform, other.colors.length > 0 ? other.colors : this.colors, other.stops.length > 0 ? other.stops : this.stops, other.opacityList.length > 0 ? other.opacityList : this.opacityList, other.hasSpreadMethod ? other.spreadMethod : this.spreadMethod);
  }
  buildGradient(operation, canvas) {
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: "axial",
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: {
          x: this.x1 ?? 0,
          y: this.y1 ?? 0
        },
        end: {
          x: this.x2 ?? 1,
          y: this.y2 ?? 0
        },
        extendStart: true,
        extendEnd: true
      }),
      matrix: this.patternMatrix(operation, canvas)
    });
  }
}

class SvgRadialGradient extends SvgGradient {
  constructor(gradientUnits, r, cx, cy, fr, fx, fy, transform, colors, stops, opacities, spreadMethod) {
    super(gradientUnits, transform, colors, stops, opacities, spreadMethod);
    this.r = r;
    this.cx = cx;
    this.cy = cy;
    this.fr = fr;
    this.fx = fx;
    this.fy = fy;
  }
  static fromElement(element, parser, seen = []) {
    const id = element.getAttribute("id");
    if (id !== null && seen.includes(id)) {
      throw new SyntaxError(`Circular gradient reference: ${id}`);
    }
    const nextSeen = id === null ? seen : [ ...seen, id ];
    const stopData = readStops(element, parser);
    const unitsValue = element.getAttribute("gradientUnits");
    const spreadValue = element.getAttribute("spreadMethod");
    const local = new SvgRadialGradient(unitsValue === "userSpaceOnUse" || unitsValue === "objectBoundingBox" ? unitsValue : null, getNumeric(element, "r", null)?.sizeValue ?? null, getNumeric(element, "cx", null)?.sizeValue ?? null, getNumeric(element, "cy", null)?.sizeValue ?? null, getNumeric(element, "fr", null)?.sizeValue ?? null, getNumeric(element, "fx", null)?.sizeValue ?? null, getNumeric(element, "fy", null)?.sizeValue ?? null, SvgTransform.fromString(element.getAttribute("gradientTransform")), stopData.colors, stopData.stops, stopData.opacities, spreadValue === "pad" || spreadValue === "reflect" || spreadValue === "repeat" ? spreadValue : null);
    const inherited = hrefElement(element, parser);
    return inherited?.name.local === "radialGradient" ? SvgRadialGradient.fromElement(inherited, parser, nextSeen).mergeWith(local) : local;
  }
  mergeWith(other) {
    return new SvgRadialGradient(other.gradientUnits ?? this.gradientUnits, other.r ?? this.r, other.cx ?? this.cx, other.cy ?? this.cy, other.fr ?? this.fr, other.fx ?? this.fx, other.fy ?? this.fy, other.transform.isNotEmpty ? other.transform : this.transform, other.colors.length > 0 ? other.colors : this.colors, other.stops.length > 0 ? other.stops : this.stops, other.opacityList.length > 0 ? other.opacityList : this.opacityList, other.hasSpreadMethod ? other.spreadMethod : this.spreadMethod);
  }
  buildGradient(operation, canvas) {
    const cx = this.cx ?? .5;
    const cy = this.cy ?? .5;
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: "radial",
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: {
          x: this.fx ?? cx,
          y: this.fy ?? cy
        },
        end: {
          x: cx,
          y: cy
        },
        radius0: this.fr ?? 0,
        radius1: this.r ?? .5,
        extendStart: true,
        extendEnd: true
      }),
      matrix: this.patternMatrix(operation, canvas)
    });
  }
}

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
      fill = this.fill;
    }
    let stroke = other.stroke ?? this.stroke;
    if (stroke?.inherit === true && this.stroke !== null && other.stroke !== null) {
      stroke = this.stroke;
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
    const paint = value => {
      if (parser.colorFilter === null && value !== null) {
        const gradient = SvgGradient.fromReference(value, parser);
        if (gradient !== null) {
          return gradient;
        }
      }
      return SvgColor.fromXml(value, parser, currentColor);
    };
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
      fill: paint(element.getAttribute("fill")),
      fillEvenOdd: fillRule === null ? null : fillRule === "evenodd",
      stroke: paint(element.getAttribute("stroke")),
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
      fill.setFillColor(this, canvas);
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
      stroke.setStrokeColor(this, canvas);
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
    const parent = BoxConstraints.from(constraints);
    const offeredWidth = this.width !== null || this.parser.width !== null ? constrain(this.width ?? this.parser.width, parent.maxWidth) : parent.hasBoundedWidth ? parent.maxWidth : constrain(this.parser.viewBox.width, parent.maxWidth);
    const offeredHeight = this.height !== null || this.parser.height !== null ? constrain(this.height ?? this.parser.height, parent.maxHeight) : parent.hasBoundedHeight ? parent.maxHeight : constrain(this.parser.viewBox.height, parent.maxHeight);
    const fitted = applyBoxFit(this.fit, size(this.parser.viewBox.width, this.parser.viewBox.height), size(offeredWidth, offeredHeight));
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, this.parser.viewBox.width, this.parser.viewBox.height);
    const constrainedSize = parent.constrain(fitted.destination);
    return {
      widget: this,
      width: constrainedSize.width,
      height: constrainedSize.height,
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

class Placeholder extends Widget {
  constructor({color = "#455a64", strokeWidth = 2, fallbackWidth = 400, fallbackHeight = 400} = {}) {
    super();
    this.color = normalizeColor(color);
    this.strokeWidth = Number(strokeWidth);
    this.fallbackWidth = Number(fallbackWidth);
    this.fallbackHeight = Number(fallbackHeight);
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const size = parent.constrain({
      width: parent.hasBoundedWidth ? parent.maxWidth : this.fallbackWidth,
      height: parent.hasBoundedHeight ? parent.maxHeight : this.fallbackHeight
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    context.canvas.strokeRect(box.x, box.y, box.width, box.height, this.color, this.strokeWidth);
    context.canvas.line(box.x, box.y, box.x + box.width, box.y + box.height, this.color, this.strokeWidth);
    context.canvas.line(box.x, box.y + box.height, box.x + box.width, box.y, this.color, this.strokeWidth);
  }
}

const PDF_LOGO_PATH = "M 2.424 26.712 L 2.424 26.712 C 2.076 26.712 1.742 26.599 1.457 26.386 C 0.416 25.605 0.276 24.736 0.342 24.144 C 0.524 22.516 2.537 20.812 6.327 19.076 C 7.831 15.78 9.262 11.719 10.115 8.326 C 9.117 6.154 8.147 3.336 8.854 1.683 C 9.102 1.104 9.411 0.66 9.988 0.468 C 10.216 0.392 10.792 0.296 11.004 0.296 C 11.508 0.296 11.951 0.945 12.265 1.345 C 12.56 1.721 13.229 2.518 11.892 8.147 C 13.24 10.931 15.15 13.767 16.98 15.709 C 18.291 15.472 19.419 15.351 20.338 15.351 C 21.904 15.351 22.853 15.716 23.24 16.468 C 23.56 17.09 23.429 17.817 22.85 18.628 C 22.293 19.407 21.525 19.819 20.63 19.819 C 19.414 19.819 17.998 19.051 16.419 17.534 C 13.582 18.127 10.269 19.185 7.591 20.356 C 6.755 22.13 5.954 23.559 5.208 24.607 C 4.183 26.042 3.299 26.712 2.424 26.712 Z M 5.086 21.586 C 2.949 22.787 2.078 23.774 2.015 24.33 C 2.005 24.422 1.978 24.664 2.446 25.022 C 2.595 24.975 3.465 24.578 5.086 21.586 Z M 18.723 17.144 C 19.538 17.771 19.737 18.088 20.27 18.088 C 20.504 18.088 21.171 18.078 21.48 17.647 C 21.629 17.438 21.687 17.304 21.71 17.232 C 21.587 17.167 21.424 17.035 20.535 17.035 C 20.03 17.036 19.395 17.058 18.723 17.144 Z M 11.253 10.562 C 10.538 13.036 9.594 15.707 8.579 18.126 C 10.669 17.315 12.941 16.607 15.075 16.106 C 13.725 14.538 12.376 12.58 11.253 10.562 Z M 10.646 2.1 C 10.548 2.133 9.316 3.857 10.742 5.316 C 11.691 3.201 10.689 2.086 10.646 2.1 Z";

class PdfLogo extends StatelessWidget {
  constructor({color = "#ff0000", fit = "contain"} = {}) {
    super();
    this.color = normalizeColor(color);
    this.fit = fit;
  }
  build() {
    return new SvgImage({
      svg: `<svg viewBox="0 0 24 27"><path d="${PDF_LOGO_PATH}" fill="#000000"/></svg>`,
      width: 24,
      height: 27,
      fit: this.fit,
      colorFilter: this.color
    });
  }
}

const FLUTTER_LOGO = '<?xml version="1.0" encoding="UTF-8"?><svg version="1.1" viewBox="0 0 256 317"><defs><linearGradient id="a" x1="10%" x2="67%" y1="40%" y2="35%"><stop stop-color="#1a237e" stop-opacity=".4" offset="0"/><stop stop-color="#1a237e" stop-opacity="0" offset="1"/></linearGradient></defs><polygon points="157.67 0 0 157.67 48.801 206.47 255.27 0" fill="#54c5f8"/><polygon points="156.57 145.4 72.149 229.82 121.13 279.53 169.84 230.82 255.27 145.4" fill="#54c5f8"/><polygon points="121.13 279.53 158.21 316.61 255.27 316.61 169.84 230.82" fill="#01579b"/><polygon points="71.6 230.36 120.4 181.56 169.84 230.82 121.13 279.53" fill="#29b6f6"/><polygon points="121.13 279.53 189.44 253.83 167.85 233.75" fill="url(#a)" fill-opacity=".8"/></svg>';

class FlutterLogo extends StatelessWidget {
  constructor({fit = "contain"} = {}) {
    super();
    this.fit = fit;
  }
  build() {
    return new SvgImage({
      svg: FLUTTER_LOGO,
      fit: this.fit
    });
  }
}

class SeededLoremRandom {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  nextInt(maximum) {
    if (!Number.isInteger(maximum) || maximum <= 0) {
      throw new RangeError("LoremRandom.nextInt maximum must be a positive integer");
    }
    this.state = Math.imul(this.state, 1664525) + 1013904223 >>> 0;
    return Math.floor(this.state / 4294967296 * maximum);
  }
}

class LoremText {
  constructor({random = null} = {}) {
    this.random = random ?? new SeededLoremRandom(978);
  }
  word() {
    return LoremText.words[this.random.nextInt(LoremText.words.length)];
  }
  sentence(length) {
    const count = Math.max(0, Math.floor(length));
    if (count === 0) return "";
    const words = [];
    for (let index = 0; index < count; index++) {
      let word = this.word();
      if (index + 1 < count && this.random.nextInt(10) === 0) word += ",";
      words.push(word);
    }
    const value = `${words.join(" ")}.`;
    return value[0].toUpperCase() + value.slice(1);
  }
  paragraph(length) {
    const target = Math.max(0, Math.floor(length));
    const sentences = [];
    let remaining = target;
    while (remaining > 0) {
      const maximum = Math.min(10, remaining);
      const minimum = Math.min(3, maximum);
      const count = minimum + (maximum === minimum ? 0 : this.random.nextInt(maximum - minimum + 1));
      sentences.push(this.sentence(count));
      remaining -= count;
    }
    return sentences.join(" ");
  }
}

LoremText.words = Object.freeze("ad adipiscing aliqua aliquip amet anim aute cillum commodo consectetur consequat culpa cupidatat deserunt do dolor dolore duis ea eiusmod elit enim esse est et eu ex excepteur exercitation fugiat id in incididunt ipsum irure labore laboris laborum lorem magna minim mollit nisi non nostrud nulla occaecat officia pariatur proident qui quis reprehenderit sed sint sit sunt tempor ullamco ut velit veniam voluptate".split(" "));

class Lorem extends StatelessWidget {
  constructor({length = 50, random = null, style = null, textAlign = "left", softWrap = true, textScaleFactor = 1, maxLines = null} = {}) {
    super();
    this.length = Math.max(0, Math.floor(length));
    this.value = new LoremText({
      random
    }).paragraph(this.length);
    this.style = style;
    this.textAlign = textAlign;
    this.softWrap = softWrap;
    this.textScaleFactor = Number(textScaleFactor);
    this.maxLines = maxLines;
  }
  build() {
    return new Text(this.value, {
      style: this.style ?? undefined,
      textAlign: this.textAlign,
      softWrap: this.softWrap,
      textScaleFactor: this.textScaleFactor,
      maxLines: this.maxLines ?? undefined
    });
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
    const parent = BoxConstraints.from(constraints);
    const scale = Math.min(1, parent.maxWidth / this.width, parent.maxHeight / this.height);
    const size = parent.constrain({
      width: this.width * scale,
      height: this.height * scale
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
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

class Positioned extends Widget {
  constructor({left = null, top = null, right = null, bottom = null, width = null, height = null, child}) {
    super();
    this.left = left === null ? null : Number(left);
    this.top = top === null ? null : Number(top);
    this.right = right === null ? null : Number(right);
    this.bottom = bottom === null ? null : Number(bottom);
    this.width = width === null ? null : Math.max(0, Number(width));
    this.height = height === null ? null : Math.max(0, Number(height));
    this.child = child;
  }
  static fill({left = 0, top = 0, right = 0, bottom = 0, child}) {
    return new Positioned({
      left,
      top,
      right,
      bottom,
      child
    });
  }
  static directional({textDirection, start = null, top = null, end = null, bottom = null, width = null, height = null, child}) {
    return new Positioned({
      left: textDirection === "rtl" ? end : start,
      right: textDirection === "rtl" ? start : end,
      top,
      bottom,
      width,
      height,
      child
    });
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints).tighten({
      width: this.width,
      height: this.height
    });
    const childBox = this.child.layout(context, parent);
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

class PositionedDirectional extends Positioned {
  constructor({start = null, top = null, end = null, bottom = null, width = null, height = null, child, textDirection = "ltr"}) {
    super({
      left: textDirection === "rtl" ? end : start,
      right: textDirection === "rtl" ? start : end,
      top,
      bottom,
      width,
      height,
      child
    });
    this.start = start;
    this.end = end;
    this.textDirection = textDirection;
  }
  static fill({start = 0, top = 0, end = 0, bottom = 0, child, textDirection = "ltr"}) {
    return new PositionedDirectional({
      start,
      top,
      end,
      bottom,
      child,
      textDirection
    });
  }
}

class Stack extends Widget {
  constructor({alignment = Alignment.topLeft, fit = "loose", overflow = "clip", children = []} = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
    if (![ "loose", "expand", "passthrough" ].includes(fit)) {
      throw new TypeError(`Unknown StackFit: ${fit}`);
    }
    if (overflow !== "visible" && overflow !== "clip") {
      throw new TypeError(`Unknown Stack overflow: ${overflow}`);
    }
    this.fit = fit;
    this.overflow = overflow;
    this.children = children;
  }
  layout(context, incoming) {
    const constraints = BoxConstraints.from(incoming);
    const measured = new Map;
    let width = constraints.minWidth;
    let height = constraints.minHeight;
    let hasNonPositioned = false;
    const nonPositionedConstraints = this.fit === "loose" ? constraints.loosen() : this.fit === "expand" ? BoxConstraints.tight(constraints.biggest) : constraints;
    for (const child of this.children) {
      if (child instanceof Positioned) continue;
      hasNonPositioned = true;
      const childBox = child.layout(context, nonPositionedConstraints);
      measured.set(child, childBox);
      width = Math.max(width, childBox.width);
      height = Math.max(height, childBox.height);
    }
    const size = hasNonPositioned ? constraints.constrain({
      width,
      height
    }) : constraints.constrain({
      width: constraints.hasBoundedWidth ? constraints.maxWidth : 0,
      height: constraints.hasBoundedHeight ? constraints.maxHeight : 0
    });
    const placed = [];
    for (const child of this.children) {
      if (!(child instanceof Positioned)) {
        const childBox = measured.get(child);
        const offset = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
        placed.push({
          box: childBox,
          dx: offset.dx,
          dy: offset.dy
        });
        continue;
      }
      let positionedConstraints = new BoxConstraints;
      const tightWidth = child.left !== null && child.right !== null ? Math.max(0, size.width - child.left - child.right) : child.width;
      const tightHeight = child.top !== null && child.bottom !== null ? Math.max(0, size.height - child.top - child.bottom) : child.height;
      positionedConstraints = positionedConstraints.tighten({
        width: tightWidth,
        height: tightHeight
      });
      const childBox = child.layout(context, positionedConstraints);
      const aligned = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
      const dx = child.left !== null ? child.left : child.right !== null ? size.width - child.right - childBox.width : aligned.dx;
      const dy = child.top !== null ? child.top : child.bottom !== null ? size.height - child.bottom - childBox.height : aligned.dy;
      placed.push({
        box: childBox,
        dx,
        dy
      });
    }
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        children: placed
      }
    };
  }
  paint(context, box) {
    if (this.overflow === "clip") {
      context.canvas.saveContext();
      context.canvas.drawRect(box.x, context.canvas.pageHeight - box.y - box.height, box.width, box.height);
      context.canvas.clipPath();
    }
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
    if (this.overflow === "clip") context.canvas.restoreContext();
  }
}

function side(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const width = Math.max(0, assertFiniteNumber(Number(input.width ?? 1), "border width"));
  if (width === 0) {
    return null;
  }
  return {
    color: normalizeColor(input.color ?? "#000000"),
    width
  };
}

class TableBorder {
  constructor({left = null, top = null, right = null, bottom = null, horizontalInside = null, verticalInside = null} = {}) {
    this.left = side(left);
    this.top = side(top);
    this.right = side(right);
    this.bottom = side(bottom);
    this.horizontalInside = side(horizontalInside);
    this.verticalInside = side(verticalInside);
  }
  static all({color = "#000000", width = 1} = {}) {
    const value = {
      color,
      width
    };
    return new TableBorder({
      left: value,
      top: value,
      right: value,
      bottom: value,
      horizontalInside: value,
      verticalInside: value
    });
  }
  static symmetric({inside = null, outside = null} = {}) {
    return new TableBorder({
      left: outside,
      top: outside,
      right: outside,
      bottom: outside,
      horizontalInside: inside,
      verticalInside: inside
    });
  }
  paint(context, x, y, width, height, columnWidths = [], rowHeights = []) {
    const {canvas} = context;
    const draw = (value, x1, y1, x2, y2) => {
      if (value !== null) {
        canvas.line(x1, y1, x2, y2, value.color, value.width);
      }
    };
    draw(this.top, x, y, x + width, y);
    draw(this.right, x + width, y, x + width, y + height);
    draw(this.bottom, x, y + height, x + width, y + height);
    draw(this.left, x, y, x, y + height);
    let offset = x;
    for (let index = 0; index < columnWidths.length - 1; index++) {
      offset += columnWidths[index];
      draw(this.verticalInside, offset, y, offset, y + height);
    }
    offset = y;
    for (let index = 0; index < rowHeights.length - 1; index++) {
      offset += rowHeights[index];
      draw(this.horizontalInside, x, offset, x + width, offset);
    }
  }
}

function normalizeTableBorder(input) {
  if (input === null || input === undefined) {
    return null;
  }
  return input instanceof TableBorder ? input : new TableBorder(input);
}

function paintTableDecorationBackground(context, decoration, x, y, width, height) {
  normalizeBoxDecoration(decoration)?.paint(context, x, y, width, height, "background");
}

function paintTableDecorationBorder(context, decoration, x, y, width, height) {
  normalizeBoxDecoration(decoration)?.paint(context, x, y, width, height, "foreground");
}

class TableRow {
  constructor({children, repeat = false, verticalAlignment = null, decoration = null}) {
    this.children = children;
    this.repeat = Boolean(repeat);
    this.verticalAlignment = verticalAlignment;
    this.decoration = decoration;
  }
}

class TableColumnWidth {}

class IntrinsicColumnWidth extends TableColumnWidth {
  constructor({flex = null} = {}) {
    super();
    this.flex = flex === null ? null : Math.max(0, assertFiniteNumber(Number(flex), "intrinsic column flex"));
  }
  layout(child, context, constraints) {
    if (this.flex !== null) {
      return {
        width: 0,
        flex: this.flex
      };
    }
    const box = child.layout(context, constraints);
    return {
      width: Number.isFinite(box.width) ? Math.max(0, box.width) : 0,
      flex: Number.isFinite(box.width) ? 0 : 1
    };
  }
}

class FixedColumnWidth extends TableColumnWidth {
  constructor(width) {
    super();
    this.width = Math.max(0, assertFiniteNumber(Number(width), "fixed column width"));
  }
  layout() {
    return {
      width: this.width,
      flex: 0
    };
  }
}

class FlexColumnWidth extends TableColumnWidth {
  constructor(flex = 1) {
    super();
    this.flex = Math.max(0, assertFiniteNumber(Number(flex), "column flex"));
  }
  layout() {
    return {
      width: 0,
      flex: this.flex
    };
  }
}

class FractionColumnWidth extends TableColumnWidth {
  constructor(value) {
    super();
    this.value = Math.max(0, assertFiniteNumber(Number(value), "column fraction"));
  }
  layout(_child, _context, constraints) {
    return {
      width: constraints.maxWidth * this.value,
      flex: 0
    };
  }
}

function mappedWidth(map, index) {
  if (map === null) return undefined;
  if (map instanceof Map) return map.get(index);
  return map[index];
}

class Table extends SpanningWidget {
  constructor({children = [], border = null, defaultVerticalAlignment = "top", columnWidths = null, defaultColumnWidth = new IntrinsicColumnWidth, tableWidth = "max"} = {}) {
    super();
    if (![ "bottom", "middle", "top", "full" ].includes(defaultVerticalAlignment)) {
      throw new TypeError(`Unknown table vertical alignment: ${defaultVerticalAlignment}`);
    }
    if (tableWidth !== "min" && tableWidth !== "max") {
      throw new TypeError(`Unknown table width: ${tableWidth}`);
    }
    this.children = children;
    this.border = normalizeTableBorder(border);
    this.defaultVerticalAlignment = defaultVerticalAlignment;
    this.columnWidths = columnWidths;
    this.defaultColumnWidth = defaultColumnWidth;
    this.tableWidth = tableWidth;
  }
  resolveWidths(context, constraints) {
    const count = this.children.reduce((maximum, row) => Math.max(maximum, row.children.length), 0);
    const widths = Array.from({
      length: count
    }, () => 0);
    const flex = Array.from({
      length: count
    }, () => 0);
    for (const row of this.children) {
      for (let index = 0; index < row.children.length; index++) {
        const child = row.children[index];
        const columnWidth = mappedWidth(this.columnWidths, index) ?? this.defaultColumnWidth;
        const measured = columnWidth.layout(child, context, constraints);
        widths[index] = Math.max(widths[index], measured.width);
        flex[index] = Math.max(flex[index], measured.flex);
      }
    }
    if (count === 0 || !Number.isFinite(constraints.maxWidth)) {
      return widths;
    }
    const maximum = Math.max(0, constraints.maxWidth);
    const totalFlex = flex.reduce((sum, value) => sum + value, 0);
    const intrinsicTotal = widths.reduce((sum, value) => sum + value, 0);
    if (totalFlex > 0) {
      let fixedSpace = widths.reduce((sum, value, index) => sum + (flex[index] === 0 ? value : 0), 0);
      if (fixedSpace > maximum && fixedSpace > 0) {
        const scale = maximum / fixedSpace;
        for (let index = 0; index < count; index++) {
          if (flex[index] === 0) widths[index] = widths[index] * scale;
        }
        fixedSpace = maximum;
      }
      const remaining = Math.max(0, maximum - fixedSpace);
      for (let index = 0; index < count; index++) {
        if (flex[index] > 0) widths[index] = remaining * flex[index] / totalFlex;
      }
      return widths;
    }
    if (this.tableWidth === "max") {
      if (intrinsicTotal === 0) {
        return widths.map(() => count === 0 ? 0 : maximum / count);
      }
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }
    if (intrinsicTotal > maximum && intrinsicTotal > 0) {
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }
    return widths;
  }
  layoutRows(context, _constraints, columnWidths, selectedRows) {
    if (columnWidths.length === 0) {
      return {
        widget: this,
        width: 0,
        height: 0,
        data: {
          columnWidths,
          rowHeights: [],
          rows: []
        }
      };
    }
    const rows = [];
    const rowHeights = [];
    let rowY = 0;
    for (const row of selectedRows) {
      const measured = [];
      let x = 0;
      let rowHeight = 0;
      for (let column = 0; column < row.children.length; column++) {
        const child = row.children[column];
        const width = columnWidths[column] ?? 0;
        const box = child.layout(context, new BoxConstraints({
          minWidth: width,
          maxWidth: width,
          maxHeight: Infinity
        }));
        measured.push({
          box,
          column,
          x
        });
        rowHeight = Math.max(rowHeight, box.height);
        x += width;
      }
      const alignment = row.verticalAlignment ?? this.defaultVerticalAlignment;
      const cells = measured.map(cell => {
        const height = alignment === "full" ? rowHeight : cell.box.height;
        const dy = alignment === "bottom" ? rowHeight - cell.box.height : alignment === "middle" ? (rowHeight - cell.box.height) / 2 : 0;
        return {
          ...cell,
          y: rowY + dy,
          width: columnWidths[cell.column] ?? 0,
          height
        };
      });
      rows.push({
        row,
        cells,
        y: rowY,
        height: rowHeight
      });
      rowHeights.push(rowHeight);
      rowY += rowHeight;
    }
    return {
      widget: this,
      width: columnWidths.reduce((sum, value) => sum + value, 0),
      height: rowY,
      data: {
        columnWidths,
        rowHeights,
        rows
      }
    };
  }
  layout(context, constraints) {
    const columnWidths = this.resolveWidths(context, constraints);
    return this.layoutRows(context, constraints, columnWidths, this.children);
  }
  initialSpanState() {
    return Object.freeze({
      nextRow: 0
    });
  }
  layoutSpan(context, constraints, state) {
    const nextRow = Number(state.nextRow);
    if (!Number.isInteger(nextRow) || nextRow < 0 || nextRow > this.children.length) {
      throw new RangeError("Invalid table continuation state");
    }
    const columnWidths = this.resolveWidths(context, constraints);
    const candidates = [];
    for (let index = 0; index < this.children.length; index++) {
      const row = this.children[index];
      if (index >= nextRow || row.repeat) {
        candidates.push({
          row,
          index
        });
      }
    }
    const measured = this.layoutRows(context, constraints, columnWidths, candidates.map(candidate => candidate.row));
    let height = 0;
    let count = 0;
    let followingRow = nextRow;
    for (let index = 0; index < measured.data.rows.length; index++) {
      const rowHeight = measured.data.rowHeights[index] ?? 0;
      if (height + rowHeight > constraints.maxHeight + .001) {
        break;
      }
      height += rowHeight;
      count++;
      const originalIndex = candidates[index].index;
      if (originalIndex >= followingRow) {
        followingRow = originalIndex + 1;
      }
    }
    const hasMore = followingRow < this.children.length;
    if (hasMore && followingRow === nextRow) {
      const emptyBox = {
        widget: this,
        width: columnWidths.reduce((sum, value) => sum + value, 0),
        height: 0,
        data: {
          columnWidths,
          rowHeights: [],
          rows: []
        }
      };
      return {
        box: emptyBox,
        nextState: state,
        hasMore: true
      };
    }
    const rows = measured.data.rows.slice(0, count);
    const rowHeights = measured.data.rowHeights.slice(0, count);
    const box = {
      widget: this,
      width: measured.width,
      height,
      data: {
        columnWidths,
        rowHeights,
        rows
      }
    };
    return {
      box,
      nextState: Object.freeze({
        nextRow: followingRow
      }),
      hasMore
    };
  }
  paint(context, box) {
    const {canvas} = context;
    for (const row of box.data.rows) {
      paintTableDecorationBackground(context, row.row.decoration, box.x, box.y + row.y, box.width, row.height);
      for (const cell of row.cells) {
        canvas.saveContext();
        canvas.drawRect(box.x + cell.x, canvas.pageHeight - box.y - cell.y - cell.height, cell.width, cell.height);
        canvas.clipPath();
        cell.box.widget.paint(context, {
          ...cell.box,
          x: box.x + cell.x,
          y: box.y + cell.y,
          width: cell.width,
          height: cell.height
        });
        canvas.restoreContext();
      }
    }
    for (const row of box.data.rows) {
      paintTableDecorationBorder(context, row.row.decoration, box.x, box.y + row.y, box.width, row.height);
    }
    this.border?.paint(context, box.x, box.y, box.width, box.height, box.data.columnWidths, box.data.rowHeights);
  }
}

function indexed(values, index) {
  if (values === null) return undefined;
  if (values instanceof Map) return values.get(index);
  return values[index];
}

function alignment(value) {
  if (typeof value !== "string") {
    return value;
  }
  const resolved = Alignment[value];
  if (resolved === undefined) {
    throw new TypeError(`Unknown table alignment: ${value}`);
  }
  return resolved;
}

function textAlign(value) {
  if (value.x === 0) return "center";
  return value.x < 0 ? "left" : "right";
}

class TableText extends Widget {
  constructor(value, header, style, align) {
    super();
    this.value = value;
    this.header = header;
    this.style = style;
    this.align = align;
  }
  layout(context, constraints) {
    const child = new Text(this.value, {
      style: this.style ?? (this.header ? context.theme.tableHeader : context.theme.tableCell),
      align: this.align
    });
    const childBox = child.layout(context, constraints);
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
      y: box.y,
      width: box.width
    });
  }
}

class HelperCell extends Widget {
  constructor({child, padding, minimumHeight, alignment: cellAlignment, decoration, expandChildWidth}) {
    super();
    this.child = child;
    this.padding = normalizeInsets(padding);
    this.minimumHeight = Math.max(0, assertFiniteNumber(Number(minimumHeight), "table cell height"));
    this.alignment = cellAlignment;
    this.decoration = decoration;
    this.expandChildWidth = expandChildWidth;
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);
    const childBox = this.child.layout(context, parent.deflate(this.padding));
    const size = parent.constrain({
      width: childBox.width + horizontal,
      height: Math.max(this.minimumHeight, childBox.height + vertical)
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox
      }
    };
  }
  paint(context, box) {
    paintTableDecorationBackground(context, this.decoration, box.x, box.y, box.width, box.height);
    const {childBox} = box.data;
    const innerWidth = Math.max(0, box.width - insetsHorizontal(this.padding));
    const innerHeight = Math.max(0, box.height - insetsVertical(this.padding));
    const childWidth = this.expandChildWidth ? innerWidth : childBox.width;
    const offset = inscribe(this.alignment, childWidth, childBox.height, innerWidth, innerHeight);
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left + offset.dx,
      y: box.y + this.padding.top + offset.dy,
      width: childWidth
    });
    paintTableDecorationBorder(context, this.decoration, box.x, box.y, box.width, box.height);
  }
}

const defaultBorder = TableBorder.all();

class TableHelper {
  static fromTextArray({data, cellPadding = 5, cellHeight = 0, cellAlignment = "topLeft", cellAlignments = null, cellStyle = null, oddCellStyle = cellStyle, cellFormat = null, cellDecoration = null, headerCount = 1, headers = null, headerPadding = cellPadding, headerHeight = cellHeight, headerAlignment = "center", headerAlignments = cellAlignments, headerStyle = null, headerFormat = null, border = defaultBorder, columnWidths = null, defaultColumnWidth = new IntrinsicColumnWidth, tableWidth = "max", headerDecoration = null, headerCellDecoration = null, rowDecoration = null, oddRowDecoration = rowDecoration, cellBuilder = null, textStyleBuilder = null}) {
    if (!Array.isArray(data)) {
      throw new TypeError("TableHelper.fromTextArray requires a data array");
    }
    const normalizedHeaderCount = Math.trunc(assertFiniteNumber(Number(headerCount), "headerCount"));
    if (normalizedHeaderCount < 0) {
      throw new RangeError("headerCount must not be negative");
    }
    const rows = [];
    let rowNumber = 0;
    const makeCell = (value, column, isHeader, padding, minimumHeight, cellAlignmentValue, decoration) => {
      const resolvedAlignment = alignment(cellAlignmentValue);
      if (value instanceof Widget) {
        return new HelperCell({
          child: value,
          padding,
          minimumHeight,
          alignment: resolvedAlignment,
          decoration,
          expandChildWidth: false
        });
      }
      const built = !isHeader ? cellBuilder?.(column, value, rowNumber) ?? null : null;
      if (built !== null) {
        if (!(built instanceof Widget)) {
          throw new TypeError("cellBuilder must return a Widget or null");
        }
        return new HelperCell({
          child: built,
          padding,
          minimumHeight,
          alignment: resolvedAlignment,
          decoration,
          expandChildWidth: false
        });
      }
      const formatter = isHeader ? headerFormat : cellFormat;
      const formatted = formatter === null ? String(value) : formatter(column, value);
      const isOdd = (rowNumber - normalizedHeaderCount) % 2 !== 0;
      const style = isHeader ? headerStyle : textStyleBuilder?.(column, value, rowNumber) ?? (isOdd ? oddCellStyle : cellStyle);
      return new HelperCell({
        child: new TableText(formatted, isHeader, style, textAlign(resolvedAlignment)),
        padding,
        minimumHeight,
        alignment: resolvedAlignment,
        decoration,
        expandChildWidth: true
      });
    };
    if (headers !== null) {
      const cells = headers.map((value, column) => makeCell(value, column, true, headerPadding ?? cellPadding, headerHeight ?? cellHeight, indexed(headerAlignments, column) ?? headerAlignment, headerCellDecoration));
      rows.push(new TableRow({
        children: cells,
        repeat: true,
        decoration: headerDecoration
      }));
      rowNumber++;
    }
    for (const row of data) {
      const isHeader = rowNumber < normalizedHeaderCount;
      const isOdd = (rowNumber - normalizedHeaderCount) % 2 !== 0;
      const cells = row.map((value, column) => makeCell(value, column, isHeader, isHeader ? headerPadding ?? cellPadding : cellPadding, isHeader ? headerHeight ?? cellHeight : cellHeight, isHeader ? indexed(headerAlignments, column) ?? headerAlignment : indexed(cellAlignments, column) ?? cellAlignment, isHeader ? null : cellDecoration?.(column, value, rowNumber) ?? null));
      rows.push(new TableRow({
        children: cells,
        repeat: isHeader,
        decoration: isHeader ? headerDecoration : isOdd ? oddRowDecoration : rowDecoration
      }));
      rowNumber++;
    }
    return new Table({
      border,
      tableWidth,
      children: rows,
      columnWidths,
      defaultColumnWidth,
      defaultVerticalAlignment: "full"
    });
  }
}

function validateAlignment(value, name) {
  if (![ "start", "end", "center", "spaceBetween", "spaceAround", "spaceEvenly" ].includes(value)) {
    throw new TypeError(`Unknown ${name}: ${value}`);
  }
}

function spaces(alignment, free, count) {
  switch (alignment) {
   case "end":
    return [ free, 0 ];

   case "center":
    return [ free / 2, 0 ];

   case "spaceBetween":
    return [ 0, count > 1 ? free / (count - 1) : 0 ];

   case "spaceAround":
    {
      const between = count > 0 ? free / count : 0;
      return [ between / 2, between ];
    }

   case "spaceEvenly":
    {
      const between = free / (count + 1);
      return [ between, between ];
    }

   default:
    return [ 0, 0 ];
  }
}

class Wrap extends SpanningWidget {
  constructor({direction = "horizontal", alignment = "start", spacing = 0, runAlignment = "start", runSpacing = 0, crossAxisAlignment = "start", verticalDirection = "down", children = []} = {}) {
    super();
    if (direction !== "horizontal" && direction !== "vertical") {
      throw new TypeError(`Unknown Wrap axis: ${direction}`);
    }
    validateAlignment(alignment, "WrapAlignment");
    validateAlignment(runAlignment, "runAlignment");
    if (![ "start", "end", "center" ].includes(crossAxisAlignment)) {
      throw new TypeError(`Unknown WrapCrossAlignment: ${crossAxisAlignment}`);
    }
    if (verticalDirection !== "down" && verticalDirection !== "up") {
      throw new TypeError(`Unknown verticalDirection: ${verticalDirection}`);
    }
    this.direction = direction;
    this.alignment = alignment;
    this.spacing = Math.max(0, Number(spacing));
    this.runAlignment = runAlignment;
    this.runSpacing = Math.max(0, Number(runSpacing));
    this.crossAxisAlignment = crossAxisAlignment;
    this.verticalDirection = verticalDirection;
    this.children = children;
  }
  initialSpanState() {
    return {
      firstChild: 0
    };
  }
  fragment(context, incoming, state) {
    const constraints = BoxConstraints.from(incoming);
    const horizontal = this.direction === "horizontal";
    const maxMain = horizontal ? constraints.maxWidth : constraints.maxHeight;
    const maxCross = horizontal ? constraints.maxHeight : constraints.maxWidth;
    const childConstraints = horizontal ? new BoxConstraints({
      maxWidth: maxMain
    }) : new BoxConstraints({
      maxHeight: maxMain
    });
    const runs = [];
    let current = [];
    let currentMain = 0;
    let currentCross = 0;
    const closeRun = () => {
      if (current.length === 0) return;
      runs.push({
        children: current,
        main: currentMain,
        cross: currentCross
      });
      current = [];
      currentMain = 0;
      currentCross = 0;
    };
    for (let index = state.firstChild; index < this.children.length; index++) {
      const box = this.children[index].layout(context, childConstraints);
      const main = horizontal ? box.width : box.height;
      const cross = horizontal ? box.height : box.width;
      if (current.length > 0 && currentMain + this.spacing + main > maxMain) {
        closeRun();
      }
      const nextCrossTotal = runs.reduce((sum, run) => sum + run.cross, 0) + this.runSpacing * runs.length + Math.max(currentCross, cross);
      if (current.length === 0 && runs.length > 0 && nextCrossTotal > maxCross + 1e-6) {
        break;
      }
      current.push({
        index,
        box,
        main,
        cross
      });
      currentMain += (current.length > 1 ? this.spacing : 0) + main;
      currentCross = Math.max(currentCross, cross);
    }
    closeRun();
    let usedCross = runs.reduce((sum, run) => sum + run.cross, 0) + this.runSpacing * Math.max(0, runs.length - 1);
    while (runs.length > 0 && Number.isFinite(maxCross) && usedCross > maxCross + 1e-6) {
      const removed = runs.pop();
      usedCross -= removed.cross + (runs.length > 0 ? this.runSpacing : 0);
    }
    const maxRunMain = runs.reduce((value, run) => Math.max(value, run.main), 0);
    const natural = horizontal ? {
      width: maxRunMain,
      height: usedCross
    } : {
      width: usedCross,
      height: maxRunMain
    };
    const size = constraints.constrain(natural);
    const containerMain = horizontal ? size.width : size.height;
    const containerCross = horizontal ? size.height : size.width;
    const [runLeading, runBetweenExtra] = spaces(this.runAlignment, Math.max(0, containerCross - usedCross), runs.length);
    const reverseRuns = horizontal && this.verticalDirection === "up";
    let crossCursor = reverseRuns ? containerCross - runLeading : runLeading;
    const placed = [];
    for (const run of runs) {
      if (reverseRuns) crossCursor -= run.cross;
      const [childLeading, childBetweenExtra] = spaces(this.alignment, Math.max(0, containerMain - run.main), run.children.length);
      const reverseChildren = !horizontal && this.verticalDirection === "up";
      let mainCursor = reverseChildren ? containerMain - childLeading : childLeading;
      for (const child of run.children) {
        if (reverseChildren) mainCursor -= child.main;
        const freeCross = run.cross - child.cross;
        const childCross = this.crossAxisAlignment === "end" ? freeCross : this.crossAxisAlignment === "center" ? freeCross / 2 : 0;
        placed.push({
          box: child.box,
          dx: horizontal ? mainCursor : crossCursor + childCross,
          dy: horizontal ? crossCursor + childCross : mainCursor
        });
        const advance = child.main + this.spacing + childBetweenExtra;
        mainCursor += reverseChildren ? -advance : advance;
      }
      const runAdvance = run.cross + this.runSpacing + runBetweenExtra;
      crossCursor += reverseRuns ? -runAdvance : runAdvance;
    }
    const lastChild = placed.length === 0 ? state.firstChild : Math.max(...runs.flatMap(run => run.children.map(child => child.index))) + 1;
    const data = {
      children: placed,
      firstChild: state.firstChild,
      lastChild,
      runCount: runs.length
    };
    const nextState = {
      firstChild: lastChild
    };
    return {
      box: {
        widget: this,
        width: size.width,
        height: size.height,
        data
      },
      nextState,
      hasMore: lastChild < this.children.length
    };
  }
  layout(context, constraints) {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }
  layoutSpan(context, constraints, state) {
    return this.fragment(context, constraints, state);
  }
  paint(context, box) {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
  }
}

const publicApi = Object.freeze({
  Document,
  Page,
  MultiPage,
  Text,
  InlineSpan,
  RichText,
  TextSpan,
  WidgetSpan,
  Header,
  Paragraph,
  Bullet,
  TableOfContent,
  ClipRect,
  ClipRRect,
  ClipOval,
  Placeholder,
  PdfLogo,
  FlutterLogo,
  LoremText,
  Lorem,
  Column,
  Row,
  Flex,
  Flexible,
  Expanded,
  Container,
  DecoratedBox,
  BoxDecoration,
  BoxShadow,
  Gradient,
  LinearGradient,
  RadialGradient,
  BoxBorder,
  Border,
  BorderSide,
  BorderStyle,
  BorderRadiusGeometry,
  BorderRadius,
  BorderRadiusDirectional,
  Radius,
  GridView,
  Stack,
  Positioned,
  PositionedDirectional,
  Wrap,
  Partition,
  Partitions,
  Spacer,
  Vector,
  Padding,
  Align,
  Center,
  ConstrainedBox,
  SizedBox,
  Divider,
  Transform,
  Opacity,
  OverflowBox,
  FittedBox,
  AspectRatio,
  FullPage,
  Builder,
  LayoutBuilder,
  CustomPaint,
  LimitedBox,
  VerticalDivider,
  Image,
  ImageProvider,
  ImageProxy,
  MemoryImage,
  RawImage,
  SvgImage,
  Table,
  TableRow,
  TableBorder,
  TableColumnWidth,
  IntrinsicColumnWidth,
  FixedColumnWidth,
  FlexColumnWidth,
  FractionColumnWidth,
  TableHelper,
  SpanningWidget,
  Alignment,
  BoxConstraints,
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

export { Align, Alignment, AspectRatio, Border, BorderRadius, BorderRadiusDirectional, BorderRadiusGeometry, BorderSide, BorderStyle, BoxBorder, BoxConstraints, BoxDecoration, BoxShadow, Builder, Bullet, Center, ClipOval, ClipRRect, ClipRect, Column, ConstrainedBox, Container, CustomPaint, DecoratedBox, DefaultTextStyle, Divider, Document, EdgeInsets, Expanded, FittedBox, FixedColumnWidth, Flex, FlexColumnWidth, Flexible, FlutterLogo, Font, FractionColumnWidth, FullPage, Gradient, GridView, Header, Image, ImageProvider, ImageProxy, InlineSpan, IntrinsicColumnWidth, LayoutBuilder, LimitedBox, LinearGradient, Lorem, LoremText, MemoryImage, MultiPage, Opacity, OverflowBox, Padding, Page, PageFormat, PageTheme, Paragraph, Partition, Partitions, PdfFontMetrics, PdfGraphicState, PdfImage, PdfLogo, PdfPoint, PdfRect, PdfTtfFont, PdfType1Font, Placeholder, Positioned, PositionedDirectional, RadialGradient, Radius, RawImage, RichText, Row, SizedBox, Spacer, SpanningWidget, Stack, StatelessWidget, SvgImage, Table, TableBorder, TableColumnWidth, TableHelper, TableOfContent, TableRow, Text, TextSpan, TextStyle, Theme, ThemeData, Transform, Vector, VerticalDivider, Widget, WidgetSpan, Wrap, composeMatrices, createPdf, decodePng, flipMatrix, identityMatrix, inflateZlib, invertMatrix, js_pdf, multiplyMatrix, parseJpeg, rotationMatrix, scaleMatrix, skewMatrix, transformPoint, translationMatrix };

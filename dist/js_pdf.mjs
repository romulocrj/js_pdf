/*
 * romulocrj/js_pdf — JavaScript port of DavBfr/dart_pdf.
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
    return `<< /Type /Font /Subtype /Type1 /BaseFont /${this.fontName} /Encoding /WinAnsiEncoding >>`;
  }
}

const defaultPdfFont = PdfType1Font.helvetica();

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  const rounded = Math.abs(value) < 1e-6 ? 0 : value;
  return Number(rounded.toFixed(4)).toString();
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

class Widget {}

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

function encodeLatin1(value) {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    result[index] = value.charCodeAt(index) & 255;
  }
  return result;
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function metadataDictionary(metadata) {
  const entries = [];
  if (metadata.title) entries.push(`/Title ${pdfLiteral(metadata.title)}`);
  if (metadata.author) entries.push(`/Author ${pdfLiteral(metadata.author)}`);
  if (metadata.subject) entries.push(`/Subject ${pdfLiteral(metadata.subject)}`);
  if (metadata.creator) entries.push(`/Creator ${pdfLiteral(metadata.creator)}`);
  if (metadata.producer) entries.push(`/Producer ${pdfLiteral(metadata.producer)}`);
  return `<< ${entries.join(" ")} >>`;
}

function serializePdf(pages, metadata, font = defaultPdfFont) {
  const objects = [ null ];
  const allocate = body => {
    objects.push(body);
    return objects.length - 1;
  };
  const catalogId = allocate("");
  const pagesId = allocate("");
  const fontId = allocate(font.resourceDict());
  const infoId = allocate(metadataDictionary(metadata));
  const pageIds = [];
  for (const page of pages) {
    const contentBytes = encodeLatin1(page.content);
    const contentId = allocate(`<< /Length ${contentBytes.length} >>\nstream\n${page.content}endstream`);
    const pageId = allocate(`<< /Type /Page /Parent ${pagesId} 0 R ` + `/MediaBox [0 0 ${formatNumber(page.format.width)} ${formatNumber(page.format.height)}] ` + `/Resources << /Font << /F1 ${fontId} 0 R >> >> ` + `/Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const header = encodeLatin1("%PDF-1.7\n%âãÏÓ\n");
  const chunks = [ header ];
  const xrefLines = [ "0000000000 65535 f \n" ];
  let byteOffset = header.length;
  for (let id = 1; id < objects.length; id++) {
    const body = objects[id];
    if (body == null) {
      throw new Error(`PDF object ${id} was allocated but never filled`);
    }
    xrefLines.push(`${String(byteOffset).padStart(10, "0")} 00000 n \n`);
    const bytes = encodeLatin1(`${id} 0 obj\n${body}\nendobj\n`);
    chunks.push(bytes);
    byteOffset += bytes.length;
  }
  const xrefOffset = byteOffset;
  const trailer = [ `xref\n0 ${objects.length}\n`, xrefLines.join(""), `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`, `startxref\n${xrefOffset}\n%%EOF\n` ].join("");
  chunks.push(encodeLatin1(trailer));
  return concatBytes(chunks);
}

class PdfCanvas {
  constructor(pageHeight) {
    this.commands = [];
    this.pageHeight = pageHeight;
  }
  push(command) {
    this.commands.push(command);
  }
  save() {
    this.push("q");
  }
  restore() {
    this.push("Q");
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
    const command = [ "BT", "/F1", formatNumber(fontSize), "Tf", colorOperator(style.color), "1 0 0 1", formatNumber(x), formatNumber(baseline), "Tm", font.encodeText(text), "Tj", "ET" ].join(" ");
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

class MultiPage {
  constructor({format = PageFormat.A4, margin = DEFAULT_MARGIN, gap = 8, build, header = null, footer = null, background = null}) {
    if (typeof build !== "function") throw new TypeError("MultiPage.build must be a function");
    this.format = {
      width: Number(format.width),
      height: Number(format.height)
    };
    this.margin = normalizeInsets(margin);
    this.gap = Number(gap);
    this.build = build;
    this.header = header;
    this.footer = footer;
    this.background = background;
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
        pageNumber
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
      content: canvas.output()
    }));
  }
}

class Page {
  constructor({format = PageFormat.A4, margin = DEFAULT_MARGIN, build, background = null}) {
    if (typeof build !== "function") throw new TypeError("Page.build must be a function");
    this.format = {
      width: Number(format.width),
      height: Number(format.height)
    };
    this.margin = normalizeInsets(margin);
    this.build = build;
    this.background = background;
  }
  render(documentContext) {
    const canvas = new PdfCanvas(this.format.height);
    if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);
    const context = {
      ...documentContext,
      canvas,
      pageFormat: this.format,
      pageNumber: 1
    };
    const widget = this.build(context);
    const maxWidth = this.format.width - this.margin.left - this.margin.right;
    const maxHeight = this.format.height - this.margin.top - this.margin.bottom;
    const box = widget.layout(context, {
      maxWidth,
      maxHeight
    });
    if (box.height > maxHeight + .001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }
    widget.paint(context, {
      ...box,
      x: this.margin.left,
      y: this.margin.top
    });
    return [ {
      format: this.format,
      content: canvas.output()
    } ];
  }
}

class Document {
  constructor({title = null, author = null, subject = null, creator = "js_pdf", producer = "js_pdf", font = defaultPdfFont} = {}) {
    this.sections = [];
    this.metadata = {
      title,
      author,
      subject,
      creator,
      producer
    };
    this.font = font;
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
    return serializePdf(pages, this.metadata, this.font);
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
      text: ({value, x, y, fontSize = 12, color = "#000000"}) => {
        context.canvas.text(String(value), box.x + x * scale, box.y + y * scale, {
          fontSize: fontSize * scale,
          color: normalizeColor(color)
        });
      }
    };
    this.draw(api);
  }
}

const DEFAULT_FONT_SIZE = 12;

const DEFAULT_LINE_HEIGHT = 1.2;

function textWidth(font, text, fontSize) {
  return font.stringMetrics(text, fontSize).advanceWidth;
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
  constructor(value, {fontSize = DEFAULT_FONT_SIZE, lineHeight = DEFAULT_LINE_HEIGHT, color = "#000000", align = "left", margin = 0} = {}) {
    super();
    this.value = String(value);
    this.fontSize = assertFiniteNumber(Number(fontSize), "fontSize");
    this.lineHeight = assertFiniteNumber(Number(lineHeight), "lineHeight");
    this.color = normalizeColor(color);
    this.align = align;
    this.margin = normalizeInsets(margin);
  }
  layout(context, constraints) {
    const font = context.document.font;
    const contentWidth = Math.max(1, constraints.maxWidth - this.margin.left - this.margin.right);
    const lines = wrapText(this.value, contentWidth, this.fontSize, font);
    const lineAdvance = this.fontSize * this.lineHeight;
    const contentHeight = lines.length * lineAdvance;
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, Math.max(...lines.map(line => textWidth(font, line, this.fontSize)), 0) + this.margin.left + this.margin.right),
      height: contentHeight + this.margin.top + this.margin.bottom,
      data: {
        lines,
        lineAdvance,
        contentWidth
      }
    };
  }
  paint(context, box) {
    const {canvas} = context;
    const font = context.document.font;
    const {lines, lineAdvance, contentWidth} = box.data;
    const xStart = box.x + this.margin.left;
    let baseline = box.y + this.margin.top + this.fontSize;
    for (const line of lines) {
      const lineWidth = textWidth(font, line, this.fontSize);
      let x = xStart;
      if (this.align === "center") x += (contentWidth - lineWidth) / 2;
      if (this.align === "right") x += contentWidth - lineWidth;
      canvas.text(line, x, baseline, {
        fontSize: this.fontSize,
        color: this.color,
        font
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
  PageFormat,
  PdfType1Font
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

export { Column, Container, Document, MultiPage, Page, PageFormat, PdfFontMetrics, PdfType1Font, Row, Spacer, Text, Vector, Widget, createPdf, js_pdf };

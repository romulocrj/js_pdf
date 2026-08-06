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

const CM = 72 / 2.54;

const PageFormat = Object.freeze({
  A4: Object.freeze({
    width: 595.28,
    height: 841.89,
    marginTop: 2 * CM,
    marginRight: 2 * CM,
    marginBottom: 2 * CM,
    marginLeft: 2 * CM
  }),
  LETTER: Object.freeze({
    width: 612,
    height: 792,
    marginTop: 72,
    marginRight: 72,
    marginBottom: 72,
    marginLeft: 72
  })
});

const DEFAULT_MARGIN = 40;

function formatMargin(format) {
  const {marginTop, marginRight, marginBottom, marginLeft} = format;
  if (marginTop === undefined && marginRight === undefined && marginBottom === undefined && marginLeft === undefined) {
    return null;
  }
  return {
    top: marginTop ?? 0,
    right: marginRight ?? 0,
    bottom: marginBottom ?? 0,
    left: marginLeft ?? 0
  };
}

const PageUnit = Object.freeze({
  point: 1,
  inch: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pica: 12
});

function codeUnits(text) {
  const units = [];
  for (let i = 0; i < text.length; i++) units.push(text.charCodeAt(i));
  return units;
}

function utf8Encode(text) {
  const bytes = [];
  for (const character of text) {
    let point = character.codePointAt(0) ?? 65533;
    if (point >= 55296 && point <= 57343) point = 65533;
    if (point < 128) {
      bytes.push(point);
    } else if (point < 2048) {
      bytes.push(192 | point >> 6, 128 | point & 63);
    } else if (point < 65536) {
      bytes.push(224 | point >> 12, 128 | point >> 6 & 63, 128 | point & 63);
    } else {
      bytes.push(240 | point >> 18, 128 | point >> 12 & 63, 128 | point >> 6 & 63, 128 | point & 63);
    }
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i];
    let point;
    let length;
    if (first < 128) {
      point = first;
      length = 1;
    } else if ((first & 224) === 192) {
      point = first & 31;
      length = 2;
    } else if ((first & 240) === 224) {
      point = first & 15;
      length = 3;
    } else if ((first & 248) === 240) {
      point = first & 7;
      length = 4;
    } else {
      text += "�";
      i++;
      continue;
    }
    if (i + length > bytes.length) {
      text += "�";
      break;
    }
    let valid = true;
    for (let n = 1; n < length; n++) {
      const byte = bytes[i + n];
      if ((byte & 192) !== 128) {
        valid = false;
        break;
      }
      point = point << 6 | byte & 63;
    }
    if (!valid || point > 1114111) {
      text += "�";
      i++;
      continue;
    }
    text += String.fromCodePoint(point);
    i += length;
  }
  return text;
}

class BarcodeException extends Error {
  constructor(message) {
    super(message);
    this.name = "BarcodeException";
  }
}

class BarcodeElement {
  constructor(left, top, width, height) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
  }
  get right() {
    return this.left + this.width;
  }
  get bottom() {
    return this.top + this.height;
  }
}

class BarcodeBar extends BarcodeElement {
  constructor(left, top, width, height, black) {
    super(left, top, width, height);
    this.black = black;
  }
}

class BarcodeText extends BarcodeElement {
  constructor(left, top, width, height, text, align) {
    super(left, top, width, height);
    this.text = text;
    this.align = align;
  }
}

const INFINITE_MAX_LENGTH = 1e3;

const SVG_NAMESPACE = `http:${String.fromCharCode(47, 47)}www.w3.org/2000/svg`;

class Barcode {
  make(data, options) {
    return this.makeBytes(utf8Encode(data), options);
  }
  isValid(data) {
    try {
      this.verify(data);
    } catch {
      return false;
    }
    return true;
  }
  isValidBytes(data) {
    try {
      this.verifyBytes(data);
    } catch {
      return false;
    }
    return true;
  }
  verify(data) {
    this.verifyBytes(utf8Encode(data));
  }
  verifyBytes(data) {
    if (data.length > this.maxLength) {
      throw new BarcodeException(`Unable to encode "${data}", maximum length is ${this.maxLength} for ${this.name} Barcode`);
    }
    if (data.length < this.minLength) {
      throw new BarcodeException(`Unable to encode "${data}", minimum length is ${this.minLength} for ${this.name} Barcode`);
    }
    const chr = new Set(this.charSet);
    for (const code of data) {
      if (!chr.has(code)) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
    }
  }
  toSvg(data, options = {}) {
    return this.toSvgBytes(utf8Encode(data), options);
  }
  toSvgBytes(data, options = {}) {
    const {x = 0, y = 0, width = 200, height = 80, drawText = true, fontFamily = "monospace", color = 0, fullSvg = true, baseline = .75} = options;
    const fontHeight = options.fontHeight ?? height * .2;
    const textPadding = options.textPadding ?? height * .05;
    const recipe = this.makeBytes(data, {
      width,
      height,
      drawText,
      fontHeight,
      textPadding
    });
    let path = "";
    let tSpan = "";
    for (const element of recipe) {
      if (element instanceof BarcodeBar) {
        if (element.black) {
          path += `M ${d(x + element.left)} ${d(y + element.top)} `;
          path += `h ${d(element.width)} `;
          path += `v ${d(element.height)} `;
          path += `h ${d(-element.width)} `;
          path += "z ";
        }
      } else if (element instanceof BarcodeText) {
        const lY = y + element.top + element.height * baseline;
        let lX;
        let anchor;
        switch (element.align) {
         case "left":
          lX = x + element.left;
          anchor = "start";
          break;

         case "center":
          lX = x + element.left + element.width / 2;
          anchor = "middle";
          break;

         case "right":
          lX = x + element.left + element.width;
          anchor = "end";
          break;
        }
        tSpan += `<tspan style="text-anchor: ${anchor}" x="${d(lX)}" y="${d(lY)}">${escape(element.text)}</tspan>`;
      }
    }
    let output = "";
    if (fullSvg) {
      output += `<svg viewBox="${d(x)} ${d(y)} ${d(width)} ${d(height)}" xmlns="${SVG_NAMESPACE}">`;
    }
    output += `<path d="${path}" style="fill: ${hex(color)}"/>`;
    output += `<text style="fill: ${hex(color)}; font-family: &quot;${escape(fontFamily)}&quot;; ` + `font-size: ${d(fontHeight)}px" x="${d(x)}" y="${d(y)}">${tSpan}</text>`;
    if (fullSvg) {
      output += "</svg>";
    }
    return output;
  }
  get maxLength() {
    return INFINITE_MAX_LENGTH;
  }
  get minLength() {
    return 1;
  }
  toString() {
    return `Barcode ${this.name}`;
  }
}

function d(value) {
  return value.toFixed(5);
}

function escape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function hex(color) {
  return `#${(color & 16777215).toString(16).padStart(6, "0")}`;
}

const DEFAULT_TEXT_PADDING = 0;

class Barcode1D extends Barcode {
  makeBytes(data, options) {
    const params = drawParams(options);
    const result = [];
    const text = utf8Decode(data);
    const bits = this.convert(text);
    if (bits.length === 0) {
      return result;
    }
    const top = this.marginTop(params);
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    const lineWidth = (params.width - left - right) / bits.length;
    const inner = {
      ...params,
      height: params.height - top
    };
    let color = bits[0];
    let count = 1;
    for (let i = 1; i < bits.length; i++) {
      if (color === bits[i]) {
        count++;
        continue;
      }
      result.push(new BarcodeBar(left + (i - count) * lineWidth, top, count * lineWidth, this.getHeight(i - count, count, inner), color));
      color = bits[i];
      count = 1;
    }
    const l = bits.length;
    result.push(new BarcodeBar(left + (l - count) * lineWidth, top, count * lineWidth, this.getHeight(l - count, count, inner), color));
    if (params.drawText) {
      result.push(...this.makeText(text, params, lineWidth));
    }
    return result;
  }
  getHeight(_index, _count, params) {
    return params.height - (params.drawText ? params.fontHeight + params.textPadding : 0);
  }
  marginTop(_params) {
    return 0;
  }
  marginLeft(_params) {
    return 0;
  }
  marginRight(_params) {
    return 0;
  }
  makeText(data, params, _lineWidth) {
    return [ new BarcodeText(0, params.height - params.fontHeight, params.width, params.fontHeight, data, "center") ];
  }
  add(data, count) {
    const bits = [];
    for (let i = 0; i < count; i++) {
      bits.push((1 & data >> i) === 1);
    }
    return bits;
  }
  toHex(data) {
    let intermediate = "";
    for (const bit of this.convert(data)) {
      intermediate += bit ? "1" : "0";
    }
    let result = "";
    while (intermediate.length > 8) {
      const sub = intermediate.substring(intermediate.length - 8);
      result += parseInt(sub, 2).toString(16);
      intermediate = intermediate.substring(0, intermediate.length - 8);
    }
    result += parseInt(intermediate, 2).toString(16);
    return result;
  }
  getText(data) {
    let result = "";
    const params = {
      drawText: true,
      width: 200,
      height: 200,
      fontHeight: 10,
      textPadding: 5
    };
    for (const element of this.makeText(data, params, 10)) {
      if (element instanceof BarcodeText) {
        result += element.text;
      }
    }
    return result;
  }
}

function drawParams(options) {
  if (!(options.width > 0) || !(options.height > 0)) {
    throw new RangeError("A barcode needs a positive width and height");
  }
  return {
    drawText: options.drawText ?? false,
    width: options.width,
    height: options.height,
    fontHeight: options.fontHeight ?? 0,
    textPadding: options.textPadding ?? DEFAULT_TEXT_PADDING
  };
}

const code93Dollar = 201;

const code93Percent = 183;

const code93Slash = 215;

const code93Plus = 153;

const code93StartStop = 245;

const code93ReverseStop = 189;

const code128StartCodeA = 103;

const code128StartCodeB = 104;

const code128StartCodeC = 105;

const code128Stop = 106;

const code128ReverseStop = 107;

const code128StopPattern = 108;

const code128FNC1 = 250;

const code128FNC2 = 251;

const code128FNC3 = 252;

const code128FNC4 = 253;

const code128ShiftA = -5;

const code128ShiftB = -6;

const code128CodeA = -7;

const code128CodeB = -8;

const code128CodeC = -9;

const BarcodeMaps = {
  code39: new Map([ [ 48, 2917 ], [ 49, 3403 ], [ 50, 3405 ], [ 51, 2715 ], [ 52, 3429 ], [ 53, 2763 ], [ 54, 2765 ], [ 55, 3493 ], [ 56, 2891 ], [ 57, 2893 ], [ 65, 3371 ], [ 66, 3373 ], [ 67, 2651 ], [ 68, 3381 ], [ 69, 2667 ], [ 70, 2669 ], [ 71, 3477 ], [ 72, 2859 ], [ 73, 2861 ], [ 74, 2869 ], [ 75, 3243 ], [ 76, 3245 ], [ 77, 2395 ], [ 78, 3253 ], [ 79, 2411 ], [ 80, 2413 ], [ 81, 3285 ], [ 82, 2475 ], [ 83, 2477 ], [ 84, 2485 ], [ 85, 3411 ], [ 86, 3417 ], [ 87, 2739 ], [ 88, 3433 ], [ 89, 2771 ], [ 90, 2777 ], [ 45, 3497 ], [ 46, 2899 ], [ 32, 2905 ], [ 36, 2633 ], [ 47, 2377 ], [ 43, 2345 ], [ 37, 2341 ] ]),
  code39StartStop: 2921,
  code39Len: 13,
  code93: new Map([ [ 48, 81 ], [ 49, 37 ], [ 50, 69 ], [ 51, 133 ], [ 52, 41 ], [ 53, 73 ], [ 54, 137 ], [ 55, 21 ], [ 56, 145 ], [ 57, 161 ], [ 65, 43 ], [ 66, 75 ], [ 67, 139 ], [ 68, 83 ], [ 69, 147 ], [ 70, 163 ], [ 71, 45 ], [ 72, 77 ], [ 73, 141 ], [ 74, 89 ], [ 75, 177 ], [ 76, 53 ], [ 77, 101 ], [ 78, 197 ], [ 79, 105 ], [ 80, 209 ], [ 81, 91 ], [ 82, 155 ], [ 83, 107 ], [ 84, 203 ], [ 85, 211 ], [ 86, 179 ], [ 87, 109 ], [ 88, 205 ], [ 89, 217 ], [ 90, 185 ], [ 45, 233 ], [ 46, 87 ], [ 32, 151 ], [ 36, 167 ], [ 47, 237 ], [ 43, 221 ], [ 37, 235 ], [ -1, code93Dollar ], [ -2, code93Percent ], [ -3, code93Slash ], [ -4, code93Plus ], [ -5, code93StartStop ], [ -6, code93ReverseStop ] ]),
  code93StartStop: 245,
  code93Len: 9,
  code128A: new Map([ [ 32, 0 ], [ 33, 1 ], [ 34, 2 ], [ 35, 3 ], [ 36, 4 ], [ 37, 5 ], [ 38, 6 ], [ 39, 7 ], [ 40, 8 ], [ 41, 9 ], [ 42, 10 ], [ 43, 11 ], [ 44, 12 ], [ 45, 13 ], [ 46, 14 ], [ 47, 15 ], [ 48, 16 ], [ 49, 17 ], [ 50, 18 ], [ 51, 19 ], [ 52, 20 ], [ 53, 21 ], [ 54, 22 ], [ 55, 23 ], [ 56, 24 ], [ 57, 25 ], [ 58, 26 ], [ 59, 27 ], [ 60, 28 ], [ 61, 29 ], [ 62, 30 ], [ 63, 31 ], [ 64, 32 ], [ 65, 33 ], [ 66, 34 ], [ 67, 35 ], [ 68, 36 ], [ 69, 37 ], [ 70, 38 ], [ 71, 39 ], [ 72, 40 ], [ 73, 41 ], [ 74, 42 ], [ 75, 43 ], [ 76, 44 ], [ 77, 45 ], [ 78, 46 ], [ 79, 47 ], [ 80, 48 ], [ 81, 49 ], [ 82, 50 ], [ 83, 51 ], [ 84, 52 ], [ 85, 53 ], [ 86, 54 ], [ 87, 55 ], [ 88, 56 ], [ 89, 57 ], [ 90, 58 ], [ 91, 59 ], [ 92, 60 ], [ 93, 61 ], [ 94, 62 ], [ 95, 63 ], [ 0, 64 ], [ 1, 65 ], [ 2, 66 ], [ 3, 67 ], [ 4, 68 ], [ 5, 69 ], [ 6, 70 ], [ 7, 71 ], [ 8, 72 ], [ 9, 73 ], [ 10, 74 ], [ 11, 75 ], [ 12, 76 ], [ 13, 77 ], [ 14, 78 ], [ 15, 79 ], [ 16, 80 ], [ 17, 81 ], [ 18, 82 ], [ 19, 83 ], [ 20, 84 ], [ 21, 85 ], [ 22, 86 ], [ 23, 87 ], [ 24, 88 ], [ 25, 89 ], [ 26, 90 ], [ 27, 91 ], [ 28, 92 ], [ 29, 93 ], [ 30, 94 ], [ 31, 95 ], [ code128FNC3, 96 ], [ code128FNC2, 97 ], [ code128ShiftB, 98 ], [ code128CodeC, 99 ], [ code128CodeB, 100 ], [ code128FNC4, 101 ], [ code128FNC1, 102 ] ]),
  code128B: new Map([ [ 32, 0 ], [ 33, 1 ], [ 34, 2 ], [ 35, 3 ], [ 36, 4 ], [ 37, 5 ], [ 38, 6 ], [ 39, 7 ], [ 40, 8 ], [ 41, 9 ], [ 42, 10 ], [ 43, 11 ], [ 44, 12 ], [ 45, 13 ], [ 46, 14 ], [ 47, 15 ], [ 48, 16 ], [ 49, 17 ], [ 50, 18 ], [ 51, 19 ], [ 52, 20 ], [ 53, 21 ], [ 54, 22 ], [ 55, 23 ], [ 56, 24 ], [ 57, 25 ], [ 58, 26 ], [ 59, 27 ], [ 60, 28 ], [ 61, 29 ], [ 62, 30 ], [ 63, 31 ], [ 64, 32 ], [ 65, 33 ], [ 66, 34 ], [ 67, 35 ], [ 68, 36 ], [ 69, 37 ], [ 70, 38 ], [ 71, 39 ], [ 72, 40 ], [ 73, 41 ], [ 74, 42 ], [ 75, 43 ], [ 76, 44 ], [ 77, 45 ], [ 78, 46 ], [ 79, 47 ], [ 80, 48 ], [ 81, 49 ], [ 82, 50 ], [ 83, 51 ], [ 84, 52 ], [ 85, 53 ], [ 86, 54 ], [ 87, 55 ], [ 88, 56 ], [ 89, 57 ], [ 90, 58 ], [ 91, 59 ], [ 92, 60 ], [ 93, 61 ], [ 94, 62 ], [ 95, 63 ], [ 96, 64 ], [ 97, 65 ], [ 98, 66 ], [ 99, 67 ], [ 100, 68 ], [ 101, 69 ], [ 102, 70 ], [ 103, 71 ], [ 104, 72 ], [ 105, 73 ], [ 106, 74 ], [ 107, 75 ], [ 108, 76 ], [ 109, 77 ], [ 110, 78 ], [ 111, 79 ], [ 112, 80 ], [ 113, 81 ], [ 114, 82 ], [ 115, 83 ], [ 116, 84 ], [ 117, 85 ], [ 118, 86 ], [ 119, 87 ], [ 120, 88 ], [ 121, 89 ], [ 122, 90 ], [ 123, 91 ], [ 124, 92 ], [ 125, 93 ], [ 126, 94 ], [ 127, 95 ], [ code128FNC3, 96 ], [ code128FNC2, 97 ], [ code128ShiftA, 98 ], [ code128CodeC, 99 ], [ code128FNC4, 100 ], [ code128CodeA, 101 ], [ code128FNC1, 102 ] ]),
  code128C: new Map([ [ 0, 0 ], [ 1, 1 ], [ 2, 2 ], [ 3, 3 ], [ 4, 4 ], [ 5, 5 ], [ 6, 6 ], [ 7, 7 ], [ 8, 8 ], [ 9, 9 ], [ 10, 10 ], [ 11, 11 ], [ 12, 12 ], [ 13, 13 ], [ 14, 14 ], [ 15, 15 ], [ 16, 16 ], [ 17, 17 ], [ 18, 18 ], [ 19, 19 ], [ 20, 20 ], [ 21, 21 ], [ 22, 22 ], [ 23, 23 ], [ 24, 24 ], [ 25, 25 ], [ 26, 26 ], [ 27, 27 ], [ 28, 28 ], [ 29, 29 ], [ 30, 30 ], [ 31, 31 ], [ 32, 32 ], [ 33, 33 ], [ 34, 34 ], [ 35, 35 ], [ 36, 36 ], [ 37, 37 ], [ 38, 38 ], [ 39, 39 ], [ 40, 40 ], [ 41, 41 ], [ 42, 42 ], [ 43, 43 ], [ 44, 44 ], [ 45, 45 ], [ 46, 46 ], [ 47, 47 ], [ 48, 48 ], [ 49, 49 ], [ 50, 50 ], [ 51, 51 ], [ 52, 52 ], [ 53, 53 ], [ 54, 54 ], [ 55, 55 ], [ 56, 56 ], [ 57, 57 ], [ 58, 58 ], [ 59, 59 ], [ 60, 60 ], [ 61, 61 ], [ 62, 62 ], [ 63, 63 ], [ 64, 64 ], [ 65, 65 ], [ 66, 66 ], [ 67, 67 ], [ 68, 68 ], [ 69, 69 ], [ 70, 70 ], [ 71, 71 ], [ 72, 72 ], [ 73, 73 ], [ 74, 74 ], [ 75, 75 ], [ 76, 76 ], [ 77, 77 ], [ 78, 78 ], [ 79, 79 ], [ 80, 80 ], [ 81, 81 ], [ 82, 82 ], [ 83, 83 ], [ 84, 84 ], [ 85, 85 ], [ 86, 86 ], [ 87, 87 ], [ 88, 88 ], [ 89, 89 ], [ 90, 90 ], [ 91, 91 ], [ 92, 92 ], [ 93, 93 ], [ 94, 94 ], [ 95, 95 ], [ 96, 96 ], [ 97, 97 ], [ 98, 98 ], [ 99, 99 ], [ code128CodeB, 100 ], [ code128CodeA, 101 ], [ code128FNC1, 102 ] ]),
  code128: new Map([ [ 0, 411 ], [ 1, 435 ], [ 2, 819 ], [ 3, 201 ], [ 4, 393 ], [ 5, 401 ], [ 6, 153 ], [ 7, 281 ], [ 8, 305 ], [ 9, 147 ], [ 10, 275 ], [ 11, 291 ], [ 12, 461 ], [ 13, 473 ], [ 14, 921 ], [ 15, 413 ], [ 16, 441 ], [ 17, 825 ], [ 18, 627 ], [ 19, 467 ], [ 20, 915 ], [ 21, 315 ], [ 22, 371 ], [ 23, 951 ], [ 24, 407 ], [ 25, 423 ], [ 26, 807 ], [ 27, 311 ], [ 28, 359 ], [ 29, 615 ], [ 30, 219 ], [ 31, 795 ], [ 32, 867 ], [ 33, 197 ], [ 34, 209 ], [ 35, 785 ], [ 36, 141 ], [ 37, 177 ], [ 38, 561 ], [ 39, 139 ], [ 40, 163 ], [ 41, 547 ], [ 42, 237 ], [ 43, 909 ], [ 44, 945 ], [ 45, 221 ], [ 46, 797 ], [ 47, 881 ], [ 48, 887 ], [ 49, 907 ], [ 50, 931 ], [ 51, 187 ], [ 52, 571 ], [ 53, 955 ], [ 54, 215 ], [ 55, 791 ], [ 56, 839 ], [ 57, 183 ], [ 58, 567 ], [ 59, 711 ], [ 60, 759 ], [ 61, 531 ], [ 62, 655 ], [ 63, 101 ], [ 64, 389 ], [ 65, 105 ], [ 66, 777 ], [ 67, 417 ], [ 68, 801 ], [ 69, 77 ], [ 70, 269 ], [ 71, 89 ], [ 72, 537 ], [ 73, 353 ], [ 74, 609 ], [ 75, 579 ], [ 76, 83 ], [ 77, 751 ], [ 78, 323 ], [ 79, 753 ], [ 80, 485 ], [ 81, 489 ], [ 82, 969 ], [ 83, 317 ], [ 84, 377 ], [ 85, 633 ], [ 86, 303 ], [ 87, 335 ], [ 88, 591 ], [ 89, 987 ], [ 90, 891 ], [ 91, 879 ], [ 92, 245 ], [ 93, 965 ], [ 94, 977 ], [ 95, 189 ], [ 96, 573 ], [ 97, 175 ], [ 98, 559 ], [ 99, 989 ], [ 100, 957 ], [ 101, 983 ], [ 102, 943 ], [ code128StartCodeA, 267 ], [ code128StartCodeB, 75 ], [ code128StartCodeC, 459 ], [ code128Stop, 739 ], [ code128ReverseStop, 235 ], [ code128StopPattern, 6883 ] ]),
  code128StartCodeA: 103,
  code128StartCodeB: 104,
  code128StartCodeC: 105,
  code128Stop: 106,
  code128FNC1: 250,
  code128FNC1String: "ú",
  code128FNC2: 251,
  code128FNC2String: "û",
  code128FNC3: 252,
  code128FNC3String: "ü",
  code128FNC4: 253,
  code128FNC4String: "ý",
  code128CodeA: -7,
  code128CodeB: -8,
  code128CodeC: -9,
  code128Len: 11,
  ean: new Map([ [ 48, [ 88, 114, 39 ] ], [ 49, [ 76, 102, 51 ] ], [ 50, [ 100, 108, 27 ] ], [ 51, [ 94, 66, 33 ] ], [ 52, [ 98, 92, 29 ] ], [ 53, [ 70, 78, 57 ] ], [ 54, [ 122, 80, 5 ] ], [ 55, [ 110, 68, 17 ] ], [ 56, [ 118, 72, 9 ] ], [ 57, [ 104, 116, 23 ] ] ]),
  eanFirst: new Map([ [ 48, 0 ], [ 49, 52 ], [ 50, 44 ], [ 51, 28 ], [ 52, 50 ], [ 53, 38 ], [ 54, 14 ], [ 55, 42 ], [ 56, 26 ], [ 57, 22 ] ]),
  ean5Checksum: new Map([ [ 48, 3 ], [ 49, 5 ], [ 50, 9 ], [ 51, 17 ], [ 52, 6 ], [ 53, 12 ], [ 54, 24 ], [ 55, 10 ], [ 56, 18 ], [ 57, 20 ] ]),
  upce: new Map([ [ 48, 56 ], [ 49, 52 ], [ 50, 44 ], [ 51, 28 ], [ 52, 50 ], [ 53, 38 ], [ 54, 14 ], [ 55, 42 ], [ 56, 26 ], [ 57, 22 ] ]),
  eanStartEnd: 5,
  eanCenter: 10,
  eanEndUpcE: 42,
  eanStartEan2: 26,
  eanCenterEan2: 2,
  itf: new Map([ [ 48, 12 ], [ 49, 17 ], [ 50, 18 ], [ 51, 3 ], [ 52, 20 ], [ 53, 5 ], [ 54, 6 ], [ 55, 24 ], [ 56, 9 ], [ 57, 10 ] ]),
  itfStart: 5,
  itfEnd: 23,
  telepen: [ 30583, 24029, 24007, 30581, 24023, 30493, 30481, 24021, 23671, 30557, 30535, 23669, 30551, 23621, 23633, 30549, 23927, 29149, 29127, 23925, 29143, 23837, 23825, 29141, 28951, 23901, 23879, 28949, 23895, 28997, 29009, 23893, 18295, 30173, 30151, 18293, 30167, 18205, 18193, 30165, 29815, 18269, 18247, 29813, 18263, 29765, 29777, 18261, 30071, 17501, 17479, 30069, 17495, 29981, 29969, 17493, 17687, 30045, 30023, 17685, 30039, 17733, 17745, 30037, 22391, 7645, 7623, 22389, 7639, 22301, 22289, 7637, 7287, 22365, 22343, 7285, 22359, 7237, 7249, 22357, 7543, 20957, 20935, 7541, 20951, 7453, 7441, 20949, 20759, 7517, 7495, 20757, 7511, 20805, 20817, 7509, 4471, 21981, 21959, 4469, 21975, 4381, 4369, 21973, 21623, 4445, 4423, 21621, 4439, 21573, 21585, 4437, 21879, 5213, 5191, 21877, 5207, 21789, 21777, 5205, 5399, 21853, 21831, 5397, 21847, 5445, 5457, 21845 ],
  telepenStart: 7509,
  telepenEnd: 21831,
  telepenLen: 16,
  codabar: new Map([ [ 48, 405 ], [ 49, 309 ], [ 52, 301 ], [ 53, 299 ], [ 50, 421 ], [ 45, 357 ], [ 36, 333 ], [ 57, 331 ], [ 54, 425 ], [ 55, 361 ], [ 56, 345 ], [ 51, 339 ], [ 46, 731 ], [ 47, 859 ], [ 58, 875 ], [ 43, 877 ], [ 67, 805 ], [ 68, 613 ], [ 65, 589 ], [ 66, 841 ] ]),
  codabarLen: new Map([ [ 48, 9 ], [ 49, 9 ], [ 52, 9 ], [ 53, 9 ], [ 50, 9 ], [ 45, 9 ], [ 36, 9 ], [ 57, 9 ], [ 54, 9 ], [ 55, 9 ], [ 56, 9 ], [ 51, 9 ], [ 46, 10 ], [ 47, 10 ], [ 58, 10 ], [ 43, 10 ], [ 67, 10 ], [ 68, 10 ], [ 65, 10 ], [ 66, 10 ] ]),
  rm4scc: new Map([ [ 48, 240 ], [ 49, 216 ], [ 50, 120 ], [ 51, 210 ], [ 52, 114 ], [ 53, 90 ], [ 54, 228 ], [ 55, 204 ], [ 56, 108 ], [ 57, 198 ], [ 65, 102 ], [ 66, 78 ], [ 67, 180 ], [ 68, 156 ], [ 69, 60 ], [ 70, 150 ], [ 71, 54 ], [ 72, 30 ], [ 73, 225 ], [ 74, 201 ], [ 75, 105 ], [ 76, 195 ], [ 77, 99 ], [ 78, 75 ], [ 79, 177 ], [ 80, 153 ], [ 81, 57 ], [ 82, 147 ], [ 83, 51 ], [ 84, 27 ], [ 85, 165 ], [ 86, 141 ], [ 87, 45 ], [ 88, 135 ], [ 89, 39 ], [ 90, 15 ] ]),
  rm4sccLen: 4,
  rm4sccStart: 1,
  rm4sccStop: 3,
  postnet: new Map([ [ 48, 687 ], [ 49, 1002 ], [ 50, 954 ], [ 51, 762 ], [ 52, 942 ], [ 53, 750 ], [ 54, 702 ], [ 55, 939 ], [ 56, 747 ], [ 57, 187 ] ]),
  postnetLen: 5,
  postnetStartStop: 3
};

const BarcodeCodabarStartStop = {
  A: 0,
  B: 1,
  C: 2,
  D: 3
};

class BarcodeCodabar extends Barcode1D {
  constructor(start, stop, printStartStop, explicitStartStop) {
    super();
    this.start = start;
    this.stop = stop;
    this.printStartStop = printStartStop;
    this.explicitStartStop = explicitStartStop;
  }
  get charSet() {
    return [ ...BarcodeMaps.codabar.keys() ].filter(x => x < 64);
  }
  get name() {
    return "CODABAR";
  }
  convert(data) {
    const startStop = [ 65, 66, 67, 68 ];
    let lStart = startStop[this.start];
    let lStop = startStop[this.stop];
    if (this.explicitStartStop) {
      lStart = startStopByte(data.charCodeAt(0));
      lStop = startStopByte(data.charCodeAt(data.length - 1));
      data = data.substring(1, data.length - 1);
    }
    const bits = [];
    bits.push(...this.add(BarcodeMaps.codabar.get(lStart), BarcodeMaps.codabarLen.get(lStart)));
    bits.push(false);
    for (const code of codeUnits(data)) {
      if (code > 64 || code === 42) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      const codeValue = BarcodeMaps.codabar.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      bits.push(...this.add(codeValue, BarcodeMaps.codabarLen.get(code)));
      bits.push(false);
    }
    bits.push(...this.add(BarcodeMaps.codabar.get(lStop), BarcodeMaps.codabarLen.get(lStop)));
    return bits;
  }
  verifyBytes(data) {
    if (this.explicitStartStop) {
      const validStartStop = [ 65, 66, 67, 68, 78, 84, 42, 69 ];
      if (data.length < 3) {
        throw new BarcodeException(`Unable to encode ${this.name} Barcode: missing start and/or stop chars`);
      }
      if (!validStartStop.includes(data[0])) {
        throw new BarcodeException(`Unable to encode ${this.name} Barcode: "${String.fromCharCode(data[0])}" is an invalid start char`);
      }
      const lastByte = data[data.length - 1];
      if (!validStartStop.includes(lastByte)) {
        throw new BarcodeException(`Unable to encode ${this.name} Barcode: "${String.fromCharCode(lastByte)}" is an invalid start char`);
      }
      data = data.subarray(1, data.length - 1);
    }
    super.verifyBytes(data);
  }
  makeText(data, params, lineWidth) {
    if (this.printStartStop && !this.explicitStartStop) {
      data = String.fromCharCode(this.start + 65) + data + String.fromCharCode(this.stop + 65);
    } else if (!this.printStartStop && this.explicitStartStop) {
      data = data.substring(1, data.length - 1);
    }
    return super.makeText(data, params, lineWidth);
  }
}

function startStopByte(value) {
  switch (value) {
   case 84:
    return 65;

   case 78:
    return 66;

   case 42:
    return 67;

   case 69:
    return 68;

   default:
    return value;
  }
}

const BarcodeCode128Fnc = {
  fnc1: BarcodeMaps.code128FNC1String,
  fnc2: BarcodeMaps.code128FNC2String,
  fnc3: BarcodeMaps.code128FNC3String,
  fnc4: BarcodeMaps.code128FNC4String
};

class BarcodeCode128 extends Barcode1D {
  constructor(options) {
    super();
    if (!options.useCode128A && !options.useCode128B && !options.useCode128C) {
      throw new BarcodeException("Enable at least one of the CODE 128 tables");
    }
    this.useCode128A = options.useCode128A;
    this.useCode128B = options.useCode128B;
    this.useCode128C = options.useCode128C;
    this.isGS1 = options.isGS1;
    this.escapes = options.escapes;
    this.keepParenthesis = options.keepParenthesis;
    this.addSpaceAfterParenthesis = options.addSpaceAfterParenthesis;
  }
  get charSet() {
    const set = new Set;
    if (this.useCode128B) {
      for (const key of BarcodeMaps.code128B.keys()) if (key >= 0) set.add(key);
    }
    if (this.useCode128A) {
      for (const key of BarcodeMaps.code128A.keys()) if (key >= 0) set.add(key);
    }
    if (this.useCode128C) {
      for (let index = 0; index < 10; index++) set.add(index + 48);
    }
    set.add(BarcodeMaps.code128FNC1);
    if (this.useCode128A || this.useCode128B) {
      set.add(BarcodeMaps.code128FNC2);
      set.add(BarcodeMaps.code128FNC3);
      set.add(BarcodeMaps.code128FNC4);
    }
    if (this.isGS1) {
      set.add(40);
      set.add(41);
    }
    return set;
  }
  get name() {
    return this.isGS1 ? "GS1 128" : "CODE 128";
  }
  shortestCode(data) {
    let table = 0;
    let lastTable = 0;
    let length = 0;
    let digitCount = 0;
    const result = [];
    const addFrom = start => {
      let t = null;
      if ((table & 4) !== 0 && (digitCount & 1) === 0) {
        t = BarcodeMaps.code128C;
        if (lastTable === 1) {
          result.push(t.get(BarcodeMaps.code128CodeA));
        } else if (lastTable === 2) {
          result.push(t.get(BarcodeMaps.code128CodeB));
        }
        lastTable = 3;
      } else if ((table & 1) !== 0) {
        t = BarcodeMaps.code128A;
        if (lastTable === 2) {
          result.push(t.get(BarcodeMaps.code128CodeB));
        } else if (lastTable === 3) {
          result.push(t.get(BarcodeMaps.code128CodeC));
        }
        lastTable = 1;
      } else if ((table & 2) !== 0) {
        t = BarcodeMaps.code128B;
        if (lastTable === 1) {
          result.push(t.get(BarcodeMaps.code128CodeA));
        } else if (lastTable === 3) {
          result.push(t.get(BarcodeMaps.code128CodeC));
        }
        lastTable = 2;
      }
      if (t === null) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(...data)}" to ${this.name} Barcode`);
      }
      if (lastTable === 3) {
        for (let i = start + length - 1; i >= start; i--) {
          if (data[i] === BarcodeMaps.code128FNC1) {
            result.push(t.get(BarcodeMaps.code128FNC1));
          } else {
            const digit = data[i] - 48 + (data[i - 1] - 48) * 10;
            result.push(t.get(digit));
            i--;
          }
        }
      } else {
        for (const c of data.slice(start, start + length).reverse()) {
          result.push(t.get(c));
        }
      }
    };
    for (let index = data.length - 1; index >= 0; index--) {
      const code = data[index];
      const codeA = this.useCode128A && BarcodeMaps.code128A.has(code);
      const codeB = this.useCode128B && BarcodeMaps.code128B.has(code);
      const isFnc1 = code === BarcodeMaps.code128FNC1;
      const codeC = this.useCode128C && code >= 48 && code <= 57;
      let available = 0;
      if (codeA) available = 1;
      if (codeB) available |= 2;
      if (codeC || isFnc1) available |= 4;
      if (available === 0) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (codeC) {
        digitCount++;
      } else if (isFnc1) {
        length++;
        addFrom(index);
        length = 0;
        digitCount = 0;
        continue;
      } else {
        if (digitCount >= 4) {
          if ((digitCount & 1) !== 0) {
            digitCount--;
          }
          if (length > digitCount) {
            length -= digitCount;
            table &= 3;
            if (table === 0) {
              throw new BarcodeException(`Unable to encode "${String.fromCharCode(...data)}" to ${this.name} Barcode`);
            }
            addFrom(index + digitCount + 1);
            length = digitCount;
          }
          table = 4;
          addFrom(index + 1);
          table = 0;
          length = 0;
        }
        digitCount = 0;
      }
      if (table === 0) {
        table = available;
        length++;
      } else {
        const newTable = table & available;
        if (newTable === 0) {
          addFrom(index + 1);
          length = 0;
          table = available;
        } else {
          table = newTable;
        }
        length++;
      }
    }
    if (digitCount >= 2) {
      if ((digitCount & 1) !== 0) {
        length -= digitCount - 1;
        addFrom(digitCount - 1);
        digitCount--;
      } else if (length > digitCount) {
        length -= digitCount;
        addFrom(digitCount);
      }
      table = 4;
      length = digitCount;
    }
    if (length > 0) {
      addFrom(0);
    }
    if (lastTable === 1) {
      result.push(BarcodeMaps.code128StartCodeA);
    } else if (lastTable === 2) {
      result.push(BarcodeMaps.code128StartCodeB);
    } else if (lastTable === 3) {
      result.push(BarcodeMaps.code128StartCodeC);
    }
    return result.reverse();
  }
  adaptData(data, text = false) {
    if (this.isGS1) {
      let result = "";
      let start = 0;
      for (const match of data.matchAll(/\(.+?\)/g)) {
        const from = match.index;
        const to = from + match[0].length;
        result += data.substring(start, from);
        result += BarcodeMaps.code128FNC1String;
        if (text && this.keepParenthesis) result += "(";
        result += data.substring(from + 1, to - 1);
        if (text && this.keepParenthesis) result += ")";
        if (text && this.addSpaceAfterParenthesis) result += " ";
        start = to;
      }
      result += data.substring(start);
      data = result;
    }
    if (this.escapes) {
      let result = "";
      let start = 0;
      for (const match of data.matchAll(/\{\d\}/g)) {
        const from = match.index;
        const to = from + match[0].length;
        result += data.substring(start, from);
        switch (match[0]) {
         case "{1}":
          result += BarcodeMaps.code128FNC1String;
          break;

         case "{2}":
          result += BarcodeMaps.code128FNC2String;
          break;

         case "{3}":
          result += BarcodeMaps.code128FNC3String;
          break;

         case "{4}":
          result += BarcodeMaps.code128FNC4String;
          break;

         default:
          result += match[0];
        }
        start = to;
      }
      result += data.substring(start);
      data = result;
    }
    return data;
  }
  convert(data) {
    const bits = [];
    const adapted = this.adaptData(data);
    const checksum = [];
    for (const codeIndex of this.shortestCode(codeUnits(adapted))) {
      const codeValue = BarcodeMaps.code128.get(codeIndex);
      bits.push(...this.add(codeValue, BarcodeMaps.code128Len));
      checksum.push(codeIndex);
    }
    let sum = 0;
    for (let index = 0; index < checksum.length; index++) {
      const code = checksum[index];
      const mul = index === 0 ? 1 : index;
      sum += code * mul;
    }
    sum = sum % 103;
    bits.push(...this.add(BarcodeMaps.code128.get(sum), BarcodeMaps.code128Len));
    bits.push(...this.add(BarcodeMaps.code128.get(BarcodeMaps.code128Stop), BarcodeMaps.code128Len));
    bits.push(true, true);
    return bits;
  }
  makeText(data, params, lineWidth) {
    const text = this.adaptData(data, true).replace(/[^ -\u007f]/g, " ").trim();
    return super.makeText(text, params, lineWidth);
  }
  verifyBytes(data) {
    const adapted = this.adaptData(utf8Decode(data));
    const units = codeUnits(adapted);
    this.shortestCode(units);
    super.verifyBytes(Uint8Array.from(units.map(unit => unit & 255)));
  }
}

class BarcodeCode39 extends Barcode1D {
  constructor(drawSpacers) {
    super();
    this.drawSpacers = drawSpacers;
  }
  get charSet() {
    return BarcodeMaps.code39.keys();
  }
  get name() {
    return "CODE 39";
  }
  convert(data) {
    const bits = [];
    bits.push(...this.add(BarcodeMaps.code39StartStop, BarcodeMaps.code39Len));
    for (const code of codeUnits(data)) {
      const codeValue = BarcodeMaps.code39.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      bits.push(...this.add(codeValue, BarcodeMaps.code39Len));
    }
    bits.push(...this.add(BarcodeMaps.code39StartStop, BarcodeMaps.code39Len));
    return bits;
  }
  makeText(data, params, lineWidth) {
    const text = this.drawSpacers ? `*${data}*` : data;
    const additionalOffset = this.drawSpacers ? 0 : 1;
    const result = [];
    for (let i = 0; i < text.length; i++) {
      result.push(new BarcodeText(lineWidth * BarcodeMaps.code39Len * (i + additionalOffset), params.height - params.fontHeight, lineWidth * BarcodeMaps.code39Len, params.fontHeight, text[i], "center"));
    }
    return result;
  }
}

class BarcodeCode93 extends Barcode1D {
  get charSet() {
    return [ ...BarcodeMaps.code93.keys() ].filter(x => x > 0);
  }
  get name() {
    return "CODE 93";
  }
  convert(data) {
    const bits = [];
    bits.push(...this.add(BarcodeMaps.code93StartStop, BarcodeMaps.code93Len));
    const keys = [ ...BarcodeMaps.code93.keys() ];
    const units = codeUnits(data);
    for (const code of units) {
      const codeValue = BarcodeMaps.code93.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      bits.push(...this.add(codeValue, BarcodeMaps.code93Len));
    }
    let sumC = 0;
    let sumK = 0;
    let indexC = 1;
    let indexK = 2;
    for (let index = units.length - 1; index >= 0; index--) {
      const code = units[index];
      sumC += keys.indexOf(code) * indexC;
      sumK += keys.indexOf(code) * indexK;
      indexC++;
      if (indexC > 20) indexC = 1;
      indexK++;
      if (indexK > 15) indexK = 1;
    }
    sumC = sumC % 47;
    bits.push(...this.add(BarcodeMaps.code93.get(keys[sumC]), BarcodeMaps.code93Len));
    sumK = (sumK + sumC) % 47;
    bits.push(...this.add(BarcodeMaps.code93.get(keys[sumK]), BarcodeMaps.code93Len));
    bits.push(...this.add(BarcodeMaps.code93StartStop, BarcodeMaps.code93Len));
    bits.push(true);
    return bits;
  }
}

class BarcodeEan extends Barcode1D {
  get charSet() {
    return Array.from({
      length: 10
    }, (_unused, index) => index + 48);
  }
  checkLength(data, length) {
    if (data.length === length - 1) {
      data += this.checkSumModulo10(data);
    } else {
      if (data.length !== length) {
        throw new BarcodeException(`Unable to encode "${data}" to ${this.name} Barcode, it is not ${length} digits`);
      }
      const last = data.substring(length - 1);
      const checksum = this.checkSumModulo10(data.substring(0, length - 1));
      if (last !== checksum) {
        throw new BarcodeException(`Unable to encode "${data}" to ${this.name} Barcode, checksum "${last}" should be "${checksum}"`);
      }
    }
    return data;
  }
  checkSumModulo10(data) {
    let sum = 0;
    let fak = data.length;
    for (const c of codeUnits(data)) {
      if (fak % 2 === 0) {
        sum += c - 48;
      } else {
        sum += (c - 48) * 3;
      }
      fak--;
    }
    if (sum % 10 === 0) {
      return "0";
    }
    return String.fromCharCode(10 - sum % 10 + 48);
  }
  checkSumModulo11(data) {
    let sum = 0;
    let pos = 10;
    for (const c of codeUnits(data)) {
      sum += (c - 48) * pos;
      pos--;
    }
    return String.fromCharCode(11 - sum % 11 + 48);
  }
  normalize(data) {
    return this.checkLength(data.padEnd(this.minLength, "0").substring(0, this.minLength), this.maxLength);
  }
}

const FINAL_SPACER$1 = ">";

class BarcodeEan13 extends BarcodeEan {
  constructor(drawEndChar) {
    super();
    this.drawEndChar = drawEndChar;
  }
  get name() {
    return "EAN 13";
  }
  get minLength() {
    return 12;
  }
  get maxLength() {
    return 13;
  }
  verifyBytes(data) {
    this.checkLength(utf8Decode(data), this.maxLength);
    super.verifyBytes(data);
  }
  convert(data) {
    const bits = [];
    const text = this.checkLength(data, this.maxLength);
    const units = codeUnits(text);
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    let index = 0;
    const first = BarcodeMaps.eanFirst.get(units[0]);
    if (first === undefined) {
      throw new BarcodeException(`Unable to encode "${String.fromCharCode(units[0])}" to ${this.name} Barcode`);
    }
    for (const code of units.slice(1)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (index === 6) {
        bits.push(...this.add(BarcodeMaps.eanCenter, 5));
      }
      if (index < 6) {
        bits.push(...this.add(codes[first >> index & 1], 7));
      } else {
        bits.push(...this.add(codes[2], 7));
      }
      index++;
    }
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    return bits;
  }
  marginLeft(params) {
    return params.drawText ? params.fontHeight : 0;
  }
  marginRight(params) {
    return params.drawText && this.drawEndChar ? params.fontHeight : 0;
  }
  getHeight(index, count, params) {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }
    const h = params.height - params.fontHeight - params.textPadding;
    if (index < 3 || index > 45 && index < 49 || index > 91) {
      return h + params.fontHeight / 2 + params.textPadding;
    }
    return h;
  }
  makeText(data, params, lineWidth) {
    const result = [];
    const text = this.checkLength(data, this.maxLength);
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    result.push(new BarcodeText(0, params.height - params.fontHeight, left - lineWidth, params.fontHeight, text[0], "right"));
    let offset = left + lineWidth * 3;
    for (let i = 1; i < text.length; i++) {
      result.push(new BarcodeText(offset, params.height - params.fontHeight, w, params.fontHeight, text[i], "center"));
      offset += w;
      if (i === 6) {
        offset += lineWidth * 5;
      }
    }
    if (this.drawEndChar) {
      result.push(new BarcodeText(params.width - right + lineWidth, params.height - params.fontHeight, right - lineWidth, params.fontHeight, FINAL_SPACER$1, "left"));
    }
    return result;
  }
}

class BarcodeEan2 extends BarcodeEan {
  get name() {
    return "EAN 2";
  }
  get minLength() {
    return 2;
  }
  get maxLength() {
    return 2;
  }
  convert(data) {
    this.verify(data);
    const idata = Number(data);
    if (!Number.isInteger(idata)) {
      throw new BarcodeException(`Unable to encode "${data}" to ${this.name} Barcode`);
    }
    const pattern = idata % 4;
    const bits = [];
    bits.push(...this.add(BarcodeMaps.eanStartEan2, 5));
    let index = 0;
    for (const code of codeUnits(data)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (index === 1) {
        bits.push(...this.add(BarcodeMaps.eanCenterEan2, 2));
      }
      if (index === 0) {
        bits.push(...this.add(codes[pattern < 2 ? 0 : 1], 7));
      } else {
        bits.push(...this.add(codes[pattern % 2 === 0 ? 0 : 1], 7));
      }
      index++;
    }
    return bits;
  }
  marginTop(params) {
    return params.drawText ? params.fontHeight + params.textPadding : 0;
  }
  getHeight(_index, _count, params) {
    return params.height;
  }
  makeText(data, params, _lineWidth) {
    return [ new BarcodeText(0, 0, params.width, params.fontHeight, data, "center") ];
  }
  normalize(data) {
    return data.padEnd(this.minLength, "0").substring(0, this.minLength);
  }
}

class BarcodeEan5 extends BarcodeEan2 {
  get name() {
    return "EAN 5";
  }
  get minLength() {
    return 5;
  }
  get maxLength() {
    return 5;
  }
  checkSumModulo10(data) {
    let sum = 0;
    let fak = data.length;
    for (const c of codeUnits(data)) {
      if (fak % 2 === 0) {
        sum += (c - 48) * 9;
      } else {
        sum += (c - 48) * 3;
      }
      fak--;
    }
    return String.fromCharCode(sum % 10 + 48);
  }
  convert(data) {
    this.verify(data);
    const checksum = this.checkSumModulo10(data);
    const pattern = BarcodeMaps.ean5Checksum.get(checksum.charCodeAt(0));
    const bits = [];
    bits.push(...this.add(BarcodeMaps.eanStartEan2, 5));
    let index = 0;
    for (const code of codeUnits(data)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (index >= 1) {
        bits.push(...this.add(BarcodeMaps.eanCenterEan2, 2));
      }
      bits.push(...this.add(codes[pattern >> index & 1], 7));
      index++;
    }
    return bits;
  }
}

const START_SPACER = "<";

const FINAL_SPACER = ">";

class BarcodeEan8 extends BarcodeEan {
  constructor(drawSpacers) {
    super();
    this.drawSpacers = drawSpacers;
  }
  get name() {
    return "EAN 8";
  }
  get minLength() {
    return 7;
  }
  get maxLength() {
    return 8;
  }
  verifyBytes(data) {
    this.checkLength(utf8Decode(data), this.maxLength);
    super.verifyBytes(data);
  }
  convert(data) {
    const bits = [];
    const text = this.checkLength(data, this.maxLength);
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    let index = 0;
    for (const code of codeUnits(text)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (index === 4) {
        bits.push(...this.add(BarcodeMaps.eanCenter, 5));
      }
      bits.push(...this.add(codes[index < 4 ? 0 : 2], 7));
      index++;
    }
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    return bits;
  }
  marginLeft(params) {
    return params.drawText && this.drawSpacers ? params.fontHeight : 0;
  }
  marginRight(params) {
    return params.drawText && this.drawSpacers ? params.fontHeight : 0;
  }
  getHeight(index, count, params) {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }
    const h = params.height - params.fontHeight - params.textPadding;
    if (index + count < 4 || index > 31 && index + count < 36 || index > 63) {
      return h + params.fontHeight / 2 + params.textPadding;
    }
    return h;
  }
  makeText(data, params, lineWidth) {
    const result = [];
    const text = this.checkLength(data, this.maxLength);
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    let offset = left + lineWidth * 3;
    for (let i = 0; i < text.length; i++) {
      result.push(new BarcodeText(offset, params.height - params.fontHeight, w, params.fontHeight, text[i], "center"));
      offset += w;
      if (i === 3) {
        offset += lineWidth * 5;
      }
    }
    if (this.drawSpacers) {
      result.push(new BarcodeText(0, params.height - params.fontHeight, left - lineWidth, params.fontHeight, START_SPACER, "right"));
      result.push(new BarcodeText(params.width - right + lineWidth, params.height - params.fontHeight, right - lineWidth, params.fontHeight, FINAL_SPACER, "left"));
    }
    return result;
  }
}

class BarcodeIsbn extends BarcodeEan13 {
  constructor(drawEndChar, drawIsbn) {
    super(drawEndChar);
    this.drawIsbn = drawIsbn;
  }
  get name() {
    return "ISBN";
  }
  marginTop(params) {
    if (!params.drawText || !this.drawIsbn) {
      return super.marginTop(params);
    }
    return params.fontHeight + params.textPadding;
  }
  makeText(data, params, lineWidth) {
    const text = this.checkLength(data, this.maxLength);
    const result = [ ...super.makeText(text, params, lineWidth) ];
    if (this.drawIsbn) {
      const isbn = `${text.substring(0, 3)}-${text.substring(3, 12)}-${text.substring(12, 13)}`;
      result.push(new BarcodeText(0, 0, params.width, params.fontHeight, `ISBN ${isbn}`, "center"));
    }
    return result;
  }
}

class BarcodeItf extends BarcodeEan {
  constructor(addChecksum, zeroPrepend, drawBorder, borderWidth, quietWidth, fixedLength) {
    super();
    if (fixedLength !== null && fixedLength % 2 !== 0) {
      throw new BarcodeException("An ITF barcode of fixed length needs an even one");
    }
    this.addChecksum = addChecksum;
    this.zeroPrepend = zeroPrepend;
    this.drawBorder = drawBorder;
    this.borderWidth = borderWidth;
    this.quietWidth = quietWidth;
    this.fixedLength = fixedLength;
  }
  get name() {
    return "ITF";
  }
  get minLength() {
    return this.fixedLength !== null ? this.fixedLength - 1 : super.minLength;
  }
  get maxLength() {
    return this.fixedLength !== null ? this.fixedLength : super.maxLength;
  }
  getBorderWidth(width) {
    return this.borderWidth ?? width * .015;
  }
  getQuietWidth(width) {
    return this.quietWidth ?? width * .07;
  }
  marginTop(params) {
    return this.drawBorder ? this.getBorderWidth(params.width) : 0;
  }
  marginLeft(params) {
    return this.drawBorder ? this.getBorderWidth(params.width) + this.getQuietWidth(params.width) : 0;
  }
  marginRight(params) {
    return this.drawBorder ? this.getBorderWidth(params.width) + this.getQuietWidth(params.width) : 0;
  }
  getHeight(index, count, params) {
    return super.getHeight(index, count, params) - (this.drawBorder ? this.getBorderWidth(params.width) : 0);
  }
  padded(data) {
    if (this.zeroPrepend && data.length % 2 !== 0 !== this.addChecksum) {
      data = `0${data}`;
    }
    if (this.addChecksum) {
      data += this.checkSumModulo10(data);
    }
    return data;
  }
  convert(data) {
    if (this.fixedLength !== null) {
      data = this.checkLength(data, this.fixedLength);
    } else {
      data = this.padded(data);
      if (data.length % 2 !== 0) {
        throw new BarcodeException(`${this.name} barcode can only encode an even number of digits.`);
      }
    }
    const bits = [];
    bits.push(...this.add(BarcodeMaps.itfStart, 4));
    const cu = codeUnits(data);
    for (let i = 0; i < cu.length / 2; i++) {
      const tuple = [ BarcodeMaps.itf.get(cu[i * 2]), BarcodeMaps.itf.get(cu[i * 2 + 1]) ];
      if (tuple[0] === undefined || tuple[1] === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(cu[i * 2])}` + `${String.fromCharCode(cu[i * 2 + 1])}" to ${this.name} Barcode`);
      }
      for (let n = 0; n < 10; n++) {
        const v = tuple[n % 2] >> Math.floor(n / 2) & 1;
        const c = n % 2 === 0;
        bits.push(c);
        if (v !== 0) {
          bits.push(c, c);
        }
      }
    }
    bits.push(...this.add(BarcodeMaps.itfEnd, 5));
    return bits;
  }
  makeBytes(data, options) {
    const params = drawParams(options);
    const result = [ ...super.makeBytes(data, options) ];
    if (this.drawBorder) {
      const bw = this.getBorderWidth(params.width);
      const hp = params.drawText ? params.fontHeight + params.textPadding : 0;
      result.push(new BarcodeBar(0, 0, params.width, bw, true));
      result.push(new BarcodeBar(0, params.height - hp - bw, params.width, bw, true));
      result.push(new BarcodeBar(0, bw, bw, params.height - hp - bw * 2, true));
      result.push(new BarcodeBar(params.width - bw, bw, bw, params.height - hp - bw * 2, true));
    }
    return result;
  }
  makeText(data, params, lineWidth) {
    const text = this.fixedLength !== null ? data : this.padded(data);
    return super.makeText(text, params, lineWidth);
  }
  verifyBytes(data) {
    let text = utf8Decode(data);
    if (this.fixedLength !== null) {
      text = this.checkLength(text, this.maxLength);
    } else {
      text = this.padded(text);
    }
    if (text.length % 2 !== 0) {
      throw new BarcodeException(`${this.name} barcode can only encode an even number of digits.`);
    }
    super.verifyBytes(utf8Encode(text));
  }
  normalize(data) {
    if (this.fixedLength !== null) {
      return this.checkLength(this.zeroPrepend ? data.padEnd(this.minLength, "0").substring(0, this.minLength) : data, this.maxLength);
    }
    return this.padded(data);
  }
}

class BarcodeItf14 extends BarcodeItf {
  constructor(drawBorder, borderWidth, quietWidth) {
    super(true, true, drawBorder, borderWidth, quietWidth, 14);
  }
  get name() {
    return "ITF 14";
  }
  makeText(data, params, lineWidth) {
    const text = this.checkLength(data, this.maxLength);
    const grouped = `${text.substring(0, 1)} ${text.substring(1, 3)} ` + `${text.substring(3, 8)} ${text.substring(8, 13)} ${text.substring(13, 14)}`;
    return super.makeText(grouped, params, lineWidth);
  }
}

class BarcodeItf16 extends BarcodeItf {
  constructor(drawBorder, borderWidth, quietWidth) {
    super(true, true, drawBorder, borderWidth, quietWidth, 16);
  }
  get name() {
    return "ITF 16";
  }
  makeText(data, params, lineWidth) {
    const text = this.checkLength(data, this.maxLength);
    const grouped = `${text.substring(0, 1)} ${text.substring(1, 3)} ` + `${text.substring(3, 5)} ${text.substring(5, 10)} ` + `${text.substring(10, 15)} ${text.substring(15, 16)}`;
    return super.makeText(grouped, params, lineWidth);
  }
}

class Barcode2DMatrix {
  constructor(width, height, ratio, pixels) {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.pixels = pixels;
  }
  static fromXY(width, height, ratio, isDark) {
    const pixels = [];
    for (let p = 0; p < width * height; p++) {
      const x = p % width;
      const y = Math.floor(p / width);
      pixels.push(isDark(x, y));
    }
    return new Barcode2DMatrix(width, height, ratio, pixels);
  }
}

class Barcode2D extends Barcode {
  makeBytes(data, options) {
    const {width, height} = options;
    if (!(width > 0) || !(height > 0)) {
      throw new RangeError("A barcode needs a positive width and height");
    }
    const matrix = this.convert(data);
    const result = [];
    const mh = matrix.height * matrix.ratio;
    let w;
    let h;
    if (width / height > matrix.width / mh) {
      w = matrix.width * height / mh;
      h = height;
    } else {
      w = width;
      h = mh * width / matrix.width;
    }
    const pixelW = w / matrix.width;
    const pixelH = h / matrix.height;
    const offsetX = (width - w) / 2;
    const offsetY = (height - h) / 2;
    let start = 0;
    let color = null;
    let x = 0;
    let y = 0;
    for (const pixel of matrix.pixels) {
      if (color === null) color = pixel;
      if (pixel !== color) {
        result.push(new BarcodeBar(offsetX + start * pixelW, offsetY + y * pixelH, (x - start) * pixelW, pixelH, color));
        color = pixel;
        start = x;
      }
      x++;
      if (x >= matrix.width) {
        result.push(new BarcodeBar(offsetX + start * pixelW, offsetY + y * pixelH, (matrix.width - start) * pixelW, pixelH, color));
        color = null;
        start = 0;
        x = 0;
        y++;
      }
    }
    return result;
  }
  verifyBytes(data) {
    super.verifyBytes(data);
    try {
      this.convert(data);
    } catch (error) {
      throw new BarcodeException(String(error));
    }
  }
  toHex(data) {
    let intermediate = "";
    const codeUnits = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) codeUnits[i] = data.charCodeAt(i) & 255;
    for (const bit of this.convert(codeUnits).pixels) {
      intermediate += bit ? "1" : "0";
    }
    let result = "";
    while (intermediate.length > 8) {
      const sub = intermediate.substring(intermediate.length - 8);
      result += parseInt(sub, 2).toString(16);
      intermediate = intermediate.substring(0, intermediate.length - 8);
    }
    result += parseInt(intermediate, 2).toString(16);
    return result;
  }
}

const startWord = 130728;

const stopWord = 260649;

const paddingCodeword = 900;

const codewords = [ [ 120256, 125680, 128380, 120032, 125560, 128318, 108736, 119920, 108640, 86080, 108592, 86048, 110016, 120560, 125820, 109792, 120440, 125758, 88256, 109680, 88160, 89536, 110320, 120700, 89312, 110200, 120638, 89200, 110140, 89840, 110460, 89720, 110398, 89980, 128506, 119520, 125304, 128190, 107712, 119408, 125244, 107616, 119352, 84032, 107568, 119324, 84e3, 107544, 83984, 108256, 119672, 125374, 85184, 108144, 119612, 85088, 108088, 119582, 85040, 108060, 85728, 108408, 119742, 85616, 108348, 85560, 108318, 85880, 108478, 85820, 85790, 107200, 119152, 125116, 107104, 119096, 125086, 83008, 107056, 119068, 82976, 107032, 82960, 82952, 83648, 107376, 119228, 83552, 107320, 119198, 83504, 107292, 83480, 83468, 83824, 107452, 83768, 107422, 83740, 83900, 106848, 118968, 125022, 82496, 106800, 118940, 82464, 106776, 118926, 82448, 106764, 82440, 106758, 82784, 106936, 119006, 82736, 106908, 82712, 106894, 82700, 82694, 106974, 82830, 82240, 106672, 118876, 82208, 106648, 118862, 82192, 106636, 82184, 106630, 82180, 82352, 82328, 82316, 82080, 118830, 106572, 106566, 82050, 117472, 124280, 127678, 103616, 117360, 124220, 103520, 117304, 124190, 75840, 103472, 75808, 104160, 117624, 124350, 76992, 104048, 117564, 76896, 103992, 76848, 76824, 77536, 104312, 117694, 77424, 104252, 77368, 77340, 77688, 104382, 77628, 77758, 121536, 126320, 128700, 121440, 126264, 128670, 111680, 121392, 126236, 111648, 121368, 126222, 111632, 121356, 103104, 117104, 124092, 112320, 103008, 117048, 124062, 112224, 121656, 126366, 93248, 74784, 102936, 117006, 93216, 112152, 93200, 75456, 103280, 117180, 93888, 75360, 103224, 117150, 93792, 112440, 121758, 93744, 75288, 93720, 75632, 103356, 94064, 75576, 103326, 94008, 112542, 93980, 75708, 94140, 75678, 94110, 121184, 126136, 128606, 111168, 121136, 126108, 111136, 121112, 126094, 111120, 121100, 111112, 111108, 102752, 116920, 123998, 111456, 102704, 116892, 91712, 74272, 121244, 116878, 91680, 74256, 102668, 91664, 111372, 102662, 74244, 74592, 102840, 116958, 92e3, 74544, 102812, 91952, 111516, 102798, 91928, 74508, 74502, 74680, 102878, 92088, 74652, 92060, 74638, 92046, 92126, 110912, 121008, 126044, 110880, 120984, 126030, 110864, 120972, 110856, 120966, 110852, 110850, 74048, 102576, 116828, 90944, 74016, 102552, 116814, 90912, 111e3, 121038, 90896, 73992, 102534, 90888, 110982, 90884, 74160, 102620, 91056, 74136, 102606, 91032, 111054, 91020, 74118, 91014, 91100, 91086, 110752, 120920, 125998, 110736, 120908, 110728, 120902, 110724, 110722, 73888, 102488, 116782, 90528, 73872, 102476, 90512, 110796, 102470, 90504, 73860, 90500, 73858, 73944, 90584, 90572, 90566, 120876, 120870, 110658, 102444, 73800, 90312, 90308, 90306, 101056, 116080, 123580, 100960, 116024, 70720, 100912, 115996, 70688, 100888, 70672, 70664, 71360, 101232, 116156, 71264, 101176, 116126, 71216, 101148, 71192, 71180, 71536, 101308, 71480, 101278, 71452, 71612, 71582, 118112, 124600, 127838, 105024, 118064, 124572, 104992, 118040, 124558, 104976, 118028, 104968, 118022, 100704, 115896, 123486, 105312, 100656, 115868, 79424, 70176, 118172, 115854, 79392, 105240, 100620, 79376, 70152, 79368, 70496, 100792, 115934, 79712, 70448, 118238, 79664, 105372, 100750, 79640, 70412, 79628, 70584, 100830, 79800, 70556, 79772, 70542, 70622, 79838, 122176, 126640, 128860, 122144, 126616, 128846, 122128, 126604, 122120, 126598, 122116, 104768, 117936, 124508, 113472, 104736, 126684, 124494, 113440, 122264, 126670, 113424, 104712, 117894, 113416, 122246, 104706, 69952, 100528, 115804, 78656, 69920, 100504, 115790, 96064, 78624, 104856, 117966, 96032, 113560, 122318, 100486, 96016, 78600, 104838, 96008, 69890, 70064, 100572, 78768, 70040, 100558, 96176, 78744, 104910, 96152, 113614, 70022, 78726, 70108, 78812, 70094, 96220, 78798, 122016, 126552, 128814, 122e3, 126540, 121992, 126534, 121988, 121986, 104608, 117848, 124462, 113056, 104592, 126574, 113040, 122060, 117830, 113032, 104580, 113028, 104578, 113026, 69792, 100440, 115758, 78240, 69776, 100428, 95136, 78224, 104652, 100422, 95120, 113100, 69764, 95112, 78212, 69762, 78210, 69848, 100462, 78296, 69836, 95192, 78284, 69830, 95180, 78278, 69870, 95214, 121936, 126508, 121928, 126502, 121924, 121922, 104528, 117804, 112848, 104520, 117798, 112840, 121958, 112836, 104514, 112834, 69712, 100396, 78032, 69704, 100390, 94672, 78024, 104550, 94664, 112870, 69698, 94660, 78018, 94658, 78060, 94700, 94694, 126486, 121890, 117782, 104484, 104482, 69672, 77928, 94440, 69666, 77922, 99680, 68160, 99632, 68128, 99608, 115342, 68112, 99596, 68104, 99590, 68448, 99768, 115422, 68400, 99740, 68376, 99726, 68364, 68358, 68536, 99806, 68508, 68494, 68574, 101696, 116400, 123740, 101664, 116376, 101648, 116364, 101640, 116358, 101636, 67904, 99504, 115292, 72512, 67872, 116444, 115278, 72480, 101784, 116430, 72464, 67848, 99462, 72456, 101766, 67842, 68016, 99548, 72624, 67992, 99534, 72600, 101838, 72588, 67974, 68060, 72668, 68046, 72654, 118432, 124760, 127918, 118416, 124748, 118408, 124742, 118404, 118402, 101536, 116312, 105888, 101520, 116300, 105872, 118476, 116294, 105864, 101508, 105860, 101506, 105858, 67744, 99416, 72096, 67728, 116334, 80800, 72080, 101580, 99398, 80784, 105932, 67716, 80776, 72068, 67714, 72066, 67800, 99438, 72152, 67788, 80856, 72140, 67782, 80844, 72134, 67822, 72174, 80878, 126800, 128940, 126792, 128934, 126788, 126786, 118352, 124716, 122576, 126828, 124710, 122568, 126822, 122564, 118338, 122562, 101456, 116268, 105680, 101448, 116262, 114128, 105672, 118374, 114120, 122598, 101442, 114116, 105666, 114114, 67664, 99372, 71888, 67656, 99366, 80336, 71880, 101478, 97232, 80328, 105702, 67650, 97224, 114150, 71874, 97220, 67692, 71916, 67686, 80364, 71910, 97260, 80358, 97254, 126760, 128918, 126756, 126754, 118312, 124694, 122472, 126774, 122468, 118306, 122466, 101416, 116246, 105576, 101412, 113896, 105572, 101410, 113892, 105570, 113890, 67624, 99350, 71784, 101430, 80104, 71780, 67618, 96744, 80100, 71778, 96740, 80098, 96738, 71798, 96758, 126738, 122420, 122418, 105524, 113780, 113778, 71732, 79988, 96500, 96498, 66880, 66848, 98968, 66832, 66824, 66820, 66992, 66968, 66956, 66950, 67036, 67022, 1e5, 99984, 115532, 99976, 115526, 99972, 99970, 66720, 98904, 69024, 100056, 98892, 69008, 100044, 69e3, 100038, 68996, 66690, 68994, 66776, 98926, 69080, 100078, 69068, 66758, 69062, 66798, 69102, 116560, 116552, 116548, 116546, 99920, 102096, 116588, 115494, 102088, 116582, 102084, 99906, 102082, 66640, 68816, 66632, 98854, 73168, 68808, 66628, 73160, 68804, 66626, 73156, 68802, 66668, 68844, 66662, 73196, 68838, 73190, 124840, 124836, 124834, 116520, 118632, 124854, 118628, 116514, 118626, 99880, 115478, 101992, 116534, 106216, 101988, 99874, 106212, 101986, 106210, 66600, 98838, 68712, 99894, 72936, 68708, 66594, 81384, 72932, 68706, 81380, 72930, 66614, 68726, 72950, 81398, 128980, 128978, 124820, 126900, 124818, 126898, 116500, 118580, 116498, 122740, 118578, 122738, 99860, 101940, 99858, 106100, 101938, 114420 ], [ 128352, 129720, 125504, 128304, 129692, 125472, 128280, 129678, 125456, 128268, 125448, 128262, 125444, 125792, 128440, 129758, 120384, 125744, 128412, 120352, 125720, 128398, 120336, 125708, 120328, 125702, 120324, 120672, 125880, 128478, 110144, 120624, 125852, 110112, 120600, 125838, 110096, 120588, 110088, 120582, 110084, 110432, 120760, 125918, 89664, 110384, 120732, 89632, 110360, 120718, 89616, 110348, 89608, 110342, 89952, 110520, 120798, 89904, 110492, 89880, 110478, 89868, 90040, 110558, 90012, 89998, 125248, 128176, 129628, 125216, 128152, 129614, 125200, 128140, 125192, 128134, 125188, 125186, 119616, 125360, 128220, 119584, 125336, 128206, 119568, 125324, 119560, 125318, 119556, 119554, 108352, 119728, 125404, 108320, 119704, 125390, 108304, 119692, 108296, 119686, 108292, 108290, 85824, 108464, 119772, 85792, 108440, 119758, 85776, 108428, 85768, 108422, 85764, 85936, 108508, 85912, 108494, 85900, 85894, 85980, 85966, 125088, 128088, 129582, 125072, 128076, 125064, 128070, 125060, 125058, 119200, 125144, 128110, 119184, 125132, 119176, 125126, 119172, 119170, 107424, 119256, 125166, 107408, 119244, 107400, 119238, 107396, 107394, 83872, 107480, 119278, 83856, 107468, 83848, 107462, 83844, 83842, 83928, 107502, 83916, 83910, 83950, 125008, 128044, 125e3, 128038, 124996, 124994, 118992, 125036, 118984, 125030, 118980, 118978, 106960, 119020, 106952, 119014, 106948, 106946, 82896, 106988, 82888, 106982, 82884, 82882, 82924, 82918, 124968, 128022, 124964, 124962, 118888, 124982, 118884, 118882, 106728, 118902, 106724, 106722, 82408, 106742, 82404, 82402, 124948, 124946, 118836, 118834, 106612, 106610, 124224, 127664, 129372, 124192, 127640, 129358, 124176, 127628, 124168, 127622, 124164, 124162, 117568, 124336, 127708, 117536, 124312, 127694, 117520, 124300, 117512, 124294, 117508, 117506, 104256, 117680, 124380, 104224, 117656, 124366, 104208, 117644, 104200, 117638, 104196, 104194, 77632, 104368, 117724, 77600, 104344, 117710, 77584, 104332, 77576, 104326, 77572, 77744, 104412, 77720, 104398, 77708, 77702, 77788, 77774, 128672, 129880, 93168, 128656, 129868, 92664, 128648, 129862, 92412, 128644, 128642, 124064, 127576, 129326, 126368, 124048, 129902, 126352, 128716, 127558, 126344, 124036, 126340, 124034, 126338, 117152, 124120, 127598, 121760, 117136, 124108, 121744, 126412, 124102, 121736, 117124, 121732, 117122, 121730, 103328, 117208, 124142, 112544, 103312, 117196, 112528, 121804, 117190, 112520, 103300, 112516, 103298, 112514, 75680, 103384, 117230, 94112, 75664, 103372, 94096, 112588, 103366, 94088, 75652, 94084, 75650, 75736, 103406, 94168, 75724, 94156, 75718, 94150, 75758, 128592, 129836, 91640, 128584, 129830, 91388, 128580, 91262, 128578, 123984, 127532, 126160, 123976, 127526, 126152, 128614, 126148, 123970, 126146, 116944, 124012, 121296, 116936, 124006, 121288, 126182, 121284, 116930, 121282, 102864, 116972, 111568, 102856, 116966, 111560, 121318, 111556, 102850, 111554, 74704, 102892, 92112, 74696, 102886, 92104, 111590, 92100, 74690, 92098, 74732, 92140, 74726, 92134, 128552, 129814, 90876, 128548, 90750, 128546, 123944, 127510, 126056, 128566, 126052, 123938, 126050, 116840, 123958, 121064, 116836, 121060, 116834, 121058, 102632, 116854, 111080, 121078, 111076, 102626, 111074, 74216, 102646, 91112, 74212, 91108, 74210, 91106, 74230, 91126, 128532, 90494, 128530, 123924, 126004, 123922, 126002, 116788, 120948, 116786, 120946, 102516, 110836, 102514, 110834, 73972, 90612, 73970, 90610, 128522, 123914, 125978, 116762, 120890, 102458, 110714, 123552, 127320, 129198, 123536, 127308, 123528, 127302, 123524, 123522, 116128, 123608, 127342, 116112, 123596, 116104, 123590, 116100, 116098, 101280, 116184, 123630, 101264, 116172, 101256, 116166, 101252, 101250, 71584, 101336, 116206, 71568, 101324, 71560, 101318, 71556, 71554, 71640, 101358, 71628, 71622, 71662, 127824, 129452, 79352, 127816, 129446, 79100, 127812, 78974, 127810, 123472, 127276, 124624, 123464, 127270, 124616, 127846, 124612, 123458, 124610, 115920, 123500, 118224, 115912, 123494, 118216, 124646, 118212, 115906, 118210, 100816, 115948, 105424, 100808, 115942, 105416, 118246, 105412, 100802, 105410, 70608, 100844, 79824, 70600, 100838, 79816, 105446, 79812, 70594, 79810, 70636, 79852, 70630, 79846, 129960, 95728, 113404, 129956, 95480, 113278, 129954, 95356, 95294, 127784, 129430, 78588, 128872, 129974, 95996, 78462, 128868, 127778, 95870, 128866, 123432, 127254, 124520, 123428, 126696, 128886, 123426, 126692, 124514, 126690, 115816, 123446, 117992, 115812, 122344, 117988, 115810, 122340, 117986, 122338, 100584, 115830, 104936, 100580, 113640, 104932, 100578, 113636, 104930, 113634, 70120, 100598, 78824, 70116, 96232, 78820, 70114, 96228, 78818, 96226, 70134, 78838, 129940, 94968, 113022, 129938, 94844, 94782, 127764, 78206, 128820, 127762, 95102, 128818, 123412, 124468, 123410, 126580, 124466, 126578, 115764, 117876, 115762, 122100, 117874, 122098, 100468, 104692, 100466, 113140, 104690, 113138, 69876, 78324, 69874, 95220, 78322, 95218, 129930, 94588, 94526, 127754, 128794, 123402, 124442, 126522, 115738, 117818, 121978, 100410, 104570, 112890, 69754, 78074, 94714, 94398, 123216, 127148, 123208, 127142, 123204, 123202, 115408, 123244, 115400, 123238, 115396, 115394, 99792, 115436, 99784, 115430, 99780, 99778, 68560, 99820, 68552, 99814, 68548, 68546, 68588, 68582, 127400, 129238, 72444, 127396, 72318, 127394, 123176, 127126, 123752, 123172, 123748, 123170, 123746, 115304, 123190, 116456, 115300, 116452, 115298, 116450, 99560, 115318, 101864, 99556, 101860, 99554, 101858, 68072, 99574, 72680, 68068, 72676, 68066, 72674, 68086, 72694, 129492, 80632, 105854, 129490, 80508, 80446, 127380, 72062, 127924, 127378, 80766, 127922, 123156, 123700, 123154, 124788, 123698, 124786, 115252, 116340, 115250, 118516, 116338, 118514, 99444, 101620, 99442, 105972, 101618, 105970, 67828, 72180, 67826, 80884, 72178, 80882, 97008, 114044, 96888, 113982, 96828, 96798, 129482, 80252, 130010, 97148, 80190, 97086, 127370, 127898, 128954, 123146, 123674, 124730, 126842, 115226, 116282, 118394, 122618, 99386, 101498, 105722, 114170, 67706, 71930, 80378, 96632, 113854, 96572, 96542, 80062, 96702, 96444, 96414, 96350, 123048, 123044, 123042, 115048, 123062, 115044, 115042, 99048, 115062, 99044, 99042, 67048, 99062, 67044, 67042, 67062, 127188, 68990, 127186, 123028, 123316, 123026, 123314, 114996, 115572, 114994, 115570, 98932, 100084, 98930, 100082, 66804, 69108, 66802, 69106, 129258, 73084, 73022, 127178, 127450, 123018, 123290, 123834, 114970, 115514, 116602, 98874, 99962, 102138, 66682, 68858, 73210, 81272, 106174, 81212, 81182, 72894, 81342, 97648, 114364, 97592, 114334, 97564, 97550, 81084, 97724, 81054, 97694, 97464, 114270, 97436, 97422, 80990, 97502, 97372, 97358, 97326, 114868, 114866, 98676, 98674, 66292, 66290, 123098, 114842, 115130, 98618, 99194, 66170, 67322, 69310, 73404, 73374, 81592, 106334, 81564, 81550, 73310, 81630, 97968, 114524, 97944, 114510, 97932, 97926, 81500, 98012, 81486, 97998, 97880, 114478, 97868, 97862, 81454, 97902, 97836, 97830, 69470, 73564, 73550, 81752, 106414, 81740, 81734, 73518, 81774, 81708, 81702 ], [ 109536, 120312, 86976, 109040, 120060, 86496, 108792, 119934, 86256, 108668, 86136, 129744, 89056, 110072, 129736, 88560, 109820, 129732, 88312, 109694, 129730, 88188, 128464, 129772, 89592, 128456, 129766, 89340, 128452, 89214, 128450, 125904, 128492, 125896, 128486, 125892, 125890, 120784, 125932, 120776, 125926, 120772, 120770, 110544, 120812, 110536, 120806, 110532, 84928, 108016, 119548, 84448, 107768, 119422, 84208, 107644, 84088, 107582, 84028, 129640, 85488, 108284, 129636, 85240, 108158, 129634, 85116, 85054, 128232, 129654, 85756, 128228, 85630, 128226, 125416, 128246, 125412, 125410, 119784, 125430, 119780, 119778, 108520, 119798, 108516, 108514, 83424, 107256, 119166, 83184, 107132, 83064, 107070, 83004, 82974, 129588, 83704, 107390, 129586, 83580, 83518, 128116, 83838, 128114, 125172, 125170, 119284, 119282, 107508, 107506, 82672, 106876, 82552, 106814, 82492, 82462, 129562, 82812, 82750, 128058, 125050, 119034, 82296, 106686, 82236, 82206, 82366, 82108, 82078, 76736, 103920, 117500, 76256, 103672, 117374, 76016, 103548, 75896, 103486, 75836, 129384, 77296, 104188, 129380, 77048, 104062, 129378, 76924, 76862, 127720, 129398, 77564, 127716, 77438, 127714, 124392, 127734, 124388, 124386, 117736, 124406, 117732, 117730, 104424, 117750, 104420, 104418, 112096, 121592, 126334, 92608, 111856, 121468, 92384, 111736, 121406, 92272, 111676, 92216, 111646, 92188, 75232, 103160, 117118, 93664, 74992, 103036, 93424, 112252, 102974, 93304, 74812, 93244, 74782, 93214, 129332, 75512, 103294, 129908, 129330, 93944, 75388, 129906, 93820, 75326, 93758, 127604, 75646, 128756, 127602, 94078, 128754, 124148, 126452, 124146, 126450, 117236, 121844, 117234, 121842, 103412, 103410, 91584, 111344, 121212, 91360, 111224, 121150, 91248, 111164, 91192, 111134, 91164, 91150, 74480, 102780, 91888, 74360, 102718, 91768, 111422, 91708, 74270, 91678, 129306, 74620, 129850, 92028, 74558, 91966, 127546, 128634, 124026, 126202, 116986, 121338, 102906, 90848, 110968, 121022, 90736, 110908, 90680, 110878, 90652, 90638, 74104, 102590, 91e3, 74044, 90940, 74014, 90910, 74174, 91070, 90480, 110780, 90424, 110750, 90396, 90382, 73916, 90556, 73886, 90526, 90296, 110686, 90268, 90254, 73822, 90334, 90204, 90190, 71136, 101112, 116094, 70896, 100988, 70776, 100926, 70716, 70686, 129204, 71416, 101246, 129202, 71292, 71230, 127348, 71550, 127346, 123636, 123634, 116212, 116210, 101364, 101362, 79296, 105200, 118140, 79072, 105080, 118078, 78960, 105020, 78904, 104990, 78876, 78862, 70384, 100732, 79600, 70264, 100670, 79480, 105278, 79420, 70174, 79390, 129178, 70524, 129466, 79740, 70462, 79678, 127290, 127866, 123514, 124666, 115962, 118266, 100858, 113376, 122232, 126654, 95424, 113264, 122172, 95328, 113208, 122142, 95280, 113180, 95256, 113166, 95244, 78560, 104824, 117950, 95968, 78448, 104764, 95856, 113468, 104734, 95800, 78364, 95772, 78350, 95758, 70008, 100542, 78712, 69948, 96120, 78652, 69918, 96060, 78622, 96030, 70078, 78782, 96190, 94912, 113008, 122044, 94816, 112952, 122014, 94768, 112924, 94744, 112910, 94732, 94726, 78192, 104636, 95088, 78136, 104606, 95032, 113054, 95004, 78094, 94990, 69820, 78268, 69790, 95164, 78238, 95134, 94560, 112824, 121950, 94512, 112796, 94488, 112782, 94476, 94470, 78008, 104542, 94648, 77980, 94620, 77966, 94606, 69726, 78046, 94686, 94384, 112732, 94360, 112718, 94348, 94342, 77916, 94428, 77902, 94414, 94296, 112686, 94284, 94278, 77870, 94318, 94252, 94246, 68336, 99708, 68216, 99646, 68156, 68126, 68476, 68414, 127162, 123258, 115450, 99834, 72416, 101752, 116414, 72304, 101692, 72248, 101662, 72220, 72206, 67960, 99518, 72568, 67900, 72508, 67870, 72478, 68030, 72638, 80576, 105840, 118460, 80480, 105784, 118430, 80432, 105756, 80408, 105742, 80396, 80390, 72048, 101564, 80752, 71992, 101534, 80696, 71964, 80668, 71950, 80654, 67772, 72124, 67742, 80828, 72094, 80798, 114016, 122552, 126814, 96832, 113968, 122524, 96800, 113944, 122510, 96784, 113932, 96776, 113926, 96772, 80224, 105656, 118366, 97120, 80176, 105628, 97072, 114076, 105614, 97048, 80140, 97036, 80134, 97030, 71864, 101470, 80312, 71836, 97208, 80284, 71822, 97180, 80270, 97166, 67678, 71902, 80350, 97246, 96576, 113840, 122460, 96544, 113816, 122446, 96528, 113804, 96520, 113798, 96516, 96514, 80048, 105564, 96688, 80024, 105550, 96664, 113870, 96652, 80006, 96646, 71772, 80092, 71758, 96732, 80078, 96718, 96416, 113752, 122414, 96400, 113740, 96392, 113734, 96388, 96386, 79960, 105518, 96472, 79948, 96460, 79942, 96454, 71726, 79982, 96494, 96336, 113708, 96328, 113702, 96324, 96322, 79916, 96364, 79910, 96358, 96296, 113686, 96292, 96290, 79894, 96310, 66936, 99006, 66876, 66846, 67006, 68976, 100028, 68920, 99998, 68892, 68878, 66748, 69052, 66718, 69022, 73056, 102072, 116574, 73008, 102044, 72984, 102030, 72972, 72966, 68792, 99934, 73144, 68764, 73116, 68750, 73102, 66654, 68830, 73182, 81216, 106160, 118620, 81184, 106136, 118606, 81168, 106124, 81160, 106118, 81156, 81154, 72880, 101980, 81328, 72856, 101966, 81304, 106190, 81292, 72838, 81286, 68700, 72924, 68686, 81372, 72910, 81358, 114336, 122712, 126894, 114320, 122700, 114312, 122694, 114308, 114306, 81056, 106072, 118574, 97696, 81040, 106060, 97680, 114380, 106054, 97672, 81028, 97668, 81026, 97666, 72792, 101934, 81112, 72780, 97752, 81100, 72774, 97740, 81094, 97734, 68654, 72814, 81134, 97774, 114256, 122668, 114248, 122662, 114244, 114242, 80976, 106028, 97488, 80968, 106022, 97480, 114278, 97476, 80962, 97474, 72748, 81004, 72742, 97516, 80998, 97510, 114216, 122646, 114212, 114210, 80936, 106006, 97384, 80932, 97380, 80930, 97378, 72726, 80950, 97398, 114196, 114194, 80916, 97332, 80914, 97330, 66236, 66206, 67256, 99166, 67228, 67214, 66142, 67294, 69296, 100188, 69272, 100174, 69260, 69254, 67164, 69340, 67150, 69326, 73376, 102232, 116654, 73360, 102220, 73352, 102214, 73348, 73346, 69208, 100142, 73432, 102254, 73420, 69190, 73414, 67118, 69230, 73454, 106320, 118700, 106312, 118694, 106308, 106306, 73296, 102188, 81616, 106348, 102182, 81608, 73284, 81604, 73282, 81602, 69164, 73324, 69158, 81644, 73318, 81638, 122792, 126934, 122788, 122786, 106280, 118678, 114536, 106276, 114532, 106274, 114530, 73256, 102166, 81512, 73252, 98024, 81508, 73250, 98020, 81506, 98018, 69142, 73270, 81526, 98038, 122772, 122770, 106260, 114484, 106258, 114482, 73236, 81460, 73234, 97908, 81458, 97906, 122762, 106250, 114458, 73226, 81434, 97850, 66396, 66382, 67416, 99246, 67404, 67398, 66350, 67438, 69456, 100268, 69448, 100262, 69444, 69442, 67372, 69484, 67366, 69478, 102312, 116694, 102308, 102306, 69416, 100246, 73576, 102326, 73572, 69410, 73570, 67350, 69430, 73590, 118740, 118738, 102292, 106420, 102290, 106418, 69396, 73524, 69394, 81780, 73522, 81778, 118730, 102282, 106394, 69386, 73498, 81722, 66476, 66470, 67496, 99286, 67492, 67490, 66454, 67510, 100308, 100306, 67476, 69556, 67474, 69554, 116714 ] ];

const correctionFactors = [ [ 27, 917 ], [ 522, 568, 723, 809 ], [ 237, 308, 436, 284, 646, 653, 428, 379 ], [ 274, 562, 232, 755, 599, 524, 801, 132, 295, 116, 442, 428, 295, 42, 176, 65 ], [ 361, 575, 922, 525, 176, 586, 640, 321, 536, 742, 677, 742, 687, 284, 193, 517, 273, 494, 263, 147, 593, 800, 571, 320, 803, 133, 231, 390, 685, 330, 63, 410 ], [ 539, 422, 6, 93, 862, 771, 453, 106, 610, 287, 107, 505, 733, 877, 381, 612, 723, 476, 462, 172, 430, 609, 858, 822, 543, 376, 511, 400, 672, 762, 283, 184, 440, 35, 519, 31, 460, 594, 225, 535, 517, 352, 605, 158, 651, 201, 488, 502, 648, 733, 717, 83, 404, 97, 280, 771, 840, 629, 4, 381, 843, 623, 264, 543 ], [ 521, 310, 864, 547, 858, 580, 296, 379, 53, 779, 897, 444, 400, 925, 749, 415, 822, 93, 217, 208, 928, 244, 583, 620, 246, 148, 447, 631, 292, 908, 490, 704, 516, 258, 457, 907, 594, 723, 674, 292, 272, 96, 684, 432, 686, 606, 860, 569, 193, 219, 129, 186, 236, 287, 192, 775, 278, 173, 40, 379, 712, 463, 646, 776, 171, 491, 297, 763, 156, 732, 95, 270, 447, 90, 507, 48, 228, 821, 808, 898, 784, 663, 627, 378, 382, 262, 380, 602, 754, 336, 89, 614, 87, 432, 670, 616, 157, 374, 242, 726, 600, 269, 375, 898, 845, 454, 354, 130, 814, 587, 804, 34, 211, 330, 539, 297, 827, 865, 37, 517, 834, 315, 550, 86, 801, 4, 108, 539 ], [ 524, 894, 75, 766, 882, 857, 74, 204, 82, 586, 708, 250, 905, 786, 138, 720, 858, 194, 311, 913, 275, 190, 375, 850, 438, 733, 194, 280, 201, 280, 828, 757, 710, 814, 919, 89, 68, 569, 11, 204, 796, 605, 540, 913, 801, 700, 799, 137, 439, 418, 592, 668, 353, 859, 370, 694, 325, 240, 216, 257, 284, 549, 209, 884, 315, 70, 329, 793, 490, 274, 877, 162, 749, 812, 684, 461, 334, 376, 849, 521, 307, 291, 803, 712, 19, 358, 399, 908, 103, 511, 51, 8, 517, 225, 289, 470, 637, 731, 66, 255, 917, 269, 463, 830, 730, 433, 848, 585, 136, 538, 906, 90, 2, 290, 743, 199, 655, 903, 329, 49, 802, 580, 355, 588, 188, 462, 10, 134, 628, 320, 479, 130, 739, 71, 263, 318, 374, 601, 192, 605, 142, 673, 687, 234, 722, 384, 177, 752, 607, 640, 455, 193, 689, 707, 805, 641, 48, 60, 732, 621, 895, 544, 261, 852, 655, 309, 697, 755, 756, 60, 231, 773, 434, 421, 726, 528, 503, 118, 49, 795, 32, 144, 500, 238, 836, 394, 280, 566, 319, 9, 647, 550, 73, 914, 342, 126, 32, 681, 331, 792, 620, 60, 609, 441, 180, 791, 893, 754, 605, 383, 228, 749, 760, 213, 54, 297, 134, 54, 834, 299, 922, 191, 910, 532, 609, 829, 189, 20, 167, 29, 872, 449, 83, 402, 41, 656, 505, 579, 481, 173, 404, 251, 688, 95, 497, 555, 642, 543, 307, 159, 924, 558, 648, 55, 497, 10 ], [ 352, 77, 373, 504, 35, 599, 428, 207, 409, 574, 118, 498, 285, 380, 350, 492, 197, 265, 920, 155, 914, 299, 229, 643, 294, 871, 306, 88, 87, 193, 352, 781, 846, 75, 327, 520, 435, 543, 203, 666, 249, 346, 781, 621, 640, 268, 794, 534, 539, 781, 408, 390, 644, 102, 476, 499, 290, 632, 545, 37, 858, 916, 552, 41, 542, 289, 122, 272, 383, 800, 485, 98, 752, 472, 761, 107, 784, 860, 658, 741, 290, 204, 681, 407, 855, 85, 99, 62, 482, 180, 20, 297, 451, 593, 913, 142, 808, 684, 287, 536, 561, 76, 653, 899, 729, 567, 744, 390, 513, 192, 516, 258, 240, 518, 794, 395, 768, 848, 51, 610, 384, 168, 190, 826, 328, 596, 786, 303, 570, 381, 415, 641, 156, 237, 151, 429, 531, 207, 676, 710, 89, 168, 304, 402, 40, 708, 575, 162, 864, 229, 65, 861, 841, 512, 164, 477, 221, 92, 358, 785, 288, 357, 850, 836, 827, 736, 707, 94, 8, 494, 114, 521, 2, 499, 851, 543, 152, 729, 771, 95, 248, 361, 578, 323, 856, 797, 289, 51, 684, 466, 533, 820, 669, 45, 902, 452, 167, 342, 244, 173, 35, 463, 651, 51, 699, 591, 452, 578, 37, 124, 298, 332, 552, 43, 427, 119, 662, 777, 475, 850, 764, 364, 578, 911, 283, 711, 472, 420, 245, 288, 594, 394, 511, 327, 589, 777, 699, 688, 43, 408, 842, 383, 721, 521, 560, 644, 714, 559, 62, 145, 873, 663, 713, 159, 672, 729, 624, 59, 193, 417, 158, 209, 563, 564, 343, 693, 109, 608, 563, 365, 181, 772, 677, 310, 248, 353, 708, 410, 579, 870, 617, 841, 632, 860, 289, 536, 35, 777, 618, 586, 424, 833, 77, 597, 346, 269, 757, 632, 695, 751, 331, 247, 184, 45, 787, 680, 18, 66, 407, 369, 54, 492, 228, 613, 830, 922, 437, 519, 644, 905, 789, 420, 305, 441, 207, 300, 892, 827, 141, 537, 381, 662, 513, 56, 252, 341, 242, 797, 838, 837, 720, 224, 307, 631, 61, 87, 560, 310, 756, 665, 397, 808, 851, 309, 473, 795, 378, 31, 647, 915, 459, 806, 590, 731, 425, 216, 548, 249, 321, 881, 699, 535, 673, 782, 210, 815, 905, 303, 843, 922, 281, 73, 469, 791, 660, 162, 498, 308, 155, 422, 907, 817, 187, 62, 16, 425, 535, 336, 286, 437, 375, 273, 610, 296, 183, 923, 116, 667, 751, 353, 62, 366, 691, 379, 687, 842, 37, 357, 720, 742, 330, 5, 39, 923, 311, 424, 242, 749, 321, 54, 669, 316, 342, 299, 534, 105, 667, 488, 640, 672, 576, 540, 316, 486, 721, 610, 46, 656, 447, 171, 616, 464, 190, 531, 297, 321, 762, 752, 533, 175, 134, 14, 381, 433, 717, 45, 111, 20, 596, 284, 736, 138, 646, 411, 877, 669, 141, 919, 45, 780, 407, 164, 332, 899, 165, 726, 600, 325, 498, 655, 357, 752, 768, 223, 849, 647, 63, 310, 863, 251, 366, 304, 282, 738, 675, 410, 389, 244, 31, 121, 303, 263 ] ];

const latchToText = 900;

const latchToBytePadded = 901;

const latchToNumeric = 902;

const latchToByte = 924;

const shiftToByte = 913;

const minNumericCount = 13;

const mixedMap = new Map([ [ 48, 0 ], [ 49, 1 ], [ 50, 2 ], [ 51, 3 ], [ 52, 4 ], [ 53, 5 ], [ 54, 6 ], [ 55, 7 ], [ 56, 8 ], [ 57, 9 ], [ 38, 10 ], [ 13, 11 ], [ 9, 12 ], [ 44, 13 ], [ 58, 14 ], [ 35, 15 ], [ 45, 16 ], [ 46, 17 ], [ 36, 18 ], [ 47, 19 ], [ 43, 20 ], [ 37, 21 ], [ 42, 22 ], [ 61, 23 ], [ 94, 24 ], [ 32, 26 ] ]);

const punctMap = new Map([ [ 59, 0 ], [ 60, 1 ], [ 62, 2 ], [ 64, 3 ], [ 91, 4 ], [ 92, 5 ], [ 93, 6 ], [ 95, 7 ], [ 96, 8 ], [ 126, 9 ], [ 33, 10 ], [ 13, 11 ], [ 9, 12 ], [ 44, 13 ], [ 58, 14 ], [ 10, 15 ], [ 45, 16 ], [ 46, 17 ], [ 36, 18 ], [ 47, 19 ], [ 34, 20 ], [ 124, 21 ], [ 42, 22 ], [ 40, 23 ], [ 41, 24 ], [ 63, 25 ], [ 123, 26 ], [ 125, 27 ], [ 39, 28 ] ]);

const Pdf417SecurityLevel = {
  level0: 0,
  level1: 1,
  level2: 2,
  level3: 3,
  level4: 4,
  level5: 5,
  level6: 6,
  level7: 7,
  level8: 8
};

const MIN_COLS = 2;

const MAX_COLS = 60;

const MAX_ROWS = 60;

const MIN_ROWS = 2;

const ENC_TEXT = 0;

const ENC_NUMERIC = 1;

const ENC_BINARY = 2;

const SUB_UPPER = 0;

const SUB_LOWER = 1;

const SUB_MIXED = 2;

const SUB_PUNCT = 3;

class BarcodePDF417 extends Barcode2D {
  constructor(securityLevel, moduleHeight, preferredRatio) {
    super();
    this.securityLevel = securityLevel;
    this.moduleHeight = moduleHeight;
    this.preferredRatio = preferredRatio;
  }
  get charSet() {
    return Array.from({
      length: 256
    }, (_unused, index) => index);
  }
  get name() {
    return "PDF417";
  }
  get maxLength() {
    return 990;
  }
  convert(data) {
    const dataWords = this.highlevelEncode([ ...data ]);
    const dim = this.calcDimensions(dataWords.length, errorCorrectionWordCount(this.securityLevel));
    if (dim.columns < MIN_COLS || dim.columns > MAX_COLS || dim.rows < MIN_ROWS || dim.rows > MAX_ROWS) {
      throw new BarcodeException("Unable to fit data in barcode");
    }
    const codeWords = this.encodeData(dataWords, dim.columns, this.securityLevel);
    const grid = [];
    for (let i = 0; i < codeWords.length; i += dim.columns) {
      grid.push(codeWords.slice(i, Math.min(i + dim.columns, codeWords.length)));
    }
    const codes = [];
    let rowNum = 0;
    for (const row of grid) {
      const table = rowNum % 3;
      const rowCodes = [];
      rowCodes.push(startWord);
      rowCodes.push(getCodeword(table, leftCodeWord(rowNum, dim.rows, dim.columns, this.securityLevel)));
      for (const word of row) {
        rowCodes.push(getCodeword(table, word));
      }
      rowCodes.push(getCodeword(table, rightCodeWord(rowNum, dim.rows, dim.columns, this.securityLevel)));
      rowCodes.push(stopWord);
      codes.push(rowCodes);
      rowNum++;
    }
    const width = (dim.columns + 4) * 17 + 1;
    return new Barcode2DMatrix(width, dim.rows, this.moduleHeight, renderBarcode(codes));
  }
  encodeData(dataWords, columns, securityLevel) {
    const dataCount = dataWords.length;
    const ecCount = errorCorrectionWordCount(securityLevel);
    const words = [ ...dataWords, ...padding(dataCount, ecCount, columns) ];
    words.unshift(words.length + 1);
    return [ ...words, ...computeErrorCorrection(securityLevel, words) ];
  }
  calcDimensions(dataWords, eccWords) {
    let ratio = 0;
    let cols = 0;
    let rows = 0;
    for (let c = MIN_COLS; c <= MAX_COLS; c++) {
      const r = numberOfRows(dataWords, eccWords, c);
      if (r < MIN_ROWS) {
        break;
      }
      if (r > MAX_ROWS) {
        continue;
      }
      if (r !== 0) {
        const newRatio = (17 * c + 69) / (r * this.moduleHeight);
        if (Math.abs(newRatio - this.preferredRatio) < Math.abs(ratio - this.preferredRatio)) {
          ratio = newRatio;
          cols = c;
          rows = r;
          continue;
        }
        break;
      }
    }
    if (rows === 0) {
      cols = MIN_COLS;
      rows = numberOfRows(dataWords, eccWords, cols);
      if (rows < MIN_ROWS) {
        rows = MIN_ROWS;
      }
    }
    return {
      columns: cols,
      rows
    };
  }
  encodeText(text, submode, result) {
    let idx = 0;
    const tmp = [];
    while (idx < text.length) {
      const ch = text[idx];
      switch (submode) {
       case SUB_UPPER:
        if (isAlphaUpper(ch)) {
          tmp.push(ch === 32 ? 26 : ch - 65);
        } else if (isAlphaLower(ch)) {
          submode = SUB_LOWER;
          tmp.push(27);
          continue;
        } else if (mixedMap.has(ch)) {
          submode = SUB_MIXED;
          tmp.push(28);
          continue;
        } else {
          tmp.push(29);
          tmp.push(punctMap.get(ch));
        }
        break;

       case SUB_LOWER:
        if (isAlphaLower(ch)) {
          tmp.push(ch === 32 ? 26 : ch - 97);
        } else if (isAlphaUpper(ch)) {
          tmp.push(27);
          tmp.push(ch - 65);
        } else if (mixedMap.has(ch)) {
          submode = SUB_MIXED;
          tmp.push(28);
          continue;
        } else {
          tmp.push(29);
          tmp.push(punctMap.get(ch));
        }
        break;

       case SUB_MIXED:
        if (mixedMap.has(ch)) {
          tmp.push(mixedMap.get(ch));
        } else if (isAlphaUpper(ch)) {
          submode = SUB_UPPER;
          tmp.push(28);
          continue;
        } else if (isAlphaLower(ch)) {
          submode = SUB_LOWER;
          tmp.push(27);
          continue;
        } else {
          if (idx + 1 < text.length && punctMap.has(text[idx + 1])) {
            submode = SUB_PUNCT;
            tmp.push(25);
            continue;
          }
          tmp.push(29);
          tmp.push(punctMap.get(ch));
        }
        break;

       default:
        if (punctMap.has(ch)) {
          tmp.push(punctMap.get(ch));
        } else {
          submode = SUB_UPPER;
          tmp.push(29);
          continue;
        }
      }
      idx++;
    }
    let h = 0;
    let i = 0;
    for (const val of tmp) {
      if (i % 2 !== 0) {
        h = h * 30 + val;
        result.push(h);
      } else {
        h = val;
      }
      i++;
    }
    if (tmp.length % 2 !== 0) {
      result.push(h * 30 + 29);
    }
    return submode;
  }
  consecutiveTextCount(msg) {
    let result = 0;
    let i = 0;
    for (const ch of msg) {
      const numericCount = consecutiveDigitCount(msg.slice(i));
      if (numericCount >= minNumericCount || numericCount === 0 && !isText(ch)) {
        break;
      }
      result++;
      i++;
    }
    return result;
  }
  consecutiveBinaryCount(msg) {
    let result = 0;
    for (let i = 0; i < msg.length; i++) {
      if (consecutiveDigitCount(msg.slice(i)) >= minNumericCount) {
        break;
      }
      if (this.consecutiveTextCount(msg.slice(i)) > 5) {
        break;
      }
      result++;
    }
    return result;
  }
  highlevelEncode(data) {
    const words = [];
    let encodingMode = ENC_TEXT;
    let textSubMode = SUB_UPPER;
    while (data.length > 0) {
      const numericCount = consecutiveDigitCount(data);
      if (numericCount >= minNumericCount || numericCount === data.length) {
        words.push(latchToNumeric);
        encodingMode = ENC_NUMERIC;
        textSubMode = SUB_UPPER;
        words.push(...encodeNumeric(data.slice(0, numericCount)));
        data = data.slice(numericCount);
      } else {
        const textCount = this.consecutiveTextCount(data);
        if (textCount >= 5 || textCount === data.length) {
          if (encodingMode !== ENC_TEXT) {
            words.push(latchToText);
            encodingMode = ENC_TEXT;
            textSubMode = SUB_UPPER;
          }
          const txtData = [];
          textSubMode = this.encodeText(data.slice(0, textCount), textSubMode, txtData);
          words.push(...txtData);
          data = data.slice(textCount);
        } else {
          let binaryCount = this.consecutiveBinaryCount(data);
          if (binaryCount === 0) {
            binaryCount = 1;
          }
          const bytes = data.slice(0, binaryCount);
          if (bytes.length !== 1 || encodingMode !== ENC_TEXT) {
            encodingMode = ENC_BINARY;
            textSubMode = SUB_UPPER;
          }
          words.push(...encodeBinary(bytes, encodingMode));
          data = data.slice(binaryCount);
        }
      }
    }
    return words;
  }
}

function errorCorrectionWordCount(level) {
  return 1 << level + 1;
}

function numberOfRows(m, k, c) {
  let r = Math.floor((m + 1 + k) / c) + 1;
  if (c * r >= m + 1 + k + c) {
    r--;
  }
  return r;
}

function leftCodeWord(rowNum, rows, columns, securityLevel) {
  const tableId = rowNum % 3;
  let x = 0;
  switch (tableId) {
   case 0:
    x = Math.floor((rows - 3) / 3);
    break;

   case 1:
    x = securityLevel * 3;
    x += (rows - 1) % 3;
    break;

   case 2:
    x = columns - 1;
    break;
  }
  return 30 * Math.floor(rowNum / 3) + x;
}

function rightCodeWord(rowNum, rows, columns, securityLevel) {
  const tableId = rowNum % 3;
  let x = 0;
  switch (tableId) {
   case 0:
    x = columns - 1;
    break;

   case 1:
    x = Math.floor((rows - 1) / 3);
    break;

   case 2:
    x = securityLevel * 3;
    x += (rows - 1) % 3;
    break;
  }
  return 30 * Math.floor(rowNum / 3) + x;
}

function padding(dataCount, ecCount, columns) {
  const totalCount = dataCount + ecCount + 1;
  const mod = totalCount % columns;
  if (mod > 0) {
    return new Array(columns - mod).fill(paddingCodeword);
  }
  return [];
}

function addBits(b, count) {
  const bits = [];
  for (let i = count - 1; i >= 0; i--) {
    bits.push((b >> i & 1) === 1);
  }
  return bits;
}

function renderBarcode(codes) {
  const pixels = [];
  for (const row of codes) {
    const lastIdx = row.length - 1;
    let i = 0;
    for (const col of row) {
      pixels.push(...addBits(col, i === lastIdx ? 18 : 17));
      i++;
    }
  }
  return pixels;
}

function computeErrorCorrection(level, data) {
  const factors = correctionFactors[level];
  const count = errorCorrectionWordCount(level);
  const ecWords = new Array(count).fill(0);
  for (const value of data) {
    const temp = (value + ecWords[0]) % 929;
    for (let i = count - 1; i >= 0; i--) {
      let add = 0;
      if (i > 0) {
        add = ecWords[count - i];
      }
      ecWords[count - 1 - i] = (add + 929 - temp * factors[i] % 929) % 929;
    }
  }
  for (let key = 0; key < ecWords.length; key++) {
    const word = ecWords[key];
    if (word > 0) {
      ecWords[key] = 929 - word;
    }
  }
  return ecWords;
}

function getCodeword(tableId, word) {
  return codewords[tableId][word];
}

function consecutiveDigitCount(data) {
  let cnt = 0;
  for (const r of data) {
    if (r < 48 || r > 57) {
      break;
    }
    cnt++;
  }
  return cnt;
}

function encodeNumeric(digits) {
  const result = [];
  const digitCount = digits.length;
  let chunkCount = Math.floor(digitCount / 44);
  if (digitCount % 44 !== 0) {
    chunkCount++;
  }
  for (let i = 0; i < chunkCount; i++) {
    const start = i * 44;
    const end = Math.min(start + 44, digitCount);
    const chunk = digits.slice(start, end);
    let chunkNum = BigInt(`1${String.fromCharCode(...chunk)}`);
    const cws = [];
    while (chunkNum > 0n) {
      const cw = chunkNum % 900n;
      chunkNum = chunkNum / 900n;
      cws.unshift(Number(cw));
    }
    result.push(...cws);
  }
  return result;
}

function isText(ch) {
  return ch === 9 || ch === 10 || ch === 13 || ch >= 32 && ch <= 126;
}

function isAlphaUpper(ch) {
  return ch === 32 || ch >= 65 && ch <= 90;
}

function isAlphaLower(ch) {
  return ch === 32 || ch >= 97 && ch <= 122;
}

function encodeBinary(data, startmode) {
  const result = [];
  const count = data.length;
  if (count === 1 && startmode === ENC_TEXT) {
    result.push(shiftToByte);
  } else if (count % 6 === 0) {
    result.push(latchToByte);
  } else {
    result.push(latchToBytePadded);
  }
  let idx = 0;
  if (count >= 6) {
    const words = new Array(5).fill(0);
    while (count - idx >= 6) {
      let t = 0;
      for (let i = 0; i < 6; i++) {
        t = t * 256;
        t += data[idx + i];
      }
      for (let i = 0; i < 5; i++) {
        words[4 - i] = t % 900;
        t = Math.floor(t / 900);
      }
      result.push(...words);
      idx += 6;
    }
  }
  for (let i = idx; i < count; i++) {
    result.push(data[i] & 255);
  }
  return result;
}

const BarcodeHMBar = {
  tracker: 0,
  ascender: 1,
  descender: 2,
  full: 3
};

class BarcodeHM extends Barcode1D {
  constructor(tracker = .3) {
    super();
    this.trackerRatio = tracker;
  }
  makeBytes(data, options) {
    const params = drawParams(options);
    const result = [];
    const text = utf8Decode(data);
    const bars = this.convertHM(text);
    if (bars.length === 0) {
      return result;
    }
    const top = this.marginTop(params);
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    const lineWidth = (params.width - left - right) / (bars.length * 2 - 1);
    const barHeight = params.height - (params.drawText ? params.fontHeight + params.textPadding : 0) - top;
    const tracker = barHeight * this.trackerRatio;
    let index = 0;
    for (const bar of bars) {
      switch (bar) {
       case BarcodeHMBar.tracker:
        result.push(new BarcodeBar(left + index * 2 * lineWidth, top + barHeight / 2 - tracker / 2, lineWidth, tracker, true));
        break;

       case BarcodeHMBar.ascender:
        result.push(new BarcodeBar(left + index * 2 * lineWidth, top, lineWidth, barHeight / 2 + tracker / 2, true));
        break;

       case BarcodeHMBar.descender:
        result.push(new BarcodeBar(left + index * 2 * lineWidth, top + barHeight / 2 - tracker / 2, lineWidth, barHeight / 2 + tracker / 2, true));
        break;

       case BarcodeHMBar.full:
        result.push(new BarcodeBar(left + index * 2 * lineWidth, top, lineWidth, barHeight, true));
        break;
      }
      index++;
    }
    if (params.drawText) {
      result.push(...this.makeText(text, params, lineWidth));
    }
    return result;
  }
  toHex(data) {
    let result = "";
    let b = 0;
    let n = false;
    for (const bit of this.convertHM(data)) {
      b = (b << 2) + bit;
      if (n) {
        result += b.toString(16);
        b = 0;
      }
      n = !n;
    }
    return result;
  }
  fromBits(bits) {
    return bits & 3;
  }
  addHW(code, len) {
    const bars = [];
    for (let index = 0; index < len; index++) {
      bars.push(this.fromBits(code >> index * 2 & 3));
    }
    return bars;
  }
  convert(_data) {
    throw new Error("A height-modulated barcode has no two-state bars");
  }
}

class BarcodePostnet extends BarcodeHM {
  constructor() {
    super(0);
  }
  get charSet() {
    return [ 45, ...BarcodeMaps.postnet.keys() ];
  }
  get name() {
    return "POSTNET";
  }
  convertHM(data) {
    const bars = [];
    bars.push(this.fromBits(BarcodeMaps.postnetStartStop));
    let sum = 0;
    for (const codeUnit of codeUnits(data)) {
      if (codeUnit === 45) {
        continue;
      }
      const code = BarcodeMaps.postnet.get(codeUnit);
      if (code === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(codeUnit)}" to ${this.name}`);
      }
      bars.push(...this.addHW(code, BarcodeMaps.postnetLen));
      sum += codeUnit - 48;
    }
    const crc = (10 - sum % 10) % 10;
    bars.push(...this.addHW(BarcodeMaps.postnet.get(crc + 48), BarcodeMaps.postnetLen));
    bars.push(this.fromBits(BarcodeMaps.postnetStartStop));
    return bars;
  }
}

const BarcodeQRCorrectionLevel = {
  low: "low",
  medium: "medium",
  quartile: "quartile",
  high: "high"
};

const CORRECTION = {
  low: {
    formatBits: 1,
    row: 0
  },
  medium: {
    formatBits: 0,
    row: 1
  },
  quartile: {
    formatBits: 3,
    row: 2
  },
  high: {
    formatBits: 2,
    row: 3
  }
};

const ERROR_WORDS_PER_BLOCK = [ [ -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ], [ -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28 ], [ -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ], [ -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 ] ];

const BLOCK_COUNT = [ [ -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25 ], [ -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49 ], [ -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68 ], [ -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81 ] ];

class BitWriter {
  constructor() {
    this.bytes = [];
    this.length = 0;
  }
  append(value, count) {
    if (count < 0 || count > 31 || value >>> count !== 0) {
      throw new RangeError("Invalid QR bit field");
    }
    for (let shift = count - 1; shift >= 0; shift--) {
      this.appendBit((value >>> shift & 1) !== 0);
    }
  }
  appendBit(value) {
    const byteIndex = this.length >>> 3;
    if (byteIndex === this.bytes.length) this.bytes.push(0);
    if (value) this.bytes[byteIndex] = this.bytes[byteIndex] | 128 >>> (this.length & 7);
    this.length++;
  }
}

class BarcodeQR extends Barcode2D {
  constructor(typeNumber, errorCorrectLevel) {
    super();
    if (typeNumber !== null && (!Number.isInteger(typeNumber) || typeNumber < 1 || typeNumber > 40)) {
      throw new RangeError("QR version must be an integer from 1 to 40");
    }
    if (CORRECTION[errorCorrectLevel] === undefined) {
      throw new RangeError(`Unknown QR correction level: ${errorCorrectLevel}`);
    }
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
  }
  get charSet() {
    return Array.from({
      length: 256
    }, (_unused, index) => index);
  }
  get name() {
    return "QR-Code";
  }
  get maxLength() {
    return 2953;
  }
  convert(data) {
    const parameters = CORRECTION[this.errorCorrectLevel];
    const version = this.typeNumber ?? smallestVersion(data.length, parameters.row);
    const capacity = dataWordCount(version, parameters.row);
    const countBits = version < 10 ? 8 : 16;
    if (data.length >= 1 << countBits || 4 + countBits + data.length * 8 > capacity * 8) {
      throw new BarcodeException(`Unable to fit ${data.length} bytes in QR version ${version} at ${this.errorCorrectLevel} correction`);
    }
    const dataWords = frameData(data, version, capacity);
    const allWords = addErrorCorrection(dataWords, version, parameters.row);
    const matrix = new QrMatrix(version, parameters.formatBits, allWords);
    return new Barcode2DMatrix(matrix.size, matrix.size, 1, matrix.pixels());
  }
}

function smallestVersion(byteLength, correctionRow) {
  for (let version = 1; version <= 40; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (byteLength < 1 << countBits && 4 + countBits + byteLength * 8 <= dataWordCount(version, correctionRow) * 8) {
      return version;
    }
  }
  throw new BarcodeException("Data is too long for a QR symbol");
}

function rawWordCount(version) {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

function dataWordCount(version, correctionRow) {
  const errorWords = ERROR_WORDS_PER_BLOCK[correctionRow][version];
  const blocks = BLOCK_COUNT[correctionRow][version];
  return rawWordCount(version) - errorWords * blocks;
}

function frameData(data, version, capacity) {
  const bits = new BitWriter;
  bits.append(4, 4);
  bits.append(data.length, version < 10 ? 8 : 16);
  for (const byte of data) bits.append(byte, 8);
  const capacityBits = capacity * 8;
  for (let count = Math.min(4, capacityBits - bits.length); count > 0; count--) {
    bits.appendBit(false);
  }
  while ((bits.length & 7) !== 0) bits.appendBit(false);
  let toggle = false;
  while (bits.bytes.length < capacity) {
    bits.bytes.push(toggle ? 17 : 236);
    toggle = !toggle;
  }
  return Uint8Array.from(bits.bytes);
}

function addErrorCorrection(data, version, correctionRow) {
  const blocks = BLOCK_COUNT[correctionRow][version];
  const errorLength = ERROR_WORDS_PER_BLOCK[correctionRow][version];
  const rawLength = rawWordCount(version);
  const shortBlockLength = Math.floor(rawLength / blocks);
  const shortBlockCount = blocks - rawLength % blocks;
  const divisor = reedSolomonDivisor(errorLength);
  const dataBlocks = [];
  const errorBlocks = [];
  let offset = 0;
  for (let block = 0; block < blocks; block++) {
    const dataLength = shortBlockLength - errorLength + (block < shortBlockCount ? 0 : 1);
    const part = data.slice(offset, offset + dataLength);
    offset += dataLength;
    dataBlocks.push(part);
    errorBlocks.push(reedSolomonRemainder(part, divisor));
  }
  const result = [];
  const longestData = shortBlockLength - errorLength + 1;
  for (let index = 0; index < longestData; index++) {
    for (const block of dataBlocks) {
      if (index < block.length) result.push(block[index]);
    }
  }
  for (let index = 0; index < errorLength; index++) {
    for (const block of errorBlocks) result.push(block[index]);
  }
  if (result.length !== rawLength || offset !== data.length) {
    throw new Error("Internal QR block length mismatch");
  }
  return Uint8Array.from(result);
}

function reedSolomonDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root) ^ (j + 1 < degree ? result[j + 1] : 0);
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let index = 0; index < result.length; index++) {
      result[index] = result[index] ^ gfMultiply(divisor[index], factor);
    }
  }
  return result;
}

function gfMultiply(left, right) {
  let x = left;
  let y = right;
  let result = 0;
  for (let bit = 0; bit < 8; bit++) {
    if ((y & 1) !== 0) result ^= x;
    const carry = (x & 128) !== 0;
    x = x << 1 & 255;
    if (carry) x ^= 29;
    y >>>= 1;
  }
  return result;
}

class QrMatrix {
  constructor(version, correctionFormatBits, words) {
    this.size = version * 4 + 17;
    this.correctionFormatBits = correctionFormatBits;
    this.modules = square(this.size, false);
    this.functionModules = square(this.size, false);
    this.drawFunctions(version);
    this.drawWords(words);
    let bestMask = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormat(mask);
      const penalty = this.penalty();
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
      }
      this.applyMask(mask);
    }
    this.applyMask(bestMask);
    this.drawFormat(bestMask);
  }
  pixels() {
    const result = [];
    for (const row of this.modules) result.push(...row);
    return result;
  }
  drawFunctions(version) {
    for (let index = 0; index < this.size; index++) {
      this.setFunction(6, index, index % 2 === 0);
      this.setFunction(index, 6, index % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);
    const positions = alignmentPositions(version, this.size);
    const last = positions.length - 1;
    for (let y = 0; y < positions.length; y++) {
      for (let x = 0; x < positions.length; x++) {
        if (x === 0 && y === 0 || x === 0 && y === last || x === last && y === 0) {
          continue;
        }
        this.drawAlignment(positions[x], positions[y]);
      }
    }
    this.drawFormat(0);
    if (version >= 7) this.drawVersion(version);
  }
  drawFinder(centerX, centerY) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  drawAlignment(centerX, centerY) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  drawFormat(mask) {
    const value = this.correctionFormatBits << 3 | mask;
    let remainder = value;
    for (let bit = 0; bit < 10; bit++) {
      remainder = remainder << 1 ^ (remainder >>> 9) * 1335;
    }
    const bits = (value << 10 | remainder) ^ 21522;
    const at = index => (bits >>> index & 1) !== 0;
    for (let index = 0; index <= 5; index++) this.setFunction(8, index, at(index));
    this.setFunction(8, 7, at(6));
    this.setFunction(8, 8, at(7));
    this.setFunction(7, 8, at(8));
    for (let index = 9; index < 15; index++) this.setFunction(14 - index, 8, at(index));
    for (let index = 0; index < 8; index++) this.setFunction(this.size - 1 - index, 8, at(index));
    for (let index = 8; index < 15; index++) this.setFunction(8, this.size - 15 + index, at(index));
    this.setFunction(8, this.size - 8, true);
  }
  drawVersion(version) {
    let remainder = version;
    for (let bit = 0; bit < 12; bit++) {
      remainder = remainder << 1 ^ (remainder >>> 11) * 7973;
    }
    const bits = version << 12 | remainder;
    for (let index = 0; index < 18; index++) {
      const value = (bits >>> index & 1) !== 0;
      const a = this.size - 11 + index % 3;
      const b = Math.floor(index / 3);
      this.setFunction(a, b, value);
      this.setFunction(b, a, value);
    }
  }
  drawWords(words) {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vertical = 0; vertical < this.size; vertical++) {
        const upward = (right + 1 & 2) === 0;
        const y = upward ? this.size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (this.functionModules[y][x]) continue;
          const dark = bitIndex < words.length * 8 && (words[bitIndex >>> 3] >>> 7 - (bitIndex & 7) & 1) !== 0;
          this.modules[y][x] = dark;
          bitIndex++;
        }
      }
    }
    if (bitIndex < words.length * 8) throw new Error("QR matrix did not consume every data bit");
  }
  applyMask(mask) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.functionModules[y][x] && maskBit(mask, x, y)) {
          this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }
  penalty() {
    let result = 0;
    for (let y = 0; y < this.size; y++) result += runPenalty(this.modules[y]);
    for (let x = 0; x < this.size; x++) {
      const column = [];
      for (let y = 0; y < this.size; y++) column.push(this.modules[y][x]);
      result += runPenalty(column);
    }
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const value = this.modules[y][x];
        if (this.modules[y][x + 1] === value && this.modules[y + 1][x] === value && this.modules[y + 1][x + 1] === value) result += 3;
      }
    }
    let dark = 0;
    for (const row of this.modules) for (const value of row) if (value) dark++;
    const total = this.size * this.size;
    result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return result;
  }
  setFunction(x, y, value) {
    this.modules[y][x] = value;
    this.functionModules[y][x] = true;
  }
}

function square(size, value) {
  return Array.from({
    length: size
  }, () => new Array(size).fill(value));
}

function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const result = [ 6 ];
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }
  return result;
}

function maskBit(mask, x, y) {
  switch (mask) {
   case 0:
    return (x + y) % 2 === 0;

   case 1:
    return y % 2 === 0;

   case 2:
    return x % 3 === 0;

   case 3:
    return (x + y) % 3 === 0;

   case 4:
    return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;

   case 5:
    return x * y % 2 + x * y % 3 === 0;

   case 6:
    return (x * y % 2 + x * y % 3) % 2 === 0;

   case 7:
    return ((x + y) % 2 + x * y % 3) % 2 === 0;

   default:
    throw new RangeError(`Unknown QR mask: ${mask}`);
  }
}

function runPenalty(line) {
  let result = 0;
  let runLength = 1;
  for (let index = 1; index <= line.length; index++) {
    if (index < line.length && line[index] === line[index - 1]) {
      runLength++;
    } else {
      if (runLength >= 5) result += 3 + runLength - 5;
      runLength = 1;
    }
  }
  for (let index = 0; index + 10 < line.length; index++) {
    let bits = 0;
    for (let offset = 0; offset < 11; offset++) {
      bits = bits << 1 | (line[index + offset] ? 1 : 0);
    }
    if (bits === 93 || bits === 1488) result += 40;
  }
  return result;
}

class BarcodeRm4scc extends BarcodeHM {
  get charSet() {
    return BarcodeMaps.rm4scc.keys();
  }
  get name() {
    return "RM4SCC";
  }
  convertHM(data) {
    const bars = [];
    bars.push(this.fromBits(BarcodeMaps.rm4sccStart));
    let sumTop = 0;
    let sumBottom = 0;
    const keys = [ ...BarcodeMaps.rm4scc.keys() ];
    for (const codeUnit of codeUnits(data)) {
      const code = BarcodeMaps.rm4scc.get(codeUnit);
      if (code === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(codeUnit)}" to ${this.name}`);
      }
      bars.push(...this.addHW(code, BarcodeMaps.rm4sccLen));
      const index = keys.indexOf(codeUnit);
      sumTop += (Math.floor(index / 6) + 1) % 6;
      sumBottom += (index + 1) % 6;
    }
    const crc = modulo(sumTop - 1, 6) * 6 + modulo(sumBottom - 1, 6);
    bars.push(...this.addHW(BarcodeMaps.rm4scc.get(keys[crc]), BarcodeMaps.rm4sccLen));
    bars.push(this.fromBits(BarcodeMaps.rm4sccStop));
    return bars;
  }
}

function modulo(value, divisor) {
  return (value % divisor + divisor) % divisor;
}

class BarcodeTelepen extends Barcode1D {
  get charSet() {
    return Array.from({
      length: 128
    }, (_unused, index) => index);
  }
  get name() {
    return "Telepen";
  }
  convert(data) {
    const bits = [];
    bits.push(...this.add(BarcodeMaps.telepenStart, BarcodeMaps.telepenLen));
    let checksum = 0;
    for (const code of codeUnits(data)) {
      if (code >= BarcodeMaps.telepen.length) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      bits.push(...this.add(BarcodeMaps.telepen[code], BarcodeMaps.telepenLen));
      checksum += code;
    }
    checksum = 127 - checksum % 127;
    if (checksum === 127) {
      checksum = 0;
    }
    bits.push(...this.add(BarcodeMaps.telepen[checksum], BarcodeMaps.telepenLen));
    bits.push(...this.add(BarcodeMaps.telepenEnd, BarcodeMaps.telepenLen));
    return bits;
  }
}

class BarcodeUpcA extends BarcodeEan {
  get name() {
    return "UPC A";
  }
  get minLength() {
    return 11;
  }
  get maxLength() {
    return 12;
  }
  verifyBytes(data) {
    this.checkLength(utf8Decode(data), this.maxLength);
    super.verifyBytes(data);
  }
  convert(data) {
    const bits = [];
    const text = this.checkLength(data, this.maxLength);
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    let index = 0;
    for (const code of codeUnits(text)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      if (index === 6) {
        bits.push(...this.add(BarcodeMaps.eanCenter, 5));
      }
      bits.push(...this.add(codes[index < 6 ? 0 : 2], 7));
      index++;
    }
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    return bits;
  }
  marginLeft(params) {
    return params.drawText ? params.fontHeight : 0;
  }
  marginRight(params) {
    return params.drawText ? params.fontHeight : 0;
  }
  getHeight(index, count, params) {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }
    const h = params.height - params.fontHeight - params.textPadding;
    if (index + count < 11 || index > 45 && index < 49 || index > 82) {
      return h + params.fontHeight / 2 + params.textPadding;
    }
    return h;
  }
  makeText(data, params, lineWidth) {
    const result = [];
    const text = this.checkLength(data, this.maxLength);
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    result.push(new BarcodeText(0, params.height - params.fontHeight, left - lineWidth, params.fontHeight, text[0], "right"));
    let offset = left + lineWidth * 10;
    for (let i = 1; i < text.length - 1; i++) {
      result.push(new BarcodeText(offset, params.height - params.fontHeight, w, params.fontHeight, text[i], "center"));
      offset += w;
      if (i === 5) {
        offset += lineWidth * 5;
      }
    }
    result.push(new BarcodeText(params.width - right + lineWidth, params.height - params.fontHeight, right - lineWidth, params.fontHeight, text[text.length - 1], "left"));
    return result;
  }
}

class BarcodeUpcE extends BarcodeEan {
  constructor(fallback) {
    super();
    this.fallback = fallback;
  }
  get name() {
    return "UPC E";
  }
  get minLength() {
    return 6;
  }
  get maxLength() {
    return 12;
  }
  verifyBytes(data) {
    let text = utf8Decode(data);
    if (text.length <= 8) {
      text = this.upceToUpca(text);
    }
    if (text.length < 11) {
      throw new BarcodeException(`Unable to encode "${text}", minimum length is 11 for ${this.name} Barcode`);
    }
    const upca = this.checkLength(text, this.maxLength);
    if (!this.fallback) {
      this.upcaToUpce(upca);
    }
    super.verifyBytes(Uint8Array.from(codeUnits(text)));
  }
  upcaToUpce(data) {
    if (!/^[01]\d{11}$/.test(data)) {
      throw new BarcodeException(`Unable to convert "${data}" to ${this.name} Barcode`);
    }
    const mc = data.substring(1, 6);
    const pc = data.substring(6, 11);
    if ([ "000", "100", "200" ].includes(mc.substring(mc.length - 3)) && Number(pc) <= 999) {
      return `${mc.substring(0, 2)}${pc.substring(pc.length - 3)}${mc[2]}`;
    } else if (mc.substring(mc.length - 2) === "00" && Number(pc) <= 99) {
      return `${mc.substring(0, 3)}${pc.substring(pc.length - 2)}3`;
    } else if (mc.substring(mc.length - 1) === "0" && Number(pc) <= 9) {
      return `${mc.substring(0, 4)}${pc.substring(pc.length - 1)}4`;
    } else if (mc.substring(mc.length - 1) !== "0" && [ 5, 6, 7, 8, 9 ].includes(Number(pc))) {
      return mc + pc.substring(pc.length - 1);
    }
    throw new BarcodeException(`Unable to convert "${data}" to ${this.name} Barcode`);
  }
  upceToUpca(data) {
    if (!/^\d{6,8}$/.test(data)) {
      throw new BarcodeException(`Unable to convert "${data}" to UPC A Barcode`);
    }
    let first = "0";
    let checksum = null;
    switch (data.length) {
     case 8:
      checksum = data[7];
      first = data[0];
      data = data.substring(1, 7);
      break;

     case 7:
      first = data[0];
      data = data.substring(1, 7);
      break;
    }
    if (first !== "0" && first !== "1") {
      throw new BarcodeException(`Unable to convert "${data}" to UPC A Barcode`);
    }
    const d1 = data[0];
    const d2 = data[1];
    const d3 = data[2];
    const d4 = data[3];
    const d5 = data[4];
    const d6 = data[5];
    let manufacturer;
    let product;
    switch (d6) {
     case "0":
     case "1":
     case "2":
      manufacturer = `${d1}${d2}${d6}00`;
      product = `00${d3}${d4}${d5}`;
      break;

     case "3":
      manufacturer = `${d1}${d2}${d3}00`;
      product = `000${d4}${d5}`;
      break;

     case "4":
      manufacturer = `${d1}${d2}${d3}${d4}0`;
      product = `0000${d5}`;
      break;

     default:
      manufacturer = `${d1}${d2}${d3}${d4}${d5}`;
      product = `0000${d6}`;
      break;
    }
    data = first + manufacturer + product;
    return data + (checksum ?? this.checkSumModulo10(data));
  }
  convert(data) {
    if (data.length <= 8) {
      data = this.upceToUpca(data);
    }
    data = this.checkLength(data, this.maxLength);
    const first = data.charCodeAt(0);
    const last = data.charCodeAt(11);
    let short;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return (new BarcodeUpcA).convert(data);
      }
      throw error;
    }
    const bits = [];
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));
    const parityRow = BarcodeMaps.upce.get(last);
    const parity = first === 48 ? parityRow : parityRow ^ 63;
    let index = 0;
    for (const code of codeUnits(short)) {
      const codes = BarcodeMaps.ean.get(code);
      if (codes === undefined) {
        throw new BarcodeException(`Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`);
      }
      bits.push(...this.add(codes[(parity >> index & 1) === 0 ? 1 : 0], 7));
      index++;
    }
    bits.push(...this.add(BarcodeMaps.eanEndUpcE, 6));
    return bits;
  }
  marginLeft(params) {
    return params.drawText ? params.fontHeight : 0;
  }
  marginRight(params) {
    return params.drawText ? params.fontHeight : 0;
  }
  getHeight(index, count, params) {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }
    const h = params.height - params.fontHeight - params.textPadding;
    if (index + count < 4 || index > 44) {
      return h + params.fontHeight / 2 + params.textPadding;
    }
    return h;
  }
  makeText(data, params, lineWidth) {
    if (data.length <= 8) {
      data = this.upceToUpca(data);
    }
    data = this.checkLength(data, this.maxLength);
    const first = data.substring(0, 1);
    const last = data.substring(11, 12);
    let short;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return (new BarcodeUpcA).makeText(data, params, lineWidth);
      }
      throw error;
    }
    const result = [];
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    result.push(new BarcodeText(0, params.height - params.fontHeight, left - lineWidth, params.fontHeight, first, "right"));
    let offset = left + lineWidth * 3;
    for (let i = 0; i < short.length; i++) {
      result.push(new BarcodeText(offset, params.height - params.fontHeight, w, params.fontHeight, short[i], "center"));
      offset += w;
    }
    result.push(new BarcodeText(params.width - right + lineWidth, params.height - params.fontHeight, right - lineWidth, params.fontHeight, last, "left"));
    return result;
  }
  normalize(data) {
    if (data.length <= 8) {
      data = this.upceToUpca(data.padEnd(6, "0"));
    }
    data = this.checkLength(data, this.maxLength);
    const first = data.substring(0, 1);
    const last = data.substring(11, 12);
    let short;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return data;
      }
      throw error;
    }
    return `${first}${short}${last}`;
  }
}

class BarcodeFactory {
  constructor() {}
  static fromType(type) {
    switch (type) {
     case "Code39":
      return this.code39();

     case "Code93":
      return this.code93();

     case "Code128":
      return this.code128();

     case "GS128":
      return this.gs128();

     case "Itf":
      return this.itf();

     case "CodeITF14":
      return this.itf14();

     case "CodeITF16":
      return this.itf16();

     case "CodeEAN13":
      return this.ean13();

     case "CodeEAN8":
      return this.ean8();

     case "CodeEAN5":
      return this.ean5();

     case "CodeEAN2":
      return this.ean2();

     case "CodeISBN":
      return this.isbn();

     case "CodeUPCA":
      return this.upcA();

     case "CodeUPCE":
      return this.upcE();

     case "Telepen":
      return this.telepen();

     case "Codabar":
      return this.codabar();

     case "Rm4scc":
      return this.rm4scc();

     case "Postnet":
      return this.postnet();

     case "QrCode":
      return this.qrCode();

     case "PDF417":
      return this.pdf417();

     default:
      throw new RangeError(`Barcode ${type} is not supported`);
    }
  }
  static code39({drawSpacers = true} = {}) {
    return new BarcodeCode39(drawSpacers);
  }
  static code93() {
    return new BarcodeCode93;
  }
  static code128({useCode128A = true, useCode128B = true, useCode128C = true, escapes = false} = {}) {
    return new BarcodeCode128({
      useCode128A,
      useCode128B,
      useCode128C,
      escapes,
      isGS1: false,
      addSpaceAfterParenthesis: false,
      keepParenthesis: false
    });
  }
  static gs128({useCode128A = true, useCode128B = true, useCode128C = true, escapes = false, addSpaceAfterParenthesis = true, keepParenthesis = false} = {}) {
    return new BarcodeCode128({
      useCode128A,
      useCode128B,
      useCode128C,
      escapes,
      isGS1: true,
      addSpaceAfterParenthesis,
      keepParenthesis
    });
  }
  static itf({addChecksum = false, zeroPrepend = false, drawBorder = false, borderWidth = null, quietWidth = null, fixedLength = null} = {}) {
    return new BarcodeItf(addChecksum, zeroPrepend, drawBorder, borderWidth, quietWidth, fixedLength);
  }
  static itf14({drawBorder = true, borderWidth = null, quietWidth = null} = {}) {
    return new BarcodeItf14(drawBorder, borderWidth, quietWidth);
  }
  static itf16({drawBorder = true, borderWidth = null, quietWidth = null} = {}) {
    return new BarcodeItf16(drawBorder, borderWidth, quietWidth);
  }
  static ean13({drawEndChar = false} = {}) {
    return new BarcodeEan13(drawEndChar);
  }
  static ean8({drawSpacers = false} = {}) {
    return new BarcodeEan8(drawSpacers);
  }
  static ean5() {
    return new BarcodeEan5;
  }
  static ean2() {
    return new BarcodeEan2;
  }
  static isbn({drawEndChar = false, drawIsbn = true} = {}) {
    return new BarcodeIsbn(drawEndChar, drawIsbn);
  }
  static upcA() {
    return new BarcodeUpcA;
  }
  static upcE({fallback = false} = {}) {
    return new BarcodeUpcE(fallback);
  }
  static telepen() {
    return new BarcodeTelepen;
  }
  static qrCode({typeNumber = null, errorCorrectLevel = BarcodeQRCorrectionLevel.low} = {}) {
    return new BarcodeQR(typeNumber, errorCorrectLevel);
  }
  static pdf417({securityLevel = Pdf417SecurityLevel.level2, moduleHeight = 2, preferredRatio = 3} = {}) {
    return new BarcodePDF417(securityLevel, moduleHeight, preferredRatio);
  }
  static codabar({start = BarcodeCodabarStartStop.A, stop = BarcodeCodabarStartStop.B, printStartStop = false, explicitStartStop = false} = {}) {
    return new BarcodeCodabar(start, stop, printStartStop, explicitStartStop);
  }
  static rm4scc() {
    return new BarcodeRm4scc;
  }
  static postnet() {
    return new BarcodePostnet;
  }
}

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

function linearizeColorComponent(component) {
  if (component <= .03928) return component / 12.92;
  return Math.pow((component + .055) / 1.055, 2.4);
}

function colorLuminance(color) {
  const [r, g, b] = normalizeColor(color);
  return .2126 * linearizeColorComponent(r) + .7152 * linearizeColorComponent(g) + .0722 * linearizeColorComponent(b);
}

function isLightColor(color) {
  const relative = colorLuminance(color) + .05;
  return !(relative * relative > .15);
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

function isSideOptions(value) {
  const options = value;
  return options.top === undefined && options.right === undefined && options.bottom === undefined && options.left === undefined && (options.color !== undefined || options.width !== undefined || options.style !== undefined);
}

function normalizeBoxBorder(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof BoxBorder) return value;
  return isSideOptions(value) ? Border.all(value) : new Border(value);
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
    const fill = this.alignment !== null || this.child === null;
    const desired = outer.tighten({
      width: this.width ?? (fill && outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height ?? (fill && outer.hasBoundedHeight ? outer.maxHeight : null)
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

class BarcodePainter extends Widget {
  constructor(data, barcode, color, drawText, textStyle, textPadding) {
    super();
    this.data = data;
    this.barcode = barcode;
    this.color = normalizeColor(color);
    this.drawText = drawText;
    this.textStyle = textStyle;
    this.textPadding = textPadding;
  }
  layout(context, constraints) {
    const size = BoxConstraints.from(constraints).biggest;
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
      throw new Error("BarcodeWidget needs bounded width and height");
    }
    const fontSize = this.textStyle.fontSize ?? 12;
    const options = {
      width: size.width,
      height: size.height,
      drawText: this.drawText,
      fontHeight: fontSize,
      textPadding: this.textPadding
    };
    const elements = this.data instanceof Uint8Array ? this.barcode.makeBytes(this.data, options) : this.barcode.make(this.data, options);
    const font = this.drawText ? this.textStyle.font?.getFont(context) ?? null : null;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        elements,
        font
      }
    };
  }
  paint(context, box) {
    for (const element of box.data.elements) {
      if (element instanceof BarcodeBar && element.black) {
        context.canvas.fillRect(box.x + element.left, box.y + element.top, element.width, element.height, this.color);
      }
    }
    if (!this.drawText || box.data.font === null) return;
    const fontSize = this.textStyle.fontSize ?? 12;
    const textColor = this.textStyle.color ?? this.color;
    for (const element of box.data.elements) {
      if (!(element instanceof BarcodeText)) continue;
      const metrics = box.data.font.stringMetrics(element.text, fontSize);
      let x = box.x + element.left;
      if (element.align === "center") x += (element.width - metrics.advanceWidth) / 2;
      if (element.align === "right") x += element.width - metrics.advanceWidth;
      const baseline = box.y + element.top + element.height + metrics.descent;
      context.canvas.text(element.text, x, baseline, {
        font: box.data.font,
        fontSize,
        color: textColor
      });
    }
  }
}

class BarcodeWidget extends StatelessWidget {
  constructor({data, barcode, color = "#000000", backgroundColor = null, decoration = null, margin = null, padding = null, width = null, height = null, drawText = true, textStyle = null, textPadding = 0}) {
    super();
    if (width !== null && (!Number.isFinite(width) || width < 0)) {
      throw new RangeError("BarcodeWidget width must be non-negative");
    }
    if (height !== null && (!Number.isFinite(height) || height < 0)) {
      throw new RangeError("BarcodeWidget height must be non-negative");
    }
    if (!Number.isFinite(textPadding) || textPadding < 0) {
      throw new RangeError("BarcodeWidget textPadding must be non-negative");
    }
    this.dataString = typeof data === "string" ? data : null;
    this.dataBytes = data instanceof Uint8Array ? data : null;
    this.barcode = barcode;
    this.color = color;
    this.backgroundColor = backgroundColor;
    this.decoration = decoration;
    this.margin = margin;
    this.padding = padding;
    this.width = width;
    this.height = height;
    this.drawText = drawText;
    this.textStyle = textStyle;
    this.textPadding = textPadding;
  }
  get data() {
    return this.dataBytes ?? utf8Encode(this.dataString ?? "");
  }
  build(context) {
    const defaultStyle = context.theme.defaultTextStyle.copyWith({
      font: Font.courier(),
      fontNormal: Font.courier(),
      fontBold: Font.courierBold(),
      fontItalic: Font.courierOblique(),
      fontBoldItalic: Font.courierBoldOblique(),
      lineSpacing: 1,
      fontSize: this.height === null ? null : this.height * .2
    });
    const style = defaultStyle.merge(this.textStyle);
    let child = new BarcodePainter(this.dataBytes ?? this.dataString ?? "", this.barcode, this.color, this.drawText, style, this.textPadding);
    if (this.padding !== null) child = new Padding({
      padding: this.padding,
      child
    });
    if (this.decoration !== null) {
      child = new DecoratedBox({
        decoration: this.decoration,
        child
      });
    } else if (this.backgroundColor !== null) {
      child = new DecoratedBox({
        decoration: {
          color: this.backgroundColor
        },
        child
      });
    }
    if (this.width !== null || this.height !== null) {
      child = new SizedBox({
        width: this.width,
        height: this.height,
        child
      });
    }
    if (this.margin !== null) child = new Padding({
      padding: this.margin,
      child
    });
    return child;
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

class AnnotationBuilder {}

class AnnotationLink extends AnnotationBuilder {
  constructor(destination) {
    super();
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError("Annotation destination cannot be empty");
  }
  build(context, rect) {
    context.canvas.addNamedLink(this.destination, rect.x, rect.y, rect.width, rect.height);
  }
}

class AnnotationUrl extends AnnotationBuilder {
  constructor(destination) {
    super();
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError("Annotation URL cannot be empty");
  }
  build(context, rect) {
    context.canvas.addUrlLink(this.destination, rect.x, rect.y, rect.width, rect.height);
  }
}

class Annotation extends Widget {
  constructor({child = null, builder = null} = {}) {
    super();
    this.child = child;
    this.builder = builder;
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
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    if (box.width > 0 && box.height > 0) {
      this.builder?.build(context, box);
    }
  }
}

class Link extends Annotation {
  constructor({child, destination}) {
    super({
      child,
      builder: new AnnotationLink(destination)
    });
  }
}

class UrlLink extends Annotation {
  constructor({child, destination}) {
    super({
      child,
      builder: new AnnotationUrl(destination)
    });
  }
}

class Anchor extends Widget {
  constructor({child = null, name, zoom = null, setX = false}) {
    super();
    this.child = child;
    this.name = String(name);
    this.zoom = zoom;
    this.setX = setX;
    if (this.name.length === 0) throw new RangeError("Anchor name cannot be empty");
    if (zoom !== null && !Number.isFinite(zoom)) throw new RangeError("Anchor zoom must be finite");
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
    const {childBox} = box.data;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
    const point = context.canvas.transformWidgetPoint(box.x, box.y);
    context.document.registerDestination({
      name: this.name,
      pageNumber: context.pageNumber,
      x: this.setX ? point.x : null,
      y: point.y,
      zoom: this.zoom
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
    if (extraPerGap === 0 && token.kind !== "widget" && previous !== undefined && previous.kind !== "widget" && previous.style === token.style && previous.annotation === token.annotation) {
      paintTokens[paintTokens.length - 1] = {
        kind: "text",
        text: previous.text + token.text,
        width: previous.width + token.width,
        style: token.style,
        annotation: token.annotation
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
      childBox: token.kind === "widget" ? token.childBox : null,
      annotation: token.annotation
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
    this.text.visitChildren((span, textStyle, annotation) => {
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
          childBox,
          annotation
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
            style,
            annotation
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
  allLines(context, contentWidth, minContentWidth = 0) {
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
    const targetWidth = limited.some(line => line.wrapped || align === "justify") ? contentWidth : Math.max(0, minContentWidth, ...limited.map(line => line.width));
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
    const minContentWidth = Math.max(0, parent.minWidth - this.margin.left - this.margin.right);
    const all = this.allLines(context, contentWidth, minContentWidth);
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
        if (run.annotation !== null && run.width > 0 && run.height > 0) {
          run.annotation.build(context, {
            x,
            y,
            width: run.width,
            height: run.height
          });
        }
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
    const rows = context.document.outlines.map(entry => new Link({
      destination: entry.anchor,
      child: new Padding({
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
      })
    }));
    return new Column({
      crossAxisAlignment: "start",
      mainAxisSize: "min",
      children: rows
    });
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

const CHART_BLACK = "#000000";

const CHART_WHITE = "#ffffff";

const CHART_BLUE = "#2196f3";

function drawWidget(context, widget, x, top, alignment = null, constraints = new BoxConstraints) {
  const box = widget.layout(context, constraints);
  const dx = alignment === null ? 0 : (1 + alignment.x) * box.width / 2;
  const dy = alignment === null ? 0 : (1 - alignment.y) * box.height / 2;
  widget.paint(context, {
    ...box,
    x: x - dx,
    y: top - dy
  });
}

class ChartFrame {
  constructor(originX, originPdfY, originTop) {
    this.originX = originX;
    this.originPdfY = originPdfY;
    this.originTop = originTop;
  }
  px(x) {
    return this.originX + x;
  }
  py(y) {
    return this.originPdfY + y;
  }
  top(y) {
    return this.originTop - y;
  }
}

function chartOf(context) {
  const scope = context.chart;
  if (scope === undefined || scope === null) {
    throw new Error("This widget must be placed inside a Chart");
  }
  return scope;
}

class Dataset {
  constructor({legend = null, color = null, borderColor = null, borderWidth = .5} = {}) {
    this.legend = legend === null || legend === undefined ? null : String(legend);
    this.color = color === null || color === undefined ? null : normalizeColor(color);
    this.borderColor = borderColor === null || borderColor === undefined ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
  }
  paintBackground(_context, _frame, _data) {}
  paint(_context, _frame, _data) {}
  paintForeground(_context, _frame, _data) {}
  legendShape(_context) {
    return new Container({
      decoration: new BoxDecoration({
        color: this.color,
        border: Border.all({
          color: this.borderColor ?? CHART_BLACK,
          width: this.borderWidth
        })
      })
    });
  }
}

class ChartGrid extends Widget {
  gridSize(constraints) {
    return BoxConstraints.from(constraints).biggest;
  }
}

class Chart extends Widget {
  static of(context) {
    return chartOf(context);
  }
  constructor({grid, datasets, overlay = null, title = null, bottom = null, left = null, right = null}) {
    super();
    this.grid = grid;
    this.datasets = [ ...datasets ];
    this.overlay = overlay;
    this.title = title;
    this.bottom = bottom;
    this.left = left;
    this.right = right;
  }
  computeSize(constraints) {
    const parent = BoxConstraints.from(constraints);
    if (parent.isTight) return parent.smallest;
    const aspectRatio = 1;
    let width = parent.maxWidth;
    let height = parent.maxHeight;
    if (!Number.isFinite(width)) width = height * aspectRatio;
    if (!Number.isFinite(height)) height = width * aspectRatio;
    return parent.constrain({
      width,
      height
    });
  }
  scope(context) {
    const scoped = {
      ...context,
      chart: {
        grid: this.grid,
        datasets: this.datasets
      }
    };
    return scoped;
  }
  build() {
    const stack = new Stack({
      overflow: "visible",
      children: this.overlay === null ? [ this.grid ] : [ this.grid, this.overlay ]
    });
    const row = [];
    if (this.left !== null) row.push(this.left);
    row.push(new Expanded({
      child: stack
    }));
    if (this.right !== null) row.push(this.right);
    const column = [];
    if (this.title !== null) column.push(this.title);
    column.push(new Expanded({
      child: new Row({
        children: row
      })
    }));
    if (this.bottom !== null) column.push(this.bottom);
    return new Column({
      children: column
    });
  }
  layout(context, constraints) {
    const size = this.computeSize(constraints);
    const childBox = this.build().layout(this.scope(context), BoxConstraints.tight(size));
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
    childBox.widget.paint(this.scope(context), {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class CartesianFrame extends ChartFrame {
  constructor(xAxis, yAxis, xLayout, yLayout, gridBox, originX = 0, originPdfY = 0, originTop = 0) {
    super(originX, originPdfY, originTop);
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.xLayout = xLayout;
    this.yLayout = yLayout;
    this.gridBox = gridBox;
  }
  get xAxisOffset() {
    return this.xLayout.axisPosition;
  }
  get yAxisOffset() {
    return this.yLayout.axisPosition;
  }
  toChart(point) {
    return {
      x: this.xAxis.toChart(point.x, this.xLayout),
      y: this.yAxis.toChart(point.y, this.yLayout)
    };
  }
  withOrigin(originX, originPdfY, originTop) {
    return new CartesianFrame(this.xAxis, this.yAxis, this.xLayout, this.yLayout, this.gridBox, originX, originPdfY, originTop);
  }
}

class CartesianGrid extends ChartGrid {
  constructor({xAxis, yAxis}) {
    super();
    this.xAxis = xAxis;
    this.yAxis = yAxis;
  }
  layout(context, constraints) {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);
    let x = {
      axisPosition: 0,
      crossAxisPosition: 0,
      marginEnd: this.xAxis.marginEnd
    };
    let y = {
      axisPosition: 0,
      crossAxisPosition: 0,
      marginEnd: this.yAxis.marginEnd
    };
    let xLayout = this.xAxis.layout(context, "horizontal", size, x);
    let yLayout = this.yAxis.layout(context, "vertical", size, y);
    let count = 5;
    while (count-- > 0) {
      x = {
        axisPosition: Math.max(x.axisPosition, y.crossAxisPosition),
        crossAxisPosition: y.axisPosition,
        marginEnd: x.marginEnd
      };
      xLayout = this.xAxis.layout(context, "horizontal", size, x);
      x = {
        axisPosition: xLayout.axisPosition,
        crossAxisPosition: xLayout.crossAxisPosition,
        marginEnd: xLayout.marginEnd
      };
      y = {
        axisPosition: Math.max(y.axisPosition, x.crossAxisPosition),
        crossAxisPosition: x.axisPosition,
        marginEnd: y.marginEnd
      };
      yLayout = this.yAxis.layout(context, "vertical", size, y);
      y = {
        axisPosition: yLayout.axisPosition,
        crossAxisPosition: yLayout.crossAxisPosition,
        marginEnd: yLayout.marginEnd
      };
      if (y.crossAxisPosition === x.axisPosition && x.crossAxisPosition === y.axisPosition) break;
    }
    const left = yLayout.axisPosition;
    const bottom = xLayout.axisPosition;
    const gridBox = {
      left,
      bottom,
      width: size.width - left,
      height: size.height - bottom
    };
    const frame = new CartesianFrame(this.xAxis, this.yAxis, xLayout, yLayout, gridBox);
    const datasetData = datasets.map(dataset => dataset.layout(context, frame));
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        frame,
        datasetData,
        width: size.width,
        height: size.height
      }
    };
  }
  paint(context, box) {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const bottom = box.y + box.height;
    const frame = box.data.frame.withOrigin(box.x, canvas.toPdfY(bottom), bottom);
    this.clip(context, frame);
    datasets.forEach((dataset, index) => dataset.paintBackground(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();
    this.xAxis.paintBackground(context, frame, frame.xLayout);
    this.yAxis.paintBackground(context, frame, frame.yLayout);
    this.clip(context, frame);
    datasets.forEach((dataset, index) => dataset.paint(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();
    this.xAxis.paint(context, frame, frame.xLayout);
    this.yAxis.paint(context, frame, frame.yLayout);
    datasets.forEach((dataset, index) => dataset.paintForeground(context, frame, box.data.datasetData[index]));
  }
  clip(context, frame) {
    const grid = frame.gridBox;
    context.canvas.saveContext();
    context.canvas.drawRect(frame.px(grid.left), frame.py(grid.bottom), grid.width, grid.height);
    context.canvas.clipPath();
  }
}

class PointChartValue {
  constructor(x, y) {
    this.x = assertFiniteNumber(Number(x), "x");
    this.y = assertFiniteNumber(Number(y), "y");
  }
  get point() {
    return {
      x: this.x,
      y: this.y
    };
  }
}

class PointDataSet extends Dataset {
  constructor({data, pointSize = 3, drawPoints = true, shape = null, buildValue = null, valuePosition = "auto", color = CHART_BLUE, borderColor = null, borderWidth = 1.5, legend = null}) {
    super({
      legend,
      color,
      borderColor,
      borderWidth
    });
    this.data = [ ...data ];
    this.pointSize = Number(pointSize);
    this.drawPoints = Boolean(drawPoints);
    this.shape = shape;
    this.buildValue = buildValue;
    this.valuePosition = valuePosition;
  }
  get delta() {
    return this.pointSize * .5;
  }
  layout(_context, _frame) {
    return null;
  }
  automaticValuePosition(point, size, _previous, _next, box) {
    if (point.x - size.width / 2 < box.left) return "right";
    if (point.x + size.width / 2 > box.left + box.width) return "left";
    if (point.y + size.height + this.delta > box.bottom + box.height) return "bottom";
    return "top";
  }
  paintForeground(context, frame, _data) {
    if (this.data.length === 0) return;
    const canvas = context.canvas;
    if (this.drawPoints) {
      if (this.shape === null) {
        for (const value of this.data) {
          const p = frame.toChart(value.point);
          canvas.drawEllipse(frame.px(p.x), frame.py(p.y), this.pointSize, this.pointSize);
        }
        canvas.setColor(this.color ?? CHART_BLUE);
        canvas.fillPath();
      } else {
        for (const value of this.data) {
          const p = frame.toChart(value.point);
          drawWidget(context, new SizedBox({
            width: this.pointSize * 2,
            height: this.pointSize * 2,
            child: this.shape(context)
          }), frame.px(p.x), frame.top(p.y), Alignment.center);
        }
      }
    }
    if (this.buildValue === null) return;
    const box = frame instanceof CartesianFrame ? frame.gridBox : {
      left: 0,
      bottom: 0,
      width: 0,
      height: 0
    };
    let previous = null;
    let index = 1;
    for (const value of this.data) {
      const p = frame.toChart(value.point);
      const measured = this.buildValue(context, value).layout(context, new BoxConstraints);
      const size = {
        width: measured.width,
        height: measured.height
      };
      let position = this.valuePosition;
      if (position === "auto") {
        const next = index < this.data.length ? frame.toChart(this.data[index++].point) : null;
        position = this.automaticValuePosition(p, size, previous, next, box);
      }
      let offset;
      switch (position) {
       case "left":
        offset = {
          x: p.x - size.width / 2 - this.pointSize - this.delta,
          y: p.y
        };
        break;

       case "top":
        offset = {
          x: p.x,
          y: p.y + size.height / 2 + this.pointSize + this.delta
        };
        break;

       case "right":
        offset = {
          x: p.x + size.width / 2 + this.pointSize + this.delta,
          y: p.y
        };
        break;

       case "bottom":
        offset = {
          x: p.x,
          y: p.y - size.height / 2 - this.pointSize - this.delta
        };
        break;

       default:
        offset = p;
        break;
      }
      drawWidget(context, this.buildValue(context, value), frame.px(offset.x), frame.top(offset.y), Alignment.center);
      previous = p;
    }
  }
  legendShape(context) {
    return this.shape === null ? super.legendShape(context) : this.shape(context);
  }
}

class BarDataSet extends PointDataSet {
  constructor({data, legend = null, borderColor = null, borderWidth = 1.5, color = CHART_BLUE, drawBorder = null, drawSurface = true, surfaceOpacity = 1, width = 10, offset = 0, axis = "horizontal", pointColor = null, pointSize = 3, drawPoints = false, shape = null, buildValue = null, valuePosition = "auto"}) {
    super({
      data,
      legend,
      color: pointColor ?? color,
      borderColor,
      borderWidth,
      pointSize,
      drawPoints,
      shape,
      buildValue,
      valuePosition
    });
    this.surfaceColor = normalizeColor(color);
    const border = normalizeColor(borderColor ?? CHART_BLACK);
    this.drawBorder = drawBorder ?? (borderColor !== null && borderColor !== undefined && (border[0] !== this.surfaceColor[0] || border[1] !== this.surfaceColor[1] || border[2] !== this.surfaceColor[2]));
    if (!this.drawBorder && !drawSurface) {
      throw new Error("BarDataSet must draw its surface or its border");
    }
    this.drawSurface = Boolean(drawSurface);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.barWidth = Number(width);
    this.offset = Number(offset);
    this.axis = axis;
  }
  legendShape(context) {
    if (this.shape !== null) return this.shape(context);
    return new Container({
      decoration: new BoxDecoration({
        color: this.surfaceColor,
        border: Border.all({
          color: this.borderColor ?? CHART_BLACK,
          width: this.borderWidth
        })
      })
    });
  }
  drawBar(context, frame, value) {
    const canvas = context.canvas;
    const cartesian = frame instanceof CartesianFrame ? frame : null;
    if (this.axis === "horizontal") {
      const base = cartesian === null ? 0 : cartesian.xAxisOffset;
      const p = frame.toChart(value.point);
      const x = p.x + this.offset - this.barWidth / 2;
      canvas.drawRect(frame.px(x), frame.py(base), this.barWidth, p.y - base);
      return;
    }
    const base = cartesian === null ? 0 : cartesian.yAxisOffset;
    const p = frame.toChart(value.point);
    const y = p.y + this.offset - this.barWidth / 2;
    canvas.drawRect(frame.px(base), frame.py(y), p.x - base, this.barWidth);
  }
  paint(context, frame, _data) {
    if (this.data.length === 0) return;
    const canvas = context.canvas;
    if (this.drawSurface) {
      for (const value of this.data) this.drawBar(context, frame, value);
      if (this.surfaceOpacity !== 1) {
        canvas.saveContext();
        canvas.setGraphicState(new PdfGraphicState({
          opacity: this.surfaceOpacity
        }));
      }
      canvas.setFillColor(this.surfaceColor);
      canvas.fillPath();
      if (this.surfaceOpacity !== 1) canvas.restoreContext();
    }
    if (this.drawBorder) {
      for (const value of this.data) this.drawBar(context, frame, value);
      canvas.setStrokeColor(this.borderColor ?? this.surfaceColor);
      canvas.setLineWidth(this.borderWidth);
      canvas.strokePath();
    }
  }
  automaticValuePosition(point, size, previous, next, box) {
    const position = super.automaticValuePosition(point, size, previous, next, box);
    if (position === "right" || position === "left") return "top";
    return position;
  }
}

const GREY = "#9e9e9e";

class GridAxis {
  constructor({format = null, buildLabel = null, textStyle = null, margin = null, marginStart = null, marginEnd = null, color = null, width = null, divisions = null, divisionsWidth = null, divisionsColor = null, divisionsDashed = null, ticks = null, axisTick = null, angle = 0} = {}) {
    this.format = format ?? (value => String(value));
    this.buildLabel = buildLabel;
    this.textStyle = textStyle;
    this.margin = margin === null ? null : Number(margin);
    this.marginStart = marginStart ?? 0;
    this.marginEnd = marginEnd ?? 0;
    this.color = normalizeColor(color ?? CHART_BLACK);
    this.width = width ?? 1;
    this.divisions = divisions ?? false;
    this.divisionsWidth = divisionsWidth ?? .5;
    this.divisionsColor = normalizeColor(divisionsColor ?? GREY);
    this.divisionsDashed = divisionsDashed ?? false;
    this.ticks = ticks ?? false;
    this.axisTick = axisTick;
    this.angle = assertFiniteNumber(Number(angle), "angle");
  }
  transfer(input) {
    return input;
  }
  label(value) {
    const text = this.buildLabel === null ? new Text(this.format(value), this.textStyle === null ? {} : {
      style: this.textStyle
    }) : this.buildLabel(value);
    if (this.angle === 0) return text;
    return new Transform({
      rotateBox: this.angle,
      child: text
    });
  }
  angleDirection() {
    if (this.angle === 0) return 0;
    if (this.angle % Math.PI > Math.PI / 2) return -1;
    return 1;
  }
}

class FixedAxis extends GridAxis {
  constructor(values, options = {}) {
    super(options);
    this.values = values.map((value, index) => assertFiniteNumber(Number(value), `values[${index}]`));
    if (!FixedAxis.isSortedAscending(this.values)) {
      throw new RangeError("FixedAxis values must be sorted ascending");
    }
  }
  static fromStrings(values, options = {}) {
    const labels = values.map(value => String(value));
    return new FixedAxis(labels.map((_, index) => index), {
      ...options,
      format: value => labels[Math.trunc(value)] ?? String(value)
    });
  }
  static isSortedAscending(values) {
    let previous = values[0] ?? 0;
    for (const value of values) {
      if (previous > value) return false;
      previous = value;
    }
    return true;
  }
  layout(context, direction, size, incoming) {
    let maxWidth = 0;
    let maxHeight = 0;
    let first = null;
    let last = null;
    for (const value of this.values) {
      const measured = this.label(value).layout(context, new BoxConstraints);
      last = {
        width: measured.width,
        height: measured.height
      };
      maxWidth = Math.max(maxWidth, last.width);
      maxHeight = Math.max(maxHeight, last.height);
      if (first === null) first = last;
    }
    const firstSize = first ?? {
      width: 0,
      height: 0
    };
    const lastSize = last ?? {
      width: 0
    };
    const ad = this.angleDirection();
    if (direction === "horizontal") {
      const textMargin = this.margin ?? 2;
      const minStart = ad === 0 ? firstSize.width / 2 : ad > 0 ? firstSize.width : 0;
      const marginEnd = Math.max(incoming.marginEnd, ad === 0 ? lastSize.width / 2 : ad > 0 ? 0 : lastSize.width);
      const crossAxisPosition = Math.max(incoming.crossAxisPosition, minStart);
      const axisPosition = Math.max(incoming.axisPosition, maxHeight + textMargin);
      return {
        direction,
        axisPosition,
        crossAxisPosition,
        marginEnd,
        textMargin,
        axisTick: this.axisTick ?? false,
        boxWidth: size.width,
        boxHeight: axisPosition
      };
    }
    const textMargin = this.margin ?? 10;
    const marginEnd = Math.max(incoming.marginEnd, ad === 0 ? lastSize.width / 2 : ad < 0 ? lastSize.width : 0);
    const minStart = ad === 0 ? firstSize.height / 2 : ad > 0 ? firstSize.width : 0;
    const crossAxisPosition = Math.max(incoming.crossAxisPosition, minStart);
    const axisPosition = Math.max(incoming.axisPosition, maxWidth + textMargin);
    return {
      direction,
      axisPosition,
      crossAxisPosition,
      marginEnd,
      textMargin,
      axisTick: this.axisTick ?? true,
      boxWidth: axisPosition,
      boxHeight: size.height
    };
  }
  toChart(input, layout) {
    const offset = this.transfer(this.values[0] ?? 0);
    const total = this.transfer(this.values[this.values.length - 1] ?? 0) - offset;
    const start = layout.crossAxisPosition + this.marginStart;
    const extent = layout.direction === "horizontal" ? layout.boxWidth : layout.boxHeight;
    if (total === 0) return start;
    return start + (extent - start - layout.marginEnd) * (this.transfer(input) - offset) / total;
  }
  paintBackground(context, frame, layout) {
    if (!this.divisions) return;
    const canvas = context.canvas;
    const grid = frame.gridBox;
    const values = this.values.slice(this.marginStart > 0 ? 0 : 1);
    if (layout.direction === "horizontal") {
      for (const value of values) {
        const p = this.toChart(value, layout);
        canvas.drawLine(frame.px(p), frame.py(grid.bottom + grid.height), frame.px(p), frame.py(grid.bottom));
      }
    } else {
      for (const value of values) {
        const p = this.toChart(value, layout);
        canvas.drawLine(frame.px(grid.left), frame.py(p), frame.px(grid.left + grid.width), frame.py(p));
      }
    }
    if (this.divisionsDashed) canvas.setLineDashPattern([ 4, 2 ]);
    canvas.setStrokeColor(this.divisionsColor);
    canvas.setLineWidth(this.divisionsWidth);
    canvas.setLineJoin("miter");
    canvas.strokePath();
    if (this.divisionsDashed) canvas.setLineDashPattern();
  }
  paint(context, frame, layout) {
    if (layout.direction === "horizontal") {
      this.drawXValues(context, frame, layout);
    } else {
      this.drawYValues(context, frame, layout);
    }
  }
  drawXValues(context, frame, layout) {
    const canvas = context.canvas;
    const axis = layout.axisPosition;
    canvas.moveTo(frame.px(layout.crossAxisPosition), frame.py(axis));
    canvas.lineTo(frame.px(layout.boxWidth), frame.py(axis));
    if (layout.axisTick && layout.textMargin > 0) {
      canvas.moveTo(frame.px(layout.crossAxisPosition), frame.py(axis));
      canvas.lineTo(frame.px(layout.crossAxisPosition), frame.py(axis - layout.textMargin));
    }
    if (this.ticks && layout.textMargin > 0) {
      for (const value of this.values) {
        const p = this.toChart(value, layout);
        canvas.moveTo(frame.px(p), frame.py(axis));
        canvas.lineTo(frame.px(p), frame.py(axis - layout.textMargin));
      }
    }
    canvas.setStrokeColor(this.color);
    canvas.setLineWidth(this.width);
    canvas.setLineJoin("bevel");
    canvas.strokePath();
    const ad = this.angleDirection();
    const alignment = ad === 0 ? Alignment.topCenter : ad > 0 ? Alignment.topRight : Alignment.topLeft;
    for (const value of this.values) {
      const p = this.toChart(value, layout);
      drawWidget(context, this.label(value), frame.px(p), frame.top(axis - layout.textMargin), alignment);
    }
  }
  drawYValues(context, frame, layout) {
    const canvas = context.canvas;
    const axis = layout.axisPosition;
    canvas.moveTo(frame.px(axis), frame.py(layout.boxHeight));
    canvas.lineTo(frame.px(axis), frame.py(layout.crossAxisPosition));
    if (layout.axisTick && layout.textMargin > 0) {
      canvas.moveTo(frame.px(axis), frame.py(layout.crossAxisPosition));
      canvas.lineTo(frame.px(axis - layout.textMargin / 2), frame.py(layout.crossAxisPosition));
    }
    if (this.ticks && layout.textMargin > 0) {
      for (const value of this.values) {
        const p = this.toChart(value, layout);
        canvas.moveTo(frame.px(axis), frame.py(p));
        canvas.lineTo(frame.px(axis - layout.textMargin / 2), frame.py(p));
      }
    }
    canvas.setStrokeColor(this.color);
    canvas.setLineWidth(this.width);
    canvas.setLineJoin("bevel");
    canvas.strokePath();
    const ad = this.angleDirection();
    const alignment = ad === 0 ? Alignment.centerRight : ad > 0 ? Alignment.topRight : Alignment.bottomRight;
    for (const value of this.values) {
      const p = this.toChart(value, layout);
      drawWidget(context, this.label(value), frame.px(axis - layout.textMargin), frame.top(p), alignment);
    }
  }
}

class RadialFrame extends ChartFrame {
  constructor(width, height, originX = 0, originPdfY = 0, originTop = 0) {
    super(originX, originPdfY, originTop);
    this.width = width;
    this.height = height;
  }
  toChart(point) {
    const z = 3;
    return {
      x: z * point.y * Math.cos(point.x / 7 * Math.PI * 2) + this.width / 2,
      y: z * point.y * Math.sin(point.x / 7 * Math.PI * 2) + this.height / 2
    };
  }
  withOrigin(originX, originPdfY, originTop) {
    return new RadialFrame(this.width, this.height, originX, originPdfY, originTop);
  }
}

class RadialGrid extends ChartGrid {
  layout(context, constraints) {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);
    const frame = new RadialFrame(size.width, size.height);
    const datasetData = datasets.map(dataset => dataset.layout(context, frame));
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        frame,
        datasetData
      }
    };
  }
  paint(context, box) {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const bottom = box.y + box.height;
    const frame = box.data.frame.withOrigin(box.x, canvas.toPdfY(bottom), bottom);
    this.clip(context, frame, box.width, box.height);
    datasets.forEach((dataset, index) => dataset.paintBackground(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();
    this.clip(context, frame, box.width, box.height);
    datasets.forEach((dataset, index) => dataset.paint(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();
    datasets.forEach((dataset, index) => dataset.paintForeground(context, frame, box.data.datasetData[index]));
  }
  clip(context, frame, width, height) {
    context.canvas.saveContext();
    context.canvas.drawRect(frame.px(0), frame.py(0), width, height);
    context.canvas.clipPath();
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

function resolveLegendPosition(value) {
  if (Array.isArray(value)) return {
    x: Number(value[0]),
    y: Number(value[1])
  };
  return resolveBasicAlignment(value);
}

class ChartLegend extends StatelessWidget {
  constructor({textStyle = null, position = Alignment.topRight, direction = "vertical", decoration = null, padding = EdgeInsets.all(5)} = {}) {
    super();
    this.textStyle = textStyle;
    this.position = resolveLegendPosition(position);
    this.direction = direction;
    this.decoration = normalizeBoxDecoration(decoration);
    this.padding = normalizeInsets(padding);
  }
  buildLegend(context, dataset) {
    const style = context.theme.defaultTextStyle.merge(this.textStyle);
    return new Row({
      mainAxisSize: "min",
      children: [ new Container({
        width: style.fontSize ?? undefined,
        height: style.fontSize ?? undefined,
        margin: EdgeInsets.only({
          right: 5
        }),
        child: dataset.legendShape(context)
      }), new Text(dataset.legend ?? "", this.textStyle === null ? {} : {
        style: this.textStyle
      }) ]
    });
  }
  build(context) {
    const datasets = chartOf(context).datasets;
    const wrap = new Wrap({
      direction: this.direction,
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: this.direction === "horizontal" ? "center" : "start",
      children: datasets.filter(dataset => dataset.legend !== null).map(dataset => this.buildLegend(context, dataset))
    });
    return new Align({
      alignment: this.position,
      child: new Container({
        decoration: this.decoration ?? new BoxDecoration({
          color: CHART_WHITE
        }),
        padding: this.padding,
        child: wrap
      })
    });
  }
}

class LineDataSet extends PointDataSet {
  constructor({data, legend = null, pointColor = null, pointSize = 3, color = CHART_BLUE, lineWidth = 2, drawLine = true, lineColor = null, drawPoints = true, shape = null, buildValue = null, valuePosition = "auto", drawSurface = false, surfaceOpacity = .2, surfaceColor = null, isCurved = false, smoothness = .35, borderColor = null, borderWidth = 1.5}) {
    super({
      data,
      legend,
      color: pointColor ?? color,
      borderColor,
      borderWidth,
      pointSize,
      drawPoints,
      shape,
      buildValue,
      valuePosition
    });
    if (!drawLine && !drawPoints && !drawSurface) {
      throw new Error("LineDataSet must draw its line, its points or its surface");
    }
    this.lineWidth = Number(lineWidth);
    this.drawLine = Boolean(drawLine);
    this.lineColor = lineColor === null ? null : normalizeColor(lineColor);
    this.drawSurface = Boolean(drawSurface);
    this.surfaceColor = surfaceColor === null ? null : normalizeColor(surfaceColor);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.isCurved = Boolean(isCurved);
    this.smoothness = Number(smoothness);
  }
  legendShape(context) {
    if (this.shape !== null) return this.shape(context);
    return new Container({
      decoration: new BoxDecoration({
        color: this.lineColor ?? this.color,
        border: Border.all({
          color: this.borderColor ?? CHART_BLACK,
          width: this.borderWidth
        })
      })
    });
  }
  drawPath(context, frame, moveTo) {
    if (this.data.length < 2) return;
    const canvas = context.canvas;
    let t = {
      x: 0,
      y: 0
    };
    const first = frame.toChart(this.data[0].point);
    if (moveTo) {
      canvas.moveTo(frame.px(first.x), frame.py(first.y));
    } else {
      canvas.lineTo(frame.px(first.x), frame.py(first.y));
    }
    for (let index = 1; index < this.data.length; index++) {
      const p = frame.toChart(this.data[index].point);
      if (!this.isCurved) {
        canvas.lineTo(frame.px(p.x), frame.py(p.y));
        continue;
      }
      const pp = frame.toChart(this.data[index - 1].point);
      const pn = frame.toChart(this.data[index + 1 < this.data.length ? index + 1 : index].point);
      const c1 = {
        x: pp.x + t.x,
        y: pp.y + t.y
      };
      t = {
        x: (pn.x - pp.x) / 2 * this.smoothness,
        y: (pn.y - pp.y) / 2 * this.smoothness
      };
      const c2 = {
        x: p.x - t.x,
        y: p.y - t.y
      };
      canvas.curveTo(frame.px(c1.x), frame.py(c1.y), frame.px(c2.x), frame.py(c2.y), frame.px(p.x), frame.py(p.y));
    }
  }
  drawArea(context, frame) {
    if (this.data.length < 2) return;
    const canvas = context.canvas;
    const base = frame instanceof CartesianFrame ? frame.xAxisOffset : 0;
    this.drawPath(context, frame, true);
    const last = frame.toChart(this.data[this.data.length - 1].point);
    canvas.lineTo(frame.px(last.x), frame.py(base));
    const first = frame.toChart(this.data[0].point);
    canvas.lineTo(frame.px(first.x), frame.py(base));
  }
  paintBackground(context, frame, _data) {
    if (this.data.length === 0 || !this.drawSurface) return;
    const canvas = context.canvas;
    this.drawArea(context, frame);
    if (this.surfaceOpacity !== 1) {
      canvas.saveContext();
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.surfaceOpacity
      }));
    }
    canvas.setFillColor(this.surfaceColor ?? this.color ?? CHART_BLUE);
    canvas.fillPath();
    if (this.surfaceOpacity !== 1) canvas.restoreContext();
  }
  paint(context, frame, _data) {
    if (this.data.length === 0 || !this.drawLine) return;
    const canvas = context.canvas;
    this.drawPath(context, frame, true);
    canvas.setStrokeColor(this.lineColor ?? this.color ?? CHART_BLUE);
    canvas.setLineWidth(this.lineWidth);
    canvas.setLineCap("round");
    canvas.setLineJoin("round");
    canvas.strokePath();
  }
}

class PieFrame extends ChartFrame {
  constructor(radius, angleStart, angleEnd, originX = 0, originPdfY = 0, originTop = 0) {
    super(originX, originPdfY, originTop);
    this.radius = radius;
    this.angleStart = angleStart;
    this.angleEnd = angleEnd;
  }
  toChart(point) {
    return point;
  }
  withOrigin(originX, originPdfY, originTop) {
    return new PieFrame(this.radius, this.angleStart, this.angleEnd, originX, originPdfY, originTop);
  }
}

class PieDataSet extends Dataset {
  constructor({value, legend = null, color, borderColor = CHART_WHITE, borderWidth = 1.5, drawBorder = null, drawSurface = true, surfaceOpacity = 1, offset = 0, legendStyle = null, legendAlign = null, legendPosition = "auto", legendLineWidth = 1, legendLineColor = null, legendOffset = 20, innerRadius = 0}) {
    super({
      legend,
      color: color ?? CHART_BLUE,
      borderColor,
      borderWidth
    });
    if (innerRadius < 0) throw new RangeError("PieDataSet innerRadius must not be negative");
    if (offset < 0) throw new RangeError("PieDataSet offset must not be negative");
    this.value = Number(value);
    const fill = this.color ?? normalizeColor(CHART_BLUE);
    const border = this.borderColor;
    this.drawBorder = drawBorder ?? (border !== null && (border[0] !== fill[0] || border[1] !== fill[1] || border[2] !== fill[2]));
    if (!this.drawBorder && !drawSurface) {
      throw new Error("PieDataSet must draw its surface or its border");
    }
    this.drawSurface = Boolean(drawSurface);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.offset = Number(offset);
    this.legendStyle = legendStyle;
    this.legendAlign = legendAlign;
    this.legendPosition = legendPosition;
    this.legendLineWidth = Number(legendLineWidth);
    this.legendLineColor = legendLineColor === null ? fill : normalizeColor(legendLineColor);
    this.legendOffset = Number(legendOffset);
    this.innerRadius = Number(innerRadius);
  }
  isFullCircle(frame) {
    return frame.angleEnd - frame.angleStart >= Math.PI * 2;
  }
  layout(context, frame) {
    if (!(frame instanceof PieFrame)) {
      throw new Error("Use only PieDataSet with a PieGrid");
    }
    const fullCircle = this.isFullCircle(frame);
    const offset = fullCircle ? 0 : this.offset;
    const len = frame.radius + offset;
    let w = len * 2;
    let h = len * 2;
    const position = this.legendPosition === "auto" ? frame.angleEnd - frame.angleStart > Math.PI / 6 ? "inside" : "outside" : this.legendPosition;
    const bisect = fullCircle ? Math.PI / 4 : (frame.angleStart + frame.angleEnd) / 2;
    const align = this.legendAlign ?? (position === "inside" ? "center" : bisect > Math.PI ? "right" : "left");
    const legend = this.legend === null ? null : new RichText({
      text: new TextSpan({
        children: [ new TextSpan({
          text: this.legend,
          style: this.legendStyle ?? undefined
        }) ],
        style: new TextStyle({
          color: position === "inside" ? isLightColor(this.color ?? CHART_BLUE) ? normalizeColor(CHART_WHITE) : normalizeColor(CHART_BLACK) : null
        })
      }),
      textAlign: align
    });
    let legendBox = null;
    let legendLeft = 0;
    let legendBottom = 0;
    let anchor = null;
    let pivot = null;
    let start = null;
    if (legend !== null) {
      legendBox = legend.layout(context, new BoxConstraints({
        maxWidth: frame.radius,
        maxHeight: frame.radius
      }));
      const ls = {
        width: legendBox.width,
        height: legendBox.height
      };
      if (position === "outside") {
        const o = frame.radius + this.legendOffset;
        const cx = Math.sin(bisect) * (offset + o);
        const cy = Math.cos(bisect) * (offset + o);
        start = {
          x: Math.sin(bisect) * (offset + frame.radius + this.legendOffset * .1),
          y: Math.cos(bisect) * (offset + frame.radius + this.legendOffset * .1)
        };
        pivot = {
          x: cx,
          y: cy
        };
        if (bisect > Math.PI) {
          anchor = {
            x: cx - this.legendOffset / 2 * .8,
            y: cy
          };
          legendLeft = cx - this.legendOffset / 2 - ls.width;
          legendBottom = cy - ls.height / 2;
          w = Math.max(w, (-cx + this.legendOffset / 2 + ls.width) * 2);
          h = Math.max(h, Math.abs(cy) * 2 + ls.height);
        } else {
          anchor = {
            x: cx + this.legendOffset / 2 * .8,
            y: cy
          };
          legendLeft = cx + this.legendOffset / 2;
          legendBottom = cy - ls.height / 2;
          w = Math.max(w, (cx + this.legendOffset / 2 + ls.width) * 2);
          h = Math.max(h, Math.abs(cy) * 2 + ls.height);
        }
      } else if (position === "inside") {
        let o;
        let cx;
        let cy;
        if (this.innerRadius === 0) {
          o = fullCircle ? 0 : frame.radius * 2 / 3;
          cx = Math.sin(bisect) * (offset + o);
          cy = Math.cos(bisect) * (offset + o);
        } else {
          o = (frame.radius + this.innerRadius) / 2;
          if (fullCircle) {
            cx = 0;
            cy = o;
          } else {
            cx = Math.sin(bisect) * (offset + o);
            cy = Math.cos(bisect) * (offset + o);
          }
        }
        legendLeft = cx - ls.width / 2;
        legendBottom = cy - ls.height / 2;
      }
    }
    return {
      legend,
      legendBox,
      legendLeft,
      legendBottom,
      anchor,
      pivot,
      start,
      boxWidth: w,
      boxHeight: h
    };
  }
  appendSlice(context, frame) {
    const canvas = context.canvas;
    const bisect = (frame.angleStart + frame.angleEnd) / 2;
    const cx = Math.sin(bisect) * this.offset;
    const cy = Math.cos(bisect) * this.offset;
    const sx = cx + Math.sin(frame.angleStart) * frame.radius;
    const sy = cy + Math.cos(frame.angleStart) * frame.radius;
    const ex = cx + Math.sin(frame.angleEnd) * frame.radius;
    const ey = cy + Math.cos(frame.angleEnd) * frame.radius;
    if (this.isFullCircle(frame)) {
      canvas.drawEllipse(frame.px(0), frame.py(0), frame.radius, frame.radius);
      return;
    }
    canvas.moveTo(frame.px(cx), frame.py(cy));
    canvas.lineTo(frame.px(sx), frame.py(sy));
    canvas.bezierArc(frame.px(sx), frame.py(sy), frame.radius, frame.radius, frame.px(ex), frame.py(ey), {
      large: frame.angleEnd - frame.angleStart > Math.PI
    });
  }
  appendDonut(context, frame) {
    const canvas = context.canvas;
    const bisect = (frame.angleStart + frame.angleEnd) / 2;
    const cx = Math.sin(bisect) * this.offset;
    const cy = Math.cos(bisect) * this.offset;
    const stx = cx + Math.sin(frame.angleStart) * frame.radius;
    const sty = cy + Math.cos(frame.angleStart) * frame.radius;
    const etx = cx + Math.sin(frame.angleEnd) * frame.radius;
    const ety = cy + Math.cos(frame.angleEnd) * frame.radius;
    const sbx = cx + Math.sin(frame.angleStart) * this.innerRadius;
    const sby = cy + Math.cos(frame.angleStart) * this.innerRadius;
    const ebx = cx + Math.sin(frame.angleEnd) * this.innerRadius;
    const eby = cy + Math.cos(frame.angleEnd) * this.innerRadius;
    if (this.isFullCircle(frame)) {
      canvas.drawEllipse(frame.px(0), frame.py(0), frame.radius, frame.radius);
      canvas.drawEllipse(frame.px(0), frame.py(0), this.innerRadius, this.innerRadius, false);
      return;
    }
    const large = frame.angleEnd - frame.angleStart > Math.PI;
    canvas.moveTo(frame.px(stx), frame.py(sty));
    canvas.bezierArc(frame.px(stx), frame.py(sty), frame.radius, frame.radius, frame.px(etx), frame.py(ety), {
      large
    });
    canvas.lineTo(frame.px(ebx), frame.py(eby));
    canvas.bezierArc(frame.px(ebx), frame.py(eby), this.innerRadius, this.innerRadius, frame.px(sbx), frame.py(sby), {
      large,
      sweep: true
    });
    canvas.lineTo(frame.px(stx), frame.py(sty));
  }
  appendShape(context, frame) {
    if (this.innerRadius === 0) {
      this.appendSlice(context, frame);
    } else {
      this.appendDonut(context, frame);
    }
  }
  paintBackground(context, frame, _data) {
    if (!(frame instanceof PieFrame) || !this.drawSurface) return;
    const canvas = context.canvas;
    this.appendShape(context, frame);
    if (this.surfaceOpacity !== 1) {
      canvas.saveContext();
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.surfaceOpacity
      }));
    }
    canvas.setFillColor(this.color ?? CHART_BLUE);
    canvas.fillPath();
    if (this.surfaceOpacity !== 1) canvas.restoreContext();
  }
  paint(context, frame, _data) {
    if (!(frame instanceof PieFrame) || !this.drawBorder) return;
    const canvas = context.canvas;
    this.appendShape(context, frame);
    canvas.setLineWidth(this.borderWidth);
    canvas.setLineJoin("round");
    canvas.setStrokeColor(this.borderColor ?? this.color ?? CHART_BLUE);
    canvas.strokePath({
      close: true
    });
  }
  paintLegend(context, frame, data) {
    if (this.legendPosition === "none" || data.legend === null || data.legendBox === null) return;
    const canvas = context.canvas;
    if (data.anchor !== null && data.pivot !== null && data.start !== null) {
      canvas.saveContext();
      canvas.moveTo(frame.px(data.start.x), frame.py(data.start.y));
      canvas.lineTo(frame.px(data.pivot.x), frame.py(data.pivot.y));
      canvas.lineTo(frame.px(data.anchor.x), frame.py(data.anchor.y));
      canvas.setLineWidth(this.legendLineWidth);
      canvas.setLineCap("round");
      canvas.setLineJoin("round");
      canvas.setStrokeColor(this.legendLineColor);
      canvas.strokePath();
      canvas.restoreContext();
    }
    data.legend.paint(context, {
      ...data.legendBox,
      x: frame.px(data.legendLeft),
      y: frame.top(data.legendBottom + data.legendBox.height)
    });
  }
}

class PieGrid extends ChartGrid {
  constructor({startAngle = 0} = {}) {
    super();
    this.startAngle = Number(startAngle);
  }
  layout(context, constraints) {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);
    let total = 0;
    for (const dataset of datasets) {
      if (!(dataset instanceof PieDataSet)) throw new Error("Use only PieDataSet with a PieGrid");
      total += dataset.value;
    }
    const unit = total === 0 ? 0 : Math.PI / total * 2;
    let angle = this.startAngle;
    const angles = datasets.map(dataset => {
      const start = angle;
      angle += dataset.value * unit;
      return {
        start,
        end: angle
      };
    });
    let radius = Math.min(size.width / 2, size.height / 2);
    let datasetData = [];
    let reduce = false;
    do {
      reduce = false;
      datasetData = [];
      for (let index = 0; index < datasets.length; index++) {
        const slice = angles[index];
        const frame = new PieFrame(radius, slice.start, slice.end);
        const data = datasets[index].layout(context, frame);
        datasetData.push(data);
        if (radius > 20 && (data.boxWidth > size.width || data.boxHeight > size.height)) {
          radius -= 10;
          reduce = true;
          break;
        }
      }
    } while (reduce);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        radius,
        angles,
        datasetData
      }
    };
  }
  paint(context, box) {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const centreTop = box.y + box.height / 2;
    const originX = box.x + box.width / 2;
    const originPdfY = canvas.toPdfY(centreTop);
    const frames = box.data.angles.map(slice => new PieFrame(box.data.radius, slice.start, slice.end, originX, originPdfY, centreTop));
    datasets.forEach((dataset, index) => dataset.paintBackground(context, frames[index], box.data.datasetData[index]));
    datasets.forEach((dataset, index) => dataset.paint(context, frames[index], box.data.datasetData[index]));
    datasets.forEach((dataset, index) => {
      if (dataset instanceof PieDataSet) {
        dataset.paintLegend(context, frames[index], box.data.datasetData[index]);
      }
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
    this.annotations = [];
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
    if (this.annotations.length > 0) {
      this.params.set("/Annots", PdfArray.fromObjects(this.annotations));
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

class PdfAnnotation extends PdfObject {
  constructor(document, page, annotation) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/Annot") ] ]));
    this.page = page;
    this.annotation = annotation;
    page.annotations.push(this);
  }
  prepare() {
    const {rect, destination, kind} = this.annotation;
    this.params.set("/Subtype", new PdfName("/Link"));
    this.params.set("/Rect", PdfArray.fromNum([ rect.x, rect.y, rect.x + rect.width, rect.y + rect.height ]));
    this.params.set("/P", this.page.ref());
    this.params.set("/Border", PdfArray.fromNum([ 0, 0, 0 ]));
    this.params.set("/F", new PdfNum(4));
    this.params.set("/A", new PdfDict([ [ "/S", new PdfName(kind === "url" ? "/URI" : "/GoTo") ], [ kind === "url" ? "/URI" : "/D", new PdfString(destination) ] ]));
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
  addPage(format, content, fonts = new Map, graphicStates = new Map, patterns = new Map, images = new Map, annotations = []) {
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
    for (const annotation of annotations) {
      new PdfAnnotation(this, page, annotation);
    }
    page.contents.push(stream);
    return page;
  }
  addNavigation(outlines, pageMode, destinations = []) {
    const names = outlines.length > 0 || destinations.length > 0 ? new PdfNames(this) : null;
    for (const entry of destinations) {
      const page = this.pageList.pages[entry.page - 1];
      if (page !== undefined) {
        names?.addDestination(entry.name, page, {
          x: entry.x ?? undefined,
          y: entry.y ?? undefined,
          zoom: entry.zoom ?? undefined
        });
      }
    }
    if (outlines.length > 0) {
      const root = new PdfOutline(this);
      const levels = [ root ];
      for (const entry of outlines) {
        const page = this.pageList.pages[entry.page - 1];
        if (page === undefined) continue;
        names?.addDestination(entry.anchor, page, {
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
      this.catalog.outline = root;
    }
    if (names !== null) this.catalog.names = names;
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

function serializePdf(pages, metadata, outlines = [], pageMode = "none", destinations = []) {
  const document = new PdfDocument(metadata);
  for (const page of pages) {
    document.addPage(page.format, page.content, page.fonts, page.graphicStates, page.patterns, page.images, page.annotations);
  }
  document.addNavigation(outlines, pageMode, destinations);
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
    this.linkAnnotations = [];
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
  transformWidgetPoint(x, top) {
    return transformPoint(this.currentTransform, x, this.toPdfY(top));
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
  get annotations() {
    return this.linkAnnotations;
  }
  addUrlLink(destination, x, top, width, height) {
    this.addLink("url", destination, x, top, width, height);
  }
  addNamedLink(destination, x, top, width, height) {
    this.addLink("destination", destination, x, top, width, height);
  }
  addLink(kind, destination, x, top, width, height) {
    if (width <= 0 || height <= 0) return;
    const points = [ this.transformWidgetPoint(x, top), this.transformWidgetPoint(x + width, top), this.transformWidgetPoint(x, top + height), this.transformWidgetPoint(x + width, top + height) ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    this.linkAnnotations.push({
      kind,
      destination,
      rect: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    });
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
      ...pageFormat,
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
    const fromFormat = formatMargin(this.pageFormat);
    const declared = this.declaredMargin ?? (fromFormat === null ? normalizeInsets(DEFAULT_MARGIN) : fromFormat);
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
  constructor({format = undefined, pageFormat = undefined, margin = undefined, orientation = "natural", gap = 8, theme = undefined, build, header = null, footer = null, background = null, maxPages = 20}) {
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
          maxWidth
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
          maxWidth
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
      images: canvas.images,
      annotations: canvas.annotations
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
      images: canvas.images,
      annotations: canvas.annotations
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
    this.destinationEntries = [];
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
  registerDestination({name, pageNumber, x = null, y = null, zoom = null}) {
    this.destinationEntries.push({
      name,
      page: this.renderPageOffset + pageNumber,
      x,
      y,
      zoom
    });
  }
  renderSections(replay) {
    this.outlineReplay = replay;
    this.outlineCursor = 0;
    this.destinationEntries.length = 0;
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
    const destinations = this.destinationEntries.map(entry => ({
      ...entry
    }));
    return serializePdf(pages, this.metadata, outlines, this.pageMode, destinations);
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
    if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) throw new RangeError("Image DPI must be positive");
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.width = width;
    this.height = height;
    this.dpi = dpi;
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const offered = {
      width: parent.constrainWidth(this.width ?? (parent.hasBoundedWidth ? parent.maxWidth : this.image.width)),
      height: parent.constrainHeight(this.height ?? (parent.hasBoundedHeight ? parent.maxHeight : this.image.height))
    };
    const layoutFit = applyBoxFit$1(this.fit, {
      width: this.image.width,
      height: this.image.height
    }, offered);
    const image = this.image.resolve({
      x: layoutFit.destination.width,
      y: layoutFit.destination.height
    }, this.dpi);
    const fitted = applyBoxFit$1(this.fit, {
      width: image.width,
      height: image.height
    }, layoutFit.destination);
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, image.width, image.height);
    const destinationOffset = inscribe(this.alignment, fitted.destination.width, fitted.destination.height, layoutFit.destination.width, layoutFit.destination.height);
    return {
      widget: this,
      width: layoutFit.destination.width,
      height: layoutFit.destination.height,
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
    const fullWidth = data.image.width * scaleX;
    const fullHeight = data.image.height * scaleY;
    const fullX = destinationX - data.sourceX * scaleX;
    const fullTop = destinationY - data.sourceY * scaleY;
    context.canvas.saveContext();
    context.canvas.drawRect(destinationX, context.canvas.toPdfY(destinationY + data.destination.height), data.destination.width, data.destination.height);
    context.canvas.clipPath();
    context.canvas.drawImage(data.image, fullX, context.canvas.toPdfY(fullTop + fullHeight), fullWidth, fullHeight);
    context.canvas.restoreContext();
  }
}

function validateDpi(dpi) {
  if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) {
    throw new RangeError("Image DPI must be positive");
  }
  return dpi;
}

function resizeDecodedImage(image, width) {
  const pixels = image.pixels;
  if (pixels === null || width === image.sourceWidth) return image;
  const height = Math.max(1, Math.round(image.sourceHeight * width / image.sourceWidth));
  const resized = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.sourceHeight - 1, Math.floor(y * image.sourceHeight / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.sourceWidth - 1, Math.floor(x * image.sourceWidth / width));
      const source = (sourceY * image.sourceWidth + sourceX) * 4;
      const destination = (y * width + x) * 4;
      resized[destination] = pixels[source];
      resized[destination + 1] = pixels[source + 1];
      resized[destination + 2] = pixels[source + 2];
      resized[destination + 3] = pixels[source + 3];
    }
  }
  return new PdfImage({
    pixels: resized,
    width,
    height,
    orientation: image.orientation,
    hasAlpha: image.hasAlpha
  });
}

class ImageProvider {
  constructor(width, height, orientation, dpi) {
    this.cache = new Map;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.orientation = orientation;
    this.dpi = validateDpi(dpi);
  }
  get width() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceHeight : this.sourceWidth;
  }
  get height() {
    return this.orientation === "leftTop" || this.orientation === "rightTop" || this.orientation === "rightBottom" || this.orientation === "leftBottom" ? this.sourceWidth : this.sourceHeight;
  }
  resolve(size, dpi = null) {
    const effectiveDpi = validateDpi(dpi ?? this.dpi);
    if (effectiveDpi === null || size === undefined) {
      let image = this.cache.get(0);
      if (image === undefined) {
        image = this.buildImage();
        this.cache.set(0, image);
      }
      return image;
    }
    if (!Number.isFinite(size.x) || size.x < 0 || !Number.isFinite(size.y) || size.y < 0) {
      throw new RangeError("Image resolve size must be finite and non-negative");
    }
    const width = Math.max(1, Math.trunc(size.x / PageUnit.inch * effectiveDpi));
    let image = this.cache.get(width);
    if (image === undefined) {
      image = this.buildImage(width);
      this.cache.set(width, image);
    }
    return image;
  }
}

class ImageProxy extends ImageProvider {
  constructor(image, {dpi = null} = {}) {
    super(image.sourceWidth, image.sourceHeight, image.orientation, dpi);
    this.image = image;
  }
  buildImage(_width) {
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
  buildImage(width) {
    return width === undefined ? this.image : resizeDecodedImage(this.image, width);
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
  buildImage(width) {
    return width === undefined ? this.image : resizeDecodedImage(this.image, width);
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

class HelperCell extends Widget {
  constructor({child, padding, minimumHeight, alignment: cellAlignment, decoration}) {
    super();
    this.child = child;
    this.padding = normalizeInsets(padding);
    this.minimumHeight = Math.max(0, assertFiniteNumber(Number(minimumHeight), "table cell height"));
    this.alignment = cellAlignment;
    this.decoration = decoration;
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
    const offset = inscribe(this.alignment, childBox.width, childBox.height, innerWidth, innerHeight);
    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left + offset.dx,
      y: box.y + this.padding.top + offset.dy
    });
    paintTableDecorationBorder(context, this.decoration, box.x, box.y, box.width, box.height);
  }
}

const defaultBorder = TableBorder.all();

class TableHelper {
  static fromTextArray({context = null, data, cellPadding = 5, cellHeight = 0, cellAlignment = "topLeft", cellAlignments = null, cellStyle = null, oddCellStyle = null, cellFormat = null, cellDecoration = null, headerCount = 1, headers = null, headerPadding = cellPadding, headerHeight = cellHeight, headerAlignment = "center", headerAlignments = cellAlignments, headerStyle = null, headerFormat = null, border = defaultBorder, columnWidths = null, defaultColumnWidth = new IntrinsicColumnWidth, tableWidth = "max", headerDecoration = null, headerCellDecoration = null, rowDecoration = null, oddRowDecoration = rowDecoration, cellBuilder = null, textStyleBuilder = null}) {
    if (!Array.isArray(data)) {
      throw new TypeError("TableHelper.fromTextArray requires a data array");
    }
    const resolvedHeaderStyle = headerStyle ?? (context === null ? null : context.theme.tableHeader);
    const resolvedCellStyle = cellStyle ?? (context === null ? null : context.theme.tableCell);
    const resolvedOddCellStyle = oddCellStyle ?? resolvedCellStyle;
    const normalizedHeaderCount = Math.trunc(assertFiniteNumber(Number(headerCount), "headerCount"));
    if (normalizedHeaderCount < 0) {
      throw new RangeError("headerCount must not be negative");
    }
    const rows = [];
    let rowNumber = 0;
    const makeCell = (value, column, isHeader, padding, minimumHeight, cellAlignmentValue, decoration, isHeaderRow = false) => {
      const resolvedAlignment = alignment(cellAlignmentValue);
      if (value instanceof Widget) {
        return new HelperCell({
          child: value,
          padding,
          minimumHeight,
          alignment: resolvedAlignment,
          decoration
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
          decoration
        });
      }
      const formatter = isHeader ? headerFormat : cellFormat;
      const formatted = formatter === null ? String(value) : formatter(column, value);
      const isOdd = (rowNumber - normalizedHeaderCount) % 2 !== 0;
      const style = isHeader ? resolvedHeaderStyle : textStyleBuilder?.(column, value, rowNumber) ?? (isOdd ? resolvedOddCellStyle : resolvedCellStyle);
      const text = new Text(formatted, {
        ...style === null ? {} : {
          style
        },
        ...isHeaderRow ? {} : {
          align: textAlign(resolvedAlignment)
        }
      });
      return new HelperCell({
        child: text,
        padding,
        minimumHeight,
        alignment: resolvedAlignment,
        decoration
      });
    };
    if (headers !== null) {
      const cells = headers.map((value, column) => makeCell(value, column, true, headerPadding ?? cellPadding, headerHeight ?? cellHeight, indexed(headerAlignments, column) ?? headerAlignment, headerCellDecoration, true));
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

const publicApi = Object.freeze({
  Barcode: BarcodeFactory,
  BarcodeWidget,
  BarcodeCodabarStartStop,
  BarcodeCode128Fnc,
  BarcodeQRCorrectionLevel,
  Pdf417SecurityLevel,
  Document,
  Anchor,
  Annotation,
  AnnotationBuilder,
  AnnotationLink,
  AnnotationUrl,
  Link,
  UrlLink,
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
  Chart,
  ChartGrid,
  ChartFrame,
  CartesianGrid,
  CartesianFrame,
  PieGrid,
  PieFrame,
  RadialGrid,
  RadialFrame,
  GridAxis,
  FixedAxis,
  PointChartValue,
  Dataset,
  PointDataSet,
  BarDataSet,
  LineDataSet,
  PieDataSet,
  ChartLegend,
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

export { Align, Alignment, Anchor, Annotation, AnnotationBuilder, AnnotationLink, AnnotationUrl, AspectRatio, BarDataSet, BarcodeFactory as Barcode, BarcodeCodabarStartStop, BarcodeCode128Fnc, BarcodeQRCorrectionLevel, BarcodeWidget, Border, BorderRadius, BorderRadiusDirectional, BorderRadiusGeometry, BorderSide, BorderStyle, BoxBorder, BoxConstraints, BoxDecoration, BoxShadow, Builder, Bullet, CartesianFrame, CartesianGrid, Center, Chart, ChartFrame, ChartGrid, ChartLegend, ClipOval, ClipRRect, ClipRect, Column, ConstrainedBox, Container, CustomPaint, Dataset, DecoratedBox, DefaultTextStyle, Divider, Document, EdgeInsets, Expanded, FittedBox, FixedAxis, FixedColumnWidth, Flex, FlexColumnWidth, Flexible, FlutterLogo, Font, FractionColumnWidth, FullPage, Gradient, GridAxis, GridView, Header, Image, ImageProvider, ImageProxy, InlineSpan, IntrinsicColumnWidth, LayoutBuilder, LimitedBox, LineDataSet, LinearGradient, Link, Lorem, LoremText, MemoryImage, MultiPage, Opacity, OverflowBox, Padding, Page, PageFormat, PageTheme, Paragraph, Partition, Partitions, Pdf417SecurityLevel, PdfFontMetrics, PdfGraphicState, PdfImage, PdfLogo, PdfPoint, PdfRect, PdfTtfFont, PdfType1Font, PieDataSet, PieFrame, PieGrid, Placeholder, PointChartValue, PointDataSet, Positioned, PositionedDirectional, RadialFrame, RadialGradient, RadialGrid, Radius, RawImage, RichText, Row, SizedBox, Spacer, SpanningWidget, Stack, StatelessWidget, SvgImage, Table, TableBorder, TableColumnWidth, TableHelper, TableOfContent, TableRow, Text, TextSpan, TextStyle, Theme, ThemeData, Transform, UrlLink, Vector, VerticalDivider, Widget, WidgetSpan, Wrap, composeMatrices, createPdf, decodePng, flipMatrix, identityMatrix, inflateZlib, invertMatrix, js_pdf, multiplyMatrix, parseJpeg, rotationMatrix, scaleMatrix, skewMatrix, transformPoint, translationMatrix };

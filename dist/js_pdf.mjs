/*!
 * @license romulocrj/js_pdf v0.2.0
 *
 * An independent JavaScript port of DavBfr/dart_pdf.
 *
 * Original work: https://github.com/DavBfr/dart_pdf
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 */

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
    const required = this.length + size;
    let capacity = this.buffer.length === 0 ? GROW : this.buffer.length;
    while (capacity < required) {
      capacity *= 2;
    }
    const grown = new Uint8Array(capacity);
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
    this.putBytes(encodeLatin1(value));
  }
  putStream(source) {
    this.putBytes(source.output());
  }
  setBytes(offset, bytes) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + bytes.length > this.length) {
      throw new RangeError("Patch offset is outside the written stream bounds");
    }
    this.buffer.set(bytes, offset);
  }
  output() {
    return this.buffer.slice(0, this.length);
  }
  take(finalByte) {
    const result = new Uint8Array(this.length + (finalByte === undefined ? 0 : 1));
    result.set(this.buffer.subarray(0, this.length));
    if (finalByte !== undefined) result[this.length] = finalByte;
    this.buffer = new Uint8Array(0);
    this.length = 0;
    return result;
  }
  view() {
    return this.buffer.subarray(0, this.length);
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

const LIMIT = 3403e35;

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1e21) return BigInt(Math.min(LIMIT, Math.max(-LIMIT, value))).toString();
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

function normalizeColor(value, fallback = [ 0, 0, 0 ]) {
  if (value == null) return fallback;
  if (value instanceof PdfColor) return [ value.red, value.green, value.blue ];
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
  return relative * relative > .15;
}

function colorOperator(color, stroke = false) {
  const operator = color instanceof PdfColorCmyk ? stroke ? "K" : "k" : color instanceof PdfColorGrey ? stroke ? "G" : "g" : stroke ? "RG" : "rg";
  return `${colorComponents(color).map(formatNumber).join(" ")} ${operator}`;
}

function unit(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Color components must be finite values in 0..1");
  return value;
}

function hueValue(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 360) throw new RangeError("Hue must be in 0..360, excluding 360");
  return value;
}

function wrapHue(value) {
  return (value % 360 + 360) % 360;
}

class PdfColor {
  constructor(red, green, blue, alpha = 1) {
    this.red = unit(red);
    this.green = unit(green);
    this.blue = unit(blue);
    this.alpha = unit(alpha);
  }
  static fromInt(color) {
    return new PdfColor((color >>> 16 & 255) / 255, (color >>> 8 & 255) / 255, (color & 255) / 255, (color >>> 24 & 255) / 255);
  }
  static fromHex(color) {
    const hex = color.startsWith("#") ? color.slice(1) : color;
    if (!/^(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) throw new TypeError("Color hex must contain 3, 6 or 8 hexadecimal digits");
    const expanded = hex.length === 3 ? [ ...hex ].map(value => value + value).join("") : hex;
    return new PdfColor(parseInt(expanded.slice(0, 2), 16) / 255, parseInt(expanded.slice(2, 4), 16) / 255, parseInt(expanded.slice(4, 6), 16) / 255, expanded.length === 8 ? parseInt(expanded.slice(6), 16) / 255 : 1);
  }
  static fromRYB(red, yellow, blue, alpha = 1) {
    unit(red);
    unit(yellow);
    unit(blue);
    const magic = [ [ 1, 1, 1 ], [ 1, 1, 0 ], [ 1, 0, 0 ], [ 1, .5, 0 ], [ .163, .373, .6 ], [ 0, .66, .2 ], [ .5, 0, .5 ], [ .2, .094, 0 ] ];
    const cubic = (t, a, b) => a + t * t * (3 - 2 * t) * (b - a);
    const component = index => cubic(red, cubic(yellow, cubic(blue, magic[0][index], magic[4][index]), cubic(blue, magic[1][index], magic[5][index])), cubic(yellow, cubic(blue, magic[2][index], magic[6][index]), cubic(blue, magic[3][index], magic[7][index])));
    return new PdfColor(component(0), component(1), component(2), alpha);
  }
  withAlpha(alpha) {
    return new PdfColor(this.red, this.green, this.blue, alpha);
  }
  withRed(red) {
    return new PdfColor(red, this.green, this.blue, this.alpha);
  }
  withGreen(green) {
    return new PdfColor(this.red, green, this.blue, this.alpha);
  }
  withBlue(blue) {
    return new PdfColor(this.red, this.green, blue, this.alpha);
  }
  withValues(alpha, red, green, blue) {
    return new PdfColor(red ?? this.red, green ?? this.green, blue ?? this.blue, alpha ?? this.alpha);
  }
  toInt() {
    return (Math.round(this.alpha * 255) << 24 | Math.round(this.red * 255) << 16 | Math.round(this.green * 255) << 8 | Math.round(this.blue * 255)) >>> 0;
  }
  toHex() {
    const value = this.toInt();
    return `#${(value & 16777215).toString(16).padStart(6, "0")}${(value >>> 24).toString(16).padStart(2, "0")}`;
  }
  toCmyk() {
    return PdfColorCmyk.fromRgb(this.red, this.green, this.blue, this.alpha);
  }
  toHsv() {
    return PdfColorHsv.fromRgb(this.red, this.green, this.blue, this.alpha);
  }
  toHsl() {
    return PdfColorHsl.fromRgb(this.red, this.green, this.blue, this.alpha);
  }
  get luminance() {
    return colorLuminance(this);
  }
  get isLight() {
    return isLightColor(this);
  }
  get isDark() {
    return !this.isLight;
  }
  shade(strength) {
    const hsl = this.toHsl();
    return new PdfColorHsl(hsl.hue, hsl.saturation, clamp(hsl.lightness * (1.5 - strength), 0, 1));
  }
  get complementary() {
    return this.toHsv().complementary;
  }
  get monochromatic() {
    return this.toHsv().monochromatic;
  }
  get splitcomplementary() {
    return this.toHsv().splitcomplementary;
  }
  get tetradic() {
    return this.toHsv().tetradic;
  }
  get triadic() {
    return this.toHsv().triadic;
  }
  get analagous() {
    return this.toHsv().analagous;
  }
  flatten({background = new PdfColor(1, 1, 1)} = {}) {
    return new PdfColor(this.alpha * this.red + (1 - this.alpha) * background.red, this.alpha * this.green + (1 - this.alpha) * background.green, this.alpha * this.blue + (1 - this.alpha) * background.blue, background.alpha);
  }
  equals(other) {
    return other instanceof PdfColor && other.constructor === this.constructor && other.red === this.red && other.green === this.green && other.blue === this.blue && other.alpha === this.alpha;
  }
  get hashCode() {
    return this.toInt();
  }
  toString() {
    return `${this.constructor.name}(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`;
  }
}

class PdfColorGrey extends PdfColor {
  constructor(color, alpha = 1) {
    super(color, color, color, alpha);
  }
}

class PdfColorCmyk extends PdfColor {
  constructor(cyan, magenta, yellow, black, alpha = 1) {
    unit(cyan);
    unit(magenta);
    unit(yellow);
    unit(black);
    super((1 - cyan) * (1 - black), (1 - magenta) * (1 - black), (1 - yellow) * (1 - black), alpha);
    this.cyan = cyan;
    this.magenta = magenta;
    this.yellow = yellow;
    this.black = black;
  }
  static fromRgb(red, green, blue, alpha = 1) {
    unit(red);
    unit(green);
    unit(blue);
    const max = Math.max(red, green, blue);
    return max === 0 ? new PdfColorCmyk(0, 0, 0, 1, alpha) : new PdfColorCmyk((max - red) / max, (max - green) / max, (max - blue) / max, 1 - max, alpha);
  }
  toCmyk() {
    return this;
  }
  toString() {
    return `PdfColorCmyk(${this.cyan}, ${this.magenta}, ${this.yellow}, ${this.black}, ${this.alpha})`;
  }
}

function rgbHue(red, green, blue, max, delta) {
  if (delta === 0) return 0;
  if (max === red) return wrapHue(60 * (green - blue) / delta);
  if (max === green) return 60 * ((blue - red) / delta + 2);
  return 60 * ((red - green) / delta + 4);
}

function cylindricalRgb(hue, chroma, match) {
  hueValue(hue);
  const secondary = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
  const components = hue < 60 ? [ chroma, secondary, 0 ] : hue < 120 ? [ secondary, chroma, 0 ] : hue < 180 ? [ 0, chroma, secondary ] : hue < 240 ? [ 0, secondary, chroma ] : hue < 300 ? [ secondary, 0, chroma ] : [ chroma, 0, secondary ];
  return [ clamp(components[0] + match, 0, 1), clamp(components[1] + match, 0, 1), clamp(components[2] + match, 0, 1) ];
}

class PdfColorHsv extends PdfColor {
  constructor(hue, saturation, value, alpha = 1) {
    unit(saturation);
    unit(value);
    super(...cylindricalRgb(hue, saturation * value, value - saturation * value), alpha);
    this.hue = hue;
    this.saturation = saturation;
    this.value = value;
  }
  static fromRgb(red, green, blue, alpha = 1) {
    unit(red);
    unit(green);
    unit(blue);
    const max = Math.max(red, green, blue), delta = max - Math.min(red, green, blue);
    return new PdfColorHsv(rgbHue(red, green, blue, max, delta), max === 0 ? 0 : delta / max, max, alpha);
  }
  withHue(hue) {
    return new PdfColorHsv(hue, this.saturation, this.value, this.alpha);
  }
  withSaturation(saturation) {
    return new PdfColorHsv(this.hue, saturation, this.value, this.alpha);
  }
  withValue(value) {
    return new PdfColorHsv(this.hue, this.saturation, value, this.alpha);
  }
  toHsv() {
    return this;
  }
  get complementary() {
    return this.withHue(wrapHue(this.hue - 120));
  }
  get monochromatic() {
    return [ [ .2, .1 ], [ .4, .2 ], [ .15, .05 ] ].map(([s, v]) => new PdfColorHsv(this.hue, clamp(this.saturation + (this.saturation > .5 ? -s : s), 0, 1), clamp(this.value + (this.value > .5 ? -v : v), 0, 1)));
  }
  get splitcomplementary() {
    return [ -150, -180 ].map(offset => this.withHue(wrapHue(this.hue + offset)));
  }
  get triadic() {
    return [ 80, -120 ].map(offset => this.withHue(wrapHue(this.hue + offset)));
  }
  get tetradic() {
    return [ 120, -150, 60 ].map(offset => this.withHue(wrapHue(this.hue + offset)));
  }
  get analagous() {
    return [ 30, -20 ].map(offset => this.withHue(wrapHue(this.hue + offset)));
  }
  toString() {
    return `PdfColorHsv(${this.hue}, ${this.saturation}, ${this.value}, ${this.alpha})`;
  }
}

class PdfColorHsl extends PdfColor {
  constructor(hue, saturation, lightness, alpha = 1) {
    unit(saturation);
    unit(lightness);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    super(...cylindricalRgb(hue, chroma, lightness - chroma / 2), alpha);
    this.hue = hue;
    this.saturation = saturation;
    this.lightness = lightness;
  }
  static fromRgb(red, green, blue, alpha = 1) {
    unit(red);
    unit(green);
    unit(blue);
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : clamp(delta / (1 - Math.abs(2 * lightness - 1)), 0, 1);
    return new PdfColorHsl(rgbHue(red, green, blue, max, delta), saturation, lightness, alpha);
  }
  withHue(hue) {
    return new PdfColorHsl(hue, this.saturation, this.lightness, this.alpha);
  }
  withSaturation(saturation) {
    return new PdfColorHsl(this.hue, saturation, this.lightness, this.alpha);
  }
  withLightness(lightness) {
    return new PdfColorHsl(this.hue, this.saturation, lightness, this.alpha);
  }
  toHsl() {
    return this;
  }
  toString() {
    return `PdfColorHsl(${this.hue}, ${this.saturation}, ${this.lightness}, ${this.alpha})`;
  }
}

function normalizePaintColor(value) {
  return value instanceof PdfColor ? value : normalizeColor(value);
}

function colorComponents(color) {
  if (color instanceof PdfColorCmyk) return [ color.cyan, color.magenta, color.yellow, color.black ];
  if (color instanceof PdfColorGrey) return [ color.red ];
  return normalizeColor(color);
}

function samePaintColor(left, right) {
  const a = colorComponents(left), b = colorComponents(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

class PdfColors {
  constructor() {}
  static getColor(index) {
    if (!Number.isSafeInteger(index)) throw new RangeError("Color index must be a safe integer");
    const hue = (index * 137.508 % 360 + 360) % 360;
    const color = new PdfColorHsv(hue, 1, 1);
    return index / 3 % 2 === 0 ? PdfColor.fromRYB(color.red, color.green, color.blue) : color;
  }
}

const families = "red pink purple deepPurple indigo blue lightBlue cyan teal green lightGreen lime yellow amber orange deepOrange brown grey blueGrey".split(" ");

const shades = "50 100 200 300 400 500 600 700 800 900 Accent100 Accent200 Accent400 Accent700".split(" ");

const packed = "ffebeeffcdd2ef9a9ae57373ef5350f44336e53935d32f2fc62828b71c1cff8a80ff5252ff1744d50000fce4ecf8bbd0f48fb1f06292ec407ae91e63d81b60c2185bad1457880e4fff80abff4081f50057c51162f3e5f5e1bee7ce93d8ba68c8ab47bc9c27b08e24aa7b1fa26a1b9a4a148cea80fce040fbd500f9aa00ffede7f6d1c4e9b39ddb9575cd7e57c2673ab75e35b1512da84527a0311b92b388ff7c4dff651fff6200eae8eaf6c5cae99fa8da7986cb5c6bc03f51b53949ab303f9f2835931a237e8c9eff536dfe3d5afe304ffee3f2fdbbdefb90caf964b5f642a5f52196f31e88e51976d21565c00d47a182b1ff448aff2979ff2962ffe1f5feb3e5fc81d4fa4fc3f729b6f603a9f4039be50288d10277bd01579b80d8ff40c4ff00b0ff0091eae0f7fab2ebf280deea4dd0e126c6da00bcd400acc10097a700838f00606484ffff18ffff00e5ff00b8d4e0f2f1b2dfdb80cbc44db6ac26a69a00968800897b00796b00695c004d40a7ffeb64ffda1de9b600bfa5e8f5e9c8e6c9a5d6a781c78466bb6a4caf5043a047388e3c2e7d321b5e20b9f6ca69f0ae00e67600c853f1f8e9dcedc8c5e1a5aed5819ccc658bc34a7cb342689f38558b2f33691eccff90b2ff5976ff0364dd17f9fbe7f0f4c3e6ee9cdce775d4e157cddc39c0ca33afb42b9e9d24827717f4ff81eeff41c6ff00aeea00fffde7fff9c4fff59dfff176ffee58ffeb3bfdd835fbc02df9a825f57f17ffff8dffff00ffea00ffd600fff8e1ffecb3ffe082ffd54fffca28ffc107ffb300ffa000ff8f00ff6f00ffe57fffd740ffc400ffab00fff3e0ffe0b2ffcc80ffb74dffa726ff9800fb8c00f57c00ef6c00e65100ffd180ffab40ff9100ff6d00fbe9e7ffccbcffab91ff8a65ff7043ff5722f4511ee64a19d84315bf360cff9e80ff6e40ff3d00dd2c00efebe9d7ccc8bcaaa4a1887f8d6e637955486d4c415d40374e342e3e2723fafafaf5f5f5eeeeeee0e0e0bdbdbd9e9e9e757575616161424242212121eceff1cfd8dcb0bec590a4ae78909c607d8b546e7a455a6437474f263238ffffff000000";

const palette = PdfColors;

let offset = 0;

const define = name => {
  palette[name] = Object.freeze(PdfColor.fromInt(4278190080 + parseInt(packed.slice(offset, offset += 6), 16)));
};

families.forEach((family, index) => (index < 16 ? shades : shades.slice(0, 10)).forEach(shade => define(family + shade)));

define("white");

define("black");

families.forEach((family, index) => {
  palette[family] = palette[family + "500"];
  if (index < 16) palette[family + "Accent"] = palette[family + "Accent200"];
});

palette["primaries"] = Object.freeze(families.map(family => palette[family]));

palette["accents"] = Object.freeze(families.slice(0, 16).map(family => palette[family + "Accent"]));

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
    this.color = normalizePaintColor(color);
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
    const left = colorComponents(this.color), right = colorComponents(other.color);
    return this.width === other.width && this.style.paint === other.style.paint && this.style.phase === other.style.phase && String(this.style.pattern) === String(other.style.pattern) && left.length === right.length && left.every((component, index) => component === right[index]);
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
  static fromColor(color) {
    return PdfArray.fromNum(colorComponents(color));
  }
  get length() {
    return this.values.length;
  }
  uniq() {
    const values = [];
    for (const value of this.values) {
      if (!values.some(existing => existing === value || existing instanceof PdfIndirect && value instanceof PdfIndirect && existing.equals(value) || existing.constructor === value.constructor && "value" in existing && "value" in value && existing.value === value.value)) values.push(value);
    }
    this.values.splice(0, this.values.length, ...values);
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
  merge(other) {
    for (const [key, value] of other.values) {
      const current = this.values.get(key);
      if (current instanceof PdfArray && value instanceof PdfArray) {
        current.values.push(...value.values);
        current.uniq();
      } else if (current instanceof PdfDict && value instanceof PdfDict) current.merge(value); else this.values.set(key, value);
    }
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

function codeUnits(text) {
  const units = new Uint16Array(text.length);
  for (let i = 0; i < text.length; i++) units[i] = text.charCodeAt(i);
  return units;
}

function utf8Encode(text) {
  const bytes = new Uint8Array(text.length * 3);
  let length = 0;
  for (const character of text) {
    let point = character.codePointAt(0) ?? 65533;
    if (point >= 55296 && point <= 57343) point = 65533;
    if (point < 128) {
      bytes[length++] = point;
    } else if (point < 2048) {
      bytes[length++] = 192 | point >> 6;
      bytes[length++] = 128 | point & 63;
    } else if (point < 65536) {
      bytes[length++] = 224 | point >> 12;
      bytes[length++] = 128 | point >> 6 & 63;
      bytes[length++] = 128 | point & 63;
    } else {
      bytes[length++] = 240 | point >> 18;
      bytes[length++] = 128 | point >> 12 & 63;
      bytes[length++] = 128 | point >> 6 & 63;
      bytes[length++] = 128 | point & 63;
    }
  }
  return bytes.subarray(0, length).slice();
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

class PdfName extends PdfDataType {
  constructor(value) {
    super();
    if (value.charCodeAt(0) !== 47) {
      throw new TypeError(`PDF name must start with "/": ${value}`);
    }
    this.value = value;
  }
  output(s) {
    const bytes = /[^\x00-\x7f]/.test(this.value) ? utf8Encode(this.value) : null;
    const length = bytes === null ? this.value.length : bytes.length;
    for (let index = 0; index < length; index++) {
      const code = bytes === null ? this.value.charCodeAt(index) : bytes[index];
      if (code < 33 || code > 126 || code === 35 || code === 47 && index > 0 || code === 91 || code === 93 || code === 40 || code === 41 || code === 60 || code === 62) {
        s.putString(`#${code.toString(16).padStart(2, "0")}`);
      } else {
        s.putByte(code);
      }
    }
  }
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
    const minWidth = clampConstraint(this.minWidth, constraints.minWidth, constraints.maxWidth);
    const maxWidth = clampConstraint(this.maxWidth, constraints.minWidth, constraints.maxWidth);
    const minHeight = clampConstraint(this.minHeight, constraints.minHeight, constraints.maxHeight);
    const maxHeight = clampConstraint(this.maxHeight, constraints.minHeight, constraints.maxHeight);
    if (Object.is(minWidth, this.minWidth) && Object.is(maxWidth, this.maxWidth) && Object.is(minHeight, this.minHeight) && Object.is(maxHeight, this.maxHeight)) return this;
    return new BoxConstraints({
      minWidth,
      maxWidth,
      minHeight,
      maxHeight
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

class Inherited {}

class SpanningWidget extends Widget {
  get canSpan() {
    return true;
  }
}

class StatelessWidget extends SpanningWidget {
  initialSpanState() {
    return {
      child: null,
      childState: null,
      done: false
    };
  }
  layoutSpan(context, constraints, state) {
    const child = state.child ?? this.build(context);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null ? child.initialSpanState() : state.childState;
      const fragment = child.layoutSpan(context, constraints, childState);
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
          child,
          childState: fragment.nextState,
          done: !fragment.hasMore
        },
        hasMore: fragment.hasMore
      };
    }
    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(context, parent.copyWith({
      minHeight: 0,
      maxHeight: Infinity
    }));
    if (childBox.height > parent.maxHeight + .001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: {
            childBox: {
              ...childBox,
              height: 0
            }
          }
        },
        nextState: {
          child,
          childState: null,
          done: false
        },
        hasMore: true
      };
    }
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
        child,
        childState: null,
        done: true
      },
      hasMore: false
    };
  }
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

class InheritedWidget extends SpanningWidget {
  constructor({build, inherited = null}) {
    super();
    if (typeof build !== "function") throw new TypeError("InheritedWidget.build must be a function");
    this.builder = build;
    this.inheritedValue = inherited;
  }
  static of(context, type) {
    return context.inherited?.get(type) ?? null;
  }
  scope(context) {
    if (this.inheritedValue === null) return context;
    const inherited = new Map(context.inherited ?? []);
    inherited.set(this.inheritedValue.constructor, this.inheritedValue);
    return {
      ...context,
      inherited
    };
  }
  initialSpanState() {
    return {
      child: null,
      childState: null
    };
  }
  layout(context, constraints) {
    const scoped = this.scope(context);
    const child = this.builder(scoped);
    const childBox = child.layout(scoped, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: {
        childBox,
        child
      }
    };
  }
  paint(context, box) {
    const scoped = this.scope(context);
    box.data.child.paint(scoped, {
      ...box.data.childBox,
      x: box.x,
      y: box.y
    });
  }
  layoutSpan(context, constraints, state) {
    const scoped = this.scope(context);
    const child = state.child ?? this.builder(scoped);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null ? child.initialSpanState() : state.childState;
      const fragment = child.layoutSpan(scoped, constraints, childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: {
            childBox: fragment.box,
            child
          }
        },
        nextState: {
          child,
          childState: fragment.nextState
        },
        hasMore: fragment.hasMore
      };
    }
    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(scoped, parent.copyWith({
      minHeight: 0,
      maxHeight: Infinity
    }));
    if (childBox.height > parent.maxHeight + .001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: {
            childBox: {
              ...childBox,
              height: 0
            },
            child
          }
        },
        nextState: {
          child,
          childState: null
        },
        hasMore: true
      };
    }
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: {
          childBox,
          child
        }
      },
      nextState: {
        child,
        childState: null
      },
      hasMore: false
    };
  }
}

class DelayedWidget extends SpanningWidget {
  constructor({build}) {
    super();
    if (typeof build !== "function") throw new TypeError("DelayedWidget.build must be a function");
    this.builder = build;
  }
  initialSpanState() {
    return {
      child: null,
      childState: null
    };
  }
  layout(context, constraints) {
    const childBox = this.builder(context).layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: {
        childBox,
        childState: null,
        spanning: false
      }
    };
  }
  layoutSpan(context, constraints, state) {
    const child = state.child ?? this.builder(context);
    if (child instanceof SpanningWidget && child.canSpan) {
      const childState = state.child === null ? child.initialSpanState() : state.childState;
      const fragment = child.layoutSpan(context, constraints, childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: {
            childBox: fragment.box,
            childState,
            spanning: true
          }
        },
        nextState: {
          child,
          childState: fragment.nextState
        },
        hasMore: fragment.hasMore
      };
    }
    const parent = BoxConstraints.from(constraints);
    const childBox = child.layout(context, parent.copyWith({
      minHeight: 0,
      maxHeight: Infinity
    }));
    if (childBox.height > parent.maxHeight + .001) {
      return {
        box: {
          widget: this,
          width: parent.constrainWidth(childBox.width),
          height: 0,
          data: {
            childBox: {
              ...childBox,
              height: 0
            },
            childState: null,
            spanning: false
          }
        },
        nextState: {
          child,
          childState: null
        },
        hasMore: true
      };
    }
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: {
          childBox,
          childState: null,
          spanning: false
        }
      },
      nextState: {
        child,
        childState: null
      },
      hasMore: false
    };
  }
  paint(context, box) {
    const child = this.builder(context);
    const childBox = box.data.spanning && child instanceof SpanningWidget && child.canSpan ? child.layoutSpan(context, new BoxConstraints({
      maxWidth: box.width,
      maxHeight: box.height
    }), box.data.childState).box : child.layout(context, BoxConstraints.tight({
      width: box.width,
      height: box.height
    }));
    child.paint(context, {
      ...childBox,
      x: box.x,
      y: box.y
    });
  }
}

class Inseparable extends SpanningWidget {
  constructor({child, canSpan = false}) {
    super();
    this.child = child;
    this.allowSpan = Boolean(canSpan);
  }
  get canSpan() {
    return this.allowSpan && this.child instanceof SpanningWidget && this.child.canSpan;
  }
  initialSpanState() {
    return {
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
    if (!(this.child instanceof SpanningWidget) || !this.canSpan) {
      return {
        box: this.layout(context, constraints),
        nextState: state,
        hasMore: false
      };
    }
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
        childState: fragment.nextState
      },
      hasMore: fragment.hasMore
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

function resolveBasicAlignment(value) {
  if (typeof value !== "string") return value;
  const result = Alignment[value];
  if (result === undefined) throw new TypeError(`Unknown alignment: ${value}`);
  return result;
}

class Align extends Widget {
  constructor({alignment = Alignment.center, widthFactor = null, heightFactor = null, child = null} = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
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
  constructor({height = DEFAULT_DIVIDER_HEIGHT, thickness = DEFAULT_DIVIDER_THICKNESS, indent = 0, endIndent = 0, color = "#000000", borderStyle = "solid"} = {}) {
    super();
    this.height = Math.max(0, Number(height));
    this.thickness = Math.max(0, Number(thickness));
    this.indent = Math.max(0, Number(indent));
    this.endIndent = Math.max(0, Number(endIndent));
    this.color = normalizePaintColor(color);
    this.borderStyle = new BorderSide({
      style: borderStyle
    }).style;
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
    if (width === 0 || this.thickness === 0 || !this.borderStyle.paint) return;
    const pattern = this.borderStyle.pattern;
    if (pattern !== null && pattern.length > 0) {
      let cursor = -this.borderStyle.phase;
      let index = 0;
      while (cursor < width) {
        const segment = Math.max(0, pattern[index % pattern.length] ?? 0);
        if (index % 2 === 0 && segment > 0) {
          const start = Math.max(0, cursor);
          const end = Math.min(width, cursor + segment);
          if (end > start) {
            context.canvas.fillRect(box.x + this.indent + start, box.y + (box.height - this.thickness) / 2, end - start, this.thickness, this.color);
          }
        }
        cursor += segment;
        index++;
        if (segment === 0 && index >= pattern.length) break;
      }
      return;
    }
    context.canvas.fillRect(box.x + this.indent, box.y + (box.height - this.thickness) / 2, width, this.thickness, this.color);
  }
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
    if (!this.adjustLayout) {
      const childBox = this.child.layout(context, parent);
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
    const [a, b] = this.transform;
    let childConstraints = this.unconstrained ? new BoxConstraints : Math.abs(a) <= 1e-9 && Math.abs(b) > 1e-9 ? new BoxConstraints({
      minWidth: parent.minHeight,
      maxWidth: parent.maxHeight,
      minHeight: parent.minWidth,
      maxHeight: parent.maxWidth
    }) : parent;
    let childBox = this.child.layout(context, childConstraints);
    const bounds = () => {
      const corners = [ transformPoint(this.transform, 0, 0), transformPoint(this.transform, childBox.width, 0), transformPoint(this.transform, childBox.width, childBox.height), transformPoint(this.transform, 0, childBox.height) ];
      const x = Math.min(...corners.map(point => point.x));
      const y = Math.min(...corners.map(point => point.y));
      return {
        x,
        y,
        width: Math.max(...corners.map(point => point.x)) - x,
        height: Math.max(...corners.map(point => point.y)) - y
      };
    };
    let rotated = bounds();
    if (!this.unconstrained && (rotated.width > parent.maxWidth || rotated.height > parent.maxHeight)) {
      const scale = Math.min(rotated.width > parent.maxWidth ? parent.maxWidth / rotated.width : 1, rotated.height > parent.maxHeight ? parent.maxHeight / rotated.height : 1);
      childConstraints = new BoxConstraints({
        maxWidth: (childConstraints.hasBoundedWidth ? childConstraints.maxWidth : childBox.width) * scale,
        maxHeight: (childConstraints.hasBoundedHeight ? childConstraints.maxHeight : childBox.height) * scale
      });
      childBox = this.child.layout(context, childConstraints);
      rotated = bounds();
    }
    const size = parent.constrain(rotated);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox,
        layoutDx: -rotated.x,
        layoutDy: -rotated.y
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
      y: (this.ignoreMargins ? 0 : box.y) + box.height - childBox.height
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
    this.color = normalizePaintColor(color);
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
  static spread(fn, start, end, method) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new RangeError("A spread function needs a finite increasing range");
    }
    const boundaries = [ start ];
    for (let boundary = Math.floor(start) + 1; boundary < end; boundary++) {
      if (boundaries.length >= 4096) {
        throw new RangeError("SVG gradient spread exceeds 4096 visible periods");
      }
      boundaries.push(boundary);
    }
    boundaries.push(end);
    const functions = [];
    const encode = [];
    for (let index = 1; index < boundaries.length; index++) {
      const segmentStart = boundaries[index - 1];
      const segmentEnd = boundaries[index];
      const cycle = Math.floor((segmentStart + segmentEnd) / 2);
      const phaseStart = segmentStart - cycle;
      const phaseEnd = segmentEnd - cycle;
      const reflected = method === "reflect" && Math.abs(cycle % 2) === 1;
      functions.push(fn);
      encode.push(reflected ? 1 - phaseStart : phaseStart, reflected ? 1 - phaseEnd : phaseEnd);
    }
    const scale = end - start;
    return new PdfDict([ [ "/FunctionType", new PdfNum(3) ], [ "/Domain", PdfArray.fromNum([ 0, 1 ]) ], [ "/Functions", new PdfArray(functions) ], [ "/Bounds", PdfArray.fromNum(boundaries.slice(1, -1).map(value => (value - start) / scale)) ], [ "/Encode", PdfArray.fromNum(encode) ] ]);
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

class DecorationGraphic {}

class DecorationImage extends DecorationGraphic {
  constructor({image, fit = "cover", alignment = "center", dpi = null}) {
    super();
    applyBoxFit$1(fit, {
      width: 1,
      height: 1
    }, {
      width: 1,
      height: 1
    });
    if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) {
      throw new RangeError("Decoration image DPI must be positive");
    }
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.dpi = dpi;
  }
  paint(context, box) {
    if (box.width <= 0 || box.height <= 0) return;
    const image = this.image.resolve({
      x: box.width,
      y: box.height
    }, this.dpi);
    const fitted = applyBoxFit$1(this.fit, {
      width: image.width,
      height: image.height
    }, {
      width: box.width,
      height: box.height
    });
    if (fitted.source.width <= 0 || fitted.source.height <= 0) return;
    const sourceOffset = inscribe(this.alignment, fitted.source.width, fitted.source.height, image.width, image.height);
    const destinationOffset = inscribe(this.alignment, fitted.destination.width, fitted.destination.height, box.width, box.height);
    const scaleX = fitted.destination.width / fitted.source.width;
    const scaleY = fitted.destination.height / fitted.source.height;
    const boxTop = context.canvas.pageHeight - box.y - box.height;
    const destinationX = box.x + destinationOffset.dx;
    const destinationTop = boxTop + destinationOffset.dy;
    const fullWidth = image.width * scaleX;
    const fullHeight = image.height * scaleY;
    const fullX = destinationX - sourceOffset.dx * scaleX;
    const fullTop = destinationTop - sourceOffset.dy * scaleY;
    context.canvas.saveContext();
    context.canvas.drawBox(box);
    context.canvas.clipPath();
    context.canvas.drawImage(image, fullX, context.canvas.toPdfY(fullTop + fullHeight), fullWidth, fullHeight);
    context.canvas.restoreContext();
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
    this.solid = colors.length === 1 ? normalizePaintColor(colors[0]) : null;
  }
  paintSolid(context, box) {
    if (this.solid === null) return false;
    context.canvas.setFillColor(this.solid);
    context.canvas.drawBox(box);
    context.canvas.fillPath();
    return true;
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
    if (this.paintSolid(context, box)) return;
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
    if (this.paintSolid(context, box)) return;
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
    this.color = normalizePaintColor(color);
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
  constructor({color = null, border = null, borderRadius = null, boxShadow = null, gradient = null, image = null, shape = "rectangle"} = {}) {
    this.color = color === null ? null : normalizePaintColor(color);
    this.border = normalizeBoxBorder(border);
    this.borderRadius = borderRadius === null ? null : borderRadius instanceof BorderRadiusGeometry ? borderRadius : BorderRadius.all(borderRadius);
    this.boxShadow = boxShadow === null ? [] : boxShadow.map(value => value instanceof BoxShadow ? value : new BoxShadow(value));
    this.gradient = gradient;
    this.image = image;
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
      if (this.image !== null) {
        context.canvas.saveContext();
        if (this.shape === "circle" || resolvedRadius !== null) {
          appendShape(context, x, y, width, height, this.shape, resolvedRadius);
          context.canvas.clipPath();
        }
        this.image.paint(context, box);
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

class Container extends SpanningWidget {
  get canSpan() {
    return this.height === null && this.child instanceof SpanningWidget && this.child.canSpan;
  }
  constructor({child = null, width = null, height = null, padding = 0, margin = 0, color = null, background = null, borderColor = null, borderWidth = 1, decoration = null, foregroundDecoration = null, alignment = null} = {}) {
    super();
    this.child = child;
    this.width = width == null ? null : Number(width);
    this.height = height == null ? null : Number(height);
    this.padding = normalizeInsets(padding);
    this.margin = normalizeInsets(margin);
    if (color != null && background != null) {
      throw new Error("Container cannot have both color and background");
    }
    const fill = color ?? background;
    this.background = fill == null ? null : normalizePaintColor(fill);
    this.borderColor = borderColor == null ? null : normalizePaintColor(borderColor);
    this.borderWidth = Number(borderWidth);
    this.decoration = normalizeBoxDecoration(decoration);
    this.foregroundDecoration = normalizeBoxDecoration(foregroundDecoration);
    this.alignment = alignment === null ? null : resolveBasicAlignment(alignment);
    if (this.background !== null && this.decoration !== null) {
      throw new Error("Container cannot have both a color and a decoration");
    }
  }
  initialSpanState() {
    return {
      childState: this.child instanceof SpanningWidget ? this.child.initialSpanState() : null
    };
  }
  finishLayout(parent, desired, childBox) {
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
    return this.finishLayout(parent, desired, childBox);
  }
  layoutSpan(context, constraints, state) {
    if (!(this.child instanceof SpanningWidget) || !this.canSpan) {
      return {
        box: this.layout(context, constraints),
        nextState: state,
        hasMore: false
      };
    }
    const parent = BoxConstraints.from(constraints);
    const outer = parent.deflate(this.margin);
    const fill = this.alignment !== null || this.child === null;
    const desired = outer.tighten({
      width: this.width ?? (fill && outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height ?? (fill && outer.hasBoundedHeight ? outer.maxHeight : null)
    });
    const inner = desired.deflate(this.padding);
    const fragment = this.child.layoutSpan(context, this.alignment === null ? inner : inner.loosen(), state.childState);
    return {
      box: this.finishLayout(parent, desired, fragment.box),
      nextState: {
        childState: fragment.nextState
      },
      hasMore: fragment.hasMore
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

class Flex extends SpanningWidget {
  get canSpan() {
    return this.direction === "vertical";
  }
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
  initialSpanState() {
    return {
      firstChild: 0
    };
  }
  layoutSpan(context, incoming, state) {
    if (this.direction === "horizontal" || state.firstChild >= this.children.length) {
      const box = this.layout(context, incoming);
      return {
        box,
        nextState: {
          firstChild: this.children.length
        },
        hasMore: false
      };
    }
    const outer = BoxConstraints.from(incoming);
    const constraints = outer.deflate(this.margin);
    const [, childMaxCross] = this.crossConstraints(constraints);
    const childMinCross = this.crossAxisAlignment === "stretch" && Number.isFinite(childMaxCross) ? childMaxCross : 0;
    const available = constraints.maxHeight;
    let allocated = 0;
    let lastChild = state.firstChild;
    for (let index = state.firstChild; index < this.children.length; index++) {
      const child = this.children[index];
      if (child instanceof Flexible && child.flex > 0) {
        lastChild = index + 1;
        continue;
      }
      const childBox = child.layout(context, axisConstraints(this.direction, 0, Infinity, childMinCross, childMaxCross));
      const next = allocated + (lastChild > state.firstChild ? this.gap : 0) + childBox.height;
      if (next > available && lastChild > state.firstChild) break;
      allocated = next;
      lastChild = index + 1;
      if (next > available) break;
    }
    if (lastChild === state.firstChild && state.firstChild < this.children.length) {
      lastChild++;
    }
    const fragment = this.layoutRange(context, incoming, state.firstChild, lastChild);
    const nextState = {
      firstChild: lastChild
    };
    return {
      box: fragment,
      nextState,
      hasMore: lastChild < this.children.length
    };
  }
  layout(context, incoming) {
    return this.layoutRange(context, incoming, 0, this.children.length);
  }
  layoutRange(context, incoming, firstChild, lastChild) {
    const count = lastChild - firstChild;
    const outer = BoxConstraints.from(incoming);
    const constraints = outer.deflate(this.margin);
    const horizontal = this.direction === "horizontal";
    const maxMain = horizontal ? constraints.maxWidth : constraints.maxHeight;
    const minMain = horizontal ? constraints.minWidth : constraints.minHeight;
    const maxCross = horizontal ? constraints.maxHeight : constraints.maxWidth;
    const minCross = horizontal ? constraints.minHeight : constraints.minWidth;
    const canFlex = Number.isFinite(maxMain);
    const baseGap = this.gap * Math.max(0, count - 1);
    const measured = new Array(count);
    let allocated = 0;
    let crossSize = 0;
    const measure = (index, childConstraints) => {
      const box = this.children[firstChild + index].layout(context, childConstraints);
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
      for (let index = 0; index < count; index++) {
        const extent = index === count - 1 ? available - used : available * weights[index] / total;
        used += extent;
        measure(index, axisConstraints(this.direction, extent, extent, childMinCross, childMaxCross));
      }
    } else {
      let totalFlex = 0;
      const flexible = [];
      const [childMinCross, childMaxCross] = this.crossConstraints(constraints);
      for (let index = 0; index < count; index++) {
        const child = this.children[firstChild + index];
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
        const child = this.children[firstChild + index];
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

class ListView extends StatelessWidget {
  constructor({direction = "vertical", reverse = false, spacing = 0, padding = null, children = [], itemBuilder = null, separatorBuilder = null, itemCount = undefined} = {}) {
    super();
    this.direction = direction;
    this.reverse = Boolean(reverse);
    this.spacing = spacing === null ? null : finiteNonNegative$1(Number(spacing), "spacing");
    this.padding = padding;
    this.children = itemBuilder === null ? children : null;
    this.itemBuilder = itemBuilder;
    this.separatorBuilder = separatorBuilder;
    this.itemCount = itemCount === undefined ? children.length : Math.trunc(Number(itemCount));
    if (this.itemCount < 0 || !Number.isFinite(this.itemCount)) {
      throw new RangeError("ListView.itemCount must be a finite non-negative integer");
    }
    if (this.children === null && this.itemBuilder === null) {
      throw new TypeError("ListView.builder requires itemBuilder");
    }
    if (this.spacing === null && this.separatorBuilder === null) {
      throw new TypeError("ListView.separated requires separatorBuilder");
    }
  }
  static builder(options) {
    return new ListView({
      ...options,
      children: [],
      separatorBuilder: null
    });
  }
  static separated(options) {
    return new ListView({
      ...options,
      children: [],
      spacing: null
    });
  }
  item(context, index) {
    return this.children === null ? this.itemBuilder(context, index) : this.children[index];
  }
  separator(context, index) {
    if (this.spacing === null) return this.separatorBuilder(context, index);
    return this.direction === "vertical" ? new SizedBox({
      height: this.spacing
    }) : new SizedBox({
      width: this.spacing
    });
  }
  build(context) {
    const children = [];
    const indexes = Array.from({
      length: this.itemCount
    }, (_, index) => index);
    if (this.reverse) indexes.reverse();
    for (let position = 0; position < indexes.length; position++) {
      const index = indexes[position];
      children.push(this.item(context, index));
      if (position < indexes.length - 1 && this.spacing !== 0) {
        children.push(this.separator(context, index));
      }
    }
    const list = new Flex({
      direction: this.direction,
      mainAxisAlignment: "start",
      mainAxisSize: "max",
      crossAxisAlignment: "center",
      verticalDirection: "down",
      children
    });
    return this.padding === null ? list : new Padding({
      padding: this.padding,
      child: list
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
    const nonPositionedConstraints = this.fit === "loose" ? constraints.loosen() : this.fit === "expand" ? new BoxConstraints({
      minWidth: constraints.hasBoundedWidth ? constraints.maxWidth : 0,
      maxWidth: constraints.maxWidth,
      minHeight: constraints.hasBoundedHeight ? constraints.maxHeight : 0,
      maxHeight: constraints.maxHeight
    }) : constraints;
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

class ChartValue {}

class Dataset {
  constructor({legend = null, color = null, borderColor = null, borderWidth = .5} = {}) {
    this.legend = legend === null || legend === undefined ? null : String(legend);
    this.color = color === null || color === undefined ? null : normalizePaintColor(color);
    this.borderColor = borderColor === null || borderColor === undefined ? null : normalizePaintColor(borderColor);
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

class PointChartValue extends ChartValue {
  constructor(x, y) {
    super();
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
    this.lineColor = lineColor === null ? null : normalizePaintColor(lineColor);
    this.drawSurface = Boolean(drawSurface);
    this.surfaceColor = surfaceColor === null ? null : normalizePaintColor(surfaceColor);
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

class PdfBorder {
  constructor({width = 1, style = "solid", dash = null} = {}) {
    if (!Number.isFinite(width) || width < 0) throw new RangeError("Annotation border width must be a finite non-negative number");
    if (![ "solid", "dashed", "beveled", "inset", "underlined" ].includes(style)) throw new TypeError("Unknown annotation border style");
    if (dash !== null && (dash.some(v => !Number.isFinite(v) || v < 0) || dash.length > 0 && dash.every(v => v === 0))) throw new RangeError("Invalid annotation dash pattern");
    this.width = width;
    this.style = style;
    this.dash = dash === null ? null : Object.freeze([ ...dash ]);
  }
  output() {
    const styles = {
      solid: "/S",
      dashed: "/D",
      beveled: "/B",
      inset: "/I",
      underlined: "/U"
    };
    const result = new PdfDict([ [ "/W", new PdfNum(this.width) ], [ "/S", new PdfName(styles[this.style]) ] ]);
    if (this.dash !== null) result.set("/D", PdfArray.fromNum(this.dash));
    return result;
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
  if (codePoint <= 255 && (codePoint & 224) !== 128) return codePoint;
  return CP1252[codePoint] ?? 63;
}

const WIN_ANSI_RUNES = Array.from({
  length: 256
}, (_, byte) => (byte & 224) === 128 ? 63 : byte);

for (const [rune, byte] of Object.entries(CP1252)) WIN_ANSI_RUNES[byte] = Number(rune);

function winAnsiRune(byte) {
  return WIN_ANSI_RUNES[byte] ?? 63;
}

function isWinAnsiRune(codePoint) {
  return winAnsiRune(toWinAnsiByte(codePoint)) === codePoint;
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

function fitsPdfDocEncoding(value) {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit < 32 ? unit !== 9 && unit !== 10 && unit !== 13 : unit > 126 && unit < 161 || unit === 173 || unit > 255) return false;
  }
  return true;
}

function pdfTextBytes(value) {
  if (fitsPdfDocEncoding(value)) return value;
  let bytes = "þÿ";
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    bytes += String.fromCharCode(unit >> 8, unit & 255);
  }
  return bytes;
}

function pdfUnicodeString(value) {
  let output = "feff";
  for (let index = 0; index < value.length; index++) {
    output += value.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `<${output}>`;
}

class PdfString extends PdfDataType {
  constructor(value) {
    super();
    this.value = value;
  }
  static fromDate(date) {
    if (!Number.isFinite(date.getTime())) {
      throw new RangeError("PDF date must be valid");
    }
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    const second = String(date.getUTCSeconds()).padStart(2, "0");
    return new PdfString(`D:${year}${month}${day}${hour}${minute}${second}Z`);
  }
  output(s) {
    s.putString(fitsPdfDocEncoding(this.value) ? pdfLiteral(this.value) : pdfUnicodeString(this.value));
  }
}

const widthDigits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function unpackWidths(packed) {
  const widths = [];
  for (let index = 0; index < packed.length; index += 2) {
    widths.push((widthDigits.indexOf(packed[index]) << 6 | widthDigits.indexOf(packed[index + 1])) / 1e3);
  }
  return Object.freeze(widths);
}

const helveticaWidths = unpackWidths("H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0EWEWFjIsIsN5KbC/FNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsEWEWJIJIJIIsP3KbKbLSLSKbJjMKLSEWH0KbIsNBLSMKKbMKLSKbJjLSKbOwKbKbJjEWEWEVHVIsFNIsIsH0IsIsEWIsIsDeDeH0DeNBIsIsIsIsFNH0EWIsH0LSH0H0H0FOEEFOJIH0KPH0DeEWFNPoIsIsFNPoKbD6PoH0JjH0H0DeDdFNFNFeIsPoFNPoH0D6OqH0H0KbEWEWIsIsIsIsEEIsFNLhFyHAJIFNLhFNJeJIFeFeFNIsIZEWFNFeFtHANlNlNvIsKbKbKbKbKbKbPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKaJjIsIsIsIsIsIsOAH0IsIsIsIsD7D7D7D7IsIsIsIsIsIsIsJIJjIsIsIsIsH0IrH0");

const helveticaBoldWidths = unpackWidths("EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFNHaIsIsN5LSDuFNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsFNFNJIJIJIJjPPLSLSLSLSKbJjMKLSEWIsLSJjNBLSMKKbMKLSKbJjLSKbOwKbKbJjFNEWFNJIIsFNIsJjIsJjIsFNJjJjEWEWIsEWN5JjJjJjJjGFIsFNJjIsMKIsIsH0GFEYGFJIFeIsFeEWIsH0PoIsIsFNPoKbFNPoFeJjFeFeEWEWH0H0FeIsPoFNPoIsFNOwFeH0KbEWFNIsIsIsIsEYIsFNLhFyIsJIFNLhFNGQJIFNFNFNJjIsEWFNFNFtIsNCNCNCJjLSLSLSLSLSLSPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5IsIsIsIsIsEWEWEWEWJjJjJjJjJjJjJjJIJjJjJjJjJjIsJjIs");

const helveticaBoldObliqueWidths = unpackWidths("EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFNHaIsIsN5LSDuFNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsFNFNJIJIJIJjPPLSLSLSLSKbJjMKLSEWIsLSJjNBLSMKKbMKLSKbJjLSKbOwKbKbJjFNEWFNJIIsFNIsJjIsJjIsFNJjJjEWEWIsEWN5JjJjJjJjGFIsFNJjIsMKIsIsH0GFEYGFJIFeIsFeEWIsH0PoIsIsFNPoKbFNPoFeJjFeFeEWEWH0H0FeIsPoFNPoIsFNOwFeH0KbEWFNIsIsIsIsEYIsFNLhFyIsJIFNLhFNGQJIFNFNFNJjIsEWFNFNFtIsNCNCNCJjLSLSLSLSLSLSPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5IsIsIsIsIsEWEWEWEWJjJjJjJjJjJjJjJIJjJjJjJjJjIsJjIs");

const helveticaObliqueWidths = unpackWidths("EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFjIsIsN5KbC/FNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsEWEWJIJIJIIsP3KbKbLSLSKbJjMKLSEWH0KbIsNBLSMKKbMKLSKbJjLSKbOwKbKbJjEWEWEWHVIsFNIsIsH0IsIsEWIsIsDeDeH0DeNBIsIsIsIsFNH0EWIsH0LSH0H0H0FOEEFOJIFeIsFeDeIsFNPoIsIsFNPoKbFNPoFeJjFeFeDeDeFNFNFeIsPoFNPoH0FNOwFeH0KbEWFNIsIsIsIsEEIsFNLhFyIsJIFNLhFNGQJIFNFNFNIsIZEWFNFNFtIsNCNCNCJjKbKbKbKbKbKbPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5H0IsIsIsIsEWEWEWEWIsIsIsIsIsIsIsJIJjIsIsIsIsH0IsH0");

const timesWidths = unpackWidths("D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNGYH0H0NBMKC0FNFNH0I0D6FND6EWH0H0H0H0H0H0H0H0H0H0EWEWI0I0I0G8OZLSKbKbLSJjIsLSLSFNGFLSJjN5LSLSIsLSKbIsJjLSLSOwLSLSJjFNEWFNHVH0FNG8H0G8H0G8FNH0H0EWEWH0EWMKH0H0H0H0FNGFEWH0H0LSH0H0G8HgDIHgIdFeH0FeFNH0G8PoH0H0FNPoIsFNN5FeJjFeFeFNFNG8G8FeH0PoFNPUGFFNLSFeG8LSD6FNH0H0H0H0DIH0FNL4EUH0I0FNL4FNGQI0EsEsFNH0HFD6FNEsE2H0LuLuLuG8LSLSLSLSLSLSN5KbJjJjJjJjFNFNFNFNLSLSLSLSLSLSLSI0LSLSLSLSLSLSIsH0G8G8G8G8G8G8KbG8G8G8G8G8EWEWEWEWH0H0H0H0H0H0H0I0H0H0H0H0H0H0H0H0");

const timesBoldWidths = unpackWidths("D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNIrH0H0PoNBEWFNFNH0I6D6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNI6I6I6H0OiLSKbLSLSKbJjMKMKGFH0MKKbOwLSMKJjMKLSIsKbLSLSPoLSLSKbFNEWFNJFH0FNH0IsG8IsG8FNH0IsEWFNIsEWNBIsH0IsIsG8GFFNIsH0LSH0H0G8GKDcGKIIFeH0FeFNH0H0PoH0H0FNPoIsFNPoFeKbFeFeFNFNH0H0FeH0PoFNPoGFFNLSFeG8LSD6FNH0H0H0H0DcH0FNLrEsH0I6FNLrFNGQI6EsEsFNIsIcD6FNEsFKH0LuLuLuH0LSLSLSLSLSLSPoLSKbKbKbKbGFGFGFGFLSLSMKMKMKMKMKI6MKLSLSLSLSLSJjIsH0H0H0H0H0H0LSG8G8G8G8G8EWEWEWEWH0IsH0H0H0H0H0I6H0IsIsIsIsH0IsH0");

const timesBoldItalicWidths = unpackWidths("D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6GFIrH0H0NBMKEWFNFNH0I6D6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNI6I6I6H0NAKbKbKbLSKbKbLSMKGFH0KbJjN5LSLSJjLSKbIsJjLSKbN5KbJjJjFNEWFNI6H0FNH0H0G8H0G8FNH0IsEWEWH0EWMKIsH0H0H0GFGFEWIsG8KbH0G8GFFcDcFcI6FeH0FeFNH0H0PoH0H0FNPoIsFNOwFeJjFeFeFNFNH0H0FeH0PoFNPoGFFNLSFeGFJjD6GFH0H0H0H0DcH0FNLrEKH0JeFNLrFNGQI6EsEsFNJAH0D6FNEsEsH0LuLuLuH0KbKbKbKbKbKbOwKbKbKbKbKbGFGFGFGFLSLSLSLSLSLSLSI6LSLSLSLSLSJjJjH0H0H0H0H0H0H0LSG8G8G8G8G8EWEWEWEWH0IsH0H0H0H0H0I6H0IsIsIsIsG8H0G8");

const timesItalicWidths = unpackWidths("D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNGkH0H0NBMKDWFNFNH0KjD6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNKjKjKjH0OYJjJjKbLSJjJjLSLSFNG8KbIsNBKbLSJjLSJjH0IsLSJjNBJjIsIsGFEWGFGmH0FNH0H0G8H0G8EWH0H0EWEWG8EWLSH0H0H0H0GFGFEWH0G8KbG8G8GFGQETGQIdFeH0FeFNH0IsN5H0H0FNPoH0FNOwFeIsFeFeFNFNIsIsFeH0N5FNPUGFFNKbFeGFIsD6GFH0H0H0H0ETH0FNL4EUH0KjFNL4FNGQKjEsEsFNH0ILD6FNEsE2H0LuLuLuH0JjJjJjJjJjJjN5KbJjJjJjJjFNFNFNFNLSKbLSLSLSLSLSKjLSLSLSLSLSIsJjH0H0H0H0H0H0H0KbG8G8G8G8G8EWEWEWEWH0H0H0H0H0H0H0KjH0H0H0H0H0G8H0G8");

const symbolWidths = unpackWidths("JLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLD6FNLJH0IlNBMKG3FNFNH0IlD6IlD6EWH0H0H0H0H0H0H0H0H0H0EWEWIlIlIlG8IlLSKbLSJkJjL7JbLSFNJ3LSKuN5LSLSMALlIsJQJjKyG3MAKFMbJjFNNfFNKSH0H0J3IlIlHuG3IJGbJbFJJbIlIlJAIJIlIlIJIlJbG3JALJKuHtKuHuHgDIHgIlJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLLuJsD3IlCnLJH0LxLxLxLxQSPbJbPbJbGQIlGbIlIlLJHuHMIlIlIlIlPoJbPoKSM3KuMbPbMAMAM3MAMALJLJLJLJLJLJLJMALJMWMWN6M3IlD6LJJbJbQSPbJbPbJbHuFJMWMWMSLJGAGAGAGAGAGAHuHuHuHuJLFJESKuKuKuGAGAGAGAGAGAHuHuHuJL");

const zapfDingbatsWidths = unpackWidths("LqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqEWPOPBPOPULPMVMWMXKyPAOrIlNXOPOlOPOxPOLzNOL6L5I7KlL7L4L3LyHuIoIZJBK0MSMUMUMWMZMaMwM3MVNJM3NBMwM/ObLoLTLtMWMYK3MIMAMYL3LDLEKqK9M6MvMVMVLDKvK4KxMSMTLJMXMRMXNpL5L6L6L3L3N8N8MUMQG2CKEVGfGIGIKcKcLqGGGGE9E9EUEUH9H9GaGaDqDqFOFOLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLcIgIgOOKbL4L4MIJTK2JyMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUN+NGP4HKLsOcLsOWOfOgOgNCNpM8OcOcOVOiOjHPNzNENENjNjK4K4NqLqNqL4OyMDNhMDN4PHN4M/NpOfPKOWLq");

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
  isRuneSupported(rune) {
    return isWinAnsiRune(rune);
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

class PdfSoftMaskReference extends PdfDataType {
  constructor(mask) {
    super();
    this.mask = mask;
  }
  output(_stream) {
    throw new Error("A PDF soft mask must be resolved by PdfDocument before output");
  }
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

function compositeTextOperand(font, text, wordSpacing, fontSize) {
  const parts = [];
  let run = "";
  const adjustment = formatNumber(-wordSpacing * 1e3 / fontSize);
  for (const character of String(text)) {
    run += character;
    if (character === " ") {
      parts.push(font.encodeText(run), adjustment);
      run = "";
    }
  }
  if (run !== "" || parts.length === 0) {
    parts.push(font.encodeText(run));
  }
  return `[${parts.join(" ")}]`;
}

class PdfCanvas {
  constructor(pageHeight, {colorAlpha = true} = {}) {
    this.content = new PdfStream;
    this.formNames = new Map;
    this.commandCount = 0;
    this.fontNames = new Map;
    this.stateNames = new Map;
    this.stateDicts = new Map;
    this.patternNames = new Map;
    this.patternDicts = new Map;
    this.shadingNames = new Map;
    this.shadingDicts = new Map;
    this.imageNames = new Map;
    this.softMaskNames = new Map;
    this.pageAnnotations = [];
    this.currentSoftMask = null;
    this.softMaskStack = [];
    this.currentTransform = identityMatrix;
    this.transformStack = [];
    this.currentLetterSpacing = 0;
    this.currentWordSpacing = 0;
    this.textSpacingStack = [];
    this.textSpacingDirty = false;
    this.alphas = [ 1, 1, 1, 1 ];
    this.alphaStack = [];
    this.pageHeight = pageHeight;
    this.colorAlpha = colorAlpha;
  }
  push(command) {
    if (this.commandCount > 0) {
      this.content.putByte(10);
    }
    this.content.putString(command);
    this.commandCount++;
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
  get shadings() {
    return this.shadingDicts;
  }
  get forms() {
    return this.formNames;
  }
  drawForm(form, x, y, width = form.width, height = form.height) {
    if (![ x, y, width, height ].every(Number.isFinite) || width <= 0 || height <= 0) throw new RangeError("Invalid form placement");
    let name = this.formNames.get(form);
    if (name === undefined) {
      name = `/Xf${this.formNames.size + 1}`;
      this.formNames.set(form, name);
    }
    this.push(`q ${formatNumber(width / form.width)} 0 0 ${formatNumber(height / form.height)} ${formatNumber(x)} ${formatNumber(y)} cm ${name} Do Q`);
  }
  get images() {
    return this.imageNames;
  }
  get annotations() {
    return this.pageAnnotations;
  }
  addAnnotation(annotation) {
    this.pageAnnotations.push(annotation);
  }
  addUrlLink(destination, x, top, width, height, border) {
    this.addLink("url", destination, x, top, width, height, border);
  }
  addNamedLink(destination, x, top, width, height, border) {
    this.addLink("destination", destination, x, top, width, height, border);
  }
  addLink(kind, destination, x, top, width, height, border) {
    if (width <= 0 || height <= 0) return;
    const points = [ this.transformWidgetPoint(x, top), this.transformWidgetPoint(x + width, top), this.transformWidgetPoint(x, top + height), this.transformWidgetPoint(x + width, top + height) ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    this.pageAnnotations.push({
      kind,
      destination,
      border,
      rect: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    });
  }
  addFormField(field, x, top, width, height) {
    if (width <= 0 || height <= 0) return;
    const points = [ this.transformWidgetPoint(x, top), this.transformWidgetPoint(x + width, top), this.transformWidgetPoint(x, top + height), this.transformWidgetPoint(x + width, top + height) ];
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    this.pageAnnotations.push({
      ...field,
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
    this.softMaskStack.push(this.currentSoftMask);
    this.alphaStack.push(this.alphas.slice());
  }
  restoreContext() {
    const restored = this.transformStack.pop();
    const spacing = this.textSpacingStack.pop();
    const softMask = this.softMaskStack.pop();
    const alphas = this.alphaStack.pop();
    if (restored === undefined) {
      return;
    }
    this.push("Q");
    this.currentTransform = restored;
    this.alphas = alphas;
    if (spacing !== undefined) {
      this.currentLetterSpacing = spacing[0];
      this.currentWordSpacing = spacing[1];
    }
    this.currentSoftMask = softMask ?? null;
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
    const alphas = this.alphas;
    const fill = state.fillOpacity === null ? null : alphas[0] * state.fillOpacity;
    const stroke = state.strokeOpacity === null ? null : alphas[1] * state.strokeOpacity;
    const name = this.emitGraphicState(fill === state.fillOpacity && stroke === state.strokeOpacity ? state : new PdfGraphicState({
      fillOpacity: fill,
      strokeOpacity: stroke,
      blendMode: state.blendMode
    }));
    if (fill !== null) alphas[0] = alphas[2] = fill;
    if (stroke !== null) alphas[1] = alphas[3] = stroke;
    return name;
  }
  setColorAlpha(color, stroke) {
    if (!this.colorAlpha) return;
    const alphas = this.alphas;
    const index = stroke ? 1 : 0;
    const alpha = alphas[index] * (color instanceof PdfColor ? color.alpha : 1);
    if (Math.abs(alpha - alphas[index + 2]) < 1e-9) return;
    this.emitGraphicState(new PdfGraphicState(stroke ? {
      strokeOpacity: alpha
    } : {
      fillOpacity: alpha
    }));
    alphas[index + 2] = alpha;
  }
  emitGraphicState(state) {
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
  setSoftMask(mask) {
    this.currentSoftMask = mask;
    const existing = this.softMaskNames.get(mask);
    if (existing !== undefined) {
      this.push(`${existing} gs`);
      return existing;
    }
    const name = `/g${this.stateDicts.size + 1}`;
    const state = new PdfDict;
    state.set("/SMask", new PdfSoftMaskReference(mask));
    this.softMaskNames.set(mask, name);
    this.stateDicts.set(name, state);
    this.push(`${name} gs`);
    return name;
  }
  getSoftMask() {
    return this.currentSoftMask;
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
  drawShading(shading) {
    const dict = shading.output();
    const key = dict.toString();
    let name = this.shadingNames.get(key);
    if (name === undefined) {
      name = `/s${this.shadingDicts.size + 1}`;
      this.shadingNames.set(key, name);
      this.shadingDicts.set(name, dict);
    }
    this.push(`${name} sh`);
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
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      this.endToCenterParameters(cos * x1 + sin * y1, cos * y1 - sin * x1, cos * x2 + sin * y2, cos * y2 - sin * x2, large, sweep, rx, ry, [ cos, sin, -sin, cos, 0, 0 ]);
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
  endToCenterParameters(x1, y1, x2, y2, large, sweep, rx, ry, rotation) {
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const x1d = .5 * (x1 - x2);
    const y1d = .5 * (y1 - y2);
    let r = x1d * x1d / (rx * rx) + y1d * y1d / (ry * ry);
    if (r > 1) {
      const rr = Math.sqrt(r);
      rx *= rr;
      ry *= rr;
      r = 0;
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
    this.bezierArcFromCentre(cx, cy, rx, ry, -theta, -dTheta, rotation);
  }
  bezierArcFromCentre(cx, cy, rx, ry, startAngle, extent, rotation) {
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
      const points = [ cx + rx * (c0 - kappa * s0), cy - ry * (s0 + kappa * c0), cx + rx * (c1 + kappa * s1), cy - ry * (s1 - kappa * c1), cx + rx * c1, cy - ry * s1 ];
      if (rotation !== undefined) {
        for (let j = 0; j < 6; j += 2) {
          const point = transformPoint(rotation, points[j], points[j + 1]);
          points[j] = point.x;
          points[j + 1] = point.y;
        }
      }
      this.push(`${operands(points)} c`);
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
    this.setColorAlpha(color, false);
  }
  setStrokeColor(color) {
    this.push(colorOperator(color, true));
    this.setColorAlpha(color, true);
  }
  setColor(color) {
    this.setFillColor(color);
    this.setStrokeColor(color);
  }
  fillRect(x, top, width, height, color) {
    const bottom = this.pageHeight - top - height;
    this.setColorAlpha(color, false);
    this.push(`${colorOperator(color)} ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re f`);
  }
  strokeRect(x, top, width, height, color, lineWidth = 1) {
    const bottom = this.pageHeight - top - height;
    this.setColorAlpha(color, true);
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`);
  }
  text(text, x, baselineFromTop, style) {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const font = style.font ?? defaultPdfFont;
    const letterSpacing = style.letterSpacing ?? 0;
    const wordSpacing = style.wordSpacing ?? 0;
    const operatorWordSpacing = font.isComposite === true ? 0 : wordSpacing;
    const spacingOperators = [];
    if (letterSpacing === 0 && operatorWordSpacing === 0 && this.textSpacingDirty) {
      spacingOperators.push("0", "Tc", "0", "Tw");
      this.currentLetterSpacing = 0;
      this.currentWordSpacing = 0;
      this.textSpacingDirty = false;
    } else {
      if (letterSpacing !== this.currentLetterSpacing) {
        spacingOperators.push(formatNumber(letterSpacing), "Tc");
        this.currentLetterSpacing = letterSpacing;
      }
      if (operatorWordSpacing !== this.currentWordSpacing) {
        spacingOperators.push(formatNumber(operatorWordSpacing), "Tw");
        this.currentWordSpacing = operatorWordSpacing;
      }
      if (letterSpacing !== 0 || operatorWordSpacing !== 0) {
        this.textSpacingDirty = true;
      }
    }
    const usesTextArray = font.isComposite === true && wordSpacing !== 0;
    const textOperand = usesTextArray ? compositeTextOperand(font, text, wordSpacing, fontSize) : font.encodeText(text);
    this.setColorAlpha(style.color, false);
    const command = [ "BT", this.addFont(font), formatNumber(fontSize), "Tf", colorOperator(style.color), ...spacingOperators, "1 0 0 1", formatNumber(x), formatNumber(baseline), "Tm", textOperand, usesTextArray ? "TJ" : "Tj", "ET" ].join(" ");
    this.push(command);
  }
  drawString(font, fontSize, text, x, y, renderingMode = 0) {
    const mode = renderingMode === 0 ? [] : [ String(renderingMode), "Tr" ];
    this.push([ "BT", this.addFont(font), formatNumber(fontSize), "Tf", ...mode, "1 0 0 -1", formatNumber(x), formatNumber(y), "Tm", font.encodeText(text), "Tj", "ET" ].join(" "));
  }
  line(x1, top1, x2, top2, color = "#000000", lineWidth = 1) {
    const y1 = this.pageHeight - top1;
    const y2 = this.pageHeight - top2;
    this.setColorAlpha(color, true);
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
  }
  circle(cx, topCenter, radius, {fill = null, stroke = null, lineWidth = 1} = {}) {
    const cy = this.pageHeight - topCenter;
    const k = .5522847498;
    const ox = radius * k;
    const oy = radius * k;
    const path = [ `${formatNumber(cx + radius)} ${formatNumber(cy)} m`, `${formatNumber(cx + radius)} ${formatNumber(cy + oy)} ${formatNumber(cx + ox)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`, `${formatNumber(cx - ox)} ${formatNumber(cy + radius)} ${formatNumber(cx - radius)} ${formatNumber(cy + oy)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`, `${formatNumber(cx - radius)} ${formatNumber(cy - oy)} ${formatNumber(cx - ox)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`, `${formatNumber(cx + ox)} ${formatNumber(cy - radius)} ${formatNumber(cx + radius)} ${formatNumber(cy - oy)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c` ].join(" ");
    if (fill) this.setColorAlpha(fill, false);
    if (stroke || !fill) this.setColorAlpha(stroke, true);
    if (fill && stroke) {
      this.push(`${colorOperator(fill)} ${colorOperator(stroke, true)} ${formatNumber(lineWidth)} w ${path} B`);
    } else if (fill) {
      this.push(`${colorOperator(fill)} ${path} f`);
    } else {
      this.push(`${colorOperator(stroke ?? "#000000", true)} ${formatNumber(lineWidth)} w ${path} S`);
    }
  }
  output() {
    const bytes = this.content.view();
    let result = "";
    const chunkSize = 8192;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `${result}\n`;
  }
  outputBytes() {
    const bytes = this.content.view();
    const result = new Uint8Array(bytes.length + 1);
    result.set(bytes);
    result[bytes.length] = 10;
    return result;
  }
  takeOutputBytes() {
    return this.content.take(10);
  }
}

class PdfFormXObject {
  constructor({width, height, paint}) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError("Form dimensions must be finite and positive");
    const canvas = new PdfCanvas(height);
    paint(canvas);
    if (canvas.annotations.length > 0) throw new TypeError("Reusable forms cannot own page annotations");
    this.width = width;
    this.height = height;
    this.appearance = {
      width,
      height,
      content: canvas.output(),
      fonts: new Map(canvas.fonts),
      images: new Map(canvas.images),
      graphicStates: new Map(canvas.graphicStates),
      patterns: new Map(canvas.patterns),
      shadings: new Map(canvas.shadings),
      forms: new Map(canvas.forms)
    };
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
          color: normalizePaintColor(color),
          font: font ?? context.document.font
        });
      }
    };
    this.draw(api);
  }
}

function constrainedCanvas(constraints) {
  const parent = BoxConstraints.from(constraints);
  return {
    width: parent.hasBoundedWidth ? parent.maxWidth : parent.minWidth,
    height: parent.hasBoundedHeight ? parent.maxHeight : parent.minHeight
  };
}

function validatedStrokeWidth(value) {
  const width = Number(value);
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError("strokeWidth must be a finite non-negative number");
  }
  return width;
}

function paintPath(context, fillColor, strokeColor, strokeWidth) {
  if (fillColor !== null) context.canvas.setFillColor(fillColor);
  if (strokeColor !== null) context.canvas.setStrokeColor(strokeColor);
  context.canvas.setLineWidth(strokeWidth);
  if (fillColor !== null && strokeColor !== null) context.canvas.fillAndStrokePath(); else if (strokeColor !== null) context.canvas.strokePath(); else context.canvas.fillPath();
}

class PaintedShape extends Widget {
  constructor({fillColor = null, strokeColor = null, strokeWidth = 1} = {}) {
    super();
    this.fillColor = fillColor;
    this.strokeColor = strokeColor;
    this.strokeWidth = validatedStrokeWidth(strokeWidth);
  }
  layout(_context, constraints) {
    const size = constrainedCanvas(constraints);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
}

class Circle extends PaintedShape {
  paint(context, box) {
    context.canvas.saveContext();
    context.canvas.drawEllipse(box.x + box.width / 2, context.canvas.toPdfY(box.y + box.height / 2), box.width / 2, box.height / 2);
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

class Rectangle extends PaintedShape {
  paint(context, box) {
    context.canvas.saveContext();
    context.canvas.drawRect(box.x, context.canvas.toPdfY(box.y + box.height), box.width, box.height);
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

class Polygon extends PaintedShape {
  constructor({points, close = true, ...options}) {
    super(options);
    this.points = points;
    this.close = Boolean(close);
  }
  paint(context, box) {
    if (this.points.length < (this.close ? 3 : 2)) return;
    context.canvas.saveContext();
    const first = this.points[0];
    context.canvas.moveTo(box.x + first.x, context.canvas.toPdfY(box.y + first.y));
    for (let index = 1; index < this.points.length; index++) {
      const point = this.points[index];
      context.canvas.lineTo(box.x + point.x, context.canvas.toPdfY(box.y + point.y));
    }
    if (this.close) context.canvas.closePath();
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

class InkList extends Widget {
  constructor({points, strokeColor = null, strokeWidth = 1}) {
    super();
    this.points = points;
    this.strokeColor = strokeColor;
    this.strokeWidth = validatedStrokeWidth(strokeWidth);
  }
  layout(_context, constraints) {
    const size = constrainedCanvas(constraints);
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    context.canvas.saveContext();
    if (this.strokeColor !== null) context.canvas.setStrokeColor(this.strokeColor);
    context.canvas.setLineWidth(this.strokeWidth);
    for (const line of this.points) {
      const first = line[0];
      if (first === undefined) continue;
      context.canvas.moveTo(box.x + first.x, context.canvas.toPdfY(box.y + first.y));
      for (const point of line) {
        context.canvas.lineTo(box.x + point.x, context.canvas.toPdfY(box.y + point.y));
      }
    }
    context.canvas.strokePath();
    context.canvas.restoreContext();
  }
}

class AnnotationBuilder {}

class AnnotationLink extends AnnotationBuilder {
  constructor(destination, {border} = {}) {
    super();
    this.border = border === undefined ? undefined : new PdfBorder(border);
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError("Annotation destination cannot be empty");
  }
  build(context, rect) {
    context.canvas.addNamedLink(this.destination, rect.x, rect.y, rect.width, rect.height, this.border);
  }
}

class AnnotationUrl extends AnnotationBuilder {
  constructor(destination, {border} = {}) {
    super();
    this.border = border === undefined ? undefined : new PdfBorder(border);
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError("Annotation URL cannot be empty");
  }
  build(context, rect) {
    context.canvas.addUrlLink(this.destination, rect.x, rect.y, rect.width, rect.height, this.border);
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

class GeometricAnnotationBuilder extends AnnotationBuilder {
  constructor(shape, {color = null, interiorColor = null, border = null, author = null, date = null, subject = null, content = null} = {}) {
    super();
    this.shape = shape;
    this.color = color === null ? null : normalizePaintColor(color);
    this.interiorColor = interiorColor === null ? null : normalizePaintColor(interiorColor);
    this.border = new PdfBorder(border ?? {});
    this.borderWidth = this.border.width;
    if (!Number.isFinite(this.borderWidth) || this.borderWidth < 0) {
      throw new RangeError("Annotation border width must be a finite non-negative number");
    }
    this.author = author;
    this.date = date;
    this.subject = subject;
    this.content = content;
  }
  base(context, rect) {
    const corners = [ context.canvas.transformWidgetPoint(rect.x, rect.y), context.canvas.transformWidgetPoint(rect.x + rect.width, rect.y), context.canvas.transformWidgetPoint(rect.x, rect.y + rect.height), context.canvas.transformWidgetPoint(rect.x + rect.width, rect.y + rect.height) ];
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    return {
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      color: this.color,
      interiorColor: this.interiorColor,
      borderWidth: this.borderWidth,
      border: this.border,
      author: this.author,
      subject: this.subject,
      content: this.content,
      date: this.date === null ? null : `D:${this.date.toISOString().replace(/[-:T]/gu, "").slice(0, 14)}Z`
    };
  }
}

class AnnotationSquare extends GeometricAnnotationBuilder {
  constructor(options = {}) {
    super("square", options);
  }
  build(context, rect) {
    context.canvas.addAnnotation({
      kind: "geometric",
      shape: this.shape,
      ...this.base(context, rect)
    });
  }
}

class AnnotationCircle extends GeometricAnnotationBuilder {
  constructor(options = {}) {
    super("circle", options);
  }
  build(context, rect) {
    context.canvas.addAnnotation({
      kind: "geometric",
      shape: this.shape,
      ...this.base(context, rect)
    });
  }
}

class AnnotationPolygon extends GeometricAnnotationBuilder {
  constructor({points, ...options}, shape = "polygon") {
    super(shape, options);
    if (points.length === 0) throw new RangeError("A point annotation needs at least one point");
    this.points = points;
  }
  build(context, rect) {
    const points = this.points.map(point => context.canvas.transformWidgetPoint(rect.x + point.x, rect.y + point.y));
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    context.canvas.addAnnotation({
      kind: "geometric",
      shape: this.shape,
      ...this.base(context, rect),
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      points
    });
  }
}

class AnnotationInk extends GeometricAnnotationBuilder {
  constructor({points, ...options}) {
    super("ink", options);
    if (points.flat().length === 0) throw new RangeError("An ink annotation needs at least one point");
    this.points = points;
  }
  build(context, rect) {
    const inkList = this.points.map(line => line.map(point => context.canvas.transformWidgetPoint(rect.x + point.x, rect.y + point.y)));
    const allPoints = inkList.flat();
    const xs = allPoints.map(point => point.x);
    const ys = allPoints.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    context.canvas.addAnnotation({
      kind: "geometric",
      shape: this.shape,
      ...this.base(context, rect),
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      inkList
    });
  }
}

class SquareAnnotation extends Annotation {
  constructor({child = null, color = null, interiorColor = null, border = null, ...options} = {}) {
    super({
      child: child ?? new Rectangle({
        fillColor: interiorColor,
        strokeColor: color,
        strokeWidth: border?.width ?? 1
      }),
      builder: new AnnotationSquare({
        color,
        interiorColor,
        border,
        ...options
      })
    });
  }
}

class CircleAnnotation extends Annotation {
  constructor({child = null, color = null, interiorColor = null, border = null, ...options} = {}) {
    super({
      child: child ?? new Circle({
        fillColor: interiorColor,
        strokeColor: color,
        strokeWidth: border?.width ?? 1
      }),
      builder: new AnnotationCircle({
        color,
        interiorColor,
        border,
        ...options
      })
    });
  }
}

class PolygonAnnotation extends Annotation {
  constructor({points, child = null, color = null, interiorColor = null, border = null, ...options}) {
    super({
      child: child ?? new Polygon({
        points,
        fillColor: interiorColor,
        strokeColor: color,
        strokeWidth: border?.width ?? 1
      }),
      builder: new AnnotationPolygon({
        points,
        color,
        interiorColor,
        border,
        ...options
      })
    });
  }
}

class PolyLineAnnotation extends Annotation {
  constructor({points, color = null, border = null, ...options}) {
    super({
      child: new Polygon({
        points,
        close: false,
        strokeColor: color,
        strokeWidth: border?.width ?? 1
      }),
      builder: new AnnotationPolygon({
        points,
        color,
        border,
        ...options
      }, "polyline")
    });
  }
}

class InkAnnotation extends Annotation {
  constructor({points, child = null, color = null, border = null, ...options}) {
    super({
      child: child ?? new InkList({
        points,
        strokeColor: color,
        strokeWidth: border?.width ?? 1
      }),
      builder: new AnnotationInk({
        points,
        color,
        border,
        ...options
      })
    });
  }
}

class Outline extends Anchor {
  constructor({title, level = 0, color = null, style = "normal", ...anchor}) {
    super({
      ...anchor,
      setX: true
    });
    if (!Number.isInteger(level) || level < 0) throw new RangeError("Outline.level must be a non-negative integer");
    this.title = String(title);
    this.level = level;
    this.color = color === null ? null : normalizePaintColor(color);
    this.style = style;
  }
  paint(context, box) {
    super.paint(context, box);
    context.document.registerOutline({
      title: this.title,
      level: this.level,
      pageNumber: context.pageNumber,
      y: context.canvas.transformWidgetPoint(box.x, box.y).y,
      anchor: this.name,
      color: this.color === null ? null : normalizeColor(this.color),
      style: this.style
    });
  }
}

class AnnotationText extends GeometricAnnotationBuilder {
  constructor(options) {
    super("square", options);
    this.open = options.open ?? false;
    this.icon = options.icon ?? "Note";
  }
  build(context, rect) {
    context.canvas.addAnnotation({
      ...this.base(context, rect),
      kind: "text",
      content: this.content ?? "",
      open: this.open,
      icon: this.icon
    });
  }
}

class TextAnnotation extends Annotation {
  constructor({child, ...options}) {
    super({
      child,
      builder: new AnnotationText(options)
    });
  }
}

const CM = 72 / 2.54;

const MM = 72 / 25.4;

function paper(width, height, margin) {
  return Object.freeze({
    width,
    height,
    marginTop: margin,
    marginRight: margin,
    marginBottom: margin,
    marginLeft: margin
  });
}

const A4 = paper(595.28, 841.89, 2 * CM);

const PageFormat = Object.freeze({
  A3: paper(29.7 * CM, 42 * CM, 2 * CM),
  A4,
  A5: paper(14.8 * CM, 21 * CM, 2 * CM),
  A6: paper(105 * MM, 148 * MM, CM),
  LETTER: paper(612, 792, 72),
  LEGAL: paper(612, 1008, 72),
  ROLL57: paper(57 * MM, Infinity, 5 * MM),
  ROLL80: paper(80 * MM, Infinity, 5 * MM),
  UNDEFINED: paper(Infinity, Infinity, 0),
  STANDARD: A4
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
  pica: 12,
  dp: 72 / 150
});

class PdfPageFormat {
  constructor(width, height, options = {}) {
    if (!(width > 0) || !(height > 0)) throw new RangeError("Page dimensions must be positive");
    this.width = width;
    this.height = height;
    this.marginTop = options.marginAll ?? options.marginTop ?? 0;
    this.marginRight = options.marginAll ?? options.marginRight ?? 0;
    this.marginBottom = options.marginAll ?? options.marginBottom ?? 0;
    this.marginLeft = options.marginAll ?? options.marginLeft ?? 0;
  }
  copyWith(values = {}) {
    return new PdfPageFormat(values.width ?? this.width, values.height ?? this.height, {
      marginTop: values.marginTop ?? this.marginTop,
      marginRight: values.marginRight ?? this.marginRight,
      marginBottom: values.marginBottom ?? this.marginBottom,
      marginLeft: values.marginLeft ?? this.marginLeft
    });
  }
  get dimension() {
    return {
      x: this.width,
      y: this.height
    };
  }
  get availableWidth() {
    return this.width - this.marginLeft - this.marginRight;
  }
  get availableHeight() {
    return this.height - this.marginTop - this.marginBottom;
  }
  get availableDimension() {
    return {
      x: this.availableWidth,
      y: this.availableHeight
    };
  }
  get landscape() {
    return this.width >= this.height ? this : this.copyWith({
      width: this.height,
      height: this.width
    });
  }
  get portrait() {
    return this.height >= this.width ? this : this.copyWith({
      width: this.height,
      height: this.width
    });
  }
  applyMargin({left, top, right, bottom}) {
    return this.copyWith({
      marginLeft: Math.max(this.marginLeft, left),
      marginTop: Math.max(this.marginTop, top),
      marginRight: Math.max(this.marginRight, right),
      marginBottom: Math.max(this.marginBottom, bottom)
    });
  }
  equals(other) {
    return other instanceof PdfPageFormat && this.width === other.width && this.height === other.height && this.marginLeft === other.marginLeft && this.marginTop === other.marginTop && this.marginRight === other.marginRight && this.marginBottom === other.marginBottom;
  }
  get hashCode() {
    let hash = 0;
    for (const character of this.toString()) hash = Math.imul(hash, 31) + character.charCodeAt(0) | 0;
    return hash;
  }
  toString() {
    return `PdfPageFormat ${this.width}x${this.height} margins:${this.marginLeft}, ${this.marginTop}, ${this.marginRight}, ${this.marginBottom}`;
  }
}

PdfPageFormat.a3 = new PdfPageFormat(PageFormat.A3.width, PageFormat.A3.height, PageFormat.A3);

PdfPageFormat.a4 = new PdfPageFormat(PageFormat.A4.width, PageFormat.A4.height, PageFormat.A4);

PdfPageFormat.a5 = new PdfPageFormat(PageFormat.A5.width, PageFormat.A5.height, PageFormat.A5);

PdfPageFormat.a6 = new PdfPageFormat(PageFormat.A6.width, PageFormat.A6.height, PageFormat.A6);

PdfPageFormat.letter = new PdfPageFormat(PageFormat.LETTER.width, PageFormat.LETTER.height, PageFormat.LETTER);

PdfPageFormat.legal = new PdfPageFormat(PageFormat.LEGAL.width, PageFormat.LEGAL.height, PageFormat.LEGAL);

PdfPageFormat.roll57 = new PdfPageFormat(PageFormat.ROLL57.width, Infinity, PageFormat.ROLL57);

PdfPageFormat.roll80 = new PdfPageFormat(PageFormat.ROLL80.width, Infinity, PageFormat.ROLL80);

PdfPageFormat.undefined = new PdfPageFormat(Infinity, Infinity);

PdfPageFormat.standard = PdfPageFormat.a4;

PdfPageFormat.point = PageUnit.point;

PdfPageFormat.inch = PageUnit.inch;

PdfPageFormat.cm = PageUnit.cm;

PdfPageFormat.mm = PageUnit.mm;

PdfPageFormat.dp = PageUnit.dp;

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

const digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const packedClusters = [ "dXAerwfV8dTgep4fU+ajAdRwahgVBAagwVAga3Adbwet8azgdZ4es+VjAaxwVhgV3Aa7wdd8Vzga54dc+Vxwa48V7wa98V54a8+V98fX6dLgel4fS+aTAdJwek8aRgdI4UhAaQwdIcUggaQYUgQabgdN4em+UzAaZwdM8UxgaY4dMeUwwaYcU7gad4dO+U5wac8U44aceU94ae+U88U8eaLAdFwei8aJgdE4eieURAaIwdEcUQgaIYUQQUQIUbAaNwdG8UZgaM4dGeUYwaMcUYYUYMUdwaO8Uc4aOeUccUe8aFgdC4eheUJAaEwdCcUIgaEYdCOUIQaEMUIIaEGUNgaG4dDeUMwaGcUMYaGOUMMUMGaHeUOOUFAaCwdBcUEgaCYdBOUEQaCMUEIaCGUEEUGwUGYUGMUCgdAuaBMaBGUCCcrgeV4fK+ZTAcpweU8ZRgco4eUeShAZQwSggZbgct4eW+SzAZZwcs8SxgZY4SwwSwYS7gZd4cu+S5wZc8S44S4cS94Ze+S88S++drAe1wfa8dpge04faebRAdowe0cbQgdoYe0ObQQdoMZLAclweS8bbAZJgck4eSebZgds4e2eWxASQgZIYckOWwgbYYWwQSbAZNwcm8W7ASZgZM4cmeW5gbc4dueW4wSYYW4YSdwZO8W9wSc4ZOeW84beeW8cSe8W+8SeeW+edlgey4fZebJAdkweycbIgdkYeyObIQdkMbIIbIEZFgci4eRebNgZEwcicWZASIgdmcciOWYgSIQZEMWYQbMMZEGSIESNgZG4cjeWdgSMwZGcWcwbOcZGOWcYSMMSMGSO4ZHeWe4SOcWecSOOWeOWfebFAdiwexcbEgdiYexObEQdiMbEIdiGbEEbECSFAZCwchcWNASEgZCYchOWMgbGYdjOWMQSEIZCGWMIbGGWMESGwZDcWOwSGYZDOWOYbHOWOMSGGWOGWPcWPObCgdhYewubCQdhMbCIdhGbCEbCCSCgZBYcguWGgSCQZBMWGQbDMZBGWGISCEWGESCCSDYWHYWHMWHGdgsdgmbBCZAsSBIWDIWDEWDCYrAcVweK8YpgcU4RRAYowcUcRQgYoYRQQRQIRbAYtwcW8RZgYs4cWeRYwYscRYYRYMRdwYu8Rc4YueRccRe8Reec1gea4fNeZpAc0weacZogc0YeaOZoQc0MZoIc0GYlgcS4eJeZtgYkwcScTZARIgc2ccSOTYgZsYYkMTYQRIITYIRNgYm4cTeTdgRMwc3eTcwZucYmOTcYRMMTcMRO4YneTe4ROcTecROORPeTfed1Ae6wfdcd0ge6YfdOd0Qe6Md0Ie6Gd0EZlAcyweZcbtAZkge7ceZObsgd2Ye7ObsQZkIcyGbsId2GZkCRFAYiwcRcTNAREgYiYcROXdATMgZmYczOXcgbuYd3OYiGXcQTMIZmGXcIRECRGwYjcTOwRGYYjOXewTOYZnOXeYbvORGGTOGRHcTPcRHOXfcTPOdyge5YfcudyQe5MdyIe5GdyEdyCZigcxYeYubmgZiQe5ubmQdzMcxGbmIZiEbmEZiCbmCRCgYhYcQuTGgRCQYhMXOgTGQZjMYhGXOQbnMRCEXOITGERCCTGCRDYYhuTHYRDMXPYTHMRDGXPMTHGRDuXPudxQe4sdxIe4mdxEdxCZhQcwsbjQZhIcwmbjIdxmbjEZhCbjCRBQYgsTDQRBIYgmXHQTDIZhmXHIbjmRBCXHETDCXHCTDsXHsXHme4WdwicwWZgkZgiRAoTBoXDoRAiTBiYVgQpAYUwQogYUYcKOQoQYUMQoIYUGQtgYW4cLeQswYWcQsYYWOQsMQsGQu4YXeQucQuOQveY1AcaweNcY0gcaYY0QcaMY0IcaGY0EQlAYSwcJcRtAQkgcbccJORsgY2YcbORsQQkIYSGRsIY2GQkCQmwYTcRuwQmYYTORuYY3ORuMQmGQncRvcQnORvOc6gedYfOuc6QedMc6IedGc6Ec6CYygcZYZ2gYyQcZMZ2Qc7McZGZ2IYyEZ2EYyCZ2CQigYRYRmgQiQcZuTugRmQYzMYRGTuQZ3MQiETuIRmEQiCRmCQjYYRuRnYQjMTvYRnMQjGTvMRnGQjuRnuTvue9Qfese9Ifeme9Ee9Cc5Qecsd7Qe9secmd7Ie9md7Ec5Cd7CYxQcYsZzQYxIcYmb3QZzIc5mb3Id7mYxCb3EZzCb3CQhQYQsRjQQhIYQmTnQRjIYxmXvQTnIZzmQhCXvIb3mRjCXvEQhsRjsQhmTnsRjmXvsTnmXvme8ofeWe8ke8ic4oecWd5oe82d5kc4id5iYwocYWZxoYwkbzoZxkYwibzkZxibziQgoYQWRhoYw2TjoRhkQgiXnoTjkRhiXnkTjiXniRh2Xn2e8Sd40d4yZw0bx0bxyRg0Th0Xj0XjyQVAQUgYKYQUQQUIQUEQWwQWYQWMQWGQXcQXOYagYaQcNMYaIcNGYaEYaCQSgYJYQ2gYbYYJMQ2QYbMQ2IYbGQ2EQSCQ2CQTYYJuQ3YYbuQ3MQTGQ3GQTuQ3ucdQcdIcdEcdCYZQY7QcdscMmY7IcdmY7EYZCY7CQRQQzQQRIYImR3QQzIQRER3IQzEQRCR3EQzCQRsQzsQRmR3sQzmR3meeoeekeeiccoc9oee2c9kccic9iYYocMWY5occ2Z7oY5kYYiZ7kY5iZ7iQQoYIWQxoYY2RzoQxkQQiT3oRzkQxiT3kRziQQ2Qx2Rz2T32ffUffSeeUe+0eeSe+yccUc80ccSd90c8yd9yYYUY40YYSZ50Y4yb70", "fVgfq4epAfUwfqceogfUYfqOeoQfUMeoIfUGeoEetgfW4fredZAeswfWcdYgesYfWOdYQesMdYIesGdYEddgeu4fXea5Adcweuca4gdcYeuOa4QdcMa4IdcGa4Ea9gde4eveV5Aa8wdecV4ga8YdeOV4Qa8MV4Ia8GV9ga+4dfeV8wa+cV8Ya+OV8MV+4a/eV+cV+OelAfSwfpcekgfSYfpOekQfSMekIfSGekEekCdNAemwfTcdMgemYfTOdMQemMdMIemGdMEdMCadAdOwencacgdOYenOacQdOMacIdOGacEacCU9AaewdPcU8gaeYdPOU8QaeMU8IaeGU8EU+wafcU+YafOU+MU+GU/cU/OeigfRYfoueiQfRMeiIfRGeiEeiCdGgejYfRudGQejMdGIejGdGEdGCaOgdHYejuaOQdHMaOIdHGaOEaOCUegaPYdHuUeQaPMUeIaPGUeEUeCUfYaPuUfMUfGUfuehQfQsehIfQmehEehCdDQehsdDIehmdDEdDCaHQdDsaHIdDmaHEaHCUPQaHsUPIaHmUPEUPCUPsUPmegofQWegkegidBoeg2dBkdBiaDodB2aDkaDiUHoaD2UHkUHiegUegSdA0dAyaB0aByeVAfKwflceUgfKYflOeUQfKMeUIfKGeUEeUCctAeWwfLccsgeWYfLOcsQeWMcsIeWGcsEcsCZdAcuweXcZcgcuYeXOZcQcuMZcIcuGZcEZcCS9AZewcvcS8gZeYcvOS8QZeMS8IZeGS8ES+wZfcS+YZfOS+MS+GS/cS/OfagftYWvwfaQftMWn4faIftGWj8faEfaCeSgfJYfkue2geSQftue2QfbMfJGe2IeSEe2EeSCe2CcmgeTYfJudugcmQeTMduQe3MeTGduIcmEduEcmCduCZOgcnYeTubegZOQcnMbeQdvMcnGbeIZOEbeEZOCbeCSegZPYcnuW+gSeQZPMW+QbfMZPGW+ISeEW+ESeCSfYZPuW/YSfMW/MSfGW/GSfufZQfssWX4fZIfsmWT8fZEWR+fZCeRQfIsezQeRIfImezIfZmezEeRCezCcjQeRsdnQcjIeRmdnIezmdnEcjCdnCZHQcjsbPQZHIcjmbPIdnmbPEZHCbPCSPQZHsWfQSPIZHmWfIbPmWfESPCWfCSPsWfsSPmWfmfYofsWWL8fYkWJ+fYieQofIWexofY2exkeQiexichoeQ2djochkdjkchidjiZDoch2bHodj2bHkZDibHiSHoZD2WPoSHkWPkSHiWPiSH2WP2fYUWF+fYSeQUew0eQSewycg0dh0cgydhyZB0bD0ZBybDySD0WH0SDyWHyfYKeQKewacgadg6ZA6bB6eKgfFYfiueKQfFMeKIfFGeKEeKCcWgeLYfFucWQeLMcWIeLGcWEcWCYugcXYeLuYuQcXMYuIcXGYuEYuCRegYvYcXuReQYvMReIYvGReEReCRfYYvuRfMRfGRfufNQfmsTX4fNIfmmTT8fNETR+fNCeJQfEsebQeJIfEmebIfNmebEeJCebCcTQeJsc3QcTIeJmc3Iebmc3EcTCc3CYnQcTsZvQYnIcTmZvIc3mZvEYnCZvCRPQYnsTfQRPIYnmTfIZvmTfERPCTfCRPsTfsRPmTfmfuoXXwbr8fukXT4bp+fuiXR8XQ+fMofmWTL8fdofu2Xb8TJ+fdkfMiXZ+fdieIofEWeZoeIke7ofd2eIie7keZie7icRoeI2czocRkd3oczkcRid3kczid3iYjocR2ZnoYjkbvoZnkYjibvkZnibviRHoYj2TPoRHkXfoTPkRHiXfkTPiXfiRH2TP2fuUXL4bl+fuSXJ8XI+fMUTF+fc0fMSXN+fcyeIUeY0eISe50eYye5ycQ0cx0cQydz0cxydzyYh0Zj0Yhybn0ZjybnyRD0TH0RDyXP0THyXPyfuKXF8XE+fMKfcaeIKeYae46cQacw6dx6Yg6Zh6bj6RB6TD6XH6XC+eFQfCseFIfCmeFEeFCcLQeFscLIeFmcLEcLCYXQcLsYXIcLmYXEYXCQvQYXsQvIYXmQvEQvCQvsQvmfGofjWRr8fGkRp+fGieEofCWeNoeEkeNkeEieNicJoeE2cbocJkcbkcJicbiYTocJ2Y3oYTkY3kYTiY3iQnoYT2RvoQnkRvkQniRviQn2Rv2fnUTr4Z1+fnSTp8To+fGURl+fO0fGSTt+fOyeEUeM0eESed0eMyedycI0cZ0cIyc70cZyc7yYR0Yz0YRyZ30YzyZ3yQj0Rn0QjyTv0RnyTvyXrwb18Xp4b0+Xo8XoefnKTl8fvaXt8Tk+Xs+fGKfOafe6eEKeMaec6e96cIacY6c56d76YQ6Yx6Zz6b36Qh6Rj6Tn6Xl4by+Xk8XkeTi+Xm+Xi8XieXheeCoeCkeCicFoeC2cFkcFiYLocF2YLkYLiQXoYL2QXkQXiQX2fDUQ1+fDSeCUeG0eCSeGycE0cN0cEycNyYJ0Yb0YJyYbyQT0Q30QTyQ3yfjqR18R0+fDKfHaeCKeGaeO6cEacM6cd6YI6YZ6Y76QR6Qz6R36T14Z6+T08T0eRy+T2+X1wb68X04b6eX0cX0OTy8X28TyeX2eXy4b5eXycXyOTxeXzeXxcXxOXwucC0cCyYF0YFyQL0QLyeDacCacG6YE6YN6QJ6Qb6Q6+R68R6eT64Z9eT6cT6OR5eT7eX6wb9cX6Yb9OX6MX6GT5cX7cT5OX7OX5Yb8uX5MX5GT4uX5uX4sX4mQ9eR9cR9OT9YZ+uT9MT9GR8uT9uT8sT8m", "avgdX4VPAanwdT8VHgaj4dR+VDwah8VB4frQVvga34frIVnwaz8frEVj4ax+frCVh8fXQfrsV34fXIfrmVz8fXEVx+fXCevQfXsevIfXmevEevCdfQevsdfIevmdfEdfCa/Qdfsa/Idfma/EUvAaXwdL8UngaT4dJ+UjwaR8Uh4aQ+Ug8fpoU3wab8fpkUz4aZ+fpiUx8Uw+fTofp2U78fTkU5+fTienofT2enkenidPoen2dPkdPiafodP2afkafiUXgaL4dF+UTwaJ8UR4aI+UQ8UQefo0Ub4aN+foyUZ8UY+fR0Ud+fRyej0ejydH0dHyaP0aPyULwaF8UJ4aE+UI8UIefoaUN8UM+fQ6eh6dD6UF4aC+UE8UEeUG+UC8UCeSvAZXwcr8SngZT4cp+SjwZR8Sh4ZQ+Sg8floS3wZb8flkSz4ZZ+fliSx8Sw+fLofl2S78fLkS5+fLieXofL2eXkeXicvoeX2cvkcviZfocv2ZfkZfibXgdr4e1+WnAbTwdp8WjgbR4do+WhwbQ8Wg4bQeWgcSXgZL4cl+W3gSTwZJ8WzwbZ8ZI+Wx4SQ8Ww8SQeWwefk0Sb4ZN+ft0fkyW74SZ8ftyW58SY+W4+fJ0Sd+fb0fJyW9+fbyeT0e30eTye3ycn0dv0cnydvyZP0ZPyWXAbLwdl8WTgbJ4dk+WRwbI8WQ4bIeWQcWQOSLwZF8WbwSJ4ZE+WZ4bM+WY8SIeWYefkaSN8fs6Wd8SM+Wc+fI6fZ6eR6ez6cj6dn6ZH6WLgbF4di+WJwbE8WI4bEeWIcWIOSF4ZC+WN4SE8WM8SEeWMeSG+WO+WFwbC8WE4bCeWEcWEOSC8WG8SCeWGeWC4bBeWCcWCOSBeWDeWBcWBORXgYr4cV+RTwYp8RR4Yo+RQ8RQefi0Rb4Yt+fiyRZ8RY+fF0Rd+fFyeL0eLycX0cXyYv0YvyTXAZrwc18TTgZp4c0+TRwZo8TQ4ZoeTQcTQORLwYl8TbwRJ4Yk+TZ4Zs+TY8RIeTYefiaRN8fm6Td8RM+Tc+fE6fN6eJ6eb6cT6c36Yn6brgd14e6+XTAbpwd08XRgbo4d0eXQwbocXQYboOXQMTLgZl4cy+XbgTJwZk8XZwbs8ZkeXY4TIcXYcTIOXYORF4Yi+TN4RE8Xd4TM8REeXc8TMeXceRG+TO+Xe+XLAblwdy8XJgbk4dyeXIwbkcXIYbkOXIMXIGTFwZi8XNwTE4ZieXM4bmeXMcTEOXMORC8TG8RCeXO8TGeXOeXFgbi4dxeXEwbicXEYbiOXEMXEGTC4ZheXG4TCcXGcTCOXGORBeTDeXHeXCwbhcXCYbhOXCMXCGTBcXDcTBOXDOXBYbguXBMXBGTAuXBuXAsXAmQrwYV8Qp4YU+Qo8QoeQt8Qs+fC6eF6cL6YX6RrgY14ca+RpwY08Ro4Y0eRocRoOQl4YS+Rt4Qk8Rs8QkeRseQm+Ru+TrAZ1wc68TpgZ04c6eTowZ0cToYZ0OToMToGRlwYy8TtwRk4YyeTs4RkcTscRkOTsOQi8Rm8QieTu8RmeTueb1gd64e9eXpAb0wd6cXogb0Yd6OXoQb0MXoIb0GXoETlgZy4c5eXtgTkwZycXswb2cZyOXsYTkMXsMTkGXsGRi4YxeTm4RicXu4TmcRiOXucTmOXuOQheRjeTneXveXlAbywd5cXkgbyYd5OXkQbyMXkIbyGXkEXkCTiwZxcXmwTiYZxOXmYbzOXmMTiGXmGRhcTjcRhOXncTjOXnOXigbxYd4uXiQbxMXiIbxGXiEXiCThYZwuXjYThMXjMThGXjGRguThuXjuXhQbwsXhIbwmXhEXhCTgsXhsTgmXhmXgobwWXgkXgiTgWXg2QV4YK+QU8QUeQW+Q1wYa8Q04YaeQ0cQ0OQS8Q28QSeQ2eR1gY64cdeR0wY6cR0YY6OR0MR0GQy4YZeR24QycR2cQyOR2OQReQzeR3eT1AZ6wc9cT0gZ6Yc9OT0QZ6MT0IZ6GT0ET0CRywY5cT2wRyYY5OT2YZ7OT2MRyGT2GQxcRzcQxOT3cRzOT3Ob6gd9Ye+ub6Qd9Mb6Id9Gb6Eb6CTygZ5Yc8uX2gTyQZ5MX2Qb7MZ5GX2ITyEX2ETyCX2CRxYY4uTzYRxMX3YTzMRxGX3MTzGX3GQwuRxuTzuX3ub5Qd8sb5Id8mb5Eb5CTxQZ4sXzQTxIZ4mXzIb5mXzETxCXzCRwsTxsRwmXzsTxmXzmb4od8Wb4kb4iTwoZ4WXxoTwkXxkTwiXxiRwWTw2Xx2b4Ub4STwUXw0TwSXwyQK8QKeQa4YNeQacQaOQJeQbeQ6wYdcQ6YYdOQ6MQ6GQZcQ7cQZOQ7OR6gY9YceuR6QY9MR6IY9GR6ER6CQ5YYcuR7YY9uR7MQ5GR7GQYuQ5uR7uZ9Qc+sZ9Ic+mZ9EZ9CR5QY8sT7QZ9sY8mT7IR5ET7ER5CT7CQ4sR5sQ4mT7sR5mT7md+oe/Wd+kd+iZ8oc+Wb9oZ8kb9kZ8ib9iR4oY8WT5oR4kX7oT5kR4iX7kT5iX7iQ4WR42T52X72d+Ud+SZ8Ub80Z8Sb8yR4UT40R4SX50T4yX5yd+KZ8Kb8aR4KT4aX46QNcQNOQdYYOuQdMQdGQMuQduQ9QYesQ9IYemQ9EQ9CQcsQ9sQcmQ9mY+ocfWY+kY+iQ8oYeWR9oY+2R9kQ8iR9iQcWQ82R92c/Uc/SY+UZ+0Y+SZ+yQ8UR80Q8ST90R8yT9yc/KY+KZ+aQ8KR8aT86QOsQOmQeoYPWQekQeiQOWQe2YfUYfSQeUQ+0QeSQ+ycfq" ];

const codewords = packedClusters.map(packed => {
  const cluster = [];
  for (let index = 0; index < packed.length; index += 3) {
    cluster.push(digits.indexOf(packed[index]) << 12 | digits.indexOf(packed[index + 1]) << 6 | digits.indexOf(packed[index + 2]));
  }
  return cluster;
});

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
    const dataWords = this.highlevelEncode(data);
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
      const numericCount = consecutiveDigitCount(msg.subarray(i));
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
      if (consecutiveDigitCount(msg.subarray(i)) >= minNumericCount) {
        break;
      }
      if (this.consecutiveTextCount(msg.subarray(i)) > 5) {
        break;
      }
      result++;
    }
    return result;
  }
  highlevelEncode(source) {
    const words = [];
    let encodingMode = ENC_TEXT;
    let textSubMode = SUB_UPPER;
    let offset = 0;
    while (offset < source.length) {
      const data = source.subarray(offset);
      const numericCount = consecutiveDigitCount(data);
      if (numericCount >= minNumericCount || numericCount === data.length) {
        words.push(latchToNumeric);
        encodingMode = ENC_NUMERIC;
        textSubMode = SUB_UPPER;
        words.push(...encodeNumeric(data.subarray(0, numericCount)));
        offset += numericCount;
      } else {
        const textCount = this.consecutiveTextCount(data);
        if (textCount >= 5 || textCount === data.length) {
          if (encodingMode !== ENC_TEXT) {
            words.push(latchToText);
            encodingMode = ENC_TEXT;
            textSubMode = SUB_UPPER;
          }
          const txtData = [];
          textSubMode = this.encodeText(data.subarray(0, textCount), textSubMode, txtData);
          words.push(...txtData);
          offset += textCount;
        } else {
          let binaryCount = this.consecutiveBinaryCount(data);
          if (binaryCount === 0) {
            binaryCount = 1;
          }
          const bytes = data.subarray(0, binaryCount);
          if (bytes.length !== 1 || encodingMode !== ENC_TEXT) {
            encodingMode = ENC_BINARY;
            textSubMode = SUB_UPPER;
          }
          words.push(...encodeBinary(bytes, encodingMode));
          offset += binaryCount;
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
    const chunk = digits.subarray(start, end);
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

let BitWriter$1 = class BitWriter {
  constructor(capacity) {
    this.length = 0;
    this.bytes = new Uint8Array(capacity);
  }
  get byteLength() {
    return this.length + 7 >>> 3;
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
    if (byteIndex >= this.bytes.length) throw new RangeError("QR bit buffer overflow");
    if (value) this.bytes[byteIndex] = this.bytes[byteIndex] | 128 >>> (this.length & 7);
    this.length++;
  }
  appendByte(value) {
    if ((this.length & 7) !== 0) throw new RangeError("QR byte append is not aligned");
    if (this.byteLength >= this.bytes.length) throw new RangeError("QR byte buffer overflow");
    this.bytes[this.byteLength] = value;
    this.length += 8;
  }
  finish() {
    return this.bytes.subarray(0, this.byteLength);
  }
};

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
  const bits = new BitWriter$1(capacity);
  bits.append(4, 4);
  bits.append(data.length, version < 10 ? 8 : 16);
  for (const byte of data) bits.append(byte, 8);
  const capacityBits = capacity * 8;
  for (let count = Math.min(4, capacityBits - bits.length); count > 0; count--) {
    bits.appendBit(false);
  }
  while ((bits.length & 7) !== 0) bits.appendBit(false);
  let toggle = false;
  while (bits.byteLength < capacity) {
    bits.appendByte(toggle ? 17 : 236);
    toggle = !toggle;
  }
  return bits.finish();
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

const ARABIC_FORMS = Object.freeze({
  1600: [ 1600, 1600, 1600, 1600 ],
  1569: [ 1569 ],
  1570: [ 1570, 65154 ],
  1571: [ 1571, 65156 ],
  1572: [ 1572, 65158 ],
  1573: [ 1573, 65160 ],
  1574: [ 1574, 65162, 65163, 65164 ],
  1575: [ 1575, 65166 ],
  1576: [ 1576, 65168, 65169, 65170 ],
  1577: [ 1577, 65172 ],
  1578: [ 1578, 65174, 65175, 65176 ],
  1579: [ 1579, 65178, 65179, 65180 ],
  1580: [ 1580, 65182, 65183, 65184 ],
  1581: [ 1581, 65186, 65187, 65188 ],
  1582: [ 1582, 65190, 65191, 65192 ],
  1583: [ 1583, 65194 ],
  1584: [ 1584, 65196 ],
  1585: [ 1585, 65198 ],
  1586: [ 1586, 65200 ],
  1587: [ 1587, 65202, 65203, 65204 ],
  1588: [ 1588, 65206, 65207, 65208 ],
  1589: [ 1589, 65210, 65211, 65212 ],
  1590: [ 1590, 65214, 65215, 65216 ],
  1591: [ 1591, 65218, 65219, 65220 ],
  1592: [ 1592, 65222, 65223, 65224 ],
  1593: [ 1593, 65226, 65227, 65228 ],
  1594: [ 1594, 65230, 65231, 65232 ],
  1601: [ 1601, 65234, 65235, 65236 ],
  1602: [ 1602, 65238, 65239, 65240 ],
  1603: [ 1603, 65242, 65243, 65244 ],
  1604: [ 1604, 65246, 65247, 65248 ],
  1605: [ 1605, 65250, 65251, 65252 ],
  1606: [ 1606, 65254, 65255, 65256 ],
  1607: [ 1607, 65258, 65259, 65260 ],
  1608: [ 1608, 65262 ],
  1609: [ 1609, 65264, 64488, 64489 ],
  1610: [ 1610, 65266, 65267, 65268 ],
  1649: [ 64336, 64337 ],
  1655: [ 64477 ],
  1657: [ 64358, 64359, 64360, 64361 ],
  1658: [ 64350, 64351, 64352, 64353 ],
  1659: [ 64338, 64339, 64340, 64341 ],
  1662: [ 64342, 64343, 64344, 64345 ],
  1663: [ 64354, 64355, 64356, 64357 ],
  1664: [ 64346, 64347, 64348, 64349 ],
  1667: [ 64374, 64375, 64376, 64377 ],
  1668: [ 64370, 64371, 64372, 64373 ],
  1670: [ 64378, 64379, 64380, 64381 ],
  1671: [ 64382, 64383, 64384, 64385 ],
  1672: [ 64392, 64393 ],
  1676: [ 64388, 64389 ],
  1677: [ 64386, 64387 ],
  1678: [ 64390, 64391 ],
  1681: [ 64396, 64397 ],
  1688: [ 64394, 64395 ],
  1700: [ 64362, 64363, 64364, 64365 ],
  1702: [ 64366, 64367, 64368, 64369 ],
  1705: [ 64398, 64399, 64400, 64401 ],
  1709: [ 64467, 64468, 64469, 64470 ],
  1711: [ 64402, 64403, 64404, 64405 ],
  1713: [ 64410, 64411, 64412, 64413 ],
  1715: [ 64406, 64407, 64408, 64409 ],
  1722: [ 64414, 64415 ],
  1723: [ 64416, 64417, 64418, 64419 ],
  1726: [ 64426, 64427, 64428, 64429 ],
  1728: [ 64420, 64421 ],
  1729: [ 64422, 64423, 64424, 64425 ],
  1733: [ 64480, 64481 ],
  1734: [ 64473, 64474 ],
  1735: [ 64471, 64472 ],
  1736: [ 64475, 64476 ],
  1737: [ 64482, 64483 ],
  1739: [ 64478, 64479 ],
  1740: [ 64508, 64509, 64510, 64511 ],
  1744: [ 64484, 64485, 64486, 64487 ],
  1746: [ 64430, 64431 ],
  1747: [ 64432, 64433 ]
});

const DIACRITICS = new Set([ 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1648, 64606, 64607, 64608, 64609, 64610, 64611 ]);

function isArabicDiacritic(codePoint) {
  return DIACRITICS.has(codePoint);
}

function letterAt(text, index, step) {
  for (let cursor = index + step; cursor >= 0 && cursor < text.length; cursor += step) {
    const code = text.charCodeAt(cursor);
    if (!isArabicDiacritic(code)) return code;
  }
  return 0;
}

function formFor(codePoint, before, after) {
  const forms = ARABIC_FORMS[codePoint];
  if (forms === undefined) return codePoint;
  const beforeForms = ARABIC_FORMS[before];
  const afterForms = ARABIC_FORMS[after];
  const joinsBefore = forms.length >= 2 && beforeForms !== undefined && beforeForms.length === 4;
  const joinsAfter = forms.length === 4 && afterForms !== undefined && afterForms.length >= 2;
  const form = joinsBefore && joinsAfter ? 3 : joinsBefore ? 1 : joinsAfter ? 2 : 0;
  return forms[form] ?? forms[0];
}

const LAM_ALEF = Object.freeze({
  1570: [ 65269, 65270 ],
  1571: [ 65271, 65272 ],
  1573: [ 65273, 65274 ],
  1575: [ 65275, 65276 ]
});

function shapeArabicRange(text, start = 0, end = text.length) {
  let shaped = "";
  for (let index = start; index < end; index++) {
    const code = text.charCodeAt(index);
    const before = letterAt(text, index, -1);
    if (before === 1604 && LAM_ALEF[code] !== undefined) continue;
    const after = letterAt(text, index, 1);
    const ligature = code === 1604 ? LAM_ALEF[after] : undefined;
    shaped += String.fromCharCode(ligature === undefined ? formFor(code, before, after) : ligature[ARABIC_FORMS[before]?.length === 4 ? 1 : 0]);
  }
  return shaped;
}

function cffFontMetadata(bytes, glyphCount) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireBytes = (at, size) => {
    if (!Number.isInteger(at) || at < 0 || at + size > bytes.length) throw new TypeError("Truncated CFF metadata");
  };
  const byte = at => {
    requireBytes(at, 1);
    return bytes[at];
  };
  const word = at => {
    requireBytes(at, 2);
    return view.getUint16(at);
  };
  const index = at => {
    const count = word(at);
    if (count === 0) return {
      end: at + 2,
      first: new Uint8Array,
      count,
      item: () => {
        throw new TypeError("Missing CFF string");
      }
    };
    const size = byte(at + 2);
    if (size < 1 || size > 4) throw new TypeError("Invalid CFF INDEX offset size");
    const data = at + 3 + (count + 1) * size;
    requireBytes(at + 3, (count + 1) * size);
    const offset = i => {
      let value = 0;
      for (let j = 0; j < size; j++) value = value * 256 + byte(at + 3 + i * size + j);
      return value;
    };
    const first = offset(0), second = offset(1), last = offset(count);
    if (first !== 1 || second < first || last < second) throw new TypeError("Invalid CFF INDEX offsets");
    requireBytes(data, last - 1);
    return {
      end: data + last - 1,
      first: bytes.subarray(data, data + second - 1),
      count,
      item: i => {
        if (i < 0 || i >= count) throw new TypeError("Invalid CFF string index");
        const start = offset(i), end = offset(i + 1);
        if (start < 1 || end < start || end > last) throw new TypeError("Invalid CFF INDEX range");
        return bytes.subarray(data + start - 1, data + end - 1);
      }
    };
  };
  if (byte(0) !== 1 || byte(2) < 4) throw new TypeError("Only CFF1 OpenType outlines are supported");
  const names = index(byte(2)), top = index(names.end);
  if (names.count !== 1 || top.count !== 1) throw new TypeError("OpenType CFF must contain exactly one font");
  const strings = index(top.end);
  const dict = top.first;
  let ros = [];
  const operands = [];
  let charset = 0, cidKeyed = false, charStrings = -1;
  for (let i = 0; i < dict.length; ) {
    const b = dict[i++];
    if (b >= 32 && b <= 246) operands.push(b - 139); else if (b >= 247 && b <= 254) {
      if (i >= dict.length) throw new TypeError("Truncated CFF DICT operand");
      const next = dict[i++];
      operands.push(b <= 250 ? (b - 247) * 256 + next + 108 : -(b - 251) * 256 - next - 108);
    } else if (b === 28 || b === 29) {
      const size = b === 28 ? 2 : 4;
      if (i + size > dict.length) throw new TypeError("Truncated CFF DICT number");
      const dv = new DataView(dict.buffer, dict.byteOffset + i, size);
      operands.push(size === 2 ? dv.getInt16(0) : dv.getInt32(0));
      i += size;
    } else if (b === 30) {
      let ended = false;
      while (i < dict.length && !ended) {
        const n = dict[i++];
        ended = (n & 15) === 15 || n >> 4 === 15;
      }
      if (!ended) throw new TypeError("Truncated CFF real number");
      operands.push(0);
    } else {
      const op = b === 12 ? 1200 + (dict[i++] ?? -1) : b;
      if (op === 1230) {
        cidKeyed = true;
        ros = [ ...operands ];
      }
      if (op === 15) charset = operands[0] ?? -1;
      if (op === 17) charStrings = operands[0] ?? -1;
      operands.length = 0;
    }
  }
  if (charStrings < 0 || index(charStrings).count !== glyphCount) throw new TypeError("CFF glyph count does not match maxp");
  const result = new Uint16Array(glyphCount);
  const string = sid => {
    if (sid < 0 || !Number.isInteger(sid)) throw new TypeError("Invalid CFF string identifier");
    if (sid < 391) return CFF_STANDARD_STRINGS[sid];
    let value = "";
    for (const b of strings.item(sid - 391)) value += String.fromCharCode(b);
    return value;
  };
  const metadata = {
    cids: result,
    registry: cidKeyed ? string(ros[0] ?? -1) : "Adobe",
    ordering: cidKeyed ? string(ros[1] ?? -1) : "Identity",
    supplement: cidKeyed ? ros[2] ?? 0 : 0
  };
  if (!cidKeyed) {
    for (let i = 0; i < glyphCount; i++) result[i] = i;
    return metadata;
  }
  if (charset <= 2) throw new TypeError("CID-keyed CFF requires an explicit charset");
  const format = byte(charset++);
  if (format > 2) throw new TypeError("Invalid CFF charset format");
  let glyph = 1;
  while (glyph < glyphCount) {
    const first = word(charset);
    charset += 2;
    const remaining = format === 0 ? 0 : format === 1 ? byte(charset++) : word(charset);
    if (format === 2) charset += 2;
    if (glyph + remaining >= glyphCount || first + remaining > 65535) throw new TypeError("CFF charset range exceeds glyph count");
    for (let i = 0; i <= remaining; i++) result[glyph++] = first + i;
  }
  return metadata;
}

const CFF_STANDARD_STRINGS = ".notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron exclamsmall Hungarumlautsmall dollaroldstyle dollarsuperior ampersandsmall Acutesmall parenleftsuperior parenrightsuperior twodotenleader onedotenleader zerooldstyle oneoldstyle twooldstyle threeoldstyle fouroldstyle fiveoldstyle sixoldstyle sevenoldstyle eightoldstyle nineoldstyle commasuperior threequartersemdash periodsuperior questionsmall asuperior bsuperior centsuperior dsuperior esuperior isuperior lsuperior msuperior nsuperior osuperior rsuperior ssuperior tsuperior ff ffi ffl parenleftinferior parenrightinferior Circumflexsmall hyphensuperior Gravesmall Asmall Bsmall Csmall Dsmall Esmall Fsmall Gsmall Hsmall Ismall Jsmall Ksmall Lsmall Msmall Nsmall Osmall Psmall Qsmall Rsmall Ssmall Tsmall Usmall Vsmall Wsmall Xsmall Ysmall Zsmall colonmonetary onefitted rupiah Tildesmall exclamdownsmall centoldstyle Lslashsmall Scaronsmall Zcaronsmall Dieresissmall Brevesmall Caronsmall Dotaccentsmall Macronsmall figuredash hypheninferior Ogoneksmall Ringsmall Cedillasmall questiondownsmall oneeighth threeeighths fiveeighths seveneighths onethird twothirds zerosuperior foursuperior fivesuperior sixsuperior sevensuperior eightsuperior ninesuperior zeroinferior oneinferior twoinferior threeinferior fourinferior fiveinferior sixinferior seveninferior eightinferior nineinferior centinferior dollarinferior periodinferior commainferior Agravesmall Aacutesmall Acircumflexsmall Atildesmall Adieresissmall Aringsmall AEsmall Ccedillasmall Egravesmall Eacutesmall Ecircumflexsmall Edieresissmall Igravesmall Iacutesmall Icircumflexsmall Idieresissmall Ethsmall Ntildesmall Ogravesmall Oacutesmall Ocircumflexsmall Otildesmall Odieresissmall OEsmall Oslashsmall Ugravesmall Uacutesmall Ucircumflexsmall Udieresissmall Yacutesmall Thornsmall Ydieresissmall 001.000 001.001 001.002 001.003 Black Bold Book Light Medium Regular Roman Semibold".split(" ");

function bidiFactory() {
  var bidi = function(exports) {
    var DATA = {
      R: "13k,1a,2,3,3,2+1j,ch+16,a+1,5+2,2+n,5,a,4,6+16,4+3,h+1b,4mo,179q,2+9,2+11,2i9+7y,2+68,4,3+4,5+13,4+3,2+4k,3+29,8+cf,1t+7z,w+17,3+3m,1t+3z,16o1+5r,8+30,8+mc,29+1r,29+4v,75+73",
      EN: "1c+9,3d+1,6,187+9,513,4+5,7+9,sf+j,175h+9,qw+q,161f+1d,4xt+a,25i+9",
      ES: "17,2,6dp+1,f+1,av,16vr,mx+1,4o,2",
      ET: "z+2,3h+3,b+1,ym,3e+1,2o,p4+1,8,6u,7c,g6,1wc,1n9+4,30+1b,2n,6d,qhx+1,h0m,a+1,49+2,63+1,4+1,6bb+3,12jj",
      AN: "16o+5,2j+9,2+1,35,ed,1ff2+9,87+u",
      CS: "18,2+1,b,2u,12k,55v,l,17v0,2,3,53,2+1,b",
      B: "a,3,f+2,2v,690",
      S: "9,2,k",
      WS: "c,k,4f4,1vk+a,u,1j,335",
      ON: "x+1,4+4,h+5,r+5,r+3,z,5+3,2+1,2+1,5,2+2,3+4,o,w,ci+1,8+d,3+d,6+8,2+g,39+1,9,6+1,2,33,b8,3+1,3c+1,7+1,5r,b,7h+3,sa+5,2,3i+6,jg+3,ur+9,2v,ij+1,9g+9,7+a,8m,4+1,49+x,14u,2+2,c+2,e+2,e+2,e+1,i+n,e+e,2+p,u+2,e+2,36+1,2+3,2+1,b,2+2,6+5,2,2,2,h+1,5+4,6+3,3+f,16+2,5+3l,3+81,1y+p,2+40,q+a,m+13,2r+ch,2+9e,75+hf,3+v,2+2w,6e+5,f+6,75+2a,1a+p,2+2g,d+5x,r+b,6+3,4+o,g,6+1,6+2,2k+1,4,2j,5h+z,1m+1,1e+f,t+2,1f+e,d+3,4o+3,2s+1,w,535+1r,h3l+1i,93+2,2s,b+1,3l+x,2v,4g+3,21+3,kz+1,g5v+1,5a,j+9,n+v,2,3,2+8,2+1,3+2,2,3,46+1,4+4,h+5,r+5,r+a,3h+2,4+6,b+4,78,1r+24,4+c,4,1hb,ey+6,103+j,16j+c,1ux+7,5+g,fsh,jdq+1t,4,57+2e,p1,1m,1m,1m,1m,4kt+1,7j+17,5+2r,d+e,3+e,2+e,2+10,m+4,w,1n+5,1q,4z+5,4b+rb,9+c,4+c,4+37,d+2g,8+b,l+b,5+1j,9+9,7+13,9+t,3+1,27+3c,2+29,2+3q,d+d,3+4,4+2,6+6,a+o,8+6,a+2,e+6,16+42,2+1i",
      BN: "0+8,6+d,2s+5,2+p,e,4m9,1kt+2,2b+5,5+5,17q9+v,7k,6p+8,6+1,119d+3,440+7,96s+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+1,1ekf+75,6p+2rz,1ben+1,1ekf+1,1ekf+1",
      NSM: "lc+33,7o+6,7c+18,2,2+1,2+1,2,21+a,1d+k,h,2u+6,3+5,3+1,2+3,10,v+q,2k+a,1n+8,a,p+3,2+8,2+2,2+4,18+2,3c+e,2+v,1k,2,5+7,5,4+6,b+1,u,1n,5+3,9,l+1,r,3+1,1m,5+1,5+1,3+2,4,v+1,4,c+1,1m,5+4,2+1,5,l+1,n+5,2,1n,3,2+3,9,8+1,c+1,v,1q,d,1f,4,1m+2,6+2,2+3,8+1,c+1,u,1n,g+1,l+1,t+1,1m+1,5+3,9,l+1,u,21,8+2,2,2j,3+6,d+7,2r,3+8,c+5,23+1,s,2,2,1k+d,2+4,2+1,6+a,2+z,a,2v+3,2+5,2+1,3+1,q+1,5+2,h+3,e,3+1,7,g,jk+2,qb+2,u+2,u+1,v+1,1t+1,2+6,9,3+a,a,1a+2,3c+1,z,3b+2,5+1,a,7+2,64+1,3,1n,2+6,2,2,3+7,7+9,3,1d+g,1s+3,1d,2+4,2,6,15+8,d+1,x+3,3+1,2+2,1l,2+1,4,2+2,1n+7,3+1,49+2,2+c,2+6,5,7,4+1,5j+1l,2+4,k1+w,2db+2,3y,2p+v,ff+3,30+1,n9x+3,2+9,x+1,29+1,7l,4,5,q+1,6,48+1,r+h,e,13+7,q+a,1b+2,1d,3+3,3+1,14,1w+5,3+1,3+1,d,9,1c,1g,2+2,3+1,6+1,2,17+1,9,6n,3,5,fn5,ki+f,h+f,r2,6b,46+4,1af+2,2+1,6+3,15+2,5,4m+1,fy+3,as+1,4a+a,4x,1j+e,1l+2,1e+3,3+1,1y+2,11+4,2+7,1r,d+1,1h+8,b+3,3,2o+2,3,2+1,7,4h,4+7,m+1,1m+1,4,12+6,4+4,5g+7,3+2,2,o,2d+5,2,5+1,2+1,6n+3,7+1,2+1,s+1,2e+7,3,2+1,2z,2,3+5,2,2u+2,3+3,2+4,78+8,2+1,75+1,2,5,41+3,3+1,5,x+5,3+1,15+5,3+3,9,a+5,3+2,1b+c,2+1,bb+6,2+5,2d+l,3+6,2+1,2+1,3f+5,4,2+1,2+6,2,21+1,4,2,9o+1,f0c+4,1o+6,t5,1s+3,2a,f5l+1,43t+2,i+7,3+6,v+3,45+2,1j0+1i,5+1d,9,f,n+4,2+e,11t+6,2+g,3+6,2+1,2+4,7a+6,c6+3,15t+6,32+6,gzhy+6n",
      AL: "16w,3,2,e+1b,z+2,2+2s,g+1,8+1,b+m,2+t,s+2i,c+e,4h+f,1d+1e,1bwe+dp,3+3z,x+c,2+1,35+3y,2rm+z,5+7,b+5,dt+l,c+u,17nl+27,1t+27,4x+6n,3+d",
      LRO: "6ct",
      RLO: "6cu",
      LRE: "6cq",
      RLE: "6cr",
      PDF: "6cs",
      LRI: "6ee",
      RLI: "6ef",
      FSI: "6eg",
      PDI: "6eh"
    };
    var TYPES = {};
    var TYPES_TO_NAMES = {};
    TYPES.L = 1;
    TYPES_TO_NAMES[1] = "L";
    Object.keys(DATA).forEach(function(type, i) {
      TYPES[type] = 1 << i + 1;
      TYPES_TO_NAMES[TYPES[type]] = type;
    });
    Object.freeze(TYPES);
    var ISOLATE_INIT_TYPES = TYPES.LRI | TYPES.RLI | TYPES.FSI;
    var STRONG_TYPES = TYPES.L | TYPES.R | TYPES.AL;
    var NEUTRAL_ISOLATE_TYPES = TYPES.B | TYPES.S | TYPES.WS | TYPES.ON | TYPES.FSI | TYPES.LRI | TYPES.RLI | TYPES.PDI;
    var BN_LIKE_TYPES = TYPES.BN | TYPES.RLE | TYPES.LRE | TYPES.RLO | TYPES.LRO | TYPES.PDF;
    var TRAILING_TYPES = TYPES.S | TYPES.WS | TYPES.B | ISOLATE_INIT_TYPES | TYPES.PDI | BN_LIKE_TYPES;
    var map = null;
    function parseData() {
      if (!map) {
        map = new Map;
        var loop = function(type) {
          if (DATA.hasOwnProperty(type)) {
            var lastCode = 0;
            DATA[type].split(",").forEach(function(range) {
              var ref = range.split("+");
              var skip = ref[0];
              var step = ref[1];
              skip = parseInt(skip, 36);
              step = step ? parseInt(step, 36) : 0;
              map.set(lastCode += skip, TYPES[type]);
              for (var i = 0; i < step; i++) {
                map.set(++lastCode, TYPES[type]);
              }
            });
          }
        };
        for (var type in DATA) loop(type);
      }
    }
    function getBidiCharType(char) {
      parseData();
      return map.get(char.codePointAt(0)) || TYPES.L;
    }
    function getBidiCharTypeName(char) {
      return TYPES_TO_NAMES[getBidiCharType(char)];
    }
    var data$1 = {
      pairs: "14>1,1e>2,u>2,2wt>1,1>1,1ge>1,1wp>1,1j>1,f>1,hm>1,1>1,u>1,u6>1,1>1,+5,28>1,w>1,1>1,+3,b8>1,1>1,+3,1>3,-1>-1,3>1,1>1,+2,1s>1,1>1,x>1,th>1,1>1,+2,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,4q>1,1e>2,u>2,2>1,+1",
      canonical: "6f1>-6dx,6dy>-6dx,6ec>-6ed,6ee>-6ed,6ww>2jj,-2ji>2jj,14r4>-1e7l,1e7m>-1e7l,1e7m>-1e5c,1e5d>-1e5b,1e5c>-14qx,14qy>-14qx,14vn>-1ecg,1ech>-1ecg,1edu>-1ecg,1eci>-1ecg,1eda>-1ecg,1eci>-1ecg,1eci>-168q,168r>-168q,168s>-14ye,14yf>-14ye"
    };
    function parseCharacterMap(encodedString, includeReverse) {
      var radix = 36;
      var lastCode = 0;
      var map = new Map;
      var reverseMap = includeReverse && new Map;
      var prevPair;
      encodedString.split(",").forEach(function visit(entry) {
        if (entry.indexOf("+") !== -1) {
          for (var i = +entry; i--; ) {
            visit(prevPair);
          }
        } else {
          prevPair = entry;
          var ref = entry.split(">");
          var a = ref[0];
          var b = ref[1];
          a = String.fromCodePoint(lastCode += parseInt(a, radix));
          b = String.fromCodePoint(lastCode += parseInt(b, radix));
          map.set(a, b);
          includeReverse && reverseMap.set(b, a);
        }
      });
      return {
        map,
        reverseMap
      };
    }
    var openToClose, closeToOpen, canonical;
    function parse$1() {
      if (!openToClose) {
        var ref = parseCharacterMap(data$1.pairs, true);
        var map = ref.map;
        var reverseMap = ref.reverseMap;
        openToClose = map;
        closeToOpen = reverseMap;
        canonical = parseCharacterMap(data$1.canonical, false).map;
      }
    }
    function openingToClosingBracket(char) {
      parse$1();
      return openToClose.get(char) || null;
    }
    function closingToOpeningBracket(char) {
      parse$1();
      return closeToOpen.get(char) || null;
    }
    function getCanonicalBracket(char) {
      parse$1();
      return canonical.get(char) || null;
    }
    var TYPE_L = TYPES.L;
    var TYPE_R = TYPES.R;
    var TYPE_EN = TYPES.EN;
    var TYPE_ES = TYPES.ES;
    var TYPE_ET = TYPES.ET;
    var TYPE_AN = TYPES.AN;
    var TYPE_CS = TYPES.CS;
    var TYPE_B = TYPES.B;
    var TYPE_S = TYPES.S;
    var TYPE_ON = TYPES.ON;
    var TYPE_BN = TYPES.BN;
    var TYPE_NSM = TYPES.NSM;
    var TYPE_AL = TYPES.AL;
    var TYPE_LRO = TYPES.LRO;
    var TYPE_RLO = TYPES.RLO;
    var TYPE_LRE = TYPES.LRE;
    var TYPE_RLE = TYPES.RLE;
    var TYPE_PDF = TYPES.PDF;
    var TYPE_LRI = TYPES.LRI;
    var TYPE_RLI = TYPES.RLI;
    var TYPE_FSI = TYPES.FSI;
    var TYPE_PDI = TYPES.PDI;
    function getEmbeddingLevels(string, baseDirection) {
      var MAX_DEPTH = 125;
      var charTypes = new Uint32Array(string.length);
      for (var i = 0; i < string.length; i++) {
        charTypes[i] = getBidiCharType(string[i]);
      }
      var charTypeCounts = new Map;
      function changeCharType(i, type) {
        var oldType = charTypes[i];
        charTypes[i] = type;
        charTypeCounts.set(oldType, charTypeCounts.get(oldType) - 1);
        if (oldType & NEUTRAL_ISOLATE_TYPES) {
          charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) - 1);
        }
        charTypeCounts.set(type, (charTypeCounts.get(type) || 0) + 1);
        if (type & NEUTRAL_ISOLATE_TYPES) {
          charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
        }
      }
      var embedLevels = new Uint8Array(string.length);
      var isolationPairs = new Map;
      var paragraphs = [];
      var paragraph = null;
      for (var i$1 = 0; i$1 < string.length; i$1++) {
        if (!paragraph) {
          paragraphs.push(paragraph = {
            start: i$1,
            end: string.length - 1,
            level: baseDirection === "rtl" ? 1 : baseDirection === "ltr" ? 0 : determineAutoEmbedLevel(i$1, false)
          });
        }
        if (charTypes[i$1] & TYPE_B) {
          paragraph.end = i$1;
          paragraph = null;
        }
      }
      var FORMATTING_TYPES = TYPE_RLE | TYPE_LRE | TYPE_RLO | TYPE_LRO | ISOLATE_INIT_TYPES | TYPE_PDI | TYPE_PDF | TYPE_B;
      var nextEven = function(n) {
        return n + (n & 1 ? 1 : 2);
      };
      var nextOdd = function(n) {
        return n + (n & 1 ? 2 : 1);
      };
      for (var paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
        paragraph = paragraphs[paraIdx];
        var statusStack = [ {
          _level: paragraph.level,
          _override: 0,
          _isolate: 0
        } ];
        var stackTop = void 0;
        var overflowIsolateCount = 0;
        var overflowEmbeddingCount = 0;
        var validIsolateCount = 0;
        charTypeCounts.clear();
        for (var i$2 = paragraph.start; i$2 <= paragraph.end; i$2++) {
          var charType = charTypes[i$2];
          stackTop = statusStack[statusStack.length - 1];
          charTypeCounts.set(charType, (charTypeCounts.get(charType) || 0) + 1);
          if (charType & NEUTRAL_ISOLATE_TYPES) {
            charTypeCounts.set(NEUTRAL_ISOLATE_TYPES, (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES) || 0) + 1);
          }
          if (charType & FORMATTING_TYPES) {
            if (charType & (TYPE_RLE | TYPE_LRE)) {
              embedLevels[i$2] = stackTop._level;
              var level = (charType === TYPE_RLE ? nextOdd : nextEven)(stackTop._level);
              if (level <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                statusStack.push({
                  _level: level,
                  _override: 0,
                  _isolate: 0
                });
              } else if (!overflowIsolateCount) {
                overflowEmbeddingCount++;
              }
            } else if (charType & (TYPE_RLO | TYPE_LRO)) {
              embedLevels[i$2] = stackTop._level;
              var level$1 = (charType === TYPE_RLO ? nextOdd : nextEven)(stackTop._level);
              if (level$1 <= MAX_DEPTH && !overflowIsolateCount && !overflowEmbeddingCount) {
                statusStack.push({
                  _level: level$1,
                  _override: charType & TYPE_RLO ? TYPE_R : TYPE_L,
                  _isolate: 0
                });
              } else if (!overflowIsolateCount) {
                overflowEmbeddingCount++;
              }
            } else if (charType & ISOLATE_INIT_TYPES) {
              if (charType & TYPE_FSI) {
                charType = determineAutoEmbedLevel(i$2 + 1, true) === 1 ? TYPE_RLI : TYPE_LRI;
              }
              embedLevels[i$2] = stackTop._level;
              if (stackTop._override) {
                changeCharType(i$2, stackTop._override);
              }
              var level$2 = (charType === TYPE_RLI ? nextOdd : nextEven)(stackTop._level);
              if (level$2 <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
                validIsolateCount++;
                statusStack.push({
                  _level: level$2,
                  _override: 0,
                  _isolate: 1,
                  _isolInitIndex: i$2
                });
              } else {
                overflowIsolateCount++;
              }
            } else if (charType & TYPE_PDI) {
              if (overflowIsolateCount > 0) {
                overflowIsolateCount--;
              } else if (validIsolateCount > 0) {
                overflowEmbeddingCount = 0;
                while (!statusStack[statusStack.length - 1]._isolate) {
                  statusStack.pop();
                }
                var isolInitIndex = statusStack[statusStack.length - 1]._isolInitIndex;
                if (isolInitIndex != null) {
                  isolationPairs.set(isolInitIndex, i$2);
                  isolationPairs.set(i$2, isolInitIndex);
                }
                statusStack.pop();
                validIsolateCount--;
              }
              stackTop = statusStack[statusStack.length - 1];
              embedLevels[i$2] = stackTop._level;
              if (stackTop._override) {
                changeCharType(i$2, stackTop._override);
              }
            } else if (charType & TYPE_PDF) {
              if (overflowIsolateCount === 0) {
                if (overflowEmbeddingCount > 0) {
                  overflowEmbeddingCount--;
                } else if (!stackTop._isolate && statusStack.length > 1) {
                  statusStack.pop();
                  stackTop = statusStack[statusStack.length - 1];
                }
              }
              embedLevels[i$2] = stackTop._level;
            } else if (charType & TYPE_B) {
              embedLevels[i$2] = paragraph.level;
            }
          } else {
            embedLevels[i$2] = stackTop._level;
            if (stackTop._override && charType !== TYPE_BN) {
              changeCharType(i$2, stackTop._override);
            }
          }
        }
        var levelRuns = [];
        var currentRun = null;
        for (var i$3 = paragraph.start; i$3 <= paragraph.end; i$3++) {
          var charType$1 = charTypes[i$3];
          if (!(charType$1 & BN_LIKE_TYPES)) {
            var lvl = embedLevels[i$3];
            var isIsolInit = charType$1 & ISOLATE_INIT_TYPES;
            var isPDI = charType$1 === TYPE_PDI;
            if (currentRun && lvl === currentRun._level) {
              currentRun._end = i$3;
              currentRun._endsWithIsolInit = isIsolInit;
            } else {
              levelRuns.push(currentRun = {
                _start: i$3,
                _end: i$3,
                _level: lvl,
                _startsWithPDI: isPDI,
                _endsWithIsolInit: isIsolInit
              });
            }
          }
        }
        var isolatingRunSeqs = [];
        for (var runIdx = 0; runIdx < levelRuns.length; runIdx++) {
          var run = levelRuns[runIdx];
          if (!run._startsWithPDI || run._startsWithPDI && !isolationPairs.has(run._start)) {
            var seqRuns = [ currentRun = run ];
            for (var pdiIndex = void 0; currentRun && currentRun._endsWithIsolInit && (pdiIndex = isolationPairs.get(currentRun._end)) != null; ) {
              for (var i$4 = runIdx + 1; i$4 < levelRuns.length; i$4++) {
                if (levelRuns[i$4]._start === pdiIndex) {
                  seqRuns.push(currentRun = levelRuns[i$4]);
                  break;
                }
              }
            }
            var seqIndices = [];
            for (var i$5 = 0; i$5 < seqRuns.length; i$5++) {
              var run$1 = seqRuns[i$5];
              for (var j = run$1._start; j <= run$1._end; j++) {
                seqIndices.push(j);
              }
            }
            var firstLevel = embedLevels[seqIndices[0]];
            var prevLevel = paragraph.level;
            for (var i$6 = seqIndices[0] - 1; i$6 >= 0; i$6--) {
              if (!(charTypes[i$6] & BN_LIKE_TYPES)) {
                prevLevel = embedLevels[i$6];
                break;
              }
            }
            var lastIndex = seqIndices[seqIndices.length - 1];
            var lastLevel = embedLevels[lastIndex];
            var nextLevel = paragraph.level;
            if (!(charTypes[lastIndex] & ISOLATE_INIT_TYPES)) {
              for (var i$7 = lastIndex + 1; i$7 <= paragraph.end; i$7++) {
                if (!(charTypes[i$7] & BN_LIKE_TYPES)) {
                  nextLevel = embedLevels[i$7];
                  break;
                }
              }
            }
            isolatingRunSeqs.push({
              _seqIndices: seqIndices,
              _sosType: Math.max(prevLevel, firstLevel) % 2 ? TYPE_R : TYPE_L,
              _eosType: Math.max(nextLevel, lastLevel) % 2 ? TYPE_R : TYPE_L
            });
          }
        }
        for (var seqIdx = 0; seqIdx < isolatingRunSeqs.length; seqIdx++) {
          var ref = isolatingRunSeqs[seqIdx];
          var seqIndices$1 = ref._seqIndices;
          var sosType = ref._sosType;
          var eosType = ref._eosType;
          var embedDirection = embedLevels[seqIndices$1[0]] & 1 ? TYPE_R : TYPE_L;
          if (charTypeCounts.get(TYPE_NSM)) {
            for (var si = 0; si < seqIndices$1.length; si++) {
              var i$8 = seqIndices$1[si];
              if (charTypes[i$8] & TYPE_NSM) {
                var prevType = sosType;
                for (var sj = si - 1; sj >= 0; sj--) {
                  if (!(charTypes[seqIndices$1[sj]] & BN_LIKE_TYPES)) {
                    prevType = charTypes[seqIndices$1[sj]];
                    break;
                  }
                }
                changeCharType(i$8, prevType & (ISOLATE_INIT_TYPES | TYPE_PDI) ? TYPE_ON : prevType);
              }
            }
          }
          if (charTypeCounts.get(TYPE_EN)) {
            for (var si$1 = 0; si$1 < seqIndices$1.length; si$1++) {
              var i$9 = seqIndices$1[si$1];
              if (charTypes[i$9] & TYPE_EN) {
                for (var sj$1 = si$1 - 1; sj$1 >= -1; sj$1--) {
                  var prevCharType = sj$1 === -1 ? sosType : charTypes[seqIndices$1[sj$1]];
                  if (prevCharType & STRONG_TYPES) {
                    if (prevCharType === TYPE_AL) {
                      changeCharType(i$9, TYPE_AN);
                    }
                    break;
                  }
                }
              }
            }
          }
          if (charTypeCounts.get(TYPE_AL)) {
            for (var si$2 = 0; si$2 < seqIndices$1.length; si$2++) {
              var i$10 = seqIndices$1[si$2];
              if (charTypes[i$10] & TYPE_AL) {
                changeCharType(i$10, TYPE_R);
              }
            }
          }
          if (charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
            for (var si$3 = 1; si$3 < seqIndices$1.length - 1; si$3++) {
              var i$11 = seqIndices$1[si$3];
              if (charTypes[i$11] & (TYPE_ES | TYPE_CS)) {
                var prevType$1 = 0, nextType = 0;
                for (var sj$2 = si$3 - 1; sj$2 >= 0; sj$2--) {
                  prevType$1 = charTypes[seqIndices$1[sj$2]];
                  if (!(prevType$1 & BN_LIKE_TYPES)) {
                    break;
                  }
                }
                for (var sj$3 = si$3 + 1; sj$3 < seqIndices$1.length; sj$3++) {
                  nextType = charTypes[seqIndices$1[sj$3]];
                  if (!(nextType & BN_LIKE_TYPES)) {
                    break;
                  }
                }
                if (prevType$1 === nextType && (charTypes[i$11] === TYPE_ES ? prevType$1 === TYPE_EN : prevType$1 & (TYPE_EN | TYPE_AN))) {
                  changeCharType(i$11, prevType$1);
                }
              }
            }
          }
          if (charTypeCounts.get(TYPE_EN)) {
            for (var si$4 = 0; si$4 < seqIndices$1.length; si$4++) {
              var i$12 = seqIndices$1[si$4];
              if (charTypes[i$12] & TYPE_EN) {
                for (var sj$4 = si$4 - 1; sj$4 >= 0 && charTypes[seqIndices$1[sj$4]] & (TYPE_ET | BN_LIKE_TYPES); sj$4--) {
                  changeCharType(seqIndices$1[sj$4], TYPE_EN);
                }
                for (si$4++; si$4 < seqIndices$1.length && charTypes[seqIndices$1[si$4]] & (TYPE_ET | BN_LIKE_TYPES | TYPE_EN); si$4++) {
                  if (charTypes[seqIndices$1[si$4]] !== TYPE_EN) {
                    changeCharType(seqIndices$1[si$4], TYPE_EN);
                  }
                }
              }
            }
          }
          if (charTypeCounts.get(TYPE_ET) || charTypeCounts.get(TYPE_ES) || charTypeCounts.get(TYPE_CS)) {
            for (var si$5 = 0; si$5 < seqIndices$1.length; si$5++) {
              var i$13 = seqIndices$1[si$5];
              if (charTypes[i$13] & (TYPE_ET | TYPE_ES | TYPE_CS)) {
                changeCharType(i$13, TYPE_ON);
                for (var sj$5 = si$5 - 1; sj$5 >= 0 && charTypes[seqIndices$1[sj$5]] & BN_LIKE_TYPES; sj$5--) {
                  changeCharType(seqIndices$1[sj$5], TYPE_ON);
                }
                for (var sj$6 = si$5 + 1; sj$6 < seqIndices$1.length && charTypes[seqIndices$1[sj$6]] & BN_LIKE_TYPES; sj$6++) {
                  changeCharType(seqIndices$1[sj$6], TYPE_ON);
                }
              }
            }
          }
          if (charTypeCounts.get(TYPE_EN)) {
            for (var si$6 = 0, prevStrongType = sosType; si$6 < seqIndices$1.length; si$6++) {
              var i$14 = seqIndices$1[si$6];
              var type = charTypes[i$14];
              if (type & TYPE_EN) {
                if (prevStrongType === TYPE_L) {
                  changeCharType(i$14, TYPE_L);
                }
              } else if (type & STRONG_TYPES) {
                prevStrongType = type;
              }
            }
          }
          if (charTypeCounts.get(NEUTRAL_ISOLATE_TYPES)) {
            var R_TYPES_FOR_N_STEPS = TYPE_R | TYPE_EN | TYPE_AN;
            var STRONG_TYPES_FOR_N_STEPS = R_TYPES_FOR_N_STEPS | TYPE_L;
            var bracketPairs = [];
            {
              var openerStack = [];
              for (var si$7 = 0; si$7 < seqIndices$1.length; si$7++) {
                if (charTypes[seqIndices$1[si$7]] & NEUTRAL_ISOLATE_TYPES) {
                  var char = string[seqIndices$1[si$7]];
                  var oppositeBracket = void 0;
                  if (openingToClosingBracket(char) !== null) {
                    if (openerStack.length < 63) {
                      openerStack.push({
                        char,
                        seqIndex: si$7
                      });
                    } else {
                      break;
                    }
                  } else if ((oppositeBracket = closingToOpeningBracket(char)) !== null) {
                    for (var stackIdx = openerStack.length - 1; stackIdx >= 0; stackIdx--) {
                      var stackChar = openerStack[stackIdx].char;
                      if (stackChar === oppositeBracket || stackChar === closingToOpeningBracket(getCanonicalBracket(char)) || openingToClosingBracket(getCanonicalBracket(stackChar)) === char) {
                        bracketPairs.push([ openerStack[stackIdx].seqIndex, si$7 ]);
                        openerStack.length = stackIdx;
                        break;
                      }
                    }
                  }
                }
              }
              bracketPairs.sort(function(a, b) {
                return a[0] - b[0];
              });
            }
            for (var pairIdx = 0; pairIdx < bracketPairs.length; pairIdx++) {
              var ref$1 = bracketPairs[pairIdx];
              var openSeqIdx = ref$1[0];
              var closeSeqIdx = ref$1[1];
              var foundStrongType = false;
              var useStrongType = 0;
              for (var si$8 = openSeqIdx + 1; si$8 < closeSeqIdx; si$8++) {
                var i$15 = seqIndices$1[si$8];
                if (charTypes[i$15] & STRONG_TYPES_FOR_N_STEPS) {
                  foundStrongType = true;
                  var lr = charTypes[i$15] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                  if (lr === embedDirection) {
                    useStrongType = lr;
                    break;
                  }
                }
              }
              if (foundStrongType && !useStrongType) {
                useStrongType = sosType;
                for (var si$9 = openSeqIdx - 1; si$9 >= 0; si$9--) {
                  var i$16 = seqIndices$1[si$9];
                  if (charTypes[i$16] & STRONG_TYPES_FOR_N_STEPS) {
                    var lr$1 = charTypes[i$16] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                    if (lr$1 !== embedDirection) {
                      useStrongType = lr$1;
                    } else {
                      useStrongType = embedDirection;
                    }
                    break;
                  }
                }
              }
              if (useStrongType) {
                charTypes[seqIndices$1[openSeqIdx]] = charTypes[seqIndices$1[closeSeqIdx]] = useStrongType;
                if (useStrongType !== embedDirection) {
                  for (var si$10 = openSeqIdx + 1; si$10 < seqIndices$1.length; si$10++) {
                    if (!(charTypes[seqIndices$1[si$10]] & BN_LIKE_TYPES)) {
                      if (getBidiCharType(string[seqIndices$1[si$10]]) & TYPE_NSM) {
                        charTypes[seqIndices$1[si$10]] = useStrongType;
                      }
                      break;
                    }
                  }
                }
                if (useStrongType !== embedDirection) {
                  for (var si$11 = closeSeqIdx + 1; si$11 < seqIndices$1.length; si$11++) {
                    if (!(charTypes[seqIndices$1[si$11]] & BN_LIKE_TYPES)) {
                      if (getBidiCharType(string[seqIndices$1[si$11]]) & TYPE_NSM) {
                        charTypes[seqIndices$1[si$11]] = useStrongType;
                      }
                      break;
                    }
                  }
                }
              }
            }
            for (var si$12 = 0; si$12 < seqIndices$1.length; si$12++) {
              if (charTypes[seqIndices$1[si$12]] & NEUTRAL_ISOLATE_TYPES) {
                var niRunStart = si$12, niRunEnd = si$12;
                var prevType$2 = sosType;
                for (var si2 = si$12 - 1; si2 >= 0; si2--) {
                  if (charTypes[seqIndices$1[si2]] & BN_LIKE_TYPES) {
                    niRunStart = si2;
                  } else {
                    prevType$2 = charTypes[seqIndices$1[si2]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                    break;
                  }
                }
                var nextType$1 = eosType;
                for (var si2$1 = si$12 + 1; si2$1 < seqIndices$1.length; si2$1++) {
                  if (charTypes[seqIndices$1[si2$1]] & (NEUTRAL_ISOLATE_TYPES | BN_LIKE_TYPES)) {
                    niRunEnd = si2$1;
                  } else {
                    nextType$1 = charTypes[seqIndices$1[si2$1]] & R_TYPES_FOR_N_STEPS ? TYPE_R : TYPE_L;
                    break;
                  }
                }
                for (var sj$7 = niRunStart; sj$7 <= niRunEnd; sj$7++) {
                  charTypes[seqIndices$1[sj$7]] = prevType$2 === nextType$1 ? prevType$2 : embedDirection;
                }
                si$12 = niRunEnd;
              }
            }
          }
        }
        for (var i$17 = paragraph.start; i$17 <= paragraph.end; i$17++) {
          var level$3 = embedLevels[i$17];
          var type$1 = charTypes[i$17];
          if (level$3 & 1) {
            if (type$1 & (TYPE_L | TYPE_EN | TYPE_AN)) {
              embedLevels[i$17]++;
            }
          } else {
            if (type$1 & TYPE_R) {
              embedLevels[i$17]++;
            } else if (type$1 & (TYPE_AN | TYPE_EN)) {
              embedLevels[i$17] += 2;
            }
          }
          if (type$1 & BN_LIKE_TYPES) {
            embedLevels[i$17] = i$17 === 0 ? paragraph.level : embedLevels[i$17 - 1];
          }
          if (i$17 === paragraph.end || getBidiCharType(string[i$17]) & (TYPE_S | TYPE_B)) {
            for (var j$1 = i$17; j$1 >= 0 && getBidiCharType(string[j$1]) & TRAILING_TYPES; j$1--) {
              embedLevels[j$1] = paragraph.level;
            }
          }
        }
      }
      return {
        levels: embedLevels,
        paragraphs
      };
      function determineAutoEmbedLevel(start, isFSI) {
        for (var i = start; i < string.length; i++) {
          var charType = charTypes[i];
          if (charType & (TYPE_R | TYPE_AL)) {
            return 1;
          }
          if (charType & (TYPE_B | TYPE_L) || isFSI && charType === TYPE_PDI) {
            return 0;
          }
          if (charType & ISOLATE_INIT_TYPES) {
            var pdi = indexOfMatchingPDI(i);
            i = pdi === -1 ? string.length : pdi;
          }
        }
        return 0;
      }
      function indexOfMatchingPDI(isolateStart) {
        var isolationLevel = 1;
        for (var i = isolateStart + 1; i < string.length; i++) {
          var charType = charTypes[i];
          if (charType & TYPE_B) {
            break;
          }
          if (charType & TYPE_PDI) {
            if (--isolationLevel === 0) {
              return i;
            }
          } else if (charType & ISOLATE_INIT_TYPES) {
            isolationLevel++;
          }
        }
        return -1;
      }
    }
    var data = "14>1,j>2,t>2,u>2,1a>g,2v3>1,1>1,1ge>1,1wd>1,b>1,1j>1,f>1,ai>3,-2>3,+1,8>1k0,-1jq>1y7,-1y6>1hf,-1he>1h6,-1h5>1ha,-1h8>1qi,-1pu>1,6>3u,-3s>7,6>1,1>1,f>1,1>1,+2,3>1,1>1,+13,4>1,1>1,6>1eo,-1ee>1,3>1mg,-1me>1mk,-1mj>1mi,-1mg>1mi,-1md>1,1>1,+2,1>10k,-103>1,1>1,4>1,5>1,1>1,+10,3>1,1>8,-7>8,+1,-6>7,+1,a>1,1>1,u>1,u6>1,1>1,+5,26>1,1>1,2>1,2>2,8>1,7>1,4>1,1>1,+5,b8>1,1>1,+3,1>3,-2>1,2>1,1>1,+2,c>1,3>1,1>1,+2,h>1,3>1,a>1,1>1,2>1,3>1,1>1,d>1,f>1,3>1,1a>1,1>1,6>1,7>1,13>1,k>1,1>1,+19,4>1,1>1,+2,2>1,1>1,+18,m>1,a>1,1>1,lk>1,1>1,4>1,2>1,f>1,3>1,1>1,+3,db>1,1>1,+3,3>1,1>1,+2,14qm>1,1>1,+1,6>1,4j>1,j>2,t>2,u>2,2>1,+1";
    var mirrorMap;
    function parse() {
      if (!mirrorMap) {
        var ref = parseCharacterMap(data, true);
        var map = ref.map;
        var reverseMap = ref.reverseMap;
        reverseMap.forEach(function(value, key) {
          map.set(key, value);
        });
        mirrorMap = map;
      }
    }
    function getMirroredCharacter(char) {
      parse();
      return mirrorMap.get(char) || null;
    }
    function getMirroredCharactersMap(string, embeddingLevels, start, end) {
      var strLen = string.length;
      start = Math.max(0, start == null ? 0 : +start);
      end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
      var map = new Map;
      for (var i = start; i <= end; i++) {
        if (embeddingLevels[i] & 1) {
          var mirror = getMirroredCharacter(string[i]);
          if (mirror !== null) {
            map.set(i, mirror);
          }
        }
      }
      return map;
    }
    function getReorderSegments(string, embeddingLevelsResult, start, end) {
      var strLen = string.length;
      start = Math.max(0, start == null ? 0 : +start);
      end = Math.min(strLen - 1, end == null ? strLen - 1 : +end);
      var segments = [];
      embeddingLevelsResult.paragraphs.forEach(function(paragraph) {
        var lineStart = Math.max(start, paragraph.start);
        var lineEnd = Math.min(end, paragraph.end);
        if (lineStart < lineEnd) {
          var lineLevels = embeddingLevelsResult.levels.slice(lineStart, lineEnd + 1);
          for (var i = lineEnd; i >= lineStart && getBidiCharType(string[i]) & TRAILING_TYPES; i--) {
            lineLevels[i] = paragraph.level;
          }
          var maxLevel = paragraph.level;
          var minOddLevel = Infinity;
          for (var i$1 = 0; i$1 < lineLevels.length; i$1++) {
            var level = lineLevels[i$1];
            if (level > maxLevel) {
              maxLevel = level;
            }
            if (level < minOddLevel) {
              minOddLevel = level | 1;
            }
          }
          for (var lvl = maxLevel; lvl >= minOddLevel; lvl--) {
            for (var i$2 = 0; i$2 < lineLevels.length; i$2++) {
              if (lineLevels[i$2] >= lvl) {
                var segStart = i$2;
                while (i$2 + 1 < lineLevels.length && lineLevels[i$2 + 1] >= lvl) {
                  i$2++;
                }
                if (i$2 > segStart) {
                  segments.push([ segStart + lineStart, i$2 + lineStart ]);
                }
              }
            }
          }
        }
      });
      return segments;
    }
    function getReorderedString(string, embedLevelsResult, start, end) {
      var indices = getReorderedIndices(string, embedLevelsResult, start, end);
      var chars = [].concat(string);
      indices.forEach(function(charIndex, i) {
        chars[i] = (embedLevelsResult.levels[charIndex] & 1 ? getMirroredCharacter(string[charIndex]) : null) || string[charIndex];
      });
      return chars.join("");
    }
    function getReorderedIndices(string, embedLevelsResult, start, end) {
      var segments = getReorderSegments(string, embedLevelsResult, start, end);
      var indices = [];
      for (var i = 0; i < string.length; i++) {
        indices[i] = i;
      }
      segments.forEach(function(ref) {
        var start = ref[0];
        var end = ref[1];
        var slice = indices.slice(start, end + 1);
        for (var i = slice.length; i--; ) {
          indices[end - i] = slice[i];
        }
      });
      return indices;
    }
    exports.closingToOpeningBracket = closingToOpeningBracket;
    exports.getBidiCharType = getBidiCharType;
    exports.getBidiCharTypeName = getBidiCharTypeName;
    exports.getCanonicalBracket = getCanonicalBracket;
    exports.getEmbeddingLevels = getEmbeddingLevels;
    exports.getMirroredCharacter = getMirroredCharacter;
    exports.getMirroredCharactersMap = getMirroredCharactersMap;
    exports.getReorderSegments = getReorderSegments;
    exports.getReorderedIndices = getReorderedIndices;
    exports.getReorderedString = getReorderedString;
    exports.openingToClosingBracket = openingToClosingBracket;
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    return exports;
  }({});
  return bidi;
}

let shared = null;

function unicodeBidi() {
  return shared ?? (shared = bidiFactory());
}

const basicToIsolatedMappings = new Map([ [ 1575, 65165 ], [ 1576, 65167 ], [ 1578, 65173 ], [ 1579, 65177 ], [ 1580, 65181 ], [ 1581, 65185 ], [ 1582, 65189 ], [ 1583, 65193 ], [ 1584, 65195 ], [ 1585, 65197 ], [ 1586, 65199 ], [ 1587, 65201 ], [ 1588, 65205 ], [ 1589, 65209 ], [ 1590, 65213 ], [ 1591, 65217 ], [ 1592, 65221 ], [ 1593, 65225 ], [ 1594, 65229 ], [ 1601, 65233 ], [ 1602, 65237 ], [ 1603, 65241 ], [ 1604, 65245 ], [ 1605, 65249 ], [ 1606, 65253 ], [ 1607, 65257 ], [ 1608, 65261 ], [ 1609, 65263 ], [ 1610, 65265 ], [ 1569, 65152 ], [ 1570, 65153 ], [ 1571, 65155 ], [ 1572, 65157 ], [ 1573, 65159 ], [ 1574, 65161 ], [ 1577, 65171 ] ]);

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
  cff: "CFF ",
  cblc: "CBLC",
  cbdt: "CBDT"
});

class TtfBitmapInfo {
  constructor(data, height, width, horizontalBearingX, horizontalBearingY, horizontalAdvance, ascent, descent) {
    this.data = data;
    this.height = height;
    this.width = width;
    this.horizontalBearingX = horizontalBearingX;
    this.horizontalBearingY = horizontalBearingY;
    this.horizontalAdvance = horizontalAdvance;
    this.ascent = ascent;
    this.descent = descent;
  }
  get metrics() {
    const scale = 1 / this.height;
    return new PdfFontMetrics({
      bottom: this.horizontalBearingY * scale,
      left: this.horizontalBearingX * scale,
      top: (this.horizontalBearingY - this.height) * scale,
      right: this.horizontalAdvance * scale,
      ascent: this.ascent * scale,
      descent: this.horizontalBearingY * scale,
      advanceWidth: this.horizontalAdvance * scale,
      leftBearing: this.horizontalBearingX * scale
    });
  }
}

const REQUIRED_TABLES = [ TtfTable.head, TtfTable.name, TtfTable.hmtx, TtfTable.hhea, TtfTable.cmap, TtfTable.maxp ];

class TtfParser {
  constructor(bytes) {
    this.tableOffsets = new Map;
    this.tableSize = new Map;
    this.charToGlyphIndexMap = new Map;
    this.glyphOffsets = [];
    this.glyphSizes = [];
    this.glyphInfoMap = new Map;
    this.bitmapInfoMap = new Map;
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
    if (this.hasCff) this.parseCffMetrics();
    if (this.tableOffsets.has(TtfTable.cblc) && this.tableOffsets.has(TtfTable.cbdt)) {
      this.parseBitmaps();
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
  get isBitmap() {
    return this.bitmapInfoMap.size > 0 && this.glyphOffsets.length === 0;
  }
  getBitmap(codePoint) {
    const glyph = this.charToGlyphIndexMap.get(codePoint);
    return glyph === undefined ? null : this.bitmapInfoMap.get(glyph) ?? null;
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
    const base = this.tableOffset(TtfTable.cmap);
    const map = this.charToGlyphIndexMap;
    const records = Math.min(this.view.getUint16(base + 2), this.bytes.length - base - 4 >> 3);
    const subtables = [];
    for (let i = 0; i < records; i++) {
      const record = base + 4 + i * 8;
      const start = base + this.view.getUint32(record + 4);
      const rank = start + 2 <= this.bytes.length ? cmapRank(this.view.getUint16(record), this.view.getUint16(record + 2), this.view.getUint16(start)) : 0;
      if (rank > 0) subtables.push([ rank, start ]);
    }
    const best = Math.max(0, ...subtables.map(([rank]) => rank));
    for (const [, start] of subtables.filter(([rank]) => best > 2 ? rank > 2 : rank === best).sort((a, b) => a[0] - b[0])) {
      this.parseCMapSubtable(start);
    }
    if (best === 2) {
      for (const [code, glyph] of map) {
        if (code >= 61440 && code <= 61695 && !map.has(code & 255)) map.set(code & 255, glyph);
      }
    } else if (best === 1) {
      for (const code of map.keys()) if (code >= 128) map.delete(code);
    }
    for (const [basic, isolated] of basicToIsolatedMappings) {
      const glyph = map.get(basic);
      if (glyph !== undefined && !map.has(isolated)) {
        map.set(isolated, glyph);
      }
    }
  }
  parseCMapSubtable(start) {
    const view = this.view;
    const map = this.charToGlyphIndexMap;
    const length = this.bytes.length;
    const fits = end => end <= length;
    switch (view.getUint16(start)) {
     case 0:
      if (!fits(start + 262)) return;
      for (let code = 0; code < 256; code++) {
        const glyph = view.getUint8(start + 6 + code);
        if (glyph > 0) map.set(code, glyph);
      }
      return;

     case 4:
      {
        if (!fits(start + 14)) return;
        const segments = view.getUint16(start + 6) >> 1;
        const ends = start + 14;
        const starts = ends + segments * 2 + 2;
        const deltas = starts + segments * 2;
        const ranges = deltas + segments * 2;
        if (!fits(ranges + segments * 2)) return;
        for (let s = 0; s < segments - 1; s++) {
          const end = view.getUint16(ends + s * 2);
          const first = view.getUint16(starts + s * 2);
          const delta = view.getUint16(deltas + s * 2);
          const range = view.getUint16(ranges + s * 2);
          for (let code = first; code <= end; code++) {
            let glyph = code + delta & 65535;
            if (range !== 0) {
              const address = ranges + s * 2 + range + 2 * (code - first);
              if (!fits(address + 2)) continue;
              glyph = view.getUint16(address);
              if (glyph !== 0) glyph = glyph + delta & 65535;
            }
            if (glyph !== 0) map.set(code, glyph);
          }
        }
        return;
      }

     case 6:
      {
        if (!fits(start + 10)) return;
        const first = view.getUint16(start + 6);
        const count = view.getUint16(start + 8);
        if (!fits(start + 10 + count * 2)) return;
        for (let i = 0; i < count; i++) {
          const glyph = view.getUint16(start + 10 + i * 2);
          if (glyph > 0) map.set(first + i, glyph);
        }
        return;
      }

     case 12:
      {
        if (!fits(start + 16)) return;
        const groups = view.getUint32(start + 12);
        if (!fits(start + 16 + groups * 12)) return;
        for (let i = 0; i < groups; i++) {
          const group = start + 16 + i * 12;
          const first = view.getUint32(group);
          const end = view.getUint32(group + 4);
          const glyph = view.getUint32(group + 8) - first;
          if (end > 1114111) continue;
          for (let code = first; code <= end; code++) {
            if (glyph + code !== 0) map.set(code, glyph + code);
          }
        }
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
  parseCffMetrics() {
    const offset = this.tableOffset(TtfTable.hmtx), count = this.numOfLongHorMetrics;
    if (count < 1 || count > this.numGlyphs) throw new TypeError("Invalid CFF horizontal metrics");
    for (let glyph = 0; glyph < this.numGlyphs; glyph++) {
      const advance = this.view.getUint16(offset + Math.min(glyph, count - 1) * 4) / this.unitsPerEm;
      const left = this.view.getInt16(glyph < count ? offset + glyph * 4 + 2 : offset + count * 4 + (glyph - count) * 2) / this.unitsPerEm;
      this.glyphInfoMap.set(glyph, new PdfFontMetrics({
        left,
        right: left + advance,
        top: this.descent / this.unitsPerEm,
        bottom: this.ascent / this.unitsPerEm,
        ascent: this.ascent / this.unitsPerEm,
        descent: this.descent / this.unitsPerEm,
        advanceWidth: advance,
        leftBearing: left
      }));
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
    if (start >= glyfEnd || start === 0 || this.glyphSizes[index] <= 0) {
      return {
        index,
        data: new Uint8Array(0),
        compounds: []
      };
    }
    const numberOfContours = this.view.getInt16(start);
    return numberOfContours === -1 ? this.readCompoundGlyph(index, start, start + 10) : this.readSimpleGlyph(index, start, start + 10, numberOfContours);
  }
  glyphBytes(glyph, start, end) {
    return this.bytes.subarray(start, Math.min(end, start + this.glyphSizes[glyph]));
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
        data: this.glyphBytes(glyph, start, offset),
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
      data: this.glyphBytes(glyph, start, offset),
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
      data: this.glyphBytes(glyph, start, offset),
      compounds: components
    };
  }
  parseBitmaps() {
    const cblc = this.tableOffset(TtfTable.cblc);
    const cbdt = this.tableOffset(TtfTable.cbdt);
    const numberOfSizes = this.view.getUint32(cblc + 4);
    let sizeOffset = cblc + 8;
    for (let sizeIndex = 0; sizeIndex < numberOfSizes; sizeIndex++) {
      const subtableArray = cblc + this.view.getUint32(sizeOffset);
      const numberOfSubtables = this.view.getUint32(sizeOffset + 8);
      const ascent = this.view.getInt8(sizeOffset + 12);
      const descent = this.view.getInt8(sizeOffset + 13);
      let arrayOffset = subtableArray;
      for (let tableIndex = 0; tableIndex < numberOfSubtables; tableIndex++) {
        const firstGlyph = this.view.getUint16(arrayOffset);
        const lastGlyph = this.view.getUint16(arrayOffset + 2);
        const subtable = subtableArray + this.view.getUint32(arrayOffset + 4);
        const indexFormat = this.view.getUint16(subtable);
        const imageFormat = this.view.getUint16(subtable + 2);
        const imageData = cbdt + this.view.getUint32(subtable + 4);
        if (indexFormat === 1 && imageFormat === 17) {
          for (let glyph = firstGlyph; glyph <= lastGlyph; glyph++) {
            const offsetIndex = glyph - firstGlyph;
            const bitmap = imageData + this.view.getUint32(subtable + 8 + offsetIndex * 4);
            const height = this.view.getUint8(bitmap);
            const width = this.view.getUint8(bitmap + 1);
            const bearingX = this.view.getInt8(bitmap + 2);
            const bearingY = this.view.getInt8(bitmap + 3);
            const advance = this.view.getUint8(bitmap + 4);
            const dataLength = this.view.getUint32(bitmap + 5);
            const dataStart = bitmap + 9;
            const dataEnd = dataStart + dataLength;
            if (height > 0 && width > 0 && dataEnd <= this.bytes.length) {
              this.bitmapInfoMap.set(glyph, new TtfBitmapInfo(this.bytes.subarray(dataStart, dataEnd), height, width, bearingX, bearingY, advance, ascent, descent));
            }
          }
        }
        arrayOffset += 8;
      }
      sizeOffset += 48;
    }
  }
}

function cmapRank(platform, encoding, format) {
  if (format !== 0 && format !== 4 && format !== 6 && format !== 12) return 0;
  if (platform === 0) return encoding === 4 || encoding === 6 ? 5 : 3;
  if (platform === 3) return encoding === 10 ? 6 : encoding === 1 ? 4 : encoding === 0 ? 2 : 0;
  return platform === 1 && encoding === 0 ? 1 : 0;
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
    for (const name of [ TtfTable.head, TtfTable.maxp, TtfTable.hhea, TtfTable.os2, "cvt ", "fpgm", "prep", "gasp" ]) {
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
    const tableKeys = [ ...tables.keys() ].sort();
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
    let entrySelector = 0;
    while (2 << entrySelector <= numTables) {
      entrySelector++;
    }
    view.setUint16(6, 16 << entrySelector);
    view.setUint16(8, entrySelector);
    view.setUint16(10, numTables * 16 - (16 << entrySelector));
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

const DEFAULT_PDF_SETTINGS = {
  compress: true
};

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
    super(document, new PdfDict([ [ "/Type", new PdfName("/FontDescriptor") ], [ "/FontName", new PdfName(`/${options.fontName}`) ], [ options.fileKey ?? "/FontFile2", options.file.ref() ], [ "/Flags", new PdfNum(options.flags) ], [ "/FontBBox", PdfArray.fromNum([ ...options.fontBBox ]) ], [ "/Ascent", new PdfNum(Math.trunc(options.ascent * 1e3)) ], [ "/Descent", new PdfNum(Math.trunc(options.descent * 1e3)) ], [ "/ItalicAngle", new PdfNum(0) ], [ "/CapHeight", new PdfNum(10) ], [ "/StemV", new PdfNum(79) ] ]));
  }
}

const MIN_MATCH = 3;

const MAX_MATCH = 258;

const WINDOW_SIZE = 32768;

const WINDOW_MASK = WINDOW_SIZE - 1;

const HASH_BITS = 15;

const HASH_SIZE = 1 << HASH_BITS;

const HASH_MASK = HASH_SIZE - 1;

const MAX_CHAIN = 128;

const BLOCK_TOKENS = 1 << 14;

const MAX_STORED = 65535;

const LENGTH_BASE$1 = [ 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258 ];

const LENGTH_EXTRA$1 = [ 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 ];

const DISTANCE_BASE$1 = [ 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 ];

const DISTANCE_EXTRA$1 = [ 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 ];

const CODE_LENGTH_ORDER = [ 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 ];

const LITERAL_SYMBOLS = 286;

const DISTANCE_SYMBOLS = 30;

const CODE_LENGTH_SYMBOLS = 19;

const END_OF_BLOCK = 256;

const MAX_CODE_BITS = 15;

const MAX_CODE_LENGTH_BITS = 7;

const LENGTH_CODE = buildLengthCodes();

const DISTANCE_CODE_LOW = new Uint8Array(256);

const DISTANCE_CODE_HIGH = new Uint8Array(256);

buildDistanceCodes();

function buildLengthCodes() {
  const table = new Uint8Array(MAX_MATCH + 1);
  let code = 0;
  for (let length = MIN_MATCH; length <= MAX_MATCH; length++) {
    while (code < LENGTH_BASE$1.length - 1 && length >= LENGTH_BASE$1[code + 1]) {
      code++;
    }
    table[length] = code;
  }
  return table;
}

function buildDistanceCodes() {
  for (let distance = 1; distance <= 256; distance++) {
    DISTANCE_CODE_LOW[distance - 1] = distanceCodeFor(distance);
  }
  for (let slot = 0; slot < 256; slot++) {
    DISTANCE_CODE_HIGH[slot] = distanceCodeFor((slot << 7) + 1);
  }
}

function distanceCodeFor(distance) {
  let code = 0;
  while (code < DISTANCE_BASE$1.length - 1 && distance >= DISTANCE_BASE$1[code + 1]) {
    code++;
  }
  return code;
}

function distanceCode(distance) {
  return distance <= 256 ? DISTANCE_CODE_LOW[distance - 1] : DISTANCE_CODE_HIGH[distance - 1 >>> 7];
}

class BitWriter {
  constructor(capacity) {
    this.length = 0;
    this.bitBuffer = 0;
    this.bitCount = 0;
    this.bytes = new Uint8Array(Math.max(capacity, 64));
  }
  get byteLength() {
    return this.length;
  }
  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }
  writeBits(value, count) {
    if (count === 0) return;
    this.bitBuffer |= value << this.bitCount;
    this.bitCount += count;
    this.ensure(4);
    while (this.bitCount >= 8) {
      this.bytes[this.length++] = this.bitBuffer & 255;
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }
  alignToByte() {
    if (this.bitCount > 0) {
      this.ensure(1);
      this.bytes[this.length++] = this.bitBuffer & 255;
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
  }
  writeBytes(source, start, end) {
    this.ensure(end - start);
    this.bytes.set(source.subarray(start, end), this.length);
    this.length += end - start;
  }
  finish() {
    this.alignToByte();
    return this.bytes.slice(0, this.length);
  }
}

function huffmanLengths(frequencies, limit) {
  const symbolCount = frequencies.length;
  const lengths = new Uint8Array(symbolCount);
  const used = [];
  for (let symbol = 0; symbol < symbolCount; symbol++) {
    if (frequencies[symbol] > 0) used.push(symbol);
  }
  if (used.length === 0) return lengths;
  if (used.length === 1) {
    lengths[used[0]] = 1;
    return lengths;
  }
  const weights = new Float64Array(used.length);
  for (let index = 0; index < used.length; index++) {
    weights[index] = frequencies[used[index]];
  }
  const order = used.map((_, index) => index);
  order.sort((a, b) => weights[a] - weights[b]);
  const leafCount = used.length;
  const nodeCount = 2 * leafCount - 1;
  const nodeWeight = new Float64Array(nodeCount);
  const leftChild = new Int32Array(nodeCount).fill(-1);
  const rightChild = new Int32Array(nodeCount).fill(-1);
  const depth = new Int32Array(nodeCount);
  for (;;) {
    for (let index = 0; index < leafCount; index++) {
      nodeWeight[index] = weights[order[index]];
    }
    let leafHead = 0;
    let internalHead = leafCount;
    let internalTail = leafCount;
    let next = leafCount;
    const takeSmallest = () => {
      if (leafHead < leafCount && (internalHead >= internalTail || nodeWeight[leafHead] <= nodeWeight[internalHead])) {
        return leafHead++;
      }
      return internalHead++;
    };
    while (leafCount - leafHead + (internalTail - internalHead) > 1) {
      const a = takeSmallest();
      const b = takeSmallest();
      nodeWeight[next] = nodeWeight[a] + nodeWeight[b];
      leftChild[next] = a;
      rightChild[next] = b;
      internalTail = ++next;
    }
    const root = next - 1;
    depth[root] = 0;
    let deepest = 0;
    for (let node = root; node >= leafCount; node--) {
      const own = depth[node];
      const left = leftChild[node];
      const right = rightChild[node];
      depth[left] = own + 1;
      depth[right] = own + 1;
      if (left < leafCount && own + 1 > deepest) deepest = own + 1;
      if (right < leafCount && own + 1 > deepest) deepest = own + 1;
    }
    if (deepest <= limit) {
      for (let index = 0; index < leafCount; index++) {
        lengths[used[order[index]]] = depth[index];
      }
      return lengths;
    }
    for (let index = 0; index < leafCount; index++) {
      weights[index] = Math.floor((weights[index] + 1) / 2);
    }
    order.sort((a, b) => weights[a] - weights[b]);
  }
}

function reverseBits$1(value, count) {
  let reversed = 0;
  for (let bit = 0; bit < count; bit++) {
    reversed = reversed << 1 | value >>> bit & 1;
  }
  return reversed;
}

function canonicalCodes(lengths, maxBits) {
  const codes = new Uint16Array(lengths.length);
  const blockCount = new Uint32Array(maxBits + 1);
  for (const length of lengths) {
    if (length > 0) blockCount[length]++;
  }
  const nextCode = new Uint32Array(maxBits + 2);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = code + blockCount[bits - 1] << 1;
    nextCode[bits] = code;
  }
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol];
    if (length > 0) {
      codes[symbol] = reverseBits$1(nextCode[length]++, length);
    }
  }
  return codes;
}

function encodeCodeLengths(lengths, count) {
  const symbols = [];
  const extras = [];
  const extraBits = [];
  const emit = (symbol, extra, bits) => {
    symbols.push(symbol);
    extras.push(extra);
    extraBits.push(bits);
  };
  let index = 0;
  while (index < count) {
    const length = lengths[index];
    let run = 1;
    while (index + run < count && lengths[index + run] === length) run++;
    index += run;
    if (length === 0) {
      while (run >= 11) {
        const take = Math.min(run, 138);
        emit(18, take - 11, 7);
        run -= take;
      }
      while (run >= 3) {
        const take = Math.min(run, 10);
        emit(17, take - 3, 3);
        run -= take;
      }
    } else {
      emit(length, 0, 0);
      run--;
      while (run >= 3) {
        const take = Math.min(run, 6);
        emit(16, take - 3, 2);
        run -= take;
      }
    }
    while (run > 0) {
      emit(length, 0, 0);
      run--;
    }
  }
  return {
    symbols,
    extras,
    extraBits
  };
}

class TokenBuffer {
  constructor() {
    this.values = new Uint16Array(BLOCK_TOKENS);
    this.distances = new Uint16Array(BLOCK_TOKENS);
    this.count = 0;
    this.literalFrequencies = new Uint32Array(LITERAL_SYMBOLS);
    this.distanceFrequencies = new Uint32Array(DISTANCE_SYMBOLS);
  }
  reset() {
    this.count = 0;
    this.literalFrequencies.fill(0);
    this.distanceFrequencies.fill(0);
    this.literalFrequencies[END_OF_BLOCK] = 1;
  }
  addLiteral(byte) {
    this.values[this.count] = byte;
    this.distances[this.count] = 0;
    this.count++;
    this.literalFrequencies[byte]++;
  }
  addMatch(length, distance) {
    this.values[this.count] = length;
    this.distances[this.count] = distance;
    this.count++;
    this.literalFrequencies[257 + LENGTH_CODE[length]]++;
    this.distanceFrequencies[distanceCode(distance)]++;
  }
}

function dynamicBlockCost(tokens, literalLengths, distanceLengths, runs, codeLengthLengths, headerCodeCount) {
  let bits = 3 + 5 + 5 + 4 + headerCodeCount * 3;
  for (let index = 0; index < runs.symbols.length; index++) {
    bits += codeLengthLengths[runs.symbols[index]] + runs.extraBits[index];
  }
  for (let symbol = 0; symbol < LITERAL_SYMBOLS; symbol++) {
    const frequency = tokens.literalFrequencies[symbol];
    if (frequency === 0) continue;
    bits += frequency * literalLengths[symbol];
    if (symbol >= 257) bits += frequency * LENGTH_EXTRA$1[symbol - 257];
  }
  for (let symbol = 0; symbol < DISTANCE_SYMBOLS; symbol++) {
    const frequency = tokens.distanceFrequencies[symbol];
    if (frequency === 0) continue;
    bits += frequency * (distanceLengths[symbol] + DISTANCE_EXTRA$1[symbol]);
  }
  return bits;
}

function writeStoredBlocks(writer, data, start, end, isFinal) {
  let cursor = start;
  do {
    const chunkEnd = Math.min(cursor + MAX_STORED, end);
    const last = isFinal && chunkEnd === end;
    writer.writeBits(last ? 1 : 0, 1);
    writer.writeBits(0, 2);
    writer.alignToByte();
    const length = chunkEnd - cursor;
    writer.writeBits(length & 255, 8);
    writer.writeBits(length >>> 8 & 255, 8);
    writer.writeBits(~length & 255, 8);
    writer.writeBits(~length >>> 8 & 255, 8);
    writer.writeBytes(data, cursor, chunkEnd);
    cursor = chunkEnd;
  } while (cursor < end);
}

function writeBlock(writer, tokens, data, start, end, isFinal) {
  if (tokens.distanceFrequencies.every(frequency => frequency === 0)) {
    tokens.distanceFrequencies[0] = 1;
  }
  const literalLengths = huffmanLengths(tokens.literalFrequencies, MAX_CODE_BITS);
  const distanceLengths = huffmanLengths(tokens.distanceFrequencies, MAX_CODE_BITS);
  let literalCount = LITERAL_SYMBOLS;
  while (literalCount > 257 && literalLengths[literalCount - 1] === 0) literalCount--;
  let distanceCount = DISTANCE_SYMBOLS;
  while (distanceCount > 1 && distanceLengths[distanceCount - 1] === 0) distanceCount--;
  const combined = new Uint8Array(literalCount + distanceCount);
  combined.set(literalLengths.subarray(0, literalCount), 0);
  combined.set(distanceLengths.subarray(0, distanceCount), literalCount);
  const runs = encodeCodeLengths(combined, combined.length);
  const codeLengthFrequencies = new Uint32Array(CODE_LENGTH_SYMBOLS);
  for (const symbol of runs.symbols) codeLengthFrequencies[symbol]++;
  const codeLengthLengths = huffmanLengths(codeLengthFrequencies, MAX_CODE_LENGTH_BITS);
  let headerCodeCount = CODE_LENGTH_SYMBOLS;
  while (headerCodeCount > 4 && codeLengthLengths[CODE_LENGTH_ORDER[headerCodeCount - 1]] === 0) {
    headerCodeCount--;
  }
  const dynamicBits = dynamicBlockCost(tokens, literalLengths, distanceLengths, runs, codeLengthLengths, headerCodeCount);
  const storedBits = 8 * (end - start) + 40 + 7;
  if (storedBits < dynamicBits) {
    writeStoredBlocks(writer, data, start, end, isFinal);
    return;
  }
  const literalCodes = canonicalCodes(literalLengths, MAX_CODE_BITS);
  const distanceCodes = canonicalCodes(distanceLengths, MAX_CODE_BITS);
  const codeLengthCodes = canonicalCodes(codeLengthLengths, MAX_CODE_LENGTH_BITS);
  writer.writeBits(isFinal ? 1 : 0, 1);
  writer.writeBits(2, 2);
  writer.writeBits(literalCount - 257, 5);
  writer.writeBits(distanceCount - 1, 5);
  writer.writeBits(headerCodeCount - 4, 4);
  for (let index = 0; index < headerCodeCount; index++) {
    writer.writeBits(codeLengthLengths[CODE_LENGTH_ORDER[index]], 3);
  }
  for (let index = 0; index < runs.symbols.length; index++) {
    const symbol = runs.symbols[index];
    writer.writeBits(codeLengthCodes[symbol], codeLengthLengths[symbol]);
    writer.writeBits(runs.extras[index], runs.extraBits[index]);
  }
  for (let index = 0; index < tokens.count; index++) {
    const value = tokens.values[index];
    const distance = tokens.distances[index];
    if (distance === 0) {
      writer.writeBits(literalCodes[value], literalLengths[value]);
      continue;
    }
    const lengthIndex = LENGTH_CODE[value];
    const lengthSymbol = 257 + lengthIndex;
    writer.writeBits(literalCodes[lengthSymbol], literalLengths[lengthSymbol]);
    writer.writeBits(value - LENGTH_BASE$1[lengthIndex], LENGTH_EXTRA$1[lengthIndex]);
    const distanceIndex = distanceCode(distance);
    writer.writeBits(distanceCodes[distanceIndex], distanceLengths[distanceIndex]);
    writer.writeBits(distance - DISTANCE_BASE$1[distanceIndex], DISTANCE_EXTRA$1[distanceIndex]);
  }
  writer.writeBits(literalCodes[END_OF_BLOCK], literalLengths[END_OF_BLOCK]);
}

function adler32$1(bytes) {
  let a = 1;
  let b = 0;
  let index = 0;
  while (index < bytes.length) {
    const end = Math.min(index + 5552, bytes.length);
    while (index < end) {
      a += bytes[index++];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return (b << 16 | a) >>> 0;
}

function writeDeflate(writer, data) {
  if (data.length === 0) {
    writeStoredBlocks(writer, data, 0, 0, true);
    return;
  }
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const previous = new Int32Array(WINDOW_SIZE).fill(-1);
  const tokens = new TokenBuffer;
  tokens.reset();
  let blockStart = 0;
  let position = 0;
  let hash = 0;
  const insert = at => {
    const slot = hash;
    previous[at & WINDOW_MASK] = head[slot];
    head[slot] = at;
    return slot;
  };
  const rollHash = at => {
    hash = (hash << 5 ^ data[at]) & HASH_MASK;
  };
  if (data.length >= MIN_MATCH) {
    rollHash(0);
    rollHash(1);
  }
  while (position < data.length) {
    let matchLength = 0;
    let matchDistance = 0;
    if (position + MIN_MATCH <= data.length) {
      rollHash(position + MIN_MATCH - 1);
      let candidate = head[hash];
      let chain = MAX_CHAIN;
      const limit = position - WINDOW_SIZE;
      while (candidate > limit && candidate >= 0 && chain-- > 0) {
        if (data[candidate + matchLength] === data[position + matchLength] && data[candidate] === data[position]) {
          let length = 0;
          const maximum = Math.min(MAX_MATCH, data.length - position);
          while (length < maximum && data[candidate + length] === data[position + length]) {
            length++;
          }
          if (length > matchLength) {
            matchLength = length;
            matchDistance = position - candidate;
            if (length >= maximum) break;
          }
        }
        candidate = previous[candidate & WINDOW_MASK];
      }
    }
    if (matchLength >= MIN_MATCH) {
      tokens.addMatch(matchLength, matchDistance);
      const end = position + matchLength;
      insert(position);
      for (let at = position + 1; at < end; at++) {
        if (at + MIN_MATCH <= data.length) {
          rollHash(at + MIN_MATCH - 1);
          insert(at);
        }
      }
      position = end;
    } else {
      tokens.addLiteral(data[position]);
      if (position + MIN_MATCH <= data.length) insert(position);
      position++;
    }
    if (tokens.count >= BLOCK_TOKENS - 1) {
      writeBlock(writer, tokens, data, blockStart, position, false);
      tokens.reset();
      blockStart = position;
    }
  }
  writeBlock(writer, tokens, data, blockStart, position, true);
}

function deflateRaw(data) {
  const writer = new BitWriter(Math.max(64, data.length >>> 1));
  writeDeflate(writer, data);
  return writer.finish();
}

function deflateZlib(data) {
  const writer = new BitWriter(Math.max(64, (data.length >>> 1) + 6));
  writer.writeBytes(new Uint8Array([ 120, 156 ]), 0, 2);
  writeDeflate(writer, data);
  writer.alignToByte();
  const checksum = adler32$1(data);
  const trailer = new Uint8Array(4);
  trailer[0] = checksum >>> 24 & 255;
  trailer[1] = checksum >>> 16 & 255;
  trailer[2] = checksum >>> 8 & 255;
  trailer[3] = checksum & 255;
  writer.writeBytes(trailer, 0, trailer.length);
  return writer.finish();
}

class PdfDictStream extends PdfDict {
  constructor(data = new Uint8Array(0), values, compress = false) {
    super(values);
    this.data = data;
    this.compress = compress;
  }
  output(s) {
    const params = new PdfDict(this.values);
    let data = this.data;
    if (this.compress && !params.has("/Filter")) {
      const deflated = deflateZlib(data);
      if (deflated.length < data.length) {
        params.set("/Filter", new PdfName("/FlateDecode"));
        data = deflated;
      }
    }
    params.set("/Length", new PdfNum(data.length));
    params.output(s);
    s.putString("\nstream\n");
    s.putBytes(data);
    if (data.length === 0 || data[data.length - 1] !== 10) {
      s.putByte(10);
    }
    s.putString("endstream");
  }
}

class PdfObjectStream extends PdfObject {
  constructor(document, data, compress) {
    super(document, new PdfDictStream(data, undefined, compress ?? document.settings.compress));
  }
}

const hex4 = value => value.toString(16).toUpperCase().padStart(4, "0");

function fontCmap(values, protect = false, cid = false, simple = false, ros = {
  registry: "Adobe",
  ordering: "UCS",
  supplement: 0
}) {
  let result = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" + `/CIDSystemInfo << /Registry ${pdfLiteral(ros.registry)} /Ordering ${pdfLiteral(ros.ordering)} /Supplement ${ros.supplement} >> def\n` + `/CMapName /${cid ? "JsPdfEncoding" : "Adobe-Identity-UCS"} def\n/CMapType ${cid ? 1 : 2} def\n` + (cid ? "/WMode 0 def\n" : "") + `1 begincodespacerange\n<${simple ? "00> <FF" : "0000> <FFFF"}>\nendcodespacerange\n`;
  for (let start = 0; start < values.length; start += 100) {
    const end = Math.min(start + 100, values.length);
    result += `${end - start} begin${cid ? "cid" : "bf"}char\n`;
    for (let index = start; index < end; index++) {
      const rune = protect && index !== 0 ? 32 : values[index];
      const destination = rune <= 65535 ? hex4(rune) : hex4(55296 + (rune - 65536 >> 10)) + hex4(56320 + (rune - 65536 & 1023));
      result += `<${simple ? index.toString(16).padStart(2, "0") : hex4(index)}> ${cid ? rune : "<" + destination + ">"}\n`;
    }
    result += `end${cid ? "cid" : "bf"}char\n`;
  }
  return result + "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
}

class PdfUnicodeCmap extends PdfObjectStream {
  constructor(document, cmap, protect = false, simple = false) {
    super(document, encodeLatin1(fontCmap(cmap, protect, false, simple)));
  }
}

class PdfTtfFont {
  constructor(bytes, {protect = false, unicode, simpleTrueTypeFonts = false} = {}) {
    this.cmap = [ 0 ];
    this.cidByRune = new Map([ [ 0, 0 ] ]);
    this.font = new TtfParser(bytes);
    this.protect = protect;
    if (this.font.tableOffsets.has("CFF2")) throw new TypeError("CFF2 variable outlines require a static CFF1 instance");
    this.isComposite = unicode ?? (this.font.hasCff || this.font.unicode && !simpleTrueTypeFonts);
    if (this.font.hasCff && !this.isComposite) throw new TypeError("CFF fonts require composite encoding");
    this.cffMetadata = this.font.hasCff ? cffFontMetadata(bytes.subarray(this.font.tableOffsets.get("CFF "), this.font.tableOffsets.get("CFF ") + this.font.tableSize.get("CFF ")), this.font.numGlyphs) : null;
    if (!this.font.hasCff && !this.font.tableOffsets.has("glyf") && !this.font.isBitmap) {
      throw new TypeError("Font has no supported outlines");
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
    return (this.isComposite || isWinAnsiRune(codePoint)) && this.font.charToGlyphIndexMap.has(codePoint);
  }
  getBitmap(codePoint) {
    return this.font.getBitmap(codePoint);
  }
  glyphMetrics(codePoint) {
    if (!this.isComposite) codePoint = winAnsiRune(toWinAnsiByte(codePoint));
    const glyph = this.font.charToGlyphIndexMap.get(codePoint);
    if (glyph === undefined) {
      return PdfFontMetrics.zero;
    }
    const metrics = this.font.glyphInfoMap.get(glyph) ?? PdfFontMetrics.zero;
    if (!isArabicDiacritic(codePoint)) return metrics;
    return new PdfFontMetrics({
      left: metrics.left,
      top: metrics.top,
      right: metrics.right,
      bottom: metrics.bottom,
      ascent: metrics.ascent,
      descent: metrics.descent,
      advanceWidth: 0,
      leftBearing: metrics.leftBearing
    });
  }
  stringMetrics(text, size, letterSpacing = 0) {
    const metrics = [];
    for (const character of String(text)) {
      metrics.push(this.glyphMetrics(character.codePointAt(0) ?? 0).scale(size));
    }
    return PdfFontMetrics.append(metrics, letterSpacing);
  }
  encodeText(text) {
    if (!this.isComposite) return pdfLiteral(text);
    const cids = [];
    for (const character of String(text)) {
      const rune = character.codePointAt(0) ?? 0;
      let cid = this.cidByRune.get(rune);
      if (cid === undefined) {
        cid = this.cmap.length;
        if (cid > 65535) throw new RangeError("Font encoding exceeds 65535 character codes");
        this.cmap.push(rune);
        this.cidByRune.set(rune, cid);
      }
      cids.push(cid);
    }
    return pdfHexString(cids);
  }
  resourceDict(document) {
    if (!this.isComposite || this.font.hasCff) return this.fullFontResource(document);
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
  fullFontResource(document) {
    const cff = this.font.hasCff;
    const file = new PdfObjectStream(document, this.font.bytes);
    if (cff) file.params.set("/Subtype", new PdfName("/OpenType")); else file.params.set("/Length1", new PdfNum(this.font.bytes.length));
    const scale = 1e3 / this.font.unitsPerEm;
    const descriptor = new PdfFontDescriptor(document, {
      fontName: this.fontName,
      file,
      fileKey: cff ? "/FontFile3" : "/FontFile2",
      flags: cff ? 4 : 32,
      fontBBox: [ this.font.xMin * scale, this.font.yMin * scale, this.font.xMax * scale, this.font.yMax * scale ],
      ascent: this.ascent,
      descent: this.descent
    });
    if (!cff) {
      const widths = Array.from({
        length: 224
      }, (_, index) => {
        const rune = winAnsiRune(index + 32);
        return Math.trunc(this.glyphMetrics(rune).advanceWidth * 1e3);
      });
      return new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/Subtype", new PdfName("/TrueType") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/Encoding", new PdfName("/WinAnsiEncoding") ], [ "/FontDescriptor", descriptor.ref() ], [ "/FirstChar", new PdfNum(32) ], [ "/LastChar", new PdfNum(255) ], [ "/Widths", PdfArray.fromNum(widths) ], [ "/ToUnicode", new PdfUnicodeCmap(document, Array.from({
        length: 256
      }, (_, i) => winAnsiRune(i)), this.protect, true).ref() ] ]);
    }
    const {registry, ordering, supplement} = this.cffMetadata;
    const encoding = fontCmap(this.cmap.map(rune => this.cffMetadata.cids[this.font.charToGlyphIndexMap.get(rune) ?? 0] ?? 0), false, true, false, {
      registry,
      ordering,
      supplement
    });
    const widths = new PdfArray;
    const seen = new Set;
    for (const rune of this.cmap) {
      const cid = this.cffMetadata.cids[this.font.charToGlyphIndexMap.get(rune) ?? 0] ?? 0;
      if (seen.has(cid)) continue;
      seen.add(cid);
      widths.add(new PdfNum(cid));
      widths.add(PdfArray.fromNum([ Math.trunc(this.glyphMetrics(rune).advanceWidth * 1e3) ]));
    }
    const descendant = new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/Subtype", new PdfName("/CIDFontType0") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/FontDescriptor", descriptor.ref() ], [ "/W", widths ], [ "/CIDSystemInfo", new PdfDict([ [ "/Registry", new PdfString(registry) ], [ "/Ordering", new PdfString(ordering) ], [ "/Supplement", new PdfNum(supplement) ] ]) ] ]);
    return new PdfDict([ [ "/Type", new PdfName("/Font") ], [ "/Subtype", new PdfName("/Type0") ], [ "/BaseFont", new PdfName(`/${this.fontName}`) ], [ "/Encoding", new PdfObjectStream(document, encodeLatin1(encoding)).ref() ], [ "/DescendantFonts", new PdfArray([ descendant ]) ], [ "/ToUnicode", new PdfUnicodeCmap(document, this.cmap, this.protect).ref() ] ]);
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

function huffman$1(lengths) {
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

class ByteBuffer {
  constructor() {
    this.bytes = new Uint8Array(1024);
    this.length = 0;
  }
  ensure(extra) {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }
  push(byte) {
    this.ensure(1);
    this.bytes[this.length++] = byte;
  }
  append(bytes) {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }
  repeat(distance, length) {
    this.ensure(length);
    let source = this.length - distance;
    for (let index = 0; index < length; index++) {
      this.bytes[this.length++] = this.bytes[source++];
    }
  }
  view() {
    return this.bytes.subarray(0, this.length);
  }
}

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
    output.repeat(distance, length);
  }
}

function fixedTables() {
  const literalLengths = new Array(288);
  for (let symbol = 0; symbol <= 143; symbol++) literalLengths[symbol] = 8;
  for (let symbol = 144; symbol <= 255; symbol++) literalLengths[symbol] = 9;
  for (let symbol = 256; symbol <= 279; symbol++) literalLengths[symbol] = 7;
  for (let symbol = 280; symbol <= 287; symbol++) literalLengths[symbol] = 8;
  return [ huffman$1(literalLengths), huffman$1(new Array(32).fill(5)) ];
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
  const codes = huffman$1(codeLengths);
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
  const literals = huffman$1(lengths.slice(0, literalCount));
  const distanceLengths = lengths.slice(literalCount);
  const distances = distanceLengths.every(length => length === 0) ? [ 1, ...distanceLengths.slice(1) ] : distanceLengths;
  return [ literals, huffman$1(distances) ];
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  let index = 0;
  while (index < bytes.length) {
    const end = Math.min(index + 5552, bytes.length);
    while (index < end) {
      a += bytes[index++];
      b += a;
    }
    a %= 65521;
    b %= 65521;
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
  const output = new ByteBuffer;
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
  if (adler32(output.view()) !== expected) throw new RangeError("Invalid zlib checksum");
  return output.view();
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

function unfilter(data, offset, width, height, bitsPerPixel, consume) {
  const rowBytes = Math.ceil(width * bitsPerPixel / 8);
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  let previous = new Uint8Array(rowBytes);
  let row = new Uint8Array(rowBytes);
  let cursor = offset;
  for (let y = 0; y < height; y++) {
    const filter = data[cursor++];
    if (filter === undefined || filter > 4) throw new RangeError(`Invalid PNG filter ${String(filter)}`);
    if (cursor + rowBytes > data.length) throw new RangeError("Truncated PNG scanline");
    for (let index = 0; index < rowBytes; index++) {
      const raw = data[cursor++];
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
      const upper = previous[index];
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left; else if (filter === 2) predictor = upper; else if (filter === 3) predictor = Math.floor((left + upper) / 2); else if (filter === 4) predictor = paeth(left, upper, upperLeft);
      row[index] = raw + predictor & 255;
    }
    consume(row, y);
    const swap = previous;
    previous = row;
    row = swap;
  }
  return cursor;
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
  const idat = new ByteBuffer;
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
      idat.append(data);
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
  const inflated = inflateZlib(idat.view());
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * bitDepth;
  const pixels = new Uint8Array(width * height * 4);
  pixels.fill(255);
  let cursor = 0;
  let hasAlpha = false;
  if (interlace === 0) {
    cursor = unfilter(inflated, cursor, width, height, bitsPerPixel, (row, y) => {
      hasAlpha = writePixels(pixels, row, width, y * width, 0, 1, colorType, bitDepth, palette, transparency) || hasAlpha;
    });
  } else {
    const startsX = [ 0, 4, 0, 2, 0, 1, 0 ];
    const startsY = [ 0, 0, 4, 0, 2, 0, 1 ];
    const stepsX = [ 8, 8, 4, 4, 2, 2, 1 ];
    const stepsY = [ 8, 8, 8, 4, 4, 2, 2 ];
    for (let pass = 0; pass < 7; pass++) {
      const passWidth = passSize(width, startsX[pass], stepsX[pass]);
      const passHeight = passSize(height, startsY[pass], stepsY[pass]);
      if (passWidth === 0 || passHeight === 0) continue;
      cursor = unfilter(inflated, cursor, passWidth, passHeight, bitsPerPixel, (row, y) => {
        const targetY = startsY[pass] + y * stepsY[pass];
        hasAlpha = writePixels(pixels, row, passWidth, targetY * width, startsX[pass], stepsX[pass], colorType, bitDepth, palette, transparency) || hasAlpha;
      });
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

const DCT_SOF_MARKERS = Object.freeze([ 192, 193, 194 ]);

function u16(bytes, offset) {
  const high = bytes[offset];
  const low = bytes[offset + 1];
  if (high === undefined || low === undefined) throw new RangeError("Truncated JPEG segment");
  return high << 8 | low;
}

function exifOrientation(bytes, start, end) {
  if (end - start < 14 || bytes[start] !== 69 || bytes[start + 1] !== 120 || bytes[start + 2] !== 105 || bytes[start + 3] !== 102 || bytes[start + 4] !== 0 || bytes[start + 5] !== 0) return null;
  const tiff = start + 6;
  const little = bytes[tiff] === 73 && bytes[tiff + 1] === 73;
  const big = bytes[tiff] === 77 && bytes[tiff + 1] === 77;
  if (!little && !big) return null;
  const read16 = offset => {
    if (offset < tiff || offset + 2 > end) return null;
    return little ? bytes[offset] | bytes[offset + 1] << 8 : bytes[offset] << 8 | bytes[offset + 1];
  };
  const read32 = offset => {
    if (offset < tiff || offset + 4 > end) return null;
    return little ? bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216 >>> 0 : bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3] >>> 0;
  };
  if (read16(tiff + 2) !== 42) return null;
  const firstIfd = read32(tiff + 4);
  if (firstIfd === null) return null;
  const directory = tiff + firstIfd;
  const count = read16(directory);
  if (count === null || directory + 2 + count * 12 > end) return null;
  const orientations = [ "topLeft", "topRight", "bottomRight", "bottomLeft", "leftTop", "rightTop", "rightBottom", "leftBottom" ];
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (read16(entry) !== 274 || read16(entry + 2) !== 3 || read32(entry + 4) !== 1) continue;
    const value = read16(entry + 8);
    return value === null ? null : orientations[value - 1] ?? null;
  }
  return null;
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
  let adobe = false;
  let orientation = "topLeft";
  let foundFrame = false;
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
      if (!DCT_SOF_MARKERS.includes(marker)) {
        throw new RangeError(`Unsupported JPEG frame marker 0x${marker.toString(16)}`);
      }
      if (length < 8) throw new RangeError("Truncated JPEG frame");
      bitsPerComponent = bytes[dataStart];
      height = u16(bytes, dataStart + 1);
      width = u16(bytes, dataStart + 3);
      components = bytes[dataStart + 5];
      const expectedLength = 8 + components * 3;
      if (length < expectedLength) throw new RangeError("Truncated JPEG component table");
      foundFrame = true;
    } else if (marker === 225) {
      orientation = exifOrientation(bytes, dataStart, dataEnd) ?? orientation;
    } else if (marker === 238 && length >= 7 && bytes[dataStart] === 65 && bytes[dataStart + 1] === 100 && bytes[dataStart + 2] === 111 && bytes[dataStart + 3] === 98 && bytes[dataStart + 4] === 101) {
      adobe = true;
    }
    offset = dataEnd;
  }
  if (!foundFrame) throw new RangeError("Unable to find a JPEG frame");
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
    inverted: colorSpace === "cmyk" && adobe,
    orientation
  };
}

class PdfXObject extends PdfObjectStream {
  constructor(document, subtype, data = new Uint8Array(0), compress) {
    super(document, data, compress);
    this.params.set("/Type", new PdfName("/XObject"));
    if (subtype !== null) this.params.set("/Subtype", new PdfName(subtype));
  }
  get name() {
    return `/X${this.objser}`;
  }
}

class PdfImage {
  constructor(options) {
    this.rgba = null;
    const encoded = "jpeg" in options;
    const lazy = "write" in options;
    const width = encoded ? options.info.width : options.width;
    const height = encoded ? options.info.height : options.height;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError("Image dimensions must be positive integers");
    }
    if (!encoded && "pixels" in options && options.pixels.length !== width * height * 4) {
      throw new RangeError(`RGBA image needs ${width * height * 4} bytes, received ${options.pixels.length}`);
    }
    if (lazy && (!Number.isSafeInteger(options.length) || options.length <= 0)) {
      throw new RangeError("JPEG stream length must be a positive safe integer");
    }
    if (lazy && typeof options.write !== "function") throw new TypeError("JPEG stream write must be a function");
    this.streamWriter = lazy ? options.write : null;
    this.streamLength = lazy ? options.length : null;
    const pixelCount = width * height;
    if (encoded || lazy) {
      this.rgb = null;
      this.alpha = null;
    } else if ("rgb" in options) {
      if (options.rgb.length !== pixelCount * 3) {
        throw new RangeError(`RGB image needs ${pixelCount * 3} bytes, received ${options.rgb.length}`);
      }
      if (options.alpha !== null && options.alpha.length !== pixelCount) {
        throw new RangeError(`Alpha image needs ${pixelCount} bytes, received ${options.alpha.length}`);
      }
      this.rgb = options.rgb;
      this.alpha = options.alpha;
    } else {
      const rgb = new Uint8Array(pixelCount * 3);
      const alpha = options.hasAlpha ?? true ? new Uint8Array(pixelCount) : null;
      for (let index = 0; index < pixelCount; index++) {
        rgb[index * 3] = options.pixels[index * 4];
        rgb[index * 3 + 1] = options.pixels[index * 4 + 1];
        rgb[index * 3 + 2] = options.pixels[index * 4 + 2];
        if (alpha !== null) alpha[index] = options.pixels[index * 4 + 3];
      }
      this.rgb = rgb;
      this.alpha = alpha;
    }
    this.jpeg = encoded ? options.jpeg : null;
    this.jpegInfo = encoded ? options.info : null;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.hasAlpha = this.alpha !== null;
    this.orientation = options.orientation ?? "topLeft";
  }
  static fromPng(bytes, orientation = "topLeft") {
    const decoded = decodePng(bytes);
    return new PdfImage({
      ...decoded,
      orientation
    });
  }
  static fromJpeg(bytes, orientation) {
    const jpeg = bytes.slice();
    const info = parseJpeg(jpeg);
    return new PdfImage({
      jpeg,
      info,
      orientation: orientation ?? info.orientation
    });
  }
  static jpegStream(options) {
    return new PdfImage(options);
  }
  get pixels() {
    if (this.rgb === null) return null;
    if (this.rgba === null) {
      const pixelCount = this.sourceWidth * this.sourceHeight;
      const pixels = new Uint8Array(pixelCount * 4);
      for (let index = 0; index < pixelCount; index++) {
        pixels[index * 4] = this.rgb[index * 3];
        pixels[index * 4 + 1] = this.rgb[index * 3 + 1];
        pixels[index * 4 + 2] = this.rgb[index * 3 + 2];
        pixels[index * 4 + 3] = this.alpha?.[index] ?? 255;
      }
      this.rgba = pixels;
    }
    return this.rgba;
  }
  channel(channel) {
    if (channel === "rgb") {
      if (this.rgb === null) throw new RangeError("Encoded images have no decoded RGB channel");
      return this.rgb;
    }
    if (this.alpha === null) throw new RangeError("The image has no separate alpha channel");
    return this.alpha;
  }
  resize(width) {
    if (this.rgb === null || width === this.sourceWidth) return this;
    const height = Math.max(1, Math.round(this.sourceHeight * width / this.sourceWidth));
    const rgb = new Uint8Array(width * height * 3);
    const alpha = this.alpha === null ? null : new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(this.sourceHeight - 1, Math.floor(y * this.sourceHeight / height));
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(this.sourceWidth - 1, Math.floor(x * this.sourceWidth / width));
        const source = sourceY * this.sourceWidth + sourceX;
        const destination = y * width + x;
        rgb[destination * 3] = this.rgb[source * 3];
        rgb[destination * 3 + 1] = this.rgb[source * 3 + 1];
        rgb[destination * 3 + 2] = this.rgb[source * 3 + 2];
        if (alpha !== null) alpha[destination] = this.alpha[source];
      }
    }
    return new PdfImage({
      rgb,
      alpha,
      width,
      height,
      orientation: this.orientation
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
    const lazy = image.streamWriter !== null;
    let data;
    if (lazy) {
      if (channel === "alpha") throw new RangeError("A JPEG image has no separate alpha channel");
      data = new Uint8Array(0);
    } else if (jpeg !== null) {
      if (channel === "alpha") throw new RangeError("A JPEG image has no separate alpha channel");
      data = jpeg;
    } else {
      data = image.channel(channel);
    }
    super(document, "/Image", data);
    this.streamWriter = image.streamWriter;
    this.streamLength = image.streamLength;
    this.params.set("/Width", new PdfNum(image.sourceWidth));
    this.params.set("/Height", new PdfNum(image.sourceHeight));
    this.params.set("/BitsPerComponent", new PdfNum(8));
    const info = image.jpegInfo;
    if (info !== null || lazy) {
      this.params.set("/Intent", new PdfName("/RelativeColorimetric"));
      this.params.set("/Filter", new PdfName("/DCTDecode"));
      this.params.set("/ColorSpace", new PdfName(info?.colorSpace === "gray" ? "/DeviceGray" : info?.colorSpace === "cmyk" ? "/DeviceCMYK" : "/DeviceRGB"));
      if (info?.inverted) this.params.set("/Decode", PdfArray.fromNum([ 1, 0, 1, 0, 1, 0, 1, 0 ]));
    } else {
      this.params.set("/ColorSpace", new PdfName(channel === "rgb" ? "/DeviceRGB" : "/DeviceGray"));
    }
  }
  writeContent(output) {
    if (this.streamWriter === null) {
      super.writeContent(output);
      return;
    }
    const params = new PdfDict(this.params.values);
    params.set("/Length", new PdfNum(this.streamLength));
    params.output(output);
    output.putString("\nstream\n");
    const start = output.offset;
    this.streamWriter(output);
    const written = output.offset - start;
    if (written !== this.streamLength) {
      throw new RangeError(`JPEG stream wrote ${written} bytes; expected ${this.streamLength}`);
    }
    output.putString("\nendstream\n");
  }
  setSoftMask(mask) {
    this.params.set("/SMask", mask.ref());
  }
}

class PdfPageLabel {
  constructor({prefix = null, style = null, subsequent = null} = {}) {
    const styles = [ "arabic", "romanUpper", "romanLower", "lettersUpper", "lettersLower" ];
    if (style !== null && !styles.includes(style)) {
      throw new TypeError(`Unknown page label style: ${String(style)}`);
    }
    this.prefix = prefix === null ? null : String(prefix);
    this.style = style;
    this.subsequent = subsequent === null ? null : Number(subsequent);
    if (this.subsequent !== null && (!Number.isInteger(this.subsequent) || this.subsequent < 1)) {
      throw new RangeError("Page label subsequent must be a positive integer");
    }
  }
  static arabic(options = {}) {
    return new PdfPageLabel({
      ...options,
      style: "arabic"
    });
  }
  static romanUpper(options = {}) {
    return new PdfPageLabel({
      ...options,
      style: "romanUpper"
    });
  }
  static romanLower(options = {}) {
    return new PdfPageLabel({
      ...options,
      style: "romanLower"
    });
  }
  static lettersUpper(options = {}) {
    return new PdfPageLabel({
      ...options,
      style: "lettersUpper"
    });
  }
  static lettersLower(options = {}) {
    return new PdfPageLabel({
      ...options,
      style: "lettersLower"
    });
  }
  toDict() {
    const result = new PdfDict;
    const styleNames = {
      arabic: "/D",
      romanUpper: "/R",
      romanLower: "/r",
      lettersUpper: "/A",
      lettersLower: "/a"
    };
    if (this.style !== null) result.set("/S", new PdfName(styleNames[this.style]));
    if (this.prefix !== null && this.prefix.length > 0) result.set("/P", new PdfString(this.prefix));
    if (this.subsequent !== null) result.set("/St", new PdfNum(this.subsequent));
    return result;
  }
  toRoman(decimal) {
    if (decimal < 1 || decimal > 3999) {
      throw new RangeError("Roman page labels are limited to 1 through 3999");
    }
    const dictionary = [ [ 1e3, "M" ], [ 900, "CM" ], [ 500, "D" ], [ 400, "CD" ], [ 100, "C" ], [ 90, "XC" ], [ 50, "L" ], [ 40, "XL" ], [ 10, "X" ], [ 9, "IX" ], [ 5, "V" ], [ 4, "IV" ], [ 1, "I" ] ];
    let value = decimal;
    let result = "";
    for (const [number, numeral] of dictionary) {
      while (value >= number) {
        value -= number;
        result += numeral;
      }
    }
    return result;
  }
  toLetters(decimal) {
    const letter = String.fromCharCode(65 + decimal % 26);
    return letter.repeat(Math.floor(decimal / 26) + 1);
  }
  asString(index = 0) {
    const number = index + (this.subsequent === null ? 0 : this.subsequent - 1);
    let suffix = "";
    switch (this.style) {
     case "arabic":
      suffix = String(number + 1);
      break;

     case "romanUpper":
      suffix = this.toRoman(number + 1);
      break;

     case "romanLower":
      suffix = this.toRoman(number + 1).toLowerCase();
      break;

     case "lettersUpper":
      suffix = this.toLetters(number);
      break;

     case "lettersLower":
      suffix = this.toLetters(number).toLowerCase();
      break;
    }
    return `${this.prefix ?? ""}${suffix}`;
  }
}

class PdfPageLabels extends PdfObject {
  constructor(document) {
    super(document, new PdfDict);
    this.labels = new Map;
  }
  pageLabel(index) {
    const keys = [ ...this.labels.keys() ].sort((a, b) => a - b);
    let current = PdfPageLabel.arabic();
    let start = 0;
    for (const key of keys) {
      if (index < key) break;
      current = this.labels.get(key) ?? current;
      start = key;
    }
    return current.asString(index - start);
  }
  prepare() {
    const nums = new PdfArray;
    const keys = [ ...this.labels.keys() ].sort((a, b) => a - b);
    if (keys.length > 0 && keys[0] !== 0) {
      nums.add(new PdfNum(0));
      nums.add(PdfPageLabel.arabic().toDict());
    }
    for (const key of keys) {
      const label = this.labels.get(key);
      if (label === undefined) continue;
      nums.add(new PdfNum(key));
      nums.add(label.toDict());
    }
    this.params.set("/Nums", nums);
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
    return new Font(simpleTrueTypeFonts => new PdfTtfFont(data, {
      simpleTrueTypeFonts,
      ...options
    }));
  }
  static fromPdfFont(font) {
    return new Font(() => font);
  }
  build(simpleTrueTypeFonts = false) {
    return this.create(simpleTrueTypeFonts);
  }
  getFont(context) {
    return context.document.resolveFont(this);
  }
}

const DEFAULT_FONT_SIZE = 12;

const DEFAULT_LINE_HEIGHT = 1;

class TextStyle {
  constructor({inherit = true, color = null, font = null, fontNormal = null, fontBold = null, fontItalic = null, fontBoldItalic = null, fontFallback = null, fontSize = null, fontWeight = null, fontStyle = null, letterSpacing = null, wordSpacing = null, lineSpacing = null, height = null, background = null, decoration = null, decorationColor = null, decorationStyle = null, decorationThickness = null} = {}) {
    const isItalic = fontStyle === "italic";
    const isBold = fontWeight === "bold";
    this.inherit = inherit;
    this.color = color == null ? null : normalizePaintColor(color);
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
    this.decorationColor = decorationColor == null ? null : normalizePaintColor(decorationColor);
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
    this.color = normalizePaintColor(color);
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

class InheritedDirectionality extends Inherited {
  constructor(textDirection) {
    super();
    this.textDirection = textDirection;
  }
}

class Directionality extends StatelessWidget {
  constructor({textDirection, child}) {
    super();
    if (textDirection !== "ltr" && textDirection !== "rtl") {
      throw new TypeError(`Unknown text direction: ${String(textDirection)}`);
    }
    this.textDirection = textDirection;
    this.child = child;
  }
  static of(context) {
    return InheritedWidget.of(context, InheritedDirectionality)?.textDirection ?? context.textDirection ?? "ltr";
  }
  build(_context) {
    return new InheritedWidget({
      inherited: new InheritedDirectionality(this.textDirection),
      build: () => this.child
    });
  }
}

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
    const numeric = parseNumeric(text, brush);
    if (numeric === null) {
      throw new SyntaxError(`Not a number: "${text}"`);
    }
    return numeric;
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
  lengthIn(axis) {
    const viewport = this.brush?.viewport;
    if (this.unit !== "percent" || viewport === null || viewport === undefined) {
      return this.sizeValue;
    }
    const {width, height} = viewport;
    return this.value / 100 * (axis === "x" ? width : axis === "y" ? height : Math.sqrt((width * width + height * height) / 2));
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

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function parseNumbers(text) {
  return /^[\s,]*$/.test(text.replace(NUMBER, " ")) ? (text.match(NUMBER) ?? []).map(Number) : null;
}

function parseViewBox(value) {
  const box = value === null ? null : parseNumbers(value);
  return box?.length === 4 && box[2] > 0 && box[3] > 0 ? {
    x: box[0],
    y: box[1],
    width: box[2],
    height: box[3]
  } : null;
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

function parseNumeric(text, brush) {
  const match = /([-+]?[\d.]+)\s*(px|pt|em|cm|mm|in|%|)/.exec(text);
  const value = match === null ? NaN : Number.parseFloat(match[1]);
  return Number.isFinite(value) ? new SvgNumeric(value, brush, UNIT_SUFFIXES[match[2] ?? ""] ?? "direct") : null;
}

function getDouble(element, name, {namespace, defaultValue = 0} = {}) {
  const attribute = element.getAttribute(name, namespace);
  if (attribute === null) {
    return defaultValue;
  }
  const value = Number.parseFloat(attribute);
  return Number.isFinite(value) ? value : defaultValue;
}

function getNumeric(element, name, brush, {namespace, defaultValue = null} = {}) {
  const attribute = element.getAttribute(name, namespace);
  return (attribute === null ? null : parseNumeric(attribute, brush)) ?? (defaultValue === null ? null : new SvgNumeric(defaultValue, null));
}

const STYLE_DECLARATION = /([\w-]+)\s*:\s*([\s\S]*)/;

const STYLE_SPLIT = /(?:[^;'"(]|'[^']*'|"[^"]*"|\([^)]*\))+/g;

function convertStyle(element) {
  const style = element.getAttribute("style")?.trim();
  if (style === undefined || style === null || style.length === 0) {
    return;
  }
  for (const declaration of style.match(STYLE_SPLIT) ?? []) {
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
    const size = name => {
      const numeric = getNumeric(root, name, null);
      return numeric === null || numeric.unit === "percent" ? null : numeric.sizeValue;
    };
    const width = size("width");
    const height = size("height");
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
    const lower = value.toLowerCase();
    if (lower === "transparent") {
      return new SvgColor([ 0, 0, 0 ], false, 0);
    }
    const named = svgColors[lower];
    if (named !== undefined) {
      return new SvgColor(normalizeColor(named));
    }
    if (/^(rgb|hsl)a?\s*\(/.test(lower)) {
      try {
        const parts = splitNumeric(functionArguments(value), null);
        const [first, second, third, alpha] = parts;
        if (third === undefined || parts.some(part => part.unit !== "direct" && part.unit !== "percent")) {
          return SvgColor.unknown;
        }
        const rgb = lower.startsWith("hsl") ? hslToRgb(first.unit === "percent" ? first.value / 100 : first.value / 360, second.colorValue, third.colorValue) : [ first.colorValue, second.colorValue, third.colorValue ];
        const opacity = alpha === undefined ? 1 : alpha.unit === "percent" ? alpha.value / 100 : alpha.value;
        return new SvgColor(rgb, false, Math.min(1, Math.max(0, opacity)));
      } catch {
        return SvgColor.unknown;
      }
    }
    if (lower.startsWith("url(")) {
      const fallback = value.slice(value.indexOf(")") + 1).trim();
      return fallback === "" || !value.includes(")") ? SvgColor.unknown : SvgColor.fromXml(fallback, parser, currentColor);
    }
    const hex = /^(?:#([0-9a-f]{3,4})|#?([0-9a-f]{6}|[0-9a-f]{8}))$/.exec(lower);
    if (hex === null) {
      return SvgColor.unknown;
    }
    const digits = hex[2] ?? hex[1].replace(/./g, "$&$&");
    const byte = index => parseInt(digits.slice(index, index + 2), 16) / 255;
    return new SvgColor([ byte(0), byte(2), byte(4) ], false, digits.length > 6 ? byte(6) : 1);
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
      const p = parseNumbers(match[2]) ?? [];
      const [a = 0, b, c = 0] = p;
      const one = p.length === 1;
      const upToTwo = p.length === 1 || p.length === 2;
      let step = null;
      if (name === "matrix") {
        step = p.length === 6 ? p : null;
      } else if (name === "translate") {
        step = upToTwo ? translationMatrix(a, b ?? 0) : null;
      } else if (name === "scale") {
        step = upToTwo ? scaleMatrix(a, b ?? a) : null;
      } else if (name === "rotate") {
        step = one || p.length === 3 ? multiplyMatrix(multiplyMatrix(translationMatrix(b ?? 0, c), rotationMatrix(toRadians(a))), translationMatrix(-(b ?? 0), -c)) : null;
      } else {
        step = one ? skewMatrix(name === "skewX" ? toRadians(a) : 0, name === "skewY" ? toRadians(a) : 0) : null;
      }
      if (step !== null) {
        matrix = multiplyMatrix(matrix, step);
      }
    }
    return new SvgTransform(matrix);
  }
}

SvgTransform.none = new SvgTransform(null);

function inheritedColor(element, parser) {
  for (let node = element; node !== null; node = node.parent) {
    convertStyle(node);
    const color = SvgColor.fromXml(node.getAttribute("color") ?? "inherit", parser, SvgColor.unknown);
    if (color.isNotEmpty) return color;
  }
  return SvgColor.defaultColor;
}

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
    const value = child.getAttribute("stop-color") ?? "black";
    const color = SvgColor.fromXml(value, parser, /^\s*currentcolor\s*$/i.test(value) ? inheritedColor(child, parser) : SvgColor.defaultColor);
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

function hrefElement(element, parser, seen) {
  const xlink = [ "http:", "", "www.w3.org", "1999", "xlink" ].join("/");
  const href = element.getAttribute("href") ?? element.getAttribute("href", xlink);
  if (href?.startsWith("#") !== true) return null;
  const id = href.slice(1);
  return seen.includes(id) ? null : parser.findById(id);
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
    this.hasVariableOpacity = opacityList.length > 1 && opacityList.some(value => value !== opacityList[0]);
  }
  get isEmpty() {
    return this.colors.length === 0;
  }
  get isNotEmpty() {
    return !this.isEmpty;
  }
  localMatrix(operation) {
    let matrix = identityMatrix;
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
  patternMatrix(operation, canvas) {
    return multiplyMatrix(canvas.getTransform(), this.localMatrix(operation));
  }
  operationCorners(operation) {
    const box = operation.boundingBox();
    const inverse = invertMatrix(this.localMatrix(operation));
    if (inverse === null) return [];
    return [ transformPoint(inverse, box.x, box.y), transformPoint(inverse, box.x + box.width, box.y), transformPoint(inverse, box.x, box.y + box.height), transformPoint(inverse, box.x + box.width, box.y + box.height) ];
  }
  gradientFunction(colors, start, end) {
    const fn = PdfBaseFunction.colorsAndStops(colors, this.stops);
    return this.spreadMethod === "pad" ? fn : PdfBaseFunction.spread(fn, start, end, this.spreadMethod);
  }
  applyOpacityMask(operation, canvas) {
    const maskCanvas = new PdfCanvas(canvas.pageHeight);
    const colors = this.opacityList.map(value => [ value, value, value ]);
    const existingMask = canvas.getSoftMask();
    if (existingMask !== null) maskCanvas.setSoftMask(existingMask);
    maskCanvas.drawBox(operation.boundingBox());
    maskCanvas.setFillPattern(this.buildGradient(operation, maskCanvas, colors));
    maskCanvas.fillPath();
    canvas.setSoftMask({
      content: maskCanvas.takeOutputBytes(),
      boundingBox: operation.boundingBox(),
      fonts: maskCanvas.fonts,
      graphicStates: maskCanvas.graphicStates,
      patterns: maskCanvas.patterns,
      shadings: maskCanvas.shadings,
      images: maskCanvas.images
    });
  }
  setFillColor(operation, canvas) {
    if (this.isNotEmpty) {
      if (this.hasVariableOpacity) this.applyOpacityMask(operation, canvas);
      canvas.setFillPattern(this.buildGradient(operation, canvas));
    }
  }
  setStrokeColor(operation, canvas) {
    if (this.isNotEmpty) {
      if (this.hasVariableOpacity) this.applyOpacityMask(operation, canvas);
      canvas.setStrokePattern(this.buildGradient(operation, canvas));
    }
  }
  static fromReference(value, parser) {
    const match = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/.exec(value.trim());
    if (match === null) {
      return null;
    }
    const element = parser.findById(match[2]);
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
    const nextSeen = id === null ? seen : [ ...seen, id ];
    const stopData = readStops(element, parser);
    const local = new SvgLinearGradient(SvgLinearGradient.units(element), getNumeric(element, "x1", null)?.sizeValue ?? null, getNumeric(element, "y1", null)?.sizeValue ?? null, getNumeric(element, "x2", null)?.sizeValue ?? null, getNumeric(element, "y2", null)?.sizeValue ?? null, SvgTransform.fromString(element.getAttribute("gradientTransform")), stopData.colors, stopData.stops, stopData.opacities, SvgLinearGradient.spread(element));
    const inherited = hrefElement(element, parser, nextSeen);
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
  buildGradient(operation, canvas, colors = this.colors) {
    const start = {
      x: this.x1 ?? 0,
      y: this.y1 ?? 0
    };
    const end = {
      x: this.x2 ?? 1,
      y: this.y2 ?? 0
    };
    let rangeStart = 0;
    let rangeEnd = 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (this.spreadMethod !== "pad" && lengthSquared > 0) {
      const parameters = this.operationCorners(operation).map(point => ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
      if (parameters.length > 0) {
        rangeStart = Math.min(...parameters);
        rangeEnd = Math.max(...parameters);
      }
      if (rangeEnd <= rangeStart) rangeEnd = rangeStart + 1;
    }
    const shadingStart = this.spreadMethod === "pad" ? start : {
      x: start.x + dx * rangeStart,
      y: start.y + dy * rangeStart
    };
    const shadingEnd = this.spreadMethod === "pad" ? end : {
      x: start.x + dx * rangeEnd,
      y: start.y + dy * rangeEnd
    };
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: "axial",
        fn: this.gradientFunction(colors, rangeStart, rangeEnd),
        start: shadingStart,
        end: shadingEnd,
        extendStart: this.spreadMethod === "pad",
        extendEnd: this.spreadMethod === "pad"
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
    const nextSeen = id === null ? seen : [ ...seen, id ];
    const stopData = readStops(element, parser);
    const unitsValue = element.getAttribute("gradientUnits");
    const spreadValue = element.getAttribute("spreadMethod");
    const local = new SvgRadialGradient(unitsValue === "userSpaceOnUse" || unitsValue === "objectBoundingBox" ? unitsValue : null, getNumeric(element, "r", null)?.sizeValue ?? null, getNumeric(element, "cx", null)?.sizeValue ?? null, getNumeric(element, "cy", null)?.sizeValue ?? null, getNumeric(element, "fr", null)?.sizeValue ?? null, getNumeric(element, "fx", null)?.sizeValue ?? null, getNumeric(element, "fy", null)?.sizeValue ?? null, SvgTransform.fromString(element.getAttribute("gradientTransform")), stopData.colors, stopData.stops, stopData.opacities, spreadValue === "pad" || spreadValue === "reflect" || spreadValue === "repeat" ? spreadValue : null);
    const inherited = hrefElement(element, parser, nextSeen);
    return inherited?.name.local === "radialGradient" ? SvgRadialGradient.fromElement(inherited, parser, nextSeen).mergeWith(local) : local;
  }
  mergeWith(other) {
    return new SvgRadialGradient(other.gradientUnits ?? this.gradientUnits, other.r ?? this.r, other.cx ?? this.cx, other.cy ?? this.cy, other.fr ?? this.fr, other.fx ?? this.fx, other.fy ?? this.fy, other.transform.isNotEmpty ? other.transform : this.transform, other.colors.length > 0 ? other.colors : this.colors, other.stops.length > 0 ? other.stops : this.stops, other.opacityList.length > 0 ? other.opacityList : this.opacityList, other.hasSpreadMethod ? other.spreadMethod : this.spreadMethod);
  }
  buildGradient(operation, canvas, colors = this.colors) {
    const cx = this.cx ?? .5;
    const cy = this.cy ?? .5;
    const fx = this.fx ?? cx;
    const fy = this.fy ?? cy;
    const radius0 = this.fr ?? 0;
    const radius1 = this.r ?? .5;
    const dcx = cx - fx;
    const dcy = cy - fy;
    const dr = radius1 - radius0;
    let rangeStart = 0;
    let rangeEnd = 1;
    if (this.spreadMethod !== "pad" && dr > 0) {
      rangeStart = Math.min(0, -radius0 / dr);
      const corners = this.operationCorners(operation);
      const covers = parameter => {
        const centerX = fx + dcx * parameter;
        const centerY = fy + dcy * parameter;
        const radius = radius0 + dr * parameter;
        return radius >= 0 && corners.every(point => Math.hypot(point.x - centerX, point.y - centerY) <= radius);
      };
      while (!covers(rangeEnd)) {
        rangeEnd += 1;
        if (rangeEnd - rangeStart > 4096) {
          throw new RangeError("SVG radial gradient spread exceeds 4096 visible periods");
        }
      }
    }
    return new PdfShadingPattern({
      shading: new PdfShading({
        type: "radial",
        fn: this.gradientFunction(colors, rangeStart, rangeEnd),
        start: {
          x: fx + dcx * rangeStart,
          y: fy + dcy * rangeStart
        },
        end: {
          x: fx + dcx * rangeEnd,
          y: fy + dcy * rangeEnd
        },
        radius0: radius0 + dr * rangeStart,
        radius1: radius0 + dr * rangeEnd,
        extendStart: this.spreadMethod === "pad",
        extendEnd: this.spreadMethod === "pad"
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
  "miter-clip": "miter",
  arcs: "miter",
  bevel: "bevel",
  round: "round"
});

const TEXT_ANCHORS = Object.freeze({
  start: "start",
  middle: "middle",
  end: "end"
});

function dashArray(value, brush) {
  if (value === null) return null;
  if (value === "none") return [];
  try {
    return splitNumeric(value, brush).map(n => n.value);
  } catch {
    return null;
  }
}

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
    this.viewport = fields.viewport;
    this.preserveSpace = fields.preserveSpace;
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
      strokeMiterLimit: other.strokeMiterLimit ?? this.strokeMiterLimit,
      viewport: other.viewport ?? this.viewport,
      preserveSpace: other.preserveSpace ?? this.preserveSpace
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
      blendMode: fields.blendMode ?? this.blendMode,
      viewport: fields.viewport ?? this.viewport,
      preserveSpace: fields.preserveSpace ?? this.preserveSpace
    });
  }
  static fromXml(element, parent, parser) {
    convertStyle(element);
    const strokeDashArray = element.getAttribute("stroke-dasharray");
    const fillRule = element.getAttribute("fill-rule");
    const strokeLineCap = element.getAttribute("stroke-linecap");
    const strokeLineJoin = element.getAttribute("stroke-linejoin")?.trim() ?? null;
    const space = element.getAttribute("xml:space");
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
      strokeDashArray: dashArray(strokeDashArray, parent),
      strokeDashOffset: getNumeric(element, "stroke-dashoffset", parent)?.lengthIn() ?? null,
      fontSize: getNumeric(element, "font-size", parent),
      fontFamily: element.getAttribute("font-family"),
      fontStyle: element.getAttribute("font-style"),
      fontWeight: element.getAttribute("font-weight"),
      textAnchor: TEXT_ANCHORS[element.getAttribute("text-anchor") ?? ""] ?? null,
      viewport: null,
      preserveSpace: space === "preserve" ? true : space === "default" ? false : null
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
  textAnchor: "start",
  viewport: null,
  preserveSpace: false
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
    this.mask = null;
    this.brush = brush;
    this.clip = clip;
    this.transform = transform;
    this.painter = painter;
  }
  paint(canvas) {
    canvas.saveContext();
    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }
    this.clip.apply(canvas, this.boundingBox());
    if ((this.brush.opacity ?? 1) < 1 || this.brush.blendMode !== null) {
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.brush.opacity === 1 ? null : this.brush.opacity,
        blendMode: this.brush.blendMode
      }));
    }
    this.mask?.apply(canvas);
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
        const cx = SvgPath.numeric(element, "cx", brush, "x");
        const cy = SvgPath.numeric(element, "cy", brush, "y");
        const r = SvgPath.numeric(element, "r", brush);
        d = `M${cx - r},${cy}A${r},${r} 0,0,0 ${cx + r},${cy}` + `A${r},${r} 0,0,0 ${cx - r},${cy}z`;
        break;
      }

     case "ellipse":
      {
        const cx = SvgPath.numeric(element, "cx", brush, "x");
        const cy = SvgPath.numeric(element, "cy", brush, "y");
        const rx = SvgPath.numeric(element, "rx", brush, "x");
        const ry = SvgPath.numeric(element, "ry", brush, "y");
        d = `M${cx - rx},${cy}A${rx},${ry} 0,0,0 ${cx + rx},${cy}` + `A${rx},${ry} 0,0,0 ${cx - rx},${cy}z`;
        break;
      }

     case "line":
      {
        const x1 = SvgPath.numeric(element, "x1", brush, "x");
        const y1 = SvgPath.numeric(element, "y1", brush, "y");
        const x2 = SvgPath.numeric(element, "x2", brush, "x");
        const y2 = SvgPath.numeric(element, "y2", brush, "y");
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
  static numeric(element, name, brush, axis) {
    return getNumeric(element, name, brush)?.lengthIn(axis) ?? 0;
  }
  static rectData(element, brush) {
    const x = SvgPath.numeric(element, "x", brush, "x");
    const y = SvgPath.numeric(element, "y", brush, "y");
    const width = SvgPath.numeric(element, "width", brush, "x");
    const height = SvgPath.numeric(element, "height", brush, "y");
    let rx = getNumeric(element, "rx", brush)?.lengthIn("x") ?? null;
    let ry = getNumeric(element, "ry", brush)?.lengthIn("y") ?? null;
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
    const fillOpacity = (this.brush.fillOpacity ?? 1) * (fill?.opacity ?? 1);
    if (fill?.isNotEmpty === true && fillOpacity > 0) {
      canvas.saveContext();
      fill.setFillColor(this, canvas);
      if (fillOpacity < 1) {
        canvas.setGraphicState(new PdfGraphicState({
          opacity: fillOpacity
        }));
      }
      drawShape(canvas, this.d);
      canvas.fillPath({
        evenOdd: this.brush.fillEvenOdd ?? false
      });
      canvas.restoreContext();
    }
    const stroke = this.brush.stroke;
    const width = this.brush.strokeWidth?.lengthIn() ?? 1;
    const opacity = (this.brush.strokeOpacity ?? 1) * (stroke?.opacity ?? 1);
    if (stroke?.isNotEmpty === true && width > 0 && opacity > 0) {
      canvas.saveContext();
      stroke.setStrokeColor(this, canvas);
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
      canvas.setLineWidth(width);
      canvas.strokePath();
      canvas.restoreContext();
    }
  }
  drawShape(canvas) {
    drawShape(canvas, this.d);
  }
  boundingBox() {
    return shapeBoundingBox(this.d);
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

class Shape extends Widget {
  constructor(shape, {strokeColor = null, fillColor = null, width = null, height = null, fit = "contain"} = {}) {
    super();
    this.shape = String(shape);
    this.strokeColor = strokeColor;
    this.fillColor = fillColor;
    this.width = width;
    this.height = height;
    this.fit = fit;
    if (width !== null && width <= 0) throw new RangeError("Shape width must be positive");
    if (height !== null && height <= 0) throw new RangeError("Shape height must be positive");
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const measured = this.width === null || this.height === null ? shapeBoundingBox(this.shape) : {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height
    };
    const offered = {
      width: parent.hasBoundedWidth ? parent.maxWidth : parent.constrainWidth(measured.width),
      height: parent.hasBoundedHeight ? parent.maxHeight : parent.constrainHeight(measured.height)
    };
    const fitted = applyBoxFit$1(this.fit, measured, offered);
    return {
      widget: this,
      width: fitted.destination.width,
      height: fitted.destination.height,
      data: {
        boundingBox: measured
      }
    };
  }
  paint(context, box) {
    const bounds = box.data.boundingBox;
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const scaleX = box.width / bounds.width;
    const scaleY = box.height / bounds.height;
    context.canvas.saveContext();
    context.canvas.setTransform([ scaleX, 0, 0, scaleY, box.x - bounds.x * scaleX, context.canvas.pageHeight - box.y - (bounds.y + bounds.height) * scaleY ]);
    if (this.fillColor !== null) {
      context.canvas.setFillColor(this.fillColor);
      drawShape(context.canvas, this.shape);
      context.canvas.fillPath();
    }
    if (this.strokeColor !== null) {
      context.canvas.setStrokeColor(this.strokeColor);
      drawShape(context.canvas, this.shape);
      context.canvas.strokePath();
    }
    context.canvas.restoreContext();
  }
}

let handler = null;

function setPdfDiagnosticHandler(next) {
  handler = next;
}

function pdfDiagnosticHandler() {
  return handler;
}

function reportPdfDiagnostic(message) {
  if (handler !== null) {
    handler(message);
    return;
  }
  const console = globalThis.console;
  console?.warn?.(message);
}

const JpegDecoderCore = function jpegImage() {
  var dctZigZag = new Int32Array([ 0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63 ]);
  var dctCos1 = 4017;
  var dctSin1 = 799;
  var dctCos3 = 3406;
  var dctSin3 = 2276;
  var dctCos6 = 1567;
  var dctSin6 = 3784;
  var dctSqrt2 = 5793;
  var dctSqrt1d2 = 2896;
  function constructor() {}
  function buildHuffmanTable(codeLengths, values) {
    var k = 0, code = [], i, j, length = 16;
    while (length > 0 && !codeLengths[length - 1]) length--;
    code.push({
      children: [],
      index: 0
    });
    var p = code[0], q;
    for (i = 0; i < length; i++) {
      for (j = 0; j < codeLengths[i]; j++) {
        p = code.pop();
        p.children[p.index] = values[k];
        while (p.index > 0) {
          if (code.length === 0) throw new Error("Could not recreate Huffman Table");
          p = code.pop();
        }
        p.index++;
        code.push(p);
        while (code.length <= i) {
          code.push(q = {
            children: [],
            index: 0
          });
          p.children[p.index] = q.children;
          p = q;
        }
        k++;
      }
      if (i + 1 < length) {
        code.push(q = {
          children: [],
          index: 0
        });
        p.children[p.index] = q.children;
        p = q;
      }
    }
    return code[0].children;
  }
  function decodeScan(data, offset, frame, components, restartEvery, spectralStart, spectralEnd, successivePrev, successive, opts) {
    var mcusPerLine = frame.mcusPerLine;
    var progressive = frame.progressive;
    var startOffset = offset, bitsData = 0, bitsCount = 0;
    function readBit() {
      if (bitsCount > 0) {
        bitsCount--;
        return bitsData >> bitsCount & 1;
      }
      bitsData = data[offset++];
      if (bitsData == 255) {
        var nextByte = data[offset++];
        if (nextByte) {
          throw new Error("unexpected marker: " + (bitsData << 8 | nextByte).toString(16));
        }
      }
      bitsCount = 7;
      return bitsData >>> 7;
    }
    function decodeHuffman(tree) {
      var node = tree, bit;
      while ((bit = readBit()) !== null) {
        node = node[bit];
        if (typeof node === "number") return node;
        if (typeof node !== "object") throw new Error("invalid huffman sequence");
      }
      return null;
    }
    function receive(length) {
      var n = 0;
      while (length > 0) {
        var bit = readBit();
        if (bit === null) return;
        n = n << 1 | bit;
        length--;
      }
      return n;
    }
    function receiveAndExtend(length) {
      var n = receive(length);
      if (n >= 1 << length - 1) return n;
      return n + (-1 << length) + 1;
    }
    function decodeBaseline(component, zz) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : receiveAndExtend(t);
      zz[0] = component.pred += diff;
      var k = 1;
      while (k < 64) {
        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15) break;
          k += 16;
          continue;
        }
        k += r;
        var z = dctZigZag[k];
        zz[z] = receiveAndExtend(s);
        k++;
      }
    }
    function decodeDCFirst(component, zz) {
      var t = decodeHuffman(component.huffmanTableDC);
      var diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
      zz[0] = component.pred += diff;
    }
    function decodeDCSuccessive(component, zz) {
      zz[0] |= readBit() << successive;
    }
    var eobrun = 0;
    function decodeACFirst(component, zz) {
      if (eobrun > 0) {
        eobrun--;
        return;
      }
      var k = spectralStart, e = spectralEnd;
      while (k <= e) {
        var rs = decodeHuffman(component.huffmanTableAC);
        var s = rs & 15, r = rs >> 4;
        if (s === 0) {
          if (r < 15) {
            eobrun = receive(r) + (1 << r) - 1;
            break;
          }
          k += 16;
          continue;
        }
        k += r;
        var z = dctZigZag[k];
        zz[z] = receiveAndExtend(s) * (1 << successive);
        k++;
      }
    }
    var successiveACState = 0, successiveACNextValue;
    function decodeACSuccessive(component, zz) {
      var k = spectralStart, e = spectralEnd, r = 0;
      while (k <= e) {
        var z = dctZigZag[k];
        var direction = zz[z] < 0 ? -1 : 1;
        switch (successiveACState) {
         case 0:
          var rs = decodeHuffman(component.huffmanTableAC);
          var s = rs & 15, r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r);
              successiveACState = 4;
            } else {
              r = 16;
              successiveACState = 1;
            }
          } else {
            if (s !== 1) throw new Error("invalid ACn encoding");
            successiveACNextValue = receiveAndExtend(s);
            successiveACState = r ? 2 : 3;
          }
          continue;

         case 1:
         case 2:
          if (zz[z]) zz[z] += (readBit() << successive) * direction; else {
            r--;
            if (r === 0) successiveACState = successiveACState == 2 ? 3 : 0;
          }
          break;

         case 3:
          if (zz[z]) zz[z] += (readBit() << successive) * direction; else {
            zz[z] = successiveACNextValue << successive;
            successiveACState = 0;
          }
          break;

         case 4:
          if (zz[z]) zz[z] += (readBit() << successive) * direction;
          break;
        }
        k++;
      }
      if (successiveACState === 4) {
        eobrun--;
        if (eobrun === 0) successiveACState = 0;
      }
    }
    function decodeMcu(component, decode, mcu, row, col) {
      var mcuRow = mcu / mcusPerLine | 0;
      var mcuCol = mcu % mcusPerLine;
      var blockRow = mcuRow * component.v + row;
      var blockCol = mcuCol * component.h + col;
      if (component.blocks[blockRow] === undefined && opts.tolerantDecoding) return;
      decode(component, component.blocks[blockRow][blockCol]);
    }
    function decodeBlock(component, decode, mcu) {
      var blockRow = mcu / component.blocksPerLine | 0;
      var blockCol = mcu % component.blocksPerLine;
      if (component.blocks[blockRow] === undefined && opts.tolerantDecoding) return;
      decode(component, component.blocks[blockRow][blockCol]);
    }
    var componentsLength = components.length;
    var component, i, j, k, n;
    var decodeFn;
    if (progressive) {
      if (spectralStart === 0) decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive; else decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    } else {
      decodeFn = decodeBaseline;
    }
    var mcu = 0, marker;
    var mcuExpected;
    if (componentsLength == 1) {
      mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
    } else {
      mcuExpected = mcusPerLine * frame.mcusPerColumn;
    }
    if (!restartEvery) restartEvery = mcuExpected;
    var h, v;
    while (mcu < mcuExpected) {
      for (i = 0; i < componentsLength; i++) components[i].pred = 0;
      eobrun = 0;
      if (componentsLength == 1) {
        component = components[0];
        for (n = 0; n < restartEvery; n++) {
          decodeBlock(component, decodeFn, mcu);
          mcu++;
        }
      } else {
        for (n = 0; n < restartEvery; n++) {
          for (i = 0; i < componentsLength; i++) {
            component = components[i];
            h = component.h;
            v = component.v;
            for (j = 0; j < v; j++) {
              for (k = 0; k < h; k++) {
                decodeMcu(component, decodeFn, mcu, j, k);
              }
            }
          }
          mcu++;
          if (mcu === mcuExpected) break;
        }
      }
      if (mcu === mcuExpected) {
        do {
          if (data[offset] === 255) {
            if (data[offset + 1] !== 0) {
              break;
            }
          }
          offset += 1;
        } while (offset < data.length - 2);
      }
      bitsCount = 0;
      marker = data[offset] << 8 | data[offset + 1];
      if (marker < 65280) {
        throw new Error("marker was not found");
      }
      if (marker >= 65488 && marker <= 65495) {
        offset += 2;
      } else break;
    }
    return offset - startOffset;
  }
  function buildComponentData(component) {
    var lines = [];
    var blocksPerLine = component.blocksPerLine;
    var blocksPerColumn = component.blocksPerColumn;
    var samplesPerLine = blocksPerLine << 3;
    var R = new Int32Array(64), r = new Uint8Array(64);
    function quantizeAndInverse(zz, dataOut, dataIn) {
      var qt = component.quantizationTable;
      var v0, v1, v2, v3, v4, v5, v6, v7, t;
      var p = dataIn;
      var i;
      for (i = 0; i < 64; i++) p[i] = zz[i] * qt[i];
      for (i = 0; i < 8; ++i) {
        var row = 8 * i;
        if (p[1 + row] == 0 && p[2 + row] == 0 && p[3 + row] == 0 && p[4 + row] == 0 && p[5 + row] == 0 && p[6 + row] == 0 && p[7 + row] == 0) {
          t = dctSqrt2 * p[0 + row] + 512 >> 10;
          p[0 + row] = t;
          p[1 + row] = t;
          p[2 + row] = t;
          p[3 + row] = t;
          p[4 + row] = t;
          p[5 + row] = t;
          p[6 + row] = t;
          p[7 + row] = t;
          continue;
        }
        v0 = dctSqrt2 * p[0 + row] + 128 >> 8;
        v1 = dctSqrt2 * p[4 + row] + 128 >> 8;
        v2 = p[2 + row];
        v3 = p[6 + row];
        v4 = dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128 >> 8;
        v7 = dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128 >> 8;
        v5 = p[3 + row] << 4;
        v6 = p[5 + row] << 4;
        t = v0 - v1 + 1 >> 1;
        v0 = v0 + v1 + 1 >> 1;
        v1 = t;
        t = v2 * dctSin6 + v3 * dctCos6 + 128 >> 8;
        v2 = v2 * dctCos6 - v3 * dctSin6 + 128 >> 8;
        v3 = t;
        t = v4 - v6 + 1 >> 1;
        v4 = v4 + v6 + 1 >> 1;
        v6 = t;
        t = v7 + v5 + 1 >> 1;
        v5 = v7 - v5 + 1 >> 1;
        v7 = t;
        t = v0 - v3 + 1 >> 1;
        v0 = v0 + v3 + 1 >> 1;
        v3 = t;
        t = v1 - v2 + 1 >> 1;
        v1 = v1 + v2 + 1 >> 1;
        v2 = t;
        t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
        v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
        v7 = t;
        t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
        v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
        v6 = t;
        p[0 + row] = v0 + v7;
        p[7 + row] = v0 - v7;
        p[1 + row] = v1 + v6;
        p[6 + row] = v1 - v6;
        p[2 + row] = v2 + v5;
        p[5 + row] = v2 - v5;
        p[3 + row] = v3 + v4;
        p[4 + row] = v3 - v4;
      }
      for (i = 0; i < 8; ++i) {
        var col = i;
        if (p[1 * 8 + col] == 0 && p[2 * 8 + col] == 0 && p[3 * 8 + col] == 0 && p[4 * 8 + col] == 0 && p[5 * 8 + col] == 0 && p[6 * 8 + col] == 0 && p[7 * 8 + col] == 0) {
          t = dctSqrt2 * dataIn[i + 0] + 8192 >> 14;
          p[0 * 8 + col] = t;
          p[1 * 8 + col] = t;
          p[2 * 8 + col] = t;
          p[3 * 8 + col] = t;
          p[4 * 8 + col] = t;
          p[5 * 8 + col] = t;
          p[6 * 8 + col] = t;
          p[7 * 8 + col] = t;
          continue;
        }
        v0 = dctSqrt2 * p[0 * 8 + col] + 2048 >> 12;
        v1 = dctSqrt2 * p[4 * 8 + col] + 2048 >> 12;
        v2 = p[2 * 8 + col];
        v3 = p[6 * 8 + col];
        v4 = dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048 >> 12;
        v7 = dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048 >> 12;
        v5 = p[3 * 8 + col];
        v6 = p[5 * 8 + col];
        t = v0 - v1 + 1 >> 1;
        v0 = v0 + v1 + 1 >> 1;
        v1 = t;
        t = v2 * dctSin6 + v3 * dctCos6 + 2048 >> 12;
        v2 = v2 * dctCos6 - v3 * dctSin6 + 2048 >> 12;
        v3 = t;
        t = v4 - v6 + 1 >> 1;
        v4 = v4 + v6 + 1 >> 1;
        v6 = t;
        t = v7 + v5 + 1 >> 1;
        v5 = v7 - v5 + 1 >> 1;
        v7 = t;
        t = v0 - v3 + 1 >> 1;
        v0 = v0 + v3 + 1 >> 1;
        v3 = t;
        t = v1 - v2 + 1 >> 1;
        v1 = v1 + v2 + 1 >> 1;
        v2 = t;
        t = v4 * dctSin3 + v7 * dctCos3 + 2048 >> 12;
        v4 = v4 * dctCos3 - v7 * dctSin3 + 2048 >> 12;
        v7 = t;
        t = v5 * dctSin1 + v6 * dctCos1 + 2048 >> 12;
        v5 = v5 * dctCos1 - v6 * dctSin1 + 2048 >> 12;
        v6 = t;
        p[0 * 8 + col] = v0 + v7;
        p[7 * 8 + col] = v0 - v7;
        p[1 * 8 + col] = v1 + v6;
        p[6 * 8 + col] = v1 - v6;
        p[2 * 8 + col] = v2 + v5;
        p[5 * 8 + col] = v2 - v5;
        p[3 * 8 + col] = v3 + v4;
        p[4 * 8 + col] = v3 - v4;
      }
      for (i = 0; i < 64; ++i) {
        var sample = 128 + (p[i] + 8 >> 4);
        dataOut[i] = sample < 0 ? 0 : sample > 255 ? 255 : sample;
      }
    }
    requestMemoryAllocation(samplesPerLine * blocksPerColumn * 8);
    var i, j;
    for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
      var scanLine = blockRow << 3;
      for (i = 0; i < 8; i++) lines.push(new Uint8Array(samplesPerLine));
      for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
        quantizeAndInverse(component.blocks[blockRow][blockCol], r, R);
        var offset = 0, sample = blockCol << 3;
        for (j = 0; j < 8; j++) {
          var line = lines[scanLine + j];
          for (i = 0; i < 8; i++) line[sample + i] = r[offset++];
        }
      }
    }
    return lines;
  }
  function clampTo8bit(a) {
    return a < 0 ? 0 : a > 255 ? 255 : a;
  }
  constructor.prototype = {
    parse: function parse(data) {
      var maxResolutionInPixels = this.opts.maxResolutionInMP * 1e3 * 1e3;
      var offset = 0;
      data.length;
      function readUint16() {
        var value = data[offset] << 8 | data[offset + 1];
        offset += 2;
        return value;
      }
      function readDataBlock() {
        var length = readUint16();
        var array = data.subarray(offset, offset + length - 2);
        offset += array.length;
        return array;
      }
      function prepareComponents(frame) {
        var maxH = 1, maxV = 1;
        var component, componentId;
        for (componentId in frame.components) {
          if (frame.components.hasOwnProperty(componentId)) {
            component = frame.components[componentId];
            if (maxH < component.h) maxH = component.h;
            if (maxV < component.v) maxV = component.v;
          }
        }
        var mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / maxH);
        var mcusPerColumn = Math.ceil(frame.scanLines / 8 / maxV);
        for (componentId in frame.components) {
          if (frame.components.hasOwnProperty(componentId)) {
            component = frame.components[componentId];
            var blocksPerLine = Math.ceil(Math.ceil(frame.samplesPerLine / 8) * component.h / maxH);
            var blocksPerColumn = Math.ceil(Math.ceil(frame.scanLines / 8) * component.v / maxV);
            var blocksPerLineForMcu = mcusPerLine * component.h;
            var blocksPerColumnForMcu = mcusPerColumn * component.v;
            var blocksToAllocate = blocksPerColumnForMcu * blocksPerLineForMcu;
            var blocks = [];
            requestMemoryAllocation(blocksToAllocate * 256);
            for (var i = 0; i < blocksPerColumnForMcu; i++) {
              var row = [];
              for (var j = 0; j < blocksPerLineForMcu; j++) row.push(new Int32Array(64));
              blocks.push(row);
            }
            component.blocksPerLine = blocksPerLine;
            component.blocksPerColumn = blocksPerColumn;
            component.blocks = blocks;
          }
        }
        frame.maxH = maxH;
        frame.maxV = maxV;
        frame.mcusPerLine = mcusPerLine;
        frame.mcusPerColumn = mcusPerColumn;
      }
      var jfif = null;
      var adobe = null;
      var frame, restartEvery;
      var quantizationTables = [], frames = [];
      var huffmanTablesAC = [], huffmanTablesDC = [];
      var fileMarker = readUint16();
      var malformedDataOffset = -1;
      this.comments = [];
      if (fileMarker != 65496) {
        throw new Error("SOI not found");
      }
      fileMarker = readUint16();
      while (fileMarker != 65497) {
        var i, j;
        switch (fileMarker) {
         case 65280:
          break;

         case 65504:
         case 65505:
         case 65506:
         case 65507:
         case 65508:
         case 65509:
         case 65510:
         case 65511:
         case 65512:
         case 65513:
         case 65514:
         case 65515:
         case 65516:
         case 65517:
         case 65518:
         case 65519:
         case 65534:
          var appData = readDataBlock();
          if (fileMarker === 65534) {
            var comment = String.fromCharCode.apply(null, appData);
            this.comments.push(comment);
          }
          if (fileMarker === 65504) {
            if (appData[0] === 74 && appData[1] === 70 && appData[2] === 73 && appData[3] === 70 && appData[4] === 0) {
              jfif = {
                version: {
                  major: appData[5],
                  minor: appData[6]
                },
                densityUnits: appData[7],
                xDensity: appData[8] << 8 | appData[9],
                yDensity: appData[10] << 8 | appData[11],
                thumbWidth: appData[12],
                thumbHeight: appData[13],
                thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
              };
            }
          }
          if (fileMarker === 65505) {
            if (appData[0] === 69 && appData[1] === 120 && appData[2] === 105 && appData[3] === 102 && appData[4] === 0) {
              this.exifBuffer = appData.subarray(5, appData.length);
            }
          }
          if (fileMarker === 65518) {
            if (appData[0] === 65 && appData[1] === 100 && appData[2] === 111 && appData[3] === 98 && appData[4] === 101 && appData[5] === 0) {
              adobe = {
                version: appData[6],
                flags0: appData[7] << 8 | appData[8],
                flags1: appData[9] << 8 | appData[10],
                transformCode: appData[11]
              };
            }
          }
          break;

         case 65499:
          var quantizationTablesLength = readUint16();
          var quantizationTablesEnd = quantizationTablesLength + offset - 2;
          while (offset < quantizationTablesEnd) {
            var quantizationTableSpec = data[offset++];
            requestMemoryAllocation(64 * 4);
            var tableData = new Int32Array(64);
            if (quantizationTableSpec >> 4 === 0) {
              for (j = 0; j < 64; j++) {
                var z = dctZigZag[j];
                tableData[z] = data[offset++];
              }
            } else if (quantizationTableSpec >> 4 === 1) {
              for (j = 0; j < 64; j++) {
                var z = dctZigZag[j];
                tableData[z] = readUint16();
              }
            } else throw new Error("DQT: invalid table spec");
            quantizationTables[quantizationTableSpec & 15] = tableData;
          }
          break;

         case 65472:
         case 65473:
         case 65474:
          readUint16();
          frame = {};
          frame.extended = fileMarker === 65473;
          frame.progressive = fileMarker === 65474;
          frame.precision = data[offset++];
          frame.scanLines = readUint16();
          frame.samplesPerLine = readUint16();
          frame.components = {};
          frame.componentsOrder = [];
          var pixelsInFrame = frame.scanLines * frame.samplesPerLine;
          if (pixelsInFrame > maxResolutionInPixels) {
            var exceededAmount = Math.ceil((pixelsInFrame - maxResolutionInPixels) / 1e6);
            throw new Error(`maxResolutionInMP limit exceeded by ${exceededAmount}MP`);
          }
          var componentsCount = data[offset++], componentId;
          for (i = 0; i < componentsCount; i++) {
            componentId = data[offset];
            var h = data[offset + 1] >> 4;
            var v = data[offset + 1] & 15;
            var qId = data[offset + 2];
            if (h <= 0 || v <= 0) {
              throw new Error("Invalid sampling factor, expected values above 0");
            }
            frame.componentsOrder.push(componentId);
            frame.components[componentId] = {
              h,
              v,
              quantizationIdx: qId
            };
            offset += 3;
          }
          prepareComponents(frame);
          frames.push(frame);
          break;

         case 65476:
          var huffmanLength = readUint16();
          for (i = 2; i < huffmanLength; ) {
            var huffmanTableSpec = data[offset++];
            var codeLengths = new Uint8Array(16);
            var codeLengthSum = 0;
            for (j = 0; j < 16; j++, offset++) {
              codeLengthSum += codeLengths[j] = data[offset];
            }
            requestMemoryAllocation(16 + codeLengthSum);
            var huffmanValues = new Uint8Array(codeLengthSum);
            for (j = 0; j < codeLengthSum; j++, offset++) huffmanValues[j] = data[offset];
            i += 17 + codeLengthSum;
            (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] = buildHuffmanTable(codeLengths, huffmanValues);
          }
          break;

         case 65501:
          readUint16();
          restartEvery = readUint16();
          break;

         case 65500:
          readUint16();
          readUint16();
          break;

         case 65498:
          readUint16();
          var selectorsCount = data[offset++];
          var components = [], component;
          for (i = 0; i < selectorsCount; i++) {
            component = frame.components[data[offset++]];
            var tableSpec = data[offset++];
            component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
            component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
            components.push(component);
          }
          var spectralStart = data[offset++];
          var spectralEnd = data[offset++];
          var successiveApproximation = data[offset++];
          var processed = decodeScan(data, offset, frame, components, restartEvery, spectralStart, spectralEnd, successiveApproximation >> 4, successiveApproximation & 15, this.opts);
          offset += processed;
          break;

         case 65535:
          if (data[offset] !== 255) {
            offset--;
          }
          break;

         default:
          if (data[offset - 3] == 255 && data[offset - 2] >= 192 && data[offset - 2] <= 254) {
            offset -= 3;
            break;
          } else if (fileMarker === 224 || fileMarker == 225) {
            if (malformedDataOffset !== -1) {
              throw new Error(`first unknown JPEG marker at offset ${malformedDataOffset.toString(16)}, second unknown JPEG marker ${fileMarker.toString(16)} at offset ${(offset - 1).toString(16)}`);
            }
            malformedDataOffset = offset - 1;
            const nextOffset = readUint16();
            if (data[offset + nextOffset - 2] === 255) {
              offset += nextOffset - 2;
              break;
            }
          }
          throw new Error("unknown JPEG marker " + fileMarker.toString(16));
        }
        fileMarker = readUint16();
      }
      if (frames.length != 1) throw new Error("only single frame JPEGs supported");
      for (var i = 0; i < frames.length; i++) {
        var cp = frames[i].components;
        for (var j in cp) {
          cp[j].quantizationTable = quantizationTables[cp[j].quantizationIdx];
          delete cp[j].quantizationIdx;
        }
      }
      this.width = frame.samplesPerLine;
      this.height = frame.scanLines;
      this.jfif = jfif;
      this.adobe = adobe;
      this.components = [];
      for (var i = 0; i < frame.componentsOrder.length; i++) {
        var component = frame.components[frame.componentsOrder[i]];
        this.components.push({
          lines: buildComponentData(component),
          scaleX: component.h / frame.maxH,
          scaleY: component.v / frame.maxV
        });
      }
    },
    getData: function getData(width, height) {
      var scaleX = this.width / width, scaleY = this.height / height;
      var component1, component2, component3, component4;
      var component1Line, component2Line, component3Line, component4Line;
      var x, y;
      var offset = 0;
      var Y, Cb, Cr, K, C, M, Ye, R, G, B;
      var colorTransform;
      var dataLength = width * height * this.components.length;
      requestMemoryAllocation(dataLength);
      var data = new Uint8Array(dataLength);
      switch (this.components.length) {
       case 1:
        component1 = this.components[0];
        for (y = 0; y < height; y++) {
          component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
          for (x = 0; x < width; x++) {
            Y = component1Line[0 | x * component1.scaleX * scaleX];
            data[offset++] = Y;
          }
        }
        break;

       case 2:
        component1 = this.components[0];
        component2 = this.components[1];
        for (y = 0; y < height; y++) {
          component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
          component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
          for (x = 0; x < width; x++) {
            Y = component1Line[0 | x * component1.scaleX * scaleX];
            data[offset++] = Y;
            Y = component2Line[0 | x * component2.scaleX * scaleX];
            data[offset++] = Y;
          }
        }
        break;

       case 3:
        colorTransform = true;
        if (this.adobe && this.adobe.transformCode) colorTransform = true; else if (typeof this.opts.colorTransform !== "undefined") colorTransform = !!this.opts.colorTransform;
        component1 = this.components[0];
        component2 = this.components[1];
        component3 = this.components[2];
        for (y = 0; y < height; y++) {
          component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
          component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
          component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
          for (x = 0; x < width; x++) {
            if (!colorTransform) {
              R = component1Line[0 | x * component1.scaleX * scaleX];
              G = component2Line[0 | x * component2.scaleX * scaleX];
              B = component3Line[0 | x * component3.scaleX * scaleX];
            } else {
              Y = component1Line[0 | x * component1.scaleX * scaleX];
              Cb = component2Line[0 | x * component2.scaleX * scaleX];
              Cr = component3Line[0 | x * component3.scaleX * scaleX];
              R = clampTo8bit(Y + 1.402 * (Cr - 128));
              G = clampTo8bit(Y - .3441363 * (Cb - 128) - .71413636 * (Cr - 128));
              B = clampTo8bit(Y + 1.772 * (Cb - 128));
            }
            data[offset++] = R;
            data[offset++] = G;
            data[offset++] = B;
          }
        }
        break;

       case 4:
        if (!this.adobe) throw new Error("Unsupported color mode (4 components)");
        colorTransform = false;
        if (this.adobe && this.adobe.transformCode) colorTransform = true; else if (typeof this.opts.colorTransform !== "undefined") colorTransform = !!this.opts.colorTransform;
        component1 = this.components[0];
        component2 = this.components[1];
        component3 = this.components[2];
        component4 = this.components[3];
        for (y = 0; y < height; y++) {
          component1Line = component1.lines[0 | y * component1.scaleY * scaleY];
          component2Line = component2.lines[0 | y * component2.scaleY * scaleY];
          component3Line = component3.lines[0 | y * component3.scaleY * scaleY];
          component4Line = component4.lines[0 | y * component4.scaleY * scaleY];
          for (x = 0; x < width; x++) {
            if (!colorTransform) {
              C = component1Line[0 | x * component1.scaleX * scaleX];
              M = component2Line[0 | x * component2.scaleX * scaleX];
              Ye = component3Line[0 | x * component3.scaleX * scaleX];
              K = component4Line[0 | x * component4.scaleX * scaleX];
            } else {
              Y = component1Line[0 | x * component1.scaleX * scaleX];
              Cb = component2Line[0 | x * component2.scaleX * scaleX];
              Cr = component3Line[0 | x * component3.scaleX * scaleX];
              K = component4Line[0 | x * component4.scaleX * scaleX];
              C = 255 - clampTo8bit(Y + 1.402 * (Cr - 128));
              M = 255 - clampTo8bit(Y - .3441363 * (Cb - 128) - .71413636 * (Cr - 128));
              Ye = 255 - clampTo8bit(Y + 1.772 * (Cb - 128));
            }
            data[offset++] = 255 - C;
            data[offset++] = 255 - M;
            data[offset++] = 255 - Ye;
            data[offset++] = 255 - K;
          }
        }
        break;

       default:
        throw new Error("Unsupported color mode");
      }
      return data;
    },
    copyToImageData: function copyToImageData(imageData, formatAsRGBA) {
      var width = imageData.width, height = imageData.height;
      var imageDataArray = imageData.data;
      var data = this.getData(width, height);
      var i = 0, j = 0, x, y;
      var Y, K, C, M, R, G, B;
      switch (this.components.length) {
       case 1:
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            Y = data[i++];
            imageDataArray[j++] = Y;
            imageDataArray[j++] = Y;
            imageDataArray[j++] = Y;
            if (formatAsRGBA) {
              imageDataArray[j++] = 255;
            }
          }
        }
        break;

       case 3:
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            R = data[i++];
            G = data[i++];
            B = data[i++];
            imageDataArray[j++] = R;
            imageDataArray[j++] = G;
            imageDataArray[j++] = B;
            if (formatAsRGBA) {
              imageDataArray[j++] = 255;
            }
          }
        }
        break;

       case 4:
        for (y = 0; y < height; y++) {
          for (x = 0; x < width; x++) {
            C = data[i++];
            M = data[i++];
            Y = data[i++];
            K = data[i++];
            R = 255 - clampTo8bit(C * (1 - K / 255) + K);
            G = 255 - clampTo8bit(M * (1 - K / 255) + K);
            B = 255 - clampTo8bit(Y * (1 - K / 255) + K);
            imageDataArray[j++] = R;
            imageDataArray[j++] = G;
            imageDataArray[j++] = B;
            if (formatAsRGBA) {
              imageDataArray[j++] = 255;
            }
          }
        }
        break;

       default:
        throw new Error("Unsupported color mode");
      }
    }
  };
  var totalBytesAllocated = 0;
  var maxMemoryUsageBytes = 0;
  function requestMemoryAllocation(increaseAmount = 0) {
    var totalMemoryImpactBytes = totalBytesAllocated + increaseAmount;
    if (totalMemoryImpactBytes > maxMemoryUsageBytes) {
      var exceededAmount = Math.ceil((totalMemoryImpactBytes - maxMemoryUsageBytes) / 1024 / 1024);
      throw new Error(`maxMemoryUsageInMB limit exceeded by at least ${exceededAmount}MB`);
    }
    totalBytesAllocated = totalMemoryImpactBytes;
  }
  constructor.resetMaxMemoryUsage = function(maxMemoryUsageBytes_) {
    totalBytesAllocated = 0;
    maxMemoryUsageBytes = maxMemoryUsageBytes_;
  };
  constructor.getBytesAllocated = function() {
    return totalBytesAllocated;
  };
  constructor.requestMemoryAllocation = requestMemoryAllocation;
  return constructor;
}();

function decodeJpeg(bytes, targetWidth) {
  const decoder = new JpegDecoderCore;
  decoder.opts = {
    colorTransform: undefined,
    useTArray: true,
    formatAsRGBA: false,
    tolerantDecoding: true,
    maxResolutionInMP: 100,
    maxMemoryUsageInMB: 512
  };
  JpegDecoderCore.resetMaxMemoryUsage(decoder.opts.maxMemoryUsageInMB * 1024 * 1024);
  decoder.parse(bytes);
  const width = targetWidth === undefined ? decoder.width : targetWidth;
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError("JPEG target width must be a positive integer");
  }
  const height = Math.max(1, Math.round(decoder.height * width / decoder.width));
  const samples = decoder.getData(width, height);
  const components = decoder.components.length;
  if (components === 3) return {
    width,
    height,
    rgb: samples
  };
  const pixelCount = width * height;
  if (components === 1) {
    JpegDecoderCore.requestMemoryAllocation(pixelCount * 3);
    const rgb = new Uint8Array(pixelCount * 3);
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const gray = samples[pixel];
      rgb[pixel * 3] = gray;
      rgb[pixel * 3 + 1] = gray;
      rgb[pixel * 3 + 2] = gray;
    }
    return {
      width,
      height,
      rgb
    };
  }
  if (components === 4) {
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const source = pixel * 4;
      const destination = pixel * 3;
      const cyan = samples[source];
      const magenta = samples[source + 1];
      const yellow = samples[source + 2];
      const black = samples[source + 3];
      samples[destination] = 255 - Math.min(255, Math.max(0, cyan * (1 - black / 255) + black));
      samples[destination + 1] = 255 - Math.min(255, Math.max(0, magenta * (1 - black / 255) + black));
      samples[destination + 2] = 255 - Math.min(255, Math.max(0, yellow * (1 - black / 255) + black));
    }
    return {
      width,
      height,
      rgb: samples.subarray(0, pixelCount * 3)
    };
  }
  throw new RangeError(`Unsupported JPEG component count ${components}`);
}

const _zigzag = new Uint8Array([ 0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53, 10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63 ]);

const stdDcLuminanceNrCodes = new Uint8Array([ 0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0 ]);

const stdDcLuminanceValues = new Uint8Array([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ]);

const stdAcLuminanceNrCodes = new Uint8Array([ 0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125 ]);

const stdAcLuminanceValues = new Uint8Array([ 1, 2, 3, 0, 4, 17, 5, 18, 33, 49, 65, 6, 19, 81, 97, 7, 34, 113, 20, 50, 129, 145, 161, 8, 35, 66, 177, 193, 21, 82, 209, 240, 36, 51, 98, 114, 130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41, 42, 52, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250 ]);

const stdDcChrominanceNrCodes = new Uint8Array([ 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0 ]);

const stdDcChrominanceValues = new Uint8Array([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ]);

const stdAcChrominanceNrCodes = new Uint8Array([ 0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119 ]);

const stdAcChrominanceValues = new Uint8Array([ 0, 1, 2, 3, 17, 4, 5, 33, 49, 6, 18, 65, 81, 7, 97, 113, 19, 34, 50, 129, 8, 20, 66, 145, 161, 177, 193, 9, 35, 51, 82, 240, 21, 98, 114, 209, 10, 22, 36, 52, 225, 37, 241, 23, 24, 25, 26, 38, 39, 40, 41, 42, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 130, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 226, 227, 228, 229, 230, 231, 232, 233, 234, 242, 243, 244, 245, 246, 247, 248, 249, 250 ]);

const yqt = new Uint8Array([ 16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99 ]);

const uvqt = new Uint8Array([ 17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99 ]);

const aasf = new Float64Array([ 1, 1.387039845, 1.306562965, 1.175875602, 1, .785694958, .5411961, .275899379 ]);

function transform(data) {
  let dataOff = 0;
  for (let i = 0; i < 8; ++i) {
    const d0 = data[dataOff];
    const d1 = data[dataOff + 1];
    const d2 = data[dataOff + 2];
    const d3 = data[dataOff + 3];
    const d4 = data[dataOff + 4];
    const d5 = data[dataOff + 5];
    const d6 = data[dataOff + 6];
    const d7 = data[dataOff + 7];
    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;
    let tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2;
    let tmp12 = tmp1 - tmp2;
    data[dataOff] = tmp10 + tmp11;
    data[dataOff + 4] = tmp10 - tmp11;
    const z1 = (tmp12 + tmp13) * .707106781;
    data[dataOff + 2] = tmp13 + z1;
    data[dataOff + 6] = tmp13 - z1;
    tmp10 = tmp4 + tmp5;
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;
    const z5 = (tmp10 - tmp12) * .382683433;
    const z2 = .5411961 * tmp10 + z5;
    const z4 = 1.306562965 * tmp12 + z5;
    const z3 = tmp11 * .707106781;
    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;
    data[dataOff + 5] = z13 + z2;
    data[dataOff + 3] = z13 - z2;
    data[dataOff + 1] = z11 + z4;
    data[dataOff + 7] = z11 - z4;
    dataOff += 8;
  }
  dataOff = 0;
  for (let i = 0; i < 8; ++i) {
    const d0 = data[dataOff];
    const d1 = data[dataOff + 8];
    const d2 = data[dataOff + 16];
    const d3 = data[dataOff + 24];
    const d4 = data[dataOff + 32];
    const d5 = data[dataOff + 40];
    const d6 = data[dataOff + 48];
    const d7 = data[dataOff + 56];
    const tmp0p2 = d0 + d7;
    const tmp7p2 = d0 - d7;
    const tmp1p2 = d1 + d6;
    const tmp6p2 = d1 - d6;
    const tmp2p2 = d2 + d5;
    const tmp5p2 = d2 - d5;
    const tmp3p2 = d3 + d4;
    const tmp4p2 = d3 - d4;
    let tmp10p2 = tmp0p2 + tmp3p2;
    const tmp13p2 = tmp0p2 - tmp3p2;
    let tmp11p2 = tmp1p2 + tmp2p2;
    let tmp12p2 = tmp1p2 - tmp2p2;
    data[dataOff] = tmp10p2 + tmp11p2;
    data[dataOff + 32] = tmp10p2 - tmp11p2;
    const z1p2 = (tmp12p2 + tmp13p2) * .707106781;
    data[dataOff + 16] = tmp13p2 + z1p2;
    data[dataOff + 48] = tmp13p2 - z1p2;
    tmp10p2 = tmp4p2 + tmp5p2;
    tmp11p2 = tmp5p2 + tmp6p2;
    tmp12p2 = tmp6p2 + tmp7p2;
    const z5p2 = (tmp10p2 - tmp12p2) * .382683433;
    const z2p2 = .5411961 * tmp10p2 + z5p2;
    const z4p2 = 1.306562965 * tmp12p2 + z5p2;
    const z3p2 = tmp11p2 * .707106781;
    const z11p2 = tmp7p2 + z3p2;
    const z13p2 = tmp7p2 - z3p2;
    data[dataOff + 40] = z13p2 + z2p2;
    data[dataOff + 24] = z13p2 - z2p2;
    data[dataOff + 8] = z11p2 + z4p2;
    data[dataOff + 56] = z11p2 - z4p2;
    dataOff++;
  }
}

function huffman(counts, values) {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let position = 0;
  for (let length = 1; length <= 16; length++) {
    for (let index = 0; index < counts[length]; index++) {
      const value = values[position++];
      codes[value] = code++;
      lengths[value] = length;
    }
    code *= 2;
  }
  return {
    codes,
    lengths
  };
}

const ydc = huffman(stdDcLuminanceNrCodes, stdDcLuminanceValues);

const yac = huffman(stdAcLuminanceNrCodes, stdAcLuminanceValues);

const uvdc = huffman(stdDcChrominanceNrCodes, stdDcChrominanceValues);

const uvac = huffman(stdAcChrominanceNrCodes, stdAcChrominanceValues);

function encodeJpeg(rgb, width, height) {
  if (!Number.isInteger(width) || width <= 0 || width > 65535 || !Number.isInteger(height) || height <= 0 || height > 65535) {
    throw new RangeError("JPEG dimensions must be integers between 1 and 65535");
  }
  if (rgb.length !== width * height * 3) throw new RangeError("JPEG RGB channel length does not match dimensions");
  const output = new PdfStream;
  const word = value => {
    output.putByte(value >>> 8);
    output.putByte(value & 255);
  };
  const yTable = new Uint8Array(64);
  const uvTable = new Uint8Array(64);
  const fy = new Float32Array(64);
  const fuv = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    yTable[_zigzag[i]] = Math.max(1, Math.floor((yqt[i] * 20 + 50) / 100));
    uvTable[_zigzag[i]] = Math.max(1, Math.floor((uvqt[i] * 20 + 50) / 100));
  }
  for (let i = 0; i < 64; i++) {
    const scale = aasf[i >> 3] * aasf[i & 7] * 8;
    fy[i] = 1 / (yTable[_zigzag[i]] * scale);
    fuv[i] = 1 / (uvTable[_zigzag[i]] * scale);
  }
  word(65496);
  word(65504);
  word(16);
  output.putBytes(new Uint8Array([ 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0 ]));
  word(65499);
  word(132);
  output.putByte(0);
  output.putBytes(yTable);
  output.putByte(1);
  output.putBytes(uvTable);
  word(65472);
  word(17);
  output.putByte(8);
  word(height);
  word(width);
  output.putBytes(new Uint8Array([ 3, 1, 17, 0, 2, 17, 1, 3, 17, 1 ]));
  word(65476);
  word(418);
  const table = (id, counts, values) => {
    output.putByte(id);
    output.putBytes(counts.subarray(1));
    output.putBytes(values);
  };
  table(0, stdDcLuminanceNrCodes, stdDcLuminanceValues);
  table(16, stdAcLuminanceNrCodes, stdAcLuminanceValues);
  table(1, stdDcChrominanceNrCodes, stdDcChrominanceValues);
  table(17, stdAcChrominanceNrCodes, stdAcChrominanceValues);
  word(65498);
  word(12);
  output.putBytes(new Uint8Array([ 3, 1, 0, 2, 17, 3, 17, 0, 63, 0 ]));
  let byte = 0;
  let bitPosition = 7;
  const bits = (value, length) => {
    for (let shift = length - 1; shift >= 0; shift--) {
      byte |= (value >>> shift & 1) << bitPosition;
      if (--bitPosition < 0) {
        output.putByte(byte);
        if (byte === 255) output.putByte(0);
        byte = 0;
        bitPosition = 7;
      }
    }
  };
  const symbol = (table, value) => {
    bits(table.codes[value], table.lengths[value]);
  };
  const coefficients = new Int32Array(64);
  const block = (data, factors, previous, dc, ac) => {
    transform(data);
    for (let i = 0; i < 64; i++) {
      const value = data[i] * factors[i];
      coefficients[_zigzag[i]] = Math.trunc(value + (value > 0 ? .5 : -.5));
    }
    const current = coefficients[0];
    const difference = current - previous;
    const magnitude = 32 - Math.clz32(Math.abs(difference));
    symbol(dc, magnitude);
    if (magnitude > 0) bits(difference < 0 ? difference + (1 << magnitude) - 1 : difference, magnitude);
    let end = 63;
    while (end > 0 && coefficients[end] === 0) end--;
    let zeros = 0;
    for (let i = 1; i <= end; i++) {
      const value = coefficients[i];
      if (value === 0) {
        zeros++;
        continue;
      }
      while (zeros >= 16) {
        symbol(ac, 240);
        zeros -= 16;
      }
      const size = 32 - Math.clz32(Math.abs(value));
      symbol(ac, zeros << 4 | size);
      bits(value < 0 ? value + (1 << size) - 1 : value, size);
      zeros = 0;
    }
    if (end < 63) symbol(ac, 0);
    return current;
  };
  const ydu = new Float32Array(64);
  const udu = new Float32Array(64);
  const vdu = new Float32Array(64);
  let dcy = 0;
  let dcu = 0;
  let dcv = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      for (let pos = 0; pos < 64; pos++) {
        const row = Math.min(y + (pos >> 3), height - 1);
        const col = Math.min(x + (pos & 7), width - 1);
        const offset = (row * width + col) * 3;
        const r = rgb[offset];
        const g = rgb[offset + 1];
        const b = rgb[offset + 2];
        ydu[pos] = (19595 * r + 38470 * g + 7471 * b + 32768 >> 16) - 128;
        udu[pos] = (-11059 * r - 21709 * g + 32768 * b + 8421375 >> 16) - 128;
        vdu[pos] = (32768 * r - 27439 * g - 5329 * b + 8421375 >> 16) - 128;
      }
      dcy = block(ydu, fy, dcy, ydc, yac);
      dcu = block(udu, fuv, dcu, uvdc, uvac);
      dcv = block(vdu, fuv, dcv, uvdc, uvac);
    }
  }
  if (bitPosition < 7) bits((1 << bitPosition + 1) - 1, bitPosition + 1);
  word(65497);
  return output.take();
}

const LARGE_IMAGE_PIXELS = 4e6;

function reportIfOversized(width, height) {
  const pixels = width * height;
  if (pixels < LARGE_IMAGE_PIXELS) return;
  reportPdfDiagnostic(`js_pdf (MemoryImage): received a ${width}x${height} image ` + `(${Math.round(pixels / 1e6)} megapixels). Every source pixel is embedded ` + "at full resolution unless the provider is given a dpi, so pass " + "{ dpi: 150 } to resample it down to what the page actually draws.");
}

function validateDpi(dpi) {
  if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) {
    throw new RangeError("Image DPI must be positive");
  }
  return dpi;
}

function resizeDecodedImage(image, width) {
  return image.resize(width);
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
    let width = 0;
    if (effectiveDpi !== null && size !== undefined) {
      if (!Number.isFinite(size.x) || size.x < 0 || !Number.isFinite(size.y) || size.y < 0) {
        throw new RangeError("Image resolve size must be finite and non-negative");
      }
      const target = Math.trunc(size.x / PageUnit.inch * effectiveDpi);
      if (target > 0 && target < this.width && this.sourceWidth > 0) {
        width = Math.max(1, Math.floor(target * this.sourceWidth / this.width));
        if (width >= this.sourceWidth) width = 0;
      }
    }
    let image = this.cache.get(width);
    if (image === undefined) {
      image = this.buildImage(width === 0 ? undefined : width);
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
  constructor(bytes, {orientation, dpi = null} = {}) {
    const stored = bytes.slice();
    let width;
    let height;
    let jpegInfo = null;
    if (stored[0] === 255 && stored[1] === 216) {
      jpegInfo = parseJpeg(stored);
      width = jpegInfo.width;
      height = jpegInfo.height;
    } else if (stored.length >= 24 && stored[0] === 137 && stored[1] === 80 && stored[2] === 78 && stored[3] === 71 && stored[4] === 13 && stored[5] === 10 && stored[6] === 26 && stored[7] === 10 && stored[12] === 73 && stored[13] === 72 && stored[14] === 68 && stored[15] === 82) {
      width = stored[16] * 16777216 + stored[17] * 65536 + stored[18] * 256 + stored[19] >>> 0;
      height = stored[20] * 16777216 + stored[21] * 65536 + stored[22] * 256 + stored[23] >>> 0;
      if (width === 0 || height === 0) throw new RangeError("PNG dimensions must be positive");
    } else {
      throw new TypeError(`Unable to determine image type from ${stored.length} bytes`);
    }
    const resolvedOrientation = orientation ?? jpegInfo?.orientation ?? "topLeft";
    super(width, height, resolvedOrientation, dpi);
    this.bytes = stored;
    this.jpegInfo = jpegInfo;
    if (dpi === null) reportIfOversized(width, height);
  }
  buildImage(width) {
    if (this.jpegInfo !== null) {
      if (width === undefined) {
        return new PdfImage({
          jpeg: this.bytes,
          info: this.jpegInfo,
          orientation: this.orientation
        });
      }
      const decoded = decodeJpeg(this.bytes, width);
      const jpeg = encodeJpeg(decoded.rgb, decoded.width, decoded.height);
      return new PdfImage({
        jpeg,
        info: parseJpeg(jpeg),
        orientation: this.orientation
      });
    }
    const image = PdfImage.fromPng(this.bytes, this.orientation);
    return width === undefined ? image : resizeDecodedImage(image, width);
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

function textWidth(style, value) {
  let glyphs = 0;
  let spaces = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 32) spaces++;
    if (code < 56320 || code > 57343) glyphs++;
  }
  return style.font.stringMetrics(value, style.fontSize).advanceWidth + glyphs * style.letterSpacing + spaces * style.wordSpacing;
}

function supportsRune(font, codePoint) {
  const candidate = font;
  return candidate.isRuneSupported?.(codePoint) ?? codePoint <= 255;
}

const bitmapProviders = new WeakMap;

function bitmapWidget(bitmap, fontSize) {
  let provider = bitmapProviders.get(bitmap);
  if (provider === undefined) {
    provider = new MemoryImage(bitmap.data);
    bitmapProviders.set(bitmap, provider);
  }
  return new Image(provider, {
    width: fontSize * bitmap.width / bitmap.height,
    height: fontSize
  });
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
    lineAdvance: fontSize * (font.ascent - font.descent) * (style.height ?? DEFAULT_LINE_HEIGHT),
    lineSpacing: (style.lineSpacing ?? 0) * scale,
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
    if (current !== "" && textWidth(style, candidate) - style.letterSpacing > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current !== "") parts.push(current);
  return parts.length === 0 ? [ "" ] : parts;
}

function isSingleAsciiWord(value) {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 33 || code > 126) return false;
    if (code === 45 && !/\d/.test(value.charAt(index + 1))) return false;
  }
  return true;
}

const SPACES = "\\t\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000";

const GAP = new RegExp(`^[${SPACES}]+$`);

const WORDS = new RegExp(`([${SPACES}]+)|(?<=\\u200b)(?!\\u2060)|(?<=[^${SPACES}][-\\u2010])(?![\\d\\u2060])`);

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc\u200f\u202b\u202e\u2067]/;

const IGNORABLE = /[\xad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]/u;

function splitLine(line, splitter) {
  if (splitter === null) return line.split(WORDS).filter(part => part);
  const parts = splitter(line);
  const result = [];
  let cursor = 0;
  for (const part of parts) {
    if (part === "") continue;
    const start = line.indexOf(part, cursor);
    if (typeof part !== "string" || start < 0 || /\S/u.test(line.slice(cursor, start))) {
      throw new RangeError("lineSplitter must return ordered source segments, omitting only whitespace");
    }
    if (start > cursor) result.push(line.slice(cursor, start));
    result.push(part);
    cursor = start + part.length;
  }
  const tail = line.slice(cursor);
  if (/\S/u.test(tail)) throw new RangeError("lineSplitter must preserve all non-whitespace text");
  if (tail !== "") result.push(tail);
  return result;
}

function trimTrailingGaps(line) {
  while (line.tokens[line.tokens.length - 1]?.kind === "gap") {
    line.width -= line.tokens.pop()?.width ?? 0;
  }
}

function sliceToken(token, start, end, suffix = "") {
  const text = token.text.slice(start, end) + suffix;
  let levels = token.levels;
  if (levels) {
    const sliced = new Uint8Array(text.length);
    sliced.set(levels.subarray(start, end));
    sliced.fill(levels[end - 1] ?? 0, end - start);
    levels = sliced;
  }
  const shy = token.shy?.filter(offset => offset > start && offset < end).map(offset => offset - start);
  return {
    ...token,
    text,
    width: textWidth(token.style, text),
    levels,
    shy: shy?.length ? shy : undefined
  };
}

function softSyllables(text, offsets) {
  const syllables = [];
  let start = 0;
  for (const offset of offsets) {
    if (offset <= start || offset >= text.length) continue;
    syllables.push(text.slice(start, offset));
    start = offset;
  }
  syllables.push(text.slice(start));
  return syllables;
}

function visualOrder(tokens, base) {
  const bidi = unicodeBidi();
  const pieces = [];
  const pieceLevels = [];
  let skeleton = "";
  for (const token of tokens) {
    const levels = token.levels;
    if (token.kind === "widget" || !levels) {
      pieces.push(token);
      pieceLevels.push(levels?.[0] ?? base);
      skeleton += "￼";
      continue;
    }
    let start = 0;
    for (let index = 1; index <= token.text.length; index++) {
      if (index < token.text.length && (levels[index] === levels[start] || (token.text.charCodeAt(index) & 64512) === 56320)) continue;
      pieces.push(start === 0 && index === token.text.length ? token : sliceToken(token, start, index));
      pieceLevels.push(levels[start] ?? base);
      skeleton += token.kind === "gap" ? " " : "a";
      start = index;
    }
  }
  const order = pieces.map((_, index) => index);
  const segments = bidi.getReorderSegments(skeleton, {
    levels: Uint8Array.from(pieceLevels),
    paragraphs: [ {
      start: 0,
      end: pieces.length - 1,
      level: base
    } ]
  });
  for (const [first = 0, last = 0] of segments) {
    for (let low = first, high = last; low < high; low++, high--) {
      const swap = order[low] ?? 0;
      order[low] = order[high] ?? 0;
      order[high] = swap;
    }
  }
  return order.map(index => {
    const piece = pieces[index];
    if (piece.kind !== "text" || ((pieceLevels[index] ?? 0) & 1) === 0) return piece;
    let text = "";
    for (const character of piece.text) text = (bidi.getMirroredCharacter(character) ?? character) + text;
    return {
      ...piece,
      text
    };
  });
}

function positionLine(line, y, contentWidth, align, direction, bidi) {
  let lineSpacing = line.emptyStyle.lineSpacing;
  let ascent = line.emptyStyle.fontSize + Math.max(0, line.emptyStyle.baseline);
  let descent = Math.max(0, line.emptyStyle.lineAdvance + lineSpacing - line.emptyStyle.fontSize - line.emptyStyle.baseline);
  let minimumHeight = line.emptyStyle.lineAdvance + lineSpacing;
  for (const token of line.tokens) {
    lineSpacing = Math.max(lineSpacing, token.style.lineSpacing);
    minimumHeight = Math.max(minimumHeight, token.style.lineAdvance + token.style.lineSpacing);
    if (token.kind === "widget") {
      ascent = Math.max(ascent, token.height + token.style.baseline);
      descent = Math.max(descent, -token.style.baseline);
    } else {
      ascent = Math.max(ascent, token.style.fontSize + token.style.baseline);
      descent = Math.max(descent, token.style.lineAdvance + token.style.lineSpacing - token.style.fontSize - token.style.baseline);
    }
  }
  const height = Math.max(minimumHeight, ascent + descent);
  const resolvedAlign = align === "start" ? direction === "rtl" ? "right" : "left" : align === "end" ? direction === "rtl" ? "left" : "right" : align;
  const tokens = bidi ? visualOrder(line.tokens, direction === "rtl" ? 1 : 0) : line.tokens;
  const gapCount = line.wrapped && resolvedAlign === "justify" ? tokens.filter(token => token.kind === "gap").length : 0;
  const extraPerGap = gapCount === 0 ? 0 : Math.max(0, contentWidth - line.width) / gapCount;
  const effectiveAlign = resolvedAlign === "justify" && extraPerGap === 0 && direction === "rtl" ? "right" : resolvedAlign;
  let offset = 0;
  if (effectiveAlign === "right") offset = contentWidth - line.width;
  if (effectiveAlign === "center") offset = (contentWidth - line.width) / 2;
  const paintTokens = [];
  for (const token of tokens) {
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
    const runX = x + accumulatedExtra;
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
  const last = runs[runs.length - 1];
  if (last !== undefined && last.kind === "text" && last.style.letterSpacing !== 0) {
    runs[runs.length - 1] = {
      ...last,
      width: last.width - last.style.letterSpacing
    };
  }
  const usedWidth = extraPerGap === 0 ? line.width : contentWidth;
  return {
    runs,
    y,
    width: usedWidth,
    height,
    lineSpacing,
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
  constructor({lineSplitter = null, hyphenation = null, text, textAlign = null, textDirection = null, softWrap = null, tightBounds = false, textScaleFactor = 1, maxLines = null, overflow = null, margin = 0}) {
    super();
    this.directFont = null;
    this.text = text;
    this.lineSplitter = lineSplitter;
    this.hyphenation = hyphenation;
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
    const scale = this.textScaleFactor;
    const direction = this.textDirection ?? Directionality.of(context);
    const items = [];
    let source = "";
    let bidi = direction === "rtl";
    this.text.visitChildren((span, textStyle, annotation) => {
      const style = resolveStyle(context, textStyle, span.baseline, scale, this.directFont);
      if (span instanceof WidgetSpan) {
        const childBox = span.child.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: Infinity
        }));
        items.push({
          kind: "widget",
          start: source.length,
          token: {
            kind: "widget",
            width: childBox.width,
            height: childBox.height,
            style,
            childBox,
            annotation
          }
        });
        source += "￼";
      } else if (span instanceof TextSpan && span.text !== null) {
        const text = span.text.replace(/\r\n?/g, "\n");
        bidi || (bidi = RTL.test(text));
        items.push({
          kind: "span",
          textStyle,
          style,
          annotation,
          text,
          start: source.length
        });
        source += text;
      }
      return true;
    }, context.theme.defaultTextStyle);
    let levels = null;
    if (bidi) {
      const arabic = /[\u0621-\u06d3]/.test(source);
      let shaped = "";
      for (const item of items) {
        const start = item.start;
        item.start = shaped.length;
        if (item.kind === "widget") shaped += "￼"; else shaped += item.text = arabic ? shapeArabicRange(source, start, start + item.text.length) : item.text;
      }
      levels = unicodeBidi().getEmbeddingLevels(shaped, direction).levels;
    }
    const result = [];
    const groupLevels = levels === null ? null : new Uint8Array(levels.length);
    for (const item of items) {
      if (item.kind === "widget") {
        result.push(levels === null ? item.token : {
          ...item.token,
          levels: levels.subarray(item.start, item.start + 1)
        });
        continue;
      }
      const {style: baseStyle, textStyle, annotation, text} = item;
      let group = "";
      let groupFont = baseStyle.font;
      let kind = "text";
      let shy = [];
      const styles = new Map([ [ baseStyle.font, baseStyle ] ]);
      const flush = () => {
        if (group === "") return;
        let style = styles.get(groupFont);
        if (style === undefined) {
          style = {
            ...baseStyle,
            font: groupFont
          };
          styles.set(groupFont, style);
        }
        result.push({
          kind,
          text: group,
          width: textWidth(style, group),
          style,
          annotation,
          levels: groupLevels?.slice(0, group.length) ?? null,
          shy: shy.length === 0 ? undefined : shy
        });
        group = "";
        shy = [];
      };
      const singleWord = this.lineSplitter === null && isSingleAsciiWord(text);
      const lines = singleWord ? [ text ] : text.split("\n");
      let offset = item.start;
      for (let index = 0; index < lines.length; index++) {
        if (index > 0) {
          result.push({
            kind: "break",
            style: baseStyle
          });
          offset++;
        }
        const parts = singleWord ? [ text ] : splitLine(lines[index] ?? "", this.lineSplitter);
        for (const part of parts) {
          kind = !singleWord && GAP.test(part) ? "gap" : "text";
          for (let at = 0; at < part.length; ) {
            const codePoint = part.codePointAt(at) ?? 0;
            let character = String.fromCodePoint(codePoint);
            const unit = offset + at;
            at += character.length;
            if (codePoint >= 173 && IGNORABLE.test(character)) {
              if (codePoint === 173 && group !== "" && part.charCodeAt(at) !== 8288) shy.push(group.length);
              continue;
            }
            let font = baseStyle.font;
            let bitmap = null;
            if (codePoint < 32 || !supportsRune(font, codePoint)) {
              for (const fallback of codePoint < 32 ? [] : textStyle.fontFallback) {
                const candidate = fallback.getFont(context);
                if (supportsRune(candidate, codePoint)) {
                  font = candidate;
                  bitmap = candidate.getBitmap?.(codePoint) ?? null;
                  break;
                }
              }
              if (font === baseStyle.font && (codePoint < 32 || /\s/.test(character))) character = " ";
            }
            if (bitmap !== null) {
              flush();
              const metrics = bitmap.metrics.scale(baseStyle.fontSize);
              const widget = bitmapWidget(bitmap, baseStyle.fontSize);
              const childBox = widget.layout(context, new BoxConstraints({
                maxWidth,
                maxHeight: Infinity
              }));
              result.push({
                kind: "widget",
                width: childBox.width,
                height: childBox.height,
                style: {
                  ...baseStyle,
                  font,
                  baseline: baseStyle.baseline + metrics.ascent + metrics.descent - metrics.height
                },
                childBox,
                annotation,
                levels: levels?.subarray(unit, unit + 1) ?? null
              });
              groupFont = baseStyle.font;
              continue;
            }
            if (font !== groupFont && group !== "") flush();
            groupFont = font;
            if (levels !== null) groupLevels?.set(levels.subarray(unit, unit + character.length), group.length);
            group += character;
          }
          flush();
          offset += part.length;
        }
      }
    }
    const first = items[0];
    return {
      tokens: result,
      style: first === undefined ? null : first.kind === "widget" ? first.token.style : first.style,
      bidi: levels !== null
    };
  }
  allLines(context, contentWidth, minContentWidth = 0) {
    const align = this.textAlign ?? context.theme.textAlign ?? "start";
    const softWrap = this.softWrap ?? context.theme.softWrap;
    const maxLines = this.maxLines ?? context.theme.maxLines;
    const {tokens, style, bidi} = this.inputTokens(context, contentWidth);
    if (style === null) return [];
    if (context.minContent === true) {
      let widest = 1;
      for (const token of tokens) {
        if (token.kind === "text" || token.kind === "widget") widest = Math.max(widest, token.width);
      }
      contentWidth = Math.min(contentWidth, widest);
    }
    const raw = [];
    let current = {
      tokens: [],
      width: 0,
      blank: 0,
      wrapped: false,
      emptyStyle: style
    };
    const pushLine = wrapped => {
      trimTrailingGaps(current);
      const last = current.tokens[current.tokens.length - 1];
      if (last === undefined) current.width = current.blank; else if (last.kind === "text") current.width -= last.style.letterSpacing;
      current.wrapped = wrapped;
      raw.push(current);
      current = {
        tokens: [],
        width: 0,
        blank: 0,
        wrapped: false,
        emptyStyle: current.emptyStyle
      };
    };
    const appendToken = token => {
      current.tokens.push(token);
      current.width += token.width;
    };
    const overflows = (width, token) => current.width + width - (token.kind === "text" ? token.style.letterSpacing : 0) > contentWidth + 1e-5;
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex];
      if (token === undefined) continue;
      current.emptyStyle = token.style;
      if (token.kind === "break") {
        pushLine(false);
        continue;
      }
      if (token.kind === "gap" && current.tokens.length === 0) {
        current.blank += token.width;
        continue;
      }
      if (softWrap && token.kind === "text" && overflows(token.width, token)) {
        const syllables = token.shy !== undefined ? softSyllables(token.text, token.shy) : this.hyphenation?.(token.text) ?? [];
        if (syllables.length > 1) {
          if (syllables.some(part => typeof part !== "string" || part === "") || syllables.join("") !== token.text) {
            throw new RangeError("hyphenation must return nonempty syllables which reconstruct the word");
          }
          let fits = "";
          for (let index = 0; index < syllables.length - 1; index++) {
            const candidate = fits + syllables[index];
            if (overflows(textWidth(token.style, candidate + "-"), token)) break;
            fits = candidate;
          }
          if (fits !== "") {
            appendToken(sliceToken(token, 0, fits.length, "-"));
            pushLine(true);
            tokens[tokenIndex] = sliceToken(token, fits.length, token.text.length);
            tokenIndex--;
            continue;
          }
        }
      }
      if (softWrap && current.tokens.length > 0 && overflows(token.width, token)) {
        pushLine(true);
        if (token.kind !== "gap") tokenIndex--;
        continue;
      }
      if (token.kind === "text" && softWrap && token.width - token.style.letterSpacing > contentWidth + 1e-5) {
        const pieces = splitLongWord(token.text, contentWidth, token.style);
        let start = 0;
        for (let index = 0; index < pieces.length; index++) {
          const part = sliceToken(token, start, start += (pieces[index] ?? "").length);
          if (current.tokens.length > 0) pushLine(true);
          current.tokens.push(part);
          current.width = part.width;
          if (index < pieces.length - 1) pushLine(true);
        }
        continue;
      }
      appendToken(token);
    }
    if (current.tokens.length > 0 || raw.length === 0 || tokens[tokens.length - 1]?.kind === "break") pushLine(false);
    const limited = maxLines === null ? raw : raw.slice(0, Math.max(1, maxLines));
    const targetWidth = limited.some(line => line.wrapped || align === "justify") ? contentWidth : Math.max(0, minContentWidth, ...limited.map(line => line.width));
    let y = 0;
    const lines = [];
    const textDirection = this.textDirection ?? Directionality.of(context);
    for (const line of limited) {
      const positioned = positionLine(line, y, targetWidth, align, textDirection, bidi);
      lines.push(positioned);
      y += positioned.height;
    }
    const last = lines[lines.length - 1];
    if (last !== undefined && last.lineSpacing > 0) {
      lines[lines.length - 1] = {
        ...last,
        height: Math.max(0, last.height - last.lineSpacing)
      };
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
          clip: effectiveOverflow === "clip" || naturalHeight > size.height + 1e-5,
          textDirection: this.textDirection ?? Directionality.of(context)
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
          run.style.background.paint(context, x, y, run.width, run.height, "all", box.data.textDirection);
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
  constructor(value, {lineSplitter = null, hyphenation = null, style = undefined, fontSize = undefined, lineHeight = undefined, color = undefined, align = undefined, textAlign = undefined, textDirection = null, softWrap = undefined, tightBounds = false, textScaleFactor = 1, margin = 0, maxLines = undefined, overflow = undefined, font = undefined} = {}) {
    const overrides = new TextStyle({
      color: color === undefined ? null : normalizePaintColor(color),
      font: font === undefined ? null : undefined,
      fontSize: fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), "fontSize"),
      height: lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), "lineHeight")
    });
    const merged = (style ?? new TextStyle).merge(overrides);
    super({
      lineSplitter,
      hyphenation,
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
  get canSpan() {
    return false;
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
    this.bulletColor = normalizePaintColor(bulletColor);
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
              borderStyle: "dotted",
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

class Watermark extends StatelessWidget {
  constructor({child, fit = "contain", angle = 0}) {
    super();
    this.child = child;
    this.fit = fit;
    this.angle = Number(angle);
  }
  static text(text, {style = null, fit = "contain", angle = Math.PI / 4} = {}) {
    return new Watermark({
      fit,
      angle,
      child: new Text(text, {
        style: style ?? new TextStyle({
          color: "#eeeeee",
          fontWeight: "bold"
        })
      })
    });
  }
  build(_context) {
    return new LayoutBuilder({
      builder: (_context, constraints) => new SizedBox({
        width: constraints.maxWidth,
        height: constraints.maxHeight,
        child: new FittedBox({
          fit: this.fit,
          child: new Transform({
            rotateBox: this.angle,
            child: this.child
          })
        })
      })
    });
  }
}

class Footer extends StatelessWidget {
  constructor({leading = null, title = null, trailing = null, margin = 0, padding = 0, decoration = null} = {}) {
    super();
    this.leading = leading;
    this.title = title;
    this.trailing = trailing;
    this.margin = margin;
    this.padding = padding;
    this.decoration = decoration;
  }
  build(_context) {
    return new Container({
      margin: this.margin,
      padding: this.padding,
      decoration: this.decoration,
      child: new Row({
        mainAxisSize: "max",
        mainAxisAlignment: "spaceBetween",
        children: [ this.leading ?? new SizedBox, this.title ?? new SizedBox, this.trailing ?? new SizedBox ]
      })
    });
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
    this.surfaceColor = normalizePaintColor(color);
    const border = normalizePaintColor(borderColor ?? CHART_BLACK);
    this.drawBorder = drawBorder ?? (borderColor !== null && borderColor !== undefined && !samePaintColor(border, this.surfaceColor));
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
    this.color = normalizePaintColor(color ?? CHART_BLACK);
    this.width = width ?? 1;
    this.divisions = divisions ?? false;
    this.divisionsWidth = divisionsWidth ?? .5;
    this.divisionsColor = normalizePaintColor(divisionsColor ?? GREY);
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
    if ((this.angle % Math.PI + Math.PI) % Math.PI > Math.PI / 2) return -1;
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
      width: 0,
      height: 0
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
    const marginEnd = Math.max(incoming.marginEnd, ad === 0 ? lastSize.height / 2 : ad < 0 ? lastSize.height : 0);
    const minStart = ad === 0 ? firstSize.height / 2 : ad > 0 ? firstSize.height : 0;
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
  constructor({value, legend = null, legendWidget = null, color, borderColor = CHART_WHITE, borderWidth = 1.5, drawBorder = null, drawSurface = true, surfaceOpacity = 1, offset = 0, legendStyle = null, legendAlign = null, legendPosition = "auto", legendLineWidth = 1, legendLineColor = null, legendOffset = 20, innerRadius = 0}) {
    super({
      legend,
      color: color ?? CHART_BLUE,
      borderColor,
      borderWidth
    });
    if (innerRadius < 0) throw new RangeError("PieDataSet innerRadius must not be negative");
    if (offset < 0) throw new RangeError("PieDataSet offset must not be negative");
    this.value = Number(value);
    if (!Number.isFinite(this.value)) throw new RangeError("PieDataSet value must be a finite number");
    this.legendWidget = legendWidget;
    const fill = this.color ?? normalizePaintColor(CHART_BLUE);
    const border = this.borderColor;
    this.drawBorder = drawBorder ?? (border !== null && !samePaintColor(border, fill));
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
    this.legendLineColor = legendLineColor === null ? fill : normalizePaintColor(legendLineColor);
    this.legendOffset = Number(legendOffset);
    this.innerRadius = Number(innerRadius);
  }
  isFullCircle(frame) {
    return frame.angleEnd - frame.angleStart >= Math.PI * 2 - 1e-12;
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
    const legend = this.legendWidget ?? (this.legend === null ? null : new RichText({
      text: new TextSpan({
        children: [ new TextSpan({
          text: this.legend,
          style: this.legendStyle ?? undefined
        }) ],
        style: new TextStyle({
          color: position === "inside" ? isLightColor(this.color ?? CHART_BLUE) ? normalizePaintColor(CHART_BLACK) : normalizePaintColor(CHART_WHITE) : null
        })
      }),
      textAlign: align
    }));
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
    this.metadata = null;
    this.pageLabels = null;
    this.formFields = [];
    this.formFonts = new Map;
    this.showOutlines = false;
    this.pageList = pageList;
  }
  prepare() {
    this.params.set("/Pages", this.pageList.ref());
    if (this.names !== null) this.params.set("/Names", this.names.ref());
    if (this.outline !== null) this.params.set("/Outlines", this.outline.ref());
    if (this.metadata !== null) this.params.set("/Metadata", this.metadata.ref());
    if (this.pageLabels !== null && this.pageLabels.labels.size > 0) {
      this.params.set("/PageLabels", this.pageLabels.ref());
    }
    if (this.formFields.length > 0) {
      const form = new PdfDict([ [ "/Fields", PdfArray.fromObjects(this.formFields) ], [ "/NeedAppearances", new PdfBool(false) ] ]);
      if (this.formFonts.size > 0) {
        form.set("/DR", new PdfDict([ [ "/Font", PdfDict.fromObjectMap(this.formFonts) ] ]));
      }
      this.params.set("/AcroForm", form);
    }
    if (this.showOutlines) this.params.set("/PageMode", new PdfName("/UseOutlines"));
  }
}

const LIBRARY_NAME = "https://github.com/romulocrj/js_pdf";

class PdfInfo extends PdfObject {
  constructor(document, metadata) {
    super(document, new PdfDict);
    const producer = metadata.producer == null ? LIBRARY_NAME : `${metadata.producer} (${LIBRARY_NAME})`;
    const entries = [ [ "/Title", metadata.title ], [ "/Author", metadata.author ], [ "/Subject", metadata.subject ], [ "/Keywords", metadata.keywords ], [ "/Creator", metadata.creator ], [ "/Producer", producer ] ];
    for (const [key, value] of entries) {
      if (value) {
        this.params.set(key, new PdfString(value));
      }
    }
    this.params.set("/CreationDate", PdfString.fromDate(new Date));
  }
}

class PdfGraphicStream extends PdfObject {
  constructor() {
    super(...arguments);
    this.fonts = new Map;
    this.xObjects = new Map;
    this.graphicStates = new Map;
    this.patterns = new Map;
    this.shadings = new Map;
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
  addShading(name, shading) {
    if (!this.shadings.has(name)) {
      this.shadings.set(name, shading);
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
    if (this.shadings.size > 0) {
      resources.set("/Shading", new PdfDict(this.shadings));
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
    this.destinations = new Map;
  }
  has(name) {
    return this.destinations.has(name);
  }
  addDestination(name, page, {x = null, y = null, zoom = null} = {}) {
    this.destinations.set(name, {
      page,
      x,
      y,
      zoom
    });
  }
  prepare() {
    const sorted = [ ...this.destinations ].map(([name, destination]) => ({
      key: pdfTextBytes(name),
      name,
      destination
    })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    const values = new PdfArray;
    for (const {name, destination} of sorted) {
      values.add(new PdfString(name));
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
      if (this.children.length > 0) this.params.set("/Count", new PdfNum(-this.children.length));
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
  constructor(document, page, annotation, defaultAppearanceName = null, appearances = null) {
    super(document, new PdfDict([ [ "/Type", new PdfName("/Annot") ] ]));
    this.parent = null;
    this.page = page;
    this.annotation = annotation;
    this.defaultAppearanceName = defaultAppearanceName;
    this.appearances = appearances;
    page.annotations.push(this);
  }
  prepare() {
    if (this.annotation.border != null) this.params.set("/BS", new PdfBorder(this.annotation.border).output());
    if (this.annotation.kind === "text") {
      const note = this.annotation;
      this.prepareGeometric({
        ...note,
        kind: "geometric",
        shape: "square"
      });
      this.params.set("/Subtype", new PdfName("/Text"));
      this.params.set("/Open", new PdfBool(note.open ?? false));
      this.params.set("/Name", new PdfName("/" + (note.icon ?? "Note")));
      return;
    }
    if (this.annotation.kind === "form") {
      this.prepareForm(this.annotation);
      return;
    }
    if (this.annotation.kind === "geometric") {
      this.prepareGeometric(this.annotation);
      return;
    }
    const {rect, destination, kind} = this.annotation;
    this.params.set("/Subtype", new PdfName("/Link"));
    this.params.set("/Rect", PdfArray.fromNum([ rect.x, rect.y, rect.x + rect.width, rect.y + rect.height ]));
    this.params.set("/P", this.page.ref());
    this.params.set("/Border", PdfArray.fromNum([ 0, 0, 0 ]));
    this.params.set("/F", new PdfNum(4));
    this.params.set("/A", new PdfDict([ [ "/S", new PdfName(kind === "url" ? "/URI" : "/GoTo") ], [ kind === "url" ? "/URI" : "/D", new PdfString(destination) ] ]));
  }
  prepareGeometric(annotation) {
    const subtypes = {
      square: "/Square",
      circle: "/Circle",
      polygon: "/Polygon",
      polyline: "/PolyLine",
      ink: "/Ink"
    };
    this.params.set("/Subtype", new PdfName(subtypes[annotation.shape]));
    this.params.set("/Rect", PdfArray.fromNum([ annotation.rect.x, annotation.rect.y, annotation.rect.x + annotation.rect.width, annotation.rect.y + annotation.rect.height ]));
    this.params.set("/P", this.page.ref());
    this.params.set("/F", new PdfNum(4));
    this.params.set("/BS", new PdfBorder(annotation.border ?? {
      width: annotation.borderWidth ?? 1
    }).output());
    if (annotation.color !== null && annotation.color !== undefined) {
      this.params.set("/C", PdfArray.fromColor(annotation.color));
    }
    if (annotation.interiorColor !== null && annotation.interiorColor !== undefined) {
      this.params.set("/IC", PdfArray.fromColor(annotation.interiorColor));
    }
    if (annotation.author) this.params.set("/T", new PdfString(annotation.author));
    if (annotation.subject) this.params.set("/Subj", new PdfString(annotation.subject));
    if (annotation.content) this.params.set("/Contents", new PdfString(annotation.content));
    if (annotation.date) this.params.set("/M", new PdfString(annotation.date));
    if (annotation.points !== undefined) {
      this.params.set("/Vertices", PdfArray.fromNum(annotation.points.flatMap(point => [ point.x, point.y ])));
    }
    if (annotation.inkList !== undefined) {
      this.params.set("/InkList", new PdfArray(annotation.inkList.map(points => PdfArray.fromNum(points.flatMap(point => [ point.x, point.y ])))));
    }
  }
  prepareForm(field) {
    const fieldNames = {
      text: "/Tx",
      choice: "/Ch",
      checkbox: "/Btn",
      button: "/Btn"
    };
    this.params.set("/Subtype", new PdfName("/Widget"));
    this.params.set("/Rect", PdfArray.fromNum([ field.rect.x, field.rect.y, field.rect.x + field.rect.width, field.rect.y + field.rect.height ]));
    this.params.set("/P", this.page.ref());
    this.params.set("/F", new PdfNum(4));
    const fieldParams = this.parent?.params ?? this.params;
    fieldParams.set("/FT", new PdfName(fieldNames[field.fieldType]));
    if (this.parent === null) this.params.set("/T", new PdfString(field.name)); else this.params.set("/Parent", this.parent.ref());
    fieldParams.set("/Ff", new PdfNum(field.fieldFlags ?? 0));
    if (field.alternateName) fieldParams.set("/TU", new PdfString(field.alternateName));
    if (field.mappingName) fieldParams.set("/TM", new PdfString(field.mappingName));
    if (field.maxLength !== null && field.maxLength !== undefined) {
      fieldParams.set("/MaxLen", new PdfNum(field.maxLength));
    }
    if (field.textAlign !== null && field.textAlign !== undefined) {
      fieldParams.set("/Q", new PdfNum([ "left", "center", "right" ].indexOf(field.textAlign)));
    }
    if (field.items !== undefined) {
      fieldParams.set("/Opt", new PdfArray(field.items.map(item => new PdfString(item))));
    }
    const isButton = field.fieldType === "checkbox" || field.fieldType === "button";
    if (field.value) {
      fieldParams.set("/V", isButton ? new PdfName(field.value) : new PdfString(field.value));
    }
    if (field.defaultValue) {
      fieldParams.set("/DV", isButton ? new PdfName(field.defaultValue) : new PdfString(field.defaultValue));
    }
    if (field.fieldType === "checkbox") {
      this.params.set("/AS", new PdfName(field.value ?? "/Off"));
    }
    if (this.defaultAppearanceName !== null) {
      fieldParams.set("/DA", new PdfString(`${this.defaultAppearanceName} ${formatNumber(field.fontSize ?? 12)} Tf ${colorOperator(field.textColor ?? [ 0, 0, 0 ])}`));
    }
    const appearance = new PdfDict;
    if (field.borderColor !== null && field.borderColor !== undefined) {
      appearance.set("/BC", PdfArray.fromColor(field.borderColor));
    }
    if (field.backgroundColor !== null && field.backgroundColor !== undefined) {
      appearance.set("/BG", PdfArray.fromColor(field.backgroundColor));
    }
    if (!appearance.isEmpty) this.params.set("/MK", appearance);
    const highlights = {
      none: "/N",
      invert: "/I",
      outline: "/O",
      push: "/P",
      toggle: "/T"
    };
    if (field.highlighting !== null && field.highlighting !== undefined) {
      this.params.set("/H", new PdfName(highlights[field.highlighting]));
    }
    if (this.appearances !== null) {
      const appearances = new PdfDict;
      if (this.appearances.normal !== undefined) {
        appearances.set("/N", this.appearances.normal.ref());
      } else if (this.appearances.normalStates !== undefined) {
        const states = new PdfDict;
        for (const [name, appearance] of this.appearances.normalStates) {
          states.set(name, appearance.ref());
        }
        appearances.set("/N", states);
      }
      if (this.appearances.down !== undefined) appearances.set("/D", this.appearances.down.ref());
      if (this.appearances.rollover !== undefined) {
        appearances.set("/R", this.appearances.rollover.ref());
      }
      if (!appearances.isEmpty) this.params.set("/AP", appearances);
    }
  }
}

class PdfMetadata extends PdfObjectStream {
  constructor(document, metadata) {
    super(document, utf8Encode(metadata), false);
    this.params.set("/Type", new PdfName("/Metadata"));
    this.params.set("/Subtype", new PdfName("/XML"));
  }
}

class PdfDocument {
  constructor(metadata, settings = DEFAULT_PDF_SETTINGS) {
    this.serial = 0;
    this.xref = new PdfXrefTable;
    this.fontObjects = new Map;
    this.imageObjects = new Map;
    this.formObjects = new Map;
    this.softMaskObjects = new Map;
    this.formFontNames = new Map;
    this.formFieldKids = new Map;
    this.settings = settings;
    const catalogSerial = this.genSerial();
    this.pageList = new PdfPageList(this);
    this.catalog = new PdfCatalog(this, this.pageList, catalogSerial);
    this.info = new PdfInfo(this, metadata);
    if (metadata.xmpMetadata) {
      this.catalog.metadata = new PdfMetadata(this, metadata.xmpMetadata);
    }
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
  softMaskObject(mask) {
    let object = this.softMaskObjects.get(mask);
    if (object === undefined) {
      object = new PdfXObject(this, "/Form", mask.content);
      object.params.set("/FormType", new PdfNum(1));
      object.params.set("/BBox", PdfArray.fromNum([ mask.boundingBox.x, mask.boundingBox.y, mask.boundingBox.x + mask.boundingBox.width, mask.boundingBox.y + mask.boundingBox.height ]));
      object.params.set("/Group", new PdfDict([ [ "/S", new PdfName("/Transparency") ], [ "/CS", new PdfName("/DeviceRGB") ] ]));
      const resources = new PdfDict;
      if (mask.fonts.size > 0) {
        const fonts = new Map;
        for (const [font, name] of mask.fonts) fonts.set(name, this.fontObject(font));
        resources.set("/Font", PdfDict.fromObjectMap(fonts));
      }
      if (mask.images.size > 0) {
        const images = new Map;
        for (const [image, name] of mask.images) images.set(name, this.imageObject(image));
        resources.set("/XObject", PdfDict.fromObjectMap(images));
      }
      if (mask.graphicStates.size > 0) {
        resources.set("/ExtGState", new PdfDict(Array.from(mask.graphicStates, ([name, state]) => [ name, this.resolveGraphicState(state) ])));
      }
      if (mask.patterns.size > 0) resources.set("/Pattern", new PdfDict(mask.patterns));
      if (mask.shadings.size > 0) resources.set("/Shading", new PdfDict(mask.shadings));
      if (!resources.isEmpty) object.params.set("/Resources", resources);
      this.softMaskObjects.set(mask, object);
    }
    return new PdfDict([ [ "/S", new PdfName("/Luminosity") ], [ "/G", object.ref() ] ]);
  }
  resolveGraphicState(state) {
    const softMask = state.get("/SMask");
    if (!(softMask instanceof PdfSoftMaskReference)) return state;
    const resolved = new PdfDict(state.values);
    resolved.set("/SMask", this.softMaskObject(softMask.mask));
    return resolved;
  }
  formObject(form) {
    let object = this.formObjects.get(form);
    if (object === undefined) {
      object = this.formAppearanceObject(form.appearance);
      this.formObjects.set(form, object);
    }
    return object;
  }
  formAppearanceObject(appearance) {
    const object = new PdfXObject(this, "/Form", encodeLatin1(appearance.content));
    object.params.set("/FormType", new PdfNum(1));
    object.params.set("/BBox", PdfArray.fromNum([ 0, 0, appearance.width, appearance.height ]));
    const resources = new PdfDict;
    if (appearance.fonts.size > 0) {
      const fonts = new Map;
      for (const [font, name] of appearance.fonts) fonts.set(name, this.fontObject(font));
      resources.set("/Font", PdfDict.fromObjectMap(fonts));
    }
    if (appearance.images.size > 0) {
      const images = new Map;
      for (const [image, name] of appearance.images) images.set(name, this.imageObject(image));
      resources.set("/XObject", PdfDict.fromObjectMap(images));
    }
    if (appearance.graphicStates.size > 0) {
      resources.set("/ExtGState", new PdfDict(Array.from(appearance.graphicStates, ([name, state]) => [ name, this.resolveGraphicState(state) ])));
    }
    if (appearance.patterns.size > 0) {
      resources.set("/Pattern", new PdfDict(appearance.patterns));
    }
    if (appearance.shadings.size > 0) {
      resources.set("/Shading", new PdfDict(appearance.shadings));
    }
    if (appearance.forms !== undefined && appearance.forms.size > 0) {
      const xobjects = resources.get("/XObject");
      const entries = xobjects ?? new PdfDict;
      for (const [form, name] of appearance.forms) entries.set(name, this.formObject(form).ref());
      resources.set("/XObject", entries);
    }
    if (!resources.isEmpty) object.params.set("/Resources", resources);
    return object;
  }
  resolveFormAppearances(appearances) {
    if (appearances === undefined) return null;
    const normalStates = appearances.normalStates === undefined ? undefined : new Map([ ...appearances.normalStates ].map(([name, appearance]) => [ name, this.formAppearanceObject(appearance) ]));
    return {
      normal: appearances.normal === undefined ? undefined : this.formAppearanceObject(appearances.normal),
      normalStates,
      down: appearances.down === undefined ? undefined : this.formAppearanceObject(appearances.down),
      rollover: appearances.rollover === undefined ? undefined : this.formAppearanceObject(appearances.rollover)
    };
  }
  addPage(format, content, fonts = new Map, graphicStates = new Map, patterns = new Map, shadings = new Map, images = new Map, annotations = [], forms = new Map) {
    const resources = [];
    for (const [font, name] of fonts) {
      resources.push([ name, this.fontObject(font) ]);
    }
    const stream = new PdfObjectStream(this, typeof content === "string" ? encodeLatin1(content) : content);
    const page = new PdfPage(this, this.pageList, format);
    for (const [name, object] of resources) {
      page.addFont(name, object);
    }
    for (const [name, state] of graphicStates) {
      page.addGraphicState(name, this.resolveGraphicState(state));
    }
    for (const [name, pattern] of patterns) {
      page.addPattern(name, pattern);
    }
    for (const [name, shading] of shadings) {
      page.addShading(name, shading);
    }
    for (const [image, name] of images) {
      page.addXObject(name, this.imageObject(image));
    }
    for (const [form, name] of forms) page.addXObject(name, this.formObject(form));
    for (const annotation of annotations) {
      let appearanceName = null;
      if (annotation.kind === "form") {
        const font = annotation.font;
        if (font !== undefined) {
          appearanceName = this.formFontNames.get(font) ?? null;
          if (appearanceName === null) {
            appearanceName = `/FForm${this.formFontNames.size + 1}`;
            this.formFontNames.set(font, appearanceName);
            this.catalog.formFonts.set(appearanceName, this.fontObject(font));
          }
        }
      }
      const appearances = annotation.kind === "form" ? this.resolveFormAppearances(annotation.appearances) : null;
      const object = new PdfAnnotation(this, page, annotation, appearanceName, appearances);
      if (annotation.kind === "form") this.addFormField(object, annotation.name);
    }
    page.contents.push(stream);
    return page;
  }
  addFormField(widget, name) {
    const kids = this.formFieldKids.get(name);
    if (kids === undefined) {
      this.formFieldKids.set(name, [ widget ]);
      this.catalog.formFields.push(widget);
      return;
    }
    const first = kids[0];
    let parent = first.parent;
    if (parent === null) {
      parent = new PdfObject(this, new PdfDict([ [ "/T", new PdfString(name) ] ]));
      first.parent = parent;
      this.catalog.formFields[this.catalog.formFields.indexOf(first)] = parent;
    }
    widget.parent = parent;
    kids.push(widget);
    parent.params.set("/Kids", PdfArray.fromObjects(kids));
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
        if (names !== null && !names.has(entry.anchor)) names.addDestination(entry.anchor, page, {
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
  addPageLabels(labels) {
    if (labels.length === 0) return;
    const pageLabels = new PdfPageLabels(this);
    for (const {pageIndex, label} of labels) pageLabels.labels.set(pageIndex, label);
    this.catalog.pageLabels = pageLabels;
  }
  save() {
    const stream = new PdfStream;
    this.write(stream);
    return stream.output();
  }
  write(stream) {
    for (const object of this.objects) {
      object.prepare();
    }
    this.xref.params.set("/Root", this.catalog.ref());
    this.xref.params.set("/Info", this.info.ref());
    this.xref.output(stream);
  }
}

function writePdf(output, pages, metadata, outlines = [], pageMode = "none", destinations = [], pageLabels = [], settings = DEFAULT_PDF_SETTINGS) {
  const document = new PdfDocument(metadata, settings);
  for (const page of pages) {
    document.addPage(page.format, page.content, page.fonts, page.graphicStates, page.patterns, page.shadings, page.images, page.annotations, page.forms);
  }
  document.addNavigation(outlines, pageMode, destinations);
  document.addPageLabels(pageLabels);
  document.write(output);
}

class PageTheme {
  constructor({pageFormat = PageFormat.A4, buildBackground = null, buildForeground = null, theme = null, orientation = "natural", margin = null, clip = false} = {}) {
    this.pageFormat = {
      ...pageFormat,
      width: Number(pageFormat.width),
      height: Number(pageFormat.height)
    };
    if (!(this.pageFormat.width > 0) || !(this.pageFormat.height > 0)) {
      throw new RangeError("Page dimensions must be positive");
    }
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
    let format = this.pageTheme.resolvedFormat;
    const margin = this.pageTheme.margin;
    const settings = documentContext.document.settings;
    let canvas = new PdfCanvas(Number.isFinite(format.height) ? format.height : 0, settings);
    let context = {
      ...documentContext,
      canvas,
      pageFormat: format,
      pageNumber: documentContext.pageOffset + 1,
      pageLabel: documentContext.document.pageLabel(documentContext.pageOffset),
      pagesCount: documentContext.pagesCount || documentContext.pageOffset + 1,
      theme: this.pageTheme.theme ?? documentContext.document.theme
    };
    const maxWidth = format.width - margin.left - margin.right;
    const maxHeight = format.height - margin.top - margin.bottom;
    const widget = this.build(context);
    const box = widget.layout(context, new BoxConstraints({
      maxWidth,
      maxHeight
    }));
    if (box.height > maxHeight + .001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }
    if (!Number.isFinite(format.width) || !Number.isFinite(format.height)) {
      format = {
        ...format,
        width: format.width === Infinity ? box.width + margin.left + margin.right : format.width,
        height: format.height === Infinity ? box.height + margin.top + margin.bottom : format.height
      };
      if (!Number.isFinite(format.width) || !Number.isFinite(format.height) || format.width <= 0 || format.height <= 0) {
        throw new RangeError("Page content must resolve to positive finite dimensions");
      }
      canvas = new PdfCanvas(format.height, settings);
      context = {
        ...context,
        canvas,
        pageFormat: format
      };
    }
    if (this.background) canvas.fillRect(0, 0, format.width, format.height, this.background);
    this.paintLayer(this.pageTheme.buildBackground, context, format);
    paintPageChild(this.pageTheme, context, widget, {
      ...box,
      x: margin.left,
      y: margin.top
    });
    this.paintLayer(this.pageTheme.buildForeground, context, format);
    return [ {
      format,
      content: canvas.takeOutputBytes(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      shadings: canvas.shadings,
      images: canvas.images,
      annotations: canvas.annotations,
      forms: canvas.forms
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
    paintPageChild(this.pageTheme, context, widget, {
      ...box,
      x: 0,
      y: 0
    });
  }
}

function paintPageChild(theme, context, widget, box) {
  if (!theme.clip) {
    widget.paint(context, box);
    return;
  }
  const {canvas, pageFormat} = context;
  const margin = theme.margin;
  canvas.saveContext();
  try {
    canvas.drawRect(margin.left, margin.bottom, pageFormat.width - margin.left - margin.right, pageFormat.height - margin.top - margin.bottom);
    canvas.clipPath();
    widget.paint(context, box);
  } finally {
    canvas.restoreContext();
  }
}

class NewPage extends Widget {
  constructor({freeSpace = null} = {}) {
    super();
    if (freeSpace === null) {
      this.freeSpace = null;
      return;
    }
    const resolved = Number(freeSpace);
    if (!Number.isFinite(resolved) || resolved < 0) {
      throw new RangeError("NewPage.freeSpace must be a finite non-negative number");
    }
    this.freeSpace = resolved;
  }
  newPageNeeded(availableSpace) {
    return this.freeSpace === null || availableSpace < this.freeSpace;
  }
  layout(_context, _constraints) {
    return {
      widget: this,
      width: 0,
      height: 0,
      data: null
    };
  }
  paint(_context, _box) {}
}

class MultiPage {
  constructor({pageTheme = undefined, format = undefined, pageFormat = undefined, margin = undefined, orientation = undefined, gap = 0, theme = undefined, build, header = null, footer = null, background = null, maxPages = 50}) {
    this.renderedPages = [];
    if (typeof build !== "function") throw new TypeError("MultiPage.build must be a function");
    const base = pageTheme ?? new PageTheme({
      pageFormat: PageFormat.A4
    });
    this.pageTheme = base.copyWith({
      pageFormat: pageFormat ?? format,
      margin,
      orientation,
      theme
    });
    this.theme = this.pageTheme.theme;
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
    if (!Number.isFinite(this.format.width) || !Number.isFinite(this.format.height)) {
      throw new RangeError("MultiPage requires finite page dimensions");
    }
    const pages = [];
    const startPage = () => {
      if (pages.length >= this.maxPages) {
        throw new RangeError(`MultiPage exceeded its ${this.maxPages} page limit`);
      }
      const canvas = new PdfCanvas(this.format.height, documentContext.document.settings);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);
      const pageNumber = documentContext.pageOffset + pages.length + 1;
      const context = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber,
        pageLabel: documentContext.document.pageLabel(pageNumber - 1),
        pagesCount: documentContext.pagesCount || pageNumber,
        theme: this.theme ?? documentContext.document.theme
      };
      this.paintLayer(this.pageTheme.buildBackground, context);
      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;
      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, new BoxConstraints({
          maxWidth
        }));
        top += headerBox.height + this.gap;
      }
      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, new BoxConstraints({
          maxWidth
        }));
        bottom -= footerBox.height + this.gap;
      }
      const state = {
        canvas,
        context,
        maxWidth,
        top,
        bottom,
        cursor: top
      };
      pages.push(state);
      return state;
    };
    let page = startPage();
    const children = this.build(page.context);
    if (!Array.isArray(children)) throw new TypeError("MultiPage.build must return an array of widgets");
    for (const child of children) {
      if (child instanceof NewPage) {
        if (child.newPageNeeded(page.bottom - page.cursor)) page = startPage();
        continue;
      }
      if (child instanceof SpanningWidget && child.canSpan) {
        let state = child.initialSpanState();
        const natural = child.layout(page.context, new BoxConstraints({
          maxWidth: page.maxWidth,
          maxHeight: Infinity
        }));
        const initialAvailable = page.bottom - page.cursor;
        if (natural.height <= initialAvailable + .001) {
          paintPageChild(this.pageTheme, page.context, child, {
            ...natural,
            x: this.margin.left,
            y: page.cursor
          });
          page.cursor += natural.height + this.gap;
          continue;
        }
        const fullAvailable = page.bottom - page.top;
        if (child instanceof Flex && natural.height <= fullAvailable + .001 && page.cursor > page.top + .001) {
          page = startPage();
          const moved = child.layout(page.context, new BoxConstraints({
            maxWidth: page.maxWidth,
            maxHeight: Infinity
          }));
          paintPageChild(this.pageTheme, page.context, child, {
            ...moved,
            x: this.margin.left,
            y: page.cursor
          });
          page.cursor += moved.height + this.gap;
          continue;
        }
        let continued = false;
        while (true) {
          const available = page.bottom - page.cursor;
          let fragment = child.layoutSpan(page.context, new BoxConstraints({
            maxWidth: page.maxWidth,
            maxHeight: available
          }), state);
          if (continued && !fragment.hasMore) {
            const natural = child.layoutSpan(page.context, new BoxConstraints({
              maxWidth: page.maxWidth,
              maxHeight: Infinity
            }), state);
            if (!natural.hasMore && natural.box.height <= available + .001) fragment = natural;
          }
          continued = true;
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
            paintPageChild(this.pageTheme, page.context, child, {
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
      paintPageChild(this.pageTheme, page.context, child, {
        ...box,
        x: this.margin.left,
        y: page.cursor
      });
      page.cursor += box.height + this.gap;
    }
    this.renderedPages = pages;
    return this.summaries(pages);
  }
  postProcess(documentContext) {
    const pages = this.renderedPages;
    try {
      for (const state of pages) {
        const context = {
          ...state.context,
          ...documentContext,
          pagesCount: documentContext.pagesCount
        };
        if (this.header) {
          const headerWidget = this.header(context);
          const headerBox = headerWidget.layout(context, new BoxConstraints({
            maxWidth: state.maxWidth
          }));
          paintPageChild(this.pageTheme, context, headerWidget, {
            ...headerBox,
            x: this.margin.left,
            y: this.margin.top
          });
        }
        if (this.footer) {
          const footerWidget = this.footer(context);
          const footerBox = footerWidget.layout(context, new BoxConstraints({
            maxWidth: state.maxWidth
          }));
          paintPageChild(this.pageTheme, context, footerWidget, {
            ...footerBox,
            x: this.margin.left,
            y: this.format.height - this.margin.bottom - footerBox.height
          });
        }
        this.paintLayer(this.pageTheme.buildForeground, context);
      }
      return this.serialize(pages);
    } finally {
      this.renderedPages = [];
    }
  }
  serialize(pages) {
    return pages.map(({canvas}) => ({
      format: this.format,
      content: canvas.takeOutputBytes(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      shadings: canvas.shadings,
      images: canvas.images,
      annotations: canvas.annotations,
      forms: canvas.forms
    }));
  }
  summaries(pages) {
    return pages.map(({canvas}) => ({
      format: this.format,
      content: new Uint8Array(0),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      shadings: canvas.shadings,
      images: canvas.images,
      annotations: canvas.annotations,
      forms: canvas.forms
    }));
  }
  paintLayer(build, context) {
    if (build === null) return;
    const widget = build(context);
    const box = widget.layout(context, new BoxConstraints({
      maxWidth: this.format.width,
      maxHeight: this.format.height
    }));
    paintPageChild(this.pageTheme, context, widget, {
      ...box,
      x: 0,
      y: 0
    });
  }
}

class IconData {
  constructor(codePoint, {matchTextDirection = false} = {}) {
    const value = Number(codePoint);
    if (!Number.isInteger(value) || value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
      throw new RangeError("IconData.codePoint must be a valid Unicode scalar value");
    }
    this.codePoint = value;
    this.matchTextDirection = Boolean(matchTextDirection);
  }
}

class IconThemeData {
  constructor({color = null, opacity = null, size = null, font = null} = {}) {
    this.color = color === null ? null : normalizePaintColor(color);
    this.opacity = opacity === null ? null : assertFiniteNumber(Number(opacity), "icon opacity");
    this.size = size === null ? null : assertFiniteNumber(Number(size), "icon size");
    this.font = font;
    if (this.opacity !== null && (this.opacity < 0 || this.opacity > 1)) {
      throw new RangeError("icon opacity must be between 0 and 1");
    }
    if (this.size !== null && this.size < 0) {
      throw new RangeError("icon size cannot be negative");
    }
  }
  static fallback(font = null) {
    return new IconThemeData({
      color: "#000000",
      opacity: 1,
      size: 24,
      font
    });
  }
  copyWith(options = {}) {
    return new IconThemeData({
      color: options.color ?? this.color,
      opacity: options.opacity ?? this.opacity,
      size: options.size ?? this.size,
      font: options.font ?? this.font
    });
  }
}

class Icon extends StatelessWidget {
  constructor(icon, {size = null, color = null, textDirection = null, font = null} = {}) {
    super();
    if (!(icon instanceof IconData)) throw new TypeError("Icon expects an IconData value");
    this.icon = icon;
    this.size = size === null ? null : assertFiniteNumber(Number(size), "icon size");
    this.color = color === null ? null : normalizePaintColor(color);
    this.textDirection = textDirection;
    this.font = font;
    if (this.size !== null && this.size < 0) throw new RangeError("icon size cannot be negative");
    if (textDirection !== null && textDirection !== "ltr" && textDirection !== "rtl") {
      throw new TypeError(`Unknown text direction: ${String(textDirection)}`);
    }
  }
  build(context) {
    const theme = context.theme.iconTheme;
    const size = this.size ?? theme.size ?? 24;
    const color = this.color ?? theme.color ?? [ 0, 0, 0 ];
    const opacity = theme.opacity ?? 1;
    const font = this.font ?? theme.font;
    if (font === null) {
      throw new Error("Icon requires Icon.font or ThemeData.withFont({ icons })");
    }
    const direction = this.textDirection ?? "ltr";
    let widget = new RichText({
      textDirection: direction,
      text: new TextSpan({
        text: String.fromCodePoint(this.icon.codePoint),
        style: new TextStyle({
          inherit: false,
          color,
          fontNormal: font,
          fontSize: size,
          fontWeight: "normal",
          fontStyle: "normal",
          letterSpacing: 0,
          wordSpacing: 0,
          lineSpacing: 0,
          height: 1,
          decoration: "none"
        })
      })
    });
    if (this.icon.matchTextDirection && direction === "rtl") {
      widget = new Transform({
        transform: [ -1, 0, 0, 1, 0, 0 ],
        alignment: "center",
        child: widget
      });
    }
    if (opacity < 1) widget = new Opacity({
      opacity,
      child: widget
    });
    return widget;
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
    this.iconTheme = fields.iconTheme;
  }
  static withFont({base = null, bold = null, italic = null, boldItalic = null, icons = null, fontFallback = null} = {}) {
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
      maxLines: null,
      iconTheme: IconThemeData.fallback(icons)
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
      maxLines: options.maxLines ?? this.maxLines,
      iconTheme: options.iconTheme ?? this.iconTheme
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
  static merge({style, child, textAlign, softWrap, overflow, maxLines}) {
    return new Builder({
      builder: context => new DefaultTextStyle({
        child,
        style: context.theme.defaultTextStyle.merge(style),
        textAlign: textAlign ?? context.theme.textAlign,
        softWrap: softWrap ?? context.theme.softWrap,
        overflow: overflow ?? context.theme.overflow,
        maxLines: maxLines ?? context.theme.maxLines
      })
    });
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

const MAX_OUTLINE_REPLAYS = 4;

class Document {
  constructor({title = null, author = null, subject = null, creator = null, producer = null, keywords = null, xmpMetadata = null, pageLabels = [], theme = undefined, font = undefined, pageMode = "none", compress = true, simpleTrueTypeFonts = false, colorAlpha = true} = {}) {
    this.sections = [];
    this.outlineEntries = [];
    this.destinationEntries = [];
    this.pageLabelEntries = new Map;
    this.outlineReplay = false;
    this.outlineCursor = 0;
    this.outlineRerenderRequested = false;
    this.fonts = new Map;
    this.fallbackFont = Font.helvetica();
    this.metadata = {
      title,
      author,
      subject,
      creator,
      producer,
      keywords,
      xmpMetadata
    };
    this.settings = {
      compress,
      simpleTrueTypeFonts,
      colorAlpha
    };
    for (const {pageIndex, label} of pageLabels) this.setPageLabel(pageIndex, label);
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
    const font = declaration.build(this.settings.simpleTrueTypeFonts);
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
  setPageLabel(pageIndex, label) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new RangeError("Page label index must be a non-negative integer");
    }
    if (!(label instanceof PdfPageLabel)) {
      throw new TypeError("Document.setPageLabel expects a PdfPageLabel");
    }
    this.pageLabelEntries.set(pageIndex, label);
    return this;
  }
  pageLabel(pageIndex) {
    const keys = [ ...this.pageLabelEntries.keys() ].sort((a, b) => a - b);
    let current = PdfPageLabel.arabic();
    let start = 0;
    for (const key of keys) {
      if (pageIndex < key) break;
      current = this.pageLabelEntries.get(key) ?? current;
      start = key;
    }
    return current.asString(pageIndex - start);
  }
  get outlines() {
    return this.outlineEntries;
  }
  requestOutlineRerender() {
    this.outlineRerenderRequested = true;
  }
  registerOutline({title, level, pageNumber, y, anchor = null, color = null, style = "normal"}) {
    const page = pageNumber;
    const index = this.outlineReplay ? this.outlineCursor++ : this.outlineEntries.length;
    const existing = this.outlineEntries[index];
    if (this.outlineReplay && existing !== undefined) {
      existing.page = page;
      existing.y = y;
      return;
    }
    this.outlineEntries.push({
      title,
      level,
      anchor: anchor ?? `__dest${index}`,
      page,
      y,
      color,
      style
    });
  }
  registerDestination({name, pageNumber, x = null, y = null, zoom = null}) {
    this.destinationEntries.push({
      name,
      page: pageNumber,
      x,
      y,
      zoom
    });
  }
  outlinePages() {
    return this.outlineEntries.map(entry => entry.page).join();
  }
  renderSections(replay, expectedPagesCount = 0) {
    this.outlineReplay = replay;
    this.outlineCursor = 0;
    this.destinationEntries.length = 0;
    const pages = [];
    const rendered = [];
    for (const section of this.sections) {
      const pageOffset = pages.length;
      const sectionPages = section.render({
        document: this,
        pageOffset,
        pagesCount: expectedPagesCount
      });
      rendered.push({
        section,
        pageOffset,
        pages: sectionPages
      });
      pages.push(...sectionPages);
    }
    const pagesCount = pages.length;
    const processed = [];
    for (const entry of rendered) {
      processed.push(...entry.section.postProcess?.({
        document: this,
        pageOffset: entry.pageOffset,
        pagesCount
      }) ?? entry.pages);
    }
    return processed;
  }
  save() {
    const output = new PdfStream;
    this.write(output);
    return output.output();
  }
  write(output) {
    this.outlineEntries.length = 0;
    this.outlineRerenderRequested = false;
    let pages = this.renderSections(false);
    for (let replay = 0; this.outlineRerenderRequested && replay < MAX_OUTLINE_REPLAYS; replay++) {
      const before = this.outlinePages();
      pages = this.renderSections(true, pages.length);
      this.outlineEntries.length = this.outlineCursor;
      if (this.outlinePages() === before) break;
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
    const pageLabels = [ ...this.pageLabelEntries ].sort(([a], [b]) => a - b).map(([pageIndex, label]) => ({
      pageIndex,
      label
    }));
    writePdf(output, pages, this.metadata, outlines, this.pageMode, destinations, pageLabels, this.settings);
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
  fragment(context, incoming, state, spanning) {
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
    const runCapacity = Number.isFinite(maxMain) ? Math.max(spanning ? 0 : 1, Math.floor((maxMain + this.mainAxisSpacing + 1e-6) / (childMainAxis + this.mainAxisSpacing))) : neededRuns;
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
    return this.fragment(context, constraints, this.initialSpanState(), false).box;
  }
  layoutSpan(context, constraints, state) {
    return this.fragment(context, constraints, state, true);
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

const GRID_COLOR = "#c3e8f3";

class GridPaper extends Widget {
  constructor({color = GRID_COLOR, horizontalColor = color, verticalColor = color, interval = 100, horizontalInterval = interval, verticalInterval = interval, divisions = 5, horizontalDivisions = divisions, verticalDivisions = divisions, subdivisions = 2, horizontalSubdivisions = subdivisions, verticalSubdivisions = subdivisions, margin = 0, horizontalOffset = 0, verticalOffset = 0, border = new Border, scale = 1, opacity = .5, child = null} = {}) {
    super();
    for (const value of [ horizontalDivisions, verticalDivisions, horizontalSubdivisions, verticalSubdivisions ]) {
      if (!Number.isInteger(value) || value <= 0) throw new RangeError("GridPaper divisions must be positive integers");
    }
    const resolvedHorizontalOffset = Number(horizontalOffset);
    const resolvedVerticalOffset = Number(verticalOffset);
    if (!Number.isInteger(resolvedHorizontalOffset) || !Number.isInteger(resolvedVerticalOffset)) {
      throw new RangeError("GridPaper offsets must be finite integers");
    }
    const resolvedScale = Number(scale);
    if (!Number.isFinite(resolvedScale) || resolvedScale < 0) {
      throw new RangeError("GridPaper scale must be a finite non-negative number");
    }
    const resolvedOpacity = Number(opacity);
    if (!Number.isFinite(resolvedOpacity) || resolvedOpacity < 0 || resolvedOpacity > 1) {
      throw new RangeError("GridPaper opacity must be between zero and one");
    }
    this.horizontalColor = horizontalColor;
    this.verticalColor = verticalColor;
    this.horizontalInterval = Number(horizontalInterval);
    this.verticalInterval = Number(verticalInterval);
    this.horizontalDivisions = horizontalDivisions;
    this.verticalDivisions = verticalDivisions;
    this.horizontalSubdivisions = horizontalSubdivisions;
    this.verticalSubdivisions = verticalSubdivisions;
    this.margin = normalizeInsets(margin);
    this.horizontalOffset = resolvedHorizontalOffset;
    this.verticalOffset = resolvedVerticalOffset;
    this.border = border;
    this.scale = resolvedScale;
    this.opacity = resolvedOpacity;
    this.child = child;
  }
  static millimeter({color = GRID_COLOR, child = null} = {}) {
    return new GridPaper({
      color,
      interval: 5 * PageUnit.cm,
      divisions: 5,
      subdivisions: 10,
      child
    });
  }
  static seyes({margin = {
    top: 20 * PageUnit.mm,
    bottom: 10 * PageUnit.mm,
    left: 36 * PageUnit.mm
  }, child = null} = {}) {
    return new GridPaper({
      color: "#c8c8de",
      horizontalInterval: 8 * PageUnit.mm,
      verticalInterval: 8 * PageUnit.mm,
      horizontalDivisions: 1,
      verticalDivisions: 4,
      subdivisions: 1,
      margin,
      verticalOffset: 1,
      border: new Border({
        left: new BorderSide({
          color: "#f6bbcf"
        })
      }),
      opacity: 1,
      child
    });
  }
  static collegeRuled({margin = {
    top: PageUnit.inch,
    bottom: .6 * PageUnit.inch,
    left: 1.25 * PageUnit.inch
  }, child = null} = {}) {
    return new GridPaper({
      horizontalInterval: Infinity,
      verticalInterval: 9 / 32 * PageUnit.inch,
      divisions: 1,
      subdivisions: 1,
      margin,
      verticalOffset: 1,
      border: new Border({
        left: new BorderSide({
          color: "#ff0000"
        })
      }),
      opacity: 1,
      child
    });
  }
  static quad({color = GRID_COLOR, child = null} = {}) {
    return new GridPaper({
      color,
      interval: PageUnit.inch,
      divisions: 4,
      subdivisions: 1,
      child
    });
  }
  static engineering({color = GRID_COLOR, child = null} = {}) {
    return new GridPaper({
      color,
      interval: PageUnit.inch,
      divisions: 5,
      subdivisions: 2,
      child
    });
  }
  layout(context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const size = {
      width: parent.hasBoundedWidth ? parent.maxWidth : parent.minWidth,
      height: parent.hasBoundedHeight ? parent.maxHeight : parent.minHeight
    };
    const childBox = this.child?.layout(context, new BoxConstraints({
      maxWidth: Math.max(0, size.width - this.margin.left - this.margin.right),
      maxHeight: Math.max(0, size.height - this.margin.top - this.margin.bottom)
    })) ?? null;
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
    const childBox = box.data.childBox;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x + this.margin.left,
      y: box.y + this.margin.top
    });
    const canvas = context.canvas;
    canvas.saveContext();
    canvas.setGraphicState(new PdfGraphicState({
      opacity: this.opacity
    }));
    const widths = [ this.scale, this.scale / 2, this.scale / 4 ];
    const draw = (interval, divisions, subdivisions, offset, color, vertical) => {
      if (!Number.isFinite(interval)) return;
      const step = interval / (divisions * subdivisions);
      if (!(step > 0)) return;
      canvas.setStrokeColor(color);
      let n = offset;
      const start = vertical ? box.x + this.margin.left : box.y + this.margin.top;
      const end = vertical ? box.x + box.width - this.margin.right : box.y + box.height - this.margin.bottom;
      for (let position = start; position <= end + .001; position += step) {
        canvas.setLineWidth(n % (subdivisions * divisions) === 0 ? widths[0] : n % subdivisions === 0 ? widths[1] : widths[2]);
        if (vertical) canvas.drawLine(position, canvas.toPdfY(box.y), position, canvas.toPdfY(box.y + box.height)); else canvas.drawLine(box.x, canvas.toPdfY(position), box.x + box.width, canvas.toPdfY(position));
        canvas.strokePath();
        n++;
      }
    };
    draw(this.horizontalInterval, this.horizontalDivisions, this.horizontalSubdivisions, this.horizontalOffset, this.horizontalColor, true);
    draw(this.verticalInterval, this.verticalDivisions, this.verticalSubdivisions, this.verticalOffset, this.verticalColor, false);
    this.border.paint(context, box.x, box.y, box.width, box.height);
    canvas.restoreContext();
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

const DEFAULT_CIRCULAR_COLOR = "#3f51b5";

const DEFAULT_LINEAR_COLOR = "#2196f3";

function finiteNumber(value, name) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return resolved;
}

function nonNegativeNumber(value, name) {
  const resolved = finiteNumber(value, name);
  if (resolved < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
  return resolved;
}

function optionalSize(value, name) {
  return value === null ? null : nonNegativeNumber(value, name);
}

function boundedSize(maximum, fallback, widget, option) {
  if (Number.isFinite(maximum)) return maximum;
  if (fallback === null) {
    throw new RangeError(`${widget} is unbounded; give it ${option} or a parent that constrains it`);
  }
  return fallback;
}

function shadeColor(color, strength) {
  const [red, green, blue] = normalizeColor(new PdfColor(...normalizeColor(color)).shade(strength));
  return new PdfColor(red, green, blue, color instanceof PdfColor ? color.alpha : 1);
}

class CircularProgressIndicator extends Widget {
  constructor({value, color = null, strokeWidth = 4, backgroundColor = null, fallbackWidth = null, fallbackHeight = null}) {
    super();
    this.value = finiteNumber(value, "CircularProgressIndicator.value");
    this.color = color;
    this.strokeWidth = nonNegativeNumber(strokeWidth, "CircularProgressIndicator.strokeWidth");
    this.backgroundColor = backgroundColor;
    this.fallbackWidth = optionalSize(fallbackWidth, "CircularProgressIndicator.fallbackWidth");
    this.fallbackHeight = optionalSize(fallbackHeight, "CircularProgressIndicator.fallbackHeight");
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const name = "CircularProgressIndicator";
    const size = parent.constrain({
      width: boundedSize(parent.maxWidth, this.fallbackWidth, name, "fallbackWidth"),
      height: boundedSize(parent.maxHeight, this.fallbackHeight, name, "fallbackHeight")
    });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    const adjustedValue = Math.min(.99999, Math.max(1e-5, this.value));
    const left = box.x;
    const bottom = context.canvas.pageHeight - box.y - box.height;
    const rx = box.width / 2;
    const ry = box.height / 2;
    const angleStart = Math.PI / 2;
    const angleEnd = angleStart - Math.PI * 2 * adjustedValue;
    const startTop = {
      x: left + rx + Math.cos(angleStart) * rx,
      y: bottom + ry + Math.sin(angleStart) * ry
    };
    const endTop = {
      x: left + rx + Math.cos(angleEnd) * rx,
      y: bottom + ry + Math.sin(angleEnd) * ry
    };
    const startBottom = {
      x: left + rx + Math.cos(angleStart) * (rx - this.strokeWidth),
      y: bottom + ry + Math.sin(angleStart) * (ry - this.strokeWidth)
    };
    const endBottom = {
      x: left + rx + Math.cos(angleEnd) * (rx - this.strokeWidth),
      y: bottom + ry + Math.sin(angleEnd) * (ry - this.strokeWidth)
    };
    const {canvas} = context;
    if (this.backgroundColor !== null && this.value < 1) {
      canvas.moveTo(startTop.x, startTop.y);
      canvas.bezierArc(startTop.x, startTop.y, rx, ry, endTop.x, endTop.y, {
        large: adjustedValue < .5,
        sweep: true
      });
      canvas.lineTo(endBottom.x, endBottom.y);
      canvas.bezierArc(endBottom.x, endBottom.y, rx - this.strokeWidth, ry - this.strokeWidth, startBottom.x, startBottom.y, {
        large: adjustedValue < .5
      });
      canvas.lineTo(startTop.x, startTop.y);
      canvas.setFillColor(this.backgroundColor);
      canvas.fillPath();
    }
    if (this.value > 0) {
      canvas.moveTo(startTop.x, startTop.y);
      canvas.bezierArc(startTop.x, startTop.y, rx, ry, endTop.x, endTop.y, {
        large: adjustedValue > .5
      });
      canvas.lineTo(endBottom.x, endBottom.y);
      canvas.bezierArc(endBottom.x, endBottom.y, rx - this.strokeWidth, ry - this.strokeWidth, startBottom.x, startBottom.y, {
        large: adjustedValue > .5,
        sweep: true
      });
      canvas.lineTo(startTop.x, startTop.y);
      canvas.setFillColor(this.color ?? DEFAULT_CIRCULAR_COLOR);
      canvas.fillPath();
    }
  }
}

class LinearProgressIndicator extends Widget {
  constructor({value, backgroundColor = null, valueColor = null, minHeight = null, fallbackWidth = null}) {
    super();
    this.value = finiteNumber(value, "LinearProgressIndicator.value");
    this.backgroundColor = backgroundColor;
    this.valueColor = valueColor;
    this.minHeight = optionalSize(minHeight, "LinearProgressIndicator.minHeight");
    this.fallbackWidth = optionalSize(fallbackWidth, "LinearProgressIndicator.fallbackWidth");
  }
  layout(_context, constraints) {
    const size = new BoxConstraints({
      minWidth: boundedSize(constraints.maxWidth, this.fallbackWidth, "LinearProgressIndicator", "fallbackWidth"),
      minHeight: this.minHeight ?? 4
    }).enforce(constraints).smallest;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    const value = Math.min(1, Math.max(0, this.value));
    const valueColor = this.valueColor ?? DEFAULT_LINEAR_COLOR;
    const backgroundColor = this.backgroundColor ?? shadeColor(valueColor, .1);
    const bottom = context.canvas.pageHeight - box.y - box.height;
    if (value < 1) {
      const epsilon = value === 0 ? 0 : .01;
      context.canvas.drawRect(box.x + box.width * value - epsilon, bottom, box.width * (1 - value) + epsilon, box.height);
      context.canvas.setFillColor(backgroundColor);
      context.canvas.fillPath();
    }
    if (value > 0) {
      context.canvas.drawRect(box.x, bottom, box.width * value, box.height);
      context.canvas.setFillColor(valueColor);
      context.canvas.fillPath();
    }
  }
}

const fieldFlagBits = {
  readOnly: 0,
  mandatory: 1,
  noExport: 2,
  multiline: 12,
  password: 13,
  noToggleToOff: 14,
  radio: 15,
  pushButton: 16,
  combo: 17,
  edit: 18,
  sort: 19,
  fileSelect: 20,
  multiSelect: 21,
  doNotSpellCheck: 22,
  doNotScroll: 23,
  comb: 24,
  radiosInUnison: 25,
  commitOnSelChange: 26
};

function fieldFlagsValue(flags) {
  let value = 0;
  for (const flag of flags) {
    const bit = fieldFlagBits[flag];
    if (bit === undefined) throw new TypeError(`Unknown form field flag: ${String(flag)}`);
    value |= 1 << bit;
  }
  return value;
}

function requireName(name) {
  const result = String(name);
  if (result.length === 0) throw new RangeError("Form field name cannot be empty");
  return result;
}

function resolvedStyle(context, style) {
  return context.theme.defaultTextStyle.merge(style);
}

function appearanceFor(context, width, height, child) {
  const canvas = new PdfCanvas(height, {
    colorAlpha: context.canvas.colorAlpha
  });
  const scoped = {
    ...context,
    canvas,
    pageFormat: {
      width,
      height
    }
  };
  const childBox = child.layout(scoped, BoxConstraints.tight({
    width,
    height
  }));
  childBox.widget.paint(scoped, {
    ...childBox,
    x: 0,
    y: 0
  });
  return {
    width,
    height,
    content: canvas.output(),
    fonts: canvas.fonts,
    graphicStates: canvas.graphicStates,
    patterns: canvas.patterns,
    shadings: canvas.shadings,
    images: canvas.images,
    forms: canvas.forms
  };
}

class ChoiceField extends Widget {
  constructor({name, items, value = null, width = 120, height = 13, textStyle = null}) {
    super();
    this.name = requireName(name);
    this.items = items.map(String);
    this.value = value;
    this.width = Number(width);
    this.height = Number(height);
    this.textStyle = textStyle;
    if (value !== null && !this.items.includes(value)) {
      throw new RangeError("ChoiceField value must be one of its items");
    }
  }
  child() {
    return new Container({
      width: this.width,
      height: this.height,
      padding: {
        left: 4,
        right: 16,
        top: 2,
        bottom: 2
      },
      borderColor: "#777777",
      background: "#ffffff",
      child: null
    });
  }
  layout(context, constraints) {
    const childBox = this.child().layout(context, BoxConstraints.from(constraints));
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
    box.data.childBox.widget.paint(context, {
      ...box.data.childBox,
      x: box.x,
      y: box.y
    });
    const style = resolvedStyle(context, this.textStyle);
    context.canvas.addFormField({
      kind: "form",
      fieldType: "choice",
      name: this.name,
      items: this.items,
      value: this.value,
      fieldFlags: fieldFlagsValue([ "combo" ]),
      font: style.font === null ? context.document.font : context.document.resolveFont(style.font),
      fontSize: style.fontSize ?? 12,
      textColor: style.color ?? [ 0, 0, 0 ],
      appearances: this.value === null ? undefined : {
        normal: appearanceFor(context, box.width, box.height, new Container({
          padding: {
            left: 4,
            right: 16,
            top: 2,
            bottom: 2
          },
          child: new Text(this.value, {
            style: this.textStyle ?? undefined
          })
        }))
      }
    }, box.x, box.y, box.width, box.height);
  }
}

class Checkbox extends Widget {
  constructor({name, value, tristate = false, width = 13, height = 13, activeColor = "#2196f3", checkColor = "#ffffff", borderColor = "#757575"}) {
    super();
    this.name = requireName(name);
    this.value = Boolean(value);
    this.tristate = Boolean(tristate);
    this.width = Number(width);
    this.height = Number(height);
    this.activeColor = normalizePaintColor(activeColor);
    this.checkColor = normalizePaintColor(checkColor);
    this.borderColor = normalizePaintColor(borderColor);
  }
  layout(_context, constraints) {
    const size = BoxConstraints.from(constraints).constrain({
      width: this.width,
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
    this.paintState(context, box, this.value);
    const on = new CheckboxAppearance(this.activeColor, this.checkColor, this.borderColor, true);
    const off = new CheckboxAppearance(this.activeColor, this.checkColor, this.borderColor, false);
    context.canvas.addFormField({
      kind: "form",
      fieldType: "checkbox",
      name: this.name,
      value: this.value ? "/Yes" : null,
      defaultValue: this.value ? "/Yes" : null,
      appearances: {
        normalStates: new Map([ [ "/Yes", appearanceFor(context, box.width, box.height, on) ], [ "/Off", appearanceFor(context, box.width, box.height, off) ] ])
      }
    }, box.x, box.y, box.width, box.height);
  }
  paintState(context, box, selected) {
    paintCheckbox(context, box.x, box.y, box.width, box.height, selected, this.activeColor, this.checkColor, this.borderColor);
  }
}

function paintCheckbox(context, x, y, width, height, selected, activeColor, checkColor, borderColor) {
  context.canvas.fillRect(x, y, width, height, selected ? activeColor : "#ffffff");
  if (selected) {
    context.canvas.line(x + 2, y + height * .55, x + width * .42, y + height - 3, checkColor, 2);
    context.canvas.line(x + width * .42, y + height - 3, x + width - 2, y + 3, checkColor, 2);
  }
  context.canvas.strokeRect(x, y, width, height, borderColor, 1);
}

class CheckboxAppearance extends Widget {
  constructor(activeColor, checkColor, borderColor, selected) {
    super();
    this.activeColor = activeColor;
    this.checkColor = checkColor;
    this.borderColor = borderColor;
    this.selected = selected;
  }
  layout(_context, constraints) {
    const size = BoxConstraints.from(constraints).biggest;
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: null
    };
  }
  paint(context, box) {
    paintCheckbox(context, box.x, box.y, box.width, box.height, this.selected, this.activeColor, this.checkColor, this.borderColor);
  }
}

class FlatButton extends Widget {
  constructor({name, child, textColor = "#ffffff", color = "#2196f3", colorDown = "#f44336", colorRollover = "#448aff", padding = {
    left: 20,
    right: 20,
    top: 5,
    bottom: 5
  }, fieldFlags = [ "pushButton" ]}) {
    super();
    this.name = requireName(name);
    this.childWidget = child;
    this.textColor = normalizePaintColor(textColor);
    this.color = normalizePaintColor(color);
    this.colorDown = normalizePaintColor(colorDown);
    this.colorRollover = normalizePaintColor(colorRollover);
    this.padding = padding;
    this.fieldFlags = fieldFlags;
  }
  child(color = this.color) {
    return new Container({
      background: color,
      padding: this.padding,
      child: new DefaultTextStyle({
        style: new TextStyle({
          color: this.textColor
        }),
        child: this.childWidget
      })
    });
  }
  layout(context, constraints) {
    const childBox = this.child().layout(context, constraints);
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
    box.data.childBox.widget.paint(context, {
      ...box.data.childBox,
      x: box.x,
      y: box.y
    });
    context.canvas.addFormField({
      kind: "form",
      fieldType: "button",
      name: this.name,
      fieldFlags: fieldFlagsValue(this.fieldFlags),
      highlighting: "push",
      appearances: {
        normal: appearanceFor(context, box.width, box.height, this.child()),
        down: appearanceFor(context, box.width, box.height, this.child(this.colorDown)),
        rollover: appearanceFor(context, box.width, box.height, this.child(this.colorRollover))
      }
    }, box.x, box.y, box.width, box.height);
  }
}

class TextField extends Widget {
  constructor(options) {
    super();
    this.options = options;
    this.name = requireName(options.name);
    if (options.maxLength !== null && options.maxLength !== undefined && (!Number.isInteger(options.maxLength) || options.maxLength < 0)) {
      throw new RangeError("TextField maxLength must be a non-negative integer");
    }
  }
  child() {
    if (this.options.child !== null && this.options.child !== undefined) return this.options.child;
    return new Container({
      width: this.options.width ?? 120,
      height: this.options.height ?? 13,
      padding: {
        left: 4,
        right: 4,
        top: 2,
        bottom: 2
      },
      borderColor: this.options.color ?? "#777777",
      background: this.options.backgroundColor ?? "#ffffff",
      child: null
    });
  }
  layout(context, constraints) {
    const childBox = this.child().layout(context, constraints);
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
    box.data.childBox.widget.paint(context, {
      ...box.data.childBox,
      x: box.x,
      y: box.y
    });
    const style = resolvedStyle(context, this.options.textStyle ?? null);
    context.canvas.addFormField({
      kind: "form",
      fieldType: "text",
      border: this.options.border,
      name: this.name,
      value: this.options.value ?? null,
      defaultValue: this.options.defaultValue ?? null,
      maxLength: this.options.maxLength ?? null,
      alternateName: this.options.alternateName ?? null,
      mappingName: this.options.mappingName ?? null,
      fieldFlags: fieldFlagsValue(this.options.fieldFlags ?? []),
      textAlign: this.options.textAlign ?? null,
      borderColor: this.options.color == null ? null : normalizePaintColor(this.options.color),
      backgroundColor: this.options.backgroundColor == null ? null : normalizePaintColor(this.options.backgroundColor),
      highlighting: this.options.highlighting ?? null,
      font: style.font === null ? context.document.font : context.document.resolveFont(style.font),
      fontSize: style.fontSize ?? 12,
      textColor: style.color ?? [ 0, 0, 0 ],
      appearances: this.options.value === null || this.options.value === undefined ? undefined : {
        normal: appearanceFor(context, box.width, box.height, new Container({
          padding: {
            left: 4,
            right: 4,
            top: 2,
            bottom: 2
          },
          child: new Text(this.options.value, {
            style: this.options.textStyle ?? undefined
          })
        }))
      }
    }, box.x, box.y, box.width, box.height);
  }
}

const ALIGN = Object.freeze({
  Min: 0,
  Mid: .5,
  Max: 1
});

function viewBoxTransform(viewport, viewBox, preserveAspectRatio) {
  if (viewBox === null) {
    return [ 1, 0, 0, 1, viewport.x, viewport.y ];
  }
  const words = (preserveAspectRatio ?? "").trim().split(/\s+/).filter(word => word !== "defer");
  let sx = viewport.width / viewBox.width;
  let sy = viewport.height / viewBox.height;
  let ax = .5;
  let ay = .5;
  if (words[0] !== "none") {
    const align = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(words[0] ?? "");
    ax = ALIGN[align?.[1] ?? "Mid"];
    ay = ALIGN[align?.[2] ?? "Mid"];
    sx = sy = align !== null && words[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy);
  }
  return [ sx, 0, 0, sy, viewport.x + (viewport.width - viewBox.width * sx) * ax - viewBox.x * sx, viewport.y + (viewport.height - viewBox.height * sy) * ay - viewBox.y * sy ];
}

class SvgGroup extends SvgOperation {
  constructor(children, brush, clip, transform, painter, viewport = null) {
    super(brush, clip, transform, painter);
    this.children = children;
    this.viewport = viewport;
  }
  static fromXml(element, painter, parent, size = null) {
    let brush = SvgBrush.fromXml(element, parent, painter.parser);
    let viewport = null;
    if (size !== null) {
      const outer = brush.viewport ?? PdfRect.zero;
      const length = (name, axis, fallback) => getNumeric(element, name, brush)?.lengthIn(axis) ?? fallback;
      const box = {
        x: length("x", "x", 0),
        y: length("y", "y", 0),
        width: size.width ?? length("width", "x", outer.width),
        height: size.height ?? length("height", "y", outer.height)
      };
      if (box.width <= 0 || box.height <= 0) {
        return new SvgGroup([], brush, SvgClipPath.empty, SvgTransform.none, painter);
      }
      const viewBox = parseViewBox(element.getAttribute("viewBox"));
      viewport = {
        box,
        matrix: viewBoxTransform(box, viewBox, element.getAttribute("preserveAspectRatio"))
      };
      brush = brush.copyWith({
        viewport: viewBox ?? box
      });
    }
    const children = [];
    for (const child of element.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }
    return new SvgGroup(children, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter, viewport);
  }
  paintShape(canvas) {
    if (this.viewport !== null) {
      canvas.drawBox(this.viewport.box);
      canvas.clipPath();
      canvas.setTransform(this.viewport.matrix);
    }
    for (const child of this.children) {
      child.paint(canvas);
    }
  }
  drawShape(canvas) {
    if (this.viewport !== null) {
      canvas.setTransform(this.viewport.matrix);
    }
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
    const [sx, , , sy, tx, ty] = this.viewport?.matrix ?? [ 1, 0, 0, 1, 0, 0 ];
    return PdfRect.fromLTRB(left * sx + tx, bottom * sy + ty, right * sx + tx, top * sy + ty);
  }
}

function base64Value(code) {
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 43) return 62;
  if (code === 47) return 63;
  return -1;
}

function decodeBase64(value) {
  let useful = 0;
  let padding = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 61) padding++; else if (base64Value(code) >= 0) useful++; else if (code !== 32 && code !== 9 && code !== 10 && code !== 13) {
      throw new SyntaxError("Invalid base64 character in SVG image");
    }
  }
  if ((useful + padding) % 4 !== 0 || padding > 2) {
    throw new SyntaxError("Invalid base64 length in SVG image");
  }
  const result = new Uint8Array(Math.floor(useful * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let output = 0;
  for (let index = 0; index < value.length; index++) {
    const digit = base64Value(value.charCodeAt(index));
    if (digit < 0) continue;
    accumulator = accumulator << 6 | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (output < result.length) result[output++] = accumulator >>> bits & 255;
    }
  }
  return result;
}

class SvgImageOperation extends SvgOperation {
  constructor(x, y, width, height, image, brush, clip, transform, painter) {
    super(brush, clip, transform, painter);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
  }
  static fromXml(element, painter, parent) {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const length = (name, axis) => getNumeric(element, name, brush)?.lengthIn(axis) ?? 0;
    const href = element.getAttribute("href") ?? element.getAttribute("href", "http://www.w3.org/1999/xlink");
    if (href === null || !href.startsWith("data:") || !href.includes(";base64,")) {
      return null;
    }
    let image;
    try {
      const bytes = decodeBase64(href.slice(href.indexOf(";base64,") + 8));
      image = bytes[0] === 255 && bytes[1] === 216 ? PdfImage.fromJpeg(bytes) : PdfImage.fromPng(bytes);
    } catch {
      return null;
    }
    const width = length("width", "x");
    const height = length("height", "y");
    const x = length("x", "x");
    const y = length("y", "y");
    return new SvgImageOperation(x, y, width, height, image, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
  paintShape(canvas) {
    if (this.width <= 0 || this.height <= 0) return;
    canvas.saveContext();
    canvas.setTransform([ 1, 0, 0, -1, this.x, this.y + this.height ]);
    canvas.drawImage(this.image, 0, 0, this.width, this.height);
    canvas.restoreContext();
  }
  drawShape(_canvas) {}
  boundingBox() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height
    };
  }
}

class SvgMask {
  constructor(content, painter) {
    this.content = content;
    this.painter = painter;
  }
  static fromXml(element, painter) {
    const id = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/.exec(element.getAttribute("mask") ?? "")?.[2];
    const mask = id === undefined ? null : painter.parser.findById(id);
    if (mask?.name.local !== "mask") {
      return null;
    }
    return new SvgMask(SvgGroup.fromXml(mask, painter, painter.brushOf(mask.parent)), painter);
  }
  apply(canvas) {
    const maskCanvas = new PdfCanvas(canvas.pageHeight);
    this.content.paint(maskCanvas);
    canvas.setSoftMask({
      content: maskCanvas.takeOutputBytes(),
      boundingBox: this.painter.userSpaceBox(canvas),
      fonts: maskCanvas.fonts,
      graphicStates: maskCanvas.graphicStates,
      patterns: maskCanvas.patterns,
      shadings: maskCanvas.shadings,
      images: maskCanvas.images
    });
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

const TEXT_CONTENT = new Set([ "tspan", "textPath", "a" ]);

class SvgText extends SvgOperation {
  constructor(runs, brush, clip, transform, painter) {
    super(brush, clip, transform, painter);
    this.runs = runs;
  }
  static fromXml(element, painter, parent) {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const layout = {
      x: 0,
      y: 0,
      space: false,
      chunks: []
    };
    SvgText.walk(element, painter, brush, layout, true);
    const runs = [];
    for (const {anchor, runs: chunk} of layout.chunks) {
      const width = chunk.reduce((sum, run) => sum + run.metrics.advanceWidth, 0);
      const shift = anchor === "middle" ? -width / 2 : anchor === "end" ? -width : 0;
      for (const run of chunk) runs.push(shift === 0 ? run : {
        ...run,
        x: run.x + shift
      });
    }
    return new SvgText(runs, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
  }
  static walk(element, painter, brush, layout, root) {
    const length = (name, axis) => getNumeric(element, name, brush)?.lengthIn(axis) ?? null;
    const x = length("x", "x");
    const y = length("y", "y");
    if (root || x !== null || y !== null) {
      layout.chunks.push({
        anchor: brush.textAnchor ?? "start",
        runs: []
      });
      layout.space = false;
    }
    layout.x = (x ?? layout.x) + (length("dx", "x") ?? 0);
    layout.y = (y ?? layout.y) + (length("dy", "y") ?? 0);
    const font = painter.resolveFont(brush.fontFamily, brush.fontStyle, brush.fontWeight);
    const fontSize = brush.fontSize.sizeValue;
    const chunk = () => layout.chunks[layout.chunks.length - 1];
    for (const node of element.children) {
      if (!(node instanceof XmlText)) {
        if (TEXT_CONTENT.has(node.name.local)) {
          SvgText.walk(node, painter, SvgBrush.fromXml(node, brush, painter.parser), layout, false);
        }
        continue;
      }
      let text = node.value.replace(brush.preserveSpace === true ? /[\r\n\t]/g : /\s+/g, " ");
      if (brush.preserveSpace !== true) {
        const lead = text.startsWith(" ");
        const trail = text.endsWith(" ");
        text = text.trim();
        if (text.length > 0 && (layout.space || lead) && chunk().runs.length > 0) text = ` ${text}`;
        layout.space = text.length > 0 ? trail : layout.space || lead || trail;
      }
      if (text.length === 0) continue;
      const metrics = font.stringMetrics(text, fontSize);
      chunk().runs.push({
        text,
        x: layout.x,
        y: layout.y,
        font,
        fontSize,
        metrics,
        brush
      });
      layout.x += metrics.advanceWidth;
    }
  }
  paintShape(canvas) {
    for (const run of this.runs) {
      const {brush} = run;
      const fill = brush.fill;
      const stroke = brush.stroke;
      const fillOpacity = brush.fillOpacity * fill.opacity;
      const strokeOpacity = brush.strokeOpacity * stroke.opacity;
      const strokeWidth = brush.strokeWidth?.lengthIn() ?? 1;
      if (fill.isNotEmpty && fillOpacity > 0) {
        canvas.saveContext();
        fill.setFillColor(this, canvas);
        if (fillOpacity < 1) {
          canvas.setGraphicState(new PdfGraphicState({
            opacity: fillOpacity
          }));
        }
        canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 0);
        canvas.restoreContext();
      }
      if (stroke.isNotEmpty && strokeOpacity > 0 && strokeWidth > 0) {
        canvas.saveContext();
        stroke.setStrokeColor(this, canvas);
        canvas.setLineWidth(strokeWidth);
        if (brush.strokeDashArray !== null) canvas.setLineDashPattern(brush.strokeDashArray);
        if (strokeOpacity < 1) {
          canvas.setGraphicState(new PdfGraphicState({
            opacity: strokeOpacity
          }));
        }
        canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 1);
        canvas.restoreContext();
      }
    }
  }
  drawShape(canvas) {
    for (const run of this.runs) {
      canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 7);
    }
  }
  boundingBox() {
    let left = Infinity;
    let bottom = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    for (const {x, y, metrics} of this.runs) {
      left = Math.min(left, x + metrics.left);
      right = Math.max(right, x + metrics.right);
      bottom = Math.min(bottom, y - metrics.bottom);
      top = Math.max(top, y - metrics.top);
    }
    return left > right ? {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    } : {
      x: left,
      y: bottom,
      width: right - left,
      height: top - bottom
    };
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
    const length = (name, axis) => getNumeric(element, name, brush)?.lengthIn(axis) ?? null;
    const width = length("width", "x");
    const height = length("height", "y");
    const hrefAttribute = element.getAttribute("href") ?? element.getAttribute("href", XLINK);
    const referenced = hrefAttribute?.startsWith("#") === true && hrefAttribute.length > 1 ? painter.parser.findById(hrefAttribute.slice(1)) : null;
    const href = referenced === null ? null : painter.operationFromXml(referenced, brush, {
      width,
      height
    });
    return new SvgUse(length("x", "x") ?? 0, length("y", "y") ?? 0, width ?? 0, height ?? 0, href, brush, SvgClipPath.fromXml(element, painter, brush), SvgTransform.fromXml(element), painter);
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
  constructor(parser, canvas, boundingBox, fontLookup = () => PdfType1Font.helvetica()) {
    this.fonts = new Map;
    this.building = new Set;
    this.parser = parser;
    this.canvas = canvas;
    this.boundingBox = boundingBox;
    this.fontLookup = fontLookup;
    this.rootBrush = SvgBrush.defaultContext.copyWith({
      viewport: parser.viewBox
    });
  }
  resolveFont(family, style, weight) {
    const key = `${family}-${style}-${weight}`;
    let font = this.fonts.get(key);
    if (font === undefined) {
      font = this.fontLookup(family, style, weight);
      this.fonts.set(key, font);
    }
    return font;
  }
  brushOf(element) {
    return element === null ? this.rootBrush : SvgBrush.fromXml(element, this.brushOf(element.parent), this.parser);
  }
  userSpaceBox(canvas) {
    const inverse = invertMatrix(canvas.getTransform());
    if (inverse === null) return this.boundingBox;
    const {x, y, width, height} = this.boundingBox;
    const corners = [ [ x, y ], [ x + width, y ], [ x, y + height ], [ x + width, y + height ] ].map(([px, py]) => transformPoint(inverse, px, py));
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    return PdfRect.fromLTRB(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  isHidden(element) {
    convertStyle(element);
    return element.getAttribute("display")?.trim() === "none" || element.getAttribute("visibility")?.trim() === "hidden";
  }
  operationFromXml(element, brush, size = null) {
    if (this.isHidden(element) || this.building.has(element)) {
      return null;
    }
    this.building.add(element);
    try {
      let operation;
      switch (element.name.local) {
       case "circle":
       case "ellipse":
       case "line":
       case "path":
       case "polygon":
       case "polyline":
       case "rect":
        operation = SvgPath.fromXmlElement(element, this, brush);
        break;

       case "g":
        operation = SvgGroup.fromXml(element, this, brush);
        break;

       case "svg":
        operation = SvgGroup.fromXml(element, this, brush, size ?? {});
        break;

       case "symbol":
        operation = size === null ? null : SvgGroup.fromXml(element, this, brush, size);
        break;

       case "use":
        operation = SvgUse.fromXml(element, this, brush);
        break;

       case "text":
        operation = SvgText.fromXml(element, this, brush);
        break;

       case "image":
        operation = SvgImageOperation.fromXml(element, this, brush);
        break;

       default:
        operation = null;
      }
      if (operation !== null) {
        operation.mask = SvgMask.fromXml(element, this);
      }
      return operation;
    } finally {
      this.building.delete(element);
    }
  }
  rootOperation() {
    const root = this.parser.root;
    if (this.isHidden(root)) {
      return new SvgGroup([], this.rootBrush, SvgClipPath.empty, SvgTransform.none, this);
    }
    this.building.add(root);
    try {
      return SvgGroup.fromXml(root, this, this.rootBrush);
    } finally {
      this.building.delete(root);
    }
  }
  paint() {
    this.rootOperation().paint(this.canvas);
  }
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
  constructor({svg, fit = "contain", alignment = Alignment.center, clip = true, width = null, height = null, colorFilter = null, customFontLookup = null}) {
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
    this.customFontLookup = customFontLookup;
  }
  layout(_context, constraints) {
    const parent = BoxConstraints.from(constraints);
    const offeredWidth = this.width !== null || this.parser.width !== null ? constrain(this.width ?? this.parser.width, parent.maxWidth) : parent.hasBoundedWidth ? parent.maxWidth : constrain(this.parser.viewBox.width, parent.maxWidth);
    const offeredHeight = this.height !== null || this.parser.height !== null ? constrain(this.height ?? this.parser.height, parent.maxHeight) : parent.hasBoundedHeight ? parent.maxHeight : constrain(this.parser.viewBox.height, parent.maxHeight);
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
    }, (family, style, weight) => {
      const custom = this.customFontLookup?.(family, style, weight);
      if (custom !== null && custom !== undefined) return custom.getFont(context);
      const bold = weight !== "normal" && weight !== "lighter";
      const italic = style !== "normal";
      const font = family === "serif" ? italic ? bold ? Font.timesBoldItalic() : Font.timesItalic() : bold ? Font.timesBold() : Font.times() : family === "monospace" ? italic ? bold ? Font.courierBoldOblique() : Font.courierOblique() : bold ? Font.courierBold() : Font.courier() : italic ? bold ? Font.helveticaBoldOblique() : Font.helveticaOblique() : bold ? Font.helveticaBold() : Font.helvetica();
      return font.getFont(context);
    }).paint();
    context.canvas.restoreContext();
  }
}

class Placeholder extends Widget {
  constructor({color = "#455a64", strokeWidth = 2, fallbackWidth = 400, fallbackHeight = 400} = {}) {
    super();
    this.color = normalizePaintColor(color);
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
    this.color = normalizePaintColor(color);
    this.fit = fit;
  }
  build() {
    return new SvgImage({
      svg: `<svg viewBox="0 0 24 27"><path d="${PDF_LOGO_PATH}" fill="#000000"/></svg>`,
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

function side(input) {
  if (input === null || input === undefined) {
    return null;
  }
  const width = Math.max(0, assertFiniteNumber(Number(input.width ?? 1), "border width"));
  if (width === 0) {
    return null;
  }
  return {
    color: normalizePaintColor(input.color ?? "#000000"),
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
  layout(child, context, _constraints) {
    if (this.flex !== null) {
      return {
        width: 0,
        flex: this.flex
      };
    }
    const box = child.layout(context, new BoxConstraints);
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
        this.fitColumns(context, widths, flex, maximum);
        fixedSpace = maximum;
      }
      const remaining = Math.max(0, maximum - fixedSpace);
      for (let index = 0; index < count; index++) {
        if (flex[index] > 0) widths[index] = remaining * flex[index] / totalFlex;
      }
      return widths;
    }
    if (intrinsicTotal > maximum && intrinsicTotal > 0) {
      this.fitColumns(context, widths, flex, maximum);
      return widths;
    }
    if (this.tableWidth === "max") {
      if (intrinsicTotal === 0) {
        return widths.map(() => count === 0 ? 0 : maximum / count);
      }
      const scale = maximum / intrinsicTotal;
      return widths.map(value => value * scale);
    }
    return widths;
  }
  fitColumns(context, widths, flex, maximum) {
    const minContext = {
      ...context,
      minContent: true
    };
    const mins = widths.map(() => 0);
    for (const row of this.children) {
      for (let index = 0; index < row.children.length; index++) {
        if (flex[index] !== 0) continue;
        const width = widths[index];
        const columnWidth = mappedWidth(this.columnWidths, index) ?? this.defaultColumnWidth;
        let minimum = width;
        if (columnWidth instanceof IntrinsicColumnWidth && columnWidth.flex === null) {
          const box = row.children[index].layout(minContext, new BoxConstraints);
          if (Number.isFinite(box.width)) minimum = Math.min(width, Math.max(0, box.width));
        }
        mins[index] = Math.max(mins[index], minimum);
      }
    }
    let totalMin = 0;
    let totalMax = 0;
    for (let index = 0; index < widths.length; index++) {
      if (flex[index] !== 0) continue;
      totalMin += mins[index];
      totalMax += widths[index];
    }
    const share = (maximum - totalMin) / (totalMax - totalMin);
    const scale = maximum / totalMin;
    for (let index = 0; index < widths.length; index++) {
      if (flex[index] !== 0) continue;
      widths[index] = totalMin <= maximum ? mins[index] + (widths[index] - mins[index]) * share : mins[index] * scale;
    }
  }
  layoutRows(context, columnWidths, headers, start, maxHeight) {
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
    const total = headers.length + this.children.length - start;
    for (let position = 0; position < total; position++) {
      const row = position < headers.length ? headers[position] : this.children[start + position - headers.length];
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
      if (rowY + rowHeight > maxHeight + .001) break;
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
    return this.layoutRows(context, columnWidths, [], 0, Infinity);
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
    const parent = BoxConstraints.from(constraints);
    const key = `${parent.minWidth},${parent.maxWidth}`;
    let widths = state.widths;
    if (widths === undefined || widths.key !== key || widths.theme !== context.theme) {
      widths = Object.freeze({
        key,
        theme: context.theme,
        columns: Object.freeze(this.resolveWidths(context, constraints))
      });
    }
    const columnWidths = widths.columns;
    const headers = [];
    for (let index = 0; index < nextRow; index++) {
      if (this.children[index].repeat) headers.push(this.children[index]);
    }
    const box = this.layoutRows(context, columnWidths, headers, nextRow, constraints.maxHeight);
    const followingRow = nextRow + Math.max(0, box.data.rows.length - headers.length);
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
        nextState: Object.freeze({
          nextRow,
          widths
        }),
        hasMore: true
      };
    }
    return {
      box,
      nextState: Object.freeze({
        nextRow: followingRow,
        widths
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
  Icon,
  IconData,
  IconThemeData,
  CircularProgressIndicator,
  LinearProgressIndicator,
  Checkbox,
  ChoiceField,
  FlatButton,
  TextField,
  Anchor,
  Annotation,
  AnnotationBuilder,
  AnnotationCircle,
  AnnotationInk,
  AnnotationLink,
  AnnotationPolygon,
  AnnotationSquare,
  AnnotationUrl,
  CircleAnnotation,
  InkAnnotation,
  Link,
  Outline,
  PolygonAnnotation,
  PolyLineAnnotation,
  SquareAnnotation,
  UrlLink,
  Page,
  MultiPage,
  NewPage,
  Text,
  InlineSpan,
  RichText,
  TextSpan,
  WidgetSpan,
  Header,
  Paragraph,
  Bullet,
  TableOfContent,
  Footer,
  Watermark,
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
  ListView,
  Container,
  DecoratedBox,
  BoxDecoration,
  BoxShadow,
  DecorationGraphic,
  DecorationImage,
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
  GridPaper,
  Stack,
  Positioned,
  PositionedDirectional,
  Wrap,
  Partition,
  Partitions,
  Spacer,
  Vector,
  Circle,
  Rectangle,
  Polygon,
  InkList,
  Shape,
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
  Inherited,
  InheritedWidget,
  Inseparable,
  DelayedWidget,
  Directionality,
  InheritedDirectionality,
  Alignment,
  BoxConstraints,
  EdgeInsets,
  PdfColor,
  PdfColorGrey,
  PdfColorCmyk,
  PdfColorHsv,
  PdfColorHsl,
  PdfColors,
  PdfPageFormat,
  ChartValue,
  LineChartValue: PointChartValue,
  PdfBorder,
  PdfFormXObject,
  AnnotationText,
  TextAnnotation,
  PageFormat,
  PageUnit,
  PdfStream,
  PdfImage,
  PdfType1Font,
  PdfTtfFont,
  PdfPageLabel,
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

export { Align, Alignment, Anchor, Annotation, AnnotationBuilder, AnnotationCircle, AnnotationInk, AnnotationLink, AnnotationPolygon, AnnotationSquare, AnnotationText, AnnotationUrl, AspectRatio, BarDataSet, BarcodeFactory as Barcode, BarcodeCodabarStartStop, BarcodeCode128Fnc, BarcodeQRCorrectionLevel, BarcodeWidget, Border, BorderRadius, BorderRadiusDirectional, BorderRadiusGeometry, BorderSide, BorderStyle, BoxBorder, BoxConstraints, BoxDecoration, BoxShadow, Builder, Bullet, CartesianFrame, CartesianGrid, Center, Chart, ChartFrame, ChartGrid, ChartLegend, ChartValue, Checkbox, ChoiceField, Circle, CircleAnnotation, CircularProgressIndicator, ClipOval, ClipRRect, ClipRect, Column, ConstrainedBox, Container, CustomPaint, Dataset, DecoratedBox, DecorationGraphic, DecorationImage, DefaultTextStyle, DelayedWidget, Directionality, Divider, Document, EdgeInsets, Expanded, FittedBox, FixedAxis, FixedColumnWidth, FlatButton, Flex, FlexColumnWidth, Flexible, FlutterLogo, Font, Footer, FractionColumnWidth, FullPage, Gradient, GridAxis, GridPaper, GridView, Header, Icon, IconData, IconThemeData, Image, ImageProvider, ImageProxy, Inherited, InheritedDirectionality, InheritedWidget, InkAnnotation, InkList, InlineSpan, Inseparable, IntrinsicColumnWidth, LayoutBuilder, LimitedBox, PointChartValue as LineChartValue, LineDataSet, LinearGradient, LinearProgressIndicator, Link, ListView, Lorem, LoremText, MemoryImage, MultiPage, NewPage, Opacity, Outline, OverflowBox, Padding, Page, PageFormat, PageTheme, PageUnit, Paragraph, Partition, Partitions, Pdf417SecurityLevel, PdfBaseFunction, PdfBorder, PdfColor, PdfColorCmyk, PdfColorGrey, PdfColorHsl, PdfColorHsv, PdfColors, PdfFontMetrics, PdfFormXObject, PdfGraphicState, PdfImage, PdfLogo, PdfPageFormat, PdfPageLabel, PdfPoint, PdfRect, PdfShading, PdfStream, PdfTtfFont, PdfType1Font, PieDataSet, PieFrame, PieGrid, Placeholder, PointChartValue, PointDataSet, PolyLineAnnotation, Polygon, PolygonAnnotation, Positioned, PositionedDirectional, RadialFrame, RadialGradient, RadialGrid, Radius, RawImage, Rectangle, RichText, Row, Shape, SizedBox, Spacer, SpanningWidget, SquareAnnotation, Stack, StatelessWidget, SvgImage, Table, TableBorder, TableColumnWidth, TableHelper, TableOfContent, TableRow, Text, TextAnnotation, TextField, TextSpan, TextStyle, Theme, ThemeData, Transform, UrlLink, Vector, VerticalDivider, Watermark, Widget, WidgetSpan, Wrap, composeMatrices, createPdf, decodePng, deflateRaw, deflateZlib, flipMatrix, identityMatrix, inflateZlib, invertMatrix, js_pdf, multiplyMatrix, parseJpeg, pdfDiagnosticHandler, reportPdfDiagnostic, rotationMatrix, scaleMatrix, setPdfDiagnosticHandler, skewMatrix, transformPoint, translationMatrix };

/*
 * js_pdf test support — a compact sRGB-like ICC v2 display profile.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Port-authored, so tests and examples can exercise PDF/A without downloading a
 * profile. It is a matrix/TRC display profile built from the IEC 61966-2-1 sRGB
 * primaries and transfer curve, with the colorants Bradford-adapted to the D50
 * profile connection space. It is NOT a substitute for a standard profile:
 * production PDF/A should embed one the caller supplies, such as the ICC's
 * sRGB2014 (https://www.color.org/srgbprofiles.xalter). It is not part of dist.
 *
 * `examples/assets/generate-srgb-icc.mjs` writes this profile to
 * `examples/assets/JsPdfSrgbExample.icc`; a test checks the two agree.
 */

/** The profile connection space illuminant, as the ICC header encodes it. */
export const D50 = [0.9642, 1, 0.8249];

const SRGB_PRIMARIES = [[0.64, 0.33], [0.30, 0.60], [0.15, 0.06]];
const D65 = [0.3127, 0.3290];
const BRADFORD = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];

const xyz = ([x, y]) => [x / y, 1, (1 - x - y) / y];
const apply = (m, v) => m.map(row => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const multiply = (a, b) => a.map(row => [0, 1, 2].map(j => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const transpose = m => [0, 1, 2].map(j => m.map(row => row[j]));

function invert(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]
  ];
}

/** The red, green and blue colorants in XYZ, adapted from D65 to D50. */
export function srgbColorants() {
  const primaries = transpose(SRGB_PRIMARIES.map(xyz));
  const scale = apply(invert(primaries), xyz(D65));
  const toXyz = primaries.map(row => row.map((value, index) => value * scale[index]));
  const source = apply(BRADFORD, xyz(D65));
  const target = apply(BRADFORD, D50);
  const gain = [0, 1, 2].map(index => [0, 1, 2].map(j => (index === j ? target[index] / source[index] : 0)));
  const adapted = multiply(multiply(invert(BRADFORD), multiply(gain, BRADFORD)), toXyz);
  return transpose(adapted);
}

/** The IEC 61966-2-1 decoding curve, sampled for a `curv` tag. */
export function srgbCurve(entries = 1024) {
  return Array.from({ length: entries }, (_, index) => {
    const v = index / (entries - 1);
    return Math.round((v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * 65535);
  });
}

const ascii = text => Array.from(text, character => character.charCodeAt(0));
const u32 = value => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const u16 = value => [value >>> 8, value & 0xff];
const s15 = value => u32(Math.round(value * 65536) >>> 0);
const pad4 = bytes => [...bytes, ...new Array((4 - (bytes.length % 4)) % 4).fill(0)];

const description = text => [...ascii('desc'), ...u32(0), ...u32(text.length + 1), ...ascii(text), 0,
  ...u32(0), ...u32(0), ...u16(0), 0, ...new Array(67).fill(0)];
const textTag = text => [...ascii('text'), ...u32(0), ...ascii(text), 0];
const xyzTag = values => [...ascii('XYZ '), ...u32(0), ...values.flatMap(s15)];
const curveTag = curve => [...ascii('curv'), ...u32(0), ...u32(curve.length), ...curve.flatMap(u16)];

/**
 * The profile bytes. Everything is fixed, the creation date included, so the
 * output is the same on every run.
 */
export function srgbIccProfile() {
  const [red, green, blue] = srgbColorants();
  const trc = curveTag(srgbCurve());
  const tags = [
    ['desc', description('js_pdf sRGB-like example profile (tests and examples only)')],
    ['cprt', textTag('Copyright (C) 2026, Romulo Campos. Licensed under the Apache License, Version 2.0.')],
    ['wtpt', xyzTag(D50)],
    ['rXYZ', xyzTag(red)],
    ['gXYZ', xyzTag(green)],
    ['bXYZ', xyzTag(blue)],
    // The three channels share one curve: ICC allows tags to point at the same data.
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc]
  ];

  const table = [...u32(tags.length)];
  const data = [];
  let offset = 128 + 4 + tags.length * 12;
  const placed = new Map();
  for (const [signature, bytes] of tags) {
    let at = placed.get(bytes);
    if (at === undefined) {
      at = offset;
      placed.set(bytes, at);
      const padded = pad4(bytes);
      data.push(...padded);
      offset += padded.length;
    }
    table.push(...ascii(signature), ...u32(at), ...u32(bytes.length));
  }

  const header = [
    ...u32(offset), ...u32(0), 0x02, 0x10, 0, 0,
    ...ascii('mntr'), ...ascii('RGB '), ...ascii('XYZ '),
    ...u16(2026), ...u16(11), ...u16(10), ...u16(0), ...u16(0), ...u16(0),
    ...ascii('acsp'), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0),
    ...D50.flatMap(s15), ...u32(0), ...new Array(16 + 28).fill(0)
  ];
  return Uint8Array.from([...header, ...table, ...data]);
}

/** The same profile with a different header colour space, for negative tests. */
export function withColorSpace(profile, signature) {
  const copy = profile.slice();
  copy.set(ascii(signature), 16);
  return copy;
}

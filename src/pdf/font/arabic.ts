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
 *   - pdf/lib/src/pdf/font/arabic.dart
 */

const ARABIC_FORMS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  0x0640: [0x0640, 0x0640, 0x0640, 0x0640], // ARABIC TATWEEL

  0x0621: [1569], // ARABIC LETTER HAMZA
  0x0622: [1570, 0xFE82], // ARABIC LETTER ALEF WITH MADDA ABOVE
  0x0623: [1571, 0xFE84], // ARABIC LETTER ALEF WITH HAMZA ABOVE
  0x0624: [1572, 0xFE86], // ARABIC LETTER WAW WITH HAMZA ABOVE
  0x0625: [1573, 0xFE88], // ARABIC LETTER ALEF WITH HAMZA BELOW
  0x0626: [
    1574,
    0xFE8A,
    0xFE8B,
    0xFE8C,
  ], // ARABIC LETTER YEH WITH HAMZA ABOVE
  0x0627: [1575, 0xFE8E], // ARABIC LETTER ALEF
  0x0628: [1576, 0xFE90, 0xFE91, 0xFE92], // ARABIC LETTER BEH
  0x0629: [1577, 0xFE94], // ARABIC LETTER TEH MARBUTA
  0x062A: [1578, 0xFE96, 0xFE97, 0xFE98], // ARABIC LETTER TEH
  0x062B: [1579, 0xFE9A, 0xFE9B, 0xFE9C], // ARABIC LETTER THEH
  0x062C: [1580, 0xFE9E, 0xFE9F, 0xFEA0], // ARABIC LETTER JEEM
  0x062D: [1581, 0xFEA2, 0xFEA3, 0xFEA4], // ARABIC LETTER HAH
  0x062E: [1582, 0xFEA6, 0xFEA7, 0xFEA8], // ARABIC LETTER KHAH
  0x062F: [1583, 0xFEAA], // ARABIC LETTER DAL
  0x0630: [1584, 0xFEAC], // ARABIC LETTER THAL
  0x0631: [1585, 0xFEAE], // ARABIC LETTER REH
  0x0632: [1586, 0xFEB0], // ARABIC LETTER ZAIN
  0x0633: [1587, 0xFEB2, 0xFEB3, 0xFEB4], // ARABIC LETTER SEEN
  0x0634: [1588, 0xFEB6, 0xFEB7, 0xFEB8], // ARABIC LETTER SHEEN
  0x0635: [1589, 0xFEBA, 0xFEBB, 0xFEBC], // ARABIC LETTER SAD
  0x0636: [1590, 0xFEBE, 0xFEBF, 0xFEC0], // ARABIC LETTER DAD
  0x0637: [1591, 0xFEC2, 0xFEC3, 0xFEC4], // ARABIC LETTER TAH
  0x0638: [1592, 0xFEC6, 0xFEC7, 0xFEC8], // ARABIC LETTER ZAH
  0x0639: [1593, 0xFECA, 0xFECB, 0xFECC], // ARABIC LETTER AIN
  0x063A: [1594, 0xFECE, 0xFECF, 0xFED0], // ARABIC LETTER GHAIN
  0x0641: [1601, 0xFED2, 0xFED3, 0xFED4], // ARABIC LETTER FEH
  0x0642: [1602, 0xFED6, 0xFED7, 0xFED8], // ARABIC LETTER QAF
  0x0643: [1603, 0xFEDA, 0xFEDB, 0xFEDC], // ARABIC LETTER KAF
  0x0644: [1604, 0xFEDE, 0xFEDF, 0xFEE0], // ARABIC LETTER LAM
  0x0645: [1605, 0xFEE2, 0xFEE3, 0xFEE4], // ARABIC LETTER MEEM
  0x0646: [1606, 0xFEE6, 0xFEE7, 0xFEE8], // ARABIC LETTER NOON
  0x0647: [1607, 0xFEEA, 0xFEEB, 0xFEEC], // ARABIC LETTER HEH
  0x0648: [1608, 0xFEEE], // ARABIC LETTER WAW
  0x0649: [1609, 0xFEF0, 64488, 64489], // ARABIC LETTER ALEF MAKSURA
  0x064A: [1610, 0xFEF2, 0xFEF3, 0xFEF4], // ARABIC LETTER YEH
  0x0671: [0xFB50, 0xFB51], // ARABIC LETTER ALEF WASLA
  0x0677: [0xFBDD], // ARABIC LETTER U WITH HAMZA ABOVE
  0x0679: [0xFB66, 0xFB67, 0xFB68, 0xFB69], // ARABIC LETTER TTEH
  0x067A: [0xFB5E, 0xFB5F, 0xFB60, 0xFB61], // ARABIC LETTER TTEHEH
  0x067B: [0xFB52, 0xFB53, 0xFB54, 0xFB55], // ARABIC LETTER BEEH
  0x067E: [0xFB56, 0xFB57, 0xFB58, 0xFB59], // ARABIC LETTER PEH
  0x067F: [0xFB62, 0xFB63, 0xFB64, 0xFB65], // ARABIC LETTER TEHEH
  0x0680: [0xFB5A, 0xFB5B, 0xFB5C, 0xFB5D], // ARABIC LETTER BEHEH
  0x0683: [0xFB76, 0xFB77, 0xFB78, 0xFB79], // ARABIC LETTER NYEH
  0x0684: [0xFB72, 0xFB73, 0xFB74, 0xFB75], // ARABIC LETTER DYEH
  0x0686: [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D], // ARABIC LETTER TCHEH
  0x0687: [0xFB7E, 0xFB7F, 0xFB80, 0xFB81], // ARABIC LETTER TCHEHEH
  0x0688: [0xFB88, 0xFB89], // ARABIC LETTER DDAL
  0x068C: [0xFB84, 0xFB85], // ARABIC LETTER DAHAL
  0x068D: [0xFB82, 0xFB83], // ARABIC LETTER DDAHAL
  0x068E: [0xFB86, 0xFB87], // ARABIC LETTER DUL
  0x0691: [0xFB8C, 0xFB8D], // ARABIC LETTER RREH
  0x0698: [0xFB8A, 0xFB8B], // ARABIC LETTER JEH
  0x06A4: [0xFB6A, 0xFB6B, 0xFB6C, 0xFB6D], // ARABIC LETTER VEH
  0x06A6: [0xFB6E, 0xFB6F, 0xFB70, 0xFB71], // ARABIC LETTER PEHEH
  0x06A9: [0xFB8E, 0xFB8F, 0xFB90, 0xFB91], // ARABIC LETTER KEHEH
  0x06AD: [0xFBD3, 0xFBD4, 0xFBD5, 0xFBD6], // ARABIC LETTER NG
  0x06AF: [0xFB92, 0xFB93, 0xFB94, 0xFB95], // ARABIC LETTER GAF
  0x06B1: [0xFB9A, 0xFB9B, 0xFB9C, 0xFB9D], // ARABIC LETTER NGOEH
  0x06B3: [0xFB96, 0xFB97, 0xFB98, 0xFB99], // ARABIC LETTER GUEH
  0x06BA: [0xFB9E, 0xFB9F], // ARABIC LETTER NOON GHUNNA
  0x06BB: [0xFBA0, 0xFBA1, 0xFBA2, 0xFBA3], // ARABIC LETTER RNOON
  0x06BE: [
    0xFBAA,
    0xFBAB,
    0xFBAC,
    0xFBAD,
  ], // ARABIC LETTER HEH DOACHASHMEE
  0x06C0: [0xFBA4, 0xFBA5], // ARABIC LETTER HEH WITH YEH ABOVE
  0x06C1: [0xFBA6, 0xFBA7, 0xFBA8, 0xFBA9], // ARABIC LETTER HEH GOAL
  0x06C5: [0xFBE0, 0xFBE1], // ARABIC LETTER KIRGHIZ OE
  0x06C6: [0xFBD9, 0xFBDA], // ARABIC LETTER OE
  0x06C7: [0xFBD7, 0xFBD8], // ARABIC LETTER U
  0x06C8: [0xFBDB, 0xFBDC], // ARABIC LETTER YU
  0x06C9: [0xFBE2, 0xFBE3], // ARABIC LETTER KIRGHIZ YU
  0x06CB: [0xFBDE, 0xFBDF], // ARABIC LETTER VE
  0x06CC: [0xFBFC, 0xFBFD, 0xFBFE, 0xFBFF], // ARABIC LETTER FARSI YEH
  0x06D0: [0xFBE4, 0xFBE5, 0xFBE6, 0xFBE7], //ARABIC LETTER E
  0x06D2: [0xFBAE, 0xFBAF], // ARABIC LETTER YEH BARREE
  0x06D3: [0xFBB0, 0xFBB1], // ARABIC LETTER YEH BARREE WITH HAMZA ABOVE
});

const DIACRITICS = new Set<number>([
  0x064b, 0x064c, 0x064d, 0x064e, 0x064f, 0x0650, 0x0651, 0x0652, 0x0670,
  0xfc5e, 0xfc5f, 0xfc60, 0xfc61, 0xfc62, 0xfc63
]);

export function isArabicDiacritic(codePoint: number): boolean {
  return DIACRITICS.has(codePoint);
}

export function isArabicCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x0870 && codePoint <= 0x089f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  );
}

function previousLetter(codePoints: readonly number[], index: number): number {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    if (!isArabicDiacritic(codePoints[cursor]!)) return codePoints[cursor]!;
  }
  return 0;
}

function nextLetter(codePoints: readonly number[], index: number): number {
  for (let cursor = index + 1; cursor < codePoints.length; cursor++) {
    if (!isArabicDiacritic(codePoints[cursor]!)) return codePoints[cursor]!;
  }
  return 0;
}

function formFor(codePoint: number, before: number, after: number): number {
  const forms = ARABIC_FORMS[codePoint];
  if (forms === undefined) return codePoint;
  const beforeForms = ARABIC_FORMS[before];
  const afterForms = ARABIC_FORMS[after];
  const joinsBefore = forms.length >= 2 && beforeForms !== undefined && beforeForms.length === 4;
  const joinsAfter = forms.length === 4 && afterForms !== undefined && afterForms.length >= 2;
  const form = joinsBefore && joinsAfter ? 3 : joinsBefore ? 1 : joinsAfter ? 2 : 0;
  return forms[form] ?? forms[0]!;
}

const LAM_ALEF: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc]
});

interface ArabicCluster {
  readonly base: number;
  readonly marks: readonly number[];
}

function shapeArabic(input: string, visualOrder: boolean): string {
  const logical = Array.from(input, character => character.codePointAt(0)!);
  const clusters: ArabicCluster[] = [];
  for (let index = 0; index < logical.length; index++) {
    const codePoint = logical[index]!;
    if (isArabicDiacritic(codePoint) && clusters.length > 0) {
      const last = clusters[clusters.length - 1]!;
      clusters[clusters.length - 1] = { base: last.base, marks: [...last.marks, codePoint] };
      continue;
    }
    const next = nextLetter(logical, index);
    if (codePoint === 0x0644 && LAM_ALEF[next] !== undefined) {
      const before = previousLetter(logical, index);
      const joinsBefore = ARABIC_FORMS[before]?.length === 4;
      const ligature = LAM_ALEF[next]![joinsBefore ? 1 : 0];
      const marks: number[] = [];
      let cursor = index + 2;
      while (cursor < logical.length && isArabicDiacritic(logical[cursor]!)) {
        marks.push(logical[cursor++]!);
      }
      index = cursor - 1;
      clusters.push({ base: ligature, marks });
      continue;
    }
    clusters.push({
      base: formFor(codePoint, previousLetter(logical, index), next),
      marks: []
    });
  }

  const visual: number[] = [];
  if (visualOrder) {
    for (let index = clusters.length - 1; index >= 0; index--) {
      const cluster = clusters[index]!;
      visual.push(cluster.base, ...cluster.marks);
    }
  } else {
    for (const cluster of clusters) visual.push(cluster.base, ...cluster.marks);
  }
  return String.fromCodePoint(...visual);
}

/** Shape Arabic presentation forms while preserving logical character order. */
export function shapeArabicLogical(input: string): string {
  return shapeArabic(input, false);
}

/** Shape one logical Arabic run and return its visual presentation forms. */
export function shapeArabicVisual(input: string): string {
  return shapeArabic(input, true);
}

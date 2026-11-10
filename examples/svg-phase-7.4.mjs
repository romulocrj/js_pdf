/*
 * js_pdf SVG viewports, text runs, colour alpha and robustness phase 7.4 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

const background = '<rect width="100%" height="100%" fill="#f8fafc" stroke="#cbd5e1"/>';
const star = 'M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z';
const fits = [['xMinYMid', 'min'], ['xMaxYMid meet', 'max'], ['xMidYMid slice', 'slice'], ['none', 'none']];

const sprite = `<svg viewBox="0 0 160 100"><defs>
  <path id="p" d="${star}" fill="#f59e0b" stroke="#92400e"/>
  <symbol id="s" viewBox="0 0 24 24"><use href="#p"/></symbol>
  ${fits.map(([par], i) => `<symbol id="s${i}" viewBox="0 0 24 24" preserveAspectRatio="${par}"><use href="#p"/></symbol>`).join('')}
</defs>${background}
  <use href="#s" x="8" y="8" width="24" height="24"/>
  <use href="#s" x="38" y="4" width="44" height="44"/>
  <g fill="none" stroke="#94a3b8" stroke-dasharray="2 2">
    ${fits.map((_, i) => `<rect x="${6 + i * 38}" y="58" width="34" height="20"/>`).join('')}
  </g>
  ${fits.map((_, i) => `<use href="#s${i}" x="${6 + i * 38}" y="58" width="34" height="20"/>`).join('')}
  ${fits.map(([, label], i) => `<text x="${23 + i * 38}" y="90" font-size="7" text-anchor="middle">${label}</text>`).join('')}
</svg>`;

const nested = `<svg viewBox="0 0 160 100">${background}
  <rect x="20" y="15" width="120" height="70" fill="none" stroke="#64748b" stroke-dasharray="3 2"/>
  <svg x="20" y="15" width="120" height="70" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="26" fill="#38bdf8"/>
    <circle cx="20" cy="20" r="12" fill="#0369a1"/>
    <rect x="10%" y="10%" width="80%" height="80%" fill="none" stroke="white"/>
  </svg>
</svg>`;

const hidden = `<svg viewBox="0 0 160 100">${background}
  <g style="display:none"><path d="M10 10L150 90M150 10L10 90" stroke="red" stroke-width="8"/></g>
  <rect x="20" y="20" width="120" height="60" fill="red" style="visibility: hidden"/>
  <circle cx="80" cy="50" r="30" style="fill:#16a34a"/>
  <text x="80" y="53" text-anchor="middle" font-size="10" fill="white">visible</text>
</svg>`;

const runs = `<svg viewBox="0 0 160 100">${background}
  <path d="M80 4V70" stroke="#cbd5e1"/>
  <text x="80" y="20" font-size="11">AB<tspan fill="#dc2626">CD</tspan>EF</text>
  <text x="80" y="40" font-size="11" text-anchor="middle">a <tspan font-weight="bold" fill="#2563eb">whole</tspan> chunk</text>
  <text x="80" y="60" font-size="11" text-anchor="end">ends <tspan fill="#16a34a">here</tspan></text>
  <text x="6" y="88" font-size="9">collapsed:   a
      b</text>
  <text x="84" y="88" font-size="9" xml:space="preserve">kept:   a    b</text>
</svg>`;

const alpha = `<svg viewBox="0 0 160 100">${background}
  <circle cx="68" cy="40" r="26" fill="rgba(220, 38, 38, 0.5)"/>
  <circle cx="98" cy="40" r="26" fill="#2563eb80"/>
  <circle cx="83" cy="64" r="26" fill="hsla(140, 70%, 40%, 0.5)"/>
  <rect x="6" y="8" width="30" height="30" fill="transparent" stroke="#0f172a"/>
  <text x="21" y="48" font-size="6" text-anchor="middle">transparent</text>
  <text x="154" y="94" font-size="8" text-anchor="end" fill="#0f172a80">#RRGGBBAA text</text>
</svg>`;

const fallback = `<svg viewBox="0 0 160 100"><defs>
  <linearGradient id="g"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
  <linearGradient id="cc" color="#0ea5e9"><stop stop-color="currentColor"/><stop offset="1" stop-color="white"/></linearGradient>
</defs>${background}
  <rect x="8" y="8" width="68" height="36" rx="6" fill="url('#g')"/>
  <rect x="84" y="8" width="68" height="36" rx="6" fill="url(#missing) #f97316"/>
  <rect x="8" y="56" width="68" height="36" rx="6" fill="url(#g) #f97316"/>
  <rect x="84" y="56" width="68" height="36" rx="6" fill="url(#cc)"/>
</svg>`;

const clipMask = `<svg viewBox="0 0 160 100"><defs>
  <clipPath id="c"><circle cx="46" cy="30" r="28"/></clipPath>
  <linearGradient id="fade"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
  <mask id="m"><rect x="-10" y="-10" width="80" height="80" fill="url(#fade)"/></mask>
</defs>${background}
  <rect width="60" height="60" fill="#0891b2" transform="translate(45 50) rotate(20) translate(-30 -30)" clip-path="url(#c)"/>
  <rect width="56" height="56" fill="#db2777" stroke="#831843" stroke-width="8" transform="translate(94 22)" mask="url(#m)"/>
</svg>`;

const percent = `<svg width="100%" height="100%" viewBox="0 0 160 100">
  <rect width="100%" height="100%" fill="#ecfeff" stroke="#0e7490" stroke-width="2%"/>
  <circle cx="50%" cy="50%" r="30%" fill="#06b6d4"/>
  <text x="50%" y="54%" text-anchor="middle" font-size="10" fill="white">100% x 100%</text>
</svg>`;

const malformed = `<svg viewBox="0 0 160 100">
  <rect width="100%" height="100%" fill="#fef2f2" stroke="#fca5a5"/>
  <g id="loop"><circle cx="20" cy="22" r="12" fill="#ef4444"/><use href="#loop"/></g>
  <path d="M40 22H150" stroke="#0f172a" stroke-width="3" transform="translate(a,b)"/>
  <rect x="40" y="34" width="50" height="20" fill="rgb(a,b,c)" stroke="#0f172a" transform="matrix(1,0)"/>
  <rect x="100" y="34" width="50" height="20" fill="#f97316" mask="url(#nowhere)"/>
  <image href="data:image/svg+xml;base64,PHN2Zy8+" width="20" height="20"/>
  <image href="photo.gif" width="20" height="20"/>
  <path d="M40 64H150" stroke="#000" stroke-width="0"/>
  <text x="80" y="82" text-anchor="middle" font-size="9" style="font-family:'Odd;Name';fill:#991b1b">rendered, not thrown</text>
</svg>`;

export function generateSvgPhase74(api = defaultApi, compress = true) {
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, SizedBox, SvgImage, PdfColors } = api;
  const document = new Document({ compress, title: 'SVG viewports, text runs and colour alpha', author: 'Romulo Campos' });
  const label = (text, size = 8) => new Text(text, { style: new TextStyle({ fontSize: size, color: PdfColors.blueGrey800 }) });
  const card = (title, note, image) => new SizedBox({ width: 166, child: new Column({ mainAxisSize: 'min', gap: 3, children: [
    image, label(title, 10), label(note)
  ] }) });
  const svg = markup => new SvgImage({ svg: markup, width: 160, height: 100 });
  const row = cards => new Row({ gap: 12, crossAxisAlignment: 'start', children: cards });
  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 32,
    build: () => new Column({ mainAxisSize: 'min', gap: 14, children: [
      new Text('SVG / phase 7.4', { style: new TextStyle({ fontSize: 22, color: PdfColors.indigo }) }),
      label('Each card rendered wrong, or aborted the whole document, before this phase.', 10),
      row([
        card('Icon sprite', 'symbol viewBox, use width/height, preserveAspectRatio', svg(sprite)),
        card('Nested <svg>', 'own viewport: x/y/size, viewBox fit and clip', svg(nested)),
        card('Hidden layers', 'style="display:none" and visibility: hidden', svg(hidden))
      ]),
      row([
        card('Text runs', 'tspans in order, chunk anchors, white space', svg(runs)),
        card('Colour alpha', 'rgba(), #RRGGBBAA, hsla(), transparent', svg(alpha)),
        card('Paint fallback', "url('#g'), url(#missing) colour, currentColor stop", svg(fallback))
      ]),
      row([
        card('Clip and mask', 'in the element space, after its transform', svg(clipMask)),
        card('Percent root', 'width="100%" sizes from the box, not 1pt', new SizedBox({ width: 160, height: 100, child: new SvgImage({ svg: percent }) })),
        card('Malformed input', 'cyclic use, bad transform, colour, mask, image', svg(malformed))
      ])
    ] })
  }));
  return document.save();
}

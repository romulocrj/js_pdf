/*
 * js_pdf phase 2.8 SVG-gradient example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This generator is synchronous and uses no host API, so the same module runs
 * under a server-side runtime, a browser import map, and bare ClearScript V8.
 */

import * as pw from '../dist/js_pdf.mjs';

const gradientSvg = `
<svg width="500" height="260" viewBox="0 0 500 260"
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4361ee"/>
      <stop offset="0.5" stop-color="#4cc9f0"/>
      <stop offset="1" stop-color="#f72585"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="45%" r="55%">
      <stop offset="0" stop-color="#fff7ad"/>
      <stop offset="0.55" stop-color="#ff9f1c"/>
      <stop offset="1" stop-color="#e71d36"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="500" height="260" rx="24" fill="url(#sky)"/>
  <circle cx="365" cy="105" r="72" fill="url(#sun)"/>
  <path d="M0 210 C90 160 165 245 250 196 C340 145 410 228 500 176 L500 260 L0 260 Z"
        fill="#172554" fill-opacity=".72"/>
</svg>`;

export function generateSvgGradientsPhase28() {
  return pw.createPdf({ title: 'Phase 2.8 — SVG gradients' }, () => new pw.Page({
    margin: 44,
    build: () => new pw.Column({
      gap: 18,
      children: [
        new pw.Text('Phase 2.8 · SVG shading gradients', {
          fontSize: 22,
          color: '#172554'
        }),
        new pw.Text('Linear and radial paint servers serialized as PDF shading patterns.', {
          fontSize: 11,
          color: '#475569'
        }),
        new pw.SvgImage({ svg: gradientSvg, width: 500, height: 260 }),
        new pw.SvgImage({
          svg: gradientSvg,
          width: 500,
          height: 180,
          fit: 'cover',
          alignment: 'bottomRight'
        })
      ]
    })
  }));
}

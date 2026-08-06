/*
 * js_pdf phase 4.3 image widget and provider example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

// A complete 12x12 RGBA PNG kept inline so this phase proof remains host-free
// under both Node and bare V8.
const PNG = Uint8Array.from([
  137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,12,0,0,0,12,8,6,0,0,0,86,117,92,231,
  0,0,0,79,73,68,65,84,120,156,99,224,23,215,210,32,5,51,128,8,213,228,215,151,18,150,254,202,
  195,135,65,106,224,26,96,2,248,20,131,104,20,13,48,137,175,243,184,255,35,99,100,131,48,52,
  192,20,32,43,6,209,120,53,192,20,34,107,164,174,6,146,156,68,146,167,73,10,86,146,35,142,20,
  12,0,195,243,8,164,24,21,223,205,0,0,0,0,73,69,78,68,174,66,96,130
]);

const FITS = ['fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown'];
const ALIGNMENTS = [
  'topLeft', 'topCenter', 'topRight',
  'centerLeft', 'center', 'centerRight',
  'bottomLeft', 'bottomCenter', 'bottomRight'
];
const ORIENTATIONS = [
  'topLeft', 'topRight', 'bottomRight', 'bottomLeft',
  'leftTop', 'rightTop', 'rightBottom', 'leftBottom'
];

function patternBytes(width = 48, height = 16) {
  const bytes = new Uint8Array(width * height * 4);
  const colors = [
    [239, 68, 68],
    [34, 197, 94],
    [59, 130, 246]
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      let color = colors[Math.min(2, Math.floor(x * 3 / width))];
      if (y < 2) color = [250, 204, 21];
      if (y >= height - 2) color = [217, 70, 239];
      if (Math.abs(x / width - y / height) < 0.04) color = [15, 23, 42];
      bytes[offset] = color[0];
      bytes[offset + 1] = color[1];
      bytes[offset + 2] = color[2];
      bytes[offset + 3] = 255;
    }
  }
  return bytes;
}

function rawProvider(options = {}) {
  return new pw.RawImage({
    bytes: patternBytes(),
    width: 48,
    height: 16,
    ...options
  });
}

function heading(title, subtitle) {
  return new pw.Column({
    gap: 5,
    children: [
      new pw.Text(title, {
        style: new pw.TextStyle({ fontSize: 22, fontWeight: 'bold', color: '#172554' })
      }),
      new pw.Text(subtitle, {
        style: new pw.TextStyle({ fontSize: 10, color: '#475569' })
      })
    ]
  });
}

function imageFrame(child, width = 135, height = 78) {
  return new pw.Container({
    width,
    height,
    padding: 5,
    alignment: 'center',
    decoration: new pw.BoxDecoration({
      color: '#f8fafc',
      border: pw.Border.all({ color: '#94a3b8', width: 1 })
    }),
    child
  });
}

function tile(label, child, width = 145) {
  return new pw.Container({
    width,
    padding: 5,
    decoration: new pw.BoxDecoration({
      color: '#ffffff',
      border: pw.Border.all({ color: '#cbd5e1', width: 1 }),
      borderRadius: pw.BorderRadius.circular(6)
    }),
    child: new pw.Column({
      gap: 5,
      crossAxisAlignment: 'center',
      children: [
        new pw.Text(label, {
          textAlign: 'center',
          style: new pw.TextStyle({ fontSize: 9, fontWeight: 'bold', color: '#1e3a8a' })
        }),
        child
      ]
    })
  });
}

function alignmentProbe(label, provider, alignment) {
  return new pw.Column({
    gap: 3,
    crossAxisAlignment: 'center',
    children: [
      new pw.Text(label, {
        style: new pw.TextStyle({ fontSize: 7, fontWeight: 'bold', color: '#64748b' })
      }),
      imageFrame(new pw.Image(provider, {
        fit: 'cover',
        alignment,
        width: 50,
        height: 50
      }), 60, 60)
    ]
  });
}

function fitProbe(label, provider, fit, width, height, frameWidth, frameHeight) {
  return new pw.Column({
    gap: 3,
    crossAxisAlignment: 'center',
    children: [
      new pw.Text(label, {
        style: new pw.TextStyle({ fontSize: 7, fontWeight: 'bold', color: '#64748b' })
      }),
      imageFrame(new pw.Image(provider, { fit, width, height }), frameWidth, frameHeight)
    ]
  });
}

function galleryPage(title, subtitle, children) {
  return new pw.Page({
    margin: 36,
    build: () => new pw.Column({
      gap: 15,
      children: [
        heading(title, subtitle),
        new pw.Wrap({ spacing: 12, runSpacing: 12, children })
      ]
    })
  });
}

/** Synchronous, host-free phase proof shared by the local and V8 runners. */
export function generateImagePhase43() {
  const provider = rawProvider();
  const verticalProvider = rawProvider({ orientation: 'leftTop' });
  const document = new pw.Document();

  document.addPage(galleryPage(
    'Phase 4.3 - all BoxFit modes',
    'The 48 x 16 source is tested against a smaller square, a wide strip and a larger frame. The result triplet distinguishes every fit mode.',
    FITS.map(fit => tile(
      `BoxFit.${fit}`,
      new pw.Column({
        gap: 5,
        crossAxisAlignment: 'center',
        children: [
          new pw.Row({
            gap: 5,
            children: [
              fitProbe('small 1:1', provider, fit, 30, 30, 40, 40),
              fitProbe('wide', provider, fit, 55, 12, 65, 22)
            ]
          }),
          fitProbe('large', provider, fit, 55, 25, 65, 35)
        ]
      })
    ))
  ));

  document.addPage(galleryPage(
    'Phase 4.3 - all alignments',
    'Each alignment is tested twice: H crops a 3:1 source horizontally and V crops its 1:3 rotation vertically.',
    ALIGNMENTS.map(alignment => tile(
      `Alignment.${alignment}`,
      new pw.Row({
        gap: 5,
        children: [
          alignmentProbe('H', provider, alignment),
          alignmentProbe('V', verticalProvider, alignment)
        ]
      })
    ))
  ));

  const memory = new pw.MemoryImage(PNG);
  const proxy = new pw.ImageProxy(provider.resolve());
  const dpiProvider = rawProvider({ dpi: 12 });
  const defaultDpi = dpiProvider.resolve({ x: 144, y: 72 });
  const overrideDpi = dpiProvider.resolve({ x: 144, y: 72 }, 6);
  document.addPage(galleryPage(
    'Phase 4.3 - providers and DPI',
    'MemoryImage detects encoded bytes, RawImage accepts RGBA, ImageProxy reuses a resource, and DPI chooses decoded raster resolution.',
    [
      tile('MemoryImage (PNG)', imageFrame(new pw.Image(memory, {
        fit: 'contain', width: 125, height: 68
      }))),
      tile('RawImage (RGBA)', imageFrame(new pw.Image(provider, {
        fit: 'contain', width: 125, height: 68
      }))),
      tile('ImageProxy', imageFrame(new pw.Image(proxy, {
        fit: 'contain', width: 125, height: 68
      }))),
      tile(`provider DPI 12: ${defaultDpi.sourceWidth} x ${defaultDpi.sourceHeight}`, imageFrame(
        new pw.Image(dpiProvider, { fit: 'fill', width: 125, height: 68 })
      )),
      tile(`widget DPI 6: ${overrideDpi.sourceWidth} x ${overrideDpi.sourceHeight}`, imageFrame(
        new pw.Image(dpiProvider, { fit: 'fill', width: 125, height: 68, dpi: 6 })
      ))
    ]
  ));

  document.addPage(galleryPage(
    'Phase 4.3 - all image orientations',
    'The eight PdfImageOrientation values are applied by the canvas without changing widget coordinates.',
    ORIENTATIONS.map(orientation => {
      const oriented = rawProvider({ orientation });
      return tile(
        orientation,
        imageFrame(new pw.Image(oriented, { fit: 'contain', width: 90, height: 90 }), 135, 105)
      );
    })
  ));

  return document.save();
}

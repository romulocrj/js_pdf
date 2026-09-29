/*
 * js_pdf image DPI/JPEG phase 6.1 gallery.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import * as pw from '../dist/js_pdf.mjs';

const ORIENTATIONS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft',
  'leftTop', 'rightTop', 'rightBottom', 'leftBottom'];

function text(value, size = 11, color = '#475569') {
  return new pw.Text(value, { style: new pw.TextStyle({ fontSize: size, color }) });
}

function heading(title, description) {
  return new pw.Column({ gap: 10, children: [text(title, 24, '#172554'), text(description)] });
}

function sample(provider, title, dpi = null, background = '#e2e8f0') {
  const image = provider.resolve({ x: 144, y: 72 }, dpi);
  return new pw.Container({ width: 158, child: new pw.Column({ gap: 10, children: [
    text(title, 12, '#172554'),
    new pw.Container({ width: 144, height: 72, color: background,
      child: new pw.Image(provider, { width: 144, height: 72, dpi, fit: 'contain' }) }),
    text(`${image.sourceWidth} x ${image.sourceHeight} pixels`, 10),
    text(image.jpeg === null ? 'Alpha preserved' : `${image.jpeg.length.toLocaleString('en-US')} JPEG bytes`, 10)
  ] }) });
}

/** Same synchronous generator for Node, browser and caller-supplied asset bytes. */
export function generateImageDpiPhase61({ jpeg, png }) {
  const pdf = new pw.Document({ title: 'Image DPI and JPEG - phase 6.1', author: 'Romulo Campos' });
  const photo = new pw.MemoryImage(jpeg);
  pdf.addPage(new pw.Page({ margin: 40, build: () => new pw.Column({ gap: 28, children: [
    heading('JPEG: compare resolutions',
      'The same image at the same printed size. Compare diagonal edges, small details and gradients.'),
    new pw.Row({ children: [sample(photo, 'Original'), sample(photo, '72 DPI', 72), sample(photo, '288 DPI', 288)] }),
    text('72 DPI reduces the source to 144 x 72 pixels and re-encodes it at quality 90. The 288 DPI request keeps the 320 x 160 original; it does not enlarge the source.'),
    text('Reduced JPEGs are lossy. Their size depends on the image; tiny inputs are not guaranteed to become smaller.'),
    text('No DPI keeps the original bytes. The right-hand sample should look identical to the original.', 12, '#172554')
  ] }) }));

  pdf.addPage(new pw.Page({ margin: 40, build: () => new pw.Column({ gap: 24, children: [
    heading('Eight image orientations',
      'Every tile uses 72 DPI. Follow the red corner, yellow top edge and diagonal to compare rotations and reflections.'),
    ...[0, 4].map(start => new pw.Row({ gap: 8, children: ORIENTATIONS.slice(start, start + 4).map(orientation => {
      const provider = new pw.MemoryImage(jpeg, { orientation });
      return new pw.Container({ width: 120, child: new pw.Column({ gap: 10, children: [
        text(orientation, 11, '#172554'),
        new pw.Container({ width: 112, height: 112, color: '#e2e8f0', child:
          new pw.Image(provider, { width: 112, height: 112, dpi: 72, fit: 'contain' }) }),
        text(orientation.startsWith('left') || orientation.startsWith('right') ? 'Portrait' : 'Landscape', 10)
      ] }) });
    }) })),
    text('The image stays proportional. Rotation is applied once, and the reduced resource never has more pixels than the original.')
  ] }) }));

  const transparent = new pw.MemoryImage(png);
  pdf.addPage(new pw.Page({ margin: 40, build: () => new pw.Column({ gap: 28, children: [
    heading('PNG: transparency after reduction',
      'The background must remain visible through the translucent shapes and fully transparent corners.'),
    new pw.Row({ children: [sample(transparent, 'Original / pale'), sample(transparent, '72 DPI / pale', 72), sample(transparent, '72 DPI / dark', 72, '#172554')] }),
    text('PNG remains lossless at the encoding stage and keeps its alpha channel. Downsampling removes pixels, so small details may still change.'),
    text('Review the JPEG comparison, all eight orientations and both transparency backgrounds before approving the image changes.', 12, '#172554')
  ] }) }));
  return pdf.save();
}

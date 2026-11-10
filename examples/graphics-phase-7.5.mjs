/*
 * js_pdf graphics, colours and images phase 7.5 example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

/**
 * The 40 x 80 libjpeg CMYK gradient also used by the image tests. It carries an
 * Adobe APP14 marker whose transform byte is 0, the case that used to be
 * embedded without the inverting /Decode array and print as a negative.
 */
const CMYK_JPEG = '/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/8AAFAgAUAAoBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwDxCw7V4T9m9qr17/XUWHaj7N7UUV1Fh2o+ze1FFdTYdqPs3tRRXUWHaj7N7UUV8vWHatj7N7UUV1Fh2o+ze1FFdRYdqPs3tRRXU2Haj7N7UUV1Fh2o+ze1FFfL1h2rY+ze1FFdRYdqPs3tRRXUWHaj7N7UUV1Nh2o+ze1FFdRYdqPs3tRRXy9Ydq2Ps3tRRXUWHaj7N7UUV1Fh2o+ze1FFdTYdqPs3tRRXUWHaj7N7UUV8vWHatj7N7UUV1Fh2o+ze1FFdRYdqPs3tRRXU2Haj7N7UUV1Fh2o+ze1FFfL1h2rZ+ze1FFdRYdqPs3tRRXUWHaj7N7UUV1Nh2o+ze1FFdRYdqPs3tRRXy9Ydq2Ps3tRRXUWHaj7N7UUV1Fh2o+ze1FFdTYdqPs3tRRXUWHaj7N7UUV8vWHatj7N7UUV1Fh2o+ze1FFdRYdqPs3tRRXU2Haj7N7UUV1Fh2o+ze1FFfL1h2rY+ze1FFdRYdqPs3tRRXUWHaj7N7UUV1Nh2o+ze1FFdRYdqPs3tRRXy9Ydq2Ps3tRRXUWHaj7N7UUV1Fh2o+ze1FFdTYdqPs3tRRXUWHaj7N7UUV//Z';

/** Host-free base64 decoding straight into a typed array. */
function base64Bytes(source) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = source.replace(/=+$/, '');
  const output = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let bits = 0, count = 0, length = 0;
  for (const character of clean) {
    bits = (bits << 6 | alphabet.indexOf(character)) & 0xffffff;
    count += 6;
    if (count >= 8) {
      count -= 8;
      output[length++] = (bits >>> count) & 255;
    }
  }
  return output.subarray(0, length);
}

export function generateGraphicsPhase75(api = defaultApi, compress = true) {
  const { Document, Page, PageFormat, Text, TextStyle, Column, Row, Container, BoxDecoration,
    CustomPaint, Opacity, Chart, PieGrid, PieDataSet, CircularProgressIndicator, Image, MemoryImage,
    PdfColor, PdfColors, SizedBox, LinearProgressIndicator, LinearGradient } = api;
  const document = new Document({ compress, title: 'Graphics, colours and images', author: 'Romulo Campos' });
  const ink = PdfColors.blueGrey900;
  const text = (value, fontSize = 9, color = PdfColors.blueGrey700) =>
    new Text(value, { style: new TextStyle({ fontSize, color }) });
  const heading = value => text(value, 13, ink);
  const tile = (child, caption, width = 78) => new Container({ width, child: new Column({ mainAxisSize: 'min', gap: 4,
    children: [child, text(caption, 8)] }) });

  // A checkerboard behind each translucent swatch makes its alpha visible.
  const checker = (canvas, size) => {
    canvas.setFillColor(PdfColors.white);
    canvas.drawRect(0, 0, size.x, size.y);
    canvas.fillPath();
    canvas.setFillColor(PdfColors.grey500);
    for (let y = 0; y < size.y; y += 8) for (let x = y % 16; x < size.x; x += 16) {
      canvas.drawRect(x, y, Math.min(8, size.x - x), Math.min(8, size.y - y));
    }
    canvas.fillPath();
  };
  const overChecker = child => new CustomPaint({ painter: checker, child });
  const swatch = color => new Container({ width: 72, height: 36, decoration: new BoxDecoration({ color }) });
  const blue = PdfColors.blue800;

  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 36, build: () => new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 14, children: [
    text('Graphics, colours and images / phase 7.5', 22, PdfColors.indigo),

    heading('Colour alpha is painted, without flatten()'),
    new Row({ gap: 6, children: [0, 0.2, 0.4, 0.6, 0.8, 1].map(alpha =>
      tile(overChecker(swatch(PdfColors.red.withAlpha(alpha))), `red alpha ${alpha}`)) }),
    text('Each swatch is PdfColors.red.withAlpha(a) in a BoxDecoration. Alpha 0 paints nothing; before 1.0 every one of these was solid red.'),

    heading('Opacity composes: 0.5 x 0.5 = 0.25'),
    new Row({ gap: 6, children: [
      tile(overChecker(new Opacity({ opacity: 0.5, child: swatch(blue) })), 'Opacity 0.5'),
      tile(overChecker(new Opacity({ opacity: 0.5, child: new Opacity({ opacity: 0.5, child: swatch(blue) }) })), 'Opacity 0.5 in 0.5'),
      tile(overChecker(new Opacity({ opacity: 0.5, child: swatch(blue.withAlpha(0.5)) })), 'alpha 0.5 in Opacity 0.5'),
      tile(overChecker(swatch(blue.withAlpha(0.25))), 'alpha 0.25 reference')
    ] }),
    text('The last three must look the same. A nested Opacity used to replace the outer one and paint at 0.5.'),

    heading('colorAlpha: false'),
    new Row({ gap: 6, children: [0.25, 0.5, 0.75].flatMap(alpha => [
      tile(overChecker(swatch(PdfColors.teal.withAlpha(alpha))), `alpha ${alpha}, default`),
      tile(overChecker(swatch(PdfColors.teal.withAlpha(alpha).withAlpha(1))), `alpha ${alpha}, colorAlpha: false`)
    ]) }),
    text('Right of each pair: what new Document({ colorAlpha: false }) paints for the same colour. Alpha is ignored as before 1.0, which PDF/A-1 requires; Opacity still applies.'),

    heading('isLight / isDark choose a readable label colour'),
    new Row({ gap: 6, children: [PdfColors.yellow, PdfColors.lightBlue200, PdfColors.grey400, PdfColors.teal,
      PdfColors.indigo, PdfColors.black, PdfColors.white].map(color => new Container({ width: 66, height: 40, padding: 5,
      decoration: new BoxDecoration({ color, border: { color: PdfColors.grey400, width: 0.5 } }),
      child: text(color.isLight ? 'isLight\nblack text' : 'isDark\nwhite text', 8, color.isLight ? PdfColors.black : PdfColors.white) })) }),
    text('PdfColors.white.isDark used to be true and black.isLight true, so code following the names drew white on white.')
  ] }) }));

  const pie = (values, innerRadius = 0) => new Container({ width: 120, height: 110, child: new Chart({ grid: new PieGrid(),
    datasets: values.map((value, index) => new PieDataSet({ value, innerRadius, drawBorder: true, borderColor: PdfColors.white,
      color: [PdfColors.indigo400, PdfColors.amber400][index], legend: `${Math.round(value / values.reduce((a, b) => a + b) * 360)}°`,
      legendPosition: 'inside' })) }) });
  const progress = value => new Container({ width: 70, height: 70,
    child: new CircularProgressIndicator({ value, strokeWidth: 10, color: PdfColors.indigo400, backgroundColor: PdfColors.grey300 }) });

  // A 100 pt chord with radius 10: the radii are scaled up to the chord, and
  // the half circle must end on the red dot rather than 20.7 pt short of it.
  const scaledArc = (canvas) => {
    canvas.setStrokeColor(PdfColors.indigo);
    canvas.setLineWidth(3);
    canvas.moveTo(10, 62);
    canvas.bezierArc(10, 62, 10, 10, 110, 62, { sweep: true });
    canvas.strokePath();
    canvas.setFillColor(PdfColors.red);
    canvas.drawEllipse(110, 62, 3, 3);
    canvas.fillPath();
  };

  // An arc between two points of a rotated ellipse must trace that ellipse.
  const rotatedArc = (canvas) => {
    const phi = 0.45, rx = 80, ry = 32, cx = 100, cy = 50;
    const at = t => [cx + Math.cos(phi) * rx * Math.cos(t) - Math.sin(phi) * ry * Math.sin(t),
      cy + Math.sin(phi) * rx * Math.cos(t) + Math.cos(phi) * ry * Math.sin(t)];
    canvas.saveContext();
    canvas.setTransform([Math.cos(phi), Math.sin(phi), -Math.sin(phi), Math.cos(phi), cx, cy]);
    canvas.setStrokeColor(PdfColors.grey400);
    canvas.setLineWidth(1);
    canvas.drawEllipse(0, 0, rx, ry);
    canvas.strokePath();
    canvas.restoreContext();
    const [x1, y1] = at(-0.4), [x2, y2] = at(3.6);
    canvas.setStrokeColor(PdfColors.indigo);
    canvas.setLineWidth(3);
    canvas.moveTo(x1, y1);
    canvas.bezierArc(x1, y1, rx, ry, x2, y2, { phi, sweep: true, large: true });
    canvas.strokePath();
    canvas.setFillColor(PdfColors.red);
    for (const [x, y] of [[x1, y1], [x2, y2]]) canvas.drawEllipse(x, y, 3, 3);
    canvas.fillPath();
  };

  const cmyk = base64Bytes(CMYK_JPEG);
  document.addPage(new Page({ pageFormat: PageFormat.A4, margin: 36, build: () => new Column({ mainAxisSize: 'min', crossAxisAlignment: 'start', gap: 14, children: [
    heading('Arcs of 180 degrees and more close on their own circle'),
    new Row({ gap: 8, children: [
      tile(pie([1, 1]), 'Two 180° slices', 120), tile(pie([3, 1]), '270° and 90°', 120), tile(pie([3, 1], 28), '270° donut', 120)
    ] }),
    new Row({ gap: 12, children: [
      tile(progress(0.5), 'Progress 0.5'), tile(progress(0.75), 'Progress 0.75'),
      tile(new CustomPaint({ size: { x: 120, y: 70 }, painter: scaledArc }), 'bezierArc, radius 10 on a 100 pt chord', 130)
    ] }),
    text('A half circle whose radius ratio rounds just over 1 used to keep the ratio and put the centre a whole radius away (L94).'),

    heading('A rotated elliptical arc (phi) stays on its ellipse'),
    tile(new CustomPaint({ size: { x: 200, y: 100 }, painter: rotatedArc }), 'bezierArc with phi = 0.45 between the red dots', 220),
    text('The blue arc must trace the grey rotated ellipse. Before 1.0 it was solved from the page origin and never rotated back.'),

    heading('Adobe CMYK JPEG with APP14 transform 0'),
    new Row({ gap: 16, children: [
      tile(new Image(new MemoryImage(cmyk), { width: 60, height: 120 }), 'DCT pass-through: DeviceCMYK + /Decode', 120),
      tile(new Image(new MemoryImage(cmyk), { width: 60, height: 120, dpi: 36 }), 'Decoded and re-encoded as RGB', 120)
    ] }),
    text('Both must show the same gradient: dark top left, green bottom left. The viewer converts the DeviceCMYK copy with its own profile, so its tones are softer. Without the inverting /Decode array it printed as a near-black negative.'),

    heading('Translucent progress and gradients (phases 7.7 and 1.0)'),
    new Row({ gap: 16, children: [
      tile(overChecker(new SizedBox({ width: 150, child: new LinearProgressIndicator({ value: 0.6, minHeight: 16,
        valueColor: PdfColors.indigo.withAlpha(0.5) }) })), 'valueColor alpha 0.5, default track', 160),
      tile(overChecker(new Container({ width: 72, height: 36, decoration: new BoxDecoration({
        gradient: new LinearGradient({ colors: [PdfColors.red.withAlpha(0.4)] }) }) })), 'one-colour gradient, alpha 0.4', 90),
      tile(overChecker(new Container({ width: 120, height: 36, decoration: new BoxDecoration({
        gradient: new LinearGradient({ colors: [PdfColors.red.withAlpha(0), PdfColors.blue] }) }) })), 'red alpha 0 to opaque blue', 130)
    ] }),
    text('The checkerboard must show through all three, and fade in from the left of the two-colour ramp. A translucent value colour used to give an opaque track, a one-colour gradient an opaque shading, and multi-colour stops lost their alpha.')
  ] }) }));
  return document.save();
}

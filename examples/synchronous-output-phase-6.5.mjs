/*
 * js_pdf synchronous output phase 6.5 example and executable assertions.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as pw from '../dist/js_pdf.mjs';

/** Forward-only host adapter. Consume or copy bytes before this call returns. */
export class CallbackPdfStream extends pw.PdfStream {
  constructor(consume) { super(); this.consume = consume; this.written = 0; this.writeCount = 0; }
  get offset() { return this.written; }
  putByte(byte) { this.putBytes(Uint8Array.of(byte)); }
  putBytes(bytes) { this.consume(bytes); this.written += bytes.length; this.writeCount++; }
  output() { throw new Error('This destination does not collect PDF bytes'); }
  view() { throw new Error('This destination does not collect PDF bytes'); }
  take() { throw new Error('This destination does not collect PDF bytes'); }
  setBytes() { throw new Error('This destination is forward-only'); }
}

/** Source metadata describes the retained 320 x 160 RGB dpi-pattern.jpg asset. */
export function createSynchronousOutputDocument({ length, write }) {
  const stats = { imageWrites: 0 };
  const image = pw.PdfImage.jpegStream({ width: 320, height: 160, length,
    write: output => { stats.imageWrites++; write(output); }
  });
  const provider = new pw.ImageProxy(image);
  const label = (text, size = 12) => new pw.Text(text, {
    style: new pw.TextStyle({ fontSize: size, color: '#172554' })
  });
  const document = new pw.Document({ title: 'Synchronous output - phase 6.5', author: 'Romulo Campos' });
  document.addPage(new pw.Page({ margin: 36, build: () => new pw.Column({ gap: 20, children: [
    label('Synchronous output', 26),
    label('One PDF, two destinations: save() collects bytes; write(destination) sends them directly to a caller-owned output.'),
    new pw.Container({ padding: 16, background: '#eff6ff', child: new pw.Column({ gap: 12, children: [
      label('Lazy JPEG / one resource, two placements', 17),
      new pw.Row({ gap: 20, children: [
        new pw.Image(provider, { width: 220, height: 110 }),
        new pw.Image(provider, { width: 220, height: 110 })
      ] }),
      label('The encoded RGB bytes are requested only when the image object is serialized, once per write/save despite being painted twice.', 11)
    ] }) }),
    label('Executable checks', 18),
    label('The gallery generator verifies that streamed bytes equal save(), that the image writer runs once per serialization, and that the destination offset equals the final byte count.'),
    label('Direct file example', 18),
    label('Run node examples/run-synchronous-output.mjs after building. It reads the JPEG in 1 KB chunks only inside its writer and sends PDF chunks directly to the output file.'),
    label('The browser preview collects bytes to display the PDF. Direct output avoids that final collection; page layout and other resource processing still use memory.', 11)
  ] }) }));
  return { document, stats };
}

/** Preview plus assertions; the host runner below demonstrates non-collecting output. */
export function generateSynchronousOutputPhase65(jpegBytes) {
  const { document, stats } = createSynchronousOutputDocument({ length: jpegBytes.length,
    write: output => {
      for (let offset = 0; offset < jpegBytes.length; offset += 1024) output.putBytes(jpegBytes.subarray(offset, offset + 1024));
    }
  });
  if (stats.imageWrites !== 0) throw new Error('JPEG must remain lazy before serialization');
  const collected = new pw.PdfStream();
  const output = new CallbackPdfStream(bytes => collected.putBytes(bytes));
  document.write(output);
  const bytes = collected.output();
  if (stats.imageWrites !== 1 || output.offset !== bytes.length || output.writeCount < 2) throw new Error('Streaming contract failed');
  const saved = document.save();
  if (stats.imageWrites !== 2 || saved.length !== bytes.length || saved.some((byte, index) => byte !== bytes[index])) {
    throw new Error('Streaming and save() must be byte-identical');
  }
  return bytes;
}

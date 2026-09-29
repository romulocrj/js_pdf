/*
 * js_pdf layout performance phase 6.6 workloads and visual equivalence example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as defaultApi from '../dist/js_pdf.mjs';

export function runLayoutBenchmarkCase(api, name, iterations) {
  const document = new api.Document();
  const context = { document, theme: document.theme, canvas: null, pageNumber: 1 };
  let checksum = 0;
  if (name === 'constraints') {
    const original = new api.BoxConstraints({ minWidth: 10, maxWidth: 200, minHeight: 2, maxHeight: 80 });
    const bound = new api.BoxConstraints({ maxWidth: 400, maxHeight: 200 });
    const retained = new Array(32);
    for (let i = 0; i < iterations; i++) {
      const result = original.enforce(bound);
      retained[i % retained.length] = result;
      checksum += result.maxWidth + result.minHeight;
    }
    return checksum + retained[0].maxHeight;
  }
  if (name === 'flex') {
    const column = new api.Column({ mainAxisSize: 'min', gap: 2,
      children: Array.from({ length: 30 }, (_, i) => new api.SizedBox({ width: 30 + i, height: 10 })) });
    const constraints = new api.BoxConstraints({ maxWidth: 200, maxHeight: 80 });
    for (let i = 0; i < iterations; i++) {
      const fragment = column.layoutSpan(context, constraints, { firstChild: (i % 4) * 6 });
      checksum += fragment.box.width + fragment.box.height + fragment.nextState.firstChild;
    }
    return checksum;
  }
  if (name === 'ascii' || name === 'mixed') {
    const values = name === 'ascii' ? ['TICKET-0123456789', 'SKU-ABCDEFG', '1234567890']
      : ['two words', 'a\u00a0b', 'accentué', 'one\ntwo', 'SERIAL123'];
    const widgets = values.map(value => new api.Text(value));
    const constraints = new api.BoxConstraints({ maxWidth: 100, maxHeight: 200 });
    for (let i = 0; i < iterations; i++) {
      const box = widgets[i % widgets.length].layout(context, constraints);
      checksum += box.width + box.height + box.data.lines.length;
    }
    return checksum;
  }
  throw new Error(`Unknown case: ${name}`);
}

/** Same scene is generated with the baseline and candidate bundle for byte comparison. */
export function generateLayoutPerformancePhase66(api = defaultApi) {
  const document = new api.Document({ title: 'Layout performance - phase 6.6', author: 'Romulo Campos' });
  const style = new api.TextStyle({ fontSize: 11, color: '#172554' });
  document.addPage(new api.MultiPage({ pageFormat: api.PageFormat.A5, margin: 24, gap: 8,
    header: context => new api.Text(`Layout performance / ${context.pageNumber} of ${context.pagesCount}`, { style }),
    footer: () => new api.Text('Same layout and PDF bytes before and after optimization.', { style }),
    build: () => [new api.Column({ mainAxisSize: 'min', gap: 8, crossAxisAlignment: 'stretch', children:
      Array.from({ length: 24 }, (_, i) => new api.Container({ padding: 8,
        decoration: new api.BoxDecoration({ color: i % 2 ? '#eff6ff' : '#f0fdf4' }),
        child: new api.Row({ mainAxisAlignment: 'spaceBetween', children: [
          new api.Text(`TICKET-${String(i + 1).padStart(6, '0')}`, { style }),
          new api.Text(i % 3 ? 'READY' : 'two words', { style })
        ] })
      }))
    })]
  }));
  return document.save();
}

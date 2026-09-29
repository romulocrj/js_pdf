/*
 * js_pdf custom text breaking phase 6.4 visual example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import * as pw from '../dist/js_pdf.mjs';

const label = (value, size = 11) => new pw.Text(value, {
  style: new pw.TextStyle({ fontSize: size, color: '#172554' })
});

// Demonstration only, not a full Unicode line-breaking implementation.
export function cjkPunctuationSegments(line) {
  const parts = [];
  for (const character of line) {
    if ('，。、）'.includes(character) && parts.length > 0) parts[parts.length - 1] += character;
    else parts.push(character);
  }
  return parts;
}

const syllables = ['in', 'ter', 'na', 'tion', 'al', 'iza', 'tion'];
export function exampleHyphenation(word) {
  for (let index = 0; index < syllables.length; index++) {
    const remainder = syllables.slice(index);
    if (remainder.join('') === word) return remainder;
  }
  return [word];
}

function panel(title, caption, child) {
  return new pw.Container({ width: 252, height: 180, padding: 12,
    decoration: new pw.BoxDecoration({ color: '#eff6ff', border: pw.Border.all({ color: '#bfdbfe' }) }),
    child: new pw.Column({ crossAxisAlignment: 'start', gap: 12, children: [
      label(title, 15), label(caption, 10), child
    ] })
  });
}

export function generateTextBreakingPhase64(cjkFontBytes) {
  const cjkFont = pw.Font.ttf(cjkFontBytes);
  const cjkStyle = new pw.TextStyle({ font: cjkFont, fontSize: 18 });
  const prefix = '- 字体排印学是研究字体';
  const cjk = lineSplitter => new pw.SizedBox({ width: 180,
    child: new pw.Text(prefix, { style: cjkStyle, lineSplitter }) });
  const punctuation = lineSplitter => new pw.SizedBox({ width: 40,
    child: new pw.Text('你好，世界', { style: new pw.TextStyle({ font: cjkFont, fontSize: 20 }), lineSplitter }) });
  const latin = hyphenation => new pw.SizedBox({ width: 126,
    child: new pw.Text('PDF internationalization', {
      style: new pw.TextStyle({ font: pw.Font.courier(), fontSize: 14 }), hyphenation
    }) });
  const pdf = new pw.Document({ title: 'Text breaking - phase 6.4', author: 'Romulo Campos' });
  pdf.addPage(new pw.Page({ margin: 30, build: () => new pw.Column({ gap: 16, children: [
    label('Custom line breaking', 25),
    label('Compare default wrapping with caller-supplied boundaries. The callbacks are synchronous and require no runtime dependency.'),
    new pw.Row({ gap: 16, children: [
      panel('Default / CJK prefix', 'The unspaced word moves as a whole, leaving the prefix alone.', cjk(null)),
      panel('Custom / character breaks', 'Characters fill the first line without introducing spaces.', cjk(line => [...line]))
    ] }),
    new pw.Row({ gap: 16, children: [
      panel('Default / punctuation', 'Hard splitting may begin a line with closing punctuation.', punctuation(null)),
      panel('Custom / grouped punctuation', 'The comma stays attached to the previous character. This is a small rule, not full UAX #14.', punctuation(cjkPunctuationSegments))
    ] }),
    new pw.Row({ gap: 16, children: [
      panel('Default / long word', 'A long word uses character-level fallback.', latin(null)),
      panel('Custom / hyphenation', 'The supplied syllables fill available space; the hyphen is included in the width.', latin(exampleHyphenation))
    ] }),
    label('CJK font: modified Noto Sans SC subset, SIL OFL 1.1. See examples/assets/THIRD-PARTY-NOTICES.md.', 9)
  ] }) }));
  return pdf.save();
}

/*
 * js_pdf tests — the phase 2.3 XML reader.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { XmlDocument, XmlElement, XmlText, parseXml } from '../src/svg/xml.ts';

const XLINK = 'http://www.w3.org/1999/xlink';

test('elements, attributes and nesting round-trip', () => {
  const document = parseXml('<svg width="100"><g id="a"><rect x="1" y="2"/></g></svg>');
  const root = document.rootElement;

  assert.equal(root.name.local, 'svg');
  assert.equal(root.getAttribute('width'), '100');

  const group = root.elements[0];
  assert.equal(group.name.local, 'g');
  assert.equal(group.getAttribute('id'), 'a');

  const rect = group.elements[0];
  assert.equal(rect.name.local, 'rect');
  assert.equal(rect.getAttribute('x'), '1');
  assert.equal(rect.getAttribute('y'), '2');
  assert.equal(rect.elements.length, 0);
});

test('a missing attribute reads as null, not undefined', () => {
  const root = parseXml('<svg/>').rootElement;
  assert.equal(root.getAttribute('viewBox'), null);
});

test('both quote styles are accepted for attribute values', () => {
  const root = parseXml(`<svg a="one" b='two'/>`).rootElement;
  assert.equal(root.getAttribute('a'), 'one');
  assert.equal(root.getAttribute('b'), 'two');
});

test('an attribute value may contain the other quote and a slash', () => {
  const root = parseXml(`<svg d="M0 0 L1 1" style='fill:none'/>`).rootElement;
  assert.equal(root.getAttribute('d'), 'M0 0 L1 1');
  assert.equal(root.getAttribute('style'), 'fill:none');
});

test('the prologue, comments, processing instructions and DOCTYPE are skipped', () => {
  const document = parseXml(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<!-- a comment -->\n'
    + '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/svg11.dtd">\n'
    + '<svg><!-- inside --><g/><?php ?></svg>\n'
    + '<!-- trailing -->'
  );

  assert.equal(document.rootElement.name.local, 'svg');
  assert.equal(document.rootElement.elements.length, 1);
  assert.equal(document.rootElement.elements[0].name.local, 'g');
});

test('a DOCTYPE with an internal subset does not swallow the document', () => {
  const document = parseXml(
    '<!DOCTYPE svg [ <!ENTITY ns "http://example.com"> ]>\n<svg id="root"/>'
  );
  assert.equal(document.rootElement.getAttribute('id'), 'root');
});

test('predefined entities and character references are decoded', () => {
  const root = parseXml(
    '<t title="a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;">&#65;&#x42;&#8212;</t>'
  ).rootElement;

  assert.equal(root.getAttribute('title'), `a & b <c> "d" 'e'`);
  assert.equal(root.text, 'AB—');
});

test('an entity the reader cannot resolve is left as written', () => {
  // Custom entities live in the DTD subset, which is skipped; dropping the text
  // would lose more than keeping the reference visible.
  const root = parseXml('<t>&custom; tail</t>').rootElement;
  assert.equal(root.text, '&custom; tail');
});

test('CDATA is text and is not entity-decoded', () => {
  const root = parseXml('<style><![CDATA[ .a { fill: #fff } & < > ]]></style>').rootElement;
  assert.equal(root.text, ' .a { fill: #fff } & < > ');
  assert.equal(root.children.length, 1);
  assert.ok(root.children[0] instanceof XmlText);
});

test('namespaced attributes are found through whichever prefix declared them', () => {
  const document = parseXml(
    `<svg xmlns:xlink="${XLINK}"><use xlink:href="#a"/></svg>`
  );
  const use = document.rootElement.elements[0];

  assert.equal(use.getAttribute('href'), null, 'the unprefixed name is not the same attribute');
  assert.equal(use.getAttribute('xlink:href'), '#a');
  assert.equal(use.getAttribute('href', XLINK), '#a');
});

test('a namespace prefix declared on an ancestor reaches the descendant', () => {
  const document = parseXml(`<svg xmlns:l="${XLINK}"><g><use l:href="#a"/></g></svg>`);
  const use = document.rootElement.elements[0].elements[0];
  assert.equal(use.getAttribute('href', XLINK), '#a');
});

test('a redeclared prefix shadows the outer one', () => {
  const document = parseXml(
    `<svg xmlns:l="${XLINK}"><g xmlns:l="urn:other"><a l:href="#x"/></g><b l:href="#y"/></svg>`
  );
  const inner = document.rootElement.elements[0].elements[0];
  const outer = document.rootElement.elements[1];

  assert.equal(inner.getAttribute('href', XLINK), null);
  assert.equal(inner.getAttribute('href', 'urn:other'), '#x');
  assert.equal(outer.getAttribute('href', XLINK), '#y');
});

test('setAttribute mutates the tree, which convertStyle needs', () => {
  const root = parseXml('<rect style="fill:red"/>').rootElement;
  root.setAttribute('fill', 'red');
  assert.equal(root.getAttribute('fill'), 'red');
});

test('descendants walks the whole subtree in document order', () => {
  const root = parseXml('<svg><a/><g><b/><c/></g><d/></svg>').rootElement;
  assert.deepEqual(root.descendants.map(e => e.name.local), ['a', 'g', 'b', 'c', 'd']);
});

test('findElements returns only direct children with that name', () => {
  const root = parseXml('<svg><g/><g/><h><g/></h></svg>').rootElement;
  assert.equal(root.findElements('g').length, 2);
});

test('text and elements interleave in the order they were written', () => {
  const root = parseXml('<p>before<b>bold</b>after</p>').rootElement;

  assert.equal(root.children.length, 3);
  assert.ok(root.children[0] instanceof XmlText);
  assert.ok(root.children[1] instanceof XmlElement);
  assert.equal(root.text, 'beforeboldafter');
});

test('a child knows its parent', () => {
  const root = parseXml('<svg><g/></svg>').rootElement;
  assert.equal(root.elements[0].parent, root);
  assert.equal(root.parent, null);
});

test('malformed input fails with a position', () => {
  const cases = [
    ['<svg><g></svg>', /line 1/],
    ['<svg>', /Unterminated element/],
    ['<svg a=1/>', /Attribute value must be quoted/],
    ['<svg a="1/>', /Unterminated attribute value/],
    ['   ', /no root element/],
    ['<a/><b/>', /Content after the root element/],
    ['<a><!-- unterminated', /Unterminated comment/]
  ];

  for (const [source, pattern] of cases) {
    assert.throws(() => parseXml(source), pattern, `expected ${source} to be rejected`);
  }
});

test('a non-string source is rejected before parsing', () => {
  assert.throws(() => parseXml(null), TypeError);
});

test('XmlDocument.parse is the name the SVG modules call it by', () => {
  assert.equal(XmlDocument.parse('<svg/>').rootElement.name.local, 'svg');
});

test('every SVG asset the examples load parses', () => {
  const directory = new URL('../examples/assets/', import.meta.url);
  const files = readdirSync(directory).filter(name => name.endsWith('.svg')).sort();
  assert.ok(files.length >= 10, `expected the SVG corpus, found ${files.length}`);

  for (const name of files) {
    const markup = readFileSync(new URL(name, directory), 'utf8');
    const document = parseXml(markup);
    assert.equal(document.rootElement.name.local, 'svg', `${name} must have an <svg> root`);
    assert.ok(document.rootElement.descendants.length > 0, `${name} parsed to an empty tree`);
  }
});

test('the inline SVG in server-assets.json parses', () => {
  const assets = JSON.parse(
    readFileSync(new URL('../examples/assets/server-assets.json', import.meta.url), 'utf8')
  );

  const markup = Object.values(assets).filter(
    value => typeof value === 'string' && value.includes('<svg')
  );
  assert.ok(markup.length > 0, 'server-assets.json must still carry inline SVG');

  for (const svg of markup) {
    assert.equal(parseXml(svg).rootElement.name.local, 'svg');
  }
});

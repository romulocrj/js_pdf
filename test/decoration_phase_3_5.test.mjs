/*
 * js_pdf tests — phase 3.5 box decoration, borders, radii and shadows.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';

function latin1(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
}

function pageSource(child) {
  return latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => child
  })));
}

test('phase 3.5 constructors are on named, namespace and callback APIs', () => {
  for (const name of [
    'BoxDecoration', 'BoxShadow', 'LinearGradient', 'RadialGradient',
    'Border', 'BorderSide', 'BorderStyle', 'BorderRadius', 'Radius', 'DecoratedBox'
  ]) {
    assert.equal(typeof Pdf[name], 'function', `${name} named`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    margin: 0,
    build: () => new api.Container({
      width: 50,
      height: 20,
      decoration: new api.BoxDecoration({ color: '#ff0000' })
    })
  }));
  assert.match(latin1(bytes), /1 0 0 rg/);
});

test('Border factories preserve uniform and per-side values', () => {
  const uniform = Pdf.Border.all({ color: '#336699', width: 2, style: 'dashed' });
  assert.equal(uniform.isUniform, true);
  assert.deepEqual(uniform.top.color, [0.2, 0.4, 0.6]);
  assert.deepEqual(uniform.top.style.pattern, [3, 3]);

  const split = new Pdf.Border({
    top: new Pdf.BorderSide({ width: 3 }),
    bottom: Pdf.BorderSide.none
  });
  assert.equal(split.isUniform, false);
  assert.equal(split.bottom.style.paint, false);
  assert.equal(split.top.copyWith({ width: 5 }).width, 5);
});

test('BorderRadius supports numeric shorthand, elliptical corners and direction', () => {
  const all = Pdf.BorderRadius.all(8);
  assert.equal(all.isUniform, true);
  assert.deepEqual([all.uniform.x, all.uniform.y], [8, 8]);

  const directional = Pdf.BorderRadiusDirectional.only({
    topStart: Pdf.Radius.elliptical(4, 7),
    bottomEnd: 9
  });
  const rtl = directional.resolve('rtl');
  assert.deepEqual([rtl.topRight.x, rtl.topRight.y], [4, 7]);
  assert.deepEqual([rtl.bottomLeft.x, rtl.bottomLeft.y], [9, 9]);
});

test('non-uniform borders emit only enabled physical rules', () => {
  const source = pageSource(new Pdf.Container({
    width: 100,
    height: 40,
    decoration: new Pdf.BoxDecoration({
      border: new Pdf.Border({
        top: new Pdf.BorderSide({ color: '#ff0000', width: 2 }),
        right: new Pdf.BorderSide({ color: '#0000ff', width: 3 })
      })
    })
  }));

  assert.match(source, /1 0 0 RG\n2 w\n0 841\.89 m\n100 841\.89 l\nS/);
  assert.match(source, /0 0 1 RG\n3 w\n100 841\.89 m\n100 801\.89 l\nS/);
});

test('rounded decoration clips an axial shading pattern', () => {
  const source = pageSource(new Pdf.Container({
    width: 120,
    height: 50,
    decoration: new Pdf.BoxDecoration({
      borderRadius: Pdf.BorderRadius.only({ topLeft: 30, bottomRight: 10 }),
      gradient: new Pdf.LinearGradient({
        begin: Pdf.Alignment.topLeft,
        end: Pdf.Alignment.bottomRight,
        colors: ['#ff0000', '#00ff00', '#0000ff'],
        stops: [0, 0.4, 1]
      }),
      border: Pdf.Border.all({ color: '#111111', width: 1.5 })
    })
  }));

  assert.match(source, /W n/);
  assert.match(source, /\/Pattern cs \/p1 scn/);
  assert.match(source, /\/ShadingType 2/);
  assert.match(source, /\/FunctionType 3/);
  assert.match(source, /1\.5 w/);
});

test('radial gradients serialize focal and outer radii in page coordinates', () => {
  const source = pageSource(new Pdf.Container({
    width: 100,
    height: 80,
    decoration: new Pdf.BoxDecoration({
      shape: 'circle',
      gradient: new Pdf.RadialGradient({
        focal: Pdf.Alignment.topLeft,
        center: Pdf.Alignment.center,
        focalRadius: 0.1,
        radius: 0.5,
        colors: ['#ffffff', '#000000']
      })
    })
  }));

  assert.match(source, /\/ShadingType 3/);
  assert.match(source, /\/Coords \[0 841\.89 8 50 801\.89 40\]/);
});

test('vector box shadows emit scoped opacity layers before the fill', () => {
  const source = pageSource(new Pdf.Container({
    width: 80,
    height: 30,
    decoration: new Pdf.BoxDecoration({
      color: '#ffffff',
      boxShadow: [new Pdf.BoxShadow({
        color: '#123456',
        offset: { x: 4, y: 6 },
        blurRadius: 4,
        spreadRadius: 2,
        opacity: 0.4
      })]
    })
  }));

  assert.match(source, /\/ExtGState << \/g1/);
  assert.match(source, /\/ca /);
  assert.ok(source.indexOf('/g1 gs') < source.indexOf('1 1 1 rg'));
});

test('foreground decoration paints after the child', () => {
  const source = pageSource(new Pdf.Container({
    width: 100,
    height: 30,
    foregroundDecoration: new Pdf.BoxDecoration({
      border: new Pdf.Border({ bottom: new Pdf.BorderSide({ color: '#ff0000' }) })
    }),
    child: new Pdf.Text('child')
  }));

  assert.ok(source.indexOf('(child) Tj') < source.indexOf('1 0 0 RG'));
});

test('table helper rows accept the same rounded BoxDecoration objects', () => {
  const source = pageSource(Pdf.TableHelper.fromTextArray({
    headers: ['A', 'B'],
    data: [['1', '2']],
    headerDecoration: new Pdf.BoxDecoration({
      color: '#ffeeaa',
      borderRadius: Pdf.BorderRadius.all(3),
      border: Pdf.Border.all({ width: 0.5 })
    })
  }));

  assert.match(source, /1 0\.9333 0\.6667 rg/);
  assert.match(source, /0\.5 w/);
});

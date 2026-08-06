/*
 * js_pdf DEFLATE encoder tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Two independent decoders check every case: Node's zlib, which is the
 * reference implementation, and the port's own inflate in image/png.ts. A bug
 * that both accept would have to be a bug in the format itself.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

import { deflateZlib, deflateRaw } from '../src/pdf/format/deflate.ts';
import { inflateZlib } from '../src/pdf/image/png.ts';

/** Round-trip `bytes` through both decoders and return the compressed size. */
function roundTrip(bytes, label) {
  const compressed = deflateZlib(bytes);

  const viaNode = new Uint8Array(inflateSync(Buffer.from(compressed)));
  assert.deepEqual(
    Array.from(viaNode), Array.from(bytes),
    `${label}: node zlib did not recover the input`
  );

  const viaPort = inflateZlib(compressed);
  assert.deepEqual(
    Array.from(viaPort), Array.from(bytes),
    `${label}: the port's own inflate did not recover the input`
  );

  return compressed.length;
}

/** A deterministic PRNG, so a failure is reproducible. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('an empty input produces a stream both decoders accept', () => {
  roundTrip(new Uint8Array(0), 'empty');
});

test('inputs shorter than the minimum match length round-trip', () => {
  for (let length = 1; length <= 4; length++) {
    roundTrip(new Uint8Array(length).fill(65), `length ${length}`);
  }
});

test('a single repeated byte compresses hard and round-trips', () => {
  const bytes = new Uint8Array(200000).fill(0x41);
  const size = roundTrip(bytes, 'repeated byte');
  assert.ok(size < bytes.length / 100, `expected heavy compression, got ${size}`);
});

test('incompressible data round-trips and does not inflate much', () => {
  const next = random(12345);
  const bytes = new Uint8Array(100000);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Math.floor(next() * 256);
  }
  const size = roundTrip(bytes, 'random');
  // A stored block costs five bytes per 65535, so the ceiling is tiny.
  assert.ok(size < bytes.length + 200, `stored fallback should bound growth, got ${size}`);
});

test('text-like data with long repeats round-trips', () => {
  const line = 'Relatorio de Tarefas Regulatorias — normativo vinculado a tarefa. ';
  let text = '';
  while (text.length < 300000) text += line;
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index) & 0xff;

  const size = roundTrip(bytes, 'repetitive text');
  assert.ok(size < bytes.length / 50, `expected heavy compression, got ${size}`);
});

test('data spanning many blocks round-trips', () => {
  const next = random(999);
  const bytes = new Uint8Array(1200000);
  for (let index = 0; index < bytes.length; index++) {
    // Structured enough to match, varied enough to keep the trees changing.
    bytes[index] = next() < 0.35 ? Math.floor(next() * 256) : (index % 97);
  }
  roundTrip(bytes, 'multi-block');
});

test('a highly skewed alphabet still fits in 15-bit codes', () => {
  // Frequencies that grow like Fibonacci are the worst case for Huffman depth;
  // without length limiting this is what overflows the 15-bit ceiling.
  const bytes = [];
  let previous = 1;
  let current = 1;
  for (let symbol = 0; symbol < 40; symbol++) {
    for (let count = 0; count < current; count++) bytes.push(symbol);
    const nextCount = previous + current;
    previous = current;
    current = Math.min(nextCount, 30000);
  }
  roundTrip(Uint8Array.from(bytes), 'skewed alphabet');
});

test('every byte value appears and round-trips', () => {
  const bytes = new Uint8Array(256 * 40);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
  roundTrip(bytes, 'full alphabet');
});

test('a match at the maximum distance round-trips', () => {
  const bytes = new Uint8Array(32768 + 64);
  const next = random(7);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(next() * 256);
  // Repeat the opening bytes at the far end of the window.
  bytes.set(bytes.subarray(0, 32), bytes.length - 32);
  roundTrip(bytes, 'far match');
});

test('overlapping runs longer than the maximum match round-trip', () => {
  const bytes = new Uint8Array(5000);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 3;
  roundTrip(bytes, 'overlapping run');
});

test('deflateRaw output is a bare DEFLATE stream with no zlib framing', () => {
  const bytes = new Uint8Array(1000).fill(7);
  const raw = deflateRaw(bytes);
  const wrapped = deflateZlib(bytes);
  assert.equal(wrapped.length, raw.length + 6, 'zlib framing is a 2-byte header and a 4-byte sum');
  assert.equal(wrapped[0], 0x78);
  assert.equal(wrapped[1], 0x9c);
});

test('the adler checksum is the one the decoders verify', () => {
  // inflateZlib throws on a bad checksum, so a corrupted trailer must fail.
  const compressed = deflateZlib(new Uint8Array(500).fill(3));
  compressed[compressed.length - 1] ^= 0xff;
  assert.throws(() => inflateZlib(compressed), /checksum/i);
});

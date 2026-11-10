/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/colors.dart
 */

import { PdfColor, PdfColorHsv } from './color.ts';

// SIZE: upstream spells out every constant. The port declares the same statics
// here and assigns them below the class from one packed string, which keeps the
// values, freezing, aliases and property order while saving about 10 KB of
// minified output. test/static_tables.test.mjs fingerprints the result.

/** Material palette translated from upstream colors.dart at b97c4a63dc. */
export class PdfColors {
  private constructor() {}
  declare static readonly red50: Readonly<PdfColor>;
  declare static readonly red100: Readonly<PdfColor>;
  declare static readonly red200: Readonly<PdfColor>;
  declare static readonly red300: Readonly<PdfColor>;
  declare static readonly red400: Readonly<PdfColor>;
  declare static readonly red500: Readonly<PdfColor>;
  declare static readonly red600: Readonly<PdfColor>;
  declare static readonly red700: Readonly<PdfColor>;
  declare static readonly red800: Readonly<PdfColor>;
  declare static readonly red900: Readonly<PdfColor>;
  declare static readonly redAccent100: Readonly<PdfColor>;
  declare static readonly redAccent200: Readonly<PdfColor>;
  declare static readonly redAccent400: Readonly<PdfColor>;
  declare static readonly redAccent700: Readonly<PdfColor>;
  declare static readonly pink50: Readonly<PdfColor>;
  declare static readonly pink100: Readonly<PdfColor>;
  declare static readonly pink200: Readonly<PdfColor>;
  declare static readonly pink300: Readonly<PdfColor>;
  declare static readonly pink400: Readonly<PdfColor>;
  declare static readonly pink500: Readonly<PdfColor>;
  declare static readonly pink600: Readonly<PdfColor>;
  declare static readonly pink700: Readonly<PdfColor>;
  declare static readonly pink800: Readonly<PdfColor>;
  declare static readonly pink900: Readonly<PdfColor>;
  declare static readonly pinkAccent100: Readonly<PdfColor>;
  declare static readonly pinkAccent200: Readonly<PdfColor>;
  declare static readonly pinkAccent400: Readonly<PdfColor>;
  declare static readonly pinkAccent700: Readonly<PdfColor>;
  declare static readonly purple50: Readonly<PdfColor>;
  declare static readonly purple100: Readonly<PdfColor>;
  declare static readonly purple200: Readonly<PdfColor>;
  declare static readonly purple300: Readonly<PdfColor>;
  declare static readonly purple400: Readonly<PdfColor>;
  declare static readonly purple500: Readonly<PdfColor>;
  declare static readonly purple600: Readonly<PdfColor>;
  declare static readonly purple700: Readonly<PdfColor>;
  declare static readonly purple800: Readonly<PdfColor>;
  declare static readonly purple900: Readonly<PdfColor>;
  declare static readonly purpleAccent100: Readonly<PdfColor>;
  declare static readonly purpleAccent200: Readonly<PdfColor>;
  declare static readonly purpleAccent400: Readonly<PdfColor>;
  declare static readonly purpleAccent700: Readonly<PdfColor>;
  declare static readonly deepPurple50: Readonly<PdfColor>;
  declare static readonly deepPurple100: Readonly<PdfColor>;
  declare static readonly deepPurple200: Readonly<PdfColor>;
  declare static readonly deepPurple300: Readonly<PdfColor>;
  declare static readonly deepPurple400: Readonly<PdfColor>;
  declare static readonly deepPurple500: Readonly<PdfColor>;
  declare static readonly deepPurple600: Readonly<PdfColor>;
  declare static readonly deepPurple700: Readonly<PdfColor>;
  declare static readonly deepPurple800: Readonly<PdfColor>;
  declare static readonly deepPurple900: Readonly<PdfColor>;
  declare static readonly deepPurpleAccent100: Readonly<PdfColor>;
  declare static readonly deepPurpleAccent200: Readonly<PdfColor>;
  declare static readonly deepPurpleAccent400: Readonly<PdfColor>;
  declare static readonly deepPurpleAccent700: Readonly<PdfColor>;
  declare static readonly indigo50: Readonly<PdfColor>;
  declare static readonly indigo100: Readonly<PdfColor>;
  declare static readonly indigo200: Readonly<PdfColor>;
  declare static readonly indigo300: Readonly<PdfColor>;
  declare static readonly indigo400: Readonly<PdfColor>;
  declare static readonly indigo500: Readonly<PdfColor>;
  declare static readonly indigo600: Readonly<PdfColor>;
  declare static readonly indigo700: Readonly<PdfColor>;
  declare static readonly indigo800: Readonly<PdfColor>;
  declare static readonly indigo900: Readonly<PdfColor>;
  declare static readonly indigoAccent100: Readonly<PdfColor>;
  declare static readonly indigoAccent200: Readonly<PdfColor>;
  declare static readonly indigoAccent400: Readonly<PdfColor>;
  declare static readonly indigoAccent700: Readonly<PdfColor>;
  declare static readonly blue50: Readonly<PdfColor>;
  declare static readonly blue100: Readonly<PdfColor>;
  declare static readonly blue200: Readonly<PdfColor>;
  declare static readonly blue300: Readonly<PdfColor>;
  declare static readonly blue400: Readonly<PdfColor>;
  declare static readonly blue500: Readonly<PdfColor>;
  declare static readonly blue600: Readonly<PdfColor>;
  declare static readonly blue700: Readonly<PdfColor>;
  declare static readonly blue800: Readonly<PdfColor>;
  declare static readonly blue900: Readonly<PdfColor>;
  declare static readonly blueAccent100: Readonly<PdfColor>;
  declare static readonly blueAccent200: Readonly<PdfColor>;
  declare static readonly blueAccent400: Readonly<PdfColor>;
  declare static readonly blueAccent700: Readonly<PdfColor>;
  declare static readonly lightBlue50: Readonly<PdfColor>;
  declare static readonly lightBlue100: Readonly<PdfColor>;
  declare static readonly lightBlue200: Readonly<PdfColor>;
  declare static readonly lightBlue300: Readonly<PdfColor>;
  declare static readonly lightBlue400: Readonly<PdfColor>;
  declare static readonly lightBlue500: Readonly<PdfColor>;
  declare static readonly lightBlue600: Readonly<PdfColor>;
  declare static readonly lightBlue700: Readonly<PdfColor>;
  declare static readonly lightBlue800: Readonly<PdfColor>;
  declare static readonly lightBlue900: Readonly<PdfColor>;
  declare static readonly lightBlueAccent100: Readonly<PdfColor>;
  declare static readonly lightBlueAccent200: Readonly<PdfColor>;
  declare static readonly lightBlueAccent400: Readonly<PdfColor>;
  declare static readonly lightBlueAccent700: Readonly<PdfColor>;
  declare static readonly cyan50: Readonly<PdfColor>;
  declare static readonly cyan100: Readonly<PdfColor>;
  declare static readonly cyan200: Readonly<PdfColor>;
  declare static readonly cyan300: Readonly<PdfColor>;
  declare static readonly cyan400: Readonly<PdfColor>;
  declare static readonly cyan500: Readonly<PdfColor>;
  declare static readonly cyan600: Readonly<PdfColor>;
  declare static readonly cyan700: Readonly<PdfColor>;
  declare static readonly cyan800: Readonly<PdfColor>;
  declare static readonly cyan900: Readonly<PdfColor>;
  declare static readonly cyanAccent100: Readonly<PdfColor>;
  declare static readonly cyanAccent200: Readonly<PdfColor>;
  declare static readonly cyanAccent400: Readonly<PdfColor>;
  declare static readonly cyanAccent700: Readonly<PdfColor>;
  declare static readonly teal50: Readonly<PdfColor>;
  declare static readonly teal100: Readonly<PdfColor>;
  declare static readonly teal200: Readonly<PdfColor>;
  declare static readonly teal300: Readonly<PdfColor>;
  declare static readonly teal400: Readonly<PdfColor>;
  declare static readonly teal500: Readonly<PdfColor>;
  declare static readonly teal600: Readonly<PdfColor>;
  declare static readonly teal700: Readonly<PdfColor>;
  declare static readonly teal800: Readonly<PdfColor>;
  declare static readonly teal900: Readonly<PdfColor>;
  declare static readonly tealAccent100: Readonly<PdfColor>;
  declare static readonly tealAccent200: Readonly<PdfColor>;
  declare static readonly tealAccent400: Readonly<PdfColor>;
  declare static readonly tealAccent700: Readonly<PdfColor>;
  declare static readonly green50: Readonly<PdfColor>;
  declare static readonly green100: Readonly<PdfColor>;
  declare static readonly green200: Readonly<PdfColor>;
  declare static readonly green300: Readonly<PdfColor>;
  declare static readonly green400: Readonly<PdfColor>;
  declare static readonly green500: Readonly<PdfColor>;
  declare static readonly green600: Readonly<PdfColor>;
  declare static readonly green700: Readonly<PdfColor>;
  declare static readonly green800: Readonly<PdfColor>;
  declare static readonly green900: Readonly<PdfColor>;
  declare static readonly greenAccent100: Readonly<PdfColor>;
  declare static readonly greenAccent200: Readonly<PdfColor>;
  declare static readonly greenAccent400: Readonly<PdfColor>;
  declare static readonly greenAccent700: Readonly<PdfColor>;
  declare static readonly lightGreen50: Readonly<PdfColor>;
  declare static readonly lightGreen100: Readonly<PdfColor>;
  declare static readonly lightGreen200: Readonly<PdfColor>;
  declare static readonly lightGreen300: Readonly<PdfColor>;
  declare static readonly lightGreen400: Readonly<PdfColor>;
  declare static readonly lightGreen500: Readonly<PdfColor>;
  declare static readonly lightGreen600: Readonly<PdfColor>;
  declare static readonly lightGreen700: Readonly<PdfColor>;
  declare static readonly lightGreen800: Readonly<PdfColor>;
  declare static readonly lightGreen900: Readonly<PdfColor>;
  declare static readonly lightGreenAccent100: Readonly<PdfColor>;
  declare static readonly lightGreenAccent200: Readonly<PdfColor>;
  declare static readonly lightGreenAccent400: Readonly<PdfColor>;
  declare static readonly lightGreenAccent700: Readonly<PdfColor>;
  declare static readonly lime50: Readonly<PdfColor>;
  declare static readonly lime100: Readonly<PdfColor>;
  declare static readonly lime200: Readonly<PdfColor>;
  declare static readonly lime300: Readonly<PdfColor>;
  declare static readonly lime400: Readonly<PdfColor>;
  declare static readonly lime500: Readonly<PdfColor>;
  declare static readonly lime600: Readonly<PdfColor>;
  declare static readonly lime700: Readonly<PdfColor>;
  declare static readonly lime800: Readonly<PdfColor>;
  declare static readonly lime900: Readonly<PdfColor>;
  declare static readonly limeAccent100: Readonly<PdfColor>;
  declare static readonly limeAccent200: Readonly<PdfColor>;
  declare static readonly limeAccent400: Readonly<PdfColor>;
  declare static readonly limeAccent700: Readonly<PdfColor>;
  declare static readonly yellow50: Readonly<PdfColor>;
  declare static readonly yellow100: Readonly<PdfColor>;
  declare static readonly yellow200: Readonly<PdfColor>;
  declare static readonly yellow300: Readonly<PdfColor>;
  declare static readonly yellow400: Readonly<PdfColor>;
  declare static readonly yellow500: Readonly<PdfColor>;
  declare static readonly yellow600: Readonly<PdfColor>;
  declare static readonly yellow700: Readonly<PdfColor>;
  declare static readonly yellow800: Readonly<PdfColor>;
  declare static readonly yellow900: Readonly<PdfColor>;
  declare static readonly yellowAccent100: Readonly<PdfColor>;
  declare static readonly yellowAccent200: Readonly<PdfColor>;
  declare static readonly yellowAccent400: Readonly<PdfColor>;
  declare static readonly yellowAccent700: Readonly<PdfColor>;
  declare static readonly amber50: Readonly<PdfColor>;
  declare static readonly amber100: Readonly<PdfColor>;
  declare static readonly amber200: Readonly<PdfColor>;
  declare static readonly amber300: Readonly<PdfColor>;
  declare static readonly amber400: Readonly<PdfColor>;
  declare static readonly amber500: Readonly<PdfColor>;
  declare static readonly amber600: Readonly<PdfColor>;
  declare static readonly amber700: Readonly<PdfColor>;
  declare static readonly amber800: Readonly<PdfColor>;
  declare static readonly amber900: Readonly<PdfColor>;
  declare static readonly amberAccent100: Readonly<PdfColor>;
  declare static readonly amberAccent200: Readonly<PdfColor>;
  declare static readonly amberAccent400: Readonly<PdfColor>;
  declare static readonly amberAccent700: Readonly<PdfColor>;
  declare static readonly orange50: Readonly<PdfColor>;
  declare static readonly orange100: Readonly<PdfColor>;
  declare static readonly orange200: Readonly<PdfColor>;
  declare static readonly orange300: Readonly<PdfColor>;
  declare static readonly orange400: Readonly<PdfColor>;
  declare static readonly orange500: Readonly<PdfColor>;
  declare static readonly orange600: Readonly<PdfColor>;
  declare static readonly orange700: Readonly<PdfColor>;
  declare static readonly orange800: Readonly<PdfColor>;
  declare static readonly orange900: Readonly<PdfColor>;
  declare static readonly orangeAccent100: Readonly<PdfColor>;
  declare static readonly orangeAccent200: Readonly<PdfColor>;
  declare static readonly orangeAccent400: Readonly<PdfColor>;
  declare static readonly orangeAccent700: Readonly<PdfColor>;
  declare static readonly deepOrange50: Readonly<PdfColor>;
  declare static readonly deepOrange100: Readonly<PdfColor>;
  declare static readonly deepOrange200: Readonly<PdfColor>;
  declare static readonly deepOrange300: Readonly<PdfColor>;
  declare static readonly deepOrange400: Readonly<PdfColor>;
  declare static readonly deepOrange500: Readonly<PdfColor>;
  declare static readonly deepOrange600: Readonly<PdfColor>;
  declare static readonly deepOrange700: Readonly<PdfColor>;
  declare static readonly deepOrange800: Readonly<PdfColor>;
  declare static readonly deepOrange900: Readonly<PdfColor>;
  declare static readonly deepOrangeAccent100: Readonly<PdfColor>;
  declare static readonly deepOrangeAccent200: Readonly<PdfColor>;
  declare static readonly deepOrangeAccent400: Readonly<PdfColor>;
  declare static readonly deepOrangeAccent700: Readonly<PdfColor>;
  declare static readonly brown50: Readonly<PdfColor>;
  declare static readonly brown100: Readonly<PdfColor>;
  declare static readonly brown200: Readonly<PdfColor>;
  declare static readonly brown300: Readonly<PdfColor>;
  declare static readonly brown400: Readonly<PdfColor>;
  declare static readonly brown500: Readonly<PdfColor>;
  declare static readonly brown600: Readonly<PdfColor>;
  declare static readonly brown700: Readonly<PdfColor>;
  declare static readonly brown800: Readonly<PdfColor>;
  declare static readonly brown900: Readonly<PdfColor>;
  declare static readonly grey50: Readonly<PdfColor>;
  declare static readonly grey100: Readonly<PdfColor>;
  declare static readonly grey200: Readonly<PdfColor>;
  declare static readonly grey300: Readonly<PdfColor>;
  declare static readonly grey400: Readonly<PdfColor>;
  declare static readonly grey500: Readonly<PdfColor>;
  declare static readonly grey600: Readonly<PdfColor>;
  declare static readonly grey700: Readonly<PdfColor>;
  declare static readonly grey800: Readonly<PdfColor>;
  declare static readonly grey900: Readonly<PdfColor>;
  declare static readonly blueGrey50: Readonly<PdfColor>;
  declare static readonly blueGrey100: Readonly<PdfColor>;
  declare static readonly blueGrey200: Readonly<PdfColor>;
  declare static readonly blueGrey300: Readonly<PdfColor>;
  declare static readonly blueGrey400: Readonly<PdfColor>;
  declare static readonly blueGrey500: Readonly<PdfColor>;
  declare static readonly blueGrey600: Readonly<PdfColor>;
  declare static readonly blueGrey700: Readonly<PdfColor>;
  declare static readonly blueGrey800: Readonly<PdfColor>;
  declare static readonly blueGrey900: Readonly<PdfColor>;
  declare static readonly white: Readonly<PdfColor>;
  declare static readonly black: Readonly<PdfColor>;
  declare static readonly red: Readonly<PdfColor>;
  declare static readonly redAccent: Readonly<PdfColor>;
  declare static readonly pink: Readonly<PdfColor>;
  declare static readonly pinkAccent: Readonly<PdfColor>;
  declare static readonly purple: Readonly<PdfColor>;
  declare static readonly purpleAccent: Readonly<PdfColor>;
  declare static readonly deepPurple: Readonly<PdfColor>;
  declare static readonly deepPurpleAccent: Readonly<PdfColor>;
  declare static readonly indigo: Readonly<PdfColor>;
  declare static readonly indigoAccent: Readonly<PdfColor>;
  declare static readonly blue: Readonly<PdfColor>;
  declare static readonly blueAccent: Readonly<PdfColor>;
  declare static readonly lightBlue: Readonly<PdfColor>;
  declare static readonly lightBlueAccent: Readonly<PdfColor>;
  declare static readonly cyan: Readonly<PdfColor>;
  declare static readonly cyanAccent: Readonly<PdfColor>;
  declare static readonly teal: Readonly<PdfColor>;
  declare static readonly tealAccent: Readonly<PdfColor>;
  declare static readonly green: Readonly<PdfColor>;
  declare static readonly greenAccent: Readonly<PdfColor>;
  declare static readonly lightGreen: Readonly<PdfColor>;
  declare static readonly lightGreenAccent: Readonly<PdfColor>;
  declare static readonly lime: Readonly<PdfColor>;
  declare static readonly limeAccent: Readonly<PdfColor>;
  declare static readonly yellow: Readonly<PdfColor>;
  declare static readonly yellowAccent: Readonly<PdfColor>;
  declare static readonly amber: Readonly<PdfColor>;
  declare static readonly amberAccent: Readonly<PdfColor>;
  declare static readonly orange: Readonly<PdfColor>;
  declare static readonly orangeAccent: Readonly<PdfColor>;
  declare static readonly deepOrange: Readonly<PdfColor>;
  declare static readonly deepOrangeAccent: Readonly<PdfColor>;
  declare static readonly brown: Readonly<PdfColor>;
  declare static readonly grey: Readonly<PdfColor>;
  declare static readonly blueGrey: Readonly<PdfColor>;
  declare static readonly primaries: readonly PdfColor[];
  declare static readonly accents: readonly PdfColor[];
  static getColor(index: number): PdfColor {
    if (!Number.isSafeInteger(index)) throw new RangeError('Color index must be a safe integer');
    const hue = ((index * 137.508) % 360 + 360) % 360;
    const color = new PdfColorHsv(hue, 1, 1);
    return (index / 3) % 2 === 0 ? PdfColor.fromRYB(color.red, color.green, color.blue) : color;
  }
}

// Families in upstream order. The first sixteen carry the four accent shades.
const families = 'red pink purple deepPurple indigo blue lightBlue cyan teal green lightGreen lime yellow amber orange deepOrange brown grey blueGrey'.split(' ');
const shades = '50 100 200 300 400 500 600 700 800 900 Accent100 Accent200 Accent400 Accent700'.split(' ');

// Six hex digits of RGB per colour (every entry is opaque), in declaration
// order: each family's shades, then white and black.
const packed = 'ffebeeffcdd2ef9a9ae57373ef5350f44336e53935d32f2fc62828b71c1cff8a80ff5252ff1744d50000fce4ecf8bbd0f48fb1f06292ec407ae91e63d81b60c2185bad1457880e4fff80abff4081f50057c51162f3e5f5e1bee7ce93d8ba68c8ab47bc9c27b08e24aa7b1fa26a1b9a4a148cea80fce040fbd500f9aa00ffede7f6d1c4e9b39ddb9575cd7e57c2673ab75e35b1512da84527a0311b92b388ff7c4dff651fff6200eae8eaf6c5cae99fa8da7986cb5c6bc03f51b53949ab303f9f2835931a237e8c9eff536dfe3d5afe304ffee3f2fdbbdefb90caf964b5f642a5f52196f31e88e51976d21565c00d47a182b1ff448aff2979ff2962ffe1f5feb3e5fc81d4fa4fc3f729b6f603a9f4039be50288d10277bd01579b80d8ff40c4ff00b0ff0091eae0f7fab2ebf280deea4dd0e126c6da00bcd400acc10097a700838f00606484ffff18ffff00e5ff00b8d4e0f2f1b2dfdb80cbc44db6ac26a69a00968800897b00796b00695c004d40a7ffeb64ffda1de9b600bfa5e8f5e9c8e6c9a5d6a781c78466bb6a4caf5043a047388e3c2e7d321b5e20b9f6ca69f0ae00e67600c853f1f8e9dcedc8c5e1a5aed5819ccc658bc34a7cb342689f38558b2f33691eccff90b2ff5976ff0364dd17f9fbe7f0f4c3e6ee9cdce775d4e157cddc39c0ca33afb42b9e9d24827717f4ff81eeff41c6ff00aeea00fffde7fff9c4fff59dfff176ffee58ffeb3bfdd835fbc02df9a825f57f17ffff8dffff00ffea00ffd600fff8e1ffecb3ffe082ffd54fffca28ffc107ffb300ffa000ff8f00ff6f00ffe57fffd740ffc400ffab00fff3e0ffe0b2ffcc80ffb74dffa726ff9800fb8c00f57c00ef6c00e65100ffd180ffab40ff9100ff6d00fbe9e7ffccbcffab91ff8a65ff7043ff5722f4511ee64a19d84315bf360cff9e80ff6e40ff3d00dd2c00efebe9d7ccc8bcaaa4a1887f8d6e637955486d4c415d40374e342e3e2723fafafaf5f5f5eeeeeee0e0e0bdbdbd9e9e9e757575616161424242212121eceff1cfd8dcb0bec590a4ae78909c607d8b546e7a455a6437474f263238ffffff000000';

const palette = PdfColors as unknown as Record<string, unknown>;
let offset = 0;
const define = (name: string): void => {
  palette[name] = Object.freeze(PdfColor.fromInt(0xff000000 + parseInt(packed.slice(offset, offset += 6), 16)));
};
families.forEach((family, index) => (index < 16 ? shades : shades.slice(0, 10)).forEach(shade => define(family + shade)));
define('white');
define('black');
families.forEach((family, index) => {
  palette[family] = palette[family + '500'];
  if (index < 16) palette[family + 'Accent'] = palette[family + 'Accent200'];
});
palette['primaries'] = Object.freeze(families.map(family => palette[family]));
palette['accents'] = Object.freeze(families.slice(0, 16).map(family => palette[family + 'Accent']));

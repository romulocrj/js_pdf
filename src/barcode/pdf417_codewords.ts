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
 *   - barcode/lib/src/pdf417_codewords.dart
 *
 * The PDF417 cluster tables and error-correction factors. The cluster values
 * are upstream's, packed into strings (see `codewords`).
 * Upstream's snake_case top-level constants are renamed to camelCase to match
 * this repository's conventions; the values are untouched.
 *
 */



export const startWord = 0x1fea8;
export const stopWord = 0x3fa29;

export const paddingCodeword = 900;

// SIZE: the three clusters of 929 bar/space patterns are packed as three
// base-64 digits per 17-bit codeword (`A`-`Z`, `a`-`z`, `0`-`9`, `+`, `/`)
// instead of 2,787 numeric literals, saving about 10 KB of minified output.
// The decoded values are those of upstream; test/static_tables.test.mjs
// fingerprints them.
const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const packedClusters = [
  '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'
];

export const codewords: readonly (readonly number[])[] = packedClusters.map(packed => {
  const cluster: number[] = [];
  for (let index = 0; index < packed.length; index += 3) {
    cluster.push(
      digits.indexOf(packed[index]!) << 12
      | digits.indexOf(packed[index + 1]!) << 6
      | digits.indexOf(packed[index + 2]!)
    );
  }
  return cluster;
});

export const correctionFactors: readonly (readonly number[])[] = [
  // Level 0
  [27, 917],

  // Level 1
  [522, 568, 723, 809],

  // Level 2
  [237, 308, 436, 284, 646, 653, 428, 379],

  // Level 3
  [
    274, 562, 232, 755, 599, 524, 801, 132, 295, 116, 442, 428, 295, 42, //
    176, 65,
  ],

  // Level 4
  [
    361, 575, 922, 525, 176, 586, 640, 321, 536, 742, 677, 742, 687, //
    284, 193, 517, 273, 494, 263, 147, 593, 800, 571, 320, 803, 133, //
    231, 390, 685, 330, 63, 410,
  ],

  // Level 5
  [
    539, 422, 6, 93, 862, 771, 453, 106, 610, 287, 107, 505, 733, 877, //
    381, 612, 723, 476, 462, 172, 430, 609, 858, 822, 543, 376, 511, //
    400, 672, 762, 283, 184, 440, 35, 519, 31, 460, 594, 225, 535, 517, //
    352, 605, 158, 651, 201, 488, 502, 648, 733, 717, 83, 404, 97, 280, //
    771, 840, 629, 4, 381, 843, 623, 264, 543,
  ],

  // Level 6
  [
    521, 310, 864, 547, 858, 580, 296, 379, 53, 779, 897, 444, 400, 925, //
    749, 415, 822, 93, 217, 208, 928, 244, 583, 620, 246, 148, 447, 631, //
    292, 908, 490, 704, 516, 258, 457, 907, 594, 723, 674, 292, 272, 96, //
    684, 432, 686, 606, 860, 569, 193, 219, 129, 186, 236, 287, 192, //
    775, 278, 173, 40, 379, 712, 463, 646, 776, 171, 491, 297, 763, 156, //
    732, 95, 270, 447, 90, 507, 48, 228, 821, 808, 898, 784, 663, 627, //
    378, 382, 262, 380, 602, 754, 336, 89, 614, 87, 432, 670, 616, 157, //
    374, 242, 726, 600, 269, 375, 898, 845, 454, 354, 130, 814, 587, //
    804, 34, 211, 330, 539, 297, 827, 865, 37, 517, 834, 315, 550, 86, //
    801, 4, 108, 539,
  ],

  // Level 7
  [
    524, 894, 75, 766, 882, 857, 74, 204, 82, 586, 708, 250, 905, 786, //
    138, 720, 858, 194, 311, 913, 275, 190, 375, 850, 438, 733, 194, //
    280, 201, 280, 828, 757, 710, 814, 919, 89, 68, 569, 11, 204, 796, //
    605, 540, 913, 801, 700, 799, 137, 439, 418, 592, 668, 353, 859, //
    370, 694, 325, 240, 216, 257, 284, 549, 209, 884, 315, 70, 329, 793, //
    490, 274, 877, 162, 749, 812, 684, 461, 334, 376, 849, 521, 307, //
    291, 803, 712, 19, 358, 399, 908, 103, 511, 51, 8, 517, 225, 289, //
    470, 637, 731, 66, 255, 917, 269, 463, 830, 730, 433, 848, 585, 136, //
    538, 906, 90, 2, 290, 743, 199, 655, 903, 329, 49, 802, 580, 355, //
    588, 188, 462, 10, 134, 628, 320, 479, 130, 739, 71, 263, 318, 374, //
    601, 192, 605, 142, 673, 687, 234, 722, 384, 177, 752, 607, 640, //
    455, 193, 689, 707, 805, 641, 48, 60, 732, 621, 895, 544, 261, 852, //
    655, 309, 697, 755, 756, 60, 231, 773, 434, 421, 726, 528, 503, 118, //
    49, 795, 32, 144, 500, 238, 836, 394, 280, 566, 319, 9, 647, 550, //
    73, 914, 342, 126, 32, 681, 331, 792, 620, 60, 609, 441, 180, 791, //
    893, 754, 605, 383, 228, 749, 760, 213, 54, 297, 134, 54, 834, 299, //
    922, 191, 910, 532, 609, 829, 189, 20, 167, 29, 872, 449, 83, 402, //
    41, 656, 505, 579, 481, 173, 404, 251, 688, 95, 497, 555, 642, 543, //
    307, 159, 924, 558, 648, 55, 497, 10,
  ],

  // Level 8
  [
    352, 77, 373, 504, 35, 599, 428, 207, 409, 574, 118, 498, 285, 380, //
    350, 492, 197, 265, 920, 155, 914, 299, 229, 643, 294, 871, 306, 88, //
    87, 193, 352, 781, 846, 75, 327, 520, 435, 543, 203, 666, 249, 346, //
    781, 621, 640, 268, 794, 534, 539, 781, 408, 390, 644, 102, 476, //
    499, 290, 632, 545, 37, 858, 916, 552, 41, 542, 289, 122, 272, 383, //
    800, 485, 98, 752, 472, 761, 107, 784, 860, 658, 741, 290, 204, 681, //
    407, 855, 85, 99, 62, 482, 180, 20, 297, 451, 593, 913, 142, 808, //
    684, 287, 536, 561, 76, 653, 899, 729, 567, 744, 390, 513, 192, 516, //
    258, 240, 518, 794, 395, 768, 848, 51, 610, 384, 168, 190, 826, 328, //
    596, 786, 303, 570, 381, 415, 641, 156, 237, 151, 429, 531, 207, //
    676, 710, 89, 168, 304, 402, 40, 708, 575, 162, 864, 229, 65, 861, //
    841, 512, 164, 477, 221, 92, 358, 785, 288, 357, 850, 836, 827, 736, //
    707, 94, 8, 494, 114, 521, 2, 499, 851, 543, 152, 729, 771, 95, 248, //
    361, 578, 323, 856, 797, 289, 51, 684, 466, 533, 820, 669, 45, 902, //
    452, 167, 342, 244, 173, 35, 463, 651, 51, 699, 591, 452, 578, 37, //
    124, 298, 332, 552, 43, 427, 119, 662, 777, 475, 850, 764, 364, 578, //
    911, 283, 711, 472, 420, 245, 288, 594, 394, 511, 327, 589, 777, //
    699, 688, 43, 408, 842, 383, 721, 521, 560, 644, 714, 559, 62, 145, //
    873, 663, 713, 159, 672, 729, 624, 59, 193, 417, 158, 209, 563, 564, //
    343, 693, 109, 608, 563, 365, 181, 772, 677, 310, 248, 353, 708, //
    410, 579, 870, 617, 841, 632, 860, 289, 536, 35, 777, 618, 586, 424, //
    833, 77, 597, 346, 269, 757, 632, 695, 751, 331, 247, 184, 45, 787, //
    680, 18, 66, 407, 369, 54, 492, 228, 613, 830, 922, 437, 519, 644, //
    905, 789, 420, 305, 441, 207, 300, 892, 827, 141, 537, 381, 662, //
    513, 56, 252, 341, 242, 797, 838, 837, 720, 224, 307, 631, 61, 87, //
    560, 310, 756, 665, 397, 808, 851, 309, 473, 795, 378, 31, 647, 915, //
    459, 806, 590, 731, 425, 216, 548, 249, 321, 881, 699, 535, 673, //
    782, 210, 815, 905, 303, 843, 922, 281, 73, 469, 791, 660, 162, 498, //
    308, 155, 422, 907, 817, 187, 62, 16, 425, 535, 336, 286, 437, 375, //
    273, 610, 296, 183, 923, 116, 667, 751, 353, 62, 366, 691, 379, 687, //
    842, 37, 357, 720, 742, 330, 5, 39, 923, 311, 424, 242, 749, 321, //
    54, 669, 316, 342, 299, 534, 105, 667, 488, 640, 672, 576, 540, 316, //
    486, 721, 610, 46, 656, 447, 171, 616, 464, 190, 531, 297, 321, 762, //
    752, 533, 175, 134, 14, 381, 433, 717, 45, 111, 20, 596, 284, 736, //
    138, 646, 411, 877, 669, 141, 919, 45, 780, 407, 164, 332, 899, 165, //
    726, 600, 325, 498, 655, 357, 752, 768, 223, 849, 647, 63, 310, 863, //
    251, 366, 304, 282, 738, 675, 410, 389, 244, 31, 121, 303, 263,
  ],
];

export const latchToText = 900;
export const latchToBytePadded = 901;
export const latchToNumeric = 902;
export const latchToByte = 924;
export const shiftToByte = 913;

export const minNumericCount = 13;

export const mixedMap = new Map<number, number>([
  [48, 0], [49, 1], [50, 2], [51, 3], [52, 4], [53, 5], [54, 6], [55, 7],
  [56, 8], [57, 9], [38, 10], [13, 11], [9, 12], [44, 13], [58, 14],
  [35, 15], [45, 16], [46, 17], [36, 18], [47, 19], [43, 20], [37, 21],
  [42, 22], [61, 23], [94, 24], [32, 26]
]);

export const punctMap = new Map<number, number>([
  [59, 0], [60, 1], [62, 2], [64, 3], [91, 4], [92, 5], [93, 6], [95, 7],
  [96, 8], [126, 9], [33, 10], [13, 11], [9, 12], [44, 13], [58, 14],
  [10, 15], [45, 16], [46, 17], [36, 18], [47, 19], [34, 20], [124, 21],
  [42, 22], [40, 23], [41, 24], [63, 25], [123, 26], [125, 27], [39, 28]
]);

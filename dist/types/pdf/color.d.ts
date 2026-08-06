/** A normalized DeviceRGB triple, each component in 0..1. */
export type Rgb = readonly [number, number, number];
/** `#RRGGBB`, or an `[r, g, b]` triple already in 0..1. */
export type ColorInput = string | Rgb;
/**
 * Upstream models color as the `PdfColor` value type with CMYK and HSL
 * subclasses; the port keeps DeviceRGB as the only color space.
 */
export declare function normalizeColor(value: ColorInput | null | undefined, fallback?: Rgb): Rgb;
/** Upstream `PdfColor.luminance`: the WCAG relative luminance of a color. */
export declare function colorLuminance(color: ColorInput): number;
/**
 * Upstream `PdfColor.isLight`, quirk included: the test is
 * `(luminance + .05)² > .15`, which puts the cut at a luminance near .337 and
 * not the .5 the name suggests. Chart labels choose their color with this, so
 * the threshold is rendered output, not taste.
 */
export declare function isLightColor(color: ColorInput): boolean;
/** The `rg` (non-stroking) or `RG` (stroking) color operator. */
export declare function colorOperator(color: ColorInput, stroke?: boolean): string;

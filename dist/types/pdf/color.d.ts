/** A normalized DeviceRGB triple, each component in 0..1. */
export type Rgb = readonly [number, number, number];
/** `#RRGGBB`, or an `[r, g, b]` triple already in 0..1. */
export type ColorInput = string | Rgb;
/**
 * Upstream models color as the `PdfColor` value type with CMYK and HSL
 * subclasses; the port keeps DeviceRGB as the only color space.
 */
export declare function normalizeColor(value: ColorInput | null | undefined, fallback?: Rgb): Rgb;
/** The `rg` (non-stroking) or `RG` (stroking) color operator. */
export declare function colorOperator(color: ColorInput, stroke?: boolean): string;

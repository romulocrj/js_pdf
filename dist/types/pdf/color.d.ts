/** A normalized DeviceRGB triple, each component in 0..1. */
export type Rgb = readonly [number, number, number];
/** A color value, `#RRGGBB`, or an `[r, g, b]` triple already in 0..1. */
export type ColorInput = string | Rgb | PdfColor;
/** Convert inputs to RGB for algorithms whose color space is explicitly RGB. */
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
/** Select the RGB, gray or CMYK fill/stroke operator without applying alpha. */
export declare function colorOperator(color: ColorInput, stroke?: boolean): string;
/** RGB color value; alpha is retained for composition, not applied by color operators. */
export declare class PdfColor {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
    readonly alpha: number;
    constructor(red: number, green: number, blue: number, alpha?: number);
    static fromInt(color: number): PdfColor;
    static fromHex(color: string): PdfColor;
    static fromRYB(red: number, yellow: number, blue: number, alpha?: number): PdfColor;
    withAlpha(alpha: number): PdfColor;
    withRed(red: number): PdfColor;
    withGreen(green: number): PdfColor;
    withBlue(blue: number): PdfColor;
    withValues(alpha: number | null, red: number | null, green: number | null, blue: number | null): PdfColor;
    toInt(): number;
    toHex(): string;
    toCmyk(): PdfColorCmyk;
    toHsv(): PdfColorHsv;
    toHsl(): PdfColorHsl;
    get luminance(): number;
    get isLight(): boolean;
    get isDark(): boolean;
    shade(strength: number): PdfColor;
    get complementary(): PdfColorHsv;
    get monochromatic(): readonly PdfColorHsv[];
    get splitcomplementary(): readonly PdfColorHsv[];
    get tetradic(): readonly PdfColorHsv[];
    get triadic(): readonly PdfColorHsv[];
    get analagous(): readonly PdfColorHsv[];
    flatten({ background }?: {
        readonly background?: PdfColor;
    }): PdfColor;
    equals(other: unknown): boolean;
    get hashCode(): number;
    toString(): string;
}
/** A DeviceGray color; unlike RGB gray it emits one component. */
export declare class PdfColorGrey extends PdfColor {
    constructor(color: number, alpha?: number);
}
export declare class PdfColorCmyk extends PdfColor {
    readonly cyan: number;
    readonly magenta: number;
    readonly yellow: number;
    readonly black: number;
    constructor(cyan: number, magenta: number, yellow: number, black: number, alpha?: number);
    static fromRgb(red: number, green: number, blue: number, alpha?: number): PdfColorCmyk;
    toCmyk(): PdfColorCmyk;
    toString(): string;
}
export declare class PdfColorHsv extends PdfColor {
    readonly hue: number;
    readonly saturation: number;
    readonly value: number;
    constructor(hue: number, saturation: number, value: number, alpha?: number);
    static fromRgb(red: number, green: number, blue: number, alpha?: number): PdfColorHsv;
    withHue(hue: number): PdfColorHsv;
    withSaturation(saturation: number): PdfColorHsv;
    withValue(value: number): PdfColorHsv;
    toHsv(): PdfColorHsv;
    get complementary(): PdfColorHsv;
    get monochromatic(): readonly PdfColorHsv[];
    get splitcomplementary(): readonly PdfColorHsv[];
    get triadic(): readonly PdfColorHsv[];
    get tetradic(): readonly PdfColorHsv[];
    get analagous(): readonly PdfColorHsv[];
    toString(): string;
}
export declare class PdfColorHsl extends PdfColor {
    readonly hue: number;
    readonly saturation: number;
    readonly lightness: number;
    constructor(hue: number, saturation: number, lightness: number, alpha?: number);
    static fromRgb(red: number, green: number, blue: number, alpha?: number): PdfColorHsl;
    withHue(hue: number): PdfColorHsl;
    withSaturation(saturation: number): PdfColorHsl;
    withLightness(lightness: number): PdfColorHsl;
    toHsl(): PdfColorHsl;
    toString(): string;
}
/** Keep color-space values through solid painting; legacy inputs stay RGB triples. */
export type PaintColor = Rgb | PdfColor;
export declare function normalizePaintColor(value: ColorInput | null | undefined): PaintColor;
export declare function colorComponents(color: ColorInput): readonly number[];
/** Compare painted components without collapsing distinct device spaces. */
export declare function samePaintColor(left: ColorInput, right: ColorInput): boolean;

import { PdfDict } from '../format/dict.ts';
import type { Rgb } from '../color.ts';
import type { PdfFont } from '../font/font.ts';
import type { PdfImage } from './image.ts';
import type { PdfXObject } from './xobject.ts';
import type { PdfRect } from '../rect.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';
export interface PdfUrlLinkAnnotation {
    readonly kind: 'url';
    readonly rect: PdfRect;
    readonly destination: string;
}
export interface PdfNamedLinkAnnotation {
    readonly kind: 'destination';
    readonly rect: PdfRect;
    readonly destination: string;
}
export type PdfLinkAnnotation = PdfUrlLinkAnnotation | PdfNamedLinkAnnotation;
export type PdfGeometricAnnotationKind = 'square' | 'circle' | 'polygon' | 'polyline' | 'ink';
export interface PdfGeometricAnnotation {
    readonly kind: 'geometric';
    readonly shape: PdfGeometricAnnotationKind;
    readonly rect: PdfRect;
    readonly points?: readonly {
        readonly x: number;
        readonly y: number;
    }[];
    readonly inkList?: readonly (readonly {
        readonly x: number;
        readonly y: number;
    }[])[];
    readonly color?: Rgb | null;
    readonly interiorColor?: Rgb | null;
    readonly borderWidth?: number;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly content?: string | null;
    readonly date?: string | null;
}
export type PdfFormFieldType = 'text' | 'choice' | 'checkbox' | 'button';
export type PdfFormHighlighting = 'none' | 'invert' | 'outline' | 'push' | 'toggle';
export type PdfTextFieldAlign = 'left' | 'center' | 'right';
export interface PdfFormAppearance {
    readonly width: number;
    readonly height: number;
    readonly content: string;
    readonly fonts: ReadonlyMap<PdfFont, string>;
    readonly graphicStates: ReadonlyMap<string, PdfDict>;
    readonly patterns: ReadonlyMap<string, PdfDict>;
    readonly shadings: ReadonlyMap<string, PdfDict>;
    readonly images: ReadonlyMap<PdfImage, string>;
}
export interface PdfFormAppearances {
    readonly normal?: PdfFormAppearance;
    readonly normalStates?: ReadonlyMap<string, PdfFormAppearance>;
    readonly down?: PdfFormAppearance;
    readonly rollover?: PdfFormAppearance;
}
export interface PdfResolvedFormAppearances {
    readonly normal?: PdfXObject;
    readonly normalStates?: ReadonlyMap<string, PdfXObject>;
    readonly down?: PdfXObject;
    readonly rollover?: PdfXObject;
}
export interface PdfFormFieldAnnotation {
    readonly kind: 'form';
    readonly fieldType: PdfFormFieldType;
    readonly rect: PdfRect;
    readonly name: string;
    readonly value?: string | null;
    readonly defaultValue?: string | null;
    readonly items?: readonly string[];
    readonly fieldFlags?: number;
    readonly maxLength?: number | null;
    readonly alternateName?: string | null;
    readonly mappingName?: string | null;
    readonly textAlign?: PdfTextFieldAlign | null;
    readonly borderColor?: Rgb | null;
    readonly backgroundColor?: Rgb | null;
    readonly highlighting?: PdfFormHighlighting | null;
    readonly fontSize?: number;
    readonly font?: PdfFont;
    readonly textColor?: Rgb;
    readonly appearances?: PdfFormAppearances;
}
export type PdfAnnotationSpec = PdfLinkAnnotation | PdfFormFieldAnnotation | PdfGeometricAnnotation;
/** One invisible clickable rectangle in a page's `/Annots` array. */
export declare class PdfAnnotation extends PdfObject<PdfDict> {
    readonly page: PdfPage;
    readonly annotation: PdfAnnotationSpec;
    readonly defaultAppearanceName: string | null;
    readonly appearances: PdfResolvedFormAppearances | null;
    constructor(document: PdfObjectRegistry, page: PdfPage, annotation: PdfAnnotationSpec, defaultAppearanceName?: string | null, appearances?: PdfResolvedFormAppearances | null);
    prepare(): void;
    private prepareGeometric;
    private prepareForm;
}

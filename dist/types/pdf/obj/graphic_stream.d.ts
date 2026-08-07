import type { PdfDataType } from '../format/base.ts';
import { PdfDict } from '../format/dict.ts';
import type { PdfObjectBase } from '../format/object_base.ts';
import { PdfObject } from './object.ts';
/** A `/Resources` entry always points at an indirect object, never a value. */
export type PdfResource = PdfObjectBase<PdfDataType>;
export declare class PdfGraphicStream extends PdfObject<PdfDict> {
    /**
     * Resource name to object, for each `/Resources` sub-dictionary.
     *
     * The name is chosen by whoever wrote the content stream, because the stream
     * has already spelled it out — `/F1 12 Tf` is only meaningful if `/Font` maps
     * `/F1` to the same object. Upstream instead derives every name from the
     * object's serial number, which it can do because a font there is an indirect
     * object from the moment it is created; in the port a page is rendered to
     * operators before any document exists. See `PdfCanvas.addFont`.
     */
    readonly fonts: Map<string, PdfResource>;
    readonly xObjects: Map<string, PdfResource>;
    /**
     * `/ExtGState` holds dictionaries, not references — the one place a resource
     * sub-dictionary maps a name to a value rather than an object. Upstream points
     * every stream at a single document-wide `PdfGraphicStates` object; the port
     * writes each page's states inline, for the same reason names are page-local.
     */
    readonly graphicStates: Map<string, PdfDict>;
    readonly patterns: Map<string, PdfDict>;
    readonly shadings: Map<string, PdfDict>;
    /** Register a font under the name the content stream used. First one wins. */
    addFont(name: string, font: PdfResource): void;
    addXObject(name: string, xObject: PdfResource): void;
    addGraphicState(name: string, state: PdfDict): void;
    addPattern(name: string, pattern: PdfDict): void;
    addShading(name: string, shading: PdfDict): void;
    /**
     * The `/Resources` value, or null when this stream referred to nothing.
     *
     * Returned rather than assigned so a subclass decides where the key lands:
     * `PdfDict` emits in insertion order, so key order is part of the byte output.
     */
    protected resources(): PdfDict | null;
    prepare(): void;
}

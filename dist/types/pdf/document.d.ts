import type { PdfDataType } from './format/base.ts';
import type { PdfObjectBase } from './format/object_base.ts';
import { PdfDict } from './format/dict.ts';
import { PdfXrefTable } from './format/xref.ts';
import type { PdfFont } from './font/font.ts';
import { PdfCatalog } from './obj/catalog.ts';
import { PdfInfo } from './obj/info.ts';
import type { DocumentMetadata } from './obj/info.ts';
import { PdfObject } from './obj/object.ts';
import { PdfPage } from './obj/page.ts';
import { PdfPageList } from './obj/page_list.ts';
import type { PdfOutlineStyle } from './obj/outline.ts';
import type { PageSize } from './page_format.ts';
import type { Rgb } from './color.ts';
export type { DocumentMetadata } from './obj/info.ts';
/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
    readonly format: PageSize;
    readonly content: string;
    /**
     * The fonts `content` drew with, mapped to the `/F…` names it wrote for them.
     * `PdfCanvas` chose the names; this is what turns them into `/Resources`.
     */
    readonly fonts: ReadonlyMap<PdfFont, string>;
    /** The `/ExtGState` dictionaries `content` selected, by the name it wrote. */
    readonly graphicStates?: ReadonlyMap<string, PdfDict>;
    /** The direct shading-pattern dictionaries `content` selected. */
    readonly patterns?: ReadonlyMap<string, PdfDict>;
}
export interface SerializedOutline {
    readonly title: string;
    readonly level: number;
    readonly anchor: string;
    /** One-based physical page number. */
    readonly page: number;
    /** Destination coordinate in PDF bottom-left space. */
    readonly y: number;
    readonly color?: Rgb | null;
    readonly style?: PdfOutlineStyle;
}
export type PdfPageMode = 'none' | 'outlines';
/**
 * Owns the objects that make up a file, and writes them.
 *
 * Serial numbers are assigned in creation order, and objects are laid out in
 * serial order, so creation order is what determines the file layout. The
 * catalog is numbered first because it is the document's entry point; the page
 * list gets its serial next even though the catalog needs a reference to it,
 * which works because references are resolved in `prepare()`, after every object
 * exists.
 */
export declare class PdfDocument {
    private serial;
    readonly xref: PdfXrefTable;
    readonly pageList: PdfPageList;
    readonly catalog: PdfCatalog;
    readonly info: PdfInfo;
    /**
     * One indirect object per distinct font, created on first use. Keyed by
     * identity, matching upstream: two `PdfType1Font.helvetica()` instances are
     * two fonts, and phase 1 will need that — two subsets of the same TTF are not
     * interchangeable either.
     */
    private readonly fontObjects;
    constructor(metadata: DocumentMetadata);
    get objects(): readonly PdfObjectBase<PdfDataType>[];
    genSerial(): number;
    register(object: PdfObjectBase<PdfDataType>): void;
    /**
     * The indirect object holding `font`'s dictionary, created once per document.
     *
     * An embedded font builds its subset, descriptor and `/ToUnicode` CMap inside
     * `resourceDict`, so this must not run until every page has been rendered —
     * which is exactly when `addPage` is called.
     */
    fontObject(font: PdfFont): PdfObject<PdfDict>;
    /**
     * Append a page. Its fonts and content stream are created first so they are
     * numbered before the page that references them, keeping the file in
     * dependency order.
     *
     * `fonts` maps each font the content stream drew with to the resource name it
     * wrote for that font — see `PdfCanvas.addFont`. A page that drew no text
     * passes nothing and gets no `/Resources` at all, as upstream does.
     */
    addPage(format: PageSize, content: string, fonts?: ReadonlyMap<PdfFont, string>, graphicStates?: ReadonlyMap<string, PdfDict>, patterns?: ReadonlyMap<string, PdfDict>): PdfPage;
    addNavigation(outlines: readonly SerializedOutline[], pageMode: PdfPageMode): void;
    save(): Uint8Array;
}
/** Build a document from already-rendered pages and write it. */
export declare function serializePdf(pages: readonly SerializedPage[], metadata: DocumentMetadata, outlines?: readonly SerializedOutline[], pageMode?: PdfPageMode): Uint8Array;

/** A text or CDATA run. Whitespace is kept; SVG's own rules decide what matters. */
export declare class XmlText {
    readonly value: string;
    constructor(value: string);
}
export type XmlNode = XmlElement | XmlText;
/**
 * A qualified name, split the way the `xml` package splits it so
 * `element.name.local` reads identically to the Dart it was ported from.
 */
export interface XmlName {
    /** As written, prefix included. */
    readonly qualified: string;
    readonly local: string;
    readonly prefix: string | null;
}
export declare class XmlElement {
    readonly name: XmlName;
    readonly children: XmlNode[];
    /** Keyed by the qualified name exactly as the document wrote it. */
    readonly attributes: Map<string, string>;
    /**
     * Prefix to URI, own declarations merged over the inherited ones. Resolved at
     * parse time rather than walked at lookup time, because `getAttribute` with a
     * namespace is called once per `<use>` element and the map is tiny.
     */
    readonly namespaces: ReadonlyMap<string, string>;
    parent: XmlElement | null;
    constructor(qualifiedName: string, namespaces: ReadonlyMap<string, string>);
    /**
     * The value of `name`, or null.
     *
     * Without `namespace`, `name` is matched against the qualified name as
     * written — which is what an unprefixed SVG attribute like `fill` needs.
     * With one, any prefix bound to that URI matches, so `xlink:href` is found
     * whichever prefix the document happened to declare for it.
     */
    getAttribute(name: string, namespace?: string): string | null;
    /**
     * Upstream's `SvgParser.convertStyle` flattens a `style` attribute into real
     * attributes by calling this, so the tree is mutable by design.
     */
    setAttribute(name: string, value: string): void;
    /** Child elements, skipping text — the `whereType<XmlElement>()` idiom. */
    get elements(): XmlElement[];
    /** Every element below this one, in document order. */
    get descendants(): XmlElement[];
    /** Concatenated text of this element and everything below it. */
    get text(): string;
    findElements(localName: string): XmlElement[];
}
export declare class XmlDocument {
    readonly rootElement: XmlElement;
    constructor(rootElement: XmlElement);
    static parse(source: string): XmlDocument;
}
export declare function parseXml(source: string): XmlDocument;

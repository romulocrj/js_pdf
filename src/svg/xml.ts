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
 *   - pdf/lib/src/svg/parser.dart
 *   - pdf/lib/src/widgets/svg.dart
 *
 * A minimal XML reader.
 *
 * There is no upstream file to translate: dart_pdf calls `XmlDocument.parse`
 * from the `xml` package, and the port has no runtime dependencies and no
 * `DOMParser` — ClearScript provides neither a DOM nor a module loader. What is
 * reproduced is therefore the *interface* `svg/parser.dart` and
 * `widgets/svg.dart` consume, named after their Dart counterparts so the SVG
 * modules read the same in both languages: `XmlDocument.parse`, `rootElement`,
 * `getAttribute(name, namespace)`, `setAttribute`, `children`, `descendants`
 * and `name.local`.
 *
 * Scope is what SVG needs and no more: elements, attributes, text, CDATA,
 * comments, processing instructions, the five predefined entities plus numeric
 * character references, and namespace declarations. Deliberately absent, and
 * each of them a silent no-op rather than an error, because an SVG exporter may
 * emit them and none affects rendering:
 *
 *   - The internal DTD subset is skipped, so a custom `<!ENTITY>` is not
 *     expanded. An SVG that relies on one renders with the raw reference.
 *   - Attribute-value normalization: a newline inside an attribute stays a
 *     newline instead of collapsing to a space. Every SVG attribute the port
 *     reads is then split on whitespace anyway.
 *
 * RUNTIME SCOPE: no DTD validation, no XInclude and no `xml:space`. XInclude
 * would require external resource loading, which `src/` deliberately cannot do.
 */

/** A text or CDATA run. Whitespace is kept; SVG's own rules decide what matters. */
export class XmlText {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
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

function splitName(qualified: string): XmlName {
  const colon = qualified.indexOf(':');
  if (colon < 0) {
    return { qualified, local: qualified, prefix: null };
  }
  return {
    qualified,
    local: qualified.slice(colon + 1),
    prefix: qualified.slice(0, colon)
  };
}

export class XmlElement {
  readonly name: XmlName;
  readonly children: XmlNode[] = [];

  /** Keyed by the qualified name exactly as the document wrote it. */
  readonly attributes = new Map<string, string>();

  /**
   * Prefix to URI, own declarations merged over the inherited ones. Resolved at
   * parse time rather than walked at lookup time, because `getAttribute` with a
   * namespace is called once per `<use>` element and the map is tiny.
   */
  readonly namespaces: ReadonlyMap<string, string>;

  parent: XmlElement | null = null;

  constructor(qualifiedName: string, namespaces: ReadonlyMap<string, string>) {
    this.name = splitName(qualifiedName);
    this.namespaces = namespaces;
  }

  /**
   * The value of `name`, or null.
   *
   * Without `namespace`, `name` is matched against the qualified name as
   * written — which is what an unprefixed SVG attribute like `fill` needs.
   * With one, any prefix bound to that URI matches, so `xlink:href` is found
   * whichever prefix the document happened to declare for it.
   */
  getAttribute(name: string, namespace?: string): string | null {
    if (namespace === undefined) {
      return this.attributes.get(name) ?? null;
    }

    for (const [key, value] of this.attributes) {
      const attributeName = splitName(key);
      if (attributeName.local !== name || attributeName.prefix === null) {
        continue;
      }
      if (this.namespaces.get(attributeName.prefix) === namespace) {
        return value;
      }
    }

    return null;
  }

  /**
   * Upstream's `SvgParser.convertStyle` flattens a `style` attribute into real
   * attributes by calling this, so the tree is mutable by design.
   */
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  /** Child elements, skipping text — the `whereType<XmlElement>()` idiom. */
  get elements(): XmlElement[] {
    return this.children.filter((node): node is XmlElement => node instanceof XmlElement);
  }

  /** Every element below this one, in document order. */
  get descendants(): XmlElement[] {
    const found: XmlElement[] = [];
    const walk = (element: XmlElement): void => {
      for (const child of element.elements) {
        found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }

  /** Concatenated text of this element and everything below it. */
  get text(): string {
    let output = '';
    for (const child of this.children) {
      output += child instanceof XmlText ? child.value : child.text;
    }
    return output;
  }

  findElements(localName: string): XmlElement[] {
    return this.elements.filter(element => element.name.local === localName);
  }
}

export class XmlDocument {
  readonly rootElement: XmlElement;

  constructor(rootElement: XmlElement) {
    this.rootElement = rootElement;
  }

  static parse(source: string): XmlDocument {
    return parseXml(source);
  }
}

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
});

/** Line and column, so a broken file names where it broke. */
function describePosition(source: string, index: number): string {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return `line ${line}, column ${column}`;
}

class XmlParser {
  private readonly source: string;
  private index = 0;

  constructor(source: string) {
    this.source = source;
  }

  private fail(message: string, at = this.index): never {
    throw new SyntaxError(`${message} at ${describePosition(this.source, at)}`);
  }

  private get atEnd(): boolean {
    return this.index >= this.source.length;
  }

  private skipWhitespace(): void {
    while (!this.atEnd && /\s/.test(this.source[this.index]!)) {
      this.index++;
    }
  }

  private startsWith(text: string): boolean {
    return this.source.startsWith(text, this.index);
  }

  /** Advance past `text`, or report where it should have been. */
  private expect(text: string): void {
    if (!this.startsWith(text)) {
      this.fail(`Expected "${text}"`);
    }
    this.index += text.length;
  }

  /** Skip to just past `terminator`; an unterminated construct is an error. */
  private skipUntil(terminator: string, what: string): void {
    const start = this.index;
    const end = this.source.indexOf(terminator, this.index);
    if (end < 0) {
      this.fail(`Unterminated ${what}`, start);
    }
    this.index = end + terminator.length;
  }

  /**
   * `<!DOCTYPE …>`, including an internal subset in brackets. Skipped whole:
   * the port does not expand custom entities, and an SVG that needs one is
   * outside what a renderer can be expected to do without a validating reader.
   */
  private skipDoctype(): void {
    this.index += '<!DOCTYPE'.length;
    let depth = 0;
    while (!this.atEnd) {
      const character = this.source[this.index]!;
      if (character === '[') depth++;
      else if (character === ']') depth--;
      else if (character === '>' && depth <= 0) {
        this.index++;
        return;
      }
      this.index++;
    }
    this.fail('Unterminated DOCTYPE');
  }

  /** Everything that may appear before, between or after the root element. */
  private skipMisc(): boolean {
    let skipped = false;
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith('<?')) {
        this.skipUntil('?>', 'processing instruction');
      } else if (this.startsWith('<!--')) {
        this.skipUntil('-->', 'comment');
      } else if (this.startsWith('<!DOCTYPE')) {
        this.skipDoctype();
      } else {
        return skipped;
      }
      skipped = true;
    }
  }

  private readName(): string {
    const start = this.index;
    while (!this.atEnd && /[^\s/>=]/.test(this.source[this.index]!)) {
      this.index++;
    }
    if (this.index === start) {
      this.fail('Expected a name');
    }
    return this.source.slice(start, this.index);
  }

  /**
   * Replace entity and character references.
   *
   * An unknown entity is left as written rather than rejected: SVG exporters
   * emit references the port cannot resolve without the DTD subset it skips,
   * and dropping the text would lose more than keeping it raw.
   */
  private decode(text: string): string {
    if (!text.includes('&')) {
      return text;
    }

    return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[^;\s&]+);/g, (match, reference: string) => {
      if (reference.startsWith('#x') || reference.startsWith('#X')) {
        const code = Number.parseInt(reference.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (reference.startsWith('#')) {
        const code = Number.parseInt(reference.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return PREDEFINED_ENTITIES[reference] ?? match;
    });
  }

  private readAttributeValue(): string {
    const quote = this.source[this.index];
    if (quote !== '"' && quote !== "'") {
      this.fail('Attribute value must be quoted');
    }
    this.index++;

    const start = this.index;
    const end = this.source.indexOf(quote, this.index);
    if (end < 0) {
      this.fail('Unterminated attribute value', start);
    }
    this.index = end + 1;
    return this.decode(this.source.slice(start, end));
  }

  /** Parse one element and everything inside it. */
  private parseElement(inherited: ReadonlyMap<string, string>): XmlElement {
    const openedAt = this.index;
    this.expect('<');
    const qualifiedName = this.readName();

    const attributes: [string, string][] = [];
    let selfClosing = false;

    for (;;) {
      this.skipWhitespace();
      if (this.atEnd) {
        this.fail(`Unterminated element <${qualifiedName}>`, openedAt);
      }

      if (this.startsWith('/>')) {
        this.index += 2;
        selfClosing = true;
        break;
      }

      if (this.startsWith('>')) {
        this.index++;
        break;
      }

      const attributeName = this.readName();
      this.skipWhitespace();
      this.expect('=');
      this.skipWhitespace();
      attributes.push([attributeName, this.readAttributeValue()]);
    }

    // Namespace declarations take effect on the element that carries them, so
    // they are resolved before the attributes are stored.
    let namespaces = inherited;
    const declarations = attributes.filter(
      ([name]) => name === 'xmlns' || name.startsWith('xmlns:')
    );
    if (declarations.length > 0) {
      const merged = new Map(inherited);
      for (const [name, value] of declarations) {
        merged.set(name === 'xmlns' ? '' : name.slice('xmlns:'.length), value);
      }
      namespaces = merged;
    }

    const element = new XmlElement(qualifiedName, namespaces);
    for (const [name, value] of attributes) {
      element.attributes.set(name, value);
    }

    if (selfClosing) {
      return element;
    }

    this.parseContent(element, qualifiedName, openedAt);
    return element;
  }

  private parseContent(element: XmlElement, qualifiedName: string, openedAt: number): void {
    let text = '';

    const flushText = (): void => {
      if (text.length > 0) {
        element.children.push(new XmlText(this.decode(text)));
        text = '';
      }
    };

    for (;;) {
      if (this.atEnd) {
        this.fail(`Unterminated element <${qualifiedName}>`, openedAt);
      }

      if (this.startsWith('</')) {
        flushText();
        this.index += 2;
        const closing = this.readName();
        if (closing !== qualifiedName) {
          this.fail(`Closing tag </${closing}> does not match <${qualifiedName}>`);
        }
        this.skipWhitespace();
        this.expect('>');
        return;
      }

      if (this.startsWith('<![CDATA[')) {
        // CDATA is text that skips entity decoding, so it is flushed on its own.
        flushText();
        const start = this.index + '<![CDATA['.length;
        const end = this.source.indexOf(']]>', start);
        if (end < 0) {
          this.fail('Unterminated CDATA section');
        }
        element.children.push(new XmlText(this.source.slice(start, end)));
        this.index = end + ']]>'.length;
        continue;
      }

      if (this.startsWith('<!--')) {
        flushText();
        this.skipUntil('-->', 'comment');
        continue;
      }

      if (this.startsWith('<?')) {
        flushText();
        this.skipUntil('?>', 'processing instruction');
        continue;
      }

      if (this.startsWith('<!DOCTYPE')) {
        flushText();
        this.skipDoctype();
        continue;
      }

      if (this.startsWith('<')) {
        flushText();
        const child = this.parseElement(element.namespaces);
        child.parent = element;
        element.children.push(child);
        continue;
      }

      text += this.source[this.index];
      this.index++;
    }
  }

  parseDocument(): XmlDocument {
    this.skipMisc();
    if (this.atEnd || !this.startsWith('<')) {
      this.fail('Document has no root element');
    }

    const root = this.parseElement(new Map());
    this.skipMisc();

    if (!this.atEnd) {
      this.fail('Content after the root element');
    }

    return new XmlDocument(root);
  }
}

export function parseXml(source: string): XmlDocument {
  if (typeof source !== 'string') {
    throw new TypeError('XML source must be a string');
  }
  return new XmlParser(source).parseDocument();
}

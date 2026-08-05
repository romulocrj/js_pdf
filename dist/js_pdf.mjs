/*
 * romulocrj/js_pdf — JavaScript port of DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 */

const PageFormat = Object.freeze({
  A4: Object.freeze({
    width: 595.28,
    height: 841.89
  }),
  LETTER: Object.freeze({
    width: 612,
    height: 792
  })
});

const DEFAULT_MARGIN = 40;

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  const rounded = Math.abs(value) < 1e-6 ? 0 : value;
  return Number(rounded.toFixed(4)).toString();
}

function normalizeColor(value, fallback = [ 0, 0, 0 ]) {
  if (value == null) return fallback;
  if (Array.isArray(value)) {
    const [r, g, b] = value;
    return [ clamp(Number(r), 0, 1), clamp(Number(g), 0, 1), clamp(Number(b), 0, 1) ];
  }
  if (typeof value === "string") {
    const hex = value.startsWith("#") ? value.slice(1) : value;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [ parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255 ];
    }
  }
  throw new TypeError("Color must be [r,g,b] with values from 0 to 1 or #RRGGBB");
}

function colorOperator(color, stroke = false) {
  const [r, g, b] = normalizeColor(color);
  return `${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} ${stroke ? "RG" : "rg"}`;
}

function normalizeInsets(value = 0) {
  if (typeof value === "number") {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  }
  return {
    top: Number(value.top ?? value.vertical ?? 0),
    right: Number(value.right ?? value.horizontal ?? 0),
    bottom: Number(value.bottom ?? value.vertical ?? 0),
    left: Number(value.left ?? value.horizontal ?? 0)
  };
}

class Widget {}

class Container extends Widget {
  constructor({child = null, width = null, height = null, padding = 0, margin = 0, background = null, borderColor = null, borderWidth = 1} = {}) {
    super();
    this.child = child;
    this.width = width == null ? null : Number(width);
    this.height = height == null ? null : Number(height);
    this.padding = normalizeInsets(padding);
    this.margin = normalizeInsets(margin);
    this.background = background == null ? null : normalizeColor(background);
    this.borderColor = borderColor == null ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
  }
  layout(context, constraints) {
    const outerMaxWidth = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right);
    const desiredWidth = this.width == null ? outerMaxWidth : Math.min(this.width, outerMaxWidth);
    const innerMaxWidth = Math.max(0, desiredWidth - this.padding.left - this.padding.right);
    const childBox = this.child ? this.child.layout(context, {
      maxWidth: innerMaxWidth,
      maxHeight: constraints.maxHeight
    }) : null;
    const contentHeight = childBox?.height ?? 0;
    const contentWidth = childBox?.width ?? 0;
    const boxWidth = this.width == null ? Math.min(outerMaxWidth, Math.max(contentWidth + this.padding.left + this.padding.right, desiredWidth)) : desiredWidth;
    const boxHeight = this.height == null ? contentHeight + this.padding.top + this.padding.bottom : this.height;
    return {
      widget: this,
      width: boxWidth + this.margin.left + this.margin.right,
      height: boxHeight + this.margin.top + this.margin.bottom,
      data: {
        childBox,
        boxWidth,
        boxHeight
      }
    };
  }
  paint(context, box) {
    const x = box.x + this.margin.left;
    const y = box.y + this.margin.top;
    const {boxWidth, boxHeight, childBox} = box.data;
    if (this.background) {
      context.canvas.fillRect(x, y, boxWidth, boxHeight, this.background);
    }
    if (this.borderColor && this.borderWidth > 0) {
      context.canvas.strokeRect(x, y, boxWidth, boxHeight, this.borderColor, this.borderWidth);
    }
    if (childBox) {
      childBox.widget.paint(context, {
        ...childBox,
        x: x + this.padding.left,
        y: y + this.padding.top
      });
    }
  }
}

const CP1252 = Object.freeze({
  8364: 128,
  8218: 130,
  402: 131,
  8222: 132,
  8230: 133,
  8224: 134,
  8225: 135,
  710: 136,
  8240: 137,
  352: 138,
  8249: 139,
  338: 140,
  381: 142,
  8216: 145,
  8217: 146,
  8220: 147,
  8221: 148,
  8226: 149,
  8211: 150,
  8212: 151,
  732: 152,
  8482: 153,
  353: 154,
  8250: 155,
  339: 156,
  382: 158,
  376: 159
});

function toWinAnsiByte(codePoint) {
  if (codePoint <= 255) return codePoint;
  return CP1252[codePoint] ?? 63;
}

function pdfLiteral(value) {
  let output = "";
  for (const character of String(value)) {
    const byte = toWinAnsiByte(character.codePointAt(0) ?? 63);
    if (byte === 40 || byte === 41 || byte === 92) {
      output += `\\${String.fromCharCode(byte)}`;
    } else if (byte === 10) {
      output += "\\n";
    } else if (byte === 13) {
      output += "\\r";
    } else if (byte < 32 || byte > 126) {
      output += `\\${byte.toString(8).padStart(3, "0")}`;
    } else {
      output += String.fromCharCode(byte);
    }
  }
  return `(${output})`;
}

function encodeLatin1(value) {
  const result = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index++) {
    result[index] = value.charCodeAt(index) & 255;
  }
  return result;
}

function concatBytes(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function metadataDictionary(metadata) {
  const entries = [];
  if (metadata.title) entries.push(`/Title ${pdfLiteral(metadata.title)}`);
  if (metadata.author) entries.push(`/Author ${pdfLiteral(metadata.author)}`);
  if (metadata.subject) entries.push(`/Subject ${pdfLiteral(metadata.subject)}`);
  if (metadata.creator) entries.push(`/Creator ${pdfLiteral(metadata.creator)}`);
  if (metadata.producer) entries.push(`/Producer ${pdfLiteral(metadata.producer)}`);
  return `<< ${entries.join(" ")} >>`;
}

function serializePdf(pages, metadata) {
  const objects = [ null ];
  const allocate = body => {
    objects.push(body);
    return objects.length - 1;
  };
  const catalogId = allocate("");
  const pagesId = allocate("");
  const fontId = allocate("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const infoId = allocate(metadataDictionary(metadata));
  const pageIds = [];
  for (const page of pages) {
    const contentBytes = encodeLatin1(page.content);
    const contentId = allocate(`<< /Length ${contentBytes.length} >>\nstream\n${page.content}endstream`);
    const pageId = allocate(`<< /Type /Page /Parent ${pagesId} 0 R ` + `/MediaBox [0 0 ${formatNumber(page.format.width)} ${formatNumber(page.format.height)}] ` + `/Resources << /Font << /F1 ${fontId} 0 R >> >> ` + `/Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[pagesId] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`;
  objects[catalogId] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  const header = encodeLatin1("%PDF-1.7\n%âãÏÓ\n");
  const chunks = [ header ];
  const xrefLines = [ "0000000000 65535 f \n" ];
  let byteOffset = header.length;
  for (let id = 1; id < objects.length; id++) {
    const body = objects[id];
    if (body == null) {
      throw new Error(`PDF object ${id} was allocated but never filled`);
    }
    xrefLines.push(`${String(byteOffset).padStart(10, "0")} 00000 n \n`);
    const bytes = encodeLatin1(`${id} 0 obj\n${body}\nendobj\n`);
    chunks.push(bytes);
    byteOffset += bytes.length;
  }
  const xrefOffset = byteOffset;
  const trailer = [ `xref\n0 ${objects.length}\n`, xrefLines.join(""), `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`, `startxref\n${xrefOffset}\n%%EOF\n` ].join("");
  chunks.push(encodeLatin1(trailer));
  return concatBytes(chunks);
}

class PdfCanvas {
  constructor(pageHeight) {
    this.commands = [];
    this.pageHeight = pageHeight;
  }
  push(command) {
    this.commands.push(command);
  }
  save() {
    this.push("q");
  }
  restore() {
    this.push("Q");
  }
  fillRect(x, top, width, height, color) {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color)} ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re f`);
  }
  strokeRect(x, top, width, height, color, lineWidth = 1) {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`);
  }
  text(text, x, baselineFromTop, style) {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const command = [ "BT", "/F1", formatNumber(fontSize), "Tf", colorOperator(style.color), "1 0 0 1", formatNumber(x), formatNumber(baseline), "Tm", pdfLiteral(text), "Tj", "ET" ].join(" ");
    this.push(command);
  }
  line(x1, top1, x2, top2, color = "#000000", lineWidth = 1) {
    const y1 = this.pageHeight - top1;
    const y2 = this.pageHeight - top2;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
  }
  circle(cx, topCenter, radius, {fill = null, stroke = null, lineWidth = 1} = {}) {
    const cy = this.pageHeight - topCenter;
    const k = .5522847498;
    const ox = radius * k;
    const oy = radius * k;
    const path = [ `${formatNumber(cx + radius)} ${formatNumber(cy)} m`, `${formatNumber(cx + radius)} ${formatNumber(cy + oy)} ${formatNumber(cx + ox)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`, `${formatNumber(cx - ox)} ${formatNumber(cy + radius)} ${formatNumber(cx - radius)} ${formatNumber(cy + oy)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`, `${formatNumber(cx - radius)} ${formatNumber(cy - oy)} ${formatNumber(cx - ox)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`, `${formatNumber(cx + ox)} ${formatNumber(cy - radius)} ${formatNumber(cx + radius)} ${formatNumber(cy - oy)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c` ].join(" ");
    if (fill && stroke) {
      this.push(`${colorOperator(fill)} ${colorOperator(stroke, true)} ${formatNumber(lineWidth)} w ${path} B`);
    } else if (fill) {
      this.push(`${colorOperator(fill)} ${path} f`);
    } else {
      this.push(`${colorOperator(stroke ?? "#000000", true)} ${formatNumber(lineWidth)} w ${path} S`);
    }
  }
  output() {
    return `${this.commands.join("\n")}\n`;
  }
}

class MultiPage {
  constructor({format = PageFormat.A4, margin = DEFAULT_MARGIN, gap = 8, build, header = null, footer = null, background = null}) {
    if (typeof build !== "function") throw new TypeError("MultiPage.build must be a function");
    this.format = {
      width: Number(format.width),
      height: Number(format.height)
    };
    this.margin = normalizeInsets(margin);
    this.gap = Number(gap);
    this.build = build;
    this.header = header;
    this.footer = footer;
    this.background = background;
  }
  render(documentContext) {
    const children = this.build(documentContext);
    if (!Array.isArray(children)) throw new TypeError("MultiPage.build must return an array of widgets");
    const canvases = [];
    const startPage = () => {
      const canvas = new PdfCanvas(this.format.height);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);
      const pageNumber = canvases.length + 1;
      const context = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber
      };
      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;
      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, {
          maxWidth,
          maxHeight: bottom - top
        });
        headerWidget.paint(context, {
          ...headerBox,
          x: this.margin.left,
          y: top
        });
        top += headerBox.height + this.gap;
      }
      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, {
          maxWidth,
          maxHeight: bottom - top
        });
        bottom -= footerBox.height + this.gap;
        footerWidget.paint(context, {
          ...footerBox,
          x: this.margin.left,
          y: bottom + this.gap
        });
      }
      canvases.push(canvas);
      return {
        canvas,
        context,
        maxWidth,
        top,
        bottom,
        cursor: top
      };
    };
    let page = startPage();
    for (const child of children) {
      let box = child.layout(page.context, {
        maxWidth: page.maxWidth,
        maxHeight: page.bottom - page.cursor
      });
      if (page.cursor + box.height > page.bottom + .001) {
        if (box.height > page.bottom - page.top + .001) {
          throw new RangeError(`Widget height ${box.height.toFixed(2)} exceeds a full MultiPage content area`);
        }
        page = startPage();
        box = child.layout(page.context, {
          maxWidth: page.maxWidth,
          maxHeight: page.bottom - page.cursor
        });
      }
      child.paint(page.context, {
        ...box,
        x: this.margin.left,
        y: page.cursor
      });
      page.cursor += box.height + this.gap;
    }
    return canvases.map(canvas => ({
      format: this.format,
      content: canvas.output()
    }));
  }
}

class Page {
  constructor({format = PageFormat.A4, margin = DEFAULT_MARGIN, build, background = null}) {
    if (typeof build !== "function") throw new TypeError("Page.build must be a function");
    this.format = {
      width: Number(format.width),
      height: Number(format.height)
    };
    this.margin = normalizeInsets(margin);
    this.build = build;
    this.background = background;
  }
  render(documentContext) {
    const canvas = new PdfCanvas(this.format.height);
    if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);
    const context = {
      ...documentContext,
      canvas,
      pageFormat: this.format,
      pageNumber: 1
    };
    const widget = this.build(context);
    const maxWidth = this.format.width - this.margin.left - this.margin.right;
    const maxHeight = this.format.height - this.margin.top - this.margin.bottom;
    const box = widget.layout(context, {
      maxWidth,
      maxHeight
    });
    if (box.height > maxHeight + .001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }
    widget.paint(context, {
      ...box,
      x: this.margin.left,
      y: this.margin.top
    });
    return [ {
      format: this.format,
      content: canvas.output()
    } ];
  }
}

class Document {
  constructor({title = null, author = null, subject = null, creator = "js_pdf", producer = "js_pdf"} = {}) {
    this.sections = [];
    this.metadata = {
      title,
      author,
      subject,
      creator,
      producer
    };
  }
  addPage(page) {
    if (!(page instanceof Page) && !(page instanceof MultiPage)) {
      throw new TypeError("Document.addPage expects Page or MultiPage");
    }
    this.sections.push(page);
    return this;
  }
  save() {
    const documentContext = {
      document: this
    };
    const pages = [];
    for (const section of this.sections) {
      pages.push(...section.render(documentContext));
    }
    if (pages.length === 0) {
      throw new Error("Document must contain at least one page");
    }
    return serializePdf(pages, this.metadata);
  }
}

class Spacer extends Widget {
  constructor(height = 8) {
    super();
    this.requestedHeight = Number(height);
  }
  layout(_context, constraints) {
    return {
      widget: this,
      width: constraints.maxWidth,
      height: Math.max(0, this.requestedHeight),
      data: null
    };
  }
  paint() {}
}

class Column extends Widget {
  constructor({children = [], gap = 0, margin = 0} = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.margin = normalizeInsets(margin);
  }
  layout(context, constraints) {
    const innerWidth = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right);
    const childBoxes = [];
    let height = this.margin.top + this.margin.bottom;
    let width = 0;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const childBox = child.layout(context, {
        maxWidth: innerWidth,
        maxHeight: constraints.maxHeight
      });
      childBoxes.push(childBox);
      height += childBox.height;
      width = Math.max(width, childBox.width);
      if (index < this.children.length - 1) height += this.gap;
    }
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, width + this.margin.left + this.margin.right),
      height,
      data: {
        childBoxes
      }
    };
  }
  paint(context, box) {
    let y = box.y + this.margin.top;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, {
        ...childBox,
        x: box.x + this.margin.left,
        y
      });
      y += childBox.height + this.gap;
    }
  }
}

class Row extends Widget {
  constructor({children = [], gap = 0, widths = null, margin = 0} = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.widths = widths;
    this.margin = normalizeInsets(margin);
  }
  layout(context, constraints) {
    const available = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right - Math.max(0, this.children.length - 1) * this.gap);
    const ratios = this.widths ?? this.children.map(() => 1);
    const totalRatio = ratios.reduce((sum, value) => sum + Number(value), 0) || 1;
    const childBoxes = [];
    let height = 0;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const width = available * Number(ratios[index] ?? 1) / totalRatio;
      const childBox = child.layout(context, {
        maxWidth: width,
        maxHeight: constraints.maxHeight
      });
      childBoxes.push({
        ...childBox,
        allocatedWidth: width
      });
      height = Math.max(height, childBox.height);
    }
    return {
      widget: this,
      width: constraints.maxWidth,
      height: height + this.margin.top + this.margin.bottom,
      data: {
        childBoxes
      }
    };
  }
  paint(context, box) {
    let x = box.x + this.margin.left;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, {
        ...childBox,
        x,
        y: box.y + this.margin.top
      });
      x += childBox.allocatedWidth + this.gap;
    }
  }
}

class Vector extends Widget {
  constructor({width, height, draw}) {
    super();
    this.width = Number(width);
    this.height = Number(height);
    this.draw = draw;
  }
  layout(_context, constraints) {
    const scale = Math.min(1, constraints.maxWidth / this.width);
    return {
      widget: this,
      width: this.width * scale,
      height: this.height * scale,
      data: {
        scale
      }
    };
  }
  paint(context, box) {
    const scale = box.data.scale;
    const api = {
      rect: ({x, y, width, height, fill = null, stroke = null, lineWidth = 1}) => {
        if (fill) context.canvas.fillRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, fill);
        if (stroke) context.canvas.strokeRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, stroke, lineWidth * scale);
      },
      line: ({x1, y1, x2, y2, color = "#000000", lineWidth = 1}) => {
        context.canvas.line(box.x + x1 * scale, box.y + y1 * scale, box.x + x2 * scale, box.y + y2 * scale, color, lineWidth * scale);
      },
      circle: ({cx, cy, radius, fill = null, stroke = null, lineWidth = 1}) => {
        context.canvas.circle(box.x + cx * scale, box.y + cy * scale, radius * scale, {
          fill,
          stroke,
          lineWidth: lineWidth * scale
        });
      },
      text: ({value, x, y, fontSize = 12, color = "#000000"}) => {
        context.canvas.text(String(value), box.x + x * scale, box.y + y * scale, {
          fontSize: fontSize * scale,
          color: normalizeColor(color)
        });
      }
    };
    this.draw(api);
  }
}

function estimateCharacterWidth(character, fontSize) {
  if (character === " ") return fontSize * .278;
  if ("ilI.,:;!|".includes(character)) return fontSize * .26;
  if ("mwMW@%".includes(character)) return fontSize * .83;
  if (/[A-Z0-9]/.test(character)) return fontSize * .61;
  return fontSize * .51;
}

function estimateTextWidth(text, fontSize) {
  let width = 0;
  for (const character of String(text)) {
    width += estimateCharacterWidth(character, fontSize);
  }
  return width;
}

const DEFAULT_FONT_SIZE = 12;

const DEFAULT_LINE_HEIGHT = 1.2;

function breakLongWord(word, maxWidth, fontSize) {
  const chunks = [];
  let current = "";
  for (const character of word) {
    const candidate = current + character;
    if (current && estimateTextWidth(candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapText(value, maxWidth, fontSize) {
  const lines = [];
  const paragraphs = String(value).replace(/\r\n?/g, "\n").split("\n");
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    const rawWords = paragraph.split(/\s+/);
    let current = "";
    for (const rawWord of rawWords) {
      const words = estimateTextWidth(rawWord, fontSize) <= maxWidth ? [ rawWord ] : breakLongWord(rawWord, maxWidth, fontSize);
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && estimateTextWidth(candidate, fontSize) > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [ "" ];
}

class Text extends Widget {
  constructor(value, {fontSize = DEFAULT_FONT_SIZE, lineHeight = DEFAULT_LINE_HEIGHT, color = "#000000", align = "left", margin = 0} = {}) {
    super();
    this.value = String(value);
    this.fontSize = assertFiniteNumber(Number(fontSize), "fontSize");
    this.lineHeight = assertFiniteNumber(Number(lineHeight), "lineHeight");
    this.color = normalizeColor(color);
    this.align = align;
    this.margin = normalizeInsets(margin);
  }
  layout(_context, constraints) {
    const contentWidth = Math.max(1, constraints.maxWidth - this.margin.left - this.margin.right);
    const lines = wrapText(this.value, contentWidth, this.fontSize);
    const lineAdvance = this.fontSize * this.lineHeight;
    const contentHeight = lines.length * lineAdvance;
    return {
      widget: this,
      width: Math.min(constraints.maxWidth, Math.max(...lines.map(line => estimateTextWidth(line, this.fontSize)), 0) + this.margin.left + this.margin.right),
      height: contentHeight + this.margin.top + this.margin.bottom,
      data: {
        lines,
        lineAdvance,
        contentWidth
      }
    };
  }
  paint(context, box) {
    const {canvas} = context;
    const {lines, lineAdvance, contentWidth} = box.data;
    const xStart = box.x + this.margin.left;
    let baseline = box.y + this.margin.top + this.fontSize;
    for (const line of lines) {
      const lineWidth = estimateTextWidth(line, this.fontSize);
      let x = xStart;
      if (this.align === "center") x += (contentWidth - lineWidth) / 2;
      if (this.align === "right") x += contentWidth - lineWidth;
      canvas.text(line, x, baseline, {
        fontSize: this.fontSize,
        color: this.color
      });
      baseline += lineAdvance;
    }
  }
}

const publicApi = Object.freeze({
  Document,
  Page,
  MultiPage,
  Text,
  Column,
  Row,
  Container,
  Spacer,
  Vector,
  PageFormat
});

function createPdf(options, build) {
  if (typeof build !== "function") {
    throw new TypeError("createPdf requires a build function");
  }
  const document = new Document(options);
  const sections = build(publicApi);
  const normalized = Array.isArray(sections) ? sections : [ sections ];
  for (const section of normalized) {
    document.addPage(section);
  }
  return document.save();
}

const js_pdf = Object.freeze({
  ...publicApi,
  createPdf
});

export { Column, Container, Document, MultiPage, Page, PageFormat, Row, Spacer, Text, Vector, Widget, createPdf, js_pdf };

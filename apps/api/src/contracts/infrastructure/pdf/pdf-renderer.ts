import * as path from 'node:path';
import PDFDocument from 'pdfkit';
import type { TemplateLocale } from '../../../templates/domain/template-rules';
import {
  layoutParagraphLine,
  prepareWord,
  wrapParagraph,
  type Measure,
  type PlacedRun,
} from './pdf-layout';

/**
 * PHASE-08 / 08-C04: deterministic PDF rendering for rental contracts
 * and receipts.
 *
 * Arabic renders with the bundled Amiri font, shaped into presentation
 * forms by the layout engine; Latin uses Helvetica. Arabic documents
 * lay out right-to-left with the same run-aware algorithm as the body
 * text. Identical inputs produce identical bytes (fixed metadata, no
 * random ids), so regenerated artifacts compare byte-for-byte in tests.
 */

// Resolves to <api>/src/assets in tests and <api>/dist/assets after build
// (nest-cli copies src/assets into dist/assets).
const AMIRI_FONT_PATH = path.resolve(__dirname, '../../../assets/fonts/Amiri-Regular.ttf');

export const PDF_PAGE = { width: 595.28, height: 841.89, margin: 56 } as const;
const BODY_WIDTH = PDF_PAGE.width - PDF_PAGE.margin * 2;
const BODY_FONT_SIZE = 10.5;
const TITLE_FONT_SIZE = 12.5;
const FOOTER_FONT_SIZE = 8;
const LINE_HEIGHT = 17;
const TITLE_LINE_HEIGHT = 20;
const PARAGRAPH_GAP = 7;
const FOOTER_RESERVE = 30;
const CONTENT_BOTTOM = PDF_PAGE.height - PDF_PAGE.margin - FOOTER_RESERVE;

export interface PdfSignatureEvidence {
  signerName: string;
  /** Localized method description, e.g. "Customer digital signature". */
  methodLabel: string;
  signedAt: Date;
}

export interface PdfDocumentInput {
  kind: 'RENTAL_CONTRACT' | 'RENTAL_RECEIPT';
  locale: TemplateLocale;
  agencyName: string;
  /** Already-localized document title. */
  title: string;
  documentNumber: string;
  issuedAt: Date;
  bodyText: string;
  signature?: PdfSignatureEvidence;
}

interface FrameLabels {
  documentNumber: string;
  date: string;
  page: string;
  of: string;
  signature: string;
  name: string;
  method: string;
  signedOn: string;
}

const FRAME_LABELS: Record<TemplateLocale, FrameLabels> = {
  ar: {
    documentNumber: 'رقم الوثيقة',
    date: 'التاريخ',
    page: 'صفحة',
    of: 'من',
    signature: 'التوقيع',
    name: 'الاسم',
    method: 'طريقة التوقيع',
    signedOn: 'تاريخ التوقيع',
  },
  fr: {
    documentNumber: 'N° de document',
    date: 'Date',
    page: 'Page',
    of: 'sur',
    signature: 'Signature',
    name: 'Nom',
    method: 'Mode de signature',
    signedOn: 'Signé le',
  },
  en: {
    documentNumber: 'Document number',
    date: 'Date',
    page: 'Page',
    of: 'of',
    signature: 'Signature',
    name: 'Name',
    method: 'Signature method',
    signedOn: 'Signed on',
  },
};

interface PlacedLine {
  runs: PlacedRun[];
  totalWidth: number;
  title: boolean;
}

interface LineBlock {
  lines: PlacedLine[];
}

interface PageContent {
  lines: PlacedLine[];
}

/** Long-date + time, locale-aware and deterministic (fixed UTC zone). */
function frameDate(value: Date, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(value);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(value);
  return `${date} — ${time}`;
}

/** Wrap a paragraph into placed lines (run coordinates resolved). */
function paragraphLines(paragraph: string, maxWidth: number, rtl: boolean, measure: Measure): PlacedLine[] {
  const wrapped = wrapParagraph(paragraph, maxWidth, measure);
  return wrapped.lines.map((line) => {
    const placed = layoutParagraphLine(line, rtl, measure);
    return { runs: placed.runs, totalWidth: placed.width, title: false };
  });
}

function wrapShortLine(text: string, rtl: boolean, measure: Measure): PlacedLine {
  const wrapped = wrapParagraph(text, BODY_WIDTH, measure);
  const line = wrapped.lines[0] ?? { words: [] };
  const placed = layoutParagraphLine(line, rtl, measure);
  return { runs: placed.runs, totalWidth: placed.width, title: false };
}

function buildHeader(input: PdfDocumentInput, labels: FrameLabels, measure: Measure): LineBlock {
  const rtl = input.locale === 'ar';
  const lines: PlacedLine[] = [];
  for (const line of paragraphLines(input.title, BODY_WIDTH, rtl, measure)) {
    lines.push({ ...line, title: true });
  }
  lines.push(wrapShortLine(input.agencyName, rtl, measure));
  lines.push(wrapShortLine(`${labels.documentNumber}: ${input.documentNumber}`, rtl, measure));
  lines.push(wrapShortLine(`${labels.date}: ${frameDate(input.issuedAt, input.locale)}`, rtl, measure));
  return { lines };
}

function buildSignatureBlock(
  input: PdfDocumentInput,
  labels: FrameLabels,
  measure: Measure,
): LineBlock | null {
  if (!input.signature) {
    return null;
  }
  const rtl = input.locale === 'ar';
  const evidence = input.signature;
  const lines: PlacedLine[] = [
    wrapShortLine(`${labels.signature} — ${evidence.methodLabel}`, rtl, measure),
    wrapShortLine(`${labels.name}: ${evidence.signerName}`, rtl, measure),
    wrapShortLine(`${labels.signedOn}: ${frameDate(evidence.signedAt, input.locale)}`, rtl, measure),
  ];
  return { lines };
}

/** Paginate blocks into pages of placed lines. */
function paginate(blocks: LineBlock[]): PageContent[] {
  const pages: PageContent[] = [];
  let page: PlacedLine[] = [];
  let y = PDF_PAGE.margin;

  const newPage = () => {
    pages.push({ lines: page });
    page = [];
    y = PDF_PAGE.margin;
  };

  for (const block of blocks) {
    for (const line of block.lines) {
      const advance = line.title ? TITLE_LINE_HEIGHT : LINE_HEIGHT;
      if (y + advance > CONTENT_BOTTOM) {
        newPage();
      }
      page.push(line);
      y += advance;
    }
    y += PARAGRAPH_GAP;
  }

  if (page.length > 0) {
    pages.push({ lines: page });
  }
  return pages;
}

/**
 * Render the PDF. Deterministic: fixed metadata and no random ids, so
 * the same input always produces byte-identical output.
 */
export async function renderDocumentPdf(
  input: PdfDocumentInput,
  fontPath = AMIRI_FONT_PATH,
): Promise<Buffer> {
  const rtl = input.locale === 'ar';
  const labels = FRAME_LABELS[input.locale];

  const doc = new PDFDocument({
    size: 'A4',
    margin: PDF_PAGE.margin,
    info: {
      Title: `${input.title} ${input.documentNumber}`,
      Author: 'KAVRIQO',
      CreationDate: input.issuedAt,
    },
  });
  doc.registerFont('Amiri', fontPath);

  const measure: Measure = (text, runRtl) => {
    doc.font(runRtl ? 'Amiri' : 'Helvetica');
    return doc.widthOfString(text);
  };

  const blocks: LineBlock[] = [buildHeader(input, labels, measure)];
  for (const paragraph of input.bodyText.split('\n')) {
    const trimmed = paragraph.replace(/\s+$/u, '');
    if (trimmed.length === 0) {
      continue;
    }
    blocks.push({ lines: paragraphLines(trimmed, BODY_WIDTH, rtl, measure) });
  }
  const signatureBlock = buildSignatureBlock(input, labels, measure);
  if (signatureBlock) {
    blocks.push(signatureBlock);
  }

  const pages = paginate(blocks);

  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage();
    }
    let y = PDF_PAGE.margin;
    for (const line of page.lines) {
      const offset = rtl ? Math.max(0, BODY_WIDTH - line.totalWidth) : 0;
      doc.font(line.title ? (rtl ? 'Amiri' : 'Helvetica') : rtl ? 'Amiri' : 'Helvetica');
      doc.fontSize(line.title ? TITLE_FONT_SIZE : BODY_FONT_SIZE);
      for (const run of line.runs) {
        doc.font(run.rtl ? 'Amiri' : 'Helvetica');
        doc.fontSize(line.title ? TITLE_FONT_SIZE : BODY_FONT_SIZE);
        doc.text(run.text, PDF_PAGE.margin + offset + run.x, y, {
          lineBreak: false,
          width: run.width + 2,
        });
      }
      y += line.title ? TITLE_LINE_HEIGHT : LINE_HEIGHT;
    }

    // Footer: page numbers (run-aware for mixed Arabic/Latin).
    const footerText = `${labels.page} ${pageIndex + 1} ${labels.of} ${pages.length}`;
    const footerWords = footerText.split(' ').filter((word) => word.length > 0).map(prepareWord);
    const footerPlaced = layoutParagraphLine({ words: footerWords }, rtl, measure);
    const footerOffset = rtl ? Math.max(0, BODY_WIDTH - footerPlaced.width) : 0;
    // Footer baseline sits INSIDE the page (below the bottom margin the
    // page ends and pdfkit would auto-advance, creating spurious pages).
    const footerY = PDF_PAGE.height - PDF_PAGE.margin - 12;
    doc.fontSize(FOOTER_FONT_SIZE).fillColor('#555555');
    for (const run of footerPlaced.runs) {
      doc.font(run.rtl ? 'Amiri' : 'Helvetica');
      doc.fontSize(FOOTER_FONT_SIZE);
      doc.text(run.text, PDF_PAGE.margin + footerOffset + run.x, footerY, {
        lineBreak: false,
        width: run.width + 2,
      });
    }
    doc.fillColor('#000000');
  });

  const rendered = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (error: Error) => reject(error));
  });
  doc.end();
  return rendered;
}

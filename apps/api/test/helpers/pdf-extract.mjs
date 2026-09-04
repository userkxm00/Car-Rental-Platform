// Text extraction helper for PDF verification specs (08-C04).
// Runs as a plain Node ESM script (outside jest's module registry) with
// pdfjs-dist; prints { pages: string[], count } as JSON.
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node pdf-extract.mjs <file.pdf>');
  process.exit(2);
}

const standardFontsUrl = new URL('../../../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url);
const data = new Uint8Array(readFileSync(file));
const document = await getDocument({
  data,
  disableWorker: true,
  standardFontDataUrl: standardFontsUrl.href,
  useSystemFonts: false,
}).promise;

const pages = [];
for (let index = 1; index <= document.numPages; index += 1) {
  const page = await document.getPage(index);
  const content = await page.getTextContent();
  pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
}

console.log(JSON.stringify({ pages, count: document.numPages }));

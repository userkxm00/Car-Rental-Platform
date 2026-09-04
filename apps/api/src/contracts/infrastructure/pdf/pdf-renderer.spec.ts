import { execFileSync } from 'node:child_process';
import { convertArabic } from 'arabic-reshaper';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderDocumentPdf, type PdfDocumentInput } from './pdf-renderer';

/**
 * 08-C04: end-to-end PDF verification. Text is extracted from the real
 * PDF bytes with pdfjs-dist (a plain Node ESM helper, outside jest's
 * module registry) so Arabic shaping/order and Latin content are
 * asserted against the rendered artifacts themselves.
 */

const EXTRACT_HELPER = path.resolve(__dirname, '../../../../test/helpers/pdf-extract.mjs');

interface Extracted {
  pages: string[];
  count: number;
}

function normalize(text: string): string {
  // Extraction emits one item per text run; collapse spacing artifacts.
  return text.replace(/\s+/g, ' ').trim();
}

function extract(pdf: Buffer): Extracted {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kavriqo-pdf-'));
  const file = path.join(dir, 'document.pdf');
  fs.writeFileSync(file, pdf);
  const output = execFileSync(process.execPath, [EXTRACT_HELPER, file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return JSON.parse(output) as Extracted;
}

function baseInput(locale: 'ar' | 'fr' | 'en'): PdfDocumentInput {
  return {
    kind: 'RENTAL_CONTRACT',
    locale,
    agencyName: locale === 'ar' ? 'كراء وهران' : 'Location Oran',
    title: locale === 'ar' ? 'عقد إيجار مركبة' : locale === 'fr' ? 'Contrat de location de véhicule' : 'Vehicle Rental Contract',
    documentNumber: 'CT-2024-0187',
    issuedAt: new Date('2026-09-03T10:30:00Z'),
    bodyText:
      locale === 'ar'
        ? 'عقد إيجار مركبة رقم CT-2024-0187\n\nالمستأجر: أمين بن يوسف\nرقم رخصة القيادة: 123456789 — بلد الإصدار: DZ\n\nالمركبة: مرسيدس C220، سنة 2024، اللوحة 12345-16-12\n\nمبلغ الإيجار: 45 000 دج'
        : locale === 'fr'
          ? "Contrat de location de véhicule n° CT-2024-0187\n\nLocataire : Amine Benyoucef\nN° de permis : 123456789 — pays d'émission : DZ\n\nVéhicule : Mercedes C220, année 2024, immatriculation 12345-16-12"
          : 'Vehicle Rental Contract number CT-2024-0187\n\nCustomer: Amine Benyoucef\nLicense: 123456789 — country DZ\n\nVehicle: Mercedes C220, year 2024, plate 12345-16-12',
  };
}

describe('pdf-renderer (08-C04)', () => {
  it('produces a structurally valid, deterministic PDF for Latin content', async () => {
    const pdf = await renderDocumentPdf(baseInput('en'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString('latin1')).toContain('%%EOF');

    const second = await renderDocumentPdf(baseInput('en'));
    expect(pdf.equals(second)).toBe(true);

    const extracted = extract(pdf);
    const text = normalize(extracted.pages.join(' '));
    expect(text).toContain('Vehicle Rental Contract');
    expect(text).toContain('CT-2024-0187');
    expect(text).toContain('Amine Benyoucef');
    expect(text).toContain('Mercedes');
    expect(text).toContain('Page 1 of');
  });

  it('renders French with correct Latin extraction', async () => {
    const extracted = extract(await renderDocumentPdf(baseInput('fr')));
    const text = normalize(extracted.pages.join(' '));
    expect(text).toContain('Contrat de location');
    expect(text).toContain("pays d'émission");
    expect(text).toContain('12345-16-12');
  });

  it('renders Arabic with shaped presentation forms and un-reversed digits', async () => {
    const pdf = await renderDocumentPdf(baseInput('ar'));
    const extracted = extract(pdf);
    const text = normalize(extracted.pages.join(' '));

    // Shaped Arabic: presentation forms present in the glyph stream.
    const hasPresentationForms = [...text].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfeff);
    });
    expect(hasPresentationForms).toBe(true);

    // Embedded LTR runs keep their order inside the RTL flow.
    expect(text).toContain('CT-2024-0187');
    expect(text).toContain('123456789');
    expect(text).toContain('2024');

    // Footer page marker in Arabic (extraction carries shaped forms).
    expect(text).toContain(convertArabic('صفحة'));
  });

  it('adds the signature evidence block only when a signature is given', async () => {
    const unsigned = extract(await renderDocumentPdf(baseInput('en')));
    expect(normalize(unsigned.pages.join(' '))).not.toContain('Signature method');

    const signed = extract(
      await renderDocumentPdf({
        ...baseInput('en'),
        signature: {
          signerName: 'Amine Benyoucef',
          methodLabel: 'Customer digital signature',
          signedAt: new Date('2026-09-03T11:00:00Z'),
        },
      }),
    );
    const text = normalize(signed.pages.join(' '));
    expect(text).toContain('Signature — Customer digital signature');
    expect(text).toContain('Name: Amine Benyoucef');
  });

  it('keeps deterministic output when a signature is present', async () => {
    const input: PdfDocumentInput = {
      ...baseInput('ar'),
      signature: {
        signerName: 'أمين بن يوسف',
        methodLabel: 'توقيع رقمي للعميل',
        signedAt: new Date('2026-09-03T11:00:00Z'),
      },
    };
    expect((await renderDocumentPdf(input)).equals(await renderDocumentPdf(input))).toBe(true);
  });

  it('paginates long bodies and numbers every page', async () => {
    const paragraphs = Array.from({ length: 60 }, (_, index) => `Clause ${index + 1}: The parties agree to the terms described in this paragraph of the rental agreement.`);
    const pdf = await renderDocumentPdf({ ...baseInput('en'), bodyText: paragraphs.join('\n') });
    const extracted = extract(pdf);
    expect(extracted.count).toBeGreaterThan(1);
    const lastPage = normalize(extracted.pages[extracted.pages.length - 1]);
    expect(lastPage).toContain(`Page ${extracted.count} of ${extracted.count}`);
  });
});

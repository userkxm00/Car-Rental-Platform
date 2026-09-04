import {
  containsArabic,
  layoutParagraphLine,
  prepareWord,
  segmentRuns,
  wrapParagraph,
  type Measure,
} from './pdf-layout';

/** Uniform 10pt-per-character measure (spaces also 10pt). */
const measure: Measure = (text) => [...text].length * 10;

describe('pdf-layout (08-C04 RTL/LTR geometry)', () => {
  describe('segmentRuns', () => {
    it('splits Arabic and Latin into same-direction runs', () => {
      const runs = segmentRuns('رقم العقد CT-123');
      expect(runs.map((run) => ({ text: run.text, rtl: run.rtl }))).toEqual([
        { text: 'رقم العقد', rtl: true },
        { text: ' CT-123', rtl: false },
      ]);
    });

    it('keeps pure Latin text as one LTR run', () => {
      expect(segmentRuns('Contrat CT-1 — Oran')).toEqual([
        { text: 'Contrat CT-1 — Oran', rtl: false },
      ]);
    });
  });

  describe('prepareWord', () => {
    it('shapes Arabic words into presentation forms', () => {
      const word = prepareWord('العقد');
      expect(word.rtl).toBe(true);
      const text = word.runs.map((run) => run.text).join('');
      // Arabic presentation forms (FB50–FEFF) present after shaping.
      expect([...text].some((character) => {
        const code = character.codePointAt(0) ?? 0;
        return code >= 0xfb50 && code <= 0xfeff;
      })).toBe(true);
    });

    it('leaves Latin words untouched', () => {
      const word = prepareWord('CT-2024-0187');
      expect(word.rtl).toBe(false);
      expect(word.runs).toEqual([{ text: 'CT-2024-0187', rtl: false }]);
    });

    it('keeps a trailing dot as an LTR run of an Arabic word', () => {
      const word = prepareWord('الموعد.');
      expect(word.rtl).toBe(true);
      expect(word.runs[word.runs.length - 1]).toEqual({ text: '.', rtl: false });
    });
  });

  describe('wrapParagraph', () => {
    it('detects RTL base direction from the first word', () => {
      const wrapped = wrapParagraph('عقد إيجار مركبة', 100, measure);
      expect(wrapped.rtl).toBe(true);
      expect(wrapped.lines.length).toBeGreaterThanOrEqual(1);
    });

    it('detects LTR base direction', () => {
      const wrapped = wrapParagraph('Vehicle Rental Contract', 100, measure);
      expect(wrapped.rtl).toBe(false);
    });

    it('wraps long paragraphs into lines within the width', () => {
      const paragraph = 'كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة كلمة';
      const wrapped = wrapParagraph(paragraph, 90, measure);
      expect(wrapped.lines.length).toBeGreaterThan(1);
      for (const line of wrapped.lines) {
        const width = line.words.reduce(
          (sum, word) =>
            sum +
            word.runs.reduce((runSum, run) => runSum + measure(run.text, run.rtl), 0),
          0,
        );
        expect(width).toBeLessThanOrEqual(90 + 10); // single over-long word tolerance
      }
    });

    it('keeps an over-long single word intact (hard overflow)', () => {
      const wrapped = wrapParagraph('CT-2024-0187-LONGER-THAN-LINE', 50, measure);
      expect(wrapped.lines).toHaveLength(1);
      expect(wrapped.lines[0].words).toHaveLength(1);
    });
  });

  describe('layoutParagraphLine', () => {
    it('places the first RTL word at the right edge and later words to the left', () => {
      const wrapped = wrapParagraph('رقم العقد', 200, measure);
      const line = layoutParagraphLine(wrapped.lines[0], true, measure);
      // widths: رقم=30, العقد=50, space=10 → total 90
      expect(line.width).toBe(90);
      const [first, second] = line.runs;
      expect(first.text).toBe('ﺭﻗﻢ'); // shaped presentation forms
      expect(second.text).toBe('ﺍﻟﻌﻘﺪ');
      expect(first.x).toBe(90 - 30); // rightmost
      expect(second.x).toBe(90 - 30 - 10 - 50); // to the left
      expect(first.x + first.width).toBeLessThanOrEqual(90);
    });

    it('places LTR words from the left edge', () => {
      const wrapped = wrapParagraph('alpha beta', 200, measure);
      const line = layoutParagraphLine(wrapped.lines[0], false, measure);
      const [first, second] = line.runs;
      expect(first.x).toBe(0);
      expect(second.x).toBe(50 + 10);
    });

    it('keeps digit runs un-reversed inside RTL lines', () => {
      const wrapped = wrapParagraph('رقم 2024 العقد', 300, measure);
      const line = layoutParagraphLine(wrapped.lines[0], true, measure);
      const digitRun = line.runs.find((run) => !run.rtl);
      expect(digitRun).toBeDefined();
      expect(digitRun?.text.trim()).toBe('2024');
      // رقم rightmost, then 2024, then العقد leftmost.
      expect(line.runs.map((run) => run.text)).toEqual(['ﺭﻗﻢ', '2024', 'ﺍﻟﻌﻘﺪ']);
    });

    it('places a trailing LTR dot left of its Arabic word in RTL lines', () => {
      const wrapped = wrapParagraph('الموعد.', 200, measure);
      const line = layoutParagraphLine(wrapped.lines[0], true, measure);
      const dot = line.runs[line.runs.length - 1];
      expect(dot.text).toBe('.');
      const word = line.runs[0];
      expect(word.rtl).toBe(true);
      expect(dot.x + dot.width).toBeLessThanOrEqual(word.x);
    });
  });

  describe('containsArabic', () => {
    it('detects Arabic script', () => {
      expect(containsArabic('عقد')).toBe(true);
      expect(containsArabic('CT-2024')).toBe(false);
      expect(containsArabic('عقد CT-2024')).toBe(true);
    });
  });
});

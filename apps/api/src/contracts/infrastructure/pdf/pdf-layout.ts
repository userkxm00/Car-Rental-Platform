import { convertArabic } from 'arabic-reshaper';

/**
 * PHASE-08 / 08-C04 PDF text layout for Arabic (RTL) and Latin (LTR).
 *
 * Pure geometry: callers supply a `measure(text, rtl)` function (font-
 * backed widths). Lines are assembled run-by-run so mixed Arabic/Latin
 * content keeps correct visual order — whole-line reversal would flip
 * embedded LTR runs (numbers, plate numbers, Latin names) backwards.
 */

const ARABIC_BLOCK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic supplement
  [0x08a0, 0x08ff], // Arabic extended-A
  [0xfb50, 0xfdff], // Arabic presentation forms A
  [0xfe70, 0xfeff], // Arabic presentation forms B
];

export function isArabicCodePoint(codePoint: number): boolean {
  return ARABIC_BLOCK_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** True when the text contains any Arabic-script code point. */
export function containsArabic(text: string): boolean {
  return [...text].some((character) => isArabicCodePoint(character.codePointAt(0) ?? 0));
}

export interface TextRun {
  text: string;
  rtl: boolean;
}

/**
 * Split text into maximal same-direction runs (logical order). Spaces
 * are neutral and attach to the following run (or the previous one at
 * the end), so mixed-direction lines keep their separators with the
 * neighbouring word instead of splitting into stray runs.
 */
export function segmentRuns(text: string): TextRun[] {
  const characters = [...text];
  const runs: TextRun[] = [];
  let current: string[] | null = null;
  let currentRtl = false;

  const directionOf = (character: string): boolean | null => {
    if (character === ' ') {
      return null;
    }
    return isArabicCodePoint(character.codePointAt(0) ?? 0);
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const rtl = directionOf(character);
    if (current === null) {
      current = [character];
      currentRtl = rtl ?? false;
      continue;
    }
    if (rtl === null) {
      // Neutral space: attach to the following run when one exists;
      // otherwise keep it with the current run.
      if (index + 1 < characters.length) {
        const nextRtl = directionOf(characters[index + 1]);
        if (nextRtl !== null && nextRtl !== currentRtl) {
          runs.push({ text: current.join(''), rtl: currentRtl });
          current = [character];
          currentRtl = nextRtl;
          continue;
        }
      }
      current.push(character);
      continue;
    }
    if (rtl === currentRtl) {
      current.push(character);
    } else {
      runs.push({ text: current.join(''), rtl: currentRtl });
      current = [character];
      currentRtl = rtl;
    }
  }
  if (current !== null) {
    runs.push({ text: current.join(''), rtl: currentRtl });
  }
  return runs;
}

/**
 * Shape an Arabic-containing word into presentation forms. Word-level
 * shaping is safe: Arabic joining never crosses whitespace boundaries.
 */
export function shapeWord(word: string): string {
  return containsArabic(word) ? convertArabic(word) : word;
}

export interface ParagraphWord {
  /** Run order is visual for RTL words (runs of one word are mostly
   *  same-direction; mixed words keep logical order for LTR). */
  runs: TextRun[];
  rtl: boolean;
}

export interface Measure {
  (text: string, rtl: boolean): number;
}

export interface PlacedRun {
  text: string;
  rtl: boolean;
  /** Left edge of the run within the line (0 = line left). */
  x: number;
  width: number;
}

export interface LaidOutLine {
  runs: PlacedRun[];
  width: number;
}

export interface ParagraphLine {
  words: ParagraphWord[];
}

export interface WrappedParagraph {
  /** Base direction of the paragraph (first strong word). */
  rtl: boolean;
  lines: ParagraphLine[];
}

export function prepareWord(word: string): ParagraphWord {
  const shaped = shapeWord(word);
  return { runs: segmentRuns(shaped), rtl: containsArabic(shaped) };
}

/**
 * Greedy word wrapping. Words are measured as the sum of their runs; a
 * single word wider than the line is kept intact (hard overflow).
 * The paragraph base direction is the direction of its first word; every
 * line of the paragraph follows it.
 */
export function wrapParagraph(paragraph: string, maxWidth: number, measure: Measure): WrappedParagraph {
  const words = paragraph.split(' ').filter((word) => word.length > 0);
  const prepared = words.map(prepareWord);
  const rtl = prepared.length > 0 ? prepared[0].rtl : false;
  const spaceWidth = measure(' ', false);

  const lines: ParagraphLine[] = [];
  let current: ParagraphWord[] = [];
  let currentWidth = 0;

  const flush = () => {
    if (current.length > 0) {
      lines.push({ words: current });
      current = [];
      currentWidth = 0;
    }
  };

  for (const word of prepared) {
    const width = word.runs.reduce((sum, run) => sum + measure(run.text, run.rtl), 0);
    const added = current.length === 0 ? width : width + spaceWidth;
    if (current.length > 0 && currentWidth + added > maxWidth) {
      flush();
    }
    current.push(word);
    currentWidth += current.length === 1 ? width : added;
  }
  flush();
  return { rtl, lines };
}

/**
 * Place the runs of one wrapped line. For RTL lines the first word sits
 * at the right edge and each following word moves left; for LTR lines
 * words flow from the left edge. Word-internal runs keep their order —
 * a word is the atomic visual unit, so an embedded LTR run (a number, a
 * plate) inside an RTL line is emitted as-is at its RTL position.
 */
export function layoutParagraphLine(line: ParagraphLine, rtl: boolean, measure: Measure): LaidOutLine {
  const spaceWidth = measure(' ', false);

  // Logical word order: for RTL lines the first word is rightmost, so
  // positions are assigned from the right edge; for LTR lines words flow
  // from the left edge.
  const visual: Array<{ run: TextRun; separatorAfter: boolean }> = [];
  for (let index = 0; index < line.words.length; index += 1) {
    const word = line.words[index];
    for (const run of word.runs) {
      visual.push({ run, separatorAfter: false });
    }
    if (index < line.words.length - 1) {
      visual[visual.length - 1] = { ...visual[visual.length - 1], separatorAfter: true };
    }
  }

  const widths = visual.map(({ run }) => measure(run.text, run.rtl));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + spaceWidth * (visual.length - 1);

  const placed: PlacedRun[] = [];
  let x = rtl ? totalWidth : 0;
  for (let index = 0; index < visual.length; index += 1) {
    const { run, separatorAfter } = visual[index];
    const width = widths[index];
    if (rtl) {
      x -= width;
    }
    placed.push({ text: run.text, rtl: run.rtl, x, width });
    if (!rtl) {
      x += width;
    }
    if (separatorAfter) {
      x += rtl ? -spaceWidth : spaceWidth;
    }
  }
  return { runs: placed, width: totalWidth };
}

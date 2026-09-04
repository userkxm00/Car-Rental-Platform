/** Minimal type declarations for arabic-reshaper (no bundled types). */
declare module 'arabic-reshaper' {
  export interface ReshaperOptions {
    /** Whether to convert lam-alef ligatures (default true). */
    ligatures?: boolean;
  }

  /**
   * Convert Arabic text to presentation forms (contextual joining).
   * Returns the input unchanged when it contains no Arabic characters.
   */
  export function convertArabic(text: string, options?: ReshaperOptions): string;
}

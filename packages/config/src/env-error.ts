/**
 * Startup configuration failure.
 *
 * The message contains only the names of the offending variables and the
 * validation reasons — never environment values — so it is safe to surface
 * in logs and process output.
 */
export class EnvValidationError extends Error {
  readonly issues: ReadonlyArray<string>;

  constructor(issues: ReadonlyArray<string>, missing?: ReadonlyArray<string>) {
    const parts = [...issues];
    if (missing && missing.length > 0) {
      parts.push(`missing required variable(s): ${missing.join(', ')}`);
    }
    super(`Environment configuration is invalid:\n- ${parts.join('\n- ')}`);
    this.name = 'EnvValidationError';
    this.issues = parts;
  }
}

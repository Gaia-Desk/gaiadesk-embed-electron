/**
 * A refusal from the library. `code` is stable and meant for your code
 * (`consent_required`, `bad_token`, `bad_server`, `bad_config`,
 * `bad_rects`, `start_failed`, …); `message` is for people.
 */
export class EmbedError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EmbedError';
    this.code = code;
  }

  /** The addon's `"<code>: <message>"` error, as an EmbedError. */
  static from(e: unknown): EmbedError {
    if (e instanceof EmbedError) return e;
    const text = e instanceof Error ? e.message : String(e);
    const m = /^([a-z][a-z0-9_]*): ([\s\S]*)$/.exec(text);
    return m ? new EmbedError(m[1], m[2]) : new EmbedError('unknown', text);
  }
}

// What the library tells the app, one JSON object per event, as typed
// values. `ended` is always the last event, exactly once.

export type EmbedState = 'starting' | 'waiting' | 'connected' | 'ended';
export type SessionMode = 'view' | 'cobrowse';
export type EndReason = 'stopped' | 'app_stopped' | 'disconnected' | 'expired' | 'error';

export type EmbedEvent =
  /** The session's progress. */
  | { type: 'state'; state: EmbedState }
  /** The session is up: read `code` to the support agent. `expiresAt` is Unix seconds. */
  | { type: 'code'; code: string; sessionId: string; mode: SessionMode; expiresAt: number | null }
  /** A support agent joined (their email, when known). */
  | { type: 'joined'; agent: string | null }
  /** The agent left. */
  | { type: 'left' }
  /** Guided input was paused (`false`) or allowed again (`true`). */
  | { type: 'control'; allowed: boolean }
  /** An agent's guided-input request, and whether it was applied. */
  | { type: 'action'; action: string; applied: boolean; reason: string | null }
  /** Something went wrong; `ended` follows when it was fatal. */
  | { type: 'error'; code: string; message: string }
  /** The session is over. Always last, exactly once. */
  | { type: 'ended'; reason: EndReason };

const STATES: readonly string[] = ['starting', 'waiting', 'connected', 'ended'];
const MODES: readonly string[] = ['view', 'cobrowse'];
const REASONS: readonly string[] = ['stopped', 'app_stopped', 'disconnected', 'expired', 'error'];

const str = (v: unknown): v is string => typeof v === 'string';
const optStr = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : str(v) ? v : undefined);

/**
 * One event's JSON → an EmbedEvent, or null for a type (or value) this
 * version does not know, or a malformed event. `ended` is never lost: an
 * unknown reason reads as `"error"`.
 */
export function parseEvent(json: string): EmbedEvent | null {
  let o: unknown;
  try {
    o = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const e = o as Record<string, unknown>;
  switch (e.type) {
    case 'state':
      return str(e.state) && STATES.includes(e.state) ? { type: 'state', state: e.state as EmbedState } : null;
    case 'code': {
      if (!str(e.code) || !str(e.session_id) || !str(e.mode) || !MODES.includes(e.mode)) return null;
      const expiresAt = typeof e.expires_at === 'number' && Number.isFinite(e.expires_at) ? e.expires_at : null;
      return { type: 'code', code: e.code, sessionId: e.session_id, mode: e.mode as SessionMode, expiresAt };
    }
    case 'joined': {
      const agent = optStr(e.agent);
      return agent === undefined ? null : { type: 'joined', agent };
    }
    case 'left':
      return { type: 'left' };
    case 'control':
      return typeof e.allowed === 'boolean' ? { type: 'control', allowed: e.allowed } : null;
    case 'action': {
      const reason = optStr(e.reason);
      if (!str(e.action) || typeof e.applied !== 'boolean' || reason === undefined) return null;
      return { type: 'action', action: e.action, applied: e.applied, reason };
    }
    case 'error':
      return str(e.code) && str(e.message) ? { type: 'error', code: e.code, message: e.message } : null;
    case 'ended':
      return { type: 'ended', reason: str(e.reason) && REASONS.includes(e.reason) ? (e.reason as EndReason) : 'error' };
    default:
      return null;
  }
}

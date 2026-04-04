export function envHost() {
  return import.meta.env.VITE_NAKAMA_HOST || '127.0.0.1';
}
export function envPort() {
  return import.meta.env.VITE_NAKAMA_PORT || '7350';
}
export function envKey() {
  return import.meta.env.VITE_NAKAMA_KEY || 'defaultkey';
}
export function envSsl() {
  return import.meta.env.VITE_NAKAMA_USE_SSL === 'true';
}

/** Stable browser profile (shared across tabs). */
export const DEVICE_KEY = 'tictactoe_device_id';
/** Unique per tab so two tabs = two Nakama users (local multiplayer testing). */
export const DEVICE_TAB_SESSION_KEY = 'tictactoe_device_tab';
/** Player-chosen name for this tab/session. */
export const DISPLAY_NAME_SESSION_KEY = 'tictactoe_player_name';
/** After intro, per tab. */
export const INTRO_DONE_SESSION_KEY = 'tictactoe_intro_done';

/** @deprecated use INTRO_DONE_SESSION_KEY — kept for one-time migration */
export const NICKNAME_GATE_KEY = 'tictactoe_display_name_done';

export function getOrCreateDeviceId(): string {
  try {
    let base = localStorage.getItem(DEVICE_KEY);
    if (!base) {
      base = `web-${crypto.randomUUID?.() ?? String(Date.now())}`;
      localStorage.setItem(DEVICE_KEY, base);
    }
    let tab = sessionStorage.getItem(DEVICE_TAB_SESSION_KEY);
    if (!tab) {
      tab = crypto.randomUUID?.() ?? `t-${Date.now()}`;
      sessionStorage.setItem(DEVICE_TAB_SESSION_KEY, tab);
    }
    return `${base}:${tab}`;
  } catch {
    return `web-${Date.now()}`;
  }
}

export function getStoredDisplayName(): string {
  try {
    const a = sessionStorage.getItem(DISPLAY_NAME_SESSION_KEY)?.trim();
    if (a) return a;
    return localStorage.getItem(DISPLAY_NAME_SESSION_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setStoredDisplayName(name: string): void {
  const t = name.trim();
  try {
    sessionStorage.setItem(DISPLAY_NAME_SESSION_KEY, t);
    localStorage.setItem(DISPLAY_NAME_SESSION_KEY, t);
  } catch {
    /* ignore */
  }
}

/** Name + intro completed in this tab only (localStorage alone must not skip the gate). */
export function hasCompletedNicknameForThisTab(): boolean {
  try {
    if (sessionStorage.getItem(INTRO_DONE_SESSION_KEY) !== '1') return false;
    const name = sessionStorage.getItem(DISPLAY_NAME_SESSION_KEY)?.trim() ?? '';
    return name.length >= 2;
  } catch {
    return false;
  }
}

export function setIntroDoneForThisTab(): void {
  try {
    sessionStorage.setItem(INTRO_DONE_SESSION_KEY, '1');
    localStorage.setItem(NICKNAME_GATE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function parseRpcPayload(payload: string | object): Record<string, unknown> {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return payload as Record<string, unknown>;
}

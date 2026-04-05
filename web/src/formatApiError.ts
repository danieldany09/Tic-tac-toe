/** Nakama / fetch failures sometimes reject with a Response, not an Error. */
export async function formatApiError(e: unknown): Promise<string> {
  if (e instanceof Error) return e.message;
  if (typeof Event !== 'undefined' && e instanceof Event) {
    return 'Connection lost — retrying…';
  }
  if (typeof Response !== 'undefined' && e instanceof Response) {
    let body = '';
    try {
      body = await e.clone().text();
    } catch {
      /* ignore */
    }
    const hint = e.status === 0 ? 'Network error — is Nakama running (e.g. make dev)?' : '';
    const tail = body ? `: ${body.slice(0, 200)}` : '';
    return `HTTP ${e.status} ${e.statusText || ''}${tail}${hint ? ` — ${hint}` : ''}`.trim();
  }
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  try {
    return String(e);
  } catch {
    return 'Something went wrong';
  }
}

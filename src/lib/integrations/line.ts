import 'server-only';

/** LINE Messaging API — push, reply, bot info. Text messages only (≤ 5000 chars each). */
const API = 'https://api.line.me/v2/bot';

export interface LineText {
  type: 'text';
  text: string;
}

export const lineText = (text: string): LineText => ({ type: 'text', text: text.slice(0, 5000) });

async function post(token: string, path: string, body: unknown, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`line ${path}: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
}

export const linePush = (token: string, to: string, messages: LineText[], fetchImpl: typeof fetch = fetch) =>
  post(token, '/message/push', { to, messages: messages.slice(0, 5) }, fetchImpl);

export const lineReply = (token: string, replyToken: string, messages: LineText[], fetchImpl: typeof fetch = fetch) =>
  post(token, '/message/reply', { replyToken, messages: messages.slice(0, 5) }, fetchImpl);

export async function lineBotInfo(token: string, fetchImpl: typeof fetch = fetch): Promise<{ basicId: string; displayName: string }> {
  const res = await fetchImpl(`${API}/info`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`line info: HTTP ${res.status}`);
  const b = (await res.json()) as { basicId?: string; displayName?: string };
  return { basicId: b.basicId ?? '', displayName: b.displayName ?? '' };
}

import { request, type APIRequestContext } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { newRunId, staffClient, type Sb } from './p2-helpers';

export { newRunId, staffClient, type Sb };

export const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100';

export const TEAM_ROUTES = [
  '/api/admin/team/invite',
  '/api/admin/team/invite/revoke',
  '/api/admin/team/staff',
  '/api/admin/team/roles',
  '/api/admin/team/roles/archive',
  '/api/admin/team/transfer',
] as const;

export const INVITE_PATH_RE = /\/admin\/invite\/([A-Za-z0-9_-]{43})$/;

/** the shared e2e_all session as an API client (for setup and cleanup) */
export async function staffApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE, storageState: STAFF_STATE });
}

export async function post(api: APIRequestContext, url: string, data: unknown) {
  const res = await api.post(url, { data, failOnStatusCode: false });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> & { error?: { code: string } };
  return { status: res.status(), body, code: body?.error?.code };
}

/** invite through the API; returns the path /admin/invite/<token> */
export async function invite(api: APIRequestContext, email: string, roleKey: string): Promise<{ path: string; inviteId: string }> {
  const r = await post(api, '/api/admin/team/invite', { email, roleKey });
  if (r.status !== 200) throw new Error(`invite failed ${r.status} ${r.code}`);
  return { path: r.body.path as string, inviteId: r.body.inviteId as string };
}

/** leave nothing live behind: revoke this run's pending invites, archive its roles (no deletes — L-002) */
export async function cleanupRun(api: APIRequestContext, sb: Sb, run: string) {
  const { data: inv } = await sb
    .from('staff_invites')
    .select('id')
    .ilike('email', `p5-${run}%`)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('id')
    .range(0, 99);
  for (const i of inv ?? []) await post(api, '/api/admin/team/invite/revoke', { inviteId: i.id });
  const { data: roles } = await sb.from('roles').select('key').ilike('name_th', `E2E P5 ${run}%`).is('archived_at', null).order('key').range(0, 49);
  for (const r of roles ?? []) await post(api, '/api/admin/team/roles/archive', { key: r.key });
}

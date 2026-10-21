import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type APIRequestContext } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { invite, newRunId, post, staffApi, staffClient, TEAM_ROUTES, type Sb } from './p5-helpers';

const expect = baseExpect.configure({ timeout: 20_000 });

/**
 * P5-06-02 a limited role end to end. Needs a confirmed auth account that is not
 * (or no longer) active staff: E2E_LIMITED_EMAIL / E2E_LIMITED_PASSWORD. The spec
 * invites it as `dispatcher` through the API, accepts through the invite page
 * ("มีบัญชีอยู่แล้ว"), checks the denials, then deactivates it again (no deletes).
 * This project confirms email on sign-up and the session has no service role, so
 * the spec cannot mint that account itself.
 */
const LIMITED_EMAIL = process.env.E2E_LIMITED_EMAIL?.toLowerCase();
const LIMITED_PASSWORD = process.env.E2E_LIMITED_PASSWORD;

test.describe('P5-06 limited role (dispatcher)', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.skip(!LIMITED_EMAIL || !LIMITED_PASSWORD, 'no limited account — NOT RUN (set E2E_LIMITED_EMAIL/PASSWORD to a confirmed non-staff account)');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const run = newRunId();
  let sb: Sb;
  let api: APIRequestContext;

  test.beforeAll(async () => {
    sb = await staffClient();
    api = await staffApi();
    // a previous run that died before its cleanup: park the account first
    const { data } = await sb.from('staff').select('id, is_active').eq('email', LIMITED_EMAIL!).maybeSingle();
    if (data?.is_active) await post(api, '/api/admin/team/staff', { staffId: data.id, isActive: false });
  });
  test.afterAll(async () => {
    const { data } = await sb.from('staff').select('id, is_active').eq('email', LIMITED_EMAIL!).maybeSingle();
    if (data?.is_active) {
      const r = await post(api, '/api/admin/team/staff', { staffId: data.id, isActive: false });
      if (r.status !== 200) throw new Error(`cleanup: could not deactivate the limited account (${r.status} ${r.code})`);
    }
    const { data: inv } = await sb.from('staff_invites').select('id').eq('email', LIMITED_EMAIL!).is('accepted_at', null).is('revoked_at', null).order('id').range(0, 9);
    for (const i of inv ?? []) await post(api, '/api/admin/team/invite/revoke', { inviteId: i.id });
    await api.dispose();
  });

  test('P5-04-06 / P5-06-02 accept with an existing account, then every team door is shut', async ({ browser, isMobile }) => {
    const { path } = await invite(api, LIMITED_EMAIL!, 'dispatcher');
    const fresh = { storageState: { cookies: [], origins: [] } };
    const ctx = await browser.newContext(isMobile ? { ...fresh, viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : fresh);
    const page = await ctx.newPage();
    await page.goto(path);
    await page.getByRole('tab', { name: 'มีบัญชีอยู่แล้ว' }).click();
    await page.getByLabel('ชื่อที่ทีมเห็น').fill(`E2E P5 ${run} จำกัดสิทธิ์`);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(LIMITED_PASSWORD!);
    await page.getByRole('button', { name: 'เข้าสู่ระบบและเข้าร่วม' }).click();
    await page.waitForURL(/\/admin\/(?!invite|login)/);

    const { data: row } = await sb.from('staff').select('id, role_key, is_active, full_name').eq('email', LIMITED_EMAIL!).maybeSingle();
    expect(row).toMatchObject({ role_key: 'dispatcher', is_active: true, full_name: `E2E P5 ${run} จำกัดสิทธิ์` });
    const { data: used } = await sb.from('staff_invites').select('accepted_at, accepted_by').eq('email', LIMITED_EMAIL!).order('created_at', { ascending: false }).range(0, 0);
    expect(used?.[0]?.accepted_at).toBeTruthy();
    expect(used?.[0]?.accepted_by).toBe(row!.id);
    // single use
    expect((await page.request.get(path)).status()).toBe(404);

    // the nav never offers what the role cannot open
    if (isMobile) {
      await page.getByRole('button', { name: 'เพิ่มเติม' }).click();
      const sheet = page.getByRole('dialog', { name: 'เพิ่มเติม' });
      await expect(sheet.getByRole('link', { name: 'ทีมงานและสิทธิ์' })).toHaveCount(0);
      await expect(sheet.getByRole('link', { name: 'กฎราคา' })).toHaveCount(0);
      await page.keyboard.press('Escape');
    } else {
      const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
      await expect(nav.getByRole('link', { name: /^งานเข้า/ })).toBeVisible();
      await expect(nav.getByRole('link', { name: /^ทีมงานและสิทธิ์/ })).toHaveCount(0);
      await expect(nav.getByRole('link', { name: /^กฎราคา/ })).toHaveCount(0);
    }
    for (const url of ['/admin/team', '/admin/pricing']) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/admin\?denied=1|\/admin\/jobs/);
    }
    for (const url of TEAM_ROUTES) {
      const r = await post(page.request, url, {});
      expect(r.status, url).toBe(403);
      expect(['forbidden', 'owner_only'], url).toContain(r.code);
    }
    await ctx.close();
  });
});

import { existsSync } from 'node:fs';
import { expect as baseExpect, test, type APIRequestContext, type Page } from '@playwright/test';
import { STAFF_STATE } from './global-setup';
import { cleanupRun, INVITE_PATH_RE, invite, newRunId, post, staffApi, staffClient, TEAM_ROUTES, type Sb } from './p5-helpers';

const expect = baseExpect.configure({ timeout: 15_000 });

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('P5 without a session', () => {
  test('P5-06-01 every team route answers 401 before looking at the body', async ({ request }) => {
    for (const url of [...TEAM_ROUTES, '/api/invite/accept']) {
      const r = await post(request, url, {});
      expect(r.status, url).toBe(401);
      expect(r.code, url).toBe('unauthenticated');
    }
  });

  test('P5-04-02 a malformed or unknown invite token is one 404 page', async ({ page }) => {
    for (const t of ['short', 'A'.repeat(43)]) {
      const res = await page.goto(`/admin/invite/${t}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByTestId('invite-gone')).toContainText('ลิงก์นี้ใช้ไม่ได้');
      await expect(page.locator('body')).not.toContainText('@');
    }
  });
});

test.describe('P5 team page (e2e_all, not the owner)', () => {
  test.skip(!existsSync(STAFF_STATE), 'no staff credentials — NOT RUN (set E2E_STAFF_EMAIL/PASSWORD)');
  test.use({ storageState: STAFF_STATE });
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  const run = newRunId();
  const email = `p5-${run}-a@aewkan.test`;
  const roleName = `E2E P5 ${run} ทดสอบ`;
  const me = (process.env.E2E_STAFF_EMAIL ?? '').toLowerCase();
  let sb: Sb;
  let api: APIRequestContext;
  let firstPath = '';
  let secondPath = '';

  test.beforeAll(async () => {
    sb = await staffClient();
    api = await staffApi();
  });
  test.afterAll(async () => {
    await cleanupRun(api, sb, run);
    await api.dispose();
  });

  test('P5-02-01/02 the staff list marks you and locks your own row', async ({ page }) => {
    await page.goto('/admin/team');
    await expect(page.getByRole('heading', { level: 1, name: 'ทีมงานและสิทธิ์' })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'ทีมงานและสิทธิ์' });
    await expect(tabs.getByRole('link', { name: 'ทีมงาน', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(tabs.getByRole('link', { name: 'Role และสิทธิ์', exact: true })).toBeVisible();
    const mine = page.getByTestId('staff-list').locator('> *').filter({ hasText: me });
    await expect(mine).toContainText('(คุณ)');
    await expect(mine).toContainText('แก้สิทธิ์ตัวเองไม่ได้');
    await expect(mine.getByRole('button')).toHaveCount(0);
    // not the owner: no transfer section
    await expect(page.getByTestId('transfer-panel')).toHaveCount(0);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await noSideScroll(page)).toBe(true);
  });

  test('P5-02-04 the invite form checks the address before any request', async ({ page }) => {
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/admin/team/invite')) posts++;
    });
    await page.goto('/admin/team');
    await page.getByRole('button', { name: 'เชิญทีมงาน' }).click();
    const dlg = page.getByRole('dialog', { name: 'เชิญทีมงาน' });
    await dlg.getByLabel('อีเมล').fill('not-an-email');
    await dlg.getByRole('button', { name: 'สร้างลิงก์เชิญ' }).click();
    await expect(dlg.getByRole('alert')).toContainText('กรอกอีเมลให้ถูกต้อง');
    expect(posts).toBe(0);
    const options = await dlg.getByLabel('Role').locator('option').allTextContents();
    expect(options).not.toContain('เจ้าของ');
    expect(options).toContain('จัดงาน');
  });

  test('P5-02-03 / P5-01-07 inviting shows a one-time link and stores only its hash', async ({ page }) => {
    await page.goto('/admin/team');
    await page.getByRole('button', { name: 'เชิญทีมงาน' }).click();
    const dlg = page.getByRole('dialog', { name: 'เชิญทีมงาน' });
    await dlg.getByLabel('อีเมล').fill(email.toUpperCase());
    await dlg.getByLabel('Role').selectOption({ label: 'จัดงาน' });
    await dlg.getByRole('button', { name: 'สร้างลิงก์เชิญ' }).click();
    const done = page.getByRole('dialog', { name: 'สร้างลิงก์เชิญแล้ว' });
    const link = await done.getByTestId('invite-link').inputValue();
    expect(link).toMatch(INVITE_PATH_RE);
    firstPath = new URL(link).pathname;
    await expect(done.getByTestId('invite-message')).toHaveValue(new RegExp(link.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
    await expect(done.getByTestId('invite-message')).toHaveValue(/จัดงาน/);
    await done.getByRole('button', { name: 'ปิด' }).first().click();
    await expect(page.getByTestId('invites-list')).toContainText(email);

    const token = firstPath.split('/').pop()!;
    const { data, error } = await sb.from('staff_invites').select('email, role_key, token_hash, accepted_at, revoked_at').eq('email', email).is('revoked_at', null).maybeSingle();
    expect(error).toBeNull();
    expect(data?.email).toBe(email);
    expect(data?.role_key).toBe('dispatcher');
    expect(data?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data?.token_hash).not.toContain(token);
  });

  test('P5-04-01 / P5-RESP-01 the link opens for a visitor with company, address and role', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    const res = await page.goto(firstPath);
    expect(res?.status()).toBe(200);
    const summary = page.getByTestId('invite-summary');
    await expect(summary).toContainText(email);
    await expect(summary).toContainText('จัดงาน');
    await expect(page.getByText('คุณได้รับเชิญให้เข้าร่วมหลังบ้านของ แอ่วกัน')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'สร้างบัญชีใหม่' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'มีบัญชีอยู่แล้ว' })).toBeVisible();
    // client checks before any auth call
    await page.getByLabel('ชื่อที่ทีมเห็น').fill('ทดสอบ');
    await page.getByLabel('รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)').fill('short');
    await page.getByRole('button', { name: 'สร้างบัญชีและเข้าร่วม' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('อย่างน้อย 10');
    expect(await noSideScroll(page)).toBe(true);
    await ctx.close();
  });

  test('P5-04-03 signed in as someone else: the page says so and the API refuses', async ({ page }) => {
    await page.goto(firstPath);
    await expect(page.getByTestId('accept-mismatch')).toContainText(`ไม่ใช่ ${email}`);
    // never click "sign out" here: it would end the shared e2e session
    const token = firstPath.split('/').pop()!;
    const r = await post(page.request, '/api/invite/accept', { token, fullName: 'X' });
    expect(r.status).toBe(403);
    expect(r.code).toBe('email_mismatch');
    const bad = await post(page.request, '/api/invite/accept', { token: 'x', fullName: '' });
    expect(bad.status).toBe(422);
  });

  test('P5-02-05 a new link replaces the old one', async ({ page }) => {
    await page.goto('/admin/team');
    await page.getByRole('button', { name: `สร้างลิงก์ใหม่ ${email}` }).click();
    const done = page.getByRole('dialog', { name: 'สร้างลิงก์เชิญแล้ว' });
    const link = await done.getByTestId('invite-link').inputValue();
    secondPath = new URL(link).pathname;
    expect(secondPath).not.toBe(firstPath);
    await done.getByRole('button', { name: 'ปิด' }).first().click();
    expect((await page.request.get(firstPath)).status()).toBe(404);
    expect((await page.request.get(secondPath)).status()).toBe(200);
    const { count } = await sb.from('staff_invites').select('id', { count: 'exact', head: true }).eq('email', email).is('revoked_at', null).is('accepted_at', null);
    expect(count).toBe(1);
  });

  test('P5-02-06 revoking asks first, then the link is dead', async ({ page }) => {
    await page.goto('/admin/team');
    await page.getByRole('button', { name: `ยกเลิกคำเชิญ ${email}` }).click();
    const dlg = page.getByRole('dialog', { name: `ยกเลิกคำเชิญของ ${email}?` });
    await dlg.getByRole('button', { name: 'ยกเลิกคำเชิญ' }).click();
    await expect(page.getByText('ยกเลิกคำเชิญแล้ว')).toBeVisible();
    await expect(page.locator('main')).not.toContainText(email);
    expect((await page.request.get(secondPath)).status()).toBe(404);
    const { data } = await sb.from('staff_invites').select('revoked_at').eq('email', email).order('created_at', { ascending: false }).range(0, 0);
    expect(data?.[0]?.revoked_at).toBeTruthy();
  });

  test('P5-02-04 / P5-01-04 / P5-05-01 the API refuses what the page never offers', async ({ page }) => {
    const r = page.request;
    expect((await post(r, '/api/admin/team/invite', { email: 'bad', roleKey: 'dispatcher' })).status).toBe(422);
    const owner = await post(r, '/api/admin/team/invite', { email: `p5-${run}-b@aewkan.test`, roleKey: 'owner' });
    expect([owner.status, owner.code]).toEqual([403, 'owner_role_not_assignable']);
    const nope = await post(r, '/api/admin/team/invite', { email: `p5-${run}-b@aewkan.test`, roleKey: 'zz_nope' });
    expect([nope.status, nope.code]).toEqual([404, 'role_not_found']);
    const staff = await post(r, '/api/admin/team/invite', { email: me, roleKey: 'dispatcher' });
    expect([staff.status, staff.code]).toEqual([409, 'already_staff']);

    const { data: meRow } = await sb.from('staff').select('id').eq('email', me).maybeSingle();
    const self = await post(r, '/api/admin/team/staff', { staffId: meRow!.id, roleKey: 'dispatcher' });
    expect([self.status, self.code]).toEqual([403, 'cannot_change_self']);
    const none = await post(r, '/api/admin/team/staff', { staffId: meRow!.id });
    expect(none.status).toBe(422);

    const t = await post(r, '/api/admin/team/transfer', {});
    expect([t.status, t.code]).toEqual([403, 'owner_only']);
  });

  test('P5-03-01 roles show their locks', async ({ page }) => {
    await page.goto('/admin/team?tab=roles');
    const list = page.getByTestId('roles-list');
    await expect(list.locator('[data-role="owner"]')).toContainText('ล็อก');
    await expect(list.locator('[data-role="owner"]')).toContainText('ทุกสิทธิ์');
    await expect(list.locator('[data-role="admin"]')).toContainText('แก้ได้เฉพาะเจ้าของ');
    await expect(list.locator('[data-role="e2e_all"]')).toContainText('role ของคุณเอง แก้ไม่ได้');
    await expect(list.locator('[data-role="dispatcher"]').getByRole('button', { name: 'แก้ไข จัดงาน' })).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await noSideScroll(page)).toBe(true);
  });

  test('P5-03-02/03/04 create, edit and remove a custom role', async ({ page }) => {
    await page.goto('/admin/team?tab=roles');
    await page.getByRole('button', { name: 'สร้าง role' }).click();
    const dlg = page.getByRole('dialog', { name: 'สร้าง role ใหม่' });
    for (const g of ['งาน', 'ตั้งค่า', 'การเงิน', 'ระบบ']) await expect(dlg.getByText(g, { exact: true })).toBeVisible();
    await dlg.getByLabel('ชื่อ role').fill(roleName);
    await dlg.getByLabel('ดูงานทั้งหมด').check();
    await dlg.getByLabel('เสนอราคา').check();
    await dlg.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('สร้าง role แล้ว')).toBeVisible();
    const card = page.getByTestId('roles-list').locator('article').filter({ hasText: roleName });
    await expect(card).toContainText('ดูงานทั้งหมด');
    const key = (await card.getAttribute('data-role'))!;
    const perms = async () =>
      (await sb.from('role_permissions').select('permission_key').eq('role_key', key).is('revoked_at', null).order('permission_key').range(0, 20)).data?.map((x) => x.permission_key);
    expect(await perms()).toEqual(['jobs.read', 'quotes.manage']);

    await card.getByRole('button', { name: `แก้ไข ${roleName}` }).click();
    const edit = page.getByRole('dialog', { name: `แก้ role ${roleName}` });
    await edit.getByLabel('ชื่อ role').fill(`${roleName} 2`);
    await edit.getByLabel('เสนอราคา').uncheck();
    await edit.getByRole('button', { name: 'บันทึก' }).click();
    await expect(page.getByText('บันทึก role แล้ว')).toBeVisible();
    expect(await perms()).toEqual(['jobs.read']);
    const { data: role } = await sb.from('roles').select('name_th').eq('key', key).maybeSingle();
    expect(role?.name_th).toBe(`${roleName} 2`);

    const card2 = page.getByTestId('roles-list').locator(`[data-role="${key}"]`);
    await card2.getByRole('button', { name: `ลบ role ${roleName} 2` }).click();
    await page.getByRole('dialog', { name: `ลบ role ${roleName} 2?` }).getByRole('button', { name: 'ลบ role' }).click();
    await expect(page.getByText('ลบ role แล้ว')).toBeVisible();
    await expect(page.getByTestId('roles-list').locator(`[data-role="${key}"]`)).toHaveCount(0);
    const { data: archived } = await sb.from('roles').select('archived_at').eq('key', key).maybeSingle();
    expect(archived?.archived_at).toBeTruthy();
  });

  test('P5-03-06 / P5-01-05 / P5-01-06 role API refusals', async ({ page }) => {
    const r = page.request;
    const base = { nameTh: `E2E P5 ${run} x`, description: '', permissions: ['jobs.read'] };
    expect((await post(r, '/api/admin/team/roles', { ...base, key: 'owner' })).code).toBe('system_role_locked');
    const admin = await post(r, '/api/admin/team/roles', { ...base, key: 'admin' });
    expect([admin.status, admin.code]).toEqual([403, 'admin_role_owner_only']);
    const own = await post(r, '/api/admin/team/roles', { ...base, key: 'e2e_all' });
    expect([own.status, own.code]).toEqual([403, 'cannot_edit_own_role']);
    const unk = await post(r, '/api/admin/team/roles', { ...base, key: `r_${run}zz`, permissions: ['nope.read'] });
    expect([unk.status, unk.code]).toEqual([422, 'unknown_permission']);
    const inUse = await post(r, '/api/admin/team/roles/archive', { key: 'e2e_all' });
    expect([inUse.status, inUse.code]).toEqual([409, 'role_in_use']);
    const sys = await post(r, '/api/admin/team/roles/archive', { key: 'admin' });
    expect([sys.status, sys.code]).toEqual([403, 'system_role_protected']);

    // a role with a live invite cannot go
    const made = await post(r, '/api/admin/team/roles', { ...base, key: `r_${run}pi` });
    expect(made.status).toBe(200);
    await invite(r, `p5-${run}-c@aewkan.test`, `r_${run}pi`);
    const pending = await post(r, '/api/admin/team/roles/archive', { key: `r_${run}pi` });
    expect([pending.status, pending.code]).toEqual([409, 'role_has_pending_invites']);
  });

  test('P5-01-01 the team tables cannot be written directly', async () => {
    const { data, error } = await sb.from('staff').update({ full_name: 'hijack' }).eq('email', me).select('id');
    expect(error?.message ?? '').toMatch(/permission denied/);
    expect(data).toBeNull();
    const ins = await sb.from('roles').insert({ key: `r_${run}dd`, name_th: 'x' });
    expect(ins.error?.message ?? '').toMatch(/permission denied/);
  });
});

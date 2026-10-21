import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { can, getStaff, type Permission, type StaffSession } from '@/lib/auth/staff';
import { MissingEnvError } from '@/lib/env';

/**
 * Every route answers errors in one shape: { error: { code, message } }.
 * `code` is stable (tests and the UI branch on it); `message` is Thai copy.
 */
export class ApiError extends Error {
  readonly isApiError = true;
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// branded check — `instanceof` is false across Next chunks (ssr-auth route-adapter contracts)
const isApiError = (e: unknown): e is ApiError => typeof e === 'object' && e !== null && (e as ApiError).isApiError === true;

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status });

function errorResponse(e: unknown) {
  if (isApiError(e)) return json({ error: { code: e.code, message: e.message } }, e.status);
  if (e instanceof MissingEnvError || (e as { code?: string })?.code === 'missing_env') {
    const key = (e as MissingEnvError).key;
    console.error('[api] missing env', key);
    return json({ error: { code: 'server_not_configured', message: `ระบบยังตั้งค่าไม่ครบ (${key})` } }, 503);
  }
  console.error('[api] unhandled', e);
  return json({ error: { code: 'internal', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' } }, 500);
}

const MAX_BODY = 64 * 1024;

async function readBody<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = MAX_BODY): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'body_too_large', 'ข้อมูลใหญ่เกินกำหนด');
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(422, 'invalid_json', 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(422, 'validation', first ? `${first.path.join('.') || 'body'}: ${first.message}` : 'ข้อมูลไม่ถูกต้อง');
  }
  return parsed.data;
}

/**
 * Staff mutation: who first (401/403), then what (422). Order is the contract.
 */
export function staffRoute<S extends z.ZodTypeAny, R>(
  perm: Permission | Permission[],
  schema: S,
  fn: (ctx: { staff: StaffSession; body: z.infer<S>; req: Request }) => Promise<R>,
) {
  return async (req: Request) => {
    try {
      const staff = await getStaff();
      if (!staff) throw new ApiError(401, 'unauthenticated', 'กรุณาเข้าสู่ระบบ');
      const need = Array.isArray(perm) ? perm : [perm];
      if (!need.some((p) => can(staff, p))) throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
      const body = await readBody(req, schema);
      return json(await fn({ staff, body, req }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/**
 * Public route (customer / driver / webhook). `authorize` runs first and
 * must throw ApiError(401/404) when the token or signature is not valid.
 */
export function publicRoute<S extends z.ZodTypeAny, A, R>(
  authorize: (req: Request, params: Record<string, string>) => Promise<A>,
  schema: S,
  fn: (ctx: { auth: A; body: z.infer<S>; req: Request }) => Promise<R>,
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      const auth = await authorize(req, (await ctx?.params) ?? {});
      const body = req.method === 'GET' ? ({} as z.infer<S>) : await readBody(req, schema);
      return json(await fn({ auth, body, req }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export { isApiError };

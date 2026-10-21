import 'server-only';
import { ApiError } from '@/lib/api/handler';

interface PgErrorLike {
  code?: string;
  message: string;
}

/**
 * Turn a Supabase error into the right API answer. RLS / grant refusals are the
 * caller's problem (403), constraint violations are bad input (409/422); anything
 * else is a bug and stays a 500 (handler logs it).
 */
export function dbFail(err: PgErrorLike, label: string): never {
  const code = err.code ?? '';
  if (code === '42501' || /permission denied|row-level security/i.test(err.message)) {
    throw new ApiError(403, 'forbidden', 'ไม่มีสิทธิ์ทำรายการนี้');
  }
  if (code === '23505') throw new ApiError(409, 'duplicate', 'มีข้อมูลนี้อยู่แล้ว');
  if (code === '23503') throw new ApiError(422, 'not_found', 'ไม่พบข้อมูลที่อ้างถึง');
  if (code === '23514' || code === '22P02' || code === '22023') throw new ApiError(422, 'validation', 'ข้อมูลไม่ถูกต้อง');
  throw new Error(`${label}: ${err.message}`);
}

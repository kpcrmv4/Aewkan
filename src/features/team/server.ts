import 'server-only';
import { ApiError } from '@/lib/api/handler';
import { teamErrorText } from '@/lib/copy/team';
import { teamError } from './model';

/**
 * Turn a failed team RPC into the route's error: known codes become
 * ApiError(status, code, Thai message); anything else stays a 500.
 */
export function throwRpcError(where: string, error: { message: string; code?: string }): never {
  const mapped = teamError(error.message);
  if (mapped) throw new ApiError(mapped.status, mapped.code, teamErrorText(mapped.code));
  throw new Error(`${where}: ${error.message}`);
}

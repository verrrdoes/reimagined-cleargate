import { unstable_rethrow } from 'next/navigation';

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: { code: string; message: string } };
export type Result<T = null> = Ok<T> | Err;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
const err = (code: string, message: string): Err => ({ ok: false, error: { code, message } });

// Prisma connection errors: can't reach server, timed out, pool timeout, connection closed.
const DB_DOWN = new Set(['P1001', 'P1002', 'P1017', 'P2024']);

export function toError(e: unknown): { status: number; body: Err } {
  if (e instanceof ApiError) return { status: e.status, body: err(e.code, e.message) };
  const code = (e as { code?: unknown } | null)?.code;
  const name = (e as { name?: unknown } | null)?.name;
  if ((typeof code === 'string' && DB_DOWN.has(code)) || name === 'PrismaClientInitializationError') {
    console.error('ClearGate database unavailable:', e);
    return { status: 503, body: err('database_unavailable', 'The database is not reachable right now. Try again in a moment.') };
  }
  console.error('ClearGate error:', e);
  return { status: 500, body: err('server_error', 'Something went wrong.') };
}

/** Runs a Server Action body and returns the envelope. redirect() and notFound() pass through. */
export async function runAction<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    unstable_rethrow(e);
    return toError(e).body;
  }
}

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

/** Wraps a Route Handler: returns `{ ok, data }` JSON, or the error envelope with its HTTP status. JSON is never cached. */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : Response.json(ok(out ?? null), { headers: JSON_HEADERS });
    } catch (e) {
      const { status, body } = toError(e);
      return Response.json(body, { status, headers: JSON_HEADERS });
    }
  };
}

/** True when a Prisma error is a unique-constraint violation. */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'P2002';
}

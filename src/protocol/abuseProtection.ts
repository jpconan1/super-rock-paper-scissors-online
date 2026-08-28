export class RequestBodyError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function readJsonBody<T>(request: Request, maximumBytes = 2_000): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new RequestBodyError(413, 'Request body too large.');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new RequestBodyError(413, 'Request body too large.');
  try { return JSON.parse(text) as T; }
  catch { throw new RequestBodyError(400, 'Invalid JSON body.'); }
}

export function consumeSlidingWindow(times: number[], now: number, limit: number, windowMs: number): {
  allowed: boolean; times: number[];
} {
  const active = times.filter((time) => time > now - windowMs);
  if (active.length >= limit) return { allowed: false, times: active };
  active.push(now);
  return { allowed: true, times: active };
}

export function messageFitsUtf8Limit(message: string | ArrayBuffer, maximumBytes: number): message is string {
  return typeof message === 'string' && new TextEncoder().encode(message).byteLength <= maximumBytes;
}

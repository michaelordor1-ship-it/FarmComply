import "server-only";
import { sign } from "./auth";

export const SHARE_DAYS = 30;

type Payload = { b: string; f: string; t: string; e: number };

/** A signed, expiring token for a read-only report link. */
export function makeShareToken(batchId: string, from: string, to: string): string {
  const p: Payload = { b: batchId, f: from, t: to, e: Date.now() + SHARE_DAYS * 86_400_000 };
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(`report.${body}`).slice(0, 32)}`;
}

export function readShareToken(token: string): { batchId: string; from: string; to: string; expires: Date } | "expired" | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || sign(`report.${body}`).slice(0, 32) !== sig) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (p.e < Date.now()) return "expired";
    return { batchId: p.b, from: p.f, to: p.t, expires: new Date(p.e) };
  } catch {
    return null;
  }
}

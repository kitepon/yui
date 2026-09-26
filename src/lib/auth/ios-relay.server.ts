import { createHash, randomBytes } from "node:crypto";

const lifetimeMs = 5 * 60 * 1000;
const pending = new Map<string, { challenge: string; expires: number }>();
const tickets = new Map<string, { token: string; challenge: string; expires: number }>();

export function validLoginRequest(state: string, challenge: string): boolean {
  return /^[A-Za-z0-9_-]{32,128}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function beginLogin(state: string, challenge: string): void {
  pending.set(state, { challenge, expires: Date.now() + lifetimeMs });
  setTimeout(() => pending.delete(state), lifetimeMs).unref();
}

export function cancelLogin(state: string): void {
  pending.delete(state);
}

export function issueTicket(state: string, token: string): string | null {
  const request = pending.get(state);
  pending.delete(state);
  if (!request || request.expires < Date.now()) return null;
  const code = randomBytes(32).toString("base64url");
  tickets.set(code, { token, challenge: request.challenge, expires: Date.now() + lifetimeMs });
  setTimeout(() => tickets.delete(code), lifetimeMs).unref();
  return code;
}

export function redeemTicket(code: string, verifier: string): string | null {
  const ticket = tickets.get(code);
  tickets.delete(code);
  if (!ticket || ticket.expires < Date.now()) return null;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return challenge === ticket.challenge ? ticket.token : null;
}

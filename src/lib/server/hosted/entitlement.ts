import { getSqlite } from "../sqlite.ts";
import { hostedEnabled } from "./config.ts";
import { homePaid } from "./paid.ts";
import type { Entitlement } from "../billing-core.ts";

/**
 * The one gate for a write, an Alexa call and a runner tick.
 * Hosted: the home's paid date (never a store). Self-hosted: the old check, which is none when billing is not configured.
 * Returns null when nothing gates.
 */
export async function gateEntitlement(owner: string): Promise<Entitlement | null> {
  if (hostedEnabled()) {
    const { paid, paidUntil } = homePaid(getSqlite(), owner);
    return {
      writable: paid,
      provider: null,
      status: paid ? "active" : paidUntil === null ? "none" : "read_only",
      plan: null,
      message: paid ? "" : "現在は閲覧のみです。アプリで購読を始めてください。",
      trialEndsAt: null,
      currentPeriodEnd: paidUntil === null ? null : new Date(paidUntil).toISOString(),
      cancelAtPeriodEnd: false,
    };
  }
  const { billingConfigured, loadEntitlement } = await import("../billing.ts");
  return billingConfigured() ? loadEntitlement(owner) : null;
}

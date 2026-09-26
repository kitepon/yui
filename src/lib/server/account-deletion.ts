import { getStripe, loadCustomerId } from "./billing.ts";
import { revokeAppleLogin } from "./apple-login.ts";
import { getSqlite } from "./sqlite.ts";

/** 購入を終了してから家を削除する。外部決済が失敗したら削除も止める。 */
export async function prepareAccountDeletion(userId: string) {
  await revokeAppleLogin(userId);
  const customerId = loadCustomerId(userId);
  if (customerId) {
    const stripe = getStripe();
    let after: string | undefined;
    for (;;) {
      const page = await stripe.checkout.sessions.list({
        customer: customerId, status: "open", limit: 100,
        ...(after ? { starting_after: after } : {}),
      });
      for (const session of page.data) {
        if (session.metadata?.service === "yuihome") await stripe.checkout.sessions.expire(session.id);
      }
      if (!page.has_more) break;
      after = page.data.at(-1)?.id;
      if (!after) throw new Error("Stripeの購入手続き一覧が不完全です");
    }
    after = undefined;
    for (;;) {
      const page = await stripe.subscriptions.list({
        customer: customerId, status: "all", limit: 100,
        ...(after ? { starting_after: after } : {}),
      });
      for (const subscription of page.data) {
        if (subscription.status !== "canceled" && subscription.status !== "incomplete_expired") {
          await stripe.subscriptions.cancel(subscription.id);
        }
      }
      if (!page.has_more) break;
      after = page.data.at(-1)?.id;
      if (!after) throw new Error("Stripeの契約一覧が不完全です");
    }
    await stripe.customers.del(customerId);
  }
  const sqlite = getSqlite();
  sqlite.prepare(
    `INSERT OR IGNORE INTO apple_deleted_transactions (original_transaction_id, deleted_at)
     SELECT original_transaction_id, ? FROM apple_subscriptions WHERE user_id = ?`,
  ).run(new Date().toISOString(), userId);
}

export function recordDeletedUser(userId: string) {
  getSqlite().prepare("INSERT OR IGNORE INTO deleted_users (user_id, deleted_at) VALUES (?, ?)")
    .run(userId, new Date().toISOString());
}

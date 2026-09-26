import { createFileRoute } from "@tanstack/react-router";
import { appleAccountToken, appleBillingConfigured, appleSubscriptionRows, refreshAppleSubscription } from "@/lib/server/apple-billing";
import { activePurchaseAttempt, releasePurchaseAttempt, reservePurchaseAttempt } from "@/lib/server/billing-purchase";
import { assertNoStripeContract, forgetEntitlement, getStripe, loadCustomerId, loadEntitlement, requireUser } from "@/lib/server/billing";

export const Route = createFileRoute("/api/apple/purchase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        if (!appleBillingConfigured()) return Response.json({ error: "Appleの課金設定がありません" }, { status: 503 });
        const attemptId = reservePurchaseAttempt(user.id, "apple");
        if (!attemptId) {
          const pending = activePurchaseAttempt(user.id);
          return Response.json({ error: pending?.provider === "stripe"
            ? "Webの購入手続き中です。完了後に契約状態を更新してください"
            : "App Storeの購入手続き中です。完了を待ってください" }, { status: 409 });
        }
        try {
          if (appleSubscriptionRows(user.id).length) await refreshAppleSubscription(user.id);
          forgetEntitlement(user.id);
          if ((await loadEntitlement(user.id)).writable) throw new Error("すでに契約中です");
          await assertNoStripeContract(user.id);
          // 予約導入前に作られたStripe Checkoutも完了できるため、開始を拒否する。
          const customerId = loadCustomerId(user.id);
          if (customerId) {
            const open = await getStripe().checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
            if (open.data.some((session) => session.metadata?.service === "yuihome")) {
              throw new Error("Webの購入手続き中です。完了後に契約状態を更新してください");
            }
          }
          return Response.json({ attemptId, appAccountToken: appleAccountToken(user.id) });
        } catch (error) {
          releasePurchaseAttempt(user.id, attemptId);
          return Response.json({ error: error instanceof Error ? error.message : "契約状態を確認できません" }, { status: 409 });
        }
      },
      DELETE: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        const body = await request.json().catch(() => null) as { attemptId?: unknown } | null;
        if (typeof body?.attemptId !== "string") return Response.json({ error: "購入識別子がありません" }, { status: 400 });
        releasePurchaseAttempt(user.id, body.attemptId);
        return Response.json({ released: true });
      },
    },
  },
});

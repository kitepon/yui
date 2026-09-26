import { createFileRoute } from "@tanstack/react-router";
import { appleBillingConfigured, refreshAppleSubscription } from "@/lib/server/apple-billing";
import { loadEntitlement, requireUser } from "@/lib/server/billing";

export const Route = createFileRoute("/api/apple/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        if (!appleBillingConfigured()) return Response.json({ error: "Appleの課金設定がありません" }, { status: 503 });
        try {
          await refreshAppleSubscription(user.id);
          return Response.json({ entitlement: await loadEntitlement(user.id) });
        } catch (error) {
          console.error("[yui] Apple契約の再取得に失敗", error);
          return Response.json({ error: "Appleの契約状態を再取得できませんでした" }, { status: 502 });
        }
      },
    },
  },
});

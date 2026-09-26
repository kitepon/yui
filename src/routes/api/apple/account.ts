import { createFileRoute } from "@tanstack/react-router";
import { appleAccountToken, appleBillingConfigured, appleProductIds } from "@/lib/server/apple-billing";
import { requireUser } from "@/lib/server/billing";

export const Route = createFileRoute("/api/apple/account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        if (!appleBillingConfigured()) return Response.json({ error: "Appleの課金設定がありません" }, { status: 503 });
        return Response.json({ appAccountToken: appleAccountToken(user.id), productIds: appleProductIds() });
      },
    },
  },
});

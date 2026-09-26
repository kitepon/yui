import { createFileRoute } from "@tanstack/react-router";
import { billingConfigured, forgetEntitlement, loadEntitlement, loadStripeEntitlement, requireUser } from "@/lib/server/billing";
import { BILLING } from "@/lib/billing-plan";
import { appleBillingConfigured } from "@/lib/server/apple-billing";
import { activePurchaseAttempt } from "@/lib/server/billing-purchase";

export const Route = createFileRoute("/api/stripe/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        const url = new URL(request.url);
        if (url.searchParams.get("refresh") === "1") forgetEntitlement(user.id);
        return Response.json({
          configured: billingConfigured(),
          appleConfigured: appleBillingConfigured(),
          purchasePendingProvider: activePurchaseAttempt(user.id)?.provider ?? null,
          plans: BILLING,
          entitlement: await loadEntitlement(user.id),
          stripeEntitlement: await loadStripeEntitlement(user.id),
        });
      },
    },
  },
});

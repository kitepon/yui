import { createFileRoute } from "@tanstack/react-router";
import { parseBillingPlan, requireUser, startCheckout } from "@/lib/server/billing";

export const Route = createFileRoute("/api/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { plan?: string };
        try {
          const url = await startCheckout({
            userId: user.id,
            email: user.email,
            name: user.name,
            plan: parseBillingPlan(String(body.plan ?? "")),
          });
          return Response.json({ url });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Checkout を作れない" },
            { status: 400 },
          );
        }
      },
    },
  },
});

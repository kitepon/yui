import { createFileRoute } from "@tanstack/react-router";
import { completePurchaseAttempt, purgeEndedPurchaseAttempts } from "@/lib/server/billing-purchase";
import { forgetEntitlement, getStripe, recordWebhookEvent, userIdForCustomerId } from "@/lib/server/billing";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        if (!secret) return new Response("webhook secret missing", { status: 503 });
        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("signature missing", { status: 400 });
        const raw = await request.text();
        try {
          const event = getStripe().webhooks.constructEvent(raw, signature, secret);
          const object = event.data.object as { customer?: string | { id: string } | null };
          const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
          const userId = customerId ? userIdForCustomerId(customerId) : null;
          // 共有口座には他製品のイベントも届く。自分の保存済み顧客のイベントだけ記録し、他は何も書かず 2xx で返す。
          if (userId && recordWebhookEvent(event.id, event.type)) forgetEntitlement(userId);
          // 自分の顧客の購入が済んだら、その手続きの行は要らない。再送でも消えるよう記録の可否とは分ける。
          if (userId && event.type === "checkout.session.completed") {
            completePurchaseAttempt((event.data.object as { id: string }).id);
            purgeEndedPurchaseAttempts();
          }
          return Response.json({ received: true });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "invalid", { status: 400 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { getStripe, recordWebhookEvent } from "@/lib/server/billing";

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
          recordWebhookEvent(event.id, event.type);
          return Response.json({ received: true });
        } catch (err) {
          return new Response(err instanceof Error ? err.message : "invalid", { status: 400 });
        }
      },
    },
  },
});

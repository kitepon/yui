import { createFileRoute } from "@tanstack/react-router";
import { acceptAppleNotification, appleBillingConfigured, AppleBillingInputError } from "@/lib/server/apple-billing";
import { VerificationException, VerificationStatus } from "@apple/app-store-server-library";

export const Route = createFileRoute("/api/apple/notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!appleBillingConfigured()) return Response.json({ error: "Appleの課金設定がありません" }, { status: 503 });
        const body = await request.json().catch(() => null) as { signedPayload?: unknown } | null;
        if (typeof body?.signedPayload !== "string" || !body.signedPayload) {
          return Response.json({ error: "署名データがありません" }, { status: 400 });
        }
        try {
          await acceptAppleNotification(body.signedPayload);
          return Response.json({ received: true });
        } catch (error) {
          const invalid = error instanceof AppleBillingInputError ||
            (error instanceof VerificationException && error.status !== VerificationStatus.RETRYABLE_VERIFICATION_FAILURE);
          console.error("[yui] Apple通知の検証に失敗", error instanceof VerificationException ? error.status : error);
          return Response.json({ error: "Apple通知を確認できませんでした" }, { status: invalid ? 400 : 503 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { acceptAppleTransaction, appleBillingConfigured, AppleBillingInputError } from "@/lib/server/apple-billing";
import { loadEntitlement, requireUser } from "@/lib/server/billing";
import { VerificationException, VerificationStatus } from "@apple/app-store-server-library";

export const Route = createFileRoute("/api/apple/transaction")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        if (!appleBillingConfigured()) return Response.json({ error: "Appleの課金設定がありません" }, { status: 503 });
        const body = await request.json().catch(() => null) as { signedTransaction?: unknown } | null;
        if (typeof body?.signedTransaction !== "string" || !body.signedTransaction) {
          return Response.json({ error: "Appleの取引データがありません" }, { status: 400 });
        }
        try {
          await acceptAppleTransaction(user.id, body.signedTransaction);
          return Response.json({ entitlement: await loadEntitlement(user.id) });
        } catch (error) {
          const invalid = error instanceof AppleBillingInputError ||
            (error instanceof VerificationException && error.status !== VerificationStatus.RETRYABLE_VERIFICATION_FAILURE);
          console.error("[yui] Apple取引の検証に失敗", error instanceof VerificationException ? error.status : error);
          return Response.json({ error: error instanceof AppleBillingInputError ? error.message : "Appleの取引を確認できませんでした" }, { status: invalid ? 400 : 503 });
        }
      },
    },
  },
});

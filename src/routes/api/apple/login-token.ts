import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/server/billing";
import { saveAppleLoginToken } from "@/lib/server/apple-login";

export const Route = createFileRoute("/api/apple/login-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        const body = await request.json().catch(() => null) as { authorizationCode?: unknown } | null;
        if (typeof body?.authorizationCode !== "string" || !body.authorizationCode) {
          return Response.json({ error: "Appleの認可コードがありません" }, { status: 400 });
        }
        try {
          await saveAppleLoginToken(user.id, body.authorizationCode);
          return Response.json({ success: true });
        } catch (error) {
          console.error("[yui] Appleログインの認可コード交換に失敗", error);
          return Response.json({ error: "Appleログインを完了できませんでした" }, { status: 503 });
        }
      },
    },
  },
});

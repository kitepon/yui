import { createFileRoute } from "@tanstack/react-router";
import { requireUser, startPortal } from "@/lib/server/billing";

export const Route = createFileRoute("/api/stripe/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401 });
        try {
          const url = await startPortal(user.id);
          return Response.json({ url });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "契約管理を開けない" },
            { status: 400 },
          );
        }
      },
    },
  },
});

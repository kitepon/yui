import { createFileRoute } from "@tanstack/react-router";
import { ensureHome } from "@/lib/server/home-db";
import { hostedEnabled } from "@/lib/server/hosted/config";
import { resolveHostedOwner } from "@/lib/server/hosted/library";
import { PaidDateError, statePaidUntil } from "@/lib/server/hosted/paid";
import { getSqlite } from "@/lib/server/sqlite";

/** Any key of the entry, from app code only, states the date its own store gave (docs/hosted-login-billing-contract.md). */
export const Route = createFileRoute("/api/home/paid-until")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hostedEnabled()) return new Response("Not Found", { status: 404 });
        const who = await resolveHostedOwner(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { paidUntil?: unknown };
        await ensureHome(who.id);
        try {
          const stored = statePaidUntil(getSqlite(), who.id, body.paidUntil);
          return Response.json({ paidUntil: stored });
        } catch (err) {
          if (err instanceof PaidDateError) return Response.json({ error: err.message }, { status: 400 });
          throw err;
        }
      },
    },
  },
});

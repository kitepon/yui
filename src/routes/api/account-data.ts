import { createFileRoute } from "@tanstack/react-router";
import { clientHome, loadHome } from "@/lib/server/home-db";
import { hostedEnabled } from "@/lib/server/hosted/config";
import { deleteAccountData } from "@/lib/server/hosted/entry-events";
import { resolveHostedOwner } from "@/lib/server/hosted/library";
import { getSqlite } from "@/lib/server/sqlite";

/** DELETE: step 1 of account deletion (then keys/others, leave, and the device key). GET: export of the home without vendor secrets. */
export const Route = createFileRoute("/api/account-data")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        if (!hostedEnabled()) return new Response("Not Found", { status: 404 });
        const who = await resolveHostedOwner(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        const deleted = deleteAccountData(getSqlite(), who.id);
        return Response.json({ deleted }, { status: deleted ? 200 : 404 });
      },
      GET: async ({ request }) => {
        if (!hostedEnabled()) return new Response("Not Found", { status: 404 });
        const who = await resolveHostedOwner(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        const { snap } = await loadHome(who.id);
        return Response.json(clientHome(snap, request.headers.get("host")));
      },
    },
  },
});

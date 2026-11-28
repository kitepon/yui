import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { revokeAppleLogin } from "@/lib/server/apple-login";
import { ClaimError, claimLegacyHome } from "@/lib/server/hosted/claim";
import { hostedEnabled } from "@/lib/server/hosted/config";
import { resolveHostedOwner } from "@/lib/server/hosted/library";
import { getSqlite } from "@/lib/server/sqlite";

/** The claim window is open from the switch day until YUI_CLAIM_UNTIL (ISO date); after it the route is gone. */
function windowOpen() {
  const until = Date.parse(process.env.YUI_CLAIM_UNTIL ?? "");
  return Number.isFinite(until) && Date.now() < until;
}

/** The old login, once: Apple or Google identity token, or e-mail + password. Better Auth is the legacy checker; whatever it creates for an unknown person is removed. */
async function legacyUserId(proof: Record<string, unknown>) {
  const db = getSqlite();
  const before = new Set((db.prepare('SELECT id FROM "user"').all() as { id: string }[]).map((r) => r.id));
  let id: string | undefined;
  if (proof.method === "password") {
    const res = await auth.api.signInEmail({ body: { email: String(proof.email ?? ""), password: String(proof.password ?? "") } });
    id = res?.user?.id;
  } else if (proof.method === "apple" || proof.method === "google") {
    const res = await auth.api.signInSocial({ body: { provider: proof.method, idToken: { token: String(proof.idToken ?? "") } } });
    id = (res as { user?: { id?: string } } | undefined)?.user?.id;
  }
  if (id && !before.has(id)) {
    db.prepare('DELETE FROM "user" WHERE id = ?').run(id); // a stranger's sign-in made a new user: nothing to claim, and nothing to keep
    return undefined;
  }
  return id;
}

export const Route = createFileRoute("/api/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!hostedEnabled() || !windowOpen()) return new Response("Not Found", { status: 404 });
        const who = await resolveHostedOwner(request);
        if (!who) return Response.json({ error: "unauthorized" }, { status: 401 });
        const proof = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        let legacy: string | undefined;
        try {
          legacy = await legacyUserId(proof);
        } catch {
          legacy = undefined;
        }
        if (!legacy) return Response.json({ error: "the old login could not be proven" }, { status: 401 });
        try {
          await revokeAppleLogin(legacy);
          claimLegacyHome(getSqlite(), who.id, legacy);
          return Response.json({ ok: true });
        } catch (err) {
          if (err instanceof ClaimError) return Response.json({ error: err.message }, { status: err.status });
          throw err;
        }
      },
    },
  },
});

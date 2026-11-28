import { createFileRoute } from "@tanstack/react-router";
import { hostedEnabled, hostedOrigin } from "@/lib/server/hosted/config";
import { getKeyholes, toKeyholeRequest } from "@/lib/server/hosted/library";

const CORS_HEADERS = "Content-Type, Login-Billing-Key";
/** The browser child runs on the hosted origin only. */
function corsFor(request: Request, res: Response) {
  const origin = request.headers.get("origin");
  if (origin && origin === hostedOrigin()) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

// keys/start, accept, admit, others, leave, me (the library matches the end of the path).
async function serve(request: Request) {
  if (!hostedEnabled()) return new Response("Not Found", { status: 404 });
  if (request.method === "OPTIONS") return corsFor(request, new Response(null, { status: 204 }));
  const res = await (await getKeyholes()).handle(await toKeyholeRequest(request));
  return corsFor(request, res);
}

export const Route = createFileRoute("/api/keys/$")({
  server: { handlers: { GET: ({ request }) => serve(request), POST: ({ request }) => serve(request), OPTIONS: ({ request }) => serve(request) } },
});

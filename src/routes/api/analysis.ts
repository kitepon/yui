import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/lib/server/billing";
import { loadHome } from "@/lib/server/home-db";
import { ANALYSIS_RETENTION_MS } from "@/lib/home/analysis-series";
import { loadAnalysis, unauthorizedAnalysis } from "@/lib/server/analysis";

function clampRange(fromRaw: string | null, toRaw: string | null) {
  const now = Date.now();
  const maxFrom = new Date(now - ANALYSIS_RETENTION_MS).toISOString();
  const fallbackTo = new Date(now).toISOString();
  const fallbackFrom = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const fromTime = fromRaw ? Date.parse(fromRaw) : NaN;
  const toTime = toRaw ? Date.parse(toRaw) : NaN;
  const from = Number.isNaN(fromTime) ? fallbackFrom : new Date(fromTime).toISOString();
  const to = Number.isNaN(toTime) ? fallbackTo : new Date(toTime).toISOString();
  return {
    from: from < maxFrom ? maxFrom : from,
    to,
  };
}

export const Route = createFileRoute("/api/analysis")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await requireUser(request);
        if (!user) return unauthorizedAnalysis();
        const { id, snap } = await loadHome(user.id);
        const url = new URL(request.url);
        const { from, to } = clampRange(url.searchParams.get("from"), url.searchParams.get("to"));
        return Response.json(loadAnalysis(id, from, to, snap));
      },
    },
  },
});

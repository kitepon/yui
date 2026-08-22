import { createFileRoute } from "@tanstack/react-router";
import { backupConfigured, pushBackup, restoreLatest } from "@/lib/server/home-backup";

function requireOps(request: Request) {
  const secret = process.env.YUI_BACKUP_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token === secret;
}

export const Route = createFileRoute("/api/ops/backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireOps(request)) {
          return Response.json({ error: "権限が無い" }, { status: 401 });
        }
        if (!backupConfigured()) {
          return Response.json({ error: "バックアップ先が無い" }, { status: 503 });
        }
        const body = (await request.json().catch(() => ({}))) as { op?: string };
        if (body.op === "backup") {
          const info = await pushBackup();
          return Response.json(info);
        }
        if (body.op === "restore") {
          await restoreLatest();
          return Response.json({ ok: true, restored: "yuihome/latest.enc" });
        }
        return Response.json({ error: "op は backup か restore" }, { status: 400 });
      },
    },
  },
});

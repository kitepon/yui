/**
 * 家サーバーが暗号化済みスナップショットを置く扉。
 * 正本は家の SQLite。ここは予備。Google / Stripe は扱わない。
 */
export interface Env {
  BACKUP: R2Bucket;
  BACKUP_SECRET: string;
}

const KEY = /^yuihome\/[A-Za-z0-9._-]+$/;

function deny(status: number, message: string) {
  return new Response(message, { status });
}

function authorize(request: Request, env: Env) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.BACKUP_SECRET) && token === env.BACKUP_SECRET;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!authorize(request, env)) return deny(401, "unauthorized");
    const key = new URL(request.url).pathname.replace(/^\/+/, "");
    if (!KEY.test(key)) return deny(400, "bad key");

    if (request.method === "PUT") {
      if (!request.body) return deny(400, "empty");
      await env.BACKUP.put(key, request.body);
      return new Response("ok");
    }
    if (request.method === "GET") {
      const obj = await env.BACKUP.get(key);
      if (!obj) return deny(404, "missing");
      return new Response(obj.body, {
        headers: { "content-type": "application/octet-stream" },
      });
    }
    return deny(405, "method");
  },
};

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, authEnabled, signInWithGoogle } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function safeNext() {
  if (typeof window === "undefined") return "/";
  const next = new URL(window.location.href).searchParams.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function Login() {
  const next = safeNext();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google で入れない");
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({ email, password, name: name || email });
        if (res.error) throw new Error(res.error.message || "登録できません");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message || "ログインできません");
      }
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center bg-bg px-6">
      <form className="w-full max-w-sm" onSubmit={(e) => void submit(e)}>
        <p className="text-xs tracking-[0.2em] text-faint">YUI</p>
        <h1 className="mt-2 font-display text-4xl text-fg">結に入る</h1>
        <p className="mt-2 mb-8 text-sm text-muted">自分の家だけが見えます。アカウントが必要です。</p>
        {authEnabled ? (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full"
              disabled={busy}
              onClick={() => void startGoogle()}
            >
              Googleで入る
            </Button>
            <p className="py-1 text-center text-xs text-faint">または</p>
            {mode === "up" ? (
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">名前</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">メール</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">パスワード</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
              />
            </label>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" className="h-12 w-full" disabled={busy}>
              {mode === "up" ? "アカウントを作る" : "入る"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted"
              onClick={() => setMode(mode === "up" ? "in" : "up")}
            >
              {mode === "up" ? "すでにアカウントがある" : "初めてなら作成する"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">サインインはオフです。</p>
        )}
      </form>
    </main>
  );
}

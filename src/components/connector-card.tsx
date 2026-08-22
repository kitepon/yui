import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui/button";

export function ConnectorCard({
  title,
  badge,
  desc,
  helpTo,
  connected,
  deviceCount,
  error,
  busy,
  onSync,
  children,
}: {
  title: string;
  badge: string;
  desc: string;
  helpTo?: "/help/remo" | "/help/switchbot" | "/help/tuya";
  connected: boolean;
  deviceCount: number;
  error?: string;
  busy?: boolean;
  onSync: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-faint">{badge}</p>
          <h2 className="mt-0.5 text-lg font-medium text-fg">{title}</h2>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-1 text-[11px] text-ok">
            <Check className="size-3" />
            {deviceCount}台
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-1 text-[11px] text-muted">未接続</span>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">{desc}</p>
      {helpTo ? (
        <Link to={helpTo} className="mt-2 inline-flex min-h-11 items-center text-sm text-primary">
          取得手順を見る
        </Link>
      ) : null}
      {children}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <Button className="mt-4 w-full" variant="outline" onClick={onSync} disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
        同期する
      </Button>
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  secret,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      <input
        type={secret ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg outline-none placeholder:text-faint focus:border-primary"
      />
    </label>
  );
}

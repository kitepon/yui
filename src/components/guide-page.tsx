import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export function GuidePage({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <header className="px-5 pt-6">
        <Link to="/settings" className="text-sm text-primary">
          接続に戻る
        </Link>
        <p className="mt-4 text-[11px] tracking-[0.22em] text-faint">{kicker}</p>
        <h1 className="mt-1 font-display text-3xl font-medium text-fg">{title}</h1>
      </header>
      <div className="mt-6 space-y-6 px-5 pb-4 text-sm leading-relaxed text-muted">{children}</div>
    </AppShell>
  );
}

export function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-fg">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-border bg-surface px-3 py-3 text-sm text-muted">{children}</p>;
}

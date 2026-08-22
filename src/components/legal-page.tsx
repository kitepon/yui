import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-fg">
      <p className="text-xs tracking-[0.2em] text-faint">YUIHOME</p>
      <h1 className="mt-2 font-display text-3xl font-medium">{title}</h1>
      <div className="prose-legal mt-6 space-y-5 text-sm leading-7 text-muted">{children}</div>
      <p className="mt-10 text-sm">
        <Link to="/" className="text-primary underline">
          家に戻る
        </Link>
      </p>
    </main>
  );
}

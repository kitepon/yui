import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** kitepon.dev 共通の規約・ポリシーの付属であることを示す、共通ヘッダー（ポリの指定文）。 */
function AnnexHeader() {
  return (
    <p className="rounded-md border border-border p-3 text-xs leading-6 text-muted">
      運営：kitepon.dev（屋号。運営：クオ）。このページは kitepon.dev の
      <a className="underline" href="https://kitepon.dev/terms/">利用規約</a>・
      <a className="underline" href="https://kitepon.dev/privacy/">プライバシーポリシー</a>
      の付属規約（付属ポリシー）です。共通の内容（販売者の表示、支払い、解約、返金、免責、準拠法）は共通のページに従います。
    </p>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-fg">
      <p className="text-xs tracking-[0.2em] text-faint">YUIHOME</p>
      <h1 className="mt-2 font-display text-3xl font-medium">{title}</h1>
      <div className="mt-4">
        <AnnexHeader />
      </div>
      <p className="mt-3 text-xs text-faint">制定日 2026年11月20日</p>
      <div className="prose-legal mt-6 space-y-5 text-sm leading-7 text-muted">{children}</div>
      <p className="mt-10 text-sm">
        <Link to="/" className="text-primary underline">
          家に戻る
        </Link>
      </p>
    </main>
  );
}

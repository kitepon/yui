import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー">
      <section>
        <h2 className="font-medium text-fg">取得する情報</h2>
        <p>アカウントのメールと名前、家の設定、家電クラウドへ接続するためのトークン（サーバー上で暗号化して保存）、決済に必要な識別子です。カード番号は結に保存しません。決済は Stripe が扱います。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用目的</h2>
        <p>家電の操作、オートメーション、契約の確認、障害対応、法令上の義務の履行に使います。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">委託</h2>
        <p>決済は Stripe、公開面の一部は Cloudflare を使います。それぞれ必要な範囲だけ渡します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">問い合わせ</h2>
        <p>
          <a href="mailto:kitepon@gmail.com">kitepon@gmail.com</a>
        </p>
      </section>
    </LegalPage>
  );
}

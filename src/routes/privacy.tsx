import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー">
      <section>
        <h2 className="font-medium text-fg">取得する情報</h2>
        <p>アカウントのメールと名前、家の設定、家電クラウドへ接続するためのトークン、決済に必要な識別子、検証用のセンサー値と操作履歴です。トークンはサーバー上で暗号化して保存し、画面や API の応答に平文を出しません。カード番号は結に保存せず、Web決済はStripe、iPhoneアプリの課金はAppleが扱います。Apple契約の識別子と検証済みの状態を保存します。センサー値と操作履歴は一定期間のあと消します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用目的</h2>
        <p>家電の操作、オートメーションの実行、契約の確認、障害対応、法令上の義務の履行に使います。広告には使わず、第三者に販売しません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">委託</h2>
        <p>Web決済はStripe、iPhoneアプリの課金はApple、公開面の一部はCloudflareを使います。Googleでログインする場合はGoogleが認証を扱います。それぞれ必要な範囲だけ渡します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">削除</h2>
        <p>アカウントの削除を希望する場合は下記へ連絡してください。家のデータと保存済みトークンを消します。</p>
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

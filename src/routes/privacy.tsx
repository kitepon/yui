import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー">
      <section>
        <h2 className="font-medium text-fg">取得する情報</h2>
        <p>アカウントのメールと名前、家や機器の設定と識別子、家電クラウドへ接続するためのトークン、Appleログインを解除するためのトークン、決済に必要な識別子、センサー値と操作履歴です。トークンはサーバー上で暗号化して保存し、画面や API の応答に平文を出しません。カード番号は結に保存せず、Web決済はStripe、iPhoneアプリの課金はAppleが扱います。Apple契約の識別子と検証済みの状態を保存します。センサー値と操作履歴は14日後に消します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用目的</h2>
        <p>家電の操作、オートメーションの実行、契約の確認、障害対応、法令上の義務の履行に使います。広告には使わず、第三者に販売しません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">委託</h2>
        <p>Web決済はStripe、iPhoneアプリの課金はApple、公開面の一部はCloudflareを使います。GoogleまたはAppleでログインする場合は各社が認証を扱います。それぞれ必要な範囲だけ渡します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">削除</h2>
        <p>Web版の接続画面、またはiPhoneアプリの設定からアカウントを削除できます。本番データから家の設定と記録、保存済みトークンを消し、Web契約を終了します。Appleでの契約はAppleの管理画面から別途解約してください。削除済み契約への通知と復旧を処理するため、Appleの元の取引IDと削除済みアカウントIDを保持します。暗号化された過去のバックアップには、削除前の情報が残る場合があります。</p>
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

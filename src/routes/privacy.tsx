import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="プライバシーポリシー">
      <section>
        <h2 className="font-medium text-fg">取得する情報</h2>
        <p>アカウントのメールと名前、家や機器の設定と識別子、家電クラウドへ接続するためのトークン、Appleログインを解除するためのトークン、決済に必要な識別子、ログインの記録（IPアドレスと端末の情報）、センサー値と操作履歴です。トークンはサーバー上で暗号化して保存し、画面や API の応答に平文を出しません。カード番号は結に保存せず、Web決済はStripe、iPhoneアプリの課金はAppleが扱います。Apple契約の識別子と検証済みの状態を保存します。センサー値と操作履歴は14日後に消します。ほかの情報は、アカウントを削除するまで保存します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用目的</h2>
        <p>家電の操作、オートメーションの実行、契約の確認、障害対応、法令上の義務の履行に使います。広告には使わず、第三者に販売しません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">使っている外部サービスと、情報が扱われる国</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Stripe（Stripe Japan 株式会社、Stripe, LLC。日本、米国）：Web決済と契約管理</li>
          <li>Apple（米国）：iPhoneアプリの課金、Appleでのログイン</li>
          <li>Google LLC（米国）：Googleでのログイン、Google Fonts（結のページを開くと、ブラウザがGoogle LLCへ直接接続します）</li>
          <li>Cloudflare, Inc.（米国）：配信、攻撃からの保護、暗号化したバックアップの保管</li>
          <li>Amazon（Alexaと連携する場合）、SwitchBot、Nature Remo、Tuya（Smart Life）、ダイキン：利用者がその会社と結んでいるサービスです。登録した家電を操作するため、利用者が登録した鍵で結のサーバーから接続します。情報は各社が自社のポリシーで扱い、扱われる国も各社のポリシーのとおりです。</li>
        </ul>
        <p>それぞれ必要な範囲だけ渡します。共通の外部サービスと国の説明は、kitepon.dev のプライバシーポリシーにもあります。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">Cookie</h2>
        <p>ログインを保つためのセッションの Cookie だけを使います。広告や追跡には使いません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">削除</h2>
        <p>Web版の接続画面、またはiPhoneアプリの設定からアカウントを削除できます。本番データから家の設定と記録、保存済みトークンを消し、Web契約を終了します。Appleでの契約はAppleの管理画面から別途解約してください。削除済み契約への通知と復旧を処理するため、Appleの元の取引IDと削除済みアカウントIDを保持します。暗号化された過去のバックアップには、削除前の情報が残る場合があります。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">問い合わせ</h2>
        <p>
          <a href="mailto:quolu@kitepon.dev">quolu@kitepon.dev</a>
        </p>
      </section>
    </LegalPage>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/support")({ component: Support });

function Support() {
  return (
    <LegalPage title="結のサポート">
      <section>
        <h2 className="font-medium text-fg">お問い合わせ</h2>
        <p>ログイン、家電の接続、操作、契約について、状況とお使いの端末を添えて <a href="mailto:kitepon@gmail.com?subject=%E7%B5%90%E3%81%AE%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88">kitepon@gmail.com</a> へご連絡ください。パスワードや家電のアクセストークンは送らないでください。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">契約の確認</h2>
        <p>iPhoneで購入した契約は<a href="https://apps.apple.com/account/subscriptions">Appleのサブスクリプション管理</a>、Webで購入した契約は結のWeb版のアカウント設定から確認できます。iPhoneアプリの「購入を復元・契約状態を更新」もお試しください。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">各社の接続方法</h2>
        <p><a href="/help/remo">Nature Remo</a>、<a href="/help/switchbot">SwitchBot</a>、<a href="/help/tuya">Smart Life</a> の設定手順をご案内しています。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">アカウントの削除</h2>
        <p>iPhoneアプリの設定、または<a href="/settings">Web版の接続画面</a>から削除できます。Appleでの契約は削除前に<a href="https://apps.apple.com/account/subscriptions">サブスクリプション管理</a>で解約してください。</p>
      </section>
    </LegalPage>
  );
}

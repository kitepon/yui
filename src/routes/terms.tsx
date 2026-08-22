import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <LegalPage title="利用規約">
      <section>
        <h2 className="font-medium text-fg">サービスの内容</h2>
        <p>結は、利用者が登録した家電クラウド（SwitchBot、Nature Remo、Smart Life 等）を、結のサーバー経由で操作するサービスです。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">料金</h2>
        <p>1つの家あたり月額300円または年額3,000円（税込）です。Stripe Checkout で支払い方法を登録すると14日間無料で使え、終了後は選んだプランへ自動移行して課金します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">契約と解約</h2>
        <p>Checkout 完了時点で無料体験が始まります。体験中に解約すれば初回課金はありません。有料期間の解約は期間末で終わります。未利用期間の日割りはしません。二重請求や運営の責任による利用不能は個別に対応します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用停止</h2>
        <p>有効な契約がない場合、家電の操作はできません。閲覧と契約の開始・再開だけできます。</p>
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

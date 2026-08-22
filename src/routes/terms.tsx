import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { BILLING } from "@/lib/billing-plan";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  const monthly = BILLING.monthlyYen.toLocaleString("ja-JP");
  const annual = BILLING.annualYen.toLocaleString("ja-JP");
  return (
    <LegalPage title="利用規約">
      <section>
        <h2 className="font-medium text-fg">サービスの内容</h2>
        <p>結は、利用者が登録した家電クラウド（SwitchBot、Nature Remo、Smart Life 等）と、同じ宅内ネットワークにある対応機器を、結のサーバー経由で操作するサービスです。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">料金</h2>
        <p>1つの家あたり月額{monthly}円または年額{annual}円（税込）です。Stripe Checkout で支払い方法を登録すると{BILLING.trialDays}日間無料で使え、終了後は選んだプランへ自動移行して課金します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">契約と解約</h2>
        <p>Checkout 完了時点で無料体験が始まります。体験中に解約すれば課金はありません。有料期間の解約は期間末で終わります。未利用期間の日割りはしません。二重請求や運営の責任による利用不能は個別に対応します。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用停止</h2>
        <p>有効な契約がない場合、家電の操作はできません。閲覧と契約の開始・再開だけできます。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">無保証</h2>
        <p>結は現状有姿で提供します。家電の動作、常時の稼働、データの保全を保証しません。家電クラウドや機器の仕様変更、通信の障害、サーバーの停止によって操作できないことがあります。冷暖房や施錠など、動かないと困る用途では、必ず純正のリモコンやアプリを併用してください。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">提供の終了</h2>
        <p>個人が運営するサービスであり、内容の変更や提供の終了があり得ます。終了する場合は可能な限り事前に告知し、前払いを受けている期間があれば個別に対応します。結はオープンソースなので、終了後も自分のサーバーで動かし続けられます。</p>
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

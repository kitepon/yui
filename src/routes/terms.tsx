import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <LegalPage title="利用規約">
      <section>
        <h2 className="font-medium text-fg">サービスの内容</h2>
        <p>結は、利用者が登録した家電クラウド（SwitchBot、Nature Remo、Smart Life 等）と、同じ宅内ネットワークにある対応機器を、結のサーバー経由で操作するサービスです。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">料金</h2>
        <p>無料です。課金も広告もありません。機能の制限もなく、支払い方法の登録を求めることもありません。開発への寄付を受け付けることがありますが、任意であり、寄付の有無で使える機能は変わりません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">無保証</h2>
        <p>結は現状有姿で提供します。家電の動作、常時の稼働、データの保全を保証しません。家電クラウドや機器の仕様変更、通信の障害、サーバーの停止によって操作できないことがあります。冷暖房や施錠など、動かないと困る用途では、必ず純正のリモコンやアプリを併用してください。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用者の責任</h2>
        <p>登録した家電クラウドのトークンと、それによって操作される機器の管理は利用者の責任です。結の利用によって生じた損害について、運営は責任を負いません。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">停止と変更</h2>
        <p>個人が運営する無料のサービスであり、予告なく内容を変更し、また提供を終了することがあります。終了する場合は、可能な限り事前に告知します。結はオープンソースなので、終了後も自分のサーバーで動かし続けられます。</p>
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

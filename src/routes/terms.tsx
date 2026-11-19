import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <LegalPage title="結 付属規約">
      <section>
        <h2 className="font-medium text-fg">サービスの内容</h2>
        <p>結は、利用者が登録した家電クラウド（SwitchBot、Nature Remo、Smart Life 等）と、同じ宅内ネットワークにある対応機器を、結のサーバー経由で操作するサービスです。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">料金・契約・解約・返金</h2>
        <p>
          料金、支払い、無料体験、解約、返金は、kitepon.dev の
          <a className="underline" href="https://kitepon.dev/terms/">利用規約</a>と
          <a className="underline" href="https://kitepon.dev/specified-commercial-transactions/#yui">特定商取引法に基づく表記（結）</a>
          のとおりです。iPhoneアプリからの契約はApp Storeの規約と購入画面に従います。
        </p>
      </section>
      <section>
        <h2 className="font-medium text-fg">利用停止</h2>
        <p>有効な契約がない場合、家電の操作はできません。閲覧と契約の開始・再開だけできます。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">安全のための注意</h2>
        <p>家電クラウドや機器の仕様変更、通信の障害、サーバーの停止によって操作できないことがあります。次の用途には結を頼らないでください。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>人がいない時の暖房・冷房など、動かないと困る家電の運転</li>
          <li>医療や健康の管理に関わる機器</li>
          <li>防犯や施錠</li>
        </ul>
        <p>純正のリモコンとアプリは、必ず手元に残してください。</p>
      </section>
      <section>
        <h2 className="font-medium text-fg">提供の終了</h2>
        <p>サービスの変更と終了は、kitepon.dev の利用規約（第11条）のとおりです。結はオープンソースなので、終了後も自分のサーバーで動かし続けられます。</p>
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

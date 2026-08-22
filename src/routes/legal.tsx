import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/legal")({ component: Legal });

function Legal() {
  return (
    <LegalPage title="特定商取引法に基づく表記">
      <dl className="space-y-3">
        <div>
          <dt className="text-xs text-faint">販売事業者 / 運営責任者 / 所在地・電話番号</dt>
          <dd>請求があれば遅滞なく開示します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">開示の請求方法</dt>
          <dd>
            <a href="mailto:kitepon@gmail.com?subject=%E7%B5%90%20%E7%89%B9%E5%95%86%E6%B3%95%E8%A1%A8%E7%A4%BA%E3%81%AE%E9%96%8B%E7%A4%BA%E8%AB%8B%E6%B1%82">
              kitepon@gmail.com
            </a>
            へ「結 特商法表示の開示請求」と書いて送ってください。申込みの判断に間に合うようメールで開示します。
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">販売価格</dt>
          <dd>1つの家あたり月額300円または年額3,000円（税込）</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">販売URL</dt>
          <dd>
            <a href="https://yuihome.kitepon.dev">https://yuihome.kitepon.dev</a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">販売価格以外の負担</dt>
          <dd>インターネット接続料金、通信料金は利用者の負担です。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">支払方法</dt>
          <dd>Stripe Checkout によるクレジットカード、Apple Pay、Google Pay</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">支払時期</dt>
          <dd>初回は支払い方法の登録後14日間無料。その後、選んだ月額または年額を決済し、以降は更新日に自動決済します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">サービス提供時期</dt>
          <dd>Checkout 完了の確認後。無料体験中は14日間0円です。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">解約</dt>
          <dd>Stripe の契約管理からいつでも手続きでき、現在の契約期間末に終了します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">返品・返金</dt>
          <dd>デジタルサービスの性質上、申込み後の返品と未利用期間の日割りはしません。二重請求、運営の責任による利用不能、法令上必要な場合は個別に対応します。</dd>
        </div>
      </dl>
    </LegalPage>
  );
}

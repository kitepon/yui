import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { BILLING } from "@/lib/billing-plan";

export const Route = createFileRoute("/legal")({ component: Legal });

function Legal() {
  const monthly = BILLING.monthlyYen.toLocaleString("ja-JP");
  const annual = BILLING.annualYen.toLocaleString("ja-JP");
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
          <dd>1つの家あたり月額{monthly}円または年額{annual}円（税込）</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">価格以外に必要な費用</dt>
          <dd>インターネットの通信料は利用者の負担です。ほかに手数料はありません。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">支払方法</dt>
          <dd>クレジットカード、Apple Pay、Google Pay（決済は Stripe が扱います）</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">支払時期</dt>
          <dd>初回は支払い方法の登録後{BILLING.trialDays}日間無料。その後、選んだ月額または年額を決済し、以降は更新日に自動決済します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">提供時期</dt>
          <dd>Checkout 完了の確認後。無料体験中は{BILLING.trialDays}日間0円です。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">解約</dt>
          <dd>Stripe の契約管理からいつでも手続きでき、現在の契約期間末に終了します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">返品・返金</dt>
          <dd>デジタルサービスの性質上、申込み後の返品と未利用期間の日割りはしません。二重請求、運営の責任による利用不能、法令上必要な場合は個別に対応します。</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">動作環境</dt>
          <dd>最新のブラウザ（iOS Safari、Android Chrome、PC 各種）。操作したい家電のクラウドに接続できることが必要です。</dd>
        </div>
      </dl>
    </LegalPage>
  );
}

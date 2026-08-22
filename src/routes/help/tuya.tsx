import { createFileRoute } from "@tanstack/react-router";
import { GuidePage, Note, Steps } from "@/components/guide-page";

export const Route = createFileRoute("/help/tuya")({ component: TuyaHelp });

function TuyaHelp() {
  return (
    <GuidePage kicker="SMART LIFE / TUYA" title="ID の取り方">
      <p>必要なのは3つです。Access ID、Access Secret、UID。Tuya の開発者サイトと Smart Life アプリを使います。</p>

      <div>
        <h2 className="font-display text-xl text-fg">1. 開発者アカウント</h2>
        <Steps
          items={[
            "ブラウザで iot.tuya.com を開く",
            "メールで開発者登録し、ログインする（Smart Life アプリとは別登録です）",
          ]}
        />
      </div>

      <div>
        <h2 className="font-display text-xl text-fg">2. クラウドプロジェクト</h2>
        <Steps
          items={[
            "Cloud → Development → Create Cloud Project",
            "Development Method は Smart Home にする",
            "Data Center はアプリの地域に合わせる。日本アカウントは Western America が多い。ダメなら Central Europe、その次に Japan",
            "作成後、API 認可で Smart Home Basic Service を入れる",
          ]}
        />
      </div>

      <div>
        <h2 className="font-display text-xl text-fg">3. Access ID と Secret</h2>
        <Steps
          items={[
            "作ったプロジェクトの Overview を開く",
            "Authorization Key の Access ID（Client ID）と Access Secret をコピーする",
          ]}
        />
        <Note>Secret は一度しか出ないことが多いです。すぐ控えてください。</Note>
      </div>

      <div>
        <h2 className="font-display text-xl text-fg">4. Smart Life をリンクして UID</h2>
        <Steps
          items={[
            "同じプロジェクトの Devices を開く",
            "Link Tuya App Account → Add App Account",
            "出た QR を Smart Life アプリで読み取る",
            "連携ユーザー一覧に出る UID をコピーする",
          ]}
        />
        <Note>
          UID は Access ID ではありません。QR 連携した Smart Life ユーザーの ID です。アプリの地域は 私 → 設定 →
          アカウントとセキュリティ → 地域 で確認できます。
        </Note>
      </div>

      <div>
        <h2 className="font-display text-xl text-fg">5. 結に入れる</h2>
        <Steps
          items={[
            "接続タブの Smart Life に3つ貼る",
            "データセンターは Western America、または自動",
            "同期する",
          ]}
        />
      </div>

      <p>
        開発者サイトは{" "}
        <a className="text-primary underline" href="https://iot.tuya.com" target="_blank" rel="noreferrer">
          iot.tuya.com
        </a>{" "}
        です。
      </p>
    </GuidePage>
  );
}

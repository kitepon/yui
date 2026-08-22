import { createFileRoute } from "@tanstack/react-router";
import { GuidePage, Note, Steps } from "@/components/guide-page";

export const Route = createFileRoute("/help/switchbot")({ component: SwitchbotHelp });

function SwitchbotHelp() {
  return (
    <GuidePage kicker="SWITCHBOT" title="トークンの取り方">
      <p>SwitchBot アプリ（バージョン 6.24 以降）から出します。トークンとシークレットの両方が必要です。</p>
      <Steps
        items={[
          "SwitchBot アプリを開く",
          "プロフィール → 設定 → 基本データ へ進む",
          "アプリバージョンの数字を 5〜15 回、連続でタップする",
          "開発者向けオプション が出たら開く",
          "トークン と シークレット（クライアントシークレット）をコピーする",
          "結の接続タブ → SwitchBot に両方貼り、同期する",
        ]}
      />
      <Note>
        「このアプリについて」という項目はありません。たどり着けないときは 設定 → 基本データ → アプリバージョン
        です。ログアウトや再ログインで値が変わることがあります。動かなくなったら取り直してください。
      </Note>
    </GuidePage>
  );
}

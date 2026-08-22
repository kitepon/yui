import { createFileRoute } from "@tanstack/react-router";
import { GuidePage, Note, Steps } from "@/components/guide-page";

export const Route = createFileRoute("/help/remo")({ component: RemoHelp });

function RemoHelp() {
  return (
    <GuidePage kicker="NATURE REMO" title="トークンの取り方">
      <p>Nature Remo アプリと同じアカウントで、ブラウザから発行します。</p>
      <Steps
        items={[
          "ブラウザで home.nature.global を開く",
          "Remo アプリと同じメールアドレスでログインする",
          "Generate access token（アクセストークンを発行）を押す",
          "表示された文字列をコピーする",
          "結の接続タブ → Nature Remo に貼り、同期する",
        ]}
      />
      <Note>
        トークンは再表示できないことが多いです。控えたらすぐ結に貼ってください。他人には見せないでください。
      </Note>
      <p>
        公式の発行ページは{" "}
        <a className="text-primary underline" href="https://home.nature.global" target="_blank" rel="noreferrer">
          home.nature.global
        </a>{" "}
        です。
      </p>
    </GuidePage>
  );
}

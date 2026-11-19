import { createFileRoute, redirect } from "@tanstack/react-router";

// 特商法表示は kitepon.dev の共通ページ（結の欄 #yui）が正本。
export const Route = createFileRoute("/legal")({
  beforeLoad: () => {
    throw redirect({ href: "https://kitepon.dev/specified-commercial-transactions/#yui" });
  },
});

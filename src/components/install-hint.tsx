import { useEffect, useState } from "react";

export function isStandaloneApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!isStandaloneApp());
  }, []);

  if (!show) return null;

  return (
    <a
      href="/?install=1&platform=ios"
      className="mt-4 flex min-h-12 items-center justify-between rounded-md border border-border bg-surface px-3 py-3 text-sm text-fg"
    >
      <span>ホーム画面に置く</span>
      <span className="text-primary">追加</span>
    </a>
  );
}

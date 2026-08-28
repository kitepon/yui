import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RequireAuth } from "@/lib/auth/gates";
import { ConnectorCard, Field } from "@/components/connector-card";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { saveCredentials, serverSync } from "@/lib/home/control-client";
import { BILLING } from "@/lib/billing-plan";
import { useHome } from "@/lib/home/store";
import { useHomeHydrated } from "@/lib/home/use-hydrated";

export const Route = createFileRoute("/settings")({
  component: () => (
    <RequireAuth>
      <SettingsPage />
    </RequireAuth>
  ),
});

export function SettingsPage() {
  const ready = useHomeHydrated();
  const { user, isPending } = useCurrentUserState();
  const credentials = useHome((s) => s.credentials);
  const setCredentials = useHome((s) => s.setCredentials);
  const connectors = useHome((s) => s.connectors);
  const resetDemo = useHome((s) => s.resetDemo);
  const setConnector = useHome((s) => s.setConnector);
  const pairPin = useHome((s) => s.pairPin);
  const credentialFlags = useHome((s) => s.credentialFlags);
  const odelicBridge = useHome((s) => s.odelicBridge);
  const daikinDirect = useHome((s) => s.daikinDirect);
  const applySnapshot = useHome((s) => s.applySnapshot);
  const [busy, setBusy] = useState<string | null>(null);
  const [billing, setBilling] = useState<{
    configured: boolean;
    entitlement: { writable: boolean; message: string; status: string };
  } | null>(null);

  useEffect(() => {
    const refresh = new URLSearchParams(window.location.search).get("checkout") === "completed";
    void fetch(`/api/stripe/status${refresh ? "?refresh=1" : ""}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        setBilling((await res.json()) as typeof billing);
      })
      .catch(() => undefined);
  }, []);

  async function startPlan(plan: "monthly" | "annual") {
    setBusy(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Checkout を開けない");
      window.location.assign(json.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout を開けない");
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "契約管理を開けない");
      window.location.assign(json.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "契約管理を開けない");
      setBusy(null);
    }
  }

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "同期に失敗しました";
      setConnector(id as "nature", { error: message, connected: false });
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <AppShell>
        <div className="space-y-3 px-5 pt-10">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="px-5 pt-8">
        <p className="text-xs tracking-[0.2em] text-faint">CONNECT</p>
        <h1 className="mt-2 font-display text-4xl font-medium text-fg">接続</h1>
        <p className="mt-2 text-sm text-muted">トークンは結のサーバーに保存します。家電はここから操作します。</p>
      </header>

      <div className="mt-6 space-y-4 px-5">
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] tracking-wide text-faint">アカウント</p>
              <h2 className="mt-0.5 text-lg font-medium text-fg">{user?.primaryEmail ?? "ログイン中"}</h2>
            </div>
            {isPending ? (
              <div className="size-8 animate-pulse rounded-full bg-surface-2" />
            ) : (
              <UserButton />
            )}
          </div>
          <p className="mt-2 text-sm text-muted">このサイトが家のサーバーです。接続コード {pairPin || "—"}</p>
        </section>

        {/* 課金していない結（既定）では寄付のお願いを出す。Stripe を繋いだ人にだけ契約の口が出る。 */}
        {billing?.configured ? (
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] tracking-wide text-faint">契約</p>
            <h2 className="mt-0.5 text-lg font-medium text-fg">
              月額{BILLING.monthlyYen}円 / 年額{BILLING.annualYen.toLocaleString("ja-JP")}円
            </h2>
            <p className="mt-2 text-sm text-muted">
              {billing.entitlement.message ??
                `初回${BILLING.trialDays}日間は無料です。カード・Apple Pay・Google Pay。`}
            </p>
            {billing.entitlement.writable ? (
              <Button className="mt-3 w-full" disabled={busy === "portal"} onClick={() => void openPortal()}>
                支払い方法の変更・解約
              </Button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button disabled={Boolean(busy)} onClick={() => void startPlan("monthly")}>
                  月額ではじめる
                </Button>
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => void startPlan("annual")}>
                  年額ではじめる
                </Button>
              </div>
            )}
            <p className="mt-3 text-xs text-faint">
              <a className="underline" href="/terms">
                利用規約
              </a>
              {" · "}
              <a className="underline" href="/privacy">
                プライバシー
              </a>
              {" · "}
              <a className="underline" href="/legal">
                特商法
              </a>
            </p>
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-surface p-4">
            <p className="text-[11px] tracking-wide text-faint">この結について</p>
            <h2 className="mt-0.5 text-lg font-medium text-fg">無料で使えます</h2>
            <p className="mt-2 text-sm text-muted">
              結はオープンソースで、課金も広告もありません。機能はすべて使えます。
              気に入ったら開発を支えてもらえると嬉しいです。
            </p>
            <a
              className="mt-3 block w-full rounded-md border border-border py-2.5 text-center text-sm text-fg"
              href="https://github.com/kitepon/yui"
              target="_blank"
              rel="noreferrer"
            >
              GitHub で見る・支える
            </a>
            <p className="mt-3 text-xs text-faint">
              <a className="underline" href="/terms">
                利用規約
              </a>
              {" · "}
              <a className="underline" href="/privacy">
                プライバシー
              </a>
            </p>
          </section>
        )}

        <ConnectorCard
          title="Nature Remo"
          badge="直結"
          desc="home.nature.global でトークンを発行します。"
          helpTo="/help/remo"
          connected={connectors.nature.connected}
          deviceCount={connectors.nature.deviceCount}
          error={connectors.nature.error}
          busy={busy === "nature"}
          onSync={() =>
            run("nature", async () => {
              await saveCredentials(useHome.getState().credentials);
              const snap = await serverSync("nature");
              applySnapshot(snap);
              toast.success(`Remo ${snap.connectors.nature.deviceCount}台を取り込みました`);
            })
          }
        >
          <Field
            label="アクセストークン"
            secret
            value={credentials.natureToken}
            onChange={(natureToken) => setCredentials({ natureToken })}
            placeholder={credentialFlags?.natureToken ? "保存済み" : "トークン"}
          />
        </ConnectorCard>

        <ConnectorCard
          title="SwitchBot"
          badge="直結"
          desc="アプリの設定から、開発者向けオプションでトークンとシークレットを出します。"
          helpTo="/help/switchbot"
          connected={connectors.switchbot.connected}
          deviceCount={connectors.switchbot.deviceCount}
          error={connectors.switchbot.error}
          busy={busy === "switchbot"}
          onSync={() =>
            run("switchbot", async () => {
              await saveCredentials(useHome.getState().credentials);
              const snap = await serverSync("switchbot");
              applySnapshot(snap);
              toast.success(`SwitchBot ${snap.connectors.switchbot.deviceCount}台を取り込みました`);
            })
          }
        >
          <Field
            label="トークン"
            secret
            value={credentials.switchbotToken}
            onChange={(switchbotToken) => setCredentials({ switchbotToken })}
            placeholder={credentialFlags?.switchbotToken ? "保存済み" : ""}
          />
          <Field
            label="シークレット"
            secret
            value={credentials.switchbotSecret}
            onChange={(switchbotSecret) => setCredentials({ switchbotSecret })}
            placeholder={credentialFlags?.switchbotSecret ? "保存済み" : ""}
          />
        </ConnectorCard>

        {daikinDirect && (
          <ConnectorCard
            title="ダイキン"
            badge="自宅のLAN直結"
            desc="無線LAN内蔵のダイキンエアコンと家の中で直接会話します。風向は自動・固定・スイング。自動運転の相対温度と外気温も扱います。クラウドも Alexa スキルも通りません。"
            connected={connectors.daikin.connected}
            deviceCount={connectors.daikin.deviceCount}
            error={connectors.daikin.error}
            busy={busy === "daikin"}
            onSync={() =>
              run("daikin", async () => {
                const snap = await serverSync("daikin");
                applySnapshot(snap);
                toast.success(`ダイキン ${snap.connectors.daikin.deviceCount}台を取り込みました`);
              })
            }
          />
        )}

        {odelicBridge && (
          <ConnectorCard
            title="オーデリック"
            badge="自宅のブリッジ経由"
            desc="専用タブレットを使わず、自宅のブリッジ越しに照明を直接動かします。同期には照明がブリッジへ繋がっている必要があります。"
            connected={connectors.odelec.connected}
            deviceCount={connectors.odelec.deviceCount}
            error={connectors.odelec.error}
            busy={busy === "odelec"}
            onSync={() =>
              run("odelec", async () => {
                const snap = await serverSync("odelec");
                applySnapshot(snap);
                toast.success(`オーデリック ${snap.connectors.odelec.deviceCount}台を取り込みました`);
              })
            }
          />
        )}

        <ConnectorCard
          title="Smart Life / Tuya"
          badge="直結"
          desc="iot.tuya.com のプロジェクトから Access ID / Secret を、連携した Smart Life ユーザーから UID を取ります。"
          helpTo="/help/tuya"
          connected={connectors.smartlife.connected}
          deviceCount={connectors.smartlife.deviceCount}
          error={connectors.smartlife.error}
          busy={busy === "smartlife"}
          onSync={() =>
            run("smartlife", async () => {
              await saveCredentials(useHome.getState().credentials);
              const snap = await serverSync("smartlife");
              applySnapshot(snap);
              toast.success(`Smart Life ${snap.connectors.smartlife.deviceCount}台を取り込みました`);
            })
          }
        >
          <Field
            label="Access ID"
            value={credentials.tuyaAccessId}
            onChange={(tuyaAccessId) => setCredentials({ tuyaAccessId })}
          />
          <Field
            label="Access Secret"
            secret
            value={credentials.tuyaSecret}
            onChange={(tuyaSecret) => setCredentials({ tuyaSecret })}
          />
          <Field
            label="UID"
            value={credentials.tuyaUid}
            onChange={(tuyaUid) => setCredentials({ tuyaUid })}
          />
          <label className="mt-3 block">
            <span className="mb-1.5 block text-xs text-muted">データセンター</span>
            <select
              value={credentials.tuyaRegion || "auto"}
              onChange={(e) => setCredentials({ tuyaRegion: e.target.value })}
              className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base text-fg"
            >
              <option value="auto">自動</option>
              <option value="us">America</option>
              <option value="eu">Europe</option>
              <option value="jp">Japan</option>
              <option value="we">Western Europe</option>
              <option value="in">India</option>
              <option value="cn">China</option>
            </select>
          </label>
        </ConnectorCard>

        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-[11px] tracking-wide text-faint">その他</p>
          <h2 className="mt-0.5 text-lg font-medium text-fg">Alexa</h2>
          <p className="mt-2 text-sm text-muted">
            Alexa 専用の機器は未対応です。Echo は耳だけ。意味は結が見ます。「アレクサ、ゆいでシーリング消して」のように言います。
          </p>
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-[11px] tracking-wide text-faint">ホーム画面</p>
          <h2 className="mt-0.5 text-lg font-medium text-fg">このサイトを置く</h2>
          <p className="mt-2 text-sm text-muted">Safari の共有からホーム画面に追加できます。口は同じです。</p>
          <a
            href="/?install=1&platform=ios"
            className="mt-3 flex min-h-12 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-fg"
          >
            追加する
          </a>
        </section>

        <Button
          variant="ghost"
          className="w-full text-muted"
          onClick={() => {
            resetDemo();
            toast.message("デモ宅に戻しました。トークンはこの端末に残しています。");
          }}
        >
          デモ宅に戻す
        </Button>
      </div>
    </AppShell>
  );
}

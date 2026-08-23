import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PersistHydrator } from "@/components/persist-hydrator";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { clockInTokyo, isLightPeriod } from "@/lib/home/clock";
import { PeriodProvider, useTokyoClock } from "@/lib/home/period";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "結 Yui";
const APP_DESCRIPTION =
  "家の機器を一枚にまとめる。Nature Remo、SwitchBot、Smart Life、ダイキンをつなぐホームアプリ。";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const publicUrl = host ? `https://${host}` : undefined;
const ogImage = publicUrl ? `${publicUrl}/images/living.jpg` : undefined;

function YuiToaster() {
  const { period } = useTokyoClock();
  return (
    <Toaster
      theme={isLightPeriod(period) ? "light" : "dark"}
      position="top-center"
      toastOptions={{ className: "yui-toast" }}
    />
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { title: APP_NAME },
      { name: "description", content: APP_DESCRIPTION },
      { name: "application-name", content: APP_NAME },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#ead8c8" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: APP_NAME },
      { name: "twitter:description", content: APP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: APP_DESCRIPTION },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:locale", content: "ja_JP" },
      ...(publicUrl ? [{ property: "og:url", content: publicUrl }] : []),
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1792" },
            { property: "og:image:height", content: "1008" },
            { property: "og:image:alt", content: "結 Yuiのホーム画面" },
            { name: "twitter:image", content: ogImage },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ...(publicUrl ? [{ rel: "canonical", href: publicUrl }] : []),
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans+JP:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: () => (
    <html
      lang="ja"
      className="antialiased"
      data-period={clockInTokyo().period}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <PersistHydrator />
        <AuthProvider>
          <PeriodProvider>
            <Outlet />
            <YuiToaster />
          </PeriodProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});

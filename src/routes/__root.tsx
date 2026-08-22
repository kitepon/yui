import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PersistHydrator } from "@/components/persist-hydrator";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { clockInTokyo, isLightPeriod } from "@/lib/home/clock";
import { PeriodProvider, useTokyoClock } from "@/lib/home/period";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "結 Yui";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;

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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" },
      { title: APP_NAME },
      { name: "application-name", content: APP_NAME },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#ead8c8" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
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

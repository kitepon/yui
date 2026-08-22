import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Layers3, MapPin, PlugZap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { KiteponMark } from "@/components/kitepon-mark";

const NAV = [
  { to: "/", label: "家", icon: Home },
  { to: "/scenes", label: "場面", icon: Layers3 },
  { to: "/rooms", label: "場所", icon: MapPin },
  { to: "/settings", label: "接続", icon: PlugZap },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-dvh justify-center bg-bg">
      <div className="flex w-full max-w-lg flex-col">
        <div
          className="flex-1"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "calc(7.25rem + env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </div>
        <nav
          className="fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-border bg-bg/92 backdrop-blur-md"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <KiteponMark />
          <ul className="grid grid-cols-4 px-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex h-14 flex-col items-center justify-center gap-0.5 rounded-md text-xs tracking-wide",
                      active ? "text-primary" : "text-muted",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={active ? 2.2 : 1.7} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

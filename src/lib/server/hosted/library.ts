import { getSqlite } from "../sqlite.ts";
import { handleEntryEvent, type EntryEvent } from "./entry-events.ts";
import { HOSTED_APP_ID, hostedOrigin } from "./config.ts";
import { SqliteKeyholeStore } from "./keyhole-store.ts";
import { touchHome } from "./paid.ts";

// The shared login/billing library is private and Yui's repository is public, so it is never imported statically:
// only a hosted build (YUI_HOSTED=1) loads it, through this one loader. The package is put in node_modules at the hosted image build.
type KeyholeRequest = { method: string; path: string; headers: Headers; body: Uint8Array };
interface Keyholes {
  verify(request: KeyholeRequest): Promise<{ entry: string; key: string; role: "parent" | "child" }>;
  handle(request: KeyholeRequest): Promise<Response>;
}

let keyholes: Promise<Keyholes> | undefined;

export function getKeyholes() {
  keyholes ??= (async () => {
    const specifier = process.env.YUI_LOGIN_BILLING_MODULE?.trim() || "@kitepon/login-billing/server";
    const lib = (await import(/* @vite-ignore */ specifier)) as {
      createKeyholes(config: Record<string, unknown>): Keyholes;
    };
    const db = getSqlite();
    return lib.createKeyholes({
      appId: HOSTED_APP_ID,
      origin: hostedOrigin(),
      store: new SqliteKeyholeStore(db),
      onEvent: (event: EntryEvent) => handleEntryEvent(db, event),
    });
  })();
  return keyholes;
}

/** The path and body exactly as the device signed them. */
export async function toKeyholeRequest(request: Request): Promise<KeyholeRequest> {
  const url = new URL(request.url);
  return {
    method: request.method,
    path: url.pathname + url.search,
    headers: request.headers,
    body: new Uint8Array(await request.clone().arrayBuffer()),
  };
}

/** Hosted: the entry of a signed request, or null. Any key of an entry counts as that entry's owner. */
export async function resolveHostedOwner(request: Request): Promise<{ id: string; role: "parent" | "child" } | null> {
  try {
    const who = await (await getKeyholes()).verify(await toKeyholeRequest(request));
    touchHome(getSqlite(), who.entry);
    return { id: who.entry, role: who.role };
  } catch (err) {
    if ((err as { name?: string }).name === "KeyholeError") return null;
    throw err;
  }
}

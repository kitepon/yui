/**
 * LAN 直結コネクタ（ダイキン・オーデリック）を使える人を決める。
 *
 * これらのコネクタは、ユーザーごとの認証情報を持たない。宛先はサーバーの環境変数が
 * 持ち、結が家の中にいること自体が資格になっている。だから何もしなければ、
 * **同じサーバーに登録した全員が家主の機器を操作できてしまう**（実際に踏んだ:
 * 誰でも登録できる公開サーバーで、新規ユーザーが家主のエアコンを操作できた）。
 *
 * そこで宛先の設定とは別に「この結の持ち主は誰か」を `YUI_LAN_OWNER`（メール）で
 * 明示させ、その人にだけコネクタを見せ、同期させ、操作させる。ほかの利用者には
 * 存在ごと見えない。
 *
 * `YUI_LAN_OWNER` を設定しない限り LAN 直結は誰にも開かない。家族だけで使う結でも
 * 1 行書く手間はかかるが、書き忘れが「他人に家を明け渡す」side に倒れてはいけない。
 */

import { getSqlite } from "./sqlite.ts";

function ownerEmail(): string {
  return (process.env.YUI_LAN_OWNER ?? "").trim().toLowerCase();
}

/** 宛先が設定され、かつ持ち主が明示されているときだけ LAN 直結は生きている。 */
export function lanOwnerConfigured(): boolean {
  return ownerEmail().length > 0;
}

/** その利用者が、この結の持ち主か。 */
export function isLanOwner(email: string | null | undefined): boolean {
  const owner = ownerEmail();
  if (!owner) return false;
  return (email ?? "").trim().toLowerCase() === owner;
}

/**
 * その家の持ち主が、この結の持ち主か。
 *
 * 入口（API）だけで止めると、同期済みの機器が残っている家では
 * 場面とオートメーションが持ち主以外の経路で動いてしまう。実際に操作を出す
 * ところでも同じ資格を確かめる。
 */
export function homeBelongsToLanOwner(ownerUserId: string): boolean {
  if (!lanOwnerConfigured()) return false;
  const row = getSqlite()
    .prepare('SELECT email FROM "user" WHERE id = ?')
    .get(ownerUserId) as { email?: string } | undefined;
  return isLanOwner(row?.email);
}

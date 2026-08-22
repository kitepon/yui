# yui-backup

家サーバーが暗号化済みスナップショットを置く扉。バケットは `yuihome-backup`。

```bash
cd backup-worker
npx wrangler deploy
printf '%s' "$YUI_BACKUP_SECRET" | npx wrangler secret put BACKUP_SECRET
```

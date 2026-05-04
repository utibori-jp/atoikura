# atoikura

個人向け家計管理アプリ。「今月あといくら使えるか」をいつでも確認できることがコアバリュー。

変動費の月次予算と累計支出の差分を表示する。収入は計算に含まない。

家族内限定での利用を想定。Tailscale 経由でセルフホストの K3s クラスターにアクセスする。

---

## Requirements

- Docker / Docker Compose
- Go 1.22+（ローカル開発時）
- Node.js 20+（ローカル開発時）

---

## Development

### Start the database
```
docker compose up -d db
```

### Stop everything
```
docker compose down
```

(Backend and frontend containers will be runnable after Step 5 and Step 7 respectively.)

---

## Docs

- `docs/spec.md` — 仕様
- `docs/architecture.md` — 技術スタック・構成
- `docs/atoikura.dbml` — DBスキーマ
- `docs/atoikura-api.yaml` — OpenAPI spec
- `docs/prompts/README.md` — Claude Code 向け実装ロードマップ

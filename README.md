# atoikura

個人向け家計管理アプリ。「今月あといくら使えるか」をいつでも確認できることがコアバリュー。

変動費の月次予算と累計支出の差分を表示する。収入は計算に含まない。

家族内限定での利用を想定。Tailscale 経由でセルフホストの K3s クラスターにアクセスする。

---

## Requirements

- Docker / Docker Compose
- Go 1.25+（ローカル開発時）
- Node.js 20+（ローカル開発時）

---

## Development

### Start the database
```
docker compose up -d db
```

### Run migrations
```
cd backend && make migrate-up
```

### Run the frontend
```
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:3000.

### Stop everything
```
docker compose down
```

---

## Docs

- `docs/spec.md` — 仕様
- `docs/architecture.md` — 技術スタック・構成
- `docs/atoikura.dbml` — DBスキーマ
- `docs/atoikura-api.yaml` — OpenAPI spec
- `docs/prompts/README.md` — Claude Code 向け実装ロードマップ

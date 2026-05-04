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

## Getting Started

```bash
# リポジトリをクローン
git clone <repo-url>
cd atoikura

# 環境変数を設定
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 起動
docker compose up
```

起動後:

- フロントエンド: http://localhost:5173
- バックエンド API: http://localhost:8080
- ヘルスチェック: `GET http://localhost:8080/health`

---

## Docs

- `docs/spec.md` — 仕様
- `docs/architecture.md` — 技術スタック・構成
- `docs/atoikura.dbml` — DBスキーマ
- `docs/atoikura-api.yaml` — OpenAPI spec
- `docs/prompts/README.md` — Claude Code 向け実装ロードマップ

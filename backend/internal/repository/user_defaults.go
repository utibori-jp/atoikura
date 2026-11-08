package repository

import (
	"context"
	"fmt"
)

// Default master data seeded for every new user at signup. Mirrors the
// dev-user seed in migrations/000012_seed_dev_categories.sql, but parameterized
// by user_id so each account starts with the same starter categories.
//
// statementTypeID maps to the fixed statement_types master:
//   1 = food (食費), 2 = other (その他変動費), 3 = fixed (固定費), 4 = excluded (対象外)

type defaultCategoryGroup struct {
	GroupName       string
	StatementTypeID int32
	Categories      []string
}

var defaultCategoryGroups = []defaultCategoryGroup{
	{
		GroupName:       "食費",
		StatementTypeID: 1,
		Categories:      []string{"スーパー・自炊", "外食", "コンビニ", "おやつ・飲料", "お土産"},
	},
	{
		GroupName:       "日用品",
		StatementTypeID: 2,
		Categories:      []string{"生活消耗品", "生活備品", "消耗衣類", "被服・小物", "理美容"},
	},
	{
		GroupName:       "趣味・娯楽",
		StatementTypeID: 2,
		Categories: []string{
			"遊び・娯楽", "飲み会", "デート", "プレゼント・お祝い",
			"旅行・遠出", "書籍（漫画・趣味）", "参拝・寄付",
		},
	},
	{
		GroupName:       "交通・車両費",
		StatementTypeID: 2,
		Categories: []string{
			"電車・バス", "タクシー", "新幹線・飛行機", "ガソリン・燃料",
			"有料道路", "車両メンテ・用品",
		},
	},
	{
		GroupName:       "自己投資",
		StatementTypeID: 2,
		Categories: []string{
			"書籍（勉強・実用）", "セミナー・講座", "資格・受験料", "勉強カフェ・場所代",
			"開発・サーバー費", "ガジェット・PC検証", "市場調査", "PC・家具・家電",
		},
	},
	{
		GroupName:       "医療・健康",
		StatementTypeID: 2,
		Categories:      []string{"医療費・薬", "サプリ・プロテイン"},
	},
	{
		GroupName:       "固定費",
		StatementTypeID: 3,
		Categories: []string{
			"家賃", "水道・光熱費", "通信費", "公共料金", "ジム会費",
			"保険（損保）", "保険（生保）", "サブスクリプション", "税金",
		},
	},
	{
		GroupName:       "経費精算",
		StatementTypeID: 4,
		Categories:      []string{"経費立替", "出張費"},
	},
}

// statementTypeCodeByID maps the legacy statement_types IDs above to the
// type_code the local-first schema references.
var statementTypeCodeByID = map[int32]string{1: "food", 2: "other", 3: "fixed", 4: "excluded"}

// insertDefaultLedgerCategories seeds a new local-first ledger with the default
// category master (#221). Devices list categories by created_at, so each row is
// stamped one millisecond after the previous one to keep the order above.
func insertDefaultLedgerCategories(ctx context.Context, seq_allocator *txAllocator, ledger_id string, user_id int64) error {
	row_number := 0
	insertRow := func(insert_sql string, row_values ...any) (string, error) {
		next_seq, err := seq_allocator.allocateSeq(ctx)
		if err != nil {
			return "", err
		}
		row_number++
		var inserted_id string
		err = seq_allocator.tx.QueryRow(ctx, insert_sql,
			append([]any{ledger_id, user_id, next_seq, row_number}, row_values...)...,
		).Scan(&inserted_id)
		return inserted_id, err
	}

	for _, default_group := range defaultCategoryGroups {
		group_id, err := insertRow(
			`INSERT INTO lf.category_groups (id, ledger_id, owner_id, seq, created_at, updated_at, name, statement_type_code)
			 VALUES (gen_random_uuid(), $1::uuid, $2, $3, NOW() + make_interval(secs => $4 / 1000.0), NOW(), $5, $6)
			 RETURNING id::text`,
			default_group.GroupName, statementTypeCodeByID[default_group.StatementTypeID],
		)
		if err != nil {
			return fmt.Errorf("seeding category group %q: %w", default_group.GroupName, err)
		}
		for _, category_name := range default_group.Categories {
			if _, err := insertRow(
				`INSERT INTO lf.expense_categories (id, ledger_id, owner_id, seq, created_at, updated_at, group_id, name)
				 VALUES (gen_random_uuid(), $1::uuid, $2, $3, NOW() + make_interval(secs => $4 / 1000.0), NOW(), $5::uuid, $6)
				 RETURNING id::text`,
				group_id, category_name,
			); err != nil {
				return fmt.Errorf("seeding category %q: %w", category_name, err)
			}
		}
	}
	return nil
}

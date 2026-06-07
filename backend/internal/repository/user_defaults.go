package repository

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

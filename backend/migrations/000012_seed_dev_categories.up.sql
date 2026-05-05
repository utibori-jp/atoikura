INSERT INTO category_groups (id, user_id, group_name, statement_type_id) VALUES
    (1, 1, '食費',         1),
    (2, 1, '日用品',       2),
    (3, 1, '趣味・娯楽',  2),
    (4, 1, '交通費',       2),
    (5, 1, '家賃・サブスク', 3),
    (6, 1, '出張経費',     4);
SELECT setval('category_groups_id_seq', 6);

INSERT INTO expense_categories (user_id, group_id, category_name) VALUES
    (1, 1, 'スーパー'),
    (1, 1, '外食'),
    (1, 1, 'コンビニ'),
    (1, 2, '消耗品'),
    (1, 2, 'ドラッグストア'),
    (1, 3, '趣味'),
    (1, 3, '書籍'),
    (1, 4, '電車・バス'),
    (1, 4, 'タクシー'),
    (1, 5, '家賃'),
    (1, 5, 'サブスクリプション'),
    (1, 6, '経費精算');

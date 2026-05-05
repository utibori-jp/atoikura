INSERT INTO statement_types (id, type_code, statement_type_name, display_order) VALUES
    (1, 'food',     '食費',   1),
    (2, 'other',    'その他', 2),
    (3, 'fixed',    '固定費', 3),
    (4, 'excluded', '対象外', 4);
SELECT setval('statement_types_id_seq', 4);

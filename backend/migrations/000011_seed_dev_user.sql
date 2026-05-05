INSERT INTO users (id, email, password_hash, timezone)
VALUES (1, 'dev@atoikura.local', 'dev_placeholder_hash', 'Asia/Tokyo')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', GREATEST(1, (SELECT MAX(id) FROM users)));

INSERT INTO users (id, email, password_hash, timezone)
VALUES (1, 'dev@atoikura.local', 'dev_placeholder_hash', 'Asia/Tokyo');
SELECT setval('users_id_seq', 1);

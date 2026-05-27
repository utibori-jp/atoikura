-- Set a real bcrypt hash for the dev user so Basic auth actually validates.
-- Plaintext password: "password" (dev/local only; never use in prod).
UPDATE users
SET password_hash = '$2a$10$k.HC7veWx9wHA14KqH4aJe7BIepXxcJ5CX6iBwnYvnRby6yyqprI2',
    display_name  = COALESCE(display_name, 'Dev User')
WHERE email = 'dev@atoikura.local';

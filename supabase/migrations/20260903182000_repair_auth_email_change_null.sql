UPDATE auth.users
SET email_change = COALESCE(email_change, '')
WHERE email_change IS NULL;

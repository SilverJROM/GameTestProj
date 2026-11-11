-- Plan 05: sign-up is limited to invited emails. The address itself is never stored, only a SHA-256 of it, and one
-- account may use each address. Accounts made before this migration have no address (NULL).
ALTER TABLE accounts ADD COLUMN email_hash TEXT;
CREATE UNIQUE INDEX accounts_email_hash ON accounts (email_hash) WHERE email_hash IS NOT NULL;

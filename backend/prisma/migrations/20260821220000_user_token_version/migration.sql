-- Additive only. Used for refresh-token revocation on logout / password
-- reset — see the tokenVersion doc comment on User in schema.prisma.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

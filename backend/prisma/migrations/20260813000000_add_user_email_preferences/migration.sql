-- Add emailPreferences JSON column to users for notification settings persistence
ALTER TABLE "users"
ADD COLUMN "emailPreferences" JSONB NOT NULL DEFAULT '{"auditCompleted": true, "weeklyReport": true}';

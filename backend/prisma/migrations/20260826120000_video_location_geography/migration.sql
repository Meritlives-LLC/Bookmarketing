-- Additive only. Adds country/city/region/culturalContext to video_locations
-- for setting fidelity (African/foreign/historical books must render their
-- actual described setting, not a generic or stereotyped substitute).
ALTER TABLE "video_locations" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "video_locations" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "video_locations" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "video_locations" ADD COLUMN IF NOT EXISTS "culturalContext" TEXT;

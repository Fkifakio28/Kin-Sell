-- BlogPost: add slug (unique), category, tags, language, SEO meta, gifUrl, views
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "metaTitle" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "metaDescription" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "gifUrl" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "views" INTEGER NOT NULL DEFAULT 0;

-- Generate slugs for existing posts that don't have one
UPDATE "BlogPost" SET "slug" = "id" WHERE "slug" IS NULL;

-- Now make slug NOT NULL and UNIQUE
ALTER TABLE "BlogPost" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");

-- Additional indexes
CREATE INDEX IF NOT EXISTS "BlogPost_category_idx" ON "BlogPost"("category");
CREATE INDEX IF NOT EXISTS "BlogPost_slug_idx" ON "BlogPost"("slug");

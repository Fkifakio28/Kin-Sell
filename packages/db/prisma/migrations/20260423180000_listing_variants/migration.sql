-- Add variants (sizes + colors) to Listing for products
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "variants" JSONB;

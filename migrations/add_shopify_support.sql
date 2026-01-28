-- =========================================
-- Migration: Add Shopify Store Support
-- =========================================

-- Enable required extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================
-- 1. Shopify Stores Table
-- =========================================
CREATE TABLE IF NOT EXISTS shopify_stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    store_domain TEXT NOT NULL,
    storefront_token TEXT NOT NULL,
    website_url TEXT NOT NULL,
    store_name TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint per phone number
    CONSTRAINT unique_phone_store UNIQUE (phone_number)
);

-- Indexes for shopify_stores
CREATE INDEX IF NOT EXISTS idx_shopify_stores_phone_number
    ON shopify_stores(phone_number);
CREATE INDEX IF NOT EXISTS idx_shopify_stores_domain
    ON shopify_stores(store_domain);

-- =========================================
-- 2. Shopify Chunks Table
-- =========================================
CREATE TABLE IF NOT EXISTS shopify_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('product', 'page', 'collection')),
    content_id TEXT NOT NULL, -- Shopify ID (product_id, page_id, etc.)
    title TEXT,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1024),
    metadata JSONB, -- Store additional data like price, availability, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite unique constraint
    CONSTRAINT unique_store_content_chunk UNIQUE (store_id, content_type, content_id, chunk_text)
);

-- Vector index for similarity search
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'shopify_chunks_embedding_ivfflat_idx'
  ) THEN
    CREATE INDEX shopify_chunks_embedding_ivfflat_idx
      ON shopify_chunks
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END
$$;

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_shopify_chunks_store_id
    ON shopify_chunks(store_id);
CREATE INDEX IF NOT EXISTS idx_shopify_chunks_content_type
    ON shopify_chunks(content_type);

-- =========================================
-- 3. Update phone_document_mapping for Shopify support
-- =========================================

-- Add Shopify support columns
ALTER TABLE phone_document_mapping
ADD COLUMN IF NOT EXISTS shopify_store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'file' CHECK (data_source IN ('file', 'shopify'));

-- Update unique constraint to allow either file or shopify per phone
-- First drop the old constraint
ALTER TABLE phone_document_mapping
DROP CONSTRAINT IF EXISTS unique_phone_file;

-- Add new constraint that ensures one mapping per phone number
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_phone_number' AND conrelid = 'phone_document_mapping'::regclass) THEN
        ALTER TABLE phone_document_mapping ADD CONSTRAINT unique_phone_number UNIQUE (phone_number);
    END IF;
END $$;

-- =========================================
-- 4. Functions and Triggers for Shopify Tables
-- =========================================

-- Function to update shopify_stores.updated_at
CREATE OR REPLACE FUNCTION update_shopify_stores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for shopify_stores
CREATE TRIGGER trigger_update_shopify_stores_updated_at
    BEFORE UPDATE ON shopify_stores
    FOR EACH ROW
    EXECUTE FUNCTION update_shopify_stores_updated_at();

-- =========================================
-- 5. Row Level Security (RLS) Policies
-- =========================================

-- Enable RLS on new tables
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shopify_stores
-- Allow all operations for authenticated users (anon key)
CREATE POLICY "Enable all operations for authenticated users on shopify_stores" ON shopify_stores
    FOR ALL USING (true);

-- RLS Policies for shopify_chunks
-- Allow all operations for authenticated users (anon key)
CREATE POLICY "Enable all operations for authenticated users on shopify_chunks" ON shopify_chunks
    FOR ALL USING (true);

-- =========================================
-- Migration Complete
-- =========================================
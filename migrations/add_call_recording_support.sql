-- =========================================
-- Add Call Recording Support to RAG System
-- Migration: Extend rag_chunks for multiple sources
-- =========================================

-- Enable required extensions (already enabled in create_database.sql)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================
-- 1. Modify rag_chunks to support multiple source types
-- =========================================

-- Add new columns to rag_chunks
ALTER TABLE rag_chunks
ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf' CHECK (source_type IN ('pdf', 'call')),
ADD COLUMN source_id UUID NOT NULL;

-- Update existing rows to set source_id = file_id and source_type = 'pdf'
UPDATE rag_chunks SET source_id = file_id, source_type = 'pdf';

-- Make file_id nullable since calls won't have it
ALTER TABLE rag_chunks ALTER COLUMN file_id DROP NOT NULL;

-- Add index for source_type and source_id
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source_type_source_id
  ON rag_chunks (source_type, source_id);

-- =========================================
-- 2. Call Recordings table
-- =========================================
CREATE TABLE IF NOT EXISTS call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'transcribing', 'spam', 'blank', '11za_related', 'approved')),
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call_recordings
CREATE INDEX IF NOT EXISTS idx_call_recordings_status
  ON call_recordings(status);

CREATE INDEX IF NOT EXISTS idx_call_recordings_phone_number
  ON call_recordings(phone_number);

CREATE INDEX IF NOT EXISTS idx_call_recordings_uploaded_at
  ON call_recordings(uploaded_at DESC);

-- =========================================
-- 3. Call Transcripts table
-- =========================================
CREATE TABLE IF NOT EXISTS call_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
  transcript TEXT,
  transcript_length INT DEFAULT 0,
  language TEXT,
  duration_seconds FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call_transcripts
CREATE INDEX IF NOT EXISTS idx_call_transcripts_call_id
  ON call_transcripts(call_id);

-- =========================================
-- 4. Call Classifications table
-- =========================================
CREATE TABLE IF NOT EXISTS call_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES call_recordings(id) ON DELETE CASCADE,
  is_blank BOOLEAN DEFAULT FALSE,
  is_spam BOOLEAN DEFAULT FALSE,
  is_11za_related BOOLEAN DEFAULT FALSE,
  blank_confidence FLOAT,
  spam_confidence FLOAT,
  relevance_confidence FLOAT,
  classification_metadata JSONB,
  classified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call_classifications
CREATE INDEX IF NOT EXISTS idx_call_classifications_call_id
  ON call_classifications(call_id);

CREATE INDEX IF NOT EXISTS idx_call_classifications_is_11za_related
  ON call_classifications(is_11za_related);

-- =========================================
-- 5. Phone-Call Mapping (similar to phone_document_mapping)
-- =========================================
CREATE TABLE IF NOT EXISTS phone_call_mapping (
    id BIGSERIAL PRIMARY KEY,
    phone_number TEXT NOT NULL,
    call_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to call_recordings table
    CONSTRAINT fk_call FOREIGN KEY (call_id) REFERENCES call_recordings(id) ON DELETE CASCADE,

    -- Unique constraint to prevent duplicate mappings
    CONSTRAINT unique_phone_call UNIQUE (phone_number, call_id)
);

-- Indexes for phone-call mapping
CREATE INDEX IF NOT EXISTS idx_phone_call_mapping_phone
  ON phone_call_mapping(phone_number);

CREATE INDEX IF NOT EXISTS idx_phone_call_mapping_call_id
  ON phone_call_mapping(call_id);

-- =========================================
-- 6. Update Functions and Triggers
-- =========================================

-- Function to update call_recordings.updated_at
CREATE OR REPLACE FUNCTION update_call_recordings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for call_recordings
CREATE TRIGGER trigger_update_call_recordings_updated_at
    BEFORE UPDATE ON call_recordings
    FOR EACH ROW
    EXECUTE FUNCTION update_call_recordings_updated_at();

-- Function to update phone_call_mapping.updated_at
CREATE OR REPLACE FUNCTION update_phone_call_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for phone_call_mapping
CREATE TRIGGER trigger_update_phone_call_mapping_updated_at
    BEFORE UPDATE ON phone_call_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_phone_call_mapping_updated_at();

-- =========================================
-- 7. Update Vector Search Function
-- =========================================

-- Update match_documents to support source_type filtering
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(1024),
  match_count INT DEFAULT 5,
  target_file UUID DEFAULT NULL,
  source_types TEXT[] DEFAULT ARRAY['pdf', 'call']
)
RETURNS TABLE (
  id UUID,
  chunk TEXT,
  similarity FLOAT,
  source_type TEXT,
  source_id UUID
)
LANGUAGE sql STABLE
AS $$
  SELECT
    rag_chunks.id,
    rag_chunks.chunk,
    1 - (rag_chunks.embedding <=> query_embedding) AS similarity,
    rag_chunks.source_type,
    rag_chunks.source_id
  FROM rag_chunks
  WHERE (target_file IS NULL OR rag_chunks.file_id = target_file)
    AND rag_chunks.source_type = ANY(source_types)
  ORDER BY rag_chunks.embedding <-> query_embedding
  LIMIT match_count;
$$;

-- =========================================
-- 8. Views
-- =========================================

-- View to easily see phone number mappings with call details
CREATE OR REPLACE VIEW phone_call_view AS
SELECT
    pcm.id,
    pcm.phone_number,
    pcm.call_id,
    cr.file_name,
    cr.status,
    cr.uploaded_at,
    pcm.created_at,
    pcm.updated_at
FROM phone_call_mapping pcm
JOIN call_recordings cr ON pcm.call_id = cr.id
ORDER BY pcm.phone_number, pcm.created_at DESC;

-- =========================================
-- Migration Complete!
-- =========================================
--
-- Tables modified/created:
--   - rag_chunks: Added source_type, source_id columns
--   - call_recordings: New table for call metadata
--   - call_transcripts: New table for transcripts
--   - call_classifications: New table for classifications
--   - phone_call_mapping: New table for phone-call mappings
--
-- Functions updated:
--   - match_documents(): Now supports source_types parameter
--   - update_call_recordings_updated_at(): Auto-update timestamp
--   - update_phone_call_mapping_updated_at(): Auto-update timestamp
--
-- Views created:
--   - phone_call_view: Easy access to phone-call mappings
--
-- Next steps:
--   1. Run this migration
--   2. Create API routes for call processing
--   3. Create UI for call recordings
--   4. Update retrieval logic
-- =========================================</content>
<parameter name="filePath">migrations/add_call_recording_support.sql





-- =========================================
-- Migration: Add error_reason field to call_recordings
-- =========================================

-- Add error_reason column to call_recordings table
ALTER TABLE call_recordings
ADD COLUMN IF NOT EXISTS error_reason TEXT;

-- Add storage_path column if it doesn't exist (for file storage reference)
ALTER TABLE call_recordings
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- =========================================
-- Migration Complete
-- =========================================
-- ============================================================
-- Migration: 001_init_documents
-- Purpose:   Bootstrap the Supabase schema required by the
--            /dashboard/documents page.
--
-- Run this once in the Supabase SQL Editor for any new project:
--   Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Documents metadata table
--    Stores one row per uploaded PDF per user.
CREATE TABLE IF NOT EXISTS public.documents (
    id          UUID                     DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    user_id     UUID                     REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    custom_id   TEXT,
    name        TEXT                     NOT NULL,
    size        TEXT,
    status      TEXT,
    url         TEXT,
    session_id  TEXT,
    session_secret TEXT
);

-- Index for efficient per-user document listing (used by DocumentsView fetch)
CREATE INDEX IF NOT EXISTS documents_user_id_idx
    ON public.documents (user_id, created_at DESC);

-- 2. Storage bucket for raw PDF files
--    Public bucket — URLs are used by the RAG service to download and index PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Row-level security
--    Disabled for simplicity during development. Enable and tighten in production.
ALTER TABLE public.documents DISABLE ROW LEVEL SECURITY;

-- 4. Storage policy — authenticated users can upload and read any file
--    (Tighten to user-scoped paths in production)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename  = 'objects'
          AND policyname = 'Allow all for authenticated'
    ) THEN
        CREATE POLICY "Allow all for authenticated"
            ON storage.objects
            FOR ALL
            USING ( auth.role() = 'authenticated' );
    END IF;
END $$;

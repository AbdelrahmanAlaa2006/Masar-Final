-- Migration: Add PDF support to videos
-- Run this in the Supabase SQL Editor.

-- Add columns for lecture PDFs to the videos table if they don't already exist.
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS pdf_key TEXT;

-- Verify RLS policies are intact. Since they are column-agnostic, the existing policies will cover pdf_url and pdf_key.

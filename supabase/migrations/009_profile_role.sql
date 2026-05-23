-- Add domain/subject role field to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text;

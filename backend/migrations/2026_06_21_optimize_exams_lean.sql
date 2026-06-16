-- Add generated column questions_count to exams table
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS questions_count integer 
GENERATED ALWAYS AS (coalesce(jsonb_array_length(questions), 0)) STORED;

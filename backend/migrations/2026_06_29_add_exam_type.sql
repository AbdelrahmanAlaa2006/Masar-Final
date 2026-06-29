-- إضافة عمود تصنيف الامتحان (تسميع أو امتحان) لجدول الامتحانات
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS exam_type text NOT NULL DEFAULT 'exam';

-- إضافة فهرس لتسريع الفلترة بنوع الامتحان
CREATE INDEX IF NOT EXISTS idx_exams_type ON public.exams(exam_type);

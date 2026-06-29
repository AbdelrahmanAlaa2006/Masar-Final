-- إضافة عمود الأرشفة لجدول الفيديوهات
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- إضافة عمود الأرشفة لجدول الواجبات
ALTER TABLE public.homeworks 
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- إضافة عمود الأرشفة لجدول الامتحانات
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- تحديث الفهارس (Indexes) لتسريع الاستعلامات المفلترة بالأرشفة
CREATE INDEX IF NOT EXISTS idx_videos_archived ON public.videos(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_homeworks_archived ON public.homeworks(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_exams_archived ON public.exams(is_archived) WHERE is_archived = false;

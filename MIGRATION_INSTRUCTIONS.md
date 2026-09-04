# دليل تشغيل ملف الـ Migration لنظام الامتحانات

لتفعيل التعديلات الجديدة بالكامل في قاعدة البيانات وحل رسالة الخطأ الظاهرة في لوحة التحكم، يرجى تشغيل محتوى ملف الـ SQL المرفق داخل **Supabase SQL Editor**:

- **مسار الملف في المشروع**:
  [`backend/migrations/2026_09_04_exam_scheduling_and_targeting.sql`](file:///c:/Work/alaaaaaa/Masar-Final/backend/migrations/2026_09_04_exam_scheduling_and_targeting.sql)

### ما الذي يقوم به هذا الملف؟
1. إضافة أعمدة الجدولة والاستهداف لجدول `exams`:
   - `opens_at` (موعد الفتح المجدول)
   - `availability_days` (مدة الإتاحة بالأيام)
   - `expires_at` (تاريخ الانتهاء المحسوب تلقائياً)
   - `target_audience` ('stage' أو 'group')
   - `target_group_id` (المعرف المرجعي للمجموعة مع FK لجدول `groups`)
2. إضافة trigger `compute_exam_expiration` لحساب `expires_at` بأمان وتصفيره إلى NULL عند عدم توفر أحد المدخلات.
3. تحديث دالة الأمان `has_content_access` مع حماية ضد حذف المجموعة (fail-closed).
4. تحديث دالة بدء المحاولة `start_or_get_exam_attempt` لمنع الطلاب من الدخول قبل موعد الفتح أو بعد انتهاء الصلاحية.
5. تحديث دوال تقارير المنصة وولي الأمر لاستبعاد امتحانات المجموعات الأخرى.

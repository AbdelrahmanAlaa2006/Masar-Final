-- =====================================================================
-- 2026_09_22_course_lectures_system.sql
-- Master Plan v3.12 Final — PHASE 1: Database Schema & RLS Architecture
--
-- Features:
--   1. Flexible Educational Hierarchy:
--      Standalone Lectures, Lesson/Section -> Lectures, and Optional Package Associations
--   2. Six Relational Tables with Full Multi-Tenant Row-Level Security
--   3. Unified Directed Graph Cycle Detection with Tenant-Scoped Concurrency Safety
--   4. Graph Mutation Validation for BOTH unlock rules and lecture_exams containment
--   5. Tenant-Scoped Partial Unique Constraint for Active Unlock Rules
--   6. Strict Polymorphic Target Validation with Cross-Tenant Rejection
--   7. Hierarchy Synchronization (Chapter Package Change -> Lectures package_id/grade Sync)
--   8. Secure Educational Unlock Gate check_content_unlocked(studentId, targetType, targetId, contextLectureId)
--   9. Atomic Exam Association Deletion (remove_exam_from_lecture)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Create Tables
-- ---------------------------------------------------------------------

-- Table 1: course_chapters (Lesson / Section — package_id is optional)
CREATE TABLE IF NOT EXISTS public.course_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  grade TEXT,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table 2: course_lectures (Multiple Lectures per Chapter, or Standalone Lectures)
CREATE TABLE IF NOT EXISTS public.course_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.course_chapters(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  grade TEXT,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table 3: lecture_videos (Lecture <-> Video M:N)
CREATE TABLE IF NOT EXISTS public.lecture_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES public.course_lectures(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT uq_lecture_video UNIQUE (lecture_id, video_id)
);

-- Table 4: lecture_exams (Lecture <-> Exam M:N)
CREATE TABLE IF NOT EXISTS public.lecture_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES public.course_lectures(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT uq_lecture_exam UNIQUE (lecture_id, exam_id)
);

-- Table 5: lecture_files (Lecture -> Files 1:N)
CREATE TABLE IF NOT EXISTS public.lecture_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES public.course_lectures(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table 6: content_unlock_rules (Prerequisite Rules)
CREATE TABLE IF NOT EXISTS public.content_unlock_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_content_type TEXT NOT NULL CHECK (target_content_type IN ('lecture', 'exam', 'video')),
  target_content_id UUID NOT NULL,
  required_exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  required_score NUMERIC(5,2) NOT NULL DEFAULT 70.00 CHECK (required_score >= 0 AND required_score <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------
-- 2. Performance & Uniqueness Indexes
-- ---------------------------------------------------------------------

-- V1 Invariant: At most ONE active unlock rule per tenant + target
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_unlock_rule 
  ON public.content_unlock_rules (tenant_id, target_content_type, target_content_id) 
  WHERE is_active = true;

-- Foreign key & query performance indexes
CREATE INDEX IF NOT EXISTS idx_course_chapters_pkg ON public.course_chapters (package_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_chapters_tenant ON public.course_chapters (tenant_id);
CREATE INDEX IF NOT EXISTS idx_course_chapters_grade ON public.course_chapters (tenant_id, grade);

CREATE INDEX IF NOT EXISTS idx_course_lectures_chap ON public.course_lectures (chapter_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_lectures_pkg ON public.course_lectures (package_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_course_lectures_tenant ON public.course_lectures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_course_lectures_grade ON public.course_lectures (tenant_id, grade);

CREATE INDEX IF NOT EXISTS idx_lecture_videos_lec ON public.lecture_videos (lecture_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lecture_videos_vid ON public.lecture_videos (video_id);
CREATE INDEX IF NOT EXISTS idx_lecture_videos_tenant ON public.lecture_videos (tenant_id);

CREATE INDEX IF NOT EXISTS idx_lecture_exams_lec ON public.lecture_exams (lecture_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lecture_exams_exam ON public.lecture_exams (exam_id);
CREATE INDEX IF NOT EXISTS idx_lecture_exams_tenant ON public.lecture_exams (tenant_id);

CREATE INDEX IF NOT EXISTS idx_lecture_files_lec ON public.lecture_files (lecture_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_lecture_files_tenant ON public.lecture_files (tenant_id);

CREATE INDEX IF NOT EXISTS idx_unlock_rules_target ON public.content_unlock_rules (target_content_type, target_content_id);
CREATE INDEX IF NOT EXISTS idx_unlock_rules_req_exam ON public.content_unlock_rules (required_exam_id);
CREATE INDEX IF NOT EXISTS idx_unlock_rules_tenant ON public.content_unlock_rules (tenant_id);

-- ---------------------------------------------------------------------
-- 3. Hierarchy & Consistency Triggers
-- ---------------------------------------------------------------------

-- 3.1 Validate chapter / lesson hierarchy (package is optional)
CREATE OR REPLACE FUNCTION public.validate_course_chapter_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg RECORD;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    -- Validate package exists and matches tenant
    SELECT id, tenant_id, grade INTO v_pkg 
    FROM public.packages 
    WHERE id = NEW.package_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'package_not_found: specified package does not exist';
    END IF;

    IF v_pkg.tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch: package tenant does not match chapter tenant';
    END IF;

    -- Synchronize or inherit grade from parent package if not explicitly provided
    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      NEW.grade := v_pkg.grade;
    END IF;

    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      RAISE EXCEPTION 'missing_grade: lesson requires a grade';
    END IF;
  ELSE
    -- Standalone Lesson / Section without package requires an explicit grade
    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      RAISE EXCEPTION 'missing_grade: standalone lesson requires a grade';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_validate_course_chapter_hierarchy ON public.course_chapters;
CREATE TRIGGER trig_validate_course_chapter_hierarchy
  BEFORE INSERT OR UPDATE ON public.course_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_course_chapter_hierarchy();

-- 3.2 Synchronize lecture package_id and grade from parent chapter or validate standalone / direct package lecture
CREATE OR REPLACE FUNCTION public.validate_course_lecture_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chap RECORD;
  v_pkg  RECORD;
BEGIN
  -- CASE A: Standalone Lecture (no lesson, no package)
  IF NEW.chapter_id IS NULL AND NEW.package_id IS NULL THEN
    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      RAISE EXCEPTION 'missing_grade: standalone lecture requires a grade';
    END IF;

  -- CASE B: Lecture inside a Lesson / Section (chapter_id IS NOT NULL)
  ELSIF NEW.chapter_id IS NOT NULL THEN
    -- Validate chapter exists and matches tenant
    SELECT id, package_id, tenant_id, grade INTO v_chap 
    FROM public.course_chapters 
    WHERE id = NEW.chapter_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'chapter_not_found: specified chapter does not exist';
    END IF;

    IF v_chap.tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch: chapter tenant does not match lecture tenant';
    END IF;

    -- Synchronize package_id from parent chapter (if chapter.package_id is NULL, lecture.package_id becomes NULL)
    NEW.package_id := v_chap.package_id;

    -- Synchronize/derive grade from parent chapter or chapter's package
    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      NEW.grade := v_chap.grade;
      IF (NEW.grade IS NULL OR trim(NEW.grade) = '') AND v_chap.package_id IS NOT NULL THEN
        SELECT grade INTO v_pkg FROM public.packages WHERE id = v_chap.package_id;
        IF FOUND THEN
          NEW.grade := v_pkg.grade;
        END IF;
      END IF;
    END IF;

    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      RAISE EXCEPTION 'missing_grade: lecture requires a grade';
    END IF;

  -- CASE C: Direct Package Lecture (no lesson, but package_id IS NOT NULL)
  ELSIF NEW.chapter_id IS NULL AND NEW.package_id IS NOT NULL THEN
    -- Validate package exists and matches tenant
    SELECT id, tenant_id, grade INTO v_pkg 
    FROM public.packages 
    WHERE id = NEW.package_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'package_not_found: specified package does not exist';
    END IF;

    IF v_pkg.tenant_id <> NEW.tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch: package tenant does not match lecture tenant';
    END IF;

    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      NEW.grade := v_pkg.grade;
    END IF;

    IF NEW.grade IS NULL OR trim(NEW.grade) = '' THEN
      RAISE EXCEPTION 'missing_grade: package lecture requires a grade';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_validate_course_lecture_hierarchy ON public.course_lectures;
CREATE TRIGGER trig_validate_course_lecture_hierarchy
  BEFORE INSERT OR UPDATE ON public.course_lectures
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_course_lecture_hierarchy();

-- 3.3 Synchronize lectures when parent chapter package_id or grade changes
CREATE OR REPLACE FUNCTION public.sync_chapter_lectures_on_package_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_grade TEXT;
BEGIN
  IF OLD.package_id IS DISTINCT FROM NEW.package_id THEN
    IF NEW.package_id IS NOT NULL THEN
      SELECT grade INTO v_new_grade FROM public.packages WHERE id = NEW.package_id;
    ELSE
      v_new_grade := NEW.grade;
    END IF;

    UPDATE public.course_lectures
    SET package_id = NEW.package_id,
        grade = COALESCE(v_new_grade, grade),
        updated_at = timezone('utc'::text, now())
    WHERE chapter_id = NEW.id;
  ELSIF OLD.grade IS DISTINCT FROM NEW.grade AND NEW.package_id IS NULL THEN
    UPDATE public.course_lectures
    SET grade = NEW.grade,
        updated_at = timezone('utc'::text, now())
    WHERE chapter_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_sync_chapter_lectures_pkg ON public.course_chapters;
CREATE TRIGGER trig_sync_chapter_lectures_pkg
  AFTER UPDATE OF package_id, grade ON public.course_chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_chapter_lectures_on_package_change();

-- 3.3 Validate tenant consistency across junction associations
CREATE OR REPLACE FUNCTION public.validate_association_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lec_tenant  UUID;
  v_item_tenant UUID;
BEGIN
  -- Verify lecture tenant
  SELECT tenant_id INTO v_lec_tenant FROM public.course_lectures WHERE id = NEW.lecture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lecture_not_found: association target lecture does not exist';
  END IF;

  IF v_lec_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_mismatch: lecture tenant does not match association tenant';
  END IF;

  -- Verify associated content item tenant
  IF TG_TABLE_NAME = 'lecture_videos' THEN
    SELECT tenant_id INTO v_item_tenant FROM public.videos WHERE id = NEW.video_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'video_not_found: associated video does not exist';
    END IF;
    IF v_item_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch: video tenant does not match association tenant';
    END IF;

  ELSIF TG_TABLE_NAME = 'lecture_exams' THEN
    SELECT tenant_id INTO v_item_tenant FROM public.exams WHERE id = NEW.exam_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'exam_not_found: associated exam does not exist';
    END IF;
    IF v_item_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'tenant_mismatch: exam tenant does not match association tenant';
    END IF;

  ELSIF TG_TABLE_NAME = 'lecture_files' THEN
    -- lecture_files belongs strictly to lecture_id, checked above
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_validate_assoc_videos ON public.lecture_videos;
CREATE TRIGGER trig_validate_assoc_videos
  BEFORE INSERT OR UPDATE ON public.lecture_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_association_tenant_consistency();

DROP TRIGGER IF EXISTS trig_validate_assoc_exams ON public.lecture_exams;
CREATE TRIGGER trig_validate_assoc_exams
  BEFORE INSERT OR UPDATE ON public.lecture_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_association_tenant_consistency();

DROP TRIGGER IF EXISTS trig_validate_assoc_files ON public.lecture_files;
CREATE TRIGGER trig_validate_assoc_files
  BEFORE INSERT OR UPDATE ON public.lecture_files
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_association_tenant_consistency();

-- 3.4 Polymorphic target validation for content_unlock_rules
CREATE OR REPLACE FUNCTION public.validate_unlock_rule_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_tenant UUID;
  v_req_tenant    UUID;
BEGIN
  -- 1. Validate target_content_type
  IF NEW.target_content_type NOT IN ('lecture', 'exam', 'video') THEN
    RAISE EXCEPTION 'invalid_target_type: supported target types are lecture, exam, video';
  END IF;

  -- 2. Validate polymorphic target_content_id exists and matches tenant
  IF NEW.target_content_type = 'lecture' THEN
    SELECT tenant_id INTO v_target_tenant FROM public.course_lectures WHERE id = NEW.target_content_id;
  ELSIF NEW.target_content_type = 'exam' THEN
    SELECT tenant_id INTO v_target_tenant FROM public.exams WHERE id = NEW.target_content_id;
  ELSIF NEW.target_content_type = 'video' THEN
    SELECT tenant_id INTO v_target_tenant FROM public.videos WHERE id = NEW.target_content_id;
  END IF;

  IF v_target_tenant IS NULL THEN
    RAISE EXCEPTION 'target_not_found: specified target content item does not exist';
  END IF;

  IF v_target_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'cross_tenant_violation: target content belongs to a different tenant';
  END IF;

  -- 3. Validate required_exam_id exists and matches tenant
  SELECT tenant_id INTO v_req_tenant FROM public.exams WHERE id = NEW.required_exam_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'required_exam_not_found: specified prerequisite exam does not exist';
  END IF;

  IF v_req_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'cross_tenant_violation: prerequisite exam belongs to a different tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_validate_unlock_rule_target ON public.content_unlock_rules;
CREATE TRIGGER trig_validate_unlock_rule_target
  BEFORE INSERT OR UPDATE ON public.content_unlock_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_unlock_rule_target();

-- ---------------------------------------------------------------------
-- 4. Unified Graph Cycle Detection & Concurrency Safety
-- ---------------------------------------------------------------------

-- 4.1 Recursive path reachability check in the unified directed graph
CREATE OR REPLACE FUNCTION public.has_directed_graph_path(
  p_tenant_id  UUID,
  p_from_type  TEXT,
  p_from_id    UUID,
  p_to_type    TEXT,
  p_to_id      UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_has_path   BOOLEAN := FALSE;
  v_start_node TEXT := p_from_type || ':' || p_from_id::text;
  v_target_node TEXT := p_to_type || ':' || p_to_id::text;
BEGIN
  -- Direct self-check
  IF v_start_node = v_target_node THEN
    RETURN TRUE;
  END IF;

  WITH RECURSIVE graph_traversal AS (
    -- Initial outgoing edges from start node
    SELECT 
      edge.next_node,
      ARRAY[v_start_node, edge.next_node] AS visited_path,
      1 AS depth
    FROM (
      -- If start is exam:
      -- 1. Containment edges: Exam -> Containing Lectures (via lecture_exams)
      SELECT 'lecture:' || le.lecture_id::text AS next_node
      FROM public.lecture_exams le
      JOIN public.course_lectures cl ON cl.id = le.lecture_id
      WHERE p_from_type = 'exam' 
        AND cl.tenant_id = p_tenant_id 
        AND le.exam_id = p_from_id

      UNION ALL

      -- 2. Prerequisite edges: Target -> Required Exam (lecture, exam, or video)
      SELECT 'exam:' || cur.required_exam_id::text AS next_node
      FROM public.content_unlock_rules cur
      WHERE cur.tenant_id = p_tenant_id
        AND cur.is_active = true
        AND cur.target_content_type = p_from_type
        AND cur.target_content_id = p_from_id
    ) edge

    UNION ALL

    -- Recursive traversal step
    SELECT 
      step.next_node,
      gt.visited_path || step.next_node,
      gt.depth + 1
    FROM graph_traversal gt
    CROSS JOIN LATERAL (
      -- Containment edges (Exam -> Lecture)
      SELECT 'lecture:' || le.lecture_id::text AS next_node
      FROM public.lecture_exams le
      JOIN public.course_lectures cl ON cl.id = le.lecture_id
      WHERE cl.tenant_id = p_tenant_id
        AND split_part(gt.next_node, ':', 1) = 'exam'
        AND le.exam_id = split_part(gt.next_node, ':', 2)::uuid

      UNION ALL

      -- Prerequisite edges (Target -> Required Exam)
      SELECT 'exam:' || cur.required_exam_id::text AS next_node
      FROM public.content_unlock_rules cur
      WHERE cur.tenant_id = p_tenant_id
        AND cur.is_active = true
        AND cur.target_content_type = split_part(gt.next_node, ':', 1)
        AND cur.target_content_id = split_part(gt.next_node, ':', 2)::uuid
    ) step
    WHERE NOT (step.next_node = ANY(gt.visited_path))
      AND gt.depth < 50
  )
  SELECT EXISTS (
    SELECT 1 FROM graph_traversal
    WHERE next_node = v_target_node
  ) INTO v_has_path;

  RETURN v_has_path;
END;
$$;

-- 4.2 Cycle check trigger on content_unlock_rules mutations
CREATE OR REPLACE FUNCTION public.check_unlock_rule_cycle_on_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only evaluate when rule is active
  IF NEW.is_active = true THEN
    -- Immediate self-cycle check
    IF NEW.target_content_type = 'exam' AND NEW.target_content_id = NEW.required_exam_id THEN
      RAISE EXCEPTION 'self_cycle_detected: an exam cannot require itself as a prerequisite';
    END IF;

    -- Concurrency Safety (Section C.3): Tenant-scoped transaction advisory lock
    PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));

    -- Check if required_exam can reach target_content in existing graph
    IF public.has_directed_graph_path(NEW.tenant_id, 'exam', NEW.required_exam_id, NEW.target_content_type, NEW.target_content_id) THEN
      RAISE EXCEPTION 'cycle_detected: adding this unlock rule creates a circular dependency';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_check_unlock_rule_cycle ON public.content_unlock_rules;
CREATE TRIGGER trig_check_unlock_rule_cycle
  BEFORE INSERT OR UPDATE OF target_content_type, target_content_id, required_exam_id, is_active
  ON public.content_unlock_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.check_unlock_rule_cycle_on_mutation();

-- 4.3 Cycle check trigger on lecture_exams mutations (addExamToLecture validation)
CREATE OR REPLACE FUNCTION public.check_lecture_exam_containment_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Concurrency Safety (Section C.3): Tenant-scoped transaction advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text));

  -- Proposed edge: Exam NEW.exam_id -> Lecture NEW.lecture_id
  -- Reject if Lecture NEW.lecture_id can already reach Exam NEW.exam_id
  IF public.has_directed_graph_path(NEW.tenant_id, 'lecture', NEW.lecture_id, 'exam', NEW.exam_id) THEN
    RAISE EXCEPTION 'containment_cycle_detected: adding this exam to lecture creates a circular dependency with existing unlock rules';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_check_lecture_exam_containment_cycle ON public.lecture_exams;
CREATE TRIGGER trig_check_lecture_exam_containment_cycle
  BEFORE INSERT ON public.lecture_exams
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lecture_exam_containment_cycle();

-- ---------------------------------------------------------------------
-- 5. Secure Educational Unlock Gate
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_content_unlocked(
  p_student_id         UUID,
  p_target_type        TEXT,
  p_target_id          UUID,
  p_context_lecture_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid            UUID := auth.uid();
  v_tenant_id      UUID := public.current_tenant_id();
  v_rule           RECORD;
  v_best_score     NUMERIC;
  v_req_exam_title TEXT;
  v_parent_res     JSONB;
  v_has_assoc      BOOLEAN;
BEGIN
  -- 1. Security Check: Student can only check own status unless admin/staff
  IF v_uid IS NOT NULL AND v_uid <> p_student_id AND NOT (public.is_current_user_admin() OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden: cannot check unlock state of another student';
  END IF;

  -- 2. Target Type Validation
  IF p_target_type NOT IN ('lecture', 'exam', 'video') THEN
    RAISE EXCEPTION 'invalid_target_type: % is not a supported unlock target', p_target_type;
  END IF;

  -- 3. VIDEO Evaluation
  IF p_target_type = 'video' THEN
    -- Check if video belongs to any lectures
    SELECT EXISTS (
      SELECT 1 FROM public.lecture_videos 
      WHERE video_id = p_target_id AND tenant_id = v_tenant_id
    ) INTO v_has_assoc;

    IF v_has_assoc THEN
      -- Contained video requires explicit contextLectureId
      IF p_context_lecture_id IS NULL THEN
        RAISE EXCEPTION 'missing_context: contextLectureId is required for videos belonging to lectures'
          USING ERRCODE = '22023';
      END IF;

      -- Validate video is linked to context lecture
      IF NOT EXISTS (
        SELECT 1 FROM public.lecture_videos 
        WHERE lecture_id = p_context_lecture_id 
          AND video_id = p_target_id 
          AND tenant_id = v_tenant_id
      ) THEN
        RAISE EXCEPTION 'invalid_context: video does not belong to specified context lecture'
          USING ERRCODE = '22023';
      END IF;

      -- Check parent lecture unlock state first (Strict AND)
      v_parent_res := public.check_content_unlocked(p_student_id, 'lecture', p_context_lecture_id, NULL);
      IF (v_parent_res->>'unlocked')::BOOLEAN = FALSE THEN
        RETURN jsonb_build_object(
          'unlocked', FALSE,
          'reason', 'lecture_locked',
          'parent_lecture_id', p_context_lecture_id,
          'required_exam_id', v_parent_res->>'required_exam_id',
          'required_exam_title', v_parent_res->>'required_exam_title',
          'required_score', (v_parent_res->>'required_score')::NUMERIC,
          'student_score', (v_parent_res->>'student_score')::NUMERIC
        );
      END IF;
    ELSIF p_context_lecture_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_context: video does not belong to specified context lecture'
        USING ERRCODE = '22023';
    END IF;

    -- Evaluate direct video rule if one exists (Case A-D)
    SELECT * INTO v_rule 
    FROM public.content_unlock_rules
    WHERE tenant_id = v_tenant_id
      AND target_content_type = 'video'
      AND target_content_id = p_target_id
      AND is_active = true;

    IF NOT FOUND THEN
      -- No direct rule: Video is unlocked (Case A)
      RETURN jsonb_build_object('unlocked', TRUE);
    END IF;

    -- Direct rule exists: verify student best official attempt on required exam
    SELECT title INTO v_req_exam_title FROM public.exams WHERE id = v_rule.required_exam_id;

    SELECT MAX((score / NULLIF(max_score, 0)) * 100.0) INTO v_best_score
    FROM public.exam_attempts
    WHERE student_id = p_student_id
      AND exam_id = v_rule.required_exam_id
      AND submitted_at IS NOT NULL
      AND video_assessment_id IS NULL;

    IF v_best_score IS NOT NULL AND v_best_score >= v_rule.required_score THEN
      -- Prerequisite passed (Case B)
      RETURN jsonb_build_object(
        'unlocked', TRUE,
        'student_score', ROUND(v_best_score, 2),
        'required_score', v_rule.required_score
      );
    ELSE
      -- Prerequisite not passed (Case C)
      RETURN jsonb_build_object(
        'unlocked', FALSE,
        'reason', 'video_prerequisite_unmet',
        'required_exam_id', v_rule.required_exam_id,
        'required_exam_title', v_req_exam_title,
        'required_score', v_rule.required_score,
        'student_score', COALESCE(ROUND(v_best_score, 2), 0)
      );
    END IF;

  -- 4. EXAM Evaluation
  ELSIF p_target_type = 'exam' THEN
    -- Check if exam belongs to any lectures
    SELECT EXISTS (
      SELECT 1 FROM public.lecture_exams 
      WHERE exam_id = p_target_id AND tenant_id = v_tenant_id
    ) INTO v_has_assoc;

    IF v_has_assoc THEN
      -- Contained exam requires explicit contextLectureId
      IF p_context_lecture_id IS NULL THEN
        RAISE EXCEPTION 'missing_context: contextLectureId is required for exams belonging to lectures'
          USING ERRCODE = '22023';
      END IF;

      -- Validate exam is linked to specified context lecture
      IF NOT EXISTS (
        SELECT 1 FROM public.lecture_exams 
        WHERE lecture_id = p_context_lecture_id 
          AND exam_id = p_target_id 
          AND tenant_id = v_tenant_id
      ) THEN
        RAISE EXCEPTION 'invalid_context: exam does not belong to specified context lecture'
          USING ERRCODE = '22023';
      END IF;

      -- Check parent lecture unlock state
      v_parent_res := public.check_content_unlocked(p_student_id, 'lecture', p_context_lecture_id, NULL);
      IF (v_parent_res->>'unlocked')::BOOLEAN = FALSE THEN
        RETURN jsonb_build_object(
          'unlocked', FALSE,
          'reason', 'lecture_locked',
          'parent_lecture_id', p_context_lecture_id,
          'required_exam_id', v_parent_res->>'required_exam_id',
          'required_exam_title', v_parent_res->>'required_exam_title',
          'required_score', (v_parent_res->>'required_score')::NUMERIC,
          'student_score', (v_parent_res->>'student_score')::NUMERIC
        );
      END IF;
    END IF;

    -- Evaluate direct exam unlock rule if one exists (Exam B -> Exam A)
    SELECT * INTO v_rule 
    FROM public.content_unlock_rules
    WHERE tenant_id = v_tenant_id
      AND target_content_type = 'exam'
      AND target_content_id = p_target_id
      AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('unlocked', TRUE);
    END IF;

    SELECT title INTO v_req_exam_title FROM public.exams WHERE id = v_rule.required_exam_id;

    SELECT MAX((score / NULLIF(max_score, 0)) * 100.0) INTO v_best_score
    FROM public.exam_attempts
    WHERE student_id = p_student_id
      AND exam_id = v_rule.required_exam_id
      AND submitted_at IS NOT NULL
      AND video_assessment_id IS NULL;

    IF v_best_score IS NOT NULL AND v_best_score >= v_rule.required_score THEN
      RETURN jsonb_build_object(
        'unlocked', TRUE,
        'student_score', ROUND(v_best_score, 2),
        'required_score', v_rule.required_score
      );
    ELSE
      RETURN jsonb_build_object(
        'unlocked', FALSE,
        'reason', 'exam_prerequisite_unmet',
        'required_exam_id', v_rule.required_exam_id,
        'required_exam_title', v_req_exam_title,
        'required_score', v_rule.required_score,
        'student_score', COALESCE(ROUND(v_best_score, 2), 0)
      );
    END IF;

  -- 5. LECTURE Evaluation
  ELSIF p_target_type = 'lecture' THEN
    SELECT * INTO v_rule 
    FROM public.content_unlock_rules
    WHERE tenant_id = v_tenant_id
      AND target_content_type = 'lecture'
      AND target_content_id = p_target_id
      AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('unlocked', TRUE);
    END IF;

    SELECT title INTO v_req_exam_title FROM public.exams WHERE id = v_rule.required_exam_id;

    SELECT MAX((score / NULLIF(max_score, 0)) * 100.0) INTO v_best_score
    FROM public.exam_attempts
    WHERE student_id = p_student_id
      AND exam_id = v_rule.required_exam_id
      AND submitted_at IS NOT NULL
      AND video_assessment_id IS NULL;

    IF v_best_score IS NOT NULL AND v_best_score >= v_rule.required_score THEN
      RETURN jsonb_build_object(
        'unlocked', TRUE,
        'student_score', ROUND(v_best_score, 2),
        'required_score', v_rule.required_score
      );
    ELSE
      RETURN jsonb_build_object(
        'unlocked', FALSE,
        'reason', 'lecture_prerequisite_unmet',
        'required_exam_id', v_rule.required_exam_id,
        'required_exam_title', v_req_exam_title,
        'required_score', v_rule.required_score,
        'student_score', COALESCE(ROUND(v_best_score, 2), 0)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('unlocked', TRUE);
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Atomic Junction Operations (Execution Clarification 2)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_exam_from_lecture(
  p_lecture_id UUID,
  p_exam_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := public.current_tenant_id();
  v_uid    UUID := auth.uid();
BEGIN
  IF NOT (public.has_permission(v_uid, 'exams') OR public.has_permission(v_uid, 'videos') OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'forbidden: insufficient permissions';
  END IF;

  DELETE FROM public.lecture_exams
  WHERE lecture_id = p_lecture_id
    AND exam_id = p_exam_id
    AND tenant_id = v_tenant;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Row-Level Security Policies (Granular Permissions)
-- ---------------------------------------------------------------------

-- 7.1 course_chapters
ALTER TABLE public.course_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_chapters_select ON public.course_chapters;
CREATE POLICY course_chapters_select ON public.course_chapters
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS course_chapters_write ON public.course_chapters;
CREATE POLICY course_chapters_write ON public.course_chapters
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  );

-- 7.2 course_lectures
ALTER TABLE public.course_lectures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_lectures_select ON public.course_lectures;
CREATE POLICY course_lectures_select ON public.course_lectures
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS course_lectures_write ON public.course_lectures;
CREATE POLICY course_lectures_write ON public.course_lectures
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  );

-- 7.3 lecture_videos
ALTER TABLE public.lecture_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lecture_videos_select ON public.lecture_videos;
CREATE POLICY lecture_videos_select ON public.lecture_videos
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS lecture_videos_write ON public.lecture_videos;
CREATE POLICY lecture_videos_write ON public.lecture_videos
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  );

-- 7.4 lecture_exams
ALTER TABLE public.lecture_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lecture_exams_select ON public.lecture_exams;
CREATE POLICY lecture_exams_select ON public.lecture_exams
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS lecture_exams_write ON public.lecture_exams;
CREATE POLICY lecture_exams_write ON public.lecture_exams
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'exams') 
      OR public.has_permission(auth.uid(), 'videos') 
      OR public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'exams') 
      OR public.has_permission(auth.uid(), 'videos') 
      OR public.is_super_admin(auth.uid())
    )
  );

-- 7.5 lecture_files
ALTER TABLE public.lecture_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lecture_files_select ON public.lecture_files;
CREATE POLICY lecture_files_select ON public.lecture_files
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS lecture_files_write ON public.lecture_files;
CREATE POLICY lecture_files_write ON public.lecture_files
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (public.has_permission(auth.uid(), 'videos') OR public.is_super_admin(auth.uid()))
  );

-- 7.6 content_unlock_rules
ALTER TABLE public.content_unlock_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_unlock_rules_select ON public.content_unlock_rules;
CREATE POLICY content_unlock_rules_select ON public.content_unlock_rules
  FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS content_unlock_rules_write ON public.content_unlock_rules;
CREATE POLICY content_unlock_rules_write ON public.content_unlock_rules
  FOR ALL
  USING (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'exams') 
      OR public.has_permission(auth.uid(), 'videos') 
      OR public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
      public.has_permission(auth.uid(), 'exams') 
      OR public.has_permission(auth.uid(), 'videos') 
      OR public.is_super_admin(auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 8. Execution Verification Notice
-- ---------------------------------------------------------------------
SELECT 'Phase 1 Course Lectures System Migration created successfully' AS result;

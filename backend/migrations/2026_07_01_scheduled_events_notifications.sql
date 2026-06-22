-- =====================================================================
-- SQL MIGRATION: Auto Notifications on Scheduled Events (With Sync)
-- Automatically creates, updates, or deletes student notifications when 
-- admin manages events in the calendar scheduler.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.on_scheduled_event_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type_label TEXT;
  v_group_name TEXT;
  v_target_group TEXT;
  v_message TEXT;
BEGIN
  -- Handle DELETE: Remove matching notification so students don't see deleted events
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.notifications 
    WHERE meta->>'event_id' = OLD.id::text;
    RETURN OLD;
  END IF;

  -- Determine event type label for INSERT/UPDATE
  v_event_type_label := CASE NEW.event_type
    WHEN 'video' THEN 'فيديو محاضرة'
    WHEN 'homework' THEN 'تسليم واجب'
    WHEN 'exam' THEN 'امتحان مجدول'
    WHEN 'payment' THEN 'تذكير بالدفع'
    WHEN 'announcement' THEN 'تنبيه عام'
    ELSE 'فعالية مجدولة'
  END;

  -- Resolve group name composite if group_id is specified (<grade>:<group_name>)
  IF NEW.group_id IS NOT NULL THEN
    SELECT name INTO v_group_name FROM public.groups WHERE id = NEW.group_id;
    IF v_group_name IS NOT NULL THEN
      v_target_group := NEW.grade || ':' || v_group_name;
    END IF;
  END IF;

  -- Handle INSERT: Add a new targeted notification
  IF TG_OP = 'INSERT' THEN
    -- Format message
    v_message := 'تمت إضافة ' || v_event_type_label || ' جديد بعنوان "' || NEW.title || '" مجدول بتاريخ ' || 
                 to_char(NEW.starts_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');

    INSERT INTO public.notifications (
      tenant_id,
      title,
      message,
      level,
      scope,
      target_grade,
      target_group,
      meta,
      created_at
    ) VALUES (
      NEW.tenant_id,
      '📅 فعالية جديدة: ' || NEW.title,
      v_message,
      'info',
      CASE 
        WHEN v_target_group IS NOT NULL THEN 'group'::text
        ELSE 'grade'::text
      END,
      CASE 
        WHEN v_target_group IS NULL THEN NEW.grade
        ELSE NULL
      END,
      v_target_group,
      jsonb_build_object(
        'event_id', NEW.id,
        'event_type', NEW.event_type,
        'starts_at', NEW.starts_at
      ),
      now()
    );
  
  -- Handle UPDATE: Keep notification details, title, and target scope in sync
  ELSIF TG_OP = 'UPDATE' THEN
    -- Format message
    v_message := 'تم تحديث موعد ' || v_event_type_label || ' "' || NEW.title || '" ليصبح مجدولاً بتاريخ ' || 
                 to_char(NEW.starts_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD HH24:MI');

    UPDATE public.notifications
    SET
      title = '📅 تحديث فعالية: ' || NEW.title,
      message = v_message,
      scope = CASE 
        WHEN v_target_group IS NOT NULL THEN 'group'::text
        ELSE 'grade'::text
      END,
      target_grade = CASE 
        WHEN v_target_group IS NULL THEN NEW.grade
        ELSE NULL
      END,
      target_group = v_target_group,
      meta = jsonb_build_object(
        'event_id', NEW.id,
        'event_type', NEW.event_type,
        'starts_at', NEW.starts_at
      )
    WHERE meta->>'event_id' = NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_scheduled_events_notification ON public.scheduled_events;
CREATE TRIGGER trig_scheduled_events_notification
AFTER INSERT OR UPDATE OR DELETE ON public.scheduled_events
FOR EACH ROW EXECUTE FUNCTION public.on_scheduled_event_changes();

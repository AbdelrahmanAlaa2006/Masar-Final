# WhatsApp Notification Templates System

This system implements a production-grade, multi-tenant safe template-based notification system for WhatsApp messages.

---

## 1. Available Placeholders

The template rendering engine automatically parses and replaces the following double-curly-braces placeholders:

| Placeholder | Description | Resolved From |
| :--- | :--- | :--- |
| `{{student_name}}` | Student's full name | Student profile |
| `{{teacher_name}}` | Current teacher name | Tenant configuration (`config.teacher.name`) |
| `{{teacher_phone_1}}` | Teacher primary contact phone | Tenant configuration / Egyptian fallback |
| `{{teacher_phone_2}}` | Teacher secondary contact phone | Tenant configuration / Egyptian fallback |
| `{{teacher_phones}}` | Concatenated contact phone numbers | Teacher phones block |
| `{{teacher_signature}}` | Teacher role description | Tenant configuration (`config.teacher.role`) |
| `{{lesson_name}}` | Name of the session, quiz, or homework | Attendance session / Grade title |
| `{{group_name}}` | Student's attendance group name | Student group / Session group |
| `{{quiz_name}}` | Name of the quiz | Grade record title (where type = quiz) |
| `{{exam_name}}` | Name of the exam | Grade record title (where type = exam) |
| `{{homework_name}}` | Name of the homework | Grade record title (where type = homework) |
| `{{grade}}` | Score obtained | Grade record score |
| `{{total_grade}}` | Max score possible | Grade record max score |
| `{{date}}` | Date of the record (e.g. `١٦ يوليو ٢٠٢٦`) | Record created_at / Session date |
| `{{day_name}}` | Weekday name (e.g. `الخميس`) | Record created_at / Session date |
| `{{course_name}}` | Subject / Course title | Subject field / Tenant subject config |
| `{{attendance_status}}` | Text description of attendance (`تغيب` / `حضر متأخراً`) | Attendance record status |

*Note: Any unknown placeholder is automatically replaced with `""` (empty string) to prevent rendering errors.*

---

## 2. Rendering Engine & Caching Logic

All template rendering operations flow through the `renderNotificationTemplate()` function inside [whatsappTemplates.js](file:///c:/Users/LENOVO/Downloads/masaar-react-new/backend/whatsappTemplates.js).

### Template Cache & Stampede Protection
1. **Tenant Isolation**: Active templates are loaded once and stored in-memory (`Map` using `tenant_id` as the cache key) with a **5-minute TTL**. A tenant's thread can never read or leak another tenant's templates.
2. **Single-Flight Cache Loading**: To protect the database from connection stampedes under high concurrency (e.g., when a teacher saves attendance for 200 students at once, causing 200 simultaneous cache misses), only one database query is executed. Other simultaneous lookups for the same tenant await the same in-flight Promise.
3. **Automatic Fallback**: If a tenant has not configured a customized template for a notification type, the engine falls back to standard default templates dynamically resolved for that tenant (with special professional defaults pre-seeded for `mohamed-abdella`).

---

## 3. How Teachers Can Customize Templates

Each tenant holds independent templates in the `whatsapp_templates` table. 

### Database Schema Structure
* **`tenant_id`**: Identifies the owner of the template.
* **`notification_type`**: The explicit type identifier:
  - `attendance_absent` (Attendance absent alert)
  - `attendance_makeup` (Attendance late alert)
  - `quiz` (Quiz evaluation)
  - `exam` (Exam evaluation)
  - `homework` (Homework evaluation)
  - `payment` (Subscription and payment invoice warnings)
  - `behavior` / `participation` (General student behavior reviews)
  - `general` (Generic fallback message alert)
* **`template`**: Text content containing placeholders.
* **`version`**: Autoincrementing version counter.
* **`is_active`**: Boolean flag indicating if this is the active version. Only a single row can be active per `(tenant_id, notification_type)` combination.

### Versioning Behavior
When a teacher modifies template text via the UI settings page:
1. The backend calls `saveTemplate(tenantId, notificationType, templateText, createdBy)`.
2. Existing active records for that type and tenant are updated to `is_active = false`.
3. A new row is inserted with `version = previous_max + 1` and `is_active = true`.
4. The template cache for `tenantId` is immediately invalidated.

---

## 4. Migration Summary

A safe, deterministic migration script was executed:
- **Total pending queue analyzed**: 81 notifications.
- **Attendance notifications migrated**: 9 rows. These rows were deterministically matched to their `attendance_records` via the `attendance_record_id` foreign key, pulling their respective student names, dates, lesson names, and groups from database joins, and updating their messages using the new templates.
- **Grade notifications skipped**: 72 rows. Grade notifications created under the old system lacked direct database foreign keys. Under the strict migration constraint of never parsing raw human-readable messages, all such rows were safely left untouched with their original messages intact.
- **Queue integrity**: All UUIDs, retry counters, queue ordering (`created_at`), scheduling metadata, and history metrics remain 100% untouched.

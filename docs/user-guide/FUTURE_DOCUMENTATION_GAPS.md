# Documentation gaps — things the guide could not promise

These came out of the audit that produced `student-parent-guide.pdf`. Each one is
a place where a student or parent would reasonably expect a capability, and the
application does not currently provide it — or provides something different from
what the in-app copy claims.

**Nothing here was implemented.** The guide documents current behaviour only.

---

## 1. A student cannot change their own password

**Missing capability** — self-service password change from inside the account.

**Why users need it** — a student who suspects their password leaked (or just
wants a memorable one) has no way to rotate it. Shared passwords between
classmates are a real cheating vector on a platform with timed exams.

**Current behaviour** — `Profile.jsx` has no password field. The only route is
the "نسيت كلمة المرور؟" modal on the login page, which inserts a row into
`password_reset_requests`; an admin then sets a new password manually from the
control panel and communicates it out of band. The success copy says
*"يرجى مراجعة معلمك أو مسؤول المنصة لاستلام كلمة المرور الجديدة"*.

**Recommended future improvement** — a "تغيير كلمة المرور" card in Profile that
requires the current password, with the manual-reset flow kept as the recovery
path for students who are locked out.

---

## 2. The "ملاحظاتي" tab is read-only for students

**Missing capability** — students writing their own timestamped notes.

**Why users need it** — the tab is literally called *"ملاحظاتي"* ("my notes")
and the section subtitle says *"اكتب ملاحظاتك أثناء المشاهدة"*, so students
expect to be able to write. The data model already supports it
(`video_notes.profile_id`, and `createNote` is called with the current user id).

**Current behaviour** — in `VideoPlayerWorkspace.jsx`,
`isNotesAllowed = userRole === 'admin' || userRole === 'assistant'`, and both the
composer form and the delete button are behind that flag. A student sees the
heading, the subtitle inviting them to write, and then an empty state. Notes are
also only offered when the part's source is YouTube; Bunny and Drive parts show
*"الملاحظات الذكية وتحديد التوقيت مدعومة حالياً لفيديوهات اليوتيوب"*.

**Recommended future improvement** — either allow students to create and delete
their own notes (RLS already scopes reads per user), or rename the tab so it does
not promise authorship. The guide currently describes it as view-only, which is
accurate but reads oddly next to the on-screen invitation to write.

---

## 3. The homework deadline is displayed but not enforced

**Missing capability** — a hard cut-off at `due_at`.

**Why users need it** — a student who sees *"فات موعد التسليم"* cannot tell
whether submitting now still counts. Teachers cannot tell from the grade alone
that a submission was late.

**Current behaviour** — `HomeworkCard` switches the status pill to
*"فات موعد التسليم"* once `due_at` has passed, but the action button stays
*"حل الواجب"* and the `submit_homework` RPC performs no `due_at` check, so a late
submission is accepted and auto-graded normally. Only `submitted_at` records the
fact.

**Recommended future improvement** — decide the intended policy and make the UI
match it: either block submission after the deadline, or keep it open and show a
"متأخر" marker on the submission for both the student and the teacher.

---

## 4. The in-app FAQ overstates what the exam result screen shows

**Missing capability** — answer review on the result screen itself.

**Why users need it** — `Help.jsx` tells students *"تظهر النتيجة بشكل فوري بعد
إنهاء الامتحان مع توضيح الإجابات الصحيحة"*. Students will look for the correct
answers on that screen and not find them.

**Current behaviour** — `ExamTaking.jsx`'s finished state shows only the score,
the total, and how many questions were answered. Per-question review (your answer
vs. the correct one) exists, but in a different place: **«التقارير» ← «تقرير
الامتحانات» ← «مراجعة»**, and it only unlocks once grades are revealed for that
exam (`reveal_grades`, or a per-student override).

**Recommended future improvement** — correct the FAQ wording, and optionally add
a "مراجعة الإجابات" link on the result screen that deep-links into the report
when grades are already revealed.

---

## 5. Parents have no account, and no way to fix their own access

**Missing capability** — a parent identity of any kind.

**Why users need it** — a parent whose number changed, or who was never recorded,
has no self-service path at all. There is also no parent-side audit: anyone who
knows a registered parent phone number can open that child's full academic and
financial record, because the phone number is the only factor.

**Current behaviour** — there is no `parent` role. Access is the unauthenticated
`/public-report` page, which calls `get_parent_portal_summary(phone, tenant)` and
returns every student whose `profiles.parent_phone` matches. `parent_phone` is
captured at registration and is explicitly read-only for the student
(*"يتم إدخال رقم ولي الأمر عند التسجيل فقط. لتعديله، يرجى التواصل مع الإدارة"*).

**Recommended future improvement** — at minimum a one-time code sent to the
parent's WhatsApp before the report opens. A real parent account with its own
login would be the fuller fix.

---

## 6. The parent portal sends a WhatsApp message on every successful lookup

**Missing capability** — parent-visible control over that message.

**Why users need it** — a parent checking the report five times in an evening
receives five WhatsApp messages, with no opt-out and no warning before the first
one. The confirmation banner announces the send after the fact:
*"تم التحقق بنجاح وإرسال نسخة تفصيلية للتقرير عبر واتساب!"*.

**Current behaviour** — `performVerify` calls `sendWhatsAppReport`
unconditionally, which queues `queue_public_notification` and also attempts an
immediate gateway send.

**Recommended future improvement** — make the send an explicit button
("أرسل التقرير على واتساب") rather than a side effect of opening the page.

---

## 7. Some in-app copy is hardcoded to one brand on every tenant

**Missing capability** — tenant-aware copy in the help and support surfaces.

**Why users need it** — a student on another teacher's domain reads
*"منصة مسار التعليمية"* in the help page intro and in the WhatsApp report header,
which does not match the brand they signed up with.

**Current behaviour** — `Help.jsx` hardcodes the brand in its hero paragraph, and
`PublicReport.jsx` hardcodes `🏫 *منصة مسار التعليمية*` into the WhatsApp report
body, while the rest of the app resolves the brand from the tenant config.

**Recommended future improvement** — resolve both from `tenant.name` /
`themeConfig.branding.brand_short` like the header and footer already do.

---

## 8. The parent child-lists are unreadable on the light theme

**Missing capability** — theme-aware text colour in the parent portal's child
pickers.

**Why users need it** — a parent with several children opens the picker and sees
rows with a grade label and an apparently blank name. This was hit while
capturing screenshots for this guide: the parent flow had to be shot in dark mode
because the names were invisible in light mode.

**Current behaviour** — both child lists hardcode `color: '#fff'`:
the picker in `Login.jsx` (`childrenList.map(...)`, the button's inline style) and
the sibling switcher in `PublicReport.jsx` (`siblings.map(...)`). On the light
theme the surrounding card is near-white, so white text on white is the result.
Everything else on the page reads its colours from `isDark`.

**Recommended future improvement** — drive those two colours from the same
`isDark` flag the rest of the page already uses.

---

## 9. No student-facing notification settings

**Missing capability** — muting or filtering notification types.

**Why users need it** — the bell aggregates announcements, reveal notices, and
account alerts with no way to filter, and there is no email/WhatsApp preference
for the student themselves (WhatsApp alerts target the parent number).

**Current behaviour** — `Notifications.jsx` offers read/mark-read only. Students
have no settings screen at all.

**Recommended future improvement** — low priority; worth revisiting only if
notification volume grows.

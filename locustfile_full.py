# =============================================================================
# locustfile_full.py — full-system load suite (Masaar multi-tenant SaaS)
#
# Extends the existing read-only locustfile.py with: all five user profiles,
# the real per-user POLLING FLOOR (chat 5s + notifications 30s), write paths
# (attendance/grades via RPC), the barcode RPC, dashboard counts, reports, and
# a staged load shape (10 → 25 → 50 → 100 → 250 → 500).
#
# ⚠️  RUN AGAINST STAGING ONLY.
#   • Point .env / env vars at a STAGING Supabase project, never production.
#   • Writes are DISABLED by default (ENABLE_WRITES=0). Enabling them calls
#     save_attendance_batch_v2 etc., which WRITE rows and can ENQUEUE REAL
#     WhatsApp messages. Only enable on staging with the WhatsApp gateway
#     disabled / pointed at a sandbox.
#
# Run:
#   locust -f locustfile_full.py --headless -u 500 -r 20 -t 15m \
#          --csv=perf_full --html=perf_full.html
#   # or drive the built-in staged shape (ignores -u/-r):
#   locust -f locustfile_full.py --headless --html=perf_full.html
#
# Metrics produced by Locust (per named request): P50/P95/P99, RPS, failures,
# Average Content Size (payload bytes). RPC and Edge calls are named distinctly
# so their latency is isolated from plain table reads.
# =============================================================================
import os
import random
import requests
from locust import HttpUser, task, constant_pacing, between, events, LoadTestShape

# ---------------------------------------------------------------------------
# Config (reuse the .env loader shape from locustfile.py)
# ---------------------------------------------------------------------------
def _load_env():
    url = key = None
    p = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip("'\"")
                if k == "VITE_SUPABASE_URL":
                    url = v
                elif k == "VITE_SUPABASE_ANON_KEY":
                    key = v
    return url, key

SUPABASE_URL, SUPABASE_ANON_KEY = _load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL", SUPABASE_URL or "https://STAGING.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY or "")
ENABLE_WRITES = os.getenv("ENABLE_WRITES", "0") == "1"

# Test credentials — override via env for staging. One account per role.
CREDS = {
    "student":     (os.getenv("STUDENT_EMAIL", "01006490631@masaar.app"), os.getenv("STUDENT_PASSWORD", "12345678")),
    "admin":       (os.getenv("ADMIN_EMAIL", "01099999999@masaar.app"),   os.getenv("ADMIN_PASSWORD", "12345678")),
    "assistant":   (os.getenv("ASSISTANT_EMAIL", ""), os.getenv("ASSISTANT_PASSWORD", "")),
    "super_admin": (os.getenv("SUPER_EMAIL", ""),     os.getenv("SUPER_PASSWORD", "")),
}
# A known student id + barcode token in the STAGING tenant for RPC/report tasks.
SAMPLE_STUDENT_ID = os.getenv("SAMPLE_STUDENT_ID", "")
SAMPLE_BARCODE    = os.getenv("SAMPLE_BARCODE", "")
SAMPLE_GRADE      = os.getenv("SAMPLE_GRADE", "first-sec")

TOKENS = {}

STUDENT_LIST_LEAN = ("id,name,phone,grade,avatar_url,created_at,is_active,is_approved,"
                     "status,branch_id,academic_year_id,enrollment_type")


def _fetch_token(email, password):
    if not email or not password or not SUPABASE_ANON_KEY:
        return None
    try:
        r = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json().get("access_token")
        print(f"[auth] FAILED {email}: {r.status_code} {r.text[:160]}")
    except Exception as e:
        print(f"[auth] ERROR {email}: {e}")
    return None


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("Pre-authenticating each role ONCE (avoids the auth rate-limit storm)...")
    for role, (email, pw) in CREDS.items():
        TOKENS[role] = _fetch_token(email, pw)
        print(f"[auth] {role:12s}: {'OK' if TOKENS[role] else 'MISSING'}")
    print(f"[writes] {'ENABLED — staging only!' if ENABLE_WRITES else 'disabled (read-only)'}")


class _Base(HttpUser):
    abstract = True
    host = SUPABASE_URL
    role = "student"

    def on_start(self):
        self.token = TOKENS.get(self.role) or TOKENS.get("admin")
        self.h = {"apikey": SUPABASE_ANON_KEY}
        if self.token:
            self.h["Authorization"] = f"Bearer {self.token}"

    def _get(self, path, name):
        if not self.token:
            return
        self.client.get(path, headers=self.h, name=name)

    def _rpc(self, fn, body, name):
        if not self.token:
            return
        self.client.post(f"/rest/v1/rpc/{fn}", json=body,
                         headers={**self.h, "Content-Type": "application/json"}, name=name)


# ---------------------------------------------------------------------------
# STUDENT — dominant traffic. Models the polling floor + content browsing.
# ---------------------------------------------------------------------------
class StudentUser(_Base):
    weight = 20
    role = "student"
    wait_time = between(2, 6)  # realistic reading gaps

    @task(5)
    def videos(self):
        self._get("/rest/v1/videos?select=id,title,description,grade,is_archived,created_at&is_archived=eq.false",
                  "Student: videos (lean)")

    @task(3)
    def exams(self):
        self._get("/rest/v1/exams?select=id,number,title,grade,duration_minutes,total_points,reveal_grades,created_at&is_archived=eq.false&order=created_at.desc",
                  "Student: exams (lean)")

    @task(2)
    def homeworks(self):
        self._get("/rest/v1/homeworks?select=id,title,grade,due_at,max_score,is_archived,created_at&is_archived=eq.false",
                  "Student: homeworks (lean)")

    @task(1)
    def profile(self):
        self._get("/rest/v1/profiles?select=id,name,grade,status", "Student: own profile")

    # ---- THE POLLING FLOOR (this is what the audit flags as Critical) ----
    @task(6)
    def notifications_poll(self):
        # Mirrors Notifications.jsx: 50 full rows + all read-ids, every 30s.
        self._get("/rest/v1/notifications?select=id,title,message,level,scope,target_grade,target_group,target_student,meta,created_by,created_at&order=created_at.desc&limit=50",
                  "POLL Notifications: list(50)")
        if SAMPLE_STUDENT_ID:
            self._get(f"/rest/v1/notification_reads?select=notification_id&user_id=eq.{SAMPLE_STUDENT_ID}",
                      "POLL Notifications: my read-ids (unbounded)")

    @task(12)
    def chat_poll(self):
        # Mirrors StudentChatWidget.jsx: every 5s while mounted.
        if SAMPLE_STUDENT_ID:
            self._get(f"/rest/v1/chat_messages?select=id,body,sender,created_at,image_url&student_id=eq.{SAMPLE_STUDENT_ID}&order=created_at.asc",
                      "POLL Chat: messages")

    @task(1)
    def quiz_submit(self):
        if not ENABLE_WRITES:
            return
        self._rpc("submit_exam_attempt", {"p_exam_id": os.getenv("SAMPLE_EXAM_ID", ""), "p_responses": []},
                  "WRITE Student: submit_exam_attempt (RPC)")


# ---------------------------------------------------------------------------
# TEACHER / ADMIN — dashboard, roster, reports, attendance/grade writes.
# ---------------------------------------------------------------------------
class TeacherUser(_Base):
    weight = 2
    role = "admin"
    wait_time = between(3, 8)

    @task(3)
    def dashboard_counts(self):
        self._rpc("get_student_status_counts", {"p_grade": None}, "Admin: get_student_status_counts (RPC)")

    @task(3)
    def roster_paged(self):
        self._get(f"/rest/v1/profiles?select={STUDENT_LIST_LEAN}&role=eq.student&order=name.asc&limit=50&offset=0",
                  "Admin: roster PAGED+lean")

    @task(1)
    def roster_count(self):
        if not self.token:
            return
        self.client.head("/rest/v1/profiles?select=id&role=eq.student",
                         headers={**self.h, "Prefer": "count=exact"}, name="Admin: roster COUNT head-only")

    @task(2)
    def whatsapp_summary(self):
        # 3 head-only counts (getNotificationQueueSummary).
        for st in ("pending", "sent", "failed"):
            if not self.token:
                return
            self.client.head(
                f"/rest/v1/unified_notifications?select=id&channels=cs.%7Bwhatsapp%7D&status->>whatsapp=eq.{st}",
                headers={**self.h, "Prefer": "count=exact"}, name=f"Admin: wa summary count [{st}]")

    @task(2)
    def grades_report(self):
        # Mirrors reportsApi over-fetch (all grades of a type) — watch payload size.
        self._get("/rest/v1/grades?select=title,max_score,profiles!student_id(grade)&type=eq.exam",
                  "Admin: grades report (OVER-FETCH)")

    @task(1)
    def attendance_save(self):
        if not ENABLE_WRITES:
            return
        self._rpc("save_attendance_batch_v2",
                  {"p_session_id": os.getenv("SAMPLE_SESSION_ID", ""), "p_records": []},
                  "WRITE Admin: save_attendance_batch_v2 (RPC)")


# ---------------------------------------------------------------------------
# ASSISTANT — attendance + grades subset (barcode-driven session).
# ---------------------------------------------------------------------------
class AssistantUser(_Base):
    weight = 2
    role = "assistant"
    wait_time = between(1, 4)  # fast: scanning students at the door

    @task(6)
    def barcode_lookup(self):
        if SAMPLE_BARCODE:
            self._rpc("get_student_identity", {"p_token": SAMPLE_BARCODE}, "Assistant: get_student_identity (RPC)")

    @task(2)
    def roster_paged(self):
        self._get(f"/rest/v1/profiles?select={STUDENT_LIST_LEAN}&role=eq.student&order=name.asc&limit=50",
                  "Assistant: roster PAGED+lean")

    @task(1)
    def attendance_save(self):
        if not ENABLE_WRITES:
            return
        self._rpc("save_attendance_batch_v2",
                  {"p_session_id": os.getenv("SAMPLE_SESSION_ID", ""), "p_records": []},
                  "WRITE Assistant: save_attendance_batch_v2 (RPC)")


# ---------------------------------------------------------------------------
# PARENT — public report (barcode/QR identity). Usually low volume, spiky.
# ---------------------------------------------------------------------------
class ParentUser(_Base):
    weight = 1
    role = "admin"  # public report resolves via RPC; reuse a token for the test
    wait_time = between(10, 30)  # a parent checks occasionally

    @task
    def public_report(self):
        if SAMPLE_BARCODE:
            self._rpc("get_student_identity", {"p_token": SAMPLE_BARCODE}, "Parent: public report identity (RPC)")


# ---------------------------------------------------------------------------
# SUPER ADMIN — cross-tenant overview. Very low volume.
# ---------------------------------------------------------------------------
class SuperAdminUser(_Base):
    weight = 1
    role = "super_admin"
    wait_time = between(5, 15)

    @task
    def tenants_list(self):
        self._get("/rest/v1/tenants?select=id,slug,name,domain&order=name.asc", "SuperAdmin: tenants list")


# ---------------------------------------------------------------------------
# STAGED LOAD SHAPE — 10 → 25 → 50 → 100 → 250 → 500, each held to steady state.
# Run without -u/-r to use this. Each stage lasts `duration` seconds (cumulative).
# ---------------------------------------------------------------------------
class StagedRamp(LoadTestShape):
    stages = [
        {"duration": 120,  "users": 10,  "spawn_rate": 5},
        {"duration": 300,  "users": 25,  "spawn_rate": 5},
        {"duration": 540,  "users": 50,  "spawn_rate": 10},
        {"duration": 840,  "users": 100, "spawn_rate": 10},
        {"duration": 1200, "users": 250, "spawn_rate": 20},
        {"duration": 1680, "users": 500, "spawn_rate": 25},
    ]

    def tick(self):
        t = self.get_run_time()
        for s in self.stages:
            if t < s["duration"]:
                return (s["users"], s["spawn_rate"])
        return None

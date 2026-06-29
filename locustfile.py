import os
import requests
from locust import HttpUser, task, between, events

# ---------------------------------------------------------------------------
# Read Supabase config from .env
# ---------------------------------------------------------------------------
def load_env_variables():
    supabase_url = None
    supabase_anon_key = None
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key == "VITE_SUPABASE_URL":
                    supabase_url = val
                elif key == "VITE_SUPABASE_ANON_KEY":
                    supabase_anon_key = val
    return supabase_url, supabase_anon_key

SUPABASE_URL, SUPABASE_ANON_KEY = load_env_variables()
if not SUPABASE_URL:
    SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------
STUDENT_EMAIL = "01006490631@masaar.app"
STUDENT_PASSWORD = "12345678"
ADMIN_EMAIL = "01099999999@masaar.app"
ADMIN_PASSWORD = "12345678"

# Tokens are fetched ONCE before the test starts (not per virtual user), so the
# 500-user ramp does NOT hammer Supabase Auth and trigger 429 rate-limits. This
# lets the test actually measure database/PostgREST capacity.
TOKENS = {"student": None, "admin": None}

# Lean projection mirroring the app's optimized student-list query (no password,
# no heavy fields). Avoids reserved-word quoting by omitting "group".
STUDENT_LIST_LEAN = (
    "id,name,phone,grade,avatar_url,created_at,is_active,is_approved,"
    "status,branch_id,academic_year_id,enrollment_type"
)


def fetch_token(email, password):
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    try:
        r = requests.post(
            url,
            json={"email": email, "password": password},
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            timeout=20,
        )
        if r.status_code == 200:
            return r.json().get("access_token")
        print(f"[auth] LOGIN FAILED for {email}: {r.status_code} - {r.text[:200]}")
    except Exception as e:
        print(f"[auth] LOGIN ERROR for {email}: {e}")
    return None


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("Pre-authenticating once (student + admin) to avoid the auth rate-limit storm...")
    TOKENS["student"] = fetch_token(STUDENT_EMAIL, STUDENT_PASSWORD)
    TOKENS["admin"] = fetch_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    print(f"[auth] student token: {'OK' if TOKENS['student'] else 'MISSING'}")
    print(f"[auth] admin token:   {'OK' if TOKENS['admin'] else 'MISSING'}")


class StudentUser(HttpUser):
    """90% of traffic — a student browsing content (lean query shapes)."""
    weight = 9
    host = SUPABASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        # Use the student token if available; otherwise fall back to the admin
        # token so the read-load still runs (admin reads are heavier, so this is
        # a conservative DB-capacity test).
        self.token = TOKENS["student"] or TOKENS["admin"]
        self.headers = {"apikey": SUPABASE_ANON_KEY}
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"

    @task(4)
    def view_videos(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/videos?select=id,title,description,grade,is_archived,created_at&is_archived=eq.false",
            headers=self.headers, name="Student: videos (lean)",
        )

    @task(3)
    def view_exams(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/exams?select=id,number,title,grade,duration_minutes,total_points,reveal_grades,created_at&is_archived=eq.false&order=created_at.desc",
            headers=self.headers, name="Student: exams (lean)",
        )

    @task(2)
    def view_homeworks(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/homeworks?select=id,title,grade,due_at,max_score,is_archived,created_at&is_archived=eq.false",
            headers=self.headers, name="Student: homeworks (lean)",
        )

    @task(1)
    def get_own_profile(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/profiles?select=id,name,grade,status",
            headers=self.headers, name="Student: own profile",
        )


class AdminUser(HttpUser):
    """10% of traffic — compares OLD whole-roster vs NEW paginated/count shapes."""
    weight = 1
    host = SUPABASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        self.token = TOKENS["admin"]
        self.headers = {"apikey": SUPABASE_ANON_KEY}
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"

    # OLD shape: whole roster, every column (what the app did BEFORE).
    @task(1)
    def students_full_old(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/profiles?select=*&role=eq.student&order=name.asc",
            headers=self.headers, name="Admin: students select=* WHOLE roster (OLD)",
        )

    # NEW shape: first page only + lean columns (what the app does NOW).
    @task(2)
    def students_paged_new(self):
        if not self.token:
            return
        self.client.get(
            f"/rest/v1/profiles?select={STUDENT_LIST_LEAN}&role=eq.student&order=name.asc&limit=50&offset=0",
            headers=self.headers, name="Admin: students PAGED+lean limit=50 (NEW)",
        )

    # NEW shape: head-only COUNT for dashboard badges (no rows transferred).
    @task(1)
    def students_count_new(self):
        if not self.token:
            return
        h = dict(self.headers)
        h["Prefer"] = "count=exact"
        self.client.head(
            "/rest/v1/profiles?select=id&role=eq.student",
            headers=h, name="Admin: students COUNT head-only (NEW)",
        )

# =============================================================================
# locustfile_peak.py — SPIKE / thundering-herd test ("exam start" worst case).
#
# Models the scary scenario: a calm baseline, then a SUDDEN flood of students
# all hitting at the same second (exam opens / results drop), a held peak, a
# drop, and a SECOND rush. Read-only (no writes, no WhatsApp).
#
# ⚠️ HONEST LIMIT: a single laptop can only *generate* ~500–1000 concurrent
# before ITS OWN TCP stack (not the server) becomes the bottleneck — you'll see
# client-side ConnectionReset errors that are the test rig, not Supabase. So:
#   • The CLIENT numbers (Locust latency/errors) are a LOWER bound / noisy.
#   • The REAL signal is the SUPABASE DASHBOARD during the run:
#     CPU, RAM, and connections. If those stay low while this floods, you have
#     massive headroom. Watch: dashboard → project home (CPU/RAM/conns graph).
# To test a true 3,000+ concurrent representatively you need DISTRIBUTED locust
# (multiple workers) or a cloud load runner — ask and I'll set that up.
#
# Run (watch the Supabase dashboard live while it runs):
#   locust -f locustfile_peak.py --headless --html=perf_peak.html --csv=perf_peak
# =============================================================================
import os
import requests
from locust import HttpUser, task, constant_pacing, events, LoadTestShape


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
STUDENT = (os.getenv("STUDENT_EMAIL", "01006490631@masaar.app"), os.getenv("STUDENT_PASSWORD", "12345678"))
ADMIN = (os.getenv("ADMIN_EMAIL", "01099999999@masaar.app"), os.getenv("ADMIN_PASSWORD", "12345678"))
TOKENS = {}


def _fetch_token(email, password):
    if not email or not password or not SUPABASE_ANON_KEY:
        return None
    try:
        r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                          json={"email": email, "password": password},
                          headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"}, timeout=20)
        if r.status_code == 200:
            return r.json().get("access_token")
        print(f"[auth] FAILED {email}: {r.status_code} {r.text[:160]}")
    except Exception as e:
        print(f"[auth] ERROR {email}: {e}")
    return None


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    print("Pre-authenticating once (student + admin)...")
    TOKENS["student"] = _fetch_token(*STUDENT)
    TOKENS["admin"] = _fetch_token(*ADMIN)
    print(f"[auth] student: {'OK' if TOKENS['student'] else 'MISSING'} | admin: {'OK' if TOKENS['admin'] else 'MISSING'}")
    print(">>> WATCH THE SUPABASE DASHBOARD (CPU / RAM / connections) — that is the real signal <<<")


class ExamRushUser(HttpUser):
    """The thundering herd: each student, at exam-open, rapidly loads the exam
    list + a filtered exam + their profile with almost no think time — so a
    sudden spawn of thousands = a realistic query storm on the DB."""
    host = SUPABASE_URL
    wait_time = constant_pacing(1.0)  # aggressive: ~1 action/sec/user

    def on_start(self):
        self.token = TOKENS.get("student") or TOKENS.get("admin")
        self.h = {"apikey": SUPABASE_ANON_KEY}
        if self.token:
            self.h["Authorization"] = f"Bearer {self.token}"

    def _get(self, path, name):
        if self.token:
            self.client.get(path, headers=self.h, name=name)

    @task(4)
    def load_exam_list(self):
        self._get("/rest/v1/exams?select=id,number,title,grade,duration_minutes,total_points,reveal_grades,created_at&is_archived=eq.false&order=created_at.desc",
                  "RUSH exams list")

    @task(3)
    def load_exam_filtered(self):
        # Simulates opening a specific grade's exam (grade-filtered fetch).
        self._get("/rest/v1/exams?select=id,title,total_points,duration_minutes&is_archived=eq.false&limit=1",
                  "RUSH exam open")

    @task(2)
    def load_profile(self):
        self._get("/rest/v1/profiles?select=id,name,grade,status", "RUSH own profile")

    @task(2)
    def load_videos(self):
        self._get("/rest/v1/videos?select=id,title,grade,is_archived,created_at&is_archived=eq.false",
                  "RUSH videos")


# ---------------------------------------------------------------------------
# SPIKE shape: calm → SUDDEN flood → hold → drop → SECOND rush → hold.
# spawn_rate is high (200/s) so the jump is near-instant (thundering herd),
# unlike the gentle staged ramp in locustfile_full.py.
# Peak capped at 600 — a single laptop's realistic ceiling before the CLIENT
# rig (not Supabase) becomes the bottleneck. Raise PEAK via env if you run
# distributed workers.
# ---------------------------------------------------------------------------
PEAK = int(os.getenv("PEAK_USERS", "600"))


class SpikeShape(LoadTestShape):
    def tick(self):
        t = self.get_run_time()
        if t < 45:    return (20, 10)          # calm baseline
        if t < 240:   return (PEAK, 200)       # SUDDEN spike — exam opens
        if t < 300:   return (40, 100)         # everyone settles / drop
        if t < 480:   return (PEAK, 200)       # SECOND rush — results drop
        if t < 540:   return (40, 100)         # cool down
        return None

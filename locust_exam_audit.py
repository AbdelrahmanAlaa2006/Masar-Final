import os
import time
import random
import requests
from locust import HttpUser, task, between, events, constant_pacing

def load_env():
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

SUPABASE_URL, SUPABASE_ANON_KEY = load_env()
if not SUPABASE_URL:
    SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"

TEST_EXAM_ID = "f80bb9d2-2bee-4c43-a463-e8b18b3ce8c0"
STUDENT_AUTH = ("01043214321@masaar.app", "12345678")
SHARED_TOKEN = None

def get_auth_token():
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    try:
        r = requests.post(
            url,
            json={"email": STUDENT_AUTH[0], "password": STUDENT_AUTH[1]},
            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json().get("access_token")
        print(f"[auth] failed: {r.status_code} {r.text[:100]}")
    except Exception as e:
        print(f"[auth] error: {e}")
    return None

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    global SHARED_TOKEN
    print("[exam_audit] Fetching student token for load test...")
    SHARED_TOKEN = get_auth_token()
    if SHARED_TOKEN:
        print("[exam_audit] Auth Token obtained successfully.")
    else:
        print("[exam_audit] WARNING: Auth Token could not be obtained, testing with anon key.")

class ExamBurstOpenUser(HttpUser):
    weight = 6
    host = SUPABASE_URL
    wait_time = between(2, 5)

    def on_start(self):
        self.headers = {"apikey": SUPABASE_ANON_KEY}
        if SHARED_TOKEN:
            self.headers["Authorization"] = f"Bearer {SHARED_TOKEN}"

    @task
    def open_exam_lifecycle(self):
        # 1. getExam (fetch exam row + questions JSON)
        self.client.get(
            f"/rest/v1/exams?id=eq.{TEST_EXAM_ID}&select=*",
            headers=self.headers,
            name="1. ExamTaking: getExam(id)",
        )
        
        # 2. listAttemptsForStudent (heavy join)
        self.client.get(
            "/rest/v1/exam_attempts?select=*,exams(id,title,number,total_points,duration_minutes,reveal_grades)&video_assessment_id=is.null&order=submitted_at.desc&limit=10",
            headers=self.headers,
            name="2. ExamTaking: listAttemptsForStudent (heavy)",
        )

        # 3. listEffectiveOverrides
        self.client.get(
            f"/rest/v1/access_overrides?item_type=eq.exam&select=item_id,item_type,allowed,attempts,available_hours&limit=20",
            headers=self.headers,
            name="3. ExamTaking: listEffectiveOverrides",
        )

        # 4. listExamSharedBlocks
        self.client.get(
            f"/rest/v1/exam_shared_blocks?exam_id=eq.{TEST_EXAM_ID}&select=id,exam_id,title,content,display_order",
            headers=self.headers,
            name="4. ExamTaking: listExamSharedBlocks",
        )

class MixedTenantUser(HttpUser):
    weight = 4
    host = SUPABASE_URL
    wait_time = between(2, 4)

    def on_start(self):
        self.headers = {"apikey": SUPABASE_ANON_KEY}
        if SHARED_TOKEN:
            self.headers["Authorization"] = f"Bearer {SHARED_TOKEN}"

    @task(3)
    def browse_videos(self):
        self.client.get(
            "/rest/v1/videos?select=id,title,description,grade,created_at&is_archived=eq.false&limit=20",
            headers=self.headers,
            name="Other Tenants: Video List",
        )

    @task(2)
    def browse_catalog(self):
        self.client.get(
            "/rest/v1/exams?select=id,number,title,grade,duration_minutes,total_points&is_archived=eq.false&limit=15",
            headers=self.headers,
            name="Other Tenants: Exam Catalog",
        )

    @task(1)
    def fetch_profile(self):
        self.client.get(
            "/rest/v1/profiles?select=id,name,role,grade,status&limit=1",
            headers=self.headers,
            name="Other Tenants: Profile Fetch",
        )

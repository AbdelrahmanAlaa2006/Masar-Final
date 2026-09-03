import os
import time
import random
import requests
from locust import HttpUser, task, between, events

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
SHARED_USER_ID = "101568b0-6b33-41cb-b7fb-aaabf2657ad1"

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
    SHARED_TOKEN = get_auth_token()
    if SHARED_TOKEN:
        print("[audit] Auth Token obtained successfully.")
    else:
        print("[audit] WARNING: Auth Token could not be obtained.")

class ExamLifecycleUser(HttpUser):
    weight = 7
    host = SUPABASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        self.headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json"
        }
        if SHARED_TOKEN:
            self.headers["Authorization"] = f"Bearer {SHARED_TOKEN}"
        self.attempt_id = None

    @task(3)
    def open_and_start_exam(self):
        # 1. getExam: questions JSON & metadata
        with self.client.get(
            f"/rest/v1/exams?id=eq.{TEST_EXAM_ID}&select=*",
            headers=self.headers,
            name="1. Exam: getExam(id)",
            catch_response=True
        ) as res:
            if res.status_code >= 400:
                res.failure(f"getExam status {res.status_code}")

        # 2. countSubmittedAttempts: lightweight HEAD count
        head_headers = dict(self.headers)
        head_headers["Prefer"] = "count=exact"
        head_headers["Range"] = "0-0"
        with self.client.get(
            f"/rest/v1/exam_attempts?exam_id=eq.{TEST_EXAM_ID}&student_id=eq.{SHARED_USER_ID}&submitted_at=not.is.null&video_assessment_id=is.null",
            headers=head_headers,
            name="2. Exam: countSubmittedAttempts",
            catch_response=True
        ) as res:
            if res.status_code >= 400:
                res.failure(f"countSubmittedAttempts status {res.status_code}")

        # 3. Overrides & shared blocks
        self.client.get(
            f"/rest/v1/access_overrides?item_type=eq.exam&select=item_id,item_type,allowed,attempts,available_hours&limit=20",
            headers=self.headers,
            name="3. Exam: listEffectiveOverrides",
        )
        self.client.get(
            f"/rest/v1/exam_shared_blocks?exam_id=eq.{TEST_EXAM_ID}&select=id,exam_id,title,content,display_order",
            headers=self.headers,
            name="4. Exam: listExamSharedBlocks",
        )

        # 4. Atomic start_or_get_exam_attempt RPC
        with self.client.post(
            "/rest/v1/rpc/start_or_get_exam_attempt",
            json={"p_exam_id": TEST_EXAM_ID},
            headers=self.headers,
            name="5. RPC: start_or_get_exam_attempt",
            catch_response=True
        ) as res:
            if res.status_code == 200:
                data = res.json()
                if isinstance(data, dict) and "id" in data:
                    self.attempt_id = data["id"]
            else:
                res.failure(f"start_or_get status {res.status_code}")

    @task(2)
    def refresh_exam_recovery(self):
        # Simulates student refreshing mid-exam
        with self.client.post(
            "/rest/v1/rpc/start_or_get_exam_attempt",
            json={"p_exam_id": TEST_EXAM_ID},
            headers=self.headers,
            name="6. RPC: refresh_recovery (start_or_get)",
            catch_response=True
        ) as res:
            if res.status_code == 200:
                data = res.json()
                if isinstance(data, dict) and "id" in data:
                    self.attempt_id = data["id"]
            else:
                res.failure(f"refresh_recovery status {res.status_code}")

    @task(2)
    def submit_and_retry_burst(self):
        if not self.attempt_id:
            return

        responses = [
            {"questionId": 0, "selected": [0]},
            {"questionId": 1, "selected": [1]},
            {"questionId": 2, "selected": [2]},
        ]

        # First submission
        with self.client.post(
            "/rest/v1/rpc/submit_exam_attempt",
            json={"p_attempt_id": self.attempt_id, "p_responses": responses},
            headers=self.headers,
            name="7. RPC: submit_exam_attempt",
            catch_response=True
        ) as res:
            if res.status_code >= 400:
                res.failure(f"submit_attempt status {res.status_code}")

        # Immediate retry (idempotency under burst load)
        with self.client.post(
            "/rest/v1/rpc/submit_exam_attempt",
            json={"p_attempt_id": self.attempt_id, "p_responses": responses},
            headers=self.headers,
            name="8. RPC: submit_retry (idempotent)",
            catch_response=True
        ) as res:
            if res.status_code >= 400:
                res.failure(f"submit_retry status {res.status_code}")

class CrossTenantNormalUser(HttpUser):
    weight = 3
    host = SUPABASE_URL
    wait_time = between(2, 4)

    def on_start(self):
        self.headers = {"apikey": SUPABASE_ANON_KEY}
        if SHARED_TOKEN:
            self.headers["Authorization"] = f"Bearer {SHARED_TOKEN}"

    @task(2)
    def browse_home_and_videos(self):
        # Simulates non-exam students browsing platform
        self.client.get(
            "/rest/v1/tenants?select=id,name,slug&limit=5",
            headers=self.headers,
            name="9. CrossTenant: listTenants",
        )
        self.client.get(
            "/rest/v1/videos?select=id,title,grade,created_at&is_archived=eq.false&limit=10",
            headers=self.headers,
            name="10. CrossTenant: listVideos",
        )

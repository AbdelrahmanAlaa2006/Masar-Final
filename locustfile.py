import os
from locust import HttpUser, task, between

# Helper to read .env configuration
def load_env_variables():
    supabase_url = None
    supabase_anon_key = None
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key == "VITE_SUPABASE_URL":
                        supabase_url = val
                    elif key == "VITE_SUPABASE_ANON_KEY":
                        supabase_anon_key = val
    return supabase_url, supabase_anon_key

SUPABASE_URL, SUPABASE_ANON_KEY = load_env_variables()

# Fallback defaults if .env is missing or invalid
if not SUPABASE_URL:
    SUPABASE_URL = "https://zphnjirmcrolqjrhjjqt.supabase.co"
if not SUPABASE_ANON_KEY:
    SUPABASE_ANON_KEY = ""

# Cache tokens to prevent Supabase Auth rate limiting (429) during rapid ramp-ups
SHARED_TOKENS = {
    "student": None,
    "admin": None
}

class MasarBaseUser(HttpUser):
    """
    Base user that handles auth configuration and signs in 
    at the start of each virtual user's lifecycle.
    """
    abstract = True
    host = SUPABASE_URL
    wait_time = between(1, 3)

    def on_start(self):
        self.anon_key = SUPABASE_ANON_KEY
        self.token = None
        self.headers = {
            "apikey": self.anon_key
        }
        
        user_role = "admin" if "AdminUser" in self.__class__.__name__ else "student"
        
        if SHARED_TOKENS[user_role]:
            self.token = SHARED_TOKENS[user_role]
            self.headers["Authorization"] = f"Bearer {self.token}"
        else:
            self.login()
            if self.token:
                SHARED_TOKENS[user_role] = self.token

    def login(self):
        if not hasattr(self, "email") or not hasattr(self, "password"):
            return

        headers = {
            "apikey": self.anon_key,
            "Content-Type": "application/json"
        }
        payload = {
            "email": self.email,
            "password": self.password
        }
        
        with self.client.post(
            "/auth/v1/token?grant_type=password",
            json=payload,
            headers=headers,
            catch_response=True,
            name="/auth/v1/token (Login)"
        ) as response:
            if response.status_code == 200:
                try:
                    self.token = response.json().get("access_token")
                    if self.token:
                        self.headers["Authorization"] = f"Bearer {self.token}"
                        response.success()
                    else:
                        response.failure("Login succeeded but access_token not found in response")
                except Exception as e:
                    response.failure(f"Failed to parse login response: {e}")
            else:
                response.failure(f"Login failed: {response.status_code} - {response.text}")

class StudentUser(MasarBaseUser):
    """
    Simulates student traffic querying courses, exams, homeworks, grades, attendance, and profile.
    """
    weight = 9 # Simulates 90% of traffic

    def on_start(self):
        self.email = "01064483036@masaar.app"
        self.password = "msr-3036"
        super().on_start()

    @task(4)
    def view_videos(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/videos?select=*",
            headers=self.headers,
            name="/rest/v1/videos (Student)"
        )

    @task(3)
    def view_exams(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/exams?select=id,number,title,grade,duration_minutes,max_attempts,available_hours,total_points,reveal_grades,created_at&order=created_at.desc",
            headers=self.headers,
            name="/rest/v1/exams (Student)"
        )

    @task(2)
    def view_homeworks(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/homeworks?select=*",
            headers=self.headers,
            name="/rest/v1/homeworks (Student)"
        )

    @task(2)
    def get_attendance(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/attendance?select=*",
            headers=self.headers,
            name="/rest/v1/attendance (Student)"
        )

    @task(2)
    def get_grades(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/grades?select=*",
            headers=self.headers,
            name="/rest/v1/grades (Student)"
        )

    @task(1)
    def get_own_profile(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/profiles?select=*",
            headers=self.headers,
            name="/rest/v1/profiles (Student)"
        )

class AdminUser(MasarBaseUser):
    """
    Simulates admin traffic viewing students and payments list.
    """
    weight = 1 # Simulates 10% of traffic

    def on_start(self):
        self.email = "01099999999@masaar.app"
        self.password = "12345678"
        super().on_start()

    @task(2)
    def list_students(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/profiles?role=eq.student&order=name.asc",
            headers=self.headers,
            name="/rest/v1/profiles?role=eq.student (Admin)"
        )

    @task(1)
    def view_payments(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/payments?select=*",
            headers=self.headers,
            name="/rest/v1/payments (Admin)"
        )

    @task(1)
    def check_settings(self):
        if not self.token:
            return
        self.client.get(
            "/rest/v1/payment_settings?select=*",
            headers=self.headers,
            name="/rest/v1/payment_settings (Admin)"
        )
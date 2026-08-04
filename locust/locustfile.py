import os
import random
import time
import json
from locust import HttpUser, task, between, events, SequentialTaskSet

# Load environment configuration or fallback to .env values
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "https://zphnjirmcrolqjrhjjqt.supabase.co")
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTU1MDksImV4cCI6MjA5MjM3MTUwOX0.yMTLy-vVpE1kf2Iv7EO-eZdtTpiHvH1iHMVHRlmbpIQ")

DEFAULT_TENANT_ID = "d3b07384-d113-4ec2-a5d6-d005b6be4979"
TEST_GRADES = ["first-sec", "second-sec", "third-sec"]

class BaseSupabaseUser(HttpUser):
    abstract = True
    host = SUPABASE_URL
    wait_time = between(1, 4)

    def on_start(self):
        self.headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "x-client-info": "masaar-react-locust/1.0.0"
        }

class RealisticTeacherWorkflow(TaskSet if 'TaskSet' in globals() else SequentialTaskSet):
    @task
    def dashboard_initialization(self):
        # 1. Fetch metadata (branches, academic years, groups)
        self.user.client.get(
            "/rest/v1/branches?select=id,name&order=name.asc",
            headers=self.user.headers,
            name="GET /rest/v1/branches"
        )
        self.user.client.get(
            "/rest/v1/academic_years?select=id,name,is_active&order=created_at.desc",
            headers=self.user.headers,
            name="GET /rest/v1/academic_years"
        )
        self.user.client.get(
            "/rest/v1/groups?select=id,name,grade,branch_id,academic_year_id&order=name.asc",
            headers=self.user.headers,
            name="GET /rest/v1/groups"
        )

    @task
    def student_roster_paged(self):
        # 2. Browse student roster with server pagination
        grade = random.choice(TEST_GRADES)
        self.user.client.get(
            f"/rest/v1/profiles?select=id,name,phone,grade,group,status,is_approved&role=eq.student&grade=eq.{grade}&order=created_at.desc&offset=0&limit=50",
            headers=self.user.headers,
            name="GET /rest/v1/profiles (student_roster)"
        )

    @task
    def attendance_workflow(self):
        # 3. Attendance sessions & records lookup
        grade = random.choice(TEST_GRADES)
        self.user.client.get(
            f"/rest/v1/attendance_sessions?select=id,title,date,group_id,branch_id,grade&grade=eq.{grade}&order=date.desc",
            headers=self.user.headers,
            name="GET /rest/v1/attendance_sessions"
        )

    @task
    def grades_and_finance(self):
        # 4. Read-heavy grades and finance queries
        grade = random.choice(TEST_GRADES)
        self.user.client.get(
            f"/rest/v1/attendance_records?select=id,status,student_id,session_id&limit=50",
            headers=self.user.headers,
            name="GET /rest/v1/attendance_records"
        )
        self.user.client.get(
            "/rest/v1/finance_transactions?select=id,amount,type,category,created_at&order=created_at.desc&limit=20",
            headers=self.user.headers,
            name="GET /rest/v1/finance_transactions"
        )

    @task
    def whatsapp_queue_check(self):
        # 5. WhatsApp queue monitoring
        self.user.client.get(
            "/rest/v1/unified_notifications?select=id,message,type,status,created_at&channels=cs.%7Bwhatsapp%7D&order=created_at.desc&offset=0&limit=10",
            headers=self.user.headers,
            name="GET /rest/v1/unified_notifications (queue)"
        )

class TeacherUser(BaseSupabaseUser):
    weight = 5
    tasks = [RealisticTeacherWorkflow]

class MultiTenantUser(BaseSupabaseUser):
    weight = 3
    
    @task
    def tenant_isolated_queries(self):
        # Simulates multiple tenant scopes A, B, C, D
        tenant_ids = [
            DEFAULT_TENANT_ID,
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222"
        ]
        chosen_tenant = random.choice(tenant_ids)
        headers = {**self.headers, "x-tenant-id": chosen_tenant}
        
        self.client.get(
            f"/rest/v1/groups?select=id,name,grade&tenant_id=eq.{chosen_tenant}",
            headers=headers,
            name="GET /rest/v1/groups (multi-tenant)"
        )
        self.client.get(
            f"/rest/v1/videos?select=id,title,grade&tenant_id=eq.{chosen_tenant}&limit=20",
            headers=headers,
            name="GET /rest/v1/videos (multi-tenant)"
        )

class AbuseDoSUser(BaseSupabaseUser):
    weight = 1
    wait_time = between(0.1, 0.5) # Fast aggressive polling to test rate-limiting / resilience

    @task
    def spam_expensive_search(self):
        # Spamming wildcard profile queries
        term = random.choice(["احمد", "محمد", "علي", "010", "011"])
        self.client.get(
            f"/rest/v1/profiles?select=id,name,phone,parent_phone&role=eq.student&name=ilike.*{term}*&limit=50",
            headers=self.headers,
            name="SPAM /rest/v1/profiles (search)"
        )

    @task
    def spam_rpc_batch(self):
        # Calling RPC endpoint rapidly
        self.client.post(
            "/rest/v1/rpc/get_student_status_counts",
            data=json.dumps({"p_grade": "first-sec"}),
            headers=self.headers,
            name="SPAM /rest/v1/rpc/get_student_status_counts"
        )

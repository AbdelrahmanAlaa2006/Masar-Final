import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 30 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = 'https://zphnjirmcrolqjrhjjqt.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwaG5qaXJtY3JvbHFqcmhqanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTU1MDksImV4cCI6MjA5MjM3MTUwOX0.yMTLy-vVpE1kf2Iv7EO-eZdtTpiHvH1iHMVHRlmbpIQ';

export default function () {

  // 1. LOGIN
  let loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: '01099999999@masaar.app',
      password: '12345678'
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
    }
  );

  let token = loginRes.json('access_token');

  check(loginRes, {
    'login success': (r) => r.status === 200 && token !== undefined,
  });

  let authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  };

  sleep(1);

  // 2. Home
  http.get(`${BASE_URL}/`);
  sleep(1);

  // 3. Exams
  http.get(`${BASE_URL}/exams`);
  sleep(1);

  // 4. Exam taking
  http.get(`${BASE_URL}/exam-taking?id=d7d075a1-9622-487a-8acb-9c84f9d3dace`);
  sleep(1);

  // 5. Report
  http.get(`${BASE_URL}/report`);
  sleep(1);

  // 6. Videos
  http.get(`${BASE_URL}/videos`);
  sleep(1);

  // 7. Control panel
  http.get(`${BASE_URL}/control-panel`);
  sleep(1);

  // 8. Supabase exams (backend load)
  http.get(
    `${SUPABASE_URL}/rest/v1/exams?select=*`,
    authHeaders
  );

  sleep(2);
}
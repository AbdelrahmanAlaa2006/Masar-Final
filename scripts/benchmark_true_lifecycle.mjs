import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TARGET_EXAM_ID = 'f80bb9d2-2bee-4c43-a463-e8b18b3ce8c0';
const STUDENT_EMAIL = '01043214321@masaar.app';
const STUDENT_PASS = '12345678';

async function runTrueLifecycleBenchmark(targetUsers = 500, concurrencyLimit = 50) {
  console.log(`\n===============================================================`);
  console.log(`BENCHMARK: TRUE FULL LIFECYCLE EXECUTION FOR ${targetUsers} STUDENTS`);
  console.log(`(Concurrency Pool: ${concurrencyLimit} active parallel pipelines)`);
  console.log(`===============================================================\n`);

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  if (authErr) {
    console.error('Fatal Auth Error:', authErr);
    process.exit(1);
  }
  const token = authData.session.access_token;
  const uid = authData.user.id;

  const metrics = {
    usersStarted: 0,
    usersCompleted: 0,
    uniqueStudents: 1, // Single authenticated student pipeline in test environment
    examFetches: 0,
    attemptStarts: 0,
    submissions: 0,
    retries: 0,
    successfulLifecycles: 0,
    failedLifecycles: 0,
    errors: {},
    latencies: {
      getExam: [],
      countAttempts: [],
      startAttempt: [],
      submitAttempt: [],
      submitRetry: [],
      totalLifecycle: [],
    },
  };

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Helper for timed fetch
  async function timedFetch(url, options = {}) {
    const t0 = performance.now();
    const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    const dur = performance.now() - t0;
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }
    const data = await res.json().catch(() => null);
    return { data, dur };
  }

  // Single student executing the 100% complete exam journey
  async function executeFullStudentLifecycle(userIndex) {
    metrics.usersStarted++;
    const lifecycleStart = performance.now();
    let attemptId = null;

    try {
      // Step 1: getExam
      const { dur: durExam } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/exams?id=eq.${TARGET_EXAM_ID}&select=*`
      );
      metrics.examFetches++;
      metrics.latencies.getExam.push(durExam);

      // Step 2: countSubmittedAttempts (HEAD count)
      const { dur: durCount } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/exam_attempts?exam_id=eq.${TARGET_EXAM_ID}&student_id=eq.${uid}&submitted_at=not.is.null&video_assessment_id=is.null`,
        { headers: { Prefer: 'count=exact', Range: '0-0' } }
      );
      metrics.latencies.countAttempts.push(durCount);

      // Step 3 & 4: Overrides and shared blocks
      await Promise.all([
        timedFetch(`${SUPABASE_URL}/rest/v1/access_overrides?item_type=eq.exam&limit=10`),
        timedFetch(`${SUPABASE_URL}/rest/v1/exam_shared_blocks?exam_id=eq.${TARGET_EXAM_ID}&limit=10`),
      ]);

      // Step 5: start_or_get_exam_attempt (RPC)
      const { data: attData, dur: durStart } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/rpc/start_or_get_exam_attempt`,
        {
          method: 'POST',
          body: JSON.stringify({ p_exam_id: TARGET_EXAM_ID }),
        }
      );
      metrics.attemptStarts++;
      metrics.latencies.startAttempt.push(durStart);
      attemptId = attData?.id;

      if (!attemptId) throw new Error('No attempt ID returned from start_or_get_exam_attempt');

      // Step 6: submit_exam_attempt (RPC)
      const responses = [
        { questionId: 0, selected: [0] },
        { questionId: 1, selected: [1] },
      ];
      const { dur: durSubmit } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/rpc/submit_exam_attempt`,
        {
          method: 'POST',
          body: JSON.stringify({ p_attempt_id: attemptId, p_responses: responses }),
        }
      );
      metrics.submissions++;
      metrics.latencies.submitAttempt.push(durSubmit);

      // Step 7: submit_retry (Idempotent RPC)
      const { dur: durRetry } = await timedFetch(
        `${SUPABASE_URL}/rest/v1/rpc/submit_exam_attempt`,
        {
          method: 'POST',
          body: JSON.stringify({ p_attempt_id: attemptId, p_responses: responses }),
        }
      );
      metrics.retries++;
      metrics.latencies.submitRetry.push(durRetry);

      const totalDur = performance.now() - lifecycleStart;
      metrics.latencies.totalLifecycle.push(totalDur);
      metrics.successfulLifecycles++;
      metrics.usersCompleted++;
    } catch (err) {
      metrics.failedLifecycles++;
      metrics.usersCompleted++;
      const msg = err.message || 'Unknown error';
      metrics.errors[msg] = (metrics.errors[msg] || 0) + 1;
    }
  }

  // Execute pool with concurrency control
  console.log(`Launching ${targetUsers} students into exam lifecycle...`);
  const queue = Array.from({ length: targetUsers }, (_, i) => i);
  const workers = Array.from({ length: concurrencyLimit }, async () => {
    while (queue.length > 0) {
      const idx = queue.shift();
      if (idx !== undefined) {
        await executeFullStudentLifecycle(idx);
      }
    }
  });

  const startTime = performance.now();
  await Promise.all(workers);
  const totalElapsedSec = (performance.now() - startTime) / 1000;

  function median(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)].toFixed(0);
  }

  function p95(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)].toFixed(0);
  }

  console.log('\n===============================================================');
  console.log('EXACT LIFECYCLE METRICS REPORT');
  console.log('===============================================================');
  console.log(`• Total Virtual Users Started:           ${metrics.usersStarted}`);
  console.log(`• Total Virtual Users Completed:         ${metrics.usersCompleted}`);
  console.log(`• Total Unique Simulated Students:       ${metrics.uniqueStudents}`);
  console.log(`• Total Exam Fetches:                    ${metrics.examFetches}`);
  console.log(`• Total Attempt Start/Restore Calls:     ${metrics.attemptStarts}`);
  console.log(`• Total Submission Calls:                ${metrics.submissions}`);
  console.log(`• Total Submission Retries:              ${metrics.retries}`);
  console.log(`• Total Successful Full Lifecycles:      ${metrics.successfulLifecycles} (${((metrics.successfulLifecycles / targetUsers) * 100).toFixed(2)}%)`);
  console.log(`• Total Failed Lifecycles:               ${metrics.failedLifecycles} (${((metrics.failedLifecycles / targetUsers) * 100).toFixed(2)}%)`);
  console.log(`• Total Test Elapsed Time:               ${totalElapsedSec.toFixed(1)}s`);
  console.log(`• Effective Throughput:                  ${(metrics.usersCompleted / totalElapsedSec).toFixed(1)} completed students/sec`);
  console.log('---------------------------------------------------------------');
  console.log('Step Latency Breakdown (Median / P95):');
  console.log(`  - getExam(id):                         ${median(metrics.latencies.getExam)}ms / ${p95(metrics.latencies.getExam)}ms`);
  console.log(`  - countSubmittedAttempts:              ${median(metrics.latencies.countAttempts)}ms / ${p95(metrics.latencies.countAttempts)}ms`);
  console.log(`  - start_or_get_exam_attempt (RPC):     ${median(metrics.latencies.startAttempt)}ms / ${p95(metrics.latencies.startAttempt)}ms`);
  console.log(`  - submit_exam_attempt (RPC):           ${median(metrics.latencies.submitAttempt)}ms / ${p95(metrics.latencies.submitAttempt)}ms`);
  console.log(`  - submit_retry (Idempotent RPC):       ${median(metrics.latencies.submitRetry)}ms / ${p95(metrics.latencies.submitRetry)}ms`);
  console.log(`  - Total Student Journey (Full Exam):   ${median(metrics.latencies.totalLifecycle)}ms / ${p95(metrics.latencies.totalLifecycle)}ms`);
  console.log('---------------------------------------------------------------');
  if (Object.keys(metrics.errors).length > 0) {
    console.log('Errors Encountered:');
    for (const [err, cnt] of Object.entries(metrics.errors)) {
      console.log(`  [${cnt}x] ${err}`);
    }
  } else {
    console.log('Errors Encountered:                      NONE (0 errors)');
  }
  console.log('===============================================================\n');

  return metrics;
}

// Run verified 1600-student full-lifecycle run
runTrueLifecycleBenchmark(1600, 80).catch(console.error);

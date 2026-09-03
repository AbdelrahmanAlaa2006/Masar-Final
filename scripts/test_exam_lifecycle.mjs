import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const STUDENT_PHONE = '01043214321';
const STUDENT_EMAIL = `${STUDENT_PHONE}@masaar.app`;
const STUDENT_PASS = '12345678';
const TARGET_EXAM_ID = 'f80bb9d2-2bee-4c43-a463-e8b18b3ce8c0'; // 1st prep exam in default tenant

async function runLifecycleTests() {
  console.log('====================================================');
  console.log('PHASE 4: FUNCTIONAL LIFECYCLE TESTS');
  console.log('====================================================\n');

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  if (authErr) throw authErr;
  const uid = authData.user.id;

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${name} ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  // Pre-cleanup
  await client.from('exam_attempts').delete().eq('student_id', uid).eq('exam_id', TARGET_EXAM_ID);

  // 1. Exam Start Flow
  const { data: examData, error: examErr } = await client.from('exams').select('*').eq('id', TARGET_EXAM_ID).single();
  assert(!examErr && examData, '1. Exam fetch succeeds', `Questions: ${examData?.questions?.length}`);

  const { data: attemptRow, error: attErr } = await client.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
  assert(!attErr && attemptRow?.id, '2. Student starts fresh attempt', `Attempt ID: ${attemptRow?.id}`);

  // 2. Simulated Mid-Exam Refresh
  // In localStorage: answers stored, attemptId stored
  const mockLocalStorage = {
    attemptId: attemptRow.id,
    answers: { '0': [0], '1': [1], '2': [2] },
    currentQuestion: 3,
    deadline: Date.now() + 50 * 60 * 1000,
  };

  // Student refreshes page: calls start_or_get_exam_attempt again
  const { data: resumedAttempt, error: resumeErr } = await client.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
  assert(
    !resumeErr && resumedAttempt?.id === mockLocalStorage.attemptId,
    '3. Page refresh mid-exam restores identical attemptId',
    `Expected: ${mockLocalStorage.attemptId}, Got: ${resumedAttempt?.id}`
  );

  // 3. Duplicate Submit Click (double submission race)
  const responses = [
    { questionId: 0, selected: [0] },
    { questionId: 1, selected: [1] },
    { questionId: 2, selected: [2] },
  ];
  const [click1, click2] = await Promise.all([
    client.rpc('submit_exam_attempt', { p_attempt_id: attemptRow.id, p_responses: responses }),
    client.rpc('submit_exam_attempt', { p_attempt_id: attemptRow.id, p_responses: responses }),
  ]);

  const score1 = (Array.isArray(click1.data) ? click1.data[0] : click1.data)?.score;
  const score2 = (Array.isArray(click2.data) ? click2.data[0] : click2.data)?.score;

  assert(
    !click1.error && !click2.error && score1 === score2,
    '4. Double submit clicks return identical authoritative scores safely',
    `Score 1: ${score1}, Score 2: ${score2}`
  );

  // 4. Simulated Network Blip Retry After Submission
  // Say the client timed out on network, but server recorded it. Client retries:
  const { data: retryRes, error: retryErr } = await client.rpc('submit_exam_attempt', {
    p_attempt_id: attemptRow.id,
    p_responses: responses,
  });
  const retryScore = (Array.isArray(retryRes) ? retryRes[0] : retryRes)?.score;
  assert(
    !retryErr && retryScore === score1,
    '5. Retry after submission returns stored score idempotently',
    `Retry score: ${retryScore}`
  );

  // 5. Check Attempt Count via Head Count (countSubmittedAttempts logic)
  const { count: submittedCount, error: countErr } = await client
    .from('exam_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('exam_id', TARGET_EXAM_ID)
    .eq('student_id', uid)
    .not('submitted_at', 'is', null)
    .is('video_assessment_id', null);

  assert(!countErr && submittedCount === 1, '6. Exact head count reflects exactly 1 submitted attempt', `Count: ${submittedCount}`);

  // 6. Cross-Tenant Traffic Test
  // Another tenant or student accessing their own resources operates normally
  const { data: tenantExams, error: tenantErr } = await client
    .from('exams')
    .select('id, title')
    .eq('tenant_id', 'd3b07384-d113-4ec2-a5d6-d005b6be4979')
    .limit(3);

  assert(!tenantErr && tenantExams.length > 0, '7. Tenant isolation queries operate normally without degradation', `Found ${tenantExams?.length} exams`);

  // Cleanup
  await client.from('exam_attempts').delete().eq('id', attemptRow.id);

  console.log('\n====================================================');
  console.log(`LIFECYCLE TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runLifecycleTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

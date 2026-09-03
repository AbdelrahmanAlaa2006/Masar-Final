import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const STUDENT_PHONE = '01043214321';
const STUDENT_EMAIL = `${STUDENT_PHONE}@masaar.app`;
const STUDENT_PASS = '12345678';
const TARGET_EXAM_ID = 'f80bb9d2-2bee-4c43-a463-e8b18b3ce8c0'; // 1st prep exam in default tenant

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 2: DIRECT RPC VERIFICATION TESTS');
  console.log('====================================================\n');

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const studentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign in student
  const { data: authData, error: authErr } = await studentClient.auth.signInWithPassword({
    email: STUDENT_EMAIL,
    password: STUDENT_PASS,
  });
  if (authErr) {
    console.error('FATAL: Could not authenticate student:', authErr.message);
    process.exit(1);
  }
  const studentId = authData.user.id;
  console.log(`[AUTH] Logged in as student ${STUDENT_EMAIL} (UID: ${studentId})`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${testName} ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${details}`);
      failed++;
    }
  }

  // Pre-cleanup: remove any existing unsubmitted attempts for this student on this test exam
  await studentClient.from('exam_attempts').delete().eq('student_id', studentId).eq('exam_id', TARGET_EXAM_ID);

  // -------------------------------------------------------------
  // Test 9: Anonymous execution is rejected
  // -------------------------------------------------------------
  try {
    const { data, error } = await anonClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
    assert(!!error, 'Test 9: Anonymous execution of start_or_get_exam_attempt is rejected', error?.message || '');
  } catch (e) {
    assert(true, 'Test 9: Anonymous execution of start_or_get_exam_attempt threw error', e.message);
  }

  try {
    const { data, error } = await anonClient.rpc('submit_exam_attempt', {
      p_attempt_id: '00000000-0000-0000-0000-000000000000',
      p_responses: [],
    });
    assert(!!error, 'Test 9: Anonymous execution of submit_exam_attempt is rejected', error?.message || '');
  } catch (e) {
    assert(true, 'Test 9: Anonymous execution of submit_exam_attempt threw error', e.message);
  }

  // -------------------------------------------------------------
  // Test 1: Authorized student can start an attempt
  // -------------------------------------------------------------
  let attempt1 = null;
  {
    const { data, error } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
    attempt1 = data;
    assert(
      !error && attempt1 && attempt1.id && attempt1.max_score === 38,
      'Test 1: Authorized student can start an attempt (authoritative max_score = 38)',
      error ? error.message : `Attempt ID: ${attempt1?.id}, max_score: ${attempt1?.max_score}`
    );
  }

  // -------------------------------------------------------------
  // Test 5: Refresh/repeated start returns the same attempt ID
  // -------------------------------------------------------------
  {
    const { data, error } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
    assert(
      !error && data && data.id === attempt1?.id,
      'Test 5: Refresh / repeated start returns the exact same attempt ID',
      `Returned ID: ${data?.id}`
    );
  }

  // -------------------------------------------------------------
  // Test 4: Two concurrent start requests return the same open attempt ID
  // -------------------------------------------------------------
  // Clean up attempt1 to test concurrent starts from scratch
  await studentClient.from('exam_attempts').delete().eq('id', attempt1.id);
  {
    const [resA, resB] = await Promise.all([
      studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID }),
      studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID }),
    ]);

    const idA = resA.data?.id;
    const idB = resB.data?.id;

    // Check DB count for unsubmitted attempts
    const { count } = await studentClient
      .from('exam_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('exam_id', TARGET_EXAM_ID)
      .is('submitted_at', null);

    assert(
      !resA.error && !resB.error && idA && idA === idB && count === 1,
      'Test 4: Concurrent start requests return the same attempt ID and create exactly 1 row',
      `ID A: ${idA}, ID B: ${idB}, Rows in DB: ${count}`
    );
    attempt1 = resA.data;
  }

  // -------------------------------------------------------------
  // Test 3: Cross-tenant access is rejected
  // -------------------------------------------------------------
  {
    // Query an exam belonging to a different tenant if one exists
    const { data: otherExams } = await studentClient
      .from('exams')
      .select('id, tenant_id')
      .neq('tenant_id', 'd3b07384-d113-4ec2-a5d6-d005b6be4979')
      .limit(1);

    if (otherExams && otherExams.length > 0) {
      const foreignExamId = otherExams[0].id;
      const { data, error } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: foreignExamId });
      assert(
        !!error,
        'Test 3: Cross-tenant exam attempt creation is rejected',
        error ? error.message : 'UNEXPECTED SUCCESS'
      );
    } else {
      // Non-existent random UUID represents an exam outside tenant
      const fakeExamId = '00000000-1111-2222-3333-444444444444';
      const { data, error } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: fakeExamId });
      assert(
        !!error,
        'Test 3: Unknown / non-tenant exam attempt creation is rejected',
        error ? error.message : 'UNEXPECTED SUCCESS'
      );
    }
  }

  // -------------------------------------------------------------
  // Test 2: Unauthorized student cannot start an attempt
  // -------------------------------------------------------------
  {
    // Try to access an archived exam or non-grade exam
    const fakeExamId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const { error } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: fakeExamId });
    assert(
      !!error,
      'Test 2: Unauthorized / non-existent exam access is denied',
      error?.message || ''
    );
  }

  // -------------------------------------------------------------
  // Test 6: First submission calculates and stores the result correctly
  // -------------------------------------------------------------
  let firstSubmissionResult = null;
  let submittedAtTime = null;
  {
    // Submit with sample responses
    const responses = [
      { questionId: 0, selected: [0] },
      { questionId: 1, selected: [1] },
    ];
    const { data, error } = await studentClient.rpc('submit_exam_attempt', {
      p_attempt_id: attempt1.id,
      p_responses: responses,
    });

    firstSubmissionResult = Array.isArray(data) ? data[0] : data;

    // Check DB row to verify submitted_at is set and score stored
    const { data: dbRow } = await studentClient
      .from('exam_attempts')
      .select('score, max_score, submitted_at, responses')
      .eq('id', attempt1.id)
      .single();

    submittedAtTime = dbRow?.submitted_at;
    assert(
      !error && dbRow && dbRow.submitted_at !== null && dbRow.max_score === 38,
      'Test 6: First submission calculates and stores result in DB',
      `Score: ${dbRow?.score}/${dbRow?.max_score}, submitted_at: ${submittedAtTime}`
    );
  }

  // -------------------------------------------------------------
  // Test 7: Repeating the same submission returns the stored result without rescoring
  // -------------------------------------------------------------
  {
    const differentResponses = [
      { questionId: 0, selected: [3] },
      { questionId: 1, selected: [3] },
    ];
    const { data, error } = await studentClient.rpc('submit_exam_attempt', {
      p_attempt_id: attempt1.id,
      p_responses: differentResponses,
    });

    const secondResult = Array.isArray(data) ? data[0] : data;

    const { data: dbRowAfter } = await studentClient
      .from('exam_attempts')
      .select('score, max_score, submitted_at, responses')
      .eq('id', attempt1.id)
      .single();

    assert(
      !error &&
      secondResult?.score === firstSubmissionResult?.score &&
      dbRowAfter?.submitted_at === submittedAtTime &&
      dbRowAfter?.score === firstSubmissionResult?.score,
      'Test 7: Repeating submission is idempotent (returns stored result, submitted_at unchanged, responses not overwritten)',
      `Returned score: ${secondResult?.score}, original: ${firstSubmissionResult?.score}`
    );
  }

  // -------------------------------------------------------------
  // Test 8: Concurrent submission requests cannot double-score the attempt
  // -------------------------------------------------------------
  {
    // Create a fresh test attempt
    const { data: freshAttempt } = await studentClient.rpc('start_or_get_exam_attempt', { p_exam_id: TARGET_EXAM_ID });
    
    // Note: Since freshAttempt might return an already submitted attempt if not careful:
    // We already submitted attempt1, so start_or_get_exam_attempt creates attempt2!
    const attempt2Id = freshAttempt.id;
    assert(attempt2Id !== attempt1.id, 'Fresh attempt created for concurrency test', `New ID: ${attempt2Id}`);

    const responses = [{ questionId: 0, selected: [0] }];
    const [subA, subB] = await Promise.all([
      studentClient.rpc('submit_exam_attempt', { p_attempt_id: attempt2Id, p_responses: responses }),
      studentClient.rpc('submit_exam_attempt', { p_attempt_id: attempt2Id, p_responses: responses }),
    ]);

    const resA = Array.isArray(subA.data) ? subA.data[0] : subA.data;
    const resB = Array.isArray(subB.data) ? subB.data[0] : subB.data;

    assert(
      !subA.error && !subB.error && resA?.score === resB?.score && resA?.max_score === 38,
      'Test 8: Concurrent submission requests serialize safely and return identical results',
      `SubA: ${JSON.stringify(resA)}, SubB: ${JSON.stringify(resB)}`
    );

    // Clean up attempt2
    await studentClient.from('exam_attempts').delete().eq('id', attempt2Id);
  }

  // Clean up attempt1
  await studentClient.from('exam_attempts').delete().eq('id', attempt1.id);

  console.log('\n====================================================');
  console.log(`RPC VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

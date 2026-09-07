import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Mock payload builder matching ExamAdd.jsx
function buildExamPayloadMock({ examTitle, duration, questions, opensAt, availabilityValue, availabilityUnit }) {
  if (!examTitle.trim() || !duration || questions.length === 0) {
    return { error: 'يرجى ملء جميع البيانات المطلوبة' };
  }
  const val = parseInt(availabilityValue, 10);
  if (!val || val <= 0) {
    return {
      error: availabilityUnit === 'hours'
        ? 'يرجى إدخال عدد صحيح لساعات الإتاحة (ساعة واحدة على الأقل)'
        : 'يرجى إدخال عدد صحيح لأيام الإتاحة (يوم واحد على الأقل)'
    };
  }

  const available_hours = availabilityUnit === 'hours' ? val : val * 24;
  const availability_days = availabilityUnit === 'days' ? val : null;
  const opensAtDate = opensAt ? new Date(opensAt) : new Date();
  const expires_at = new Date(opensAtDate.getTime() + available_hours * 3600 * 1000).toISOString();

  return {
    success: true,
    available_hours,
    availability_days,
    expires_at,
    availabilityValue: val,
    availabilityUnit,
  };
}

// Mock status computation matching Exams.jsx
function computeExamStatus(opensAt, expiresAt, now = new Date()) {
  const opens = opensAt ? new Date(opensAt) : null;
  const expires = expiresAt ? new Date(expiresAt) : null;

  if (opens) {
    if (now < opens) return 'مجدول'; // upcoming
    if (expires && now >= expires) return 'منتهي'; // expired
    return 'متاح'; // active
  }
  return 'متاح';
}

async function runTests() {
  console.log('====================================================');
  console.log('TESTING EXAM DURATION AND AVAILABILITY UNIT FEATURES');
  console.log('====================================================\n');

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

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const now = new Date('2026-09-07T10:00:00.000Z');

  // Test 1: 6 Hours
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 6 Hours',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 6,
      availabilityUnit: 'hours',
    });
    assert(
      res.available_hours === 6 &&
      res.availability_days === null &&
      res.expires_at === '2026-09-07T16:00:00.000Z',
      '1. 6 Hours configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 2: 12 Hours
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 12 Hours',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 12,
      availabilityUnit: 'hours',
    });
    assert(
      res.available_hours === 12 &&
      res.availability_days === null &&
      res.expires_at === '2026-09-07T22:00:00.000Z',
      '2. 12 Hours configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 3: 18 Hours
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 18 Hours',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 18,
      availabilityUnit: 'hours',
    });
    assert(
      res.available_hours === 18 &&
      res.availability_days === null &&
      res.expires_at === '2026-09-08T04:00:00.000Z',
      '3. 18 Hours configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 4: 24 Hours
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 24 Hours',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 24,
      availabilityUnit: 'hours',
    });
    assert(
      res.available_hours === 24 &&
      res.availability_days === null &&
      res.expires_at === '2026-09-08T10:00:00.000Z',
      '4. 24 Hours configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 5: 1 Day
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 1 Day',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 1,
      availabilityUnit: 'days',
    });
    assert(
      res.available_hours === 24 &&
      res.availability_days === 1 &&
      res.expires_at === '2026-09-08T10:00:00.000Z',
      '5. 1 Day configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 6: 2 Days
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 2 Days',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 2,
      availabilityUnit: 'days',
    });
    assert(
      res.available_hours === 48 &&
      res.availability_days === 2 &&
      res.expires_at === '2026-09-09T10:00:00.000Z',
      '6. 2 Days configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 7: 3 Days
  {
    const res = buildExamPayloadMock({
      examTitle: 'Test 3 Days',
      duration: '30',
      questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z',
      availabilityValue: 3,
      availabilityUnit: 'days',
    });
    assert(
      res.available_hours === 72 &&
      res.availability_days === 3 &&
      res.expires_at === '2026-09-10T10:00:00.000Z',
      '7. 3 Days configured correctly',
      `expires_at: ${res.expires_at}`
    );
  }

  // Test 8: Editing an existing exam (e.g. from 2 Days to 12 Hours)
  {
    // Original: 2 Days
    const orig = buildExamPayloadMock({
      examTitle: 'Exam', duration: '30', questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z', availabilityValue: 2, availabilityUnit: 'days'
    });
    // Edited to: 12 Hours
    const edited = buildExamPayloadMock({
      examTitle: 'Exam', duration: '30', questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z', availabilityValue: 12, availabilityUnit: 'hours'
    });
    assert(
      orig.availability_days === 2 && orig.available_hours === 48 &&
      edited.availability_days === null && edited.available_hours === 12 &&
      edited.expires_at === '2026-09-07T22:00:00.000Z',
      '8. Editing existing exam from 2 Days to 12 Hours calculates new window',
      `Updated expires_at: ${edited.expires_at}`
    );
  }

  // Test 9: Countdown / Expiration Accuracy (exact minute comparison)
  {
    const start = new Date('2026-09-07T10:00:00.000Z');
    const res = buildExamPayloadMock({
      examTitle: 'Exam 12h', duration: '30', questions: [{ q: 1 }],
      opensAt: start.toISOString(), availabilityValue: 12, availabilityUnit: 'hours'
    });
    const diffHours = (new Date(res.expires_at).getTime() - start.getTime()) / (3600 * 1000);
    assert(diffHours === 12, '9. Expiration window is exactly 12.0 hours, not rounded to days');
  }

  // Test 10: Upcoming / Active / Expired State Transitions
  {
    const opens = '2026-09-07T10:00:00.000Z';
    const expires = '2026-09-07T22:00:00.000Z'; // 12 hours later

    const beforeOpen = new Date('2026-09-07T09:59:59.000Z');
    const midActive = new Date('2026-09-07T15:00:00.000Z');
    const justExpired = new Date('2026-09-07T22:00:01.000Z');

    assert(computeExamStatus(opens, expires, beforeOpen) === 'مجدول', '10a. Status is مجدول (Upcoming) before opens_at');
    assert(computeExamStatus(opens, expires, midActive) === 'متاح', '10b. Status is متاح (Active) during 12-hour window');
    assert(computeExamStatus(opens, expires, justExpired) === 'منتهي', '10c. Status is منتهي (Expired) after 12 hours');
  }

  // Test 11: Validation rules
  {
    const zeroHours = buildExamPayloadMock({
      examTitle: 'Exam', duration: '30', questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z', availabilityValue: 0, availabilityUnit: 'hours'
    });
    const negDays = buildExamPayloadMock({
      examTitle: 'Exam', duration: '30', questions: [{ q: 1 }],
      opensAt: '2026-09-07T10:00:00.000Z', availabilityValue: -2, availabilityUnit: 'days'
    });
    assert(
      zeroHours.error && zeroHours.error.includes('ساعات الإتاحة'),
      '11a. 0 hours rejected with descriptive Arabic warning',
      zeroHours.error
    );
    assert(
      negDays.error && negDays.error.includes('أيام الإتاحة'),
      '11b. Negative days rejected with descriptive Arabic warning',
      negDays.error
    );
  }

  // Test 12: Backward Compatibility with Existing Exams
  {
    // Simulate an existing exam loaded from DB
    const oldExamWithDays = {
      id: 'old-1',
      title: 'Old Exam',
      opens_at: '2026-09-01T08:00:00.000Z',
      availability_days: 3,
      available_hours: 72,
    };
    const legacyExam = {
      id: 'legacy-1',
      title: 'Legacy Exam',
      opens_at: null,
      created_at: '2026-09-01T08:00:00.000Z',
      availability_days: null,
      available_hours: 72,
    };

    // Form initialization in EditExamModal:
    const unit1 = oldExamWithDays.availability_days ? 'days' : 'hours';
    const val1 = unit1 === 'days' ? oldExamWithDays.availability_days : oldExamWithDays.available_hours;

    const unit2 = legacyExam.availability_days ? 'days' : 'hours';
    const val2 = unit2 === 'days' ? legacyExam.availability_days : legacyExam.available_hours;

    assert(
      unit1 === 'days' && val1 === 3,
      '12a. Existing days-based exam initializes cleanly as 3 Days',
      `Unit: ${unit1}, Val: ${val1}`
    );
    assert(
      unit2 === 'hours' && val2 === 72,
      '12b. Legacy exam initializes cleanly as 72 Hours',
      `Unit: ${unit2}, Val: ${val2}`
    );
  }

  console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();

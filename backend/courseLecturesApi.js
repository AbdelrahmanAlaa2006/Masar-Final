import { supabase } from './supabase'
import { fetchAllRows, selectInChunks } from './fetchAllRows'
import { cached, invalidatePrefix, LIST_TTL } from '../src/utils/cache'
import { getViewerContext } from './viewerContext'

const env = (typeof import.meta.env !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})) || {}
const R2_PUBLIC_BASE = env.VITE_R2_PUBLIC_BASE || 'https://pub-c0605b767e8c43849da94ee3ba6954d5.r2.dev'

let customSupabase = null;
export function setSupabaseClient(client) {
  customSupabase = client;
}
function getSupabase() {
  return customSupabase || supabase;
}

let customDownloadSigner = null;
export function setDownloadSigner(signer) {
  customDownloadSigner = signer;
}


// =====================================================================
// Internal Auth & Security Helpers
// =====================================================================

async function requireAuthUser() {
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser()
  if (authErr || !user) {
    const err = new Error('unauthorized: login required')
    err.status = 401
    throw err
  }

  const { data: profile, error: profErr } = await getSupabase()
    .from('profiles')
    .select('id, tenant_id, role')
    .eq('id', user.id)
    .single()

  if (profErr || !profile) {
    const err = new Error('forbidden: profile not found')
    err.status = 403
    throw err
  }

  return { user, profile }
}

// =====================================================================
// 1. Chapters API (Level 2 Hierarchy: Package -> Chapters, or Standalone Lessons)
// =====================================================================

export async function listCourseChapters(packageIdOrOptions) {
  let packageId = null
  let grade = null
  let standaloneOnly = false

  if (typeof packageIdOrOptions === 'object' && packageIdOrOptions !== null) {
    packageId = packageIdOrOptions.packageId || null
    grade = packageIdOrOptions.grade || null
    standaloneOnly = !!packageIdOrOptions.standaloneOnly
  } else {
    packageId = packageIdOrOptions
  }

  // If called without arguments or with falsy packageId and NOT standaloneOnly and NOT grade
  if (!packageId && !standaloneOnly && !grade) return []

  const { profile } = await requireAuthUser().catch(() => ({ profile: null }))

  let query = getSupabase()
    .from('course_chapters')
    .select(`
      id, tenant_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at
    `)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (packageId) {
    query = query.eq('package_id', packageId)
  } else if (standaloneOnly) {
    query = query.is('package_id', null)
  }

  if (grade) {
    query = query.eq('grade', grade)
  }

  if (profile?.tenant_id) {
    query = query.eq('tenant_id', profile.tenant_id)
  }

  // Every page: PostgREST stops at 1000 rows without saying so, which would
  // silently hide the oldest rows as a curriculum grows.
  return fetchAllRows(() => query.order('id', { ascending: true }))
}

export async function listStandaloneChapters({ grade = null } = {}) {
  return listCourseChapters({ standaloneOnly: true, grade })
}

export async function createCourseChapter({ packageId = null, grade = null, title, description, sortOrder = 0 }) {
  const { profile } = await requireAuthUser()
  const { data, error } = await getSupabase()
    .from('course_chapters')
    .insert({
      tenant_id: profile.tenant_id,
      package_id: packageId || null,
      grade: grade ? grade.trim() : null,
      title: title.trim(),
      description: description ? description.trim() : null,
      sort_order: sortOrder,
      is_active: true
    })
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_chapters:')
  return data
}

export async function updateCourseChapter(chapterId, patch) {
  await requireAuthUser()
  const updateData = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await getSupabase()
    .from('course_chapters')
    .update(updateData)
    .eq('id', chapterId)
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_chapters:')
  return data
}

export async function deleteCourseChapter(chapterId) {
  await requireAuthUser()
  const { error } = await getSupabase()
    .from('course_chapters')
    .delete()
    .eq('id', chapterId)

  if (error) throw error
  invalidatePrefix('course_chapters:')
  invalidatePrefix('course_lectures:')
}

// =====================================================================
// 2. Lectures API (Level 3 Hierarchy: Chapter -> Multiple Lectures, or Standalone Lectures)
// =====================================================================

export async function listCourseLectures(chapterId) {
  if (!chapterId) return []
  const { data, error } = await getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at
    `)
    .eq('chapter_id', chapterId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function listStandaloneLectures({ grade = null } = {}) {
  const { profile } = await requireAuthUser().catch(() => ({ profile: null }))

  let query = getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at
    `)
    .is('chapter_id', null)
    .is('package_id', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (profile?.tenant_id) {
    query = query.eq('tenant_id', profile.tenant_id)
  }
  if (grade) {
    query = query.eq('grade', grade)
  }
  if (profile && profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'assistant') {
    query = query.eq('is_active', true)
  }

  // Every page: PostgREST stops at 1000 rows without saying so, which would
  // silently hide the oldest rows as a curriculum grows.
  return fetchAllRows(() => query.order('id', { ascending: true }))
}

export async function getStandaloneLecturesWithDetails({ grade = null } = {}) {
  const { profile } = await requireAuthUser().catch(() => ({ profile: null }))

  let query = getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at, available_hours, available_from, available_until
    `)
    .is('chapter_id', null)
    .is('package_id', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (profile?.tenant_id) {
    query = query.eq('tenant_id', profile.tenant_id)
  }
  if (grade) {
    query = query.eq('grade', grade)
  }
  if (profile && profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'assistant') {
    query = query.eq('is_active', true)
  }

  // Every page, so a long curriculum does not lose its oldest lectures.
  const lectures = await fetchAllRows(() => query.order('id', { ascending: true }))
  if (lectures.length === 0) return []

  const lectureIds = lectures.map(l => l.id)

  // Chunked: every lecture id goes into the request URL, so a long list would
  // otherwise make the request fail outright.
  const withTenant = (q) => (profile?.tenant_id ? q.eq('tenant_id', profile.tenant_id) : q)

  const [vidRows, exRows, fileRows] = await Promise.all([
    selectInChunks(lectureIds, (part) => withTenant(getSupabase()
      .from('lecture_videos')
      .select(`
        id, lecture_id, video_id, sort_order, created_at,
        video:video_id (
          id, title, description, grade, active_hours, is_archived, pdf_url, pdf_key,
          video_parts ( id, part_index, title, source, youtube_id, drive_id, duration_seconds, view_limit, bunny_video_id, bunny_library_id )
        )
      `)
      .in('lecture_id', part))
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),

    selectInChunks(lectureIds, (part) => withTenant(getSupabase()
      .from('lecture_exams')
      .select(`
        id, lecture_id, exam_id, sort_order, created_at,
        exam:exam_id (
          id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions_count, reveal_grades, is_archived, exam_type, origin
        )
      `)
      .in('lecture_id', part))
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),

    selectInChunks(lectureIds, (part) => withTenant(getSupabase()
      .from('lecture_files')
      .select('id, lecture_id, title, file_key, file_size, sort_order, created_at')
      .in('lecture_id', part))
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),
  ])

  const vidRes = { data: vidRows, error: null }
  const exRes = { data: exRows, error: null }
  const fileRes = { data: fileRows, error: null }

  if (vidRes.error) throw vidRes.error
  if (exRes.error) throw exRes.error
  if (fileRes.error) throw fileRes.error

  const videosByLec = {}
  const examsByLec = {}
  const filesByLec = {}

  lectureIds.forEach(id => {
    videosByLec[id] = []
    examsByLec[id] = []
    filesByLec[id] = []
  })

  ;(vidRes.data || []).forEach(v => {
    if (v.video && videosByLec[v.lecture_id]) {
      videosByLec[v.lecture_id].push({
        ...v.video,
        sort_order: v.sort_order,
        junction_id: v.id,
        lecture_id: v.lecture_id
      })
    }
  })

  ;(exRes.data || []).forEach(e => {
    if (e.exam && examsByLec[e.lecture_id]) {
      examsByLec[e.lecture_id].push({
        ...e.exam,
        sort_order: e.sort_order,
        junction_id: e.id,
        lecture_id: e.lecture_id
      })
    }
  })

  ;(fileRes.data || []).forEach(f => {
    if (filesByLec[f.lecture_id]) {
      filesByLec[f.lecture_id].push(f)
    }
  })

  return lectures.map(lec => {
    const vids = videosByLec[lec.id] || []
    const exs = examsByLec[lec.id] || []
    const fls = filesByLec[lec.id] || []

    return {
      ...lec,
      videos: vids,
      exams: exs,
      files: fls,
      videos_count: vids.length,
      exams_count: exs.length,
      files_count: fls.length
    }
  })
}

export async function getLectureDetails(lectureId) {
  if (!lectureId) throw new Error('lecture_id_required')

  const { data: lecture, error: lecErr } = await getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at, available_hours, available_from, available_until
    `)
    .eq('id', lectureId)
    .single()

  if (lecErr) throw lecErr

  // Fetch associated videos (M:N)
  const { data: videos, error: vidErr } = await getSupabase()
    .from('lecture_videos')
    .select(`
      id, lecture_id, video_id, sort_order, created_at,
      video:video_id (
        id, title, description, grade, active_hours, is_archived, pdf_url, pdf_key,
        video_parts ( id, part_index, title, source, youtube_id, drive_id, duration_seconds, view_limit, bunny_video_id, bunny_library_id )
      )
    `)
    .eq('lecture_id', lectureId)
    .order('sort_order', { ascending: true })

  if (vidErr) throw vidErr

  // Fetch associated exams (M:N)
  const { data: exams, error: exErr } = await getSupabase()
    .from('lecture_exams')
    .select(`
      id, lecture_id, exam_id, sort_order, created_at,
      exam:exam_id (
        id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions_count, reveal_grades, is_archived, exam_type, origin
      )
    `)
    .eq('lecture_id', lectureId)
    .order('sort_order', { ascending: true })

  if (exErr) throw exErr

  // Fetch associated files (1:N)
  const { data: files, error: fErr } = await getSupabase()
    .from('lecture_files')
    .select('id, lecture_id, title, file_key, file_size, sort_order, created_at')
    .eq('lecture_id', lectureId)
    .order('sort_order', { ascending: true })

  if (fErr) throw fErr

  return {
    ...lecture,
    videos: (videos || []).map(v => ({ ...v.video, sort_order: v.sort_order, junction_id: v.id })),
    exams: (exams || []).map(e => ({ ...e.exam, sort_order: e.sort_order, junction_id: e.id })),
    files: files || []
  }
}

export async function getLecturesForVideo(videoId) {
  if (!videoId) return []
  const { profile } = await requireAuthUser()

  const { data, error } = await getSupabase()
    .from('lecture_videos')
    .select(`
      id,
      lecture_id,
      video_id,
      sort_order,
      created_at,
      lecture:lecture_id (
        id,
        tenant_id,
        chapter_id,
        package_id,
        grade,
        title,
        description,
        sort_order,
        is_active,
        created_at,
        updated_at
      )
    `)
    .eq('video_id', videoId)
    .eq('tenant_id', profile.tenant_id)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const rows = (data || []).filter(r => r.lecture)
  if (rows.length === 0) return []

  const chapterIds = Array.from(new Set(rows.map(r => r.lecture.chapter_id).filter(Boolean)))
  const packageIds = Array.from(new Set(rows.map(r => r.lecture.package_id).filter(Boolean)))

  const [chapRes, pkgRes] = await Promise.all([
    chapterIds.length > 0
      ? getSupabase()
          .from('course_chapters')
          .select('id, title, sort_order, is_active')
          .in('id', chapterIds)
      : Promise.resolve({ data: [] }),
    packageIds.length > 0
      ? getSupabase()
          .from('packages')
          .select('id, title, grade, is_active')
          .in('id', packageIds)
      : Promise.resolve({ data: [] })
  ])

  const chapterMap = new Map((chapRes.data || []).map(c => [c.id, c]))
  const packageMap = new Map((pkgRes.data || []).map(p => [p.id, p]))

  return rows
    .filter(row => profile.role === 'admin' || profile.role === 'assistant' || row.lecture.is_active !== false)
    .map(row => {
      const lec = row.lecture
      return {
        ...lec,
        junction_id: row.id,
        sort_order: row.sort_order,
        created_at: row.created_at,
        chapter: chapterMap.get(lec.chapter_id) || null,
        chapter_title: chapterMap.get(lec.chapter_id)?.title || null,
        package: packageMap.get(lec.package_id) || null,
        package_title: packageMap.get(lec.package_id)?.title || null
      }
    })
}

export async function getChapterLecturesWithDetails(chapterId) {
  if (!chapterId) return []
  const { profile } = await requireAuthUser()

  let query = getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active, created_at, updated_at, available_hours, available_from, available_until
    `)
    .eq('chapter_id', chapterId)
    .eq('tenant_id', profile.tenant_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (profile.role !== 'admin' && profile.role !== 'assistant') {
    query = query.eq('is_active', true)
  }

  // Every page, so a long curriculum does not lose its oldest lectures.
  const lectures = await fetchAllRows(() => query.order('id', { ascending: true }))
  if (lectures.length === 0) return []

  const lectureIds = lectures.map(l => l.id)

  // Chunked for the same reason as the standalone loader above.
  const [vidRows, exRows, fileRows] = await Promise.all([
    selectInChunks(lectureIds, (part) => getSupabase()
      .from('lecture_videos')
      .select(`
        id, lecture_id, video_id, sort_order, created_at,
        video:video_id (
          id, title, description, grade, active_hours, is_archived, pdf_url, pdf_key,
          video_parts ( id, part_index, title, source, youtube_id, drive_id, duration_seconds, view_limit, bunny_video_id, bunny_library_id )
        )
      `)
      .in('lecture_id', part)
      .eq('tenant_id', profile.tenant_id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),

    selectInChunks(lectureIds, (part) => getSupabase()
      .from('lecture_exams')
      .select(`
        id, lecture_id, exam_id, sort_order, created_at,
        exam:exam_id (
          id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions_count, reveal_grades, is_archived, exam_type, origin
        )
      `)
      .in('lecture_id', part)
      .eq('tenant_id', profile.tenant_id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),

    selectInChunks(lectureIds, (part) => getSupabase()
      .from('lecture_files')
      .select('id, lecture_id, title, file_key, file_size, sort_order, created_at')
      .in('lecture_id', part)
      .eq('tenant_id', profile.tenant_id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })),
  ])

  const vidRes = { data: vidRows, error: null }
  const exRes = { data: exRows, error: null }
  const fileRes = { data: fileRows, error: null }

  const videosByLec = {}
  const examsByLec = {}
  const filesByLec = {}

  lectureIds.forEach(id => {
    videosByLec[id] = []
    examsByLec[id] = []
    filesByLec[id] = []
  })

  ;(vidRes.data || []).forEach(v => {
    if (v.video && videosByLec[v.lecture_id]) {
      videosByLec[v.lecture_id].push({
        ...v.video,
        sort_order: v.sort_order,
        junction_id: v.id,
        lecture_id: v.lecture_id
      })
    }
  })

  ;(exRes.data || []).forEach(e => {
    if (e.exam && examsByLec[e.lecture_id]) {
      examsByLec[e.lecture_id].push({
        ...e.exam,
        sort_order: e.sort_order,
        junction_id: e.id,
        lecture_id: e.lecture_id
      })
    }
  })

  ;(fileRes.data || []).forEach(f => {
    if (filesByLec[f.lecture_id]) {
      filesByLec[f.lecture_id].push(f)
    }
  })

  return lectures.map(lec => {
    const vids = videosByLec[lec.id] || []
    const exs = examsByLec[lec.id] || []
    const fls = filesByLec[lec.id] || []

    return {
      ...lec,
      videos: vids,
      exams: exs,
      files: fls,
      videos_count: vids.length,
      exams_count: exs.length,
      files_count: fls.length
    }
  })
}

export async function createCourseLecture({
  title,
  grade = null,
  chapterId = null,
  packageId = null,
  description = null,
  sortOrder = 0,
  isActive = true,
  availableHours = null,
  availableFrom = null,
  availableUntil = null
}) {
  const { profile } = await requireAuthUser()

  if (!title || !title.trim()) {
    throw new Error('title_required')
  }

  let finalPackageId = packageId || null
  let finalGrade = grade ? grade.trim() : null

  if (chapterId) {
    // Verify chapter exists and retrieve its package_id & tenant_id
    const { data: chapter, error: chapErr } = await getSupabase()
      .from('course_chapters')
      .select('id, package_id, tenant_id, grade')
      .eq('id', chapterId)
      .single()

    if (chapErr || !chapter) throw new Error('chapter_not_found')
    if (chapter.tenant_id !== profile.tenant_id) {
      throw new Error('forbidden: cross-tenant chapter access')
    }

    finalPackageId = chapter.package_id || packageId || null
    if (!finalGrade && chapter.grade) {
      finalGrade = chapter.grade
    }
  }

  if (!finalGrade) {
    throw new Error('grade_required')
  }

  const { data, error } = await getSupabase()
    .from('course_lectures')
    .insert({
      tenant_id: profile.tenant_id,
      chapter_id: chapterId || null,
      package_id: finalPackageId,
      grade: finalGrade,
      title: title.trim(),
      description: description ? description.trim() : null,
      sort_order: sortOrder,
      is_active: isActive !== false,
      available_hours: availableHours !== null && availableHours !== undefined && availableHours !== '' ? parseInt(availableHours, 10) : null,
      available_from: availableFrom || null,
      available_until: availableUntil || null
    })
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_lectures:')
  return data
}

export async function updateCourseLecture(lectureId, patch) {
  await requireAuthUser()
  const updateData = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await getSupabase()
    .from('course_lectures')
    .update(updateData)
    .eq('id', lectureId)
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_lectures:')
  return data
}

export async function setLectureArchived(lectureId, isArchived) {
  return updateCourseLecture(lectureId, { is_active: !isArchived })
}

export async function deleteCourseLecture(lectureId) {
  await requireAuthUser()
  const { error } = await getSupabase()
    .from('course_lectures')
    .delete()
    .eq('id', lectureId)

  if (error) throw error
  invalidatePrefix('course_lectures:')
}

// =====================================================================
// 3. Junction Associations (M:N Videos, M:N Exams, 1:N Files)
// =====================================================================

export async function addVideoToLecture({ lectureId, videoId, sortOrder = 0 }) {
  const { profile } = await requireAuthUser()
  const { data, error } = await getSupabase()
    .from('lecture_videos')
    .insert({
      tenant_id: profile.tenant_id,
      lecture_id: lectureId,
      video_id: videoId,
      sort_order: sortOrder
    })
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_lectures:')
  return data
}

export async function removeVideoFromLecture({ lectureId, videoId }) {
  await requireAuthUser()
  const { error } = await getSupabase()
    .from('lecture_videos')
    .delete()
    .eq('lecture_id', lectureId)
    .eq('video_id', videoId)

  if (error) throw error
  invalidatePrefix('course_lectures:')
}

export async function moveVideoBetweenLectures({ videoId, fromLectureId, toLectureId, newSortOrder = 0 }) {
  const { profile } = await requireAuthUser()
  // Atomic deletion + insertion
  const { error: delErr } = await getSupabase()
    .from('lecture_videos')
    .delete()
    .eq('lecture_id', fromLectureId)
    .eq('video_id', videoId)

  if (delErr) throw delErr

  const { data, error: insErr } = await getSupabase()
    .from('lecture_videos')
    .insert({
      tenant_id: profile.tenant_id,
      lecture_id: toLectureId,
      video_id: videoId,
      sort_order: newSortOrder
    })
    .select()
    .single()

  if (insErr) throw insErr
  invalidatePrefix('course_lectures:')
  return data
}

export async function addExamToLecture({ lectureId, examId, sortOrder = 0 }) {
  const { profile } = await requireAuthUser()
  // Triggers trig_check_lecture_exam_containment_cycle inside PostgreSQL to prevent circular dependencies
  const { data, error } = await getSupabase()
    .from('lecture_exams')
    .insert({
      tenant_id: profile.tenant_id,
      lecture_id: lectureId,
      exam_id: examId,
      sort_order: sortOrder
    })
    .select()
    .single()

  if (error) {
    if (error.message && error.message.includes('containment_cycle_detected')) {
      const err = new Error('containment_cycle_detected: adding this exam to lecture creates a circular prerequisite dependency')
      err.code = '400'
      throw err
    }
    throw error
  }
  invalidatePrefix('course_lectures:')
  return data
}

export async function removeExamFromLecture({ lectureId, examId }) {
  await requireAuthUser()
  // Uses atomic PostgreSQL RPC remove_exam_from_lecture (Clarification 2)
  const { data, error } = await getSupabase().rpc('remove_exam_from_lecture', {
    p_lecture_id: lectureId,
    p_exam_id: examId
  })

  if (error) throw error
  invalidatePrefix('course_lectures:')
  return data
}

export async function addLectureFile({ lectureId, title, fileKey, fileSize = 0, sortOrder = 0 }) {
  const { profile } = await requireAuthUser()
  const { data, error } = await getSupabase()
    .from('lecture_files')
    .insert({
      tenant_id: profile.tenant_id,
      lecture_id: lectureId,
      title: title.trim(),
      file_key: fileKey.trim(),
      file_size: fileSize,
      sort_order: sortOrder
    })
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('course_lectures:')
  return data
}

export async function removeLectureFile(fileId) {
  await requireAuthUser()
  const { error } = await getSupabase()
    .from('lecture_files')
    .delete()
    .eq('id', fileId)

  if (error) throw error
  invalidatePrefix('course_lectures:')
}

// =====================================================================
// 4. Unassigned Content Retrieval (Unassigned Content Paradigm)
// =====================================================================

export async function getUnassignedVideos(packageId = null) {
  const { profile } = await requireAuthUser()

  let query = getSupabase()
    .from('videos')
    .select(`
      id, title, description, grade, active_hours, is_archived, created_at,
      video_parts ( id, part_index, title, duration_seconds )
    `)
    .eq('tenant_id', profile.tenant_id)
    .eq('is_archived', false)

  // Filter videos that are not yet associated with any lecture. Both reads take
  // every page: a tenant's video library and its curriculum both grow past 1000.
  const allVideos = await fetchAllRows(() => query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }))

  const assignedRows = await fetchAllRows(() => getSupabase()
    .from('lecture_videos')
    .select('video_id')
    .eq('tenant_id', profile.tenant_id)
    .order('video_id', { ascending: true }))

  const assignedSet = new Set(assignedRows.map(r => r.video_id))
  return allVideos.filter(v => !assignedSet.has(v.id))
}

export async function getUnassignedExams(packageId = null) {
  const { profile } = await requireAuthUser()

  let query = getSupabase()
    .from('exams')
    .select('id, number, title, grade, duration_minutes, max_attempts, questions_count, created_at, is_archived')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_archived', false)

  const allExams = await fetchAllRows(() => query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true }))

  const assignedRows = await fetchAllRows(() => getSupabase()
    .from('lecture_exams')
    .select('exam_id')
    .eq('tenant_id', profile.tenant_id)
    .order('exam_id', { ascending: true }))

  const assignedSet = new Set(assignedRows.map(r => r.exam_id))
  return allExams.filter(e => !assignedSet.has(e.id))
}

// =====================================================================
// 5. Prerequisite Unlock Rules Management (Target -> Required Exam)
// =====================================================================

export async function getUnlockRulesForContent(targetType, targetId) {
  if (!targetType || !targetId) return []
  const { data, error } = await getSupabase()
    .from('content_unlock_rules')
    .select(`
      id, tenant_id, target_content_type, target_content_id, required_exam_id, required_score, is_active, created_at,
      required_exam:required_exam_id ( id, title, grade, total_points )
    `)
    .eq('target_content_type', targetType)
    .eq('target_content_id', targetId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createUnlockRule({ targetType, targetId, requiredExamId, requiredScore = 70.0 }) {
  const { profile } = await requireAuthUser()

  // Polymorphic validation & cycle check enforced by triggers in PostgreSQL
  const { data, error } = await getSupabase()
    .from('content_unlock_rules')
    .insert({
      tenant_id: profile.tenant_id,
      target_content_type: targetType,
      target_content_id: targetId,
      required_exam_id: requiredExamId,
      required_score: parseFloat(requiredScore) || 70.0,
      is_active: true
    })
    .select()
    .single()

  if (error) {
    if (error.message && error.message.includes('cycle_detected')) {
      const err = new Error('cycle_detected: adding this unlock rule creates a circular dependency')
      err.code = '400'
      throw err
    }
    if (error.message && error.message.includes('self_cycle_detected')) {
      const err = new Error('self_cycle_detected: an exam cannot require itself')
      err.code = '400'
      throw err
    }
    if (error.message && error.message.includes('idx_unique_active_unlock_rule')) {
      const err = new Error('conflict: an active unlock rule already exists for this target')
      err.code = '409'
      throw err
    }
    throw error
  }

  invalidatePrefix('content_unlock_rules:')
  return data
}

export async function updateUnlockRule(ruleId, { isActive, requiredScore }) {
  await requireAuthUser()
  const patch = {}
  if (isActive !== undefined) patch.is_active = !!isActive
  if (requiredScore !== undefined) patch.required_score = parseFloat(requiredScore)
  patch.updated_at = new Date().toISOString()

  const { data, error } = await getSupabase()
    .from('content_unlock_rules')
    .update(patch)
    .eq('id', ruleId)
    .select()
    .single()

  if (error) throw error
  invalidatePrefix('content_unlock_rules:')
  return data
}

export async function deleteUnlockRule(ruleId) {
  await requireAuthUser()
  const { error } = await getSupabase()
    .from('content_unlock_rules')
    .delete()
    .eq('id', ruleId)

  if (error) throw error
  invalidatePrefix('content_unlock_rules:')
}

// =====================================================================
// 6. Unified Educational Unlock & Access Engine (Phase 3 Core Flow)
// Sequence: auth.uid() -> tenant -> validate context -> has_content_access -> check_content_unlocked
// =====================================================================

export async function checkContentUnlocked({ targetType, targetId, contextLectureId = null }) {
  const { user } = await requireAuthUser()

  // Always derives student identity from authenticated auth.uid()
  const { data, error } = await getSupabase().rpc('check_content_unlocked', {
    p_student_id: user.id,
    p_target_type: targetType,
    p_target_id: targetId,
    p_context_lecture_id: contextLectureId || null
  })

  if (error) throw error
  return data
}

// Lock status used when the check itself failed. Content stays closed (the
// safe choice); PrerequisiteLockModal shows a "reload and retry" message for it.
export const LOCK_CHECK_FAILED = Object.freeze({ unlocked: false, reason: 'check_failed' })

// A lecture (with its videos and exams) annotated with the student's
// prerequisite locks: lockStatus on the lecture and on every video/exam.
// A locked lecture locks its children without extra requests. Call it for
// students only — staff have no exam attempts and would read as locked.
export async function withLectureLocks(lec) {
  const check = (args) => checkContentUnlocked(args).catch((err) => {
    console.warn('Lock check failed:', err)
    return LOCK_CHECK_FAILED
  })
  const lectureLock = (await check({ targetType: 'lecture', targetId: lec.id })) || LOCK_CHECK_FAILED
  const videos = lec.videos || []
  const exams = lec.exams || []

  if (lectureLock.unlocked === false) {
    const childLock = lectureLock.reason === 'check_failed' ? LOCK_CHECK_FAILED : {
      unlocked: false,
      reason: 'lecture_locked',
      parent_lecture_id: lec.id,
      required_exam_id: lectureLock.required_exam_id,
      required_exam_title: lectureLock.required_exam_title,
      required_score: lectureLock.required_score,
      student_score: lectureLock.student_score
    }
    return {
      ...lec,
      lockStatus: lectureLock,
      videos: videos.map((v) => ({ ...v, lockStatus: childLock })),
      exams: exams.map((e) => ({ ...e, lockStatus: childLock }))
    }
  }

  const [videoLocks, examLocks] = await Promise.all([
    Promise.all(videos.map((v) => check({ targetType: 'video', targetId: v.id, contextLectureId: lec.id }))),
    Promise.all(exams.map((e) => check({ targetType: 'exam', targetId: e.id, contextLectureId: lec.id })))
  ])
  return {
    ...lec,
    lockStatus: lectureLock,
    videos: videos.map((v, i) => ({ ...v, lockStatus: videoLocks[i] || LOCK_CHECK_FAILED })),
    exams: exams.map((e, i) => ({ ...e, lockStatus: examLocks[i] || LOCK_CHECK_FAILED }))
  }
}

// The student's lock status for an exam or video wherever it appears: unlocked
// if it is unlocked in at least one of its lectures (or, outside lectures, by
// its own rule). Staff always get { unlocked: true }. Same check the database
// runs when an exam attempt starts and bunny-signed-url runs before playback.
export async function checkContentUnlockedAnyContext({ targetType, targetId }) {
  const { data, error } = await getSupabase().rpc('content_unlocked_any_context', {
    p_target_type: targetType,
    p_target_id: targetId
  })
  if (error) throw error
  return data
}

export async function getVideoAccess({ videoId, contextLectureId = null }) {
  // 1. Authenticate Request & derive trusted server-side user
  const { user, profile } = await requireAuthUser()

  // 2. Validate target video exists and belongs to tenant
  const { data: video, error: vErr } = await getSupabase()
    .from('videos')
    .select(`
      id, tenant_id, title, description, grade, active_hours, is_archived, pdf_url, pdf_key,
      video_parts ( id, part_index, title, source, youtube_id, drive_id, duration_seconds, view_limit, bunny_video_id, bunny_library_id )
    `)
    .eq('id', videoId)
    .single()

  if (vErr || !video) {
    const err = new Error('video_not_found: video does not exist')
    err.status = 404
    throw err
  }

  if (video.tenant_id !== profile.tenant_id) {
    const err = new Error('forbidden: cross-tenant access rejected')
    err.status = 403
    throw err
  }

  // 3. Validate target and context relationship
  const { data: associations, error: aErr } = await getSupabase()
    .from('lecture_videos')
    .select('lecture_id')
    .eq('video_id', videoId)
    .eq('tenant_id', profile.tenant_id)

  if (aErr) throw aErr

  const hasLectureAssociations = (associations || []).length > 0
  if (hasLectureAssociations) {
    if (!contextLectureId) {
      const err = new Error('missing_context: contextLectureId is required for videos belonging to lectures')
      err.status = 400
      throw err
    }
    const isContained = associations.some(a => a.lecture_id === contextLectureId)
    if (!isContained) {
      const err = new Error('invalid_context: video does not belong to specified context lecture')
      err.status = 400
      throw err
    }
  } else if (contextLectureId) {
    const err = new Error('invalid_context: standalone video does not belong to any lecture')
    err.status = 400
    throw err
  }

  // 4. Authoritative Content Authorization: has_content_access
  if (profile.role === 'student') {
    const { data: hasAccess, error: accErr } = await getSupabase().rpc('has_content_access', {
      p_user_id: user.id,
      p_content_type: 'video',
      p_content_id: videoId
    })

    if (accErr) throw accErr
    if (!hasAccess) {
      const err = new Error('forbidden: no active subscription or access grant for this video')
      err.status = 403
      throw err
    }
  }

  // 5. Educational Unlock Gate (Strict AND: Lecture unlock + Video prerequisite)
  const unlockStatus = await checkContentUnlocked({
    targetType: 'video',
    targetId: videoId,
    contextLectureId
  })

  if (!unlockStatus || unlockStatus.unlocked !== true) {
    const err = new Error(`locked: ${unlockStatus?.reason || 'content_locked'}`)
    err.status = 423
    err.unlockStatus = unlockStatus
    throw err
  }

  // 6. Return authorized delivery metadata (clean parts sorted by part_index)
  video.video_parts = (video.video_parts || []).sort((a, b) => a.part_index - b.part_index)
  return {
    authorized: true,
    video,
    contextLectureId,
    unlockStatus
  }
}

export async function getExamAccess({ examId, contextLectureId = null }) {
  // 1. Authenticate Request & derive trusted server-side user
  const { user, profile } = await requireAuthUser()

  // 2. Validate target exam exists and belongs to tenant
  const { data: exam, error: eErr } = await getSupabase()
    .from('exams')
    .select(`
      id, tenant_id, number, title, grade, duration_minutes, max_attempts, available_hours, total_points, questions_count, reveal_grades, is_archived, exam_type, origin
    `)
    .eq('id', examId)
    .single()

  if (eErr || !exam) {
    const err = new Error('exam_not_found: exam does not exist')
    err.status = 404
    throw err
  }

  if (exam.tenant_id !== profile.tenant_id) {
    const err = new Error('forbidden: cross-tenant access rejected')
    err.status = 403
    throw err
  }

  // 3. Validate standalone vs embedded status
  const { data: associations, error: aErr } = await getSupabase()
    .from('lecture_exams')
    .select('lecture_id')
    .eq('exam_id', examId)
    .eq('tenant_id', profile.tenant_id)

  if (aErr) throw aErr

  const isEmbedded = (associations || []).length > 0
  if (isEmbedded) {
    if (!contextLectureId) {
      const err = new Error('missing_context: contextLectureId is required for exams belonging to lectures')
      err.status = 400
      throw err
    }
    const isContained = associations.some(a => a.lecture_id === contextLectureId)
    if (!isContained) {
      const err = new Error('invalid_context: exam does not belong to specified context lecture')
      err.status = 400
      throw err
    }
  } else if (contextLectureId) {
    const err = new Error('invalid_context: standalone exam does not belong to specified context lecture')
    err.status = 400
    throw err
  }

  // 4. Authoritative Content Authorization: has_content_access
  if (profile.role === 'student') {
    const { data: hasAccess, error: accErr } = await getSupabase().rpc('has_content_access', {
      p_user_id: user.id,
      p_content_type: 'exam',
      p_content_id: examId
    })

    if (accErr) throw accErr
    if (!hasAccess) {
      const err = new Error('forbidden: no active subscription or access grant for this exam')
      err.status = 403
      throw err
    }
  }

  // 5. Educational Unlock Gate (Strict AND: Containing lecture + Direct prerequisite)
  const unlockStatus = await checkContentUnlocked({
    targetType: 'exam',
    targetId: examId,
    contextLectureId
  })

  if (!unlockStatus || unlockStatus.unlocked !== true) {
    const err = new Error(`locked: ${unlockStatus?.reason || 'content_locked'}`)
    err.status = 423
    err.unlockStatus = unlockStatus
    throw err
  }

  // 6. Invoke existing authoritative exam attempt engine (start_or_get_exam_attempt)
  const { data: attemptData, error: attemptErr } = await getSupabase().rpc('start_or_get_exam_attempt', {
    p_exam_id: examId
  })

  if (attemptErr) throw attemptErr

  return {
    authorized: true,
    exam,
    contextLectureId,
    unlockStatus,
    attempt: attemptData
  }
}

export async function getLectureFileAccess({ fileId, contextLectureId }) {
  // 1. Authenticate Request & derive trusted server-side user
  const { user, profile } = await requireAuthUser()

  if (!contextLectureId) {
    const err = new Error('missing_context: contextLectureId is required for lecture files')
    err.status = 400
    throw err
  }

  // 2. Validate file exists and belongs to contextLectureId
  const { data: file, error: fErr } = await getSupabase()
    .from('lecture_files')
    .select('id, tenant_id, lecture_id, title, file_key, file_size')
    .eq('id', fileId)
    .single()

  if (fErr || !file) {
    const err = new Error('file_not_found: file does not exist')
    err.status = 404
    throw err
  }

  if (file.tenant_id !== profile.tenant_id) {
    const err = new Error('forbidden: cross-tenant access rejected')
    err.status = 403
    throw err
  }

  if (file.lecture_id !== contextLectureId) {
    const err = new Error('invalid_context: file does not belong to specified context lecture')
    err.status = 400
    throw err
  }

  // 3. Validate containing lecture exists and determine package
  const { data: lecture, error: lErr } = await getSupabase()
    .from('course_lectures')
    .select('id, tenant_id, package_id')
    .eq('id', contextLectureId)
    .single()

  if (lErr || !lecture) {
    const err = new Error('lecture_not_found')
    err.status = 404
    throw err
  }

  // 4. Check package subscription access for student ONLY if lecture is inside a package
  if (profile.role === 'student' && lecture.package_id) {
    const { data: hasPkgAccess, error: pErr } = await getSupabase().rpc('has_content_access', {
      p_user_id: user.id,
      p_content_type: 'video', // verified proxy for package access in existing system
      p_content_id: lecture.package_id
    })

    if (pErr || !hasPkgAccess) {
      // Fallback check on package_purchases directly
      const { data: sub } = await getSupabase()
        .from('package_purchases')
        .select('id')
        .eq('student_id', user.id)
        .eq('package_id', lecture.package_id)
        .eq('payment_status', 'approved')
        .limit(1)

      if (!sub?.length) {
        const err = new Error('forbidden: no active subscription for this course package')
        err.status = 403
        throw err
      }
    }
  }

  // 5. Evaluate containing lecture unlock state (Files inherit parent lecture unlock).
  //    Students only: staff have no exam attempts and would always read as locked.
  const lectureUnlock = profile.role === 'student'
    ? await checkContentUnlocked({ targetType: 'lecture', targetId: contextLectureId, contextLectureId: null })
    : { unlocked: true }

  if (!lectureUnlock || lectureUnlock.unlocked !== true) {
    const err = new Error('locked: parent lecture is locked by prerequisite exam')
    err.status = 423
    err.unlockStatus = lectureUnlock
    throw err
  }

  // 6. Obtain short-lived presigned GET download URL (300 seconds / 5 minutes)
  // Defense-in-depth: invoke authoritative r2-download-url Edge Function
  const { data: signRes, error: signErr } = await getSupabase().functions.invoke('r2-download-url', {
    body: { fileId, contextLectureId }
  })

  if (signErr || !signRes?.downloadUrl) {
    if (customDownloadSigner) {
      const signed = await customDownloadSigner({ file, contextLectureId })
      return {
        authorized: true,
        fileId: file.id,
        title: file.title,
        fileKey: file.file_key,
        fileSize: file.file_size,
        downloadUrl: signed.downloadUrl,
        expiresIn: signed.expiresIn || 300
      }
    }
    const err = new Error(signErr?.message || 'failed_to_generate_signed_download_url')
    err.status = signErr?.status || 500
    throw err
  }

  return {
    authorized: true,
    fileId: file.id,
    title: file.title,
    fileKey: file.file_key,
    fileSize: file.file_size,
    downloadUrl: signRes.downloadUrl,
    expiresIn: signRes.expiresIn || 300
  }
}

// =====================================================================
// 9. Reporting Helpers (Lectures Retrieval for Reports)
// =====================================================================

export async function listLecturesForReporting({ grade = null } = {}) {
  const { profile } = await requireAuthUser().catch(() => ({ profile: null }))
  let query = getSupabase()
    .from('course_lectures')
    .select(`
      id, tenant_id, chapter_id, package_id, grade, title, description, sort_order, is_active,
      chapter:chapter_id ( id, title ),
      package:package_id ( id, title )
    `)
    .order('sort_order', { ascending: true })

  if (profile?.tenant_id) {
    query = query.eq('tenant_id', profile.tenant_id)
  }
  if (grade) {
    query = query.eq('grade', grade)
  }

  // Every page: PostgREST stops at 1000 rows without saying so, which would
  // silently hide the oldest rows as a curriculum grows.
  return fetchAllRows(() => query.order('id', { ascending: true }))
}

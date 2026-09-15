import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI } from '@backend/authApi'
import { useTenant } from '../contexts/TenantContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '@backend/supabase'
import { isRegistrationClosed } from '../utils/registration'
import './Register.css'
import './login-styles.css'

/* Step-by-step student registration.
   Built for students who are not comfortable with web forms: one question per
   screen, big tap targets, and NOTHING pre-selected — the old single form
   pre-selected the first stage, type, branch and group, so anyone who scrolled
   past them was registered into the wrong ones. Each typed phone number gets
   its own confirmation screen, which is where a 2-instead-of-3 typo is caught
   before it becomes the student's login.
   A centre can close registration, or give it a closing time, from the
   students panel (tenants.config.registration — see RegistrationSwitch). */

// Arabic-Indic / Persian digits → Latin, whitespace removed. Logins are built
// from Latin digits, and an Arabic keyboard types ٠١٠…
const normalizeHandle = (v) => String(v || '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
  .replace(/\s+/g, '')

// Same acceptance rule as before, so every saved value can log in.
const isValidHandle = (h) => h.length >= 8 || /^[a-zA-Z0-9]{4,20}$/.test(h)
const isDigitsOnly = (h) => /^\d+$/.test(h)
const looksLikeEgyptianMobile = (h) => /^01\d{9}$/.test(h)
// 01063099324 → 0106 309 9324: easier to check digit by digit.
const spacedNumber = (h) => (looksLikeEgyptianMobile(h) ? `${h.slice(0, 4)} ${h.slice(4, 7)} ${h.slice(7)}` : h)

const INPUT_STEPS = ['name', 'phone', 'parent', 'stage', 'type', 'branch', 'group', 'password']

const translations = {
  ar: {
    eyebrow: 'إنشاء حساب جديد',
    stepOf: (i, n) => `الخطوة ${i} من ${n}`,
    next: 'التالي',
    back: 'السابق',
    edit: 'تعديل',
    submit: 'إنشاء الحساب',
    submitting: 'جاري إنشاء الحساب...',
    loadingGroups: 'جاري التحميل...',
    haveAccount: 'عندك حساب بالفعل؟',
    loginLink: 'سجّل دخولك',
    qName: 'اسمك إيه؟',
    hName: 'اكتب اسمك بالكامل.',
    phName: 'الاسم بالكامل',
    qPhone: 'رقم موبايلك أو كود الطالب',
    hPhone: 'ده اللي هتسجّل بيه دخولك كل مرة. لو السنتر إداك كود، اكتبه هنا.',
    qPhoneConfirm: 'اتأكد من رقمك',
    hPhoneConfirm: 'بص على كل رقم كويس — ده اللي هتدخل بيه المنصة.',
    phoneLabel: 'رقم الموبايل',
    codeLabel: 'كود الطالب',
    qParent: 'رقم موبايل ولي الأمر',
    hParent: 'ولي الأمر هيتابع حضورك ودرجاتك بالرقم ده. لازم يكون مختلف عن رقمك.',
    qParentConfirm: 'اتأكد من رقم ولي الأمر',
    hParentConfirm: 'بص على كل رقم كويس قبل ما تكمل.',
    parentLabel: 'رقم ولي الأمر',
    yesCorrect: 'أيوه، صح',
    noEdit: 'لأ، هعدّله',
    warnNotMobile: 'الرقم ده مش شكل رقم موبايل مصري (11 رقم بيبدأ بـ 01). اتأكد منه كويس قبل ما تكمل.',
    qStage: 'إنت في سنة كام؟',
    hStage: 'اختار سنتك الدراسية.',
    qType: 'هتذاكر إزاي؟',
    typeCenter: 'في السنتر',
    typeCenterSub: 'بتحضر الحصص في السنتر',
    typeOnline: 'أونلاين',
    typeOnlineSub: 'بتذاكر من المنصة بس',
    typeHybrid: 'سنتر وأونلاين',
    typeHybridSub: 'الاتنين مع بعض',
    qBranch: 'بتحضر في أنهي فرع؟',
    hBranch: 'اختار الفرع اللي بتروحه.',
    qGroup: 'اختار مجموعتك',
    hGroup: 'اختار المجموعة اللي بتحضر معاها.',
    qPassword: 'اختار كلمة مرور',
    hPassword: '6 حروف أو أرقام على الأقل. اكتبها مرتين عشان نتأكد إنها صح.',
    phPassword: 'كلمة المرور',
    phConfirm: 'اكتب كلمة المرور تاني',
    showPw: 'إظهار',
    hidePw: 'إخفاء',
    qReview: 'راجع بياناتك',
    hReview: 'لو فيه حاجة غلط، دوس «تعديل» جنبها.',
    rName: 'الاسم',
    rPhone: 'رقم الدخول',
    rParent: 'رقم ولي الأمر',
    rStage: 'السنة الدراسية',
    rType: 'طريقة الدراسة',
    rBranch: 'الفرع',
    rGroup: 'المجموعة',
    rPassword: 'كلمة المرور',
    doneTitle: 'تم إنشاء حسابك',
    doneSub: 'حسابك دلوقتي عند إدارة السنتر للمراجعة، وهيتفعّل قريب.',
    yourLogin: 'بيانات دخولك',
    screenshotHint: '📸 خد سكرين شوت للشاشة دي دلوقتي عشان متنساش بياناتك.',
    enterPlatform: 'ادخل المنصة',
    closedTitle: 'التسجيل مقفول حالياً',
    closedSub: 'لو محتاج تعمل حساب جديد، كلّم إدارة السنتر.',
    closedLogin: 'عندك حساب؟ سجّل دخولك',
    errName: 'اكتب اسمك بالكامل (3 حروف على الأقل).',
    errPhone: 'الرقم أو الكود مش صحيح. الرقم لازم يكون 8 أرقام على الأقل، والكود من 4 لـ 20 حرف أو رقم إنجليزي.',
    errParent: 'رقم ولي الأمر مش صحيح.',
    errParentSame: 'رقم ولي الأمر لازم يكون مختلف عن رقمك.',
    errStage: 'اختار سنتك الدراسية.',
    errType: 'اختار طريقة الدراسة.',
    errBranch: 'اختار الفرع.',
    errGroup: 'اختار مجموعتك.',
    errPasswordShort: 'كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل.',
    errPasswordMatch: 'كلمة المرور التانية مش زي الأولى.',
    errParentIsUser: 'رقم ولي الأمر ده مسجّل بالفعل كحساب في المنصة.',
    errGeneric: 'حصلت مشكلة وإحنا بنعمل الحساب. حاول تاني.',
  },
  en: {
    eyebrow: 'Create a new account',
    stepOf: (i, n) => `Step ${i} of ${n}`,
    next: 'Next',
    back: 'Back',
    edit: 'Edit',
    submit: 'Create account',
    submitting: 'Creating your account...',
    loadingGroups: 'Loading...',
    haveAccount: 'Already have an account?',
    loginLink: 'Log in',
    qName: 'What is your name?',
    hName: 'Type your full name.',
    phName: 'Full name',
    qPhone: 'Your phone number or student code',
    hPhone: 'You will log in with this every time. If the centre gave you a code, type it here.',
    qPhoneConfirm: 'Check your number',
    hPhoneConfirm: 'Look at every digit carefully — this is what you will log in with.',
    phoneLabel: 'Phone number',
    codeLabel: 'Student code',
    qParent: "Parent's phone number",
    hParent: 'Your parent follows your attendance and grades with this number. It must be different from yours.',
    qParentConfirm: "Check your parent's number",
    hParentConfirm: 'Look at every digit carefully before you continue.',
    parentLabel: "Parent's number",
    yesCorrect: 'Yes, correct',
    noEdit: 'No, let me fix it',
    warnNotMobile: 'This does not look like an Egyptian mobile number (11 digits starting with 01). Double-check it before you continue.',
    qStage: 'Which year are you in?',
    hStage: 'Choose your school year.',
    qType: 'How will you study?',
    typeCenter: 'At the centre',
    typeCenterSub: 'You attend classes at the centre',
    typeOnline: 'Online',
    typeOnlineSub: 'You study on the platform only',
    typeHybrid: 'Centre and online',
    typeHybridSub: 'Both together',
    qBranch: 'Which branch do you attend?',
    hBranch: 'Choose the branch you go to.',
    qGroup: 'Choose your group',
    hGroup: 'Choose the group you attend with.',
    qPassword: 'Choose a password',
    hPassword: 'At least 6 letters or digits. Type it twice so we know it is right.',
    phPassword: 'Password',
    phConfirm: 'Type the password again',
    showPw: 'Show',
    hidePw: 'Hide',
    qReview: 'Review your details',
    hReview: 'If anything is wrong, press "Edit" next to it.',
    rName: 'Name',
    rPhone: 'Login number',
    rParent: "Parent's number",
    rStage: 'School year',
    rType: 'Study type',
    rBranch: 'Branch',
    rGroup: 'Group',
    rPassword: 'Password',
    doneTitle: 'Your account is created',
    doneSub: 'Your account is now waiting for the centre to approve it.',
    yourLogin: 'Your login details',
    screenshotHint: '📸 Take a screenshot of this screen now so you do not forget your details.',
    enterPlatform: 'Enter the platform',
    closedTitle: 'Registration is closed',
    closedSub: 'If you need a new account, contact the centre.',
    closedLogin: 'Have an account? Log in',
    errName: 'Type your full name (at least 3 letters).',
    errPhone: 'That number or code is not valid. A number needs at least 8 digits; a code 4 to 20 English letters or digits.',
    errParent: "The parent's number is not valid.",
    errParentSame: "The parent's number must be different from yours.",
    errStage: 'Choose your school year.',
    errType: 'Choose how you will study.',
    errBranch: 'Choose your branch.',
    errGroup: 'Choose your group.',
    errPasswordShort: 'The password must be at least 6 letters or digits.',
    errPasswordMatch: 'The second password does not match the first.',
    errParentIsUser: "That parent's number is already registered as an account on the platform.",
    errGeneric: 'Something went wrong creating the account. Please try again.',
  },
}

function Choice({ selected, onClick, icon, label, sub }) {
  return (
    <button type="button" className={`rw-choice ${selected ? 'is-selected' : ''}`} onClick={onClick} aria-pressed={selected}>
      {selected && <span className="rw-choice-check"><i className="fas fa-check"></i></span>}
      {icon && <span className="rw-choice-icon" aria-hidden="true">{icon}</span>}
      <span>{label}</span>
      {sub && <span className="rw-choice-sub">{sub}</span>}
    </button>
  )
}

export default function Register() {
  const { login } = useAuth()
  const { tenant, tenantId, tenantSlug, tenantName, gradesList, themeConfig } = useTenant()
  const navigate = useNavigate()

  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar')
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const t = translations[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }

  const switchLang = (newLang) => {
    setLang(newLang)
    localStorage.setItem('lang', newLang)
  }

  // ── answers ──
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [grade, setGrade] = useState('')
  const [enrollmentType, setEnrollmentType] = useState('')
  const [branchId, setBranchId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ── loaded choices ──
  const [branches, setBranches] = useState([])
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)

  // ── flow ──
  const [stepKey, setStepKey] = useState('name')
  const [returnToReview, setReturnToReview] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [showResultPassword, setShowResultPassword] = useState(false)

  // ── teacher branding ──
  const getLocalized = (val, arFallback, enFallback) => {
    if (!val) return lang === 'ar' ? arFallback : enFallback
    if (typeof val === 'object') return val[lang] || val['ar'] || arFallback
    return val
  }
  const teacherKicker = getLocalized(themeConfig?.teacher?.kicker || tenant?.config?.teacher?.kicker, null, null)
  const teacherName = getLocalized(themeConfig?.teacher?.name || tenant?.config?.teacher?.name, tenantName, tenantName)
  const teacherRole = getLocalized(themeConfig?.teacher?.role || tenant?.config?.teacher?.role, '', '')
  const teacherImageBase = themeConfig?.teacher?.image_base || tenant?.config?.teacher?.image_base || null
  // Optional stat fields must DISAPPEAR when the tenant leaves them empty —
  // never fall back to another tenant's numbers/specialty.
  const optField = (val) => (val ? getLocalized(val, null, null) : null)
  const teacherExp = optField(themeConfig.teacher?.experience || tenant?.config?.teacher?.experience)
  const teacherStudents = optField(themeConfig.teacher?.students_count || tenant?.config?.teacher?.students_count)
  const teacherTargetStage = optField(themeConfig.teacher?.target_stage || tenant?.config?.teacher?.target_stage)
  const teacherTargetStageLabel = getLocalized(
    themeConfig.teacher?.target_stage_label || tenant?.config?.teacher?.target_stage_label,
    'التخصص',
    'Specialty'
  )
  const isDefaultTenant = !tenantSlug || tenantSlug === 'default'
  const dbLogo = tenant?.logo_url && !tenant.logo_url.includes('3081840') ? tenant.logo_url : null
  const brandLogo = themeConfig.logoUrl || (isDefaultTenant ? null : dbLogo)
  const brandShort = isDefaultTenant
    ? (lang === 'ar' ? 'جِت فِكرة' : 'GitFekra')
    : getLocalized(themeConfig.branding?.brand_short || tenant?.config?.branding?.brand_short, tenantName, tenantName)

  // ── is registration open? ──
  // Read fresh: the tenant config in TenantContext is cached on the device, so
  // a centre that just closed registration would otherwise stay "open" here.
  const [registration, setRegistration] = useState(() => tenant?.config?.registration || null)
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    supabase.from('tenants').select('config').eq('id', tenantId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setRegistration(data.config?.registration || null) })
    return () => { cancelled = true }
  }, [tenantId])
  const registrationClosed = isRegistrationClosed(registration)

  const groupedGrades = useMemo(() => {
    const acc = {}
    for (const g of gradesList || []) {
      const stageName = lang === 'ar'
        ? g.stageName
        : (g.stageId === 'preparatory' ? 'Preparatory' : g.stageId === 'secondary' ? 'Secondary' : g.stageId === 'primary' ? 'Primary' : g.stageId === 'baccalaureate' ? 'Egyptian Baccalaureate' : g.stageId)
      if (!acc[stageName]) acc[stageName] = []
      acc[stageName].push(g)
    }
    return acc
  }, [gradesList, lang])

  // Branches: a single branch is chosen for the student (there is nothing to
  // get wrong); with several, the student has to pick one.
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error: err } = await supabase.rpc('get_public_branches', { p_tenant_id: tenantId })
        if (err) throw err
        if (cancelled) return
        setBranches(data || [])
        setBranchId(data && data.length === 1 ? data[0].id : '')
      } catch (err) {
        console.error('Failed to load branches for registration:', err)
      }
    })()
    return () => { cancelled = true }
  }, [tenantId])

  // Groups follow the chosen stage and branch. A previously picked group that
  // no longer fits is cleared, never silently kept.
  useEffect(() => {
    if (!tenantId || !grade) { setGroups([]); setGroupId(''); return }
    let cancelled = false
    setGroupsLoading(true)
    ;(async () => {
      try {
        const { data, error: err } = await supabase.rpc('get_public_groups', { p_tenant_id: tenantId, p_grade: grade })
        if (err) throw err
        if (cancelled) return
        const list = data || []
        setGroups(list)
        setGroupId((prev) => (list.some((g) => g.id === prev && (!g.branch_id || g.branch_id === branchId)) ? prev : ''))
      } catch (err) {
        console.error('Failed to load groups for registration:', err)
      } finally {
        if (!cancelled) setGroupsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tenantId, grade, branchId])

  const groupsForBranch = useMemo(
    () => groups.filter((g) => !g.branch_id || g.branch_id === branchId),
    [groups, branchId]
  )

  const steps = useMemo(() => {
    const list = ['name', 'phone', 'phoneConfirm', 'parent', 'parentConfirm', 'stage', 'type']
    if (branches.length > 1) list.push('branch')
    if (enrollmentType && enrollmentType !== 'ONLINE' && groupsForBranch.length > 0) list.push('group')
    list.push('password', 'review')
    return list
  }, [branches.length, enrollmentType, groupsForBranch.length])

  const stepIndex = Math.max(0, steps.indexOf(stepKey))

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [stepKey])

  const handle = normalizeHandle(phone)
  const parentHandle = normalizeHandle(parentPhone)

  const validate = (key) => {
    switch (key) {
      case 'name': return name.trim().length < 3 ? t.errName : null
      case 'phone': return isValidHandle(handle) ? null : t.errPhone
      case 'parent':
        if (parentHandle.length < 8) return t.errParent
        if (parentHandle === handle) return t.errParentSame
        return null
      case 'stage': return grade ? null : t.errStage
      case 'type': return enrollmentType ? null : t.errType
      case 'branch': return branches.length > 1 && !branchId ? t.errBranch : null
      case 'group':
        return enrollmentType !== 'ONLINE' && groupsForBranch.length > 0 && !groupId ? t.errGroup : null
      case 'password':
        if (password.length < 6) return t.errPasswordShort
        if (password !== confirmPassword) return t.errPasswordMatch
        return null
      default: return null
    }
  }

  const firstInvalid = () => steps.find((k) => INPUT_STEPS.includes(k) && validate(k)) || null

  const goNext = () => {
    const err = validate(stepKey)
    if (err) { setError(err); return }
    setError('')
    // A typed number always goes through its confirmation screen, even when
    // it was edited from the review page — that screen is the point.
    if (stepKey === 'phone') { setStepKey('phoneConfirm'); return }
    if (stepKey === 'parent') { setStepKey('parentConfirm'); return }
    if (returnToReview) {
      // Changing an answer can make a later one invalid (a new stage clears
      // the group): send the student there before going back to the review.
      const bad = firstInvalid()
      setStepKey(bad || 'review')
      if (!bad) setReturnToReview(false)
      return
    }
    const next = steps[stepIndex + 1]
    if (next) setStepKey(next)
  }

  const goBack = () => {
    setError('')
    if (stepIndex > 0) setStepKey(steps[stepIndex - 1])
  }

  const editStep = (key) => {
    setError('')
    setReturnToReview(true)
    setStepKey(key)
  }

  const handleSubmit = async () => {
    const bad = firstInvalid()
    if (bad) { setStepKey(bad); setError(validate(bad)); return }
    setLoading(true)
    setError('')
    const isOnline = enrollmentType === 'ONLINE'
    const selectedGroup = !isOnline ? groupsForBranch.find((g) => g.id === groupId) : null
    try {
      const { data: parentIsUser, error: checkError } = await supabase.rpc('check_student_phone_exists', {
        p_phone: parentHandle,
        p_tenant_id: tenantId,
      })
      if (checkError) throw checkError
      if (parentIsUser) throw new Error(t.errParentIsUser)

      const response = await authAPI.register(
        name.trim(),
        handle,
        password,
        tenantId,
        grade,
        parentHandle,
        enrollmentType,
        branchId || null,
        selectedGroup?.id || null,
        selectedGroup?.name || null
      )
      if (!response.user) throw new Error('Invalid response from server')
      setResult({ handle, token: response.token, user: response.user })
      setStepKey('done')
    } catch (err) {
      console.error('Registration error:', err)
      setError(err.message || t.errGeneric)
    } finally {
      setLoading(false)
    }
  }

  // The app login happens here, not straight after sign-up: /register sends
  // logged-in users away, which would take the screenshot card with it.
  const enterPlatform = () => {
    if (!result?.token) { navigate('/login'); return }
    login(result.token, result.user)
    const pendingPkg = localStorage.getItem('pendingCheckoutPkgId')
    if (pendingPkg) {
      localStorage.removeItem('pendingCheckoutPkgId')
      window.location.href = '/shop?packageId=' + pendingPkg
    } else {
      window.location.href = '/'
    }
  }

  const gradeName = (gradesList || []).find((g) => g.id === grade)?.name || ''
  const typeLabel = { CENTER: t.typeCenter, ONLINE: t.typeOnline, HYBRID: t.typeHybrid }[enrollmentType] || ''
  const branchName = branches.find((b) => b.id === branchId)?.name || ''
  const groupName = groupsForBranch.find((g) => g.id === groupId)?.name || ''
  // Until a stage's groups arrive we cannot know whether a group step exists.
  const waitingForGroups = groupsLoading && ['stage', 'type', 'branch'].includes(stepKey)
  const isConfirmStep = stepKey === 'phoneConfirm' || stepKey === 'parentConfirm'

  const renderNumberConfirm = (value, label, question, hint) => (
    <>
      <h2 className="rw-question">{question}</h2>
      <p className="rw-hint">{hint}</p>
      <div className="rw-confirm">
        <div className="rw-confirm-label">{label}</div>
        <div className="rw-confirm-value">{spacedNumber(value)}</div>
      </div>
      {isDigitsOnly(value) && !looksLikeEgyptianMobile(value) && (
        <div className="rw-warn" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{t.warnNotMobile}</span>
        </div>
      )}
    </>
  )

  const renderStep = () => {
    switch (stepKey) {
      case 'name':
        return (
          <>
            <h2 className="rw-question">{t.qName}</h2>
            <p className="rw-hint">{t.hName}</p>
            <input className="rw-input" autoFocus name="reg_student_name" autoComplete="off"
              value={name} onChange={(e) => setName(e.target.value)} placeholder={t.phName} />
          </>
        )
      case 'phone':
        return (
          <>
            <h2 className="rw-question">{t.qPhone}</h2>
            <p className="rw-hint">{t.hPhone}</p>
            <input className="rw-input is-ltr" autoFocus name="reg_student_phone" dir="ltr"
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck="false"
              value={phone} onChange={(e) => setPhone(normalizeHandle(e.target.value))} placeholder="01xxxxxxxxx" />
          </>
        )
      case 'phoneConfirm':
        return renderNumberConfirm(handle, isDigitsOnly(handle) ? t.phoneLabel : t.codeLabel, t.qPhoneConfirm, t.hPhoneConfirm)
      case 'parent':
        return (
          <>
            <h2 className="rw-question">{t.qParent}</h2>
            <p className="rw-hint">{t.hParent}</p>
            <input className="rw-input is-ltr" autoFocus name="reg_parent_phone" dir="ltr" type="tel"
              autoComplete="off" value={parentPhone} onChange={(e) => setParentPhone(normalizeHandle(e.target.value))}
              placeholder="01xxxxxxxxx" />
          </>
        )
      case 'parentConfirm':
        return renderNumberConfirm(parentHandle, t.parentLabel, t.qParentConfirm, t.hParentConfirm)
      case 'stage':
        return (
          <>
            <h2 className="rw-question">{t.qStage}</h2>
            <p className="rw-hint">{t.hStage}</p>
            {Object.entries(groupedGrades).map(([stageName, list]) => (
              <div key={stageName}>
                {Object.keys(groupedGrades).length > 1 && <div className="rw-stage-title">{stageName}</div>}
                <div className="rw-choices">
                  {list.map((g) => (
                    <Choice key={g.id} selected={grade === g.id} onClick={() => { setGrade(g.id); setError('') }} label={g.name} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )
      case 'type':
        return (
          <>
            <h2 className="rw-question">{t.qType}</h2>
            <div className="rw-choices">
              <Choice selected={enrollmentType === 'CENTER'} onClick={() => { setEnrollmentType('CENTER'); setError('') }} icon="🏫" label={t.typeCenter} sub={t.typeCenterSub} />
              <Choice selected={enrollmentType === 'ONLINE'} onClick={() => { setEnrollmentType('ONLINE'); setError('') }} icon="💻" label={t.typeOnline} sub={t.typeOnlineSub} />
              <Choice selected={enrollmentType === 'HYBRID'} onClick={() => { setEnrollmentType('HYBRID'); setError('') }} icon="🔁" label={t.typeHybrid} sub={t.typeHybridSub} />
            </div>
          </>
        )
      case 'branch':
        return (
          <>
            <h2 className="rw-question">{t.qBranch}</h2>
            <p className="rw-hint">{t.hBranch}</p>
            <div className="rw-choices">
              {branches.map((b) => (
                <Choice key={b.id} selected={branchId === b.id} onClick={() => { setBranchId(b.id); setError('') }} icon="📍" label={b.name} />
              ))}
            </div>
          </>
        )
      case 'group':
        return (
          <>
            <h2 className="rw-question">{t.qGroup}</h2>
            <p className="rw-hint">{t.hGroup}</p>
            <div className="rw-choices">
              {groupsForBranch.map((g) => (
                <Choice key={g.id} selected={groupId === g.id} onClick={() => { setGroupId(g.id); setError('') }} icon="👥" label={g.name} />
              ))}
            </div>
          </>
        )
      case 'password':
        return (
          <>
            <h2 className="rw-question">{t.qPassword}</h2>
            <p className="rw-hint">{t.hPassword}</p>
            <div className="rw-pw">
              <input className="rw-input" autoFocus type={showPassword ? 'text' : 'password'} name="reg_new_password"
                autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.phPassword} />
              <button type="button" className="rw-pw-toggle" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? t.hidePw : t.showPw}
              </button>
            </div>
            <input className="rw-input" type={showPassword ? 'text' : 'password'} name="reg_confirm_password"
              autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t.phConfirm} />
          </>
        )
      case 'review': {
        const rows = [
          { key: 'name', label: t.rName, value: name.trim() },
          { key: 'phone', label: t.rPhone, value: spacedNumber(handle), ltr: true },
          { key: 'parent', label: t.rParent, value: spacedNumber(parentHandle), ltr: true },
          { key: 'stage', label: t.rStage, value: gradeName },
          { key: 'type', label: t.rType, value: typeLabel },
          ...(branches.length > 1 ? [{ key: 'branch', label: t.rBranch, value: branchName }] : []),
          ...(steps.includes('group') ? [{ key: 'group', label: t.rGroup, value: groupName }] : []),
          { key: 'password', label: t.rPassword, value: '••••••', ltr: true },
        ]
        return (
          <>
            <h2 className="rw-question">{t.qReview}</h2>
            <p className="rw-hint">{t.hReview}</p>
            <ul className="rw-review">
              {rows.map((r) => (
                <li key={r.key}>
                  <span className="rw-review-label">{r.label}</span>
                  <span className={`rw-review-value ${r.ltr ? 'is-ltr' : ''}`}>{r.value || '—'}</span>
                  <button type="button" className="rw-review-edit" onClick={() => editStep(r.key)} disabled={loading}>{t.edit}</button>
                </li>
              ))}
            </ul>
          </>
        )
      }
      default:
        return null
    }
  }

  const renderWizard = () => (
    <form
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault()
        if (loading || waitingForGroups) return
        if (stepKey === 'review') handleSubmit()
        else goNext()
      }}
    >
      <div className="rw-progress">
        <div className="rw-progress-label">
          <span>{t.eyebrow}</span>
          <span>{t.stepOf(stepIndex + 1, steps.length)}</span>
        </div>
        <div className="rw-progress-track">
          <div className="rw-progress-fill" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {renderStep()}

      {error && <div className="rw-error" role="alert">{error}</div>}

      <div className="rw-actions">
        {isConfirmStep ? (
          <button type="button" className="rw-btn-secondary"
            onClick={() => { setError(''); setStepKey(stepKey === 'phoneConfirm' ? 'phone' : 'parent') }}>
            {t.noEdit}
          </button>
        ) : (
          stepIndex > 0 && (
            <button type="button" className="rw-btn-secondary" onClick={goBack} disabled={loading}>
              {t.back}
            </button>
          )
        )}
        <button type="submit" className="modern-btn" disabled={loading || waitingForGroups}>
          <span className="btn-text">
            {waitingForGroups
              ? t.loadingGroups
              : stepKey === 'review'
                ? (loading ? t.submitting : t.submit)
                : isConfirmStep ? t.yesCorrect : t.next}
          </span>
          {loading && <span className="btn-loader"><span className="spinner"></span></span>}
        </button>
      </div>

      <div className="rw-link-row">
        <span>{t.haveAccount}</span>
        <Link to="/login">{t.loginLink}</Link>
      </div>
    </form>
  )

  const renderDone = () => (
    <div className="rw-done">
      <div className="rw-done-emoji" aria-hidden="true">🎉</div>
      <h2 className="rw-question">{t.doneTitle}</h2>
      <p className="rw-hint">{t.doneSub}</p>
      <div className="rw-credentials">
        <div className="rw-cred-heading">{t.yourLogin}</div>
        <div className="rw-cred-row">
          <div className="rw-cred-label">{t.rPhone}</div>
          <div className="rw-cred-value">{spacedNumber(result.handle)}</div>
        </div>
        <div className="rw-cred-row">
          <div className="rw-cred-label">{t.rPassword}</div>
          <div className="rw-cred-value">{showResultPassword ? password : '••••••'}</div>
          <button type="button" className="rw-reveal-btn" onClick={() => setShowResultPassword((v) => !v)}>
            {showResultPassword ? t.hidePw : t.showPw}
          </button>
        </div>
      </div>
      <p className="rw-shot-hint">{t.screenshotHint}</p>
      <button type="button" className="modern-btn" onClick={enterPlatform}>
        <span className="btn-text">{t.enterPlatform}</span>
      </button>
    </div>
  )

  const renderClosed = () => (
    <div className="rw-done">
      <div className="rw-done-emoji" aria-hidden="true">🔒</div>
      <h2 className="rw-question">{t.closedTitle}</h2>
      <p className="rw-hint">{t.closedSub}</p>
      <Link to="/login" className="modern-btn" style={{ textDecoration: 'none' }}>
        <span className="btn-text">{t.closedLogin}</span>
      </Link>
    </div>
  )

  return (
    <div className={`aa-page ${theme} ${themeConfig.themeClass || ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <header className="aa-nav">
        <div className="aa-nav-inner">
          <div className="aa-brand">
            <img src={brandLogo} alt="Logo" className="aa-brand-logo" />
            <span className="aa-brand-name">{brandShort}</span>
          </div>
          <div className="aa-nav-actions">
            <button onClick={toggleTheme} className="aa-icon-btn" aria-label="theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button onClick={() => switchLang(lang === 'ar' ? 'en' : 'ar')} className="aa-icon-btn aa-lang">
              🌐 <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>
            <Link to="/login" className="aa-btn aa-btn-ghost">{lang === 'ar' ? 'تسجيل الدخول' : 'Sign In'}</Link>
          </div>
        </div>
      </header>

      <main className="register-page-wrapper" style={{ minHeight: 'calc(100vh - 64px)' }}>
        <div className="register-constellation" />
        <div className="register-container">
          <section className="register-form-col">
            {stepKey === 'done' && result
              ? renderDone()
              : registrationClosed
                ? renderClosed()
                : renderWizard()}
          </section>

          <section className="register-portrait-col">
            <div className="register-portrait-img-wrap">
              <img src={teacherImageBase} alt={teacherName} className="register-portrait-img" />
              <div className="register-portrait-gradient" />
            </div>
            <div className="register-teacher-info">
              <span className="register-teacher-badge">{teacherKicker || (lang === 'ar' ? 'المعلم المعتمد' : 'Certified Teacher')}</span>
              <h3 className="register-teacher-name">{teacherName}</h3>
              <p className="register-teacher-role">{teacherRole}</p>
              {(teacherExp || teacherStudents || teacherTargetStage) && (
                <div className="register-teacher-stats">
                  {teacherExp && (
                    <div className="register-stat-item">
                      <div className="register-stat-label">{lang === 'ar' ? 'الخبرة' : 'Experience'}</div>
                      <div className="register-stat-value">{teacherExp}</div>
                    </div>
                  )}
                  {teacherStudents && (
                    <div className="register-stat-item">
                      <div className="register-stat-label">{lang === 'ar' ? 'الطلاب المستفيدين' : 'Students taught'}</div>
                      <div className="register-stat-value">{teacherStudents}</div>
                    </div>
                  )}
                  {teacherTargetStage && (
                    <div className="register-stat-item">
                      <div className="register-stat-label">{teacherTargetStageLabel}</div>
                      <div className="register-stat-value">{teacherTargetStage}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

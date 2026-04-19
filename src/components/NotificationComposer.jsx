import React, { useMemo, useState } from 'react'
import { sendNotification } from '../services/notifications'
import './NotificationComposer.css'

/* ──────────────────────────────────────────────────────────────
   Mock student/group/prep data — same shape as Report.jsx so
   it can be swapped for the real API later.
   ────────────────────────────────────────────────────────────── */

const PREPS = [
  { id: 'first',  ar: 'الصف الأول الإعدادي'  },
  { id: 'second', ar: 'الصف الثاني الإعدادي' },
  { id: 'third',  ar: 'الصف الثالث الإعدادي' },
]

const GROUPS = {
  first:  ['1A', '1B', '1C'],
  second: ['2A', '2B'],
  third:  ['3A', '3B', '3C'],
}

const STUDENTS = [
  { id: 's101', name: 'أحمد محمد علي',     prep: 'first',  group: '1A' },
  { id: 's102', name: 'يوسف خالد إبراهيم', prep: 'first',  group: '1A' },
  { id: 's103', name: 'مريم سامي',         prep: 'first',  group: '1B' },
  { id: 's104', name: 'سارة عبدالله',      prep: 'first',  group: '1C' },
  { id: 's201', name: 'حسن طارق',          prep: 'second', group: '2A' },
  { id: 's202', name: 'منى رضا',           prep: 'second', group: '2B' },
  { id: 's203', name: 'كريم وائل',         prep: 'second', group: '2A' },
  { id: 's301', name: 'ليلى مصطفى',        prep: 'third',  group: '3A' },
  { id: 's302', name: 'عمر شريف',          prep: 'third',  group: '3B' },
  { id: 's303', name: 'هند سعيد',          prep: 'third',  group: '3C' },
]

const KIND_OPTIONS = [
  { v: 'message', icon: 'fa-envelope',    label: 'رسالة عامة', color: '#667eea' },
  { v: 'video',   icon: 'fa-circle-play', label: 'فيديو',      color: '#4facfe' },
  { v: 'lecture', icon: 'fa-book',        label: 'محاضرة',     color: '#43e97b' },
  { v: 'exam',    icon: 'fa-file-alt',    label: 'امتحان',     color: '#ed8936' },
  { v: 'grade',   icon: 'fa-award',       label: 'نتيجة',      color: '#f5576c' },
]

export default function NotificationComposer({ onClose, onSent }) {
  const [scope, setScope] = useState('all')      // all | prep | group | students
  const [prep, setPrep] = useState('first')
  const [group, setGroup] = useState('1A')
  const [picked, setPicked] = useState([])
  const [studentQuery, setStudentQuery] = useState('')
  const [kind, setKind] = useState('message')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  // keep group in sync with prep
  const groupOptions = GROUPS[prep] || []

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase()
    if (!q) return STUDENTS
    return STUDENTS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q)
    )
  }, [studentQuery])

  const togglePick = (id) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  const buildTarget = () => {
    if (scope === 'all')   return { type: 'all' }
    if (scope === 'prep')  return { type: 'prep',  value: prep }
    if (scope === 'group') return { type: 'group', value: group }
    return { type: 'students', value: picked }
  }

  const recipientCount = () => {
    if (scope === 'all')   return STUDENTS.length
    if (scope === 'prep')  return STUDENTS.filter((s) => s.prep === prep).length
    if (scope === 'group') return STUDENTS.filter((s) => s.group === group).length
    return picked.length
  }

  const canSend =
    title.trim().length > 0 &&
    (scope !== 'students' || picked.length > 0)

  const submit = (e) => {
    e.preventDefault()
    if (!canSend) return
    sendNotification({
      kind,
      title: title.trim(),
      body: body.trim(),
      target: buildTarget(),
      fromAdmin: true,
    })
    onSent?.()
  }

  const kindMeta = KIND_OPTIONS.find((k) => k.v === kind)

  return (
    <div className="nc-overlay" onClick={onClose}>
      <form className="nc-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="nc-head">
          <div className="nc-head-icon" style={{ background: kindMeta.color }}>
            <i className="fas fa-paper-plane"></i>
          </div>
          <div>
            <h3>إرسال إشعار جديد</h3>
            <p>اكتب رسالتك واختر من سيستقبلها</p>
          </div>
          <button type="button" className="nc-close" onClick={onClose} aria-label="إغلاق">
            <i className="fas fa-times"></i>
          </button>
        </header>

        <div className="nc-body">
          {/* kind */}
          <section className="nc-section">
            <label className="nc-label"><i className="fas fa-shapes"></i> نوع الإشعار</label>
            <div className="nc-kinds">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={`nc-kind ${kind === k.v ? 'active' : ''}`}
                  style={kind === k.v ? { borderColor: k.color, background: k.color + '14', color: k.color } : null}
                  onClick={() => setKind(k.v)}
                >
                  <i className={`fas ${k.icon}`}></i> {k.label}
                </button>
              ))}
            </div>
          </section>

          {/* scope */}
          <section className="nc-section">
            <label className="nc-label"><i className="fas fa-bullseye"></i> المستلمون</label>
            <div className="nc-scopes">
              <button type="button" className={`nc-scope ${scope==='all'?'active':''}`}      onClick={()=>setScope('all')}>
                <i className="fas fa-globe"></i><span>الجميع</span>
              </button>
              <button type="button" className={`nc-scope ${scope==='prep'?'active':''}`}     onClick={()=>setScope('prep')}>
                <i className="fas fa-graduation-cap"></i><span>مرحلة</span>
              </button>
              <button type="button" className={`nc-scope ${scope==='group'?'active':''}`}    onClick={()=>setScope('group')}>
                <i className="fas fa-layer-group"></i><span>مجموعة</span>
              </button>
              <button type="button" className={`nc-scope ${scope==='students'?'active':''}`} onClick={()=>setScope('students')}>
                <i className="fas fa-users"></i><span>طلاب محددون</span>
              </button>
            </div>

            {scope === 'prep' && (
              <div className="nc-pickers">
                {PREPS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`nc-chip ${prep===p.id?'active':''}`}
                    onClick={() => setPrep(p.id)}
                  >
                    {p.ar}
                  </button>
                ))}
              </div>
            )}

            {scope === 'group' && (
              <>
                <div className="nc-pickers">
                  {PREPS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`nc-chip nc-chip-sm ${prep===p.id?'active':''}`}
                      onClick={() => { setPrep(p.id); setGroup((GROUPS[p.id] || [])[0] || '') }}
                    >
                      {p.ar}
                    </button>
                  ))}
                </div>
                <div className="nc-pickers">
                  {groupOptions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`nc-chip ${group===g?'active':''}`}
                      onClick={() => setGroup(g)}
                    >
                      <i className="fas fa-layer-group"></i> {g}
                    </button>
                  ))}
                </div>
              </>
            )}

            {scope === 'students' && (
              <div className="nc-students">
                <div className="nc-search">
                  <i className="fas fa-search"></i>
                  <input
                    type="text"
                    placeholder="ابحث باسم الطالب أو الكود..."
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                  />
                </div>
                <ul className="nc-stu-list">
                  {filteredStudents.map((s) => {
                    const on = picked.includes(s.id)
                    return (
                      <li
                        key={s.id}
                        className={on ? 'on' : ''}
                        onClick={() => togglePick(s.id)}
                      >
                        <span className="nc-stu-check">
                          {on
                            ? <i className="fas fa-check-square"></i>
                            : <i className="far fa-square"></i>}
                        </span>
                        <span className="nc-stu-name">{s.name}</span>
                        <span className="nc-stu-id">#{s.id}</span>
                        <span className="nc-stu-meta">
                          {PREPS.find((p)=>p.id===s.prep)?.ar} · {s.group}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {picked.length > 0 && (
                  <div className="nc-picked">
                    <span>تم اختيار {picked.length} طالب</span>
                    <button type="button" onClick={() => setPicked([])}>مسح الاختيار</button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* message */}
          <section className="nc-section">
            <label className="nc-label"><i className="fas fa-heading"></i> العنوان</label>
            <input
              type="text"
              className="nc-input"
              placeholder="مثال: تم نشر فيديو جديد"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
            />
          </section>

          <section className="nc-section">
            <label className="nc-label"><i className="fas fa-align-right"></i> الرسالة</label>
            <textarea
              className="nc-textarea"
              rows="4"
              placeholder="اكتب نص الإشعار الذي سيظهر للطالب..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
            />
            <div className="nc-counter">{body.length} / 500</div>
          </section>

          {/* preview */}
          <section className="nc-section nc-preview-section">
            <label className="nc-label"><i className="fas fa-eye"></i> معاينة الإشعار</label>
            <div className="nc-preview">
              <div className="nc-preview-icon" style={{ background: kindMeta.color + '22', color: kindMeta.color }}>
                <i className={`fas ${kindMeta.icon}`}></i>
              </div>
              <div className="nc-preview-body">
                <strong>{title || 'عنوان الإشعار'}</strong>
                <p>{body || 'نص الرسالة سيظهر هنا...'}</p>
                <div className="nc-preview-meta">
                  <span><i className="fas fa-bullseye"></i> {recipientCount()} مستلم</span>
                  <span style={{ color: kindMeta.color }}><i className={`fas ${kindMeta.icon}`}></i> {kindMeta.label}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="nc-foot">
          <button type="button" className="nc-btn nc-btn-ghost" onClick={onClose}>إلغاء</button>
          <button type="submit" className="nc-btn nc-btn-primary" disabled={!canSend}>
            <i className="fas fa-paper-plane"></i> إرسال إلى {recipientCount()} مستلم
          </button>
        </footer>
      </form>
    </div>
  )
}

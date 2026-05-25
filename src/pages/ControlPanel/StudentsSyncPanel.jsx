import React, { useState, useEffect, useRef, useCallback } from 'react'
import { syncStudentsCsv } from '@backend/studentsSyncApi'
import { cached, invalidate as invalidateCache, LIST_TTL } from '../../utils/cache'

const GRADE_LABEL = {
  'first-prep':  'الأول الإعدادي',
  'second-prep': 'الثاني الإعدادي',
  'third-prep':  'الثالث الإعدادي',
}

// ── IndexedDB tiny helper for storing the FileSystemFileHandle ─────
const IDB_NAME = 'masar-cp'
const IDB_STORE = 'kv'

function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function idbGet(key) {
  try {
    const db = await idbOpen()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}

async function idbSet(key, value) {
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

async function idbDel(key) {
  try {
    const db = await idbOpen()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

const CSV_HANDLE_KEY = 'students-csv-handle'
const CSV_TEXT_KEY   = 'masar-students-csv-text'
const CSV_NAME_KEY   = 'masar-students-csv-name'

export default function StudentsSyncPanel() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)
  const [restored, setRestored] = useState(false)
  const fileHandleRef = useRef(null)
  const supportsFsAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window

  const reReadFromHandle = useCallback(async (handle, opts = {}) => {
    if (!handle) return null
    try {
      let perm = await handle.queryPermission?.({ mode: 'read' })
      if (perm !== 'granted' && opts.requestIfNeeded) {
        perm = await handle.requestPermission?.({ mode: 'read' })
      }
      if (perm !== 'granted') return null
      const file = await handle.getFile()
      const text = await file.text()
      setCsvText(text)
      setFileName(file.name)
      return text
    } catch { return null }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const txt = localStorage.getItem(CSV_TEXT_KEY)
        const name = localStorage.getItem(CSV_NAME_KEY)
        if (txt && !cancelled) {
          setCsvText(txt)
          setFileName(name || 'students.csv')
          setRestored(true)
        }
      } catch { /* ignore */ }
      if (supportsFsAccess) {
        const handle = await idbGet(CSV_HANDLE_KEY)
        if (handle && !cancelled) {
          fileHandleRef.current = handle
          await reReadFromHandle(handle, { requestIfNeeded: false })
        }
      }
    })()
    return () => { cancelled = true }
  }, [supportsFsAccess, reReadFromHandle])

  useEffect(() => {
    if (!supportsFsAccess) return
    const refresh = () => {
      const h = fileHandleRef.current
      if (h) reReadFromHandle(h, { requestIfNeeded: false })
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [supportsFsAccess, reReadFromHandle])

  useEffect(() => {
    try {
      if (csvText) {
        localStorage.setItem(CSV_TEXT_KEY, csvText)
        localStorage.setItem(CSV_NAME_KEY, fileName || 'students.csv')
      }
    } catch { /* quota — ignore */ }
  }, [csvText, fileName])

  const readFile = (file) => {
    if (!file) return
    setFileName(file.name)
    setError(null)
    setReport(null)
    setRestored(false)
    const reader = new FileReader()
    reader.onload = () => setCsvText(String(reader.result || ''))
    reader.onerror = () => setError('تعذر قراءة الملف')
    reader.readAsText(file, 'utf-8')
  }

  const pickWithFsAccess = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'CSV',
          accept: { 'text/csv': ['.csv'] },
        }],
        multiple: false,
        excludeAcceptAllOption: false,
      })
      if (!handle) return
      fileHandleRef.current = handle
      await idbSet(CSV_HANDLE_KEY, handle)
      const file = await handle.getFile()
      readFile(file)
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e.message || 'تعذر فتح الملف')
    }
  }

  const onFile = (e) => readFile(e.target.files?.[0])
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    readFile(e.dataTransfer.files?.[0])
  }
  const onDropZoneClick = (e) => {
    if (supportsFsAccess) {
      e.preventDefault()
      pickWithFsAccess()
    }
  }

  const clearFile = async () => {
    setCsvText(''); setFileName(''); setReport(null); setError(null); setRestored(false)
    fileHandleRef.current = null
    await idbDel(CSV_HANDLE_KEY)
    try {
      localStorage.removeItem(CSV_TEXT_KEY)
      localStorage.removeItem(CSV_NAME_KEY)
    } catch { /* ignore */ }
  }

  const run = async (apply) => {
    setError(null)
    let textToSend = csvText
    if (fileHandleRef.current) {
      const fresh = await reReadFromHandle(fileHandleRef.current, { requestIfNeeded: true })
      if (fresh) textToSend = fresh
    }
    if (!textToSend.trim()) { setError('اختر ملف الطلاب أولاً'); return }
    setBusy(true)
    try {
      const data = await syncStudentsCsv(textToSend, { apply })
      if (apply) invalidateCache('students')
      setReport(data)
    } catch (err) {
      setError(err.message || 'فشل الاتصال بالخادم')
    } finally {
      setBusy(false)
    }
  }

  const orphans = report?.orphans || []
  const willAdd = report?.ok || 0

  return (
    <section className="cp-panel sync-panel">
      <div className="cp-panel-head">
        <div>
          <h2><i className="fas fa-users"></i> مزامنة الطلاب</h2>
          <p className="cp-panel-sub">
            ارفع ملف الطلاب (Excel أو CSV). سنعرض لك التغييرات قبل التنفيذ،
            ثم تضغط «تطبيق» للحفظ.
          </p>
        </div>
      </div>

      <div className="sync-format">
        <div className="sync-format-head">
          <i className="fas fa-table-cells"></i>
          <span>تنسيق الملف — هكذا يجب أن يبدو في Excel</span>
          <span className="sync-format-hint">جميع الأعمدة مطلوبة</span>
        </div>

        <div className="sync-format-sheet-wrap">
          <table className="sync-format-sheet" dir="ltr">
            <thead>
              <tr>
                <th className="sync-format-rownum"></th>
                <th>name</th>
                <th>phone</th>
                <th>password</th>
                <th>grade</th>
                <th>group</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sync-format-rownum">1</td>
                <td>أحمد محمد</td>
                <td>01012345678</td>
                <td>123456</td>
                <td>first-prep</td>
                <td>السبت 4م</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sync-format-legend">
          <div className="sync-format-legend-item">
            <i className="fas fa-user"></i>
            <div>
              <code>name</code>
              <span>اسم الطالب</span>
            </div>
          </div>
          <div className="sync-format-legend-item">
            <i className="fas fa-phone"></i>
            <div>
              <code>phone</code>
              <span>رقم الهاتف (يُستخدم للدخول)</span>
            </div>
          </div>
          <div className="sync-format-legend-item">
            <i className="fas fa-key"></i>
            <div>
              <code>password</code>
              <span>كلمة المرور الأولية</span>
            </div>
          </div>
          <div className="sync-format-legend-item">
            <i className="fas fa-graduation-cap"></i>
            <div>
              <code>grade</code>
              <span>المرحلة الدراسية</span>
            </div>
          </div>
          <div className="sync-format-legend-item">
            <i className="fas fa-user-group"></i>
            <div>
              <code>group</code>
              <span>اسم المجموعة / الفصل</span>
            </div>
          </div>
        </div>

        <div className="sync-format-foot">
          <i className="fas fa-circle-info"></i>
          <span>
            القيم المسموحة لعمود <code>grade</code>:
            <code>first-prep</code> ، <code>second-prep</code> ، <code>third-prep</code>
          </span>
        </div>
      </div>

      {!fileName && (
        <label
          className={`sync-drop ${dragOver ? 'is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={onDropZoneClick}
        >
          <div className="sync-drop-icon"><i className="fas fa-file-csv"></i></div>
          <div className="sync-drop-title">اسحب ملف الطلاب هنا</div>
          <div className="sync-drop-sub">
            أو اضغط لاختيار ملف من جهازك
            {supportsFsAccess && ' — سيتم تذكّر الملف وتحديثه تلقائياً عند تعديله'}
          </div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
        </label>
      )}

      {fileName && (
        <div className="sync-file-chip">
          <i className="fas fa-file-csv sync-file-chip-icon"></i>
          <div className="sync-file-chip-meta">
            <div className="sync-file-chip-name">
              {fileName}
              {restored && (
                <span style={{
                  marginInlineStart: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(34, 197, 94, 0.14)',
                  color: '#16a34a',
                }}>
                  <i className="fas fa-rotate"></i> محفوظ تلقائياً
                </span>
              )}
            </div>
            <div className="sync-file-chip-sub">
              {fileHandleRef.current
                ? 'سيتم قراءة آخر تعديلات الملف تلقائياً عند المعاينة'
                : 'جاهز للمعاينة'}
            </div>
          </div>
          <button className="sync-file-chip-x" onClick={clearFile} title="إزالة الملف">
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      )}

      {fileName && !report && (
        <div className="sync-actions">
          <button
            className="sync-btn sync-btn-primary"
            onClick={() => run(false)}
            disabled={busy}
          >
            {busy
              ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التحقق...</>
              : <><i className="fas fa-magnifying-glass"></i> معاينة التغييرات</>}
          </button>
        </div>
      )}

      {error && (
        <div className="sync-alert sync-alert-error">
          <i className="fas fa-circle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      {report && (
        <div className="sync-report">
          <div className="sync-stats">
            <div className="sync-stat sync-stat-add">
              <div className="sync-stat-num">{willAdd}</div>
              <div className="sync-stat-lbl">
                {report.apply ? 'طالب تم تحديثه' : 'طالب سيُحفظ'}
              </div>
              <i className="fas fa-user-plus sync-stat-icon"></i>
            </div>
            <div className="sync-stat sync-stat-del">
              <div className="sync-stat-num">
                {report.apply ? report.deleted : orphans.length}
              </div>
              <div className="sync-stat-lbl">
                {report.apply ? 'طالب تم حذفه' : 'طالب سيُحذف'}
              </div>
              <i className="fas fa-user-minus sync-stat-icon"></i>
            </div>
            {(report.failed > 0 || report.skipped > 0) && (
              <div className="sync-stat sync-stat-warn">
                <div className="sync-stat-num">{report.failed + report.skipped}</div>
                <div className="sync-stat-lbl">سطور لم تُنفّذ</div>
                <i className="fas fa-triangle-exclamation sync-stat-icon"></i>
              </div>
            )}
          </div>

          {!report.apply && orphans.length > 0 && (
            <div className="sync-section">
              <h4 className="sync-section-title">
                <i className="fas fa-trash-can"></i>
                سيتم حذف هؤلاء الطلاب نهائيًا
              </h4>
              <ul className="sync-orphan-list">
                {orphans.map(o => (
                  <li key={o.id} className="sync-orphan-item">
                    <span className="sync-orphan-avatar">
                      {(o.name || '?').trim().charAt(0)}
                    </span>
                    <div className="sync-orphan-meta">
                      <div className="sync-orphan-name">{o.name}</div>
                      <div className="sync-orphan-phone" dir="ltr">{o.phone}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.apply && (
            <div className="sync-alert sync-alert-success">
              <i className="fas fa-circle-check"></i>
              <span>تمت المزامنة بنجاح. قاعدة البيانات الآن مطابقة للملف.</span>
            </div>
          )}

          {!report.apply && (
            <div className="sync-actions">
              <button
                className="sync-btn sync-btn-success"
                onClick={() => setConfirmApply(true)}
                disabled={busy}
              >
                {busy
                  ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التنفيذ...</>
                  : <><i className="fas fa-check"></i> تطبيق التغييرات</>}
              </button>
              <button
                className="sync-btn sync-btn-ghost"
                onClick={() => run(false)}
                disabled={busy}
                title="إعادة المعاينة"
              >
                <i className="fas fa-rotate"></i> إعادة الفحص
              </button>
            </div>
          )}
          {report.apply && (
            <div className="sync-actions">
              <button
                className="sync-btn sync-btn-primary"
                onClick={() => { setReport(null); run(false) }}
                disabled={busy}
                title="قراءة آخر تعديلات الملف وإظهار التغييرات الجديدة"
              >
                {busy
                  ? <><i className="fas fa-spinner fa-spin"></i> جارٍ التحقق...</>
                  : <><i className="fas fa-rotate"></i> إعادة الفحص</>}
              </button>
              <button className="sync-btn sync-btn-ghost" onClick={clearFile}>
                <i className="fas fa-arrow-rotate-left"></i> رفع ملف آخر
              </button>
            </div>
          )}
          {report.logs && report.logs.length > 0 && (
            <details className="sync-tech">
              <summary>تفاصيل تقنية ({report.logs.length} سجل)</summary>
              <div className="sync-tech-table-wrapper">
                <table className="sync-tech-table">
                  <thead>
                    <tr>
                      <th>الإجراء</th>
                      <th>الطالب</th>
                      <th>الجوال</th>
                      <th>المرحلة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.logs.map((logStr, i) => {
                      let action = 'معلومة';
                      let type = 'info';
                      let student = '—';
                      let phone = '—';
                      let grade = '—';
                      const cleanLog = logStr.trim();
                      let isUpsert = cleanLog.startsWith('would upsert:') || cleanLog.startsWith('ok:');
                      let isDelete = cleanLog.startsWith('would delete:') || cleanLog.startsWith('deleted:');

                      if (isUpsert) {
                        type = 'upsert';
                        action = cleanLog.startsWith('would') ? 'تجهيز للحفظ' : 'تم الحفظ';
                        
                        const prefixMatch = cleanLog.match(/^(?:would upsert|ok):\s*(.+)$/i);
                        if (prefixMatch) {
                          const rest = prefixMatch[1];
                          const parts = rest.split('→');
                          const leftPart = parts[0].trim();
                          const rightPart = parts[1] ? parts[1].trim() : '';
                          
                          const studentMatch = leftPart.match(/(.+?)\s*\(([^)]+)\)$/);
                          if (studentMatch) {
                            student = studentMatch[1].trim();
                            phone = studentMatch[2].trim();
                          } else {
                            student = leftPart;
                          }
                          
                          if (rightPart) {
                            const gradeOnly = rightPart.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
                            grade = GRADE_LABEL[gradeOnly] || gradeOnly;
                          }
                        } else {
                          student = cleanLog;
                        }
                      } else if (isDelete) {
                        type = 'delete';
                        action = cleanLog.startsWith('would') ? 'تجهيز للحفظ' : 'تم الحذف';
                        
                        const prefixMatch = cleanLog.match(/^(?:would delete|deleted):\s*(.+)$/i);
                        if (prefixMatch) {
                          const rest = prefixMatch[1];
                          const studentMatch = rest.match(/(.+?)\s*\(([^)]+)\)$/);
                          if (studentMatch) {
                            student = studentMatch[1].trim();
                            phone = studentMatch[2].trim();
                          } else {
                            student = rest;
                          }
                        } else {
                          student = cleanLog;
                        }
                      } else {
                        if (cleanLog.startsWith('skip:') || cleanLog.includes('fail')) {
                           type = 'delete';
                           action = 'خطأ';
                        }
                        student = cleanLog;
                      }

                      return (
                        <tr key={i} className={`sync-tr-${type}`}>
                          <td>
                            <span className={`sync-badge sync-badge-${type}`}>
                              {action}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{student}</td>
                          <td dir="ltr" style={{ textAlign: 'right', fontFamily: 'monospace' }}>{phone}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{grade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {confirmApply && (
        <div className="sync-confirm-backdrop" onClick={() => setConfirmApply(false)}>
          <div className="sync-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sync-confirm-icon"><i className="fas fa-triangle-exclamation"></i></div>
            <h3>تأكيد تطبيق التغييرات</h3>
            <p>
              سيتم حفظ <strong>{willAdd}</strong> طالبًا
              {orphans.length > 0 && <> وحذف <strong>{orphans.length}</strong> طالبًا غير موجود بالملف</>}.
              لا يمكن التراجع بعد التنفيذ.
            </p>
            <div className="sync-confirm-actions">
              <button className="sync-btn sync-btn-ghost" onClick={() => setConfirmApply(false)}>
                إلغاء
              </button>
              <button
                className="sync-btn sync-btn-success"
                onClick={() => { setConfirmApply(false); run(true) }}
              >
                <i className="fas fa-check"></i> نعم، نفّذ المزامنة
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

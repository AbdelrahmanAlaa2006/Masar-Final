import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
import { uploadAvatarImage, deleteR2Object } from '@backend/r2'
import { useAuth } from '../contexts/AuthContext'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const { refreshProfile } = useAuth()
  const [user, setUser] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      if (!u) { navigate('/login'); return }
      setUser(u)
      if (u.avatar_url) setAvatarUrl(u.avatar_url)

      // Fetch fresh profile data to get database fields (including created_at)
      refreshProfile().then((fresh) => {
        if (fresh) {
          setUser(fresh)
          if (fresh.avatar_url) setAvatarUrl(fresh.avatar_url)
        }
      }).catch(err => console.error('Failed to refresh profile on mount:', err))
    } catch {
      navigate('/login')
    }
  }, [navigate])

  const initial = (user?.name || 'U').trim().charAt(0).toUpperCase()
  const roleName = user?.role === 'admin' ? 'مشرف' : 'طالب'
  const isAdmin = user?.role === 'admin'

  // Map DB grade enum → Arabic label for display.
  const GRADE_LABEL = {
    'first-prep':  'الصف الأول الإعدادي',
    'second-prep': 'الصف الثاني الإعدادي',
    'third-prep':  'الصف الثالث الإعدادي',
    'first-sec':   'الصف الأول الثانوي',
    'second-sec':  'الصف الثاني الثانوي',
    'third-sec':   'الصف الثالث الثانوي',
  }
  const gradeLabel = GRADE_LABEL[user?.grade] || '—'
  const joinDate = (() => {
    if (!user?.created_at) return '12 مايو 2024'
    try {
      const d = new Date(user.created_at)
      const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ]
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
    } catch {
      return '12 مايو 2024'
    }
  })()

  const handleCopyId = () => {
    if (!user?.id) return
    navigator.clipboard.writeText(user.id)
    setSuccessMsg('تم نسخ معرّف المستخدم بنجاح')
    setTimeout(() => setSuccessMsg(''), 2200)
  }

  // Upload avatar
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    if (!file.type.startsWith('image/')) {
      setErrorMsg('يرجى اختيار صورة صالحة')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('حجم الصورة يجب أن لا يتجاوز 2 ميجابايت')
      return
    }

    setUploading(true)
    setErrorMsg('')

    // Snapshot the previous URL BEFORE we overwrite it so we can clean
    // up the orphan in R2 once the new image is safely persisted.
    const previousUrl = (user.avatar_url || '').split('?')[0] || null

    try {
      // Upload directly to Cloudflare R2 via the presigned-URL Edge
      // Function. The bucket is public, so we get back a stable
      // publicUrl we can store on the profile row.
      const { publicUrl } = await uploadAvatarImage(file)

      // Persist the bare URL on the row. The cache-buster lives only on
      // the in-memory copy so the new image renders immediately without
      // dirtying the DB value.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Best-effort cleanup of the previous avatar object so we don't
      // accumulate orphans in R2. Failure here is silent — the new
      // avatar is already in place.
      if (previousUrl && previousUrl !== publicUrl) {
        deleteR2Object({ url: previousUrl }).catch(() => {})
      }

      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(urlWithCacheBust)

      const updated = { ...user, avatar_url: urlWithCacheBust }
      sessionStorage.setItem('masar-user', JSON.stringify(updated))
      window.dispatchEvent(new Event('masar-user-updated'))
      setUser(updated)
      setSuccessMsg('تم تحديث الصورة بنجاح')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      console.error('Avatar upload error:', err)
      setErrorMsg('فشل رفع الصورة: ' + (err.message || 'خطأ غير معروف'))
    } finally {
      setUploading(false)
    }
  }

  // Remove avatar
  const handleRemoveAvatar = async () => {
    if (!avatarUrl) return
    setUploading(true)
    setErrorMsg('')

    // Snapshot for the post-update cleanup.
    const targetUrl = (user.avatar_url || avatarUrl || '').split('?')[0]

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)

      if (updateError) throw updateError

      // Delete the R2 object so we don't pay storage for an unreferenced
      // file. Best-effort; we don't block the UI on it.
      if (targetUrl) {
        deleteR2Object({ url: targetUrl }).catch(() => {})
      }

      setAvatarUrl(null)
      const updated = { ...user, avatar_url: null }
      sessionStorage.setItem('masar-user', JSON.stringify(updated))
      window.dispatchEvent(new Event('masar-user-updated'))
      setUser(updated)
      setSuccessMsg('تم حذف الصورة')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err) {
      setErrorMsg('فشل حذف الصورة')
    } finally {
      setUploading(false)
    }
  }

  if (!user) return null

  return (
    <div className="profile-page" dir="rtl">
      {/* Decorative background */}
      <div className="profile-bg-decor">
        <div className="profile-bg-blob profile-bg-blob--1" />
        <div className="profile-bg-blob profile-bg-blob--2" />
        <div className="profile-bg-blob profile-bg-blob--3" />
      </div>

      <div className="profile-container">
        {/* Cinematic Header Card */}
        <div className="profile-hero-card">
          <div className="profile-hero-bg" />
          <div className="profile-hero-content">
            {/* Avatar area */}
            <div className="profile-avatar-wrapper">
              <div className={`profile-avatar ${uploading ? 'is-uploading' : ''}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="صورة شخصية" className="profile-avatar-img" />
                ) : (
                  <span className="profile-avatar-letter">{initial}</span>
                )}
                <div className="profile-avatar-ring" />
                {uploading && (
                  <div className="profile-avatar-loader">
                    <div className="profile-spinner" />
                  </div>
                )}
              </div>
              
              {/* Floating Camera Edit FAB */}
              <button
                type="button"
                className="profile-avatar-fab profile-avatar-fab--upload"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="تغيير الصورة"
              >
                <i className="fas fa-camera" />
              </button>

              {/* Floating Trash Remove FAB */}
              {avatarUrl && (
                <button
                  type="button"
                  className="profile-avatar-fab profile-avatar-fab--remove"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  title="إزالة الصورة"
                >
                  <i className="fas fa-trash-can" />
                </button>
              )}
              
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                hidden
              />
            </div>

            <h1 className="profile-hero-name">{user.name}</h1>
            
            {/* Badges / Chips Row */}
            <div className="profile-hero-chips">
              {isAdmin ? (
                <span className="profile-chip profile-chip--admin">
                  <i className="fas fa-shield-halved" />
                  <span>{roleName}</span>
                </span>
              ) : (
                <span className="profile-chip profile-chip--student">
                  <i className="fas fa-graduation-cap" />
                  <span>{roleName}</span>
                </span>
              )}

              <span className="profile-chip profile-chip--active">
                <span className="profile-status-dot" />
                <span>نشط</span>
              </span>
            </div>

            {/* Meta Strip */}
            <div className="profile-meta-strip">
              <span><i className="fas fa-calendar" /> عضو منذ {joinDate}</span>
              <span className="profile-meta-sep">·</span>
              <span><i className="fas fa-globe" /> العربية</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="profile-toast profile-toast--success" role="status" aria-live="polite">
            <i className="fas fa-circle-check" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="profile-toast profile-toast--error" role="status" aria-live="polite">
            <i className="fas fa-circle-exclamation" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Info Cards 2-Column Grid */}
        <div className="profile-grid">
          {/* Personal info card — read-only */}
          <div className="profile-form-card">
            <h2 className="profile-card-title">
              <span className="profile-card-accent-bar" />
              <i className="fas fa-user" />
              <span>المعلومات الشخصية</span>
            </h2>

            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-user" />
                الاسم الكامل
              </span>
              <span className="profile-info-value">{user.name || '—'}</span>
            </div>

            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-phone" />
                رقم الهاتف
              </span>
              <span className="profile-info-value" dir="ltr">{user.phone || '—'}</span>
            </div>

            {/* Level / Stage — students see their grade. */}
            {!isAdmin && (
              <div className="profile-info-row">
                <span className="profile-info-label">
                  <i className="fas fa-graduation-cap" />
                  المرحلة الدراسية
                </span>
                <span className="profile-info-value">{gradeLabel}</span>
              </div>
            )}

            {/* Group / class */}
            {!isAdmin && (
              <div className="profile-info-row">
                <span className="profile-info-label">
                  <i className="fas fa-user-group" />
                  المجموعة
                </span>
                {user.group
                  ? <span className="profile-info-value">{user.group}</span>
                  : <span className="profile-coming-badge">قريبًا</span>}
              </div>
            )}
          </div>

          {/* Account info card */}
          <div className="profile-info-card">
            <h2 className="profile-card-title">
              <span className="profile-card-accent-bar" />
              <i className="fas fa-shield-halved" />
              <span>معلومات الحساب</span>
            </h2>
            
            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-user-shield" />
                نوع الحساب
              </span>
              <span className="profile-info-value profile-info-value--badge">{roleName}</span>
            </div>

            <div className="profile-info-row profile-info-row--copyable" onClick={handleCopyId} title="انقر لنسخ معرّف المستخدم">
              <span className="profile-info-label">
                <i className="fas fa-fingerprint" />
                معرّف المستخدم
              </span>
              <div className="profile-info-value-container">
                <span className="profile-info-value profile-info-value--mono">{user.id ? `${user.id.slice(0, 8)}...` : '—'}</span>
                <button type="button" className="profile-copy-btn" aria-label="نسخ المعرّف">
                  <i className="fas fa-copy" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
import { uploadAvatarImage, deleteR2Object } from '@backend/r2'
import './Profile.css'

export default function Profile() {
  const navigate = useNavigate()
  const fileRef = useRef(null)
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
  }
  const gradeLabel = GRADE_LABEL[user?.grade] || '—'

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
        {/* Header card */}
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
              <div className="profile-avatar-actions">
                <button
                  type="button"
                  className="profile-avatar-btn profile-avatar-btn--upload"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title="تغيير الصورة"
                >
                  <i className="fas fa-camera" />
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className="profile-avatar-btn profile-avatar-btn--remove"
                    onClick={handleRemoveAvatar}
                    disabled={uploading}
                    title="إزالة الصورة"
                  >
                    <i className="fas fa-trash-can" />
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                hidden
              />
            </div>

            <h1 className="profile-hero-name">{user.name}</h1>
            <span className="profile-hero-role">{roleName}</span>
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="profile-toast profile-toast--success">
            <i className="fas fa-circle-check" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="profile-toast profile-toast--error">
            <i className="fas fa-circle-exclamation" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Personal info card — read-only */}
        <div className="profile-form-card">
          <h2 className="profile-form-title">
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

          {/* Group / class — auto-flips from the "قريبًا" placeholder to
              the real value the moment the profiles row carries a `group`
              field. No code change needed when the CSV column gets wired:
              once `user.group` is populated, the badge disappears and the
              actual group label takes its place. */}
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
          <h2 className="profile-form-title">
            <i className="fas fa-shield-halved" />
            <span>معلومات الحساب</span>
          </h2>
          <div className="profile-info-row">
            <span className="profile-info-label">نوع الحساب</span>
            <span className="profile-info-value profile-info-value--badge">{roleName}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-label">معرّف المستخدم</span>
            <span className="profile-info-value profile-info-value--mono">{user.id?.slice(0, 8)}...</span>
          </div>
        </div>
      </div>
    </div>
  )
}

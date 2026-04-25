import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@backend/supabase'
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
      const u = JSON.parse(localStorage.getItem('masar-user'))
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

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${user.id}.${ext}`
      const filePath = `avatars/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Add cache-busting param
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`

      // Update profile in DB
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithCacheBust })
        .eq('id', user.id)

      if (updateError) throw updateError

      setAvatarUrl(urlWithCacheBust)

      // Update local storage
      const updated = { ...user, avatar_url: urlWithCacheBust }
      localStorage.setItem('masar-user', JSON.stringify(updated))
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

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', user.id)

      if (updateError) throw updateError

      setAvatarUrl(null)
      const updated = { ...user, avatar_url: null }
      localStorage.setItem('masar-user', JSON.stringify(updated))
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

          {/* Level Stage — Coming Soon (students only) */}
          {!isAdmin && (
            <div className="profile-info-row">
              <span className="profile-info-label">
                <i className="fas fa-graduation-cap" />
                المرحلة الدراسية
              </span>
              <span className="profile-coming-badge">قريبًا</span>
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

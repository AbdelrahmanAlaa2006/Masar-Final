import React, { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { listPlaylists, createPlaylist, updatePlaylist, deletePlaylist, addPlaylistItem, removePlaylistItem, reorderPlaylistItems } from '@backend/playlistsApi'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { notify } from '../../utils/notify'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

import { GRADE_LABEL as GRADE_LABELS } from './shared'

export default function PlaylistsPanel({ onBack, flash }) {
  const [playlists, setPlaylists] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Catalog data for adding items
  const [videos, setVideos] = useState([])
  const [exams, setExams] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)

  // UI state
  const [selectedPlaylist, setSelectedPlaylist] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null) // playlist object
  const [editPlaylistObj, setEditPlaylistObj] = useState(null) // playlist object

  // Form states (Playlist creation/edit)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)

  // Item catalog filters
  const [itemTypeFilter, setItemTypeFilter] = useState('all') // 'all' | 'video' | 'exam' | 'homework'
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await listPlaylists()
      setPlaylists(data)
      // If a playlist is selected, refresh its reference to show updated items
      if (selectedPlaylist) {
        const refreshed = data.find(p => p.id === selectedPlaylist.id)
        setSelectedPlaylist(refreshed || null)
      }
    } catch (err) {
      console.error(err)
      notify('تعذر تحميل قوائم التشغيل', 'danger')
    } finally {
      setLoading(false)
    }
  }

  const loadCatalog = async () => {
    if (catalogLoaded) return
    try {
      const [v, e, h] = await Promise.all([
        listVideos(),
        listExams({ lean: true }),
        listHomeworks()
      ])
      setVideos(v)
      setExams(e)
      setHomeworks(h)
      setCatalogLoaded(true)
    } catch (err) {
      console.error(err)
      notify('تعذر تحميل الفهارس لإضافة العناصر', 'danger')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (showAddItemModal) {
      loadCatalog()
    }
  }, [showAddItemModal])

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      notify('العنوان مطلوب', 'danger')
      return
    }

    setBusy(true)
    try {
      if (editPlaylistObj) {
        await updatePlaylist(editPlaylistObj.id, {
          title: title.trim(),
          description: description.trim() || null,
          sort_order: parseInt(sortOrder, 10) || 0,
          is_active: isActive
        })
        notify('تم تحديث قائمة التشغيل بنجاح! 🎉', 'success')
      } else {
        await createPlaylist({
          title: title.trim(),
          description: description.trim() || null,
          sort_order: parseInt(sortOrder, 10) || 0,
          is_active: isActive
        })
        notify('تم إنشاء قائمة التشغيل بنجاح! 🎉', 'success')
      }
      setShowCreateModal(false)
      setEditPlaylistObj(null)
      setTitle('')
      setDescription('')
      setSortOrder('0')
      setIsActive(true)
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل الحفظ: ' + err.message, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const openEditModal = (p, e) => {
    e?.stopPropagation()
    setEditPlaylistObj(p)
    setTitle(p.title)
    setDescription(p.description || '')
    setSortOrder(String(p.sort_order || 0))
    setIsActive(p.is_active)
    setShowCreateModal(true)
  }

  const openDeleteConfirm = (p, e) => {
    e?.stopPropagation()
    setShowDeleteConfirm(p)
  }

  const handlePerformDelete = async () => {
    if (!showDeleteConfirm) return
    try {
      await deletePlaylist(showDeleteConfirm.id)
      notify('تم حذف قائمة التشغيل بنجاح.', 'success')
      setShowDeleteConfirm(null)
      if (selectedPlaylist?.id === showDeleteConfirm.id) {
        setSelectedPlaylist(null)
      }
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل الحذف: ' + err.message, 'danger')
    }
  }

  const handleAddItem = async (contentType, contentId) => {
    if (!selectedPlaylist) return
    
    // Check duplicate
    const exists = (selectedPlaylist.playlist_items || []).some(
      item => item.content_type === contentType && item.content_id === contentId
    )
    if (exists) {
      notify('هذا العنصر مضاف بالفعل لقائمة التشغيل! ⚠️', 'warning')
      return
    }

    try {
      const nextOrder = (selectedPlaylist.playlist_items || []).length
      await addPlaylistItem({
        playlistId: selectedPlaylist.id,
        contentType,
        contentId,
        sortOrder: nextOrder
      })
      notify('تمت إضافة العنصر لقائمة التشغيل 🎉', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل الإضافة: ' + err.message, 'danger')
    }
  }

  const handleRemoveItem = async (itemId, e) => {
    e?.stopPropagation()
    try {
      await removePlaylistItem(itemId)
      notify('تمت إزالة العنصر من قائمة التشغيل', 'success')
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل الإزالة: ' + err.message, 'danger')
    }
  }

  const handleMoveItem = async (index, direction) => {
    if (!selectedPlaylist || !selectedPlaylist.playlist_items) return
    const items = [...selectedPlaylist.playlist_items]
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= items.length) return

    // Swap elements
    const temp = items[index]
    items[index] = items[targetIndex]
    items[targetIndex] = temp

    // Map new sort_orders
    const payload = items.map((item, idx) => ({
      id: item.id,
      sort_order: idx
    }))

    try {
      await reorderPlaylistItems(payload)
      loadData()
    } catch (err) {
      console.error(err)
      notify('تعذر تحديث الترتيب', 'danger')
    }
  }

  // Resolve the grade of the current items in the playlist (if any)
  const playlistGrade = useMemo(() => {
    if (!selectedPlaylist || !selectedPlaylist.playlist_items || selectedPlaylist.playlist_items.length === 0) {
      return null
    }
    for (const item of selectedPlaylist.playlist_items) {
      let match = null
      if (item.content_type === 'video') {
        match = videos.find(v => v.id === item.content_id)
      } else if (item.content_type === 'exam') {
        match = exams.find(e => e.id === item.content_id)
      } else if (item.content_type === 'homework') {
        match = homeworks.find(h => h.id === item.content_id)
      }
      if (match?.grade) {
        return match.grade
      }
    }
    return null
  }, [selectedPlaylist, videos, exams, homeworks])

  // Filter catalog items
  const filteredCatalog = useMemo(() => {
    const query = itemSearchQuery.toLowerCase().trim()
    const list = []

    const matchesGrade = (item) => {
      if (!playlistGrade) return true
      return item.grade === playlistGrade
    }

    if (itemTypeFilter === 'all' || itemTypeFilter === 'video') {
      videos.forEach(v => {
        if (matchesGrade(v) && (!query || v.title.toLowerCase().includes(query))) {
          list.push({ ...v, type: 'video', label: '🎬 فيديو' })
        }
      })
    }
    if (itemTypeFilter === 'all' || itemTypeFilter === 'exam') {
      exams.forEach(e => {
        if (matchesGrade(e) && (!query || e.title.toLowerCase().includes(query))) {
          list.push({ ...e, type: 'exam', label: '📝 امتحان' })
        }
      })
    }
    if (itemTypeFilter === 'all' || itemTypeFilter === 'homework') {
      homeworks.forEach(h => {
        if (matchesGrade(h) && (!query || h.title.toLowerCase().includes(query))) {
          list.push({ ...h, type: 'homework', label: '📚 واجب' })
        }
      })
    }
    return list
  }, [videos, exams, homeworks, itemTypeFilter, itemSearchQuery, playlistGrade])

  // Map item details for rendering in the active playlist
  const resolveItemDetails = (item) => {
    if (item.content_type === 'video') {
      const match = videos.find(v => v.id === item.content_id)
      return {
        title: match?.title || 'جاري تحميل تفاصيل الفيديو...',
        badge: '🎬 فيديو',
        badgeColor: '#6366f1'
      }
    } else if (item.content_type === 'exam') {
      const match = exams.find(e => e.id === item.content_id)
      return {
        title: match?.title || 'جاري تحميل تفاصيل الامتحان...',
        badge: '📝 امتحان',
        badgeColor: '#f59e0b'
      }
    } else if (item.content_type === 'homework') {
      const match = homeworks.find(h => h.id === item.content_id)
      return {
        title: match?.title || 'جاري تحميل تفاصيل الواجب...',
        badge: '📚 واجب',
        badgeColor: '#10b981'
      }
    }
    return { title: 'محتوى غير معروف', badge: '—', badgeColor: '#64748b' }
  }

  // Auto load catalog if playlists have items to resolve names correctly
  useEffect(() => {
    if (playlists.some(p => (p.playlist_items || []).length > 0)) {
      loadCatalog()
    }
  }, [playlists])

  return (
    <section className="cp-panel">
      {onBack && !selectedPlaylist && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      {selectedPlaylist && (
        <button className="cp-back" type="button" onClick={() => setSelectedPlaylist(null)}>
          <i className="fas fa-arrow-right"></i> العودة لقوائم التشغيل
        </button>
      )}

      <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2>
            <i className="fas fa-list-check" style={{ color: '#6366f1', marginInlineEnd: 8 }}></i>
            <span>{selectedPlaylist ? `إدارة عناصر: ${selectedPlaylist.title}` : 'إدارة قوائم التشغيل (Playlists)'}</span>
          </h2>
          <p>
            {selectedPlaylist
              ? 'أضف محاضرات، امتحانات، أو واجبات لهذه القائمة وقم بترتيب ترتيب عرضها للطلاب.'
              : 'قم بتنظيم محتويات المنصة في وحدات وفصول متكاملة تظهر للطالب بشكل منسق.'}
          </p>
        </div>

        {!selectedPlaylist && (
          <button
            onClick={() => {
              setEditPlaylistObj(null)
              setTitle('')
              setDescription('')
              setSortOrder('0')
              setIsActive(true)
              setShowCreateModal(true)
            }}
            className="cp-btn cp-btn-primary"
            style={{ background: 'var(--primary, #7c3aed)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <i className="fas fa-plus"></i>
            <span>إنشاء قائمة جديدة</span>
          </button>
        )}
      </div>

      <div className="cp-header-divider" />

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل قوائم التشغيل...</p>
        </div>
      ) : !selectedPlaylist ? (
        // Playlists Main Grid List
        playlists.length === 0 ? (
          <div className="cp-empty">
            <i className="fas fa-folder-open" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
            <h3>لا توجد قوائم تشغيل</h3>
            <p>ابدأ بإنشاء أول قائمة لتنظيم محاضراتك وامتحاناتك.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
            {playlists.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPlaylist(p)}
                style={{
                  background: 'var(--cp-card-bg, #fff)',
                  border: p.is_active ? '1px solid var(--border-light, #e2e8f0)' : '1px dashed #ef4444',
                  borderRadius: 16,
                  padding: 20,
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.01)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: 160
                }}
                className="cp-card-hover"
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-color)' }}>{p.title}</h3>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: p.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: p.is_active ? '#10b981' : '#ef4444',
                      fontWeight: 'bold'
                    }}>
                      {p.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: 1.4 }}>
                    {p.description || 'لا يوجد وصف لهذه القائمة.'}
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light, #f1f5f9)', paddingTop: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: '#6366f1', fontWeight: 'bold' }}>
                    <i className="fas fa-cubes"></i> {(p.playlist_items || []).length} عنصر مضاف
                  </span>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={(e) => openEditModal(p, e)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', padding: 4 }}
                      title="تعديل القائمة"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={(e) => openDeleteConfirm(p, e)}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                      title="حذف القائمة"
                    >
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // Playlist Items details list view
        <div>
          <div style={{ background: 'rgba(99,102,241,0.03)', border: '1px solid rgba(99,102,241,0.1)', borderRadius: 16, padding: 16, marginBottom: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-color)' }}>وصف القائمة:</h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--cp-text-muted)' }}>{selectedPlaylist.description || 'لا يوجد وصف.'}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>محتويات قائمة التشغيل ({(selectedPlaylist.playlist_items || []).length} عناصر)</h3>
            <button
              onClick={() => setShowAddItemModal(true)}
              className="cp-btn cp-btn-success"
              style={{ padding: '8px 16px', borderRadius: 12 }}
            >
              <i className="fas fa-plus"></i> إضافة عنصر للقائمة
            </button>
          </div>

          {(selectedPlaylist.playlist_items || []).length === 0 ? (
            <div className="cp-empty" style={{ background: 'var(--cp-card-bg)', border: '1px solid var(--border-light)' }}>
              <i className="fas fa-circle-exclamation" style={{ fontSize: '2.5rem', color: '#cbd5e1', marginBottom: 12 }}></i>
              <p>هذه القائمة فارغة حالياً. أضف عناصر لكي تظهر للطلاب.</p>
            </div>
          ) : (
            <div className="sync-tech-table-wrapper" style={{ borderRadius: 16, border: '1px solid var(--border-light, #e2e8f0)', background: 'var(--card-bg, #fff)', overflowX: 'auto' }}>
              <table className="sync-tech-table" style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: 'rgba(99, 102, 241, 0.04)' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'center', width: 60 }}>الترتيب</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>اسم العنصر</th>
                    <th style={{ padding: '14px 16px', textAlign: 'center', width: 120 }}>النوع</th>
                    <th style={{ padding: '14px 16px', textAlign: 'center', width: 180 }}>الإجراءات والترتيب</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlaylist.playlist_items.map((item, index) => {
                    const { title: itemTitle, badge, badgeColor } = resolveItemDetails(item)
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold' }}>{index + 1}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-color)' }}>{itemTitle}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.8rem',
                            padding: '3px 8px',
                            borderRadius: 8,
                            background: `${badgeColor}15`,
                            color: badgeColor,
                            fontWeight: 'bold'
                          }}>
                            {badge}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            onClick={() => handleMoveItem(index, -1)}
                            disabled={index === 0}
                            className="cp-btn cp-btn-ghost"
                            style={{ padding: 6, opacity: index === 0 ? 0.3 : 1 }}
                            title="تحريك لأعلى"
                          >
                            <i className="fas fa-chevron-up"></i>
                          </button>
                          
                          <button
                            onClick={() => handleMoveItem(index, 1)}
                            disabled={index === selectedPlaylist.playlist_items.length - 1}
                            className="cp-btn cp-btn-ghost"
                            style={{ padding: 6, opacity: index === selectedPlaylist.playlist_items.length - 1 ? 0.3 : 1 }}
                            title="تحريك لأسفل"
                          >
                            <i className="fas fa-chevron-down"></i>
                          </button>

                          <button
                            onClick={(e) => handleRemoveItem(item.id, e)}
                            className="cp-btn"
                            style={{
                              padding: '5px 10px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.15)',
                              borderRadius: 8,
                              fontSize: '0.75rem',
                              fontWeight: 'bold'
                            }}
                          >
                            <i className="fas fa-trash-can"></i> إزالة
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────── Create/Edit Playlist Modal ─────────── */}
      {showCreateModal && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)', borderRadius: '24px',
            border: '1px solid var(--border-color, rgba(99, 102, 241, 0.2))',
            padding: '32px', maxWidth: '500px', width: '100%',
            color: 'var(--text-color)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative', direction: 'rtl'
          }}>
            <button 
              onClick={() => { setShowCreateModal(false); setEditPlaylistObj(null); }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '20px' }}>
              {editPlaylistObj ? 'تعديل قائمة تشغيل' : 'إنشاء قائمة تشغيل جديدة'}
            </h3>

            <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>اسم قائمة التشغيل *</label>
                <input 
                  type="text" 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="مثال: الباب الأول - الكهربية التيار الكهربي" 
                  required
                  className="cp-input" 
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>وصف القائمة</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="اكتب وصفاً مختصراً للقائمة..." 
                  className="cp-input" 
                  style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)', minHeight: 80 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 'bold', marginBottom: '6px' }}>ترتيب العرض</label>
                  <input 
                    type="number" 
                    value={sortOrder} 
                    onChange={(e) => setSortOrder(e.target.value)} 
                    className="cp-input" 
                    style={{ width: '100%', padding: '12px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 'bold', cursor: 'pointer', marginTop: 24 }}>
                    <input 
                      type="checkbox" 
                      checked={isActive} 
                      onChange={(e) => setIsActive(e.target.checked)} 
                    />
                    <span>نشطة (تظهر للطلاب)</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <button
                  type="submit"
                  disabled={busy}
                  className="cp-btn cp-btn-primary"
                  style={{ flex: 1, padding: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                >
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                  <span>حفظ القائمة</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setEditPlaylistObj(null); }}
                  className="cp-btn cp-btn-secondary"
                  style={{ padding: '12px 24px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ─────────── Add Item to Playlist Modal ─────────── */}
      {showAddItemModal && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)', borderRadius: '24px',
            border: '1px solid var(--border-color, rgba(99, 102, 241, 0.2))',
            padding: '24px', maxWidth: '600px', width: '100%',
            color: 'var(--text-color)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative', direction: 'rtl', display: 'flex', flexDirection: 'column', maxHeight: '85vh'
          }}>
            <button 
              onClick={() => { setShowAddItemModal(false); setItemSearchQuery(''); }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px' }}>إضافة محتوى لقائمة التشغيل</h3>

            {playlistGrade && (
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                fontSize: '0.85rem',
                color: 'var(--text-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <i className="fas fa-filter" style={{ color: '#6366f1' }}></i>
                <span>تمت تصفية المحتوى لعرض عناصر <strong>{GRADE_LABELS[playlistGrade] || playlistGrade}</strong> فقط (تجنباً لدمج محتوى صفوف دراسية مختلفة في قائمة واحدة).</span>
              </div>
            )}

            {/* Filter controls */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <select
                value={itemTypeFilter}
                onChange={(e) => setItemTypeFilter(e.target.value)}
                className="cp-input"
                style={{ width: 140, padding: 8, borderRadius: 10, background: 'var(--card-bg)' }}
              >
                <option value="all">الكل</option>
                <option value="video">الفيديوهات</option>
                <option value="exam">الامتحانات</option>
                <option value="homework">الواجبات</option>
              </select>

              <input
                type="text"
                placeholder="ابحث باسم المحتوى..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="cp-input"
                style={{ flex: 1, padding: 8, borderRadius: 10, background: 'var(--card-bg)' }}
              />
            </div>

            {/* Catalog List */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
              {filteredCatalog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>لا يوجد محتوى مطابق للبحث</div>
              ) : (
                filteredCatalog.map(item => {
                  const isAdded = (selectedPlaylist.playlist_items || []).some(
                    pi => pi.content_type === item.type && pi.content_id === item.id
                  )
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: 'var(--cp-hover-bg, #fafafa)',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', color: '#6366f1', fontWeight: 'bold', marginInlineEnd: 10 }}>
                          {item.label}
                        </span>
                        <strong style={{ fontSize: '0.9rem' }}>{item.title}</strong>
                        {item.grade && (
                          <small style={{ color: 'var(--cp-text-muted)', display: 'block', marginTop: 4 }}>
                            الصف: {GRADE_LABELS[item.grade] || item.grade}
                          </small>
                        )}
                      </div>

                      <button
                        onClick={() => handleAddItem(item.type, item.id)}
                        disabled={isAdded}
                        className={`cp-btn ${isAdded ? 'cp-btn-secondary' : 'cp-btn-success'}`}
                        style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: 8 }}
                      >
                        {isAdded ? 'تمت الإضافة' : 'إضافة'}
                      </button>
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => { setShowAddItemModal(false); setItemSearchQuery(''); }}
                className="cp-btn cp-btn-secondary"
                style={{ padding: '8px 24px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && createPortal(
        <ConfirmDeleteDialog
          title="تأكيد حذف قائمة التشغيل"
          itemLabel={showDeleteConfirm.title}
          message="سيتم حذف قائمة التشغيل بالكامل. الفيديوهات والامتحانات بداخل القائمة لن تُحذف من النظام، ولكن سيتم تفكيك القائمة فحسب. لا يمكن التراجع عن هذا الإجراء."
          onCancel={() => setShowDeleteConfirm(null)}
          onConfirm={handlePerformDelete}
        />,
        document.body
      )}
    </section>
  )
}

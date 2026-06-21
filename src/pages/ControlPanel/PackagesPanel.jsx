import React, { useState, useEffect, useMemo } from 'react'
import { listPackages, createPackage, updatePackage, deletePackage } from '@backend/packagesApi'
import { listPlaylists } from '@backend/playlistsApi'
import { listVideos } from '@backend/videosApi'
import { listExams } from '@backend/examsApi'
import { listHomeworks } from '@backend/homeworksApi'
import { notify } from '../../utils/notify'
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog'

export default function PackagesPanel({ onBack, flash }) {
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Catalogs
  const [playlists, setPlaylists] = useState([])
  const [videos, setVideos] = useState([])
  const [exams, setExams] = useState([])
  const [homeworks, setHomeworks] = useState([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)

  // UI state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null) // package object
  const [editPackageObj, setEditPackageObj] = useState(null) // package object

  // Form states
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [thumbnail, setThumbnail] = useState('')
  const [selectedItems, setSelectedItems] = useState([]) // array of { item_type, item_id }

  // Catalog item add selectors in form
  const [currentAddType, setCurrentAddType] = useState('playlist')
  const [currentAddId, setCurrentAddId] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await listPackages()
      setPackages(data)
    } catch (err) {
      console.error(err)
      notify('تعذر تحميل الباقات', 'danger')
    } finally {
      setLoading(false)
    }
  }

  const loadCatalog = async () => {
    if (catalogLoaded) return
    try {
      const [p, v, e, h] = await Promise.all([
        listPlaylists(),
        listVideos(),
        listExams({ lean: true }),
        listHomeworks()
      ])
      setPlaylists(p)
      setVideos(v)
      setExams(e)
      setHomeworks(h)
      setCatalogLoaded(true)
    } catch (err) {
      console.error(err)
      notify('تعذر تحميل الفهارس للباقات', 'danger')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (showCreateModal) {
      loadCatalog()
    }
  }, [showCreateModal])

  // Select first item id when catalog loads or category changes
  useEffect(() => {
    if (!catalogLoaded) return
    if (currentAddType === 'playlist' && playlists.length > 0) setCurrentAddId(playlists[0].id)
    else if (currentAddType === 'video' && videos.length > 0) setCurrentAddId(videos[0].id)
    else if (currentAddType === 'exam' && exams.length > 0) setCurrentAddId(exams[0].id)
    else if (currentAddType === 'homework' && homeworks.length > 0) setCurrentAddId(homeworks[0].id)
    else setCurrentAddId('')
  }, [currentAddType, catalogLoaded, playlists, videos, exams, homeworks])

  const handleCreateOrUpdate = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      notify('عنوان الباقة مطلوب', 'danger')
      return
    }
    if (price === '' || parseFloat(price) < 0) {
      notify('يرجى تحديد سعر صالح (مثال: 150)', 'danger')
      return
    }

    setBusy(true)
    try {
      if (editPackageObj) {
        await updatePackage(editPackageObj.id, {
          title: title.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          is_active: isActive,
          thumbnail: thumbnail.trim() || null,
          items: selectedItems
        })
        notify('تم تحديث الباقة بنجاح! 🎉', 'success')
      } else {
        await createPackage({
          title: title.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          is_active: isActive,
          thumbnail: thumbnail.trim() || null,
          items: selectedItems
        })
        notify('تم إنشاء الباقة بنجاح! 🎉', 'success')
      }
      setShowCreateModal(false)
      setEditPackageObj(null)
      setTitle('')
      setDescription('')
      setPrice('')
      setThumbnail('')
      setIsActive(true)
      setSelectedItems([])
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل الحفظ: ' + err.message, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleAddItemToBundle = () => {
    if (!currentAddId) return
    const exists = selectedItems.some(i => i.item_type === currentAddType && i.item_id === currentAddId)
    if (exists) {
      notify('العنصر مضاف مسبقاً للباقة! ⚠️', 'warning')
      return
    }
    setSelectedItems(prev => [...prev, { item_type: currentAddType, item_id: currentAddId }])
  }

  const handleRemoveItemFromBundle = (type, id) => {
    setSelectedItems(prev => prev.filter(i => !(i.item_type === type && i.item_id === id)))
  }

  const openEditModal = (pkg, e) => {
    e?.stopPropagation()
    setEditPackageObj(pkg)
    setTitle(pkg.title)
    setDescription(pkg.description || '')
    setPrice(String(pkg.price))
    setThumbnail(pkg.thumbnail || '')
    setIsActive(pkg.is_active)
    setSelectedItems((pkg.package_items || []).map(pi => ({
      item_type: pi.item_type,
      item_id: pi.item_id
    })))
    setShowCreateModal(true)
  }

  const openDeleteConfirm = (pkg, e) => {
    e?.stopPropagation()
    setShowDeleteConfirm(pkg)
  }

  const handlePerformDelete = async () => {
    if (!showDeleteConfirm) return
    try {
      await deletePackage(showDeleteConfirm.id)
      notify('تم حذف الباقة بنجاح.', 'success')
      setShowDeleteConfirm(null)
      loadData()
    } catch (err) {
      console.error(err)
      notify('فشل حذف الباقة: ' + err.message, 'danger')
    }
  }

  // Resolve item names for selected package display
  const resolveItemName = (type, id) => {
    if (type === 'playlist') {
      const match = playlists.find(p => p.id === id)
      return match ? `قائمة: ${match.title}` : 'قائمة تشغيل جاري تحميلها...'
    } else if (type === 'video') {
      const match = videos.find(v => v.id === id)
      return match ? `فيديو: ${match.title}` : 'فيديو جاري تحميله...'
    } else if (type === 'exam') {
      const match = exams.find(e => e.id === id)
      return match ? `امتحان: ${match.title}` : 'امتحان جاري تحميله...'
    } else if (type === 'homework') {
      const match = homeworks.find(h => h.id === id)
      return match ? `واجب: ${match.title}` : 'واجب جاري تحميله...'
    }
    return 'عنصر غير معروف'
  }

  // Auto load catalog to resolve names on load
  useEffect(() => {
    if (packages.some(p => (p.package_items || []).length > 0)) {
      loadCatalog()
    }
  }, [packages])

  return (
    <section className="cp-panel">
      {onBack && (
        <button className="cp-back" type="button" onClick={onBack}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>
      )}

      <div className="cp-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2>
            <i className="fas fa-box-open" style={{ color: '#8b5cf6', marginInlineEnd: 8 }}></i>
            <span>إدارة الباقات والاشتراكات الأونلاين</span>
          </h2>
          <p>قم بتجميع قوائم التشغيل، والامتحانات، والمحاضرات في باقات دراسية مدفوعة يتم تفعيلها للطالب أوتوماتيكياً بعد الدفع.</p>
        </div>

        <button
          onClick={() => {
            setEditPackageObj(null)
            setTitle('')
            setDescription('')
            setPrice('')
            setThumbnail('')
            setIsActive(true)
            setSelectedItems([])
            setShowCreateModal(true)
          }}
          className="cp-btn cp-btn-primary"
          style={{ background: '#8b5cf6', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <i className="fas fa-plus"></i>
          <span>إنشاء باقة جديدة</span>
        </button>
      </div>

      <div className="cp-header-divider" />

      {loading ? (
        <div className="cp-empty">
          <i className="fas fa-spinner fa-spin"></i>
          <p>جاري تحميل الباقات المدفوعة...</p>
        </div>
      ) : packages.length === 0 ? (
        <div className="cp-empty">
          <i className="fas fa-box-archive" style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: 12 }}></i>
          <h3>لا توجد باقات مفعلة</h3>
          <p>الباقات تساعد طلاب الأونلاين على شراء أبواب أو فصول دراسية محددة. قم بإنشاء أول باقة الآن.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginTop: 20 }}>
          {packages.map(pkg => (
            <div
              key={pkg.id}
              style={{
                background: 'var(--cp-card-bg, #fff)',
                border: pkg.is_active ? '1px solid var(--border-light, #e2e8f0)' : '1px dashed #ef4444',
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              className="cp-card-hover"
            >
              <div>
                {/* Thumbnail header */}
                <div style={{
                  height: 120,
                  background: pkg.thumbnail ? `url(${pkg.thumbnail}) center/cover no-repeat` : 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute', bottom: 12, right: 12,
                    background: '#10b981', color: '#fff',
                    padding: '4px 12px', borderRadius: 10,
                    fontWeight: 'bold', fontSize: '1rem'
                  }}>
                    {pkg.price} ج.م
                  </div>

                  <span style={{
                    position: 'absolute', top: 12, left: 12,
                    fontSize: '0.75rem', padding: '3px 8px', borderRadius: 8,
                    background: pkg.is_active ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
                    color: '#fff', fontWeight: 'bold'
                  }}>
                    {pkg.is_active ? 'نشطة' : 'مغلقة'}
                  </span>
                </div>

                <div style={{ padding: 18 }}>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '0 0 6px', color: 'var(--text-color)' }}>{pkg.title}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--cp-text-muted)', margin: '0 0 16px', lineHeight: 1.4 }}>
                    {pkg.description || 'لا يوجد وصف لهذه الباقة.'}
                  </p>
                </div>
              </div>

              <div style={{ padding: 18, borderTop: '1px solid var(--border-light, #f1f5f9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#8b5cf6', fontWeight: 'bold' }}>
                  <i className="fas fa-tags"></i> {(pkg.package_items || []).length} عناصر مجمعة
                </span>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={(e) => openEditModal(pkg, e)}
                    className="cp-btn"
                    style={{ padding: '6px 12px', background: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: 8, fontSize: '0.8rem', fontWeight: 'bold' }}
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={(e) => openDeleteConfirm(pkg, e)}
                    className="cp-btn"
                    style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, fontSize: '0.8rem', fontWeight: 'bold' }}
                  >
                    🗑 حذف
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────── Create/Edit Package Modal ─────────── */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 99999, padding: 20
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)', borderRadius: '24px',
            border: '1px solid var(--border-color, rgba(99, 102, 241, 0.2))',
            padding: '28px', maxWidth: '640px', width: '100%',
            color: 'var(--text-color)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            position: 'relative', direction: 'rtl', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
          }}>
            <button 
              onClick={() => { setShowCreateModal(false); setEditPackageObj(null); }}
              style={{ position: 'absolute', top: 20, left: 20, background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              <i className="fas fa-times"></i>
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '20px' }}>
              {editPackageObj ? 'تعديل بيانات الباقة' : 'إنشاء باقة دراسية جديدة'}
            </h3>

            <form onSubmit={handleCreateOrUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1, padding: 4 }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>عنوان الباقة *</label>
                  <input 
                    type="text" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    placeholder="مثال: باقة مراجعة الفصل الأول كاملاً" 
                    required
                    className="cp-input" 
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>السعر (ج.م) *</label>
                  <input 
                    type="number" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    placeholder="150" 
                    required
                    min="0"
                    className="cp-input" 
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>وصف الباقة ومميزاتها</label>
                <textarea 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="اكتب ما يحصل عليه الطالب عند شراء الباقة بالتفصيل..." 
                  className="cp-input" 
                  style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)', minHeight: 60 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '6px' }}>رابط صورة الباقة (Thumbnail URL)</label>
                  <input 
                    type="text" 
                    value={thumbnail} 
                    onChange={(e) => setThumbnail(e.target.value)} 
                    placeholder="رابط خارجي لصورة معبرة أو اتركه فارغاً" 
                    className="cp-input" 
                    style={{ width: '100%', padding: '10px', border: '1.5px solid var(--border-color, #e2e8f0)', color: 'var(--text-color)', background: 'var(--card-bg, #fff)' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer', marginTop: 24 }}>
                    <input 
                      type="checkbox" 
                      checked={isActive} 
                      onChange={(e) => setIsActive(e.target.checked)} 
                    />
                    <span>نشطة ومتاحة</span>
                  </label>
                </div>
              </div>

              {/* Package bundling contents builder */}
              <div style={{ border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 16, padding: 16, marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 800 }}>تجميع المحتوى في الباقة</h4>
                
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select
                    value={currentAddType}
                    onChange={(e) => setCurrentAddType(e.target.value)}
                    className="cp-input"
                    style={{ width: 130, padding: 8, background: 'var(--card-bg)' }}
                  >
                    <option value="playlist">قائمة تشغيل</option>
                    <option value="video">فيديو منفرد</option>
                    <option value="exam">امتحان منفرد</option>
                    <option value="homework">واجب منفرد</option>
                  </select>

                  <select
                    value={currentAddId}
                    onChange={(e) => setCurrentAddId(e.target.value)}
                    className="cp-input"
                    style={{ flex: 1, minWidth: 150, padding: 8, background: 'var(--card-bg)' }}
                  >
                    {currentAddType === 'playlist' && playlists.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                    {currentAddType === 'video' && videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                    {currentAddType === 'exam' && exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                    {currentAddType === 'homework' && homeworks.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
                    
                    {currentAddType === 'playlist' && playlists.length === 0 && <option value="">لا توجد قوائم تشغيل متاحة</option>}
                    {currentAddType === 'video' && videos.length === 0 && <option value="">لا توجد فيديوهات متاحة</option>}
                    {currentAddType === 'exam' && exams.length === 0 && <option value="">لا توجد امتحانات متاحة</option>}
                    {currentAddType === 'homework' && homeworks.length === 0 && <option value="">لا توجد واجبات متاحة</option>}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddItemToBundle}
                    className="cp-btn cp-btn-success"
                    style={{ padding: '8px 16px', borderRadius: 10 }}
                  >
                    أضف للباقة
                  </button>
                </div>

                {/* Selected items list */}
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedItems.length === 0 ? (
                    <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', display: 'block', textAlign: 'center', padding: '10px 0' }}>الباقة فارغة حالياً. اجمع بداخلها محتوى للطلاب.</span>
                  ) : (
                    selectedItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 12px', background: 'var(--cp-hover-bg, #fafafa)', borderRadius: 10,
                          fontSize: '0.82rem', border: '1px solid var(--border-light, #e2e8f0)'
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{resolveItemName(item.item_type, item.item_id)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItemFromBundle(item.item_type, item.item_id)}
                          style={{ border: 'none', background: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          إزالة
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button
                  type="submit"
                  disabled={busy}
                  className="cp-btn cp-btn-primary"
                  style={{ flex: 1, padding: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, background: '#8b5cf6' }}
                >
                  {busy ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>}
                  <span>حفظ الباقة الدراسية</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setEditPackageObj(null); }}
                  className="cp-btn cp-btn-secondary"
                  style={{ padding: '12px 24px' }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="تأكيد حذف الباقة الدراسية"
          itemLabel={showDeleteConfirm.title}
          message="سيتم حذف الباقة ومصادرة سلة التجميع الخاصة بها. لن تُحذف قوائم التشغيل أو المحتويات بداخلها من النظام، ولكن سيتم إيقاف مبيعات الباقة فوراً ولن يتمكن الطلاب الجدد من شرائها. لا يمكن التراجع عن هذا الإجراء."
          onCancel={() => setShowDeleteConfirm(null)}
          onConfirm={handlePerformDelete}
        />
      )}
    </section>
  )
}

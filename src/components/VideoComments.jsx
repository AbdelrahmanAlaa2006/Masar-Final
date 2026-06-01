import React, { useState, useEffect, useMemo } from 'react'
import { listComments, createComment, deleteComment } from '../services/../../backend/videoCommentsApi'
import './VideoComments.css'

// Custom Arabic relative date formatter for premium feel
function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'الآن'
  if (diffMin < 60) {
    if (diffMin === 1) return 'منذ دقيقة'
    if (diffMin === 2) return 'منذ دقيقتين'
    if (diffMin <= 10) return `منذ ${diffMin} دقائق`
    return `منذ ${diffMin} دقيقة`
  }
  if (diffHr < 24) {
    if (diffHr === 1) return 'منذ ساعة'
    if (diffHr === 2) return 'منذ ساعتين'
    if (diffHr <= 10) return `منذ ${diffHr} ساعات`
    return `منذ ${diffHr} ساعة`
  }
  if (diffDay === 1) return 'أمس'
  if (diffDay === 2) return 'منذ يومين'
  if (diffDay <= 10) return `منذ ${diffDay} أيام`
  return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VideoComments({ videoId, currentUser }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newCommentText, setNewCommentText] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [replyToId, setReplyToId] = useState(null) // ID of comment being replied to
  const [replyText, setReplyText] = useState('')

  const userRole = currentUser?.role || 'student'
  const isAdmin = userRole === 'admin'

  // Fetch comments
  const loadData = async () => {
    if (!videoId) return
    setError('')
    try {
      const data = await listComments(videoId)
      setComments(data)
    } catch (err) {
      console.error(err)
      setError('تعذر تحميل التعليقات والأسئلة.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    loadData()
  }, [videoId])

  // Group comments into top-level and their nested replies
  const { topLevelComments, repliesMap } = useMemo(() => {
    const top = []
    const replies = {} // parentId -> array of comments

    comments.forEach(comment => {
      if (!comment.parent_id) {
        top.push(comment)
      } else {
        if (!replies[comment.parent_id]) {
          replies[comment.parent_id] = []
        }
        replies[comment.parent_id].push(comment)
      }
    })

    return { topLevelComments: top, repliesMap: replies }
  }, [comments])

  // Post top-level comment
  const handlePostComment = async (e) => {
    e.preventDefault()
    if (!newCommentText.trim() || submitBusy) return
    setSubmitBusy(true)
    setError('')
    try {
      const newComment = await createComment({
        videoId,
        content: newCommentText,
        parentId: null,
        profileId: currentUser.id
      })
      setComments(prev => [...prev, newComment])
      setNewCommentText('')
    } catch (err) {
      console.error(err)
      setError(err.message || 'فشل نشر التعليق. يرجى المحاولة لاحقاً.')
    } finally {
      setSubmitBusy(false)
    }
  }

  // Post reply
  const handlePostReply = async (e, parentId) => {
    e.preventDefault()
    if (!replyText.trim() || submitBusy) return
    setSubmitBusy(true)
    setError('')
    try {
      const newReply = await createComment({
        videoId,
        content: replyText,
        parentId,
        profileId: currentUser.id
      })
      setComments(prev => [...prev, newReply])
      setReplyText('')
      setReplyToId(null)
    } catch (err) {
      console.error(err)
      setError(err.message || 'فشل نشر الرد.')
    } finally {
      setSubmitBusy(false)
    }
  }

  // Delete comment/reply
  const handleDelete = async (commentId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا التعليق؟')) return
    try {
      await deleteComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId))
    } catch (err) {
      console.error(err)
      alert(err.message || 'فشل حذف التعليق.')
    }
  }

  // User avatar icon/fallback
  const renderAvatar = (author, size = 40) => {
    const initials = author?.name ? author.name.charAt(0) : '👤'
    const isTeacher = author?.role === 'admin'
    return (
      <div 
        className={`comment-avatar ${isTeacher ? 'teacher-avatar' : ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: size * 0.45,
          flexShrink: 0,
          background: author?.avatar_url ? `url(${author.avatar_url}) center/cover` : 'var(--accent-dim, rgba(124, 58, 237, 0.15))',
          color: isTeacher ? '#f59e0b' : 'var(--primary-color, #7c3aed)',
          border: isTeacher ? '2px solid #f59e0b' : '1px solid var(--border-color, rgba(255,255,255,0.08))'
        }}
      >
        {!author?.avatar_url && initials}
      </div>
    )
  }

  // Render a single comment card (styled differently if admin/teacher)
  const renderCommentCard = (comment, isReply = false) => {
    const author = comment.author
    const isTeacher = author?.role === 'admin'
    const ownComment = comment.profile_id === currentUser?.id
    const showDelete = ownComment || isAdmin

    return (
      <div 
        key={comment.id} 
        className={`comment-card ${isReply ? 'comment-reply-card' : ''} ${isTeacher ? 'teacher-highlight' : ''}`}
      >
        <div className="comment-header">
          {renderAvatar(author, isReply ? 34 : 42)}
          <div className="comment-meta">
            <div className="comment-user-row">
              <span className="comment-username">{author?.name || 'طالب مسار'}</span>
              {isTeacher && (
                <span className="comment-badge">
                  <i className="fas fa-circle-check"></i> المعلم
                </span>
              )}
            </div>
            <span className="comment-time">{formatRelativeTime(comment.created_at)}</span>
          </div>
          {showDelete && (
            <button 
              className="comment-delete-btn"
              onClick={() => handleDelete(comment.id)}
              title="حذف التعليق"
            >
              <i className="fas fa-trash-can"></i>
            </button>
          )}
        </div>

        <div className="comment-content">
          <p>{comment.content}</p>
        </div>

        {/* Action Bar (Only for top-level comments) */}
        {!isReply && (
          <div className="comment-actions">
            <button 
              className={`comment-action-btn ${replyToId === comment.id ? 'active' : ''}`}
              onClick={() => {
                if (replyToId === comment.id) {
                  setReplyToId(null)
                  setReplyText('')
                } else {
                  setReplyToId(comment.id)
                  setReplyText('')
                }
              }}
            >
              <i className="fas fa-reply"></i> ردّ على السؤال
            </button>
          </div>
        )}

        {/* Inline Reply Form */}
        {replyToId === comment.id && !isReply && (
          <form className="comment-reply-form" onSubmit={(e) => handlePostReply(e, comment.id)}>
            <textarea
              className="comment-textarea"
              placeholder="اكتب ردك هنا..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              required
              rows={2}
            />
            <div className="comment-form-actions">
              <button 
                type="submit" 
                className="btn btn-primary btn-sm"
                disabled={submitBusy || !replyText.trim()}
              >
                {submitBusy ? <i className="fas fa-spinner fa-spin"></i> : 'إرسال الرد'}
              </button>
              <button 
                type="button" 
                className="btn btn-outline btn-sm"
                onClick={() => setReplyToId(null)}
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    )
  }

  return (
    <div className="video-comments-section card" style={{ padding: '24px', marginTop: '20px' }}>
      <div className="comments-section-header">
        <h3>
          <i className="fas fa-comments"></i> أسئلة ومناقشات المحاضرة ({comments.length})
        </h3>
        <p>لديك سؤال أو استفسار؟ اطرحه هنا وسيقوم المعلم بالإجابة عليه.</p>
      </div>

      {error && (
        <div className="comments-error">
          <i className="fas fa-circle-exclamation"></i> {error}
        </div>
      )}

      {/* Main Comment Posting Form */}
      <form className="main-comment-form" onSubmit={handlePostComment}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {renderAvatar(currentUser, 42)}
          <div style={{ flex: 1 }}>
            <textarea
              className="comment-textarea"
              placeholder="اطرح سؤالك أو اكتب تعليقاً حول هذا الجزء من المحاضرة..."
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              required
              rows={3}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitBusy || !newCommentText.trim()}
              >
                {submitBusy ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> جاري النشر...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i> نشر السؤال
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comments List */}
      {loading ? (
        <div className="comments-loading">
          <i className="fas fa-circle-notch fa-spin"></i>
          <p>جاري تحميل الأسئلة...</p>
        </div>
      ) : topLevelComments.length === 0 ? (
        <div className="comments-empty-state">
          <i className="fas fa-comments-question"></i>
          <p>لا توجد أسئلة أو مناقشات بعد.</p>
          <small>كن أول من يطرح سؤالاً في هذا الجزء!</small>
        </div>
      ) : (
        <div className="comments-list">
          {topLevelComments.map(comment => {
            const replies = repliesMap[comment.id] || []
            return (
              <div key={comment.id} className="comment-thread-container">
                {/* Parent comment */}
                {renderCommentCard(comment, false)}

                {/* Nested replies */}
                {replies.length > 0 && (
                  <div className="comment-replies-list">
                    <div className="comment-replies-connector-line"></div>
                    {replies.map(reply => renderCommentCard(reply, true))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

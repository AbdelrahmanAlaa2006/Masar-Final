import React, { useState, useEffect, useRef } from 'react'
import { listChatsOverview, listChatMessages, sendChatMessage, markMessagesAsRead } from '@backend/chatApi'
import { uploadHomeworkSubmission } from '@backend/r2'
import './ChatsPanel.css'

export default function ChatsPanel({ onBack, flash, initialStudentId }) {
  const [threads, setThreads] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Attachment states
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef(null)
  const hasAutoSelectedRef = useRef(false)

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [audioChunks, setAudioChunks] = useState([])
  const recordIntervalRef = useRef(null)

  // Loading states
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)

  const messagesEndRef = useRef(null)

  // Get Admin profile info from sessionStorage to use as senderId
  const adminId = (() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('masar-user'))
      return u?.id || null
    } catch {
      return null
    }
  })()

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load chats overview
  const loadOverview = async (isPoll = false) => {
    try {
      if (!isPoll) setLoadingThreads(true)
      const data = await listChatsOverview()
      setThreads(data)

      // Auto-select initial student once upon loading threads
      if (initialStudentId && !hasAutoSelectedRef.current && data?.length > 0) {
        const target = data.find(t => t.student?.id === initialStudentId)
        if (target?.student) {
          hasAutoSelectedRef.current = true
          handleSelectStudent(target.student)
        }
      }
    } catch (err) {
      console.error('Failed to load chats overview:', err)
      if (!isPoll) flash('تعذر تحميل قائمة المحادثات', 'warning')
    } finally {
      if (!isPoll) setLoadingThreads(false)
    }
  }

  // Load chat messages for the selected student
  const loadMessages = async (studentId, isPoll = false) => {
    if (!studentId) return
    try {
      if (!isPoll) setLoadingMessages(true)
      const data = await listChatMessages(studentId)
      setMessages(data)

      // Find if we have unread messages in this thread and mark them as read
      const hasUnread = data.some(m => m.sender_id === studentId && !m.is_read)
      if (hasUnread) {
        await markMessagesAsRead(studentId, 'admin')
        // Refresh threads overview to update badges
        const updatedThreads = await listChatsOverview()
        setThreads(updatedThreads)
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err)
      if (!isPoll) flash('تعذر تحميل الرسائل', 'warning')
    } finally {
      if (!isPoll) setLoadingMessages(false)
    }
  }

  // Initial load
  useEffect(() => {
    loadOverview()
  }, [])

  // Poll for overview and selected thread updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadOverview(true)
      if (selectedStudent) {
        loadMessages(selectedStudent.id, true)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [selectedStudent])

  // Scroll when messages load or change
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, loadingMessages])

  // Select student thread
  const handleSelectStudent = (student) => {
    setSelectedStudent(student)
    setInputText('')
    cancelImage()
    loadMessages(student.id)
  }

  // Image Attach
  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      flash('الرجاء اختيار ملف صورة صالح', 'warning')
      return
    }
    setSelectedImage(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const cancelImage = () => {
    setSelectedImage(null)
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Audio Recording Helpers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' })
        setAudioChunks([])
        await handleSendVoiceNote(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      setMediaRecorder(recorder)
      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)

      recordIntervalRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)
    } catch (err) {
      console.error('Mic permission failed:', err)
      flash('الرجاء السماح بالوصول إلى الميكروفون لتسجيل رد صوتي', 'warning')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setIsRecording(false)
    clearInterval(recordIntervalRef.current)
  }

  const handleSendVoiceNote = async (blob) => {
    if (!selectedStudent || !adminId) return
    try {
      setSending(true)
      // Name it .png and upload as image to bypass R2 Edge Function kind limits
      const audioFile = new File([blob], 'voice_reply.png', { type: 'image/png' })
      
      const { publicUrl } = await uploadHomeworkSubmission(audioFile)

      const newMsg = await sendChatMessage({
        studentId: selectedStudent.id,
        senderId: adminId,
        content: '',
        fileUrl: publicUrl,
        fileType: 'audio'
      })

      setMessages(prev => [...prev, newMsg])
      scrollToBottom()
      loadOverview(true)
    } catch (err) {
      console.error('Audio reply upload failed:', err)
      flash('فشل إرسال الرد الصوتي: ' + err.message, 'warning')
    } finally {
      setSending(false)
    }
  }

  // Send message
  const handleSend = async (e) => {
    e.preventDefault()
    if (!selectedStudent || (!inputText.trim() && !selectedImage) || !adminId) return

    try {
      setSending(true)
      let fileUrl = null
      let fileType = null

      if (selectedImage) {
        const { publicUrl } = await uploadHomeworkSubmission(selectedImage)
        fileUrl = publicUrl
        fileType = 'image'
      }

      const newMsg = await sendChatMessage({
        studentId: selectedStudent.id,
        senderId: adminId,
        content: inputText.trim(),
        fileUrl,
        fileType
      })

      setMessages(prev => [...prev, newMsg])
      setInputText('')
      cancelImage()
      scrollToBottom()
      loadOverview(true)
    } catch (err) {
      console.error('Failed to send admin reply:', err)
      flash('فشل إرسال الرد: ' + err.message, 'warning')
    } finally {
      setSending(false)
    }
  }

  // Filter students based on search query
  const filteredThreads = threads.filter(t => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      (t.student?.name || '').toLowerCase().includes(q) ||
      (t.student?.phone || '').toLowerCase().includes(q)
    );
  })

  const formatMsgTime = (isoString) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    } catch {
      return ''
    }
  }

  const getMsgDateLabel = (isoString) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return ''
    }
  }

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="ap-chats-wrapper card" dir="rtl">
      {/* Top Header */}
      <div className="ap-chats-header">
        <div className="ap-chats-header-info">
          <h2><i className="fas fa-comments"></i> مركز استفسارات ومحادثات الطلاب</h2>
          <p>تواصل مع الطلاب وأجب عن أسئلتهم وملاحظاتهم مباشرة</p>
        </div>
        <button className="cp-btn cp-btn-secondary" onClick={onBack}>
          <i className="fas fa-arrow-left"></i> رجوع للوحة التحكم
        </button>
      </div>

      <div className="ap-chats-container">
        {/* Left: Chat list side list */}
        <div className="ap-chats-sidebar">
          <div className="ap-chats-search">
            <i className="fas fa-search search-icon"></i>
            <input 
              type="text" 
              placeholder="ابحث باسم الطالب أو رقم الهاتف..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="ap-chats-list">
            {loadingThreads && threads.length === 0 ? (
              <div className="chats-list-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل المحادثات...</p>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="chats-list-empty">
                <i className="fas fa-comment-slash"></i>
                <p>لا توجد محادثات نشطة حالياً</p>
              </div>
            ) : (
              filteredThreads.map(t => {
                const isSelected = selectedStudent?.id === t.student?.id
                const initials = (t.student?.name || 'ط').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')
                
                return (
                  <div 
                    key={t.student?.id} 
                    className={`chat-item-row ${isSelected ? 'active' : ''} ${t.unreadCount > 0 ? 'has-unread' : ''}`}
                    onClick={() => handleSelectStudent(t.student)}
                  >
                    <div className="chat-item-avatar">
                      {t.student?.avatar_url ? (
                        <img src={t.student.avatar_url} alt="" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="chat-item-body">
                      <div className="chat-item-top">
                        <span className="chat-item-name">{t.student?.name || 'طالب مجهول'}</span>
                        <span className="chat-item-time">
                          {t.latestMessage ? new Date(t.latestMessage.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>
                      <div className="chat-item-bottom">
                        <span className="chat-item-preview">
                          {t.latestMessage?.file_type === 'image' && <><i className="fas fa-image"></i> صورة</>}
                          {t.latestMessage?.file_type === 'audio' && <><i className="fas fa-microphone"></i> رسالة صوتية</>}
                          {t.latestMessage?.content || ''}
                        </span>
                        {t.unreadCount > 0 && (
                          <span className="chat-item-badge">{t.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Message Window */}
        <div className="ap-chats-pane">
          {selectedStudent ? (
            <div className="chat-pane-inner">
              {/* Header */}
              <div className="chat-pane-header">
                <div className="chat-pane-header-avatar">
                  {selectedStudent.avatar_url ? (
                    <img src={selectedStudent.avatar_url} alt="" />
                  ) : (
                    <i className="fas fa-user-graduate"></i>
                  )}
                </div>
                <div className="chat-pane-header-info">
                  <h3>{selectedStudent.name}</h3>
                  <p><i className="fas fa-phone"></i> {selectedStudent.phone || 'بدون رقم هاتف'}</p>
                </div>
              </div>

              {/* Message List area */}
              <div className="chat-pane-messages">
                {loadingMessages ? (
                  <div className="chat-messages-loading">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>جاري تحميل الرسائل...</p>
                  </div>
                ) : (
                  <div className="chat-messages-thread">
                    {messages.map((msg, index) => {
                      const isStudentMsg = msg.sender_id === selectedStudent.id
                      const showDateHeader = index === 0 || getMsgDateLabel(messages[index - 1].created_at) !== getMsgDateLabel(msg.created_at)
                      
                      return (
                        <React.Fragment key={msg.id}>
                          {showDateHeader && (
                            <div className="chat-date-header">
                              <span>{getMsgDateLabel(msg.created_at)}</span>
                            </div>
                          )}
                          <div className={`chat-bubble-row ${isStudentMsg ? 'student' : 'admin'}`}>
                            <div className="chat-bubble-card">
                              {msg.file_type === 'image' && msg.file_url && (
                                <div className="bubble-attached-image">
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                                    <img src={msg.file_url} alt="Attached attachment" />
                                  </a>
                                </div>
                              )}

                              {msg.file_type === 'audio' && msg.file_url && (
                                <div className="bubble-attached-audio">
                                  <audio src={msg.file_url} controls preload="metadata"></audio>
                                </div>
                              )}

                              {msg.content && <p className="bubble-msg-text">{msg.content}</p>}
                              
                              <span className="bubble-msg-time">
                                {formatMsgTime(msg.created_at)}
                                {!isStudentMsg && (
                                  <i className={`fas fa-check-double read-check-icon ${msg.is_read ? 'read' : ''}`} style={{ marginInlineStart: 4 }}></i>
                                )}
                              </span>
                            </div>
                          </div>
                        </React.Fragment>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Pre-send Image Preview */}
              {imagePreview && (
                <div className="pane-image-preview">
                  <img src={imagePreview} alt="Upload preview" />
                  <button className="preview-cancel-btn" onClick={cancelImage}>
                    <i className="fas fa-times-circle"></i>
                  </button>
                  <span>مرفق جاهز للإرسال...</span>
                </div>
              )}

              {/* Text Input area form */}
              <form className="chat-pane-input-bar" onSubmit={handleSend}>
                <input 
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef} 
                  onChange={handleImagePick}
                />

                {isRecording ? (
                  <div className="pane-recording-overlay">
                    <span className="recording-dot"></span>
                    <span>جاري تسجيل الرد الصوتي... {formatTime(recordingSeconds)}</span>
                    <button type="button" className="recording-stop-btn" onClick={stopRecording}>
                      <i className="fas fa-check"></i> إرسال الرد
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      type="button" 
                      className="pane-attach-btn" 
                      onClick={() => fileInputRef.current?.click()}
                      title="إرفاق صورة"
                      disabled={sending}
                    >
                      <i className="fas fa-paperclip"></i>
                    </button>

                    <input 
                      type="text" 
                      className="pane-text-input" 
                      placeholder="اكتب ردك للطالب هنا..." 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={sending}
                    />

                    {!inputText.trim() && !selectedImage ? (
                      <button 
                        type="button" 
                        className="pane-mic-btn" 
                        onClick={startRecording}
                        title="تسجيل رد صوتي"
                        disabled={sending}
                      >
                        <i className="fas fa-microphone"></i>
                      </button>
                    ) : (
                      <button 
                        type="submit" 
                        className="pane-send-btn"
                        disabled={sending}
                      >
                        {sending ? (
                          <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                          <i className="fas fa-paper-plane"></i>
                        )}
                      </button>
                    )}
                  </>
                )}
              </form>
            </div>
          ) : (
            <div className="chat-pane-placeholder">
              <i className="fas fa-comments"></i>
              <h3>محادثات الطلاب والاستفسارات</h3>
              <p>الرجاء تحديد طالب من قائمة المحادثات النشطة لبدء الرد والتواصل</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

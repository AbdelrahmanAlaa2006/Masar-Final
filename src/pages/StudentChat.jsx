import React, { useState, useEffect, useRef } from 'react'
import { listChatMessages, sendChatMessage, markMessagesAsRead } from '@backend/chatApi'
import { createNotification } from '@backend/notificationsApi'
import { uploadHomeworkSubmission } from '@backend/r2'
import { useAuth } from '../contexts/AuthContext'
import './StudentChat.css'

export default function StudentChat() {
  const { user } = useAuth()
  if (!user) return null

  const studentId = user.id
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  
  // Attachment states
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const fileInputRef = useRef(null)

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [audioChunks, setAudioChunks] = useState([])
  const recordIntervalRef = useRef(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Fetch messages
  const fetchMessages = async (isPoll = false) => {
    try {
      if (!isPoll) setLoading(true)
      const data = await listChatMessages(studentId)
      setMessages(data)
      
      // Only mark as read if there is at least one unread message from the teacher
      const hasUnread = data.some(m => m.sender_id !== studentId && !m.is_read)
      if (hasUnread) {
        await markMessagesAsRead(studentId, 'student')
      }
    } catch (err) {
      console.error('Failed to load chat messages:', err)
    } finally {
      if (!isPoll) setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchMessages()
  }, [studentId])

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  // Polling for new messages every 5 seconds ONLY when on this page
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [studentId])

  // Handle image pick
  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('الرجاء اختيار ملف صورة صالح')
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

  // Start Audio Recording
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
        
        // Stop all tracks in the audio stream to release microphone
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
      console.error('Failed to access microphone:', err)
      alert('الرجاء السماح بالوصول إلى الميكروفون لتسجيل الرسائل الصوتية')
    }
  }

  // Stop Audio Recording
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setIsRecording(false)
    clearInterval(recordIntervalRef.current)
  }

  // Send voice note
  const handleSendVoiceNote = async (blob) => {
    try {
      setSending(true)
      const audioFile = new File([blob], 'voice_note.png', { type: 'image/png' })
      const { publicUrl } = await uploadHomeworkSubmission(audioFile)
      
      const newMsg = await sendChatMessage({
        studentId,
        senderId: studentId,
        content: '',
        fileUrl: publicUrl,
        fileType: 'audio'
      })

      // Trigger admin alert notification
      await createNotification({
        title: `رسالة جديدة من ${user.name || 'طالب'}`,
        message: '🎙️ أرسل رسالة صوتية',
        level: 'info',
        scope: 'all',
        meta: { kind: 'student_chat_message', studentId },
        createdBy: studentId
      }).catch(err => console.error('Voice note notification alert failed:', err))

      setMessages(prev => [...prev, newMsg])
      scrollToBottom()
    } catch (err) {
      console.error('Failed to upload audio message:', err)
      alert('فشل إرسال الرسالة الصوتية: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  // Send message handler
  const handleSend = async (e) => {
    e.preventDefault()
    if (!inputText.trim() && !selectedImage) return

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
        studentId,
        senderId: studentId,
        content: inputText.trim(),
        fileUrl,
        fileType
      })

      // Trigger admin alert notification
      await createNotification({
        title: `رسالة جديدة من ${user.name || 'طالب'}`,
        message: inputText.trim() || (fileType === 'image' ? '🖼️ أرسل صورة' : 'مرفق جديد'),
        level: 'info',
        scope: 'all',
        meta: { kind: 'student_chat_message', studentId },
        createdBy: studentId
      }).catch(err => console.error('Text notification alert failed:', err))

      setMessages(prev => [...prev, newMsg])
      setInputText('')
      cancelImage()
      scrollToBottom()
    } catch (err) {
      console.error('Failed to send message:', err)
      alert('فشل إرسال الرسالة: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (sec) => {
    const mins = Math.floor(sec / 60)
    const secs = sec % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const formatMsgTime = (isoString) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })
    } catch {
      return ''
    }
  }

  return (
    <main className="sc-page" dir="rtl">
      <div className="sc-container">
        
        {/* Sidebar Info Card */}
        <div className="sc-sidebar-card">
          <div className="sc-avatar-wrap">
            <i className="fas fa-user-tie"></i>
          </div>
          <h2>محادثة المعلم المباشرة</h2>
          <p>تواصل مع معلمك واطرح جميع استفساراتك وأسئلتك في أي وقت.</p>
          <div className="sc-status-indicator">
            <span className="sc-status-dot-active"></span>
            <span>متصل للإجابة على الأسئلة</span>
          </div>
          <div className="sc-features-list">
            <div className="sc-feature-item">
              <i className="fas fa-keyboard"></i>
              <span>اكتب أسئلتك بوضوح</span>
            </div>
            <div className="sc-feature-item">
              <i className="fas fa-image"></i>
              <span>أرفق صور المسائل لحلها</span>
            </div>
            <div className="sc-feature-item">
              <i className="fas fa-microphone"></i>
              <span>سجّل ملاحظاتك الصوتية</span>
            </div>
          </div>
        </div>

        {/* Chat Workspace Area */}
        <div className="sc-chat-area">
          <div className="sc-chat-header-bar">
            <i className="fas fa-comments"></i>
            <span>نافذة المناقشة والدعم</span>
          </div>

          <div className="sc-chat-messages-body">
            {loading ? (
              <div className="sc-page-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل المحادثة...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="sc-page-empty-chat">
                <i className="fas fa-comments"></i>
                <h3>أهلاً بك في الدردشة المباشرة!</h3>
                <p>لم يتم إرسال أي رسائل بعد. ابدأ بكتابة رسالة أو مشاركة سؤالك مع المعلم.</p>
              </div>
            ) : (
              <div className="sc-page-messages-list">
                {messages.map((msg) => {
                  const isMe = msg.sender_id === studentId
                  return (
                    <div key={msg.id} className={`sc-page-msg-row ${isMe ? 'me' : 'them'}`}>
                      <div className="sc-page-msg-bubble">
                        {!isMe && (
                          <div className="sc-page-msg-author">
                            {msg.sender?.name || 'المعلم'}
                          </div>
                        )}
                        
                        {msg.file_type === 'image' && msg.file_url && (
                          <div className="sc-page-msg-image">
                            <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                              <img src={msg.file_url} alt="مرفق صورة" />
                            </a>
                          </div>
                        )}

                        {msg.file_type === 'audio' && msg.file_url && (
                          <div className="sc-page-msg-audio">
                            <audio src={msg.file_url} controls preload="metadata"></audio>
                          </div>
                        )}

                        {msg.content && <p className="sc-page-msg-text">{msg.content}</p>}
                        
                        <span className="sc-page-msg-time">{formatMsgTime(msg.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Pre-send Image Preview */}
          {imagePreview && (
            <div className="sc-page-image-preview-bar">
              <img src={imagePreview} alt="Preview" />
              <button className="sc-page-preview-cancel" onClick={cancelImage} type="button">
                <i className="fas fa-times-circle"></i>
              </button>
              <span className="sc-page-preview-label">جاهز للرفع مع الرسالة...</span>
            </div>
          )}

          {/* Input Panel Form */}
          <form className="sc-page-input-form" onSubmit={handleSend}>
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleImagePick}
            />

            {/* Audio Recording overlay overlay */}
            {isRecording ? (
              <div className="sc-page-recording-overlay">
                <span className="sc-page-record-indicator"></span>
                <span className="sc-page-record-time">جاري تسجيل الصوت... {formatTime(recordingSeconds)}</span>
                <button type="button" className="sc-page-record-stop-btn" onClick={stopRecording}>
                  <i className="fas fa-check"></i> إرسال المقطع
                </button>
              </div>
            ) : (
              <>
                <button 
                  type="button" 
                  className="sc-page-attach-btn" 
                  onClick={() => fileInputRef.current?.click()}
                  title="إرفاق صورة"
                  disabled={sending}
                >
                  <i className="fas fa-paperclip"></i>
                </button>

                <input 
                  type="text" 
                  className="sc-page-text-input" 
                  placeholder="اكتب رسالتك أو استفسارك هنا..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={sending}
                />

                {!inputText.trim() && !selectedImage ? (
                  <button 
                    type="button" 
                    className="sc-page-mic-btn" 
                    onClick={startRecording}
                    title="تسجيل صوتي"
                    disabled={sending}
                  >
                    <i className="fas fa-microphone"></i>
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    className="sc-page-send-btn"
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

      </div>
    </main>
  )
}

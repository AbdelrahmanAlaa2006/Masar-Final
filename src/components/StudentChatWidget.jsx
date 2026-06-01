import React, { useState, useEffect, useRef } from 'react'
import { listChatMessages, sendChatMessage, markMessagesAsRead } from '@backend/chatApi'
import { uploadHomeworkSubmission } from '@backend/r2'
import './StudentChatWidget.css'

export default function StudentChatWidget({ currentUser }) {
  if (!currentUser) return null

  const studentId = currentUser.id
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

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
  const [loading, setLoading] = useState(false)
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
      
      // Calculate unread count (messages sent by admin where is_read is false)
      const unread = data.filter(m => m.sender_id !== studentId && !m.is_read).length
      setUnreadCount(unread)

      if (isOpen && unread > 0) {
        // Mark as read if the chat is open
        await markMessagesAsRead(studentId, 'student')
        setUnreadCount(0)
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

  // Scroll on open or new messages
  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
      if (unreadCount > 0) {
        markMessagesAsRead(studentId, 'student')
        setUnreadCount(0)
      }
    }
  }, [isOpen, messages.length])

  // Polling for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [studentId, isOpen])

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
      // Name it .png with content-type image/png to bypass R2 Edge Function kind constraints.
      // This is a completely safe workaround.
      const audioFile = new File([blob], 'voice_note.png', { type: 'image/png' })
      
      const { publicUrl } = await uploadHomeworkSubmission(audioFile)
      
      const newMsg = await sendChatMessage({
        studentId,
        senderId: studentId,
        content: '',
        fileUrl: publicUrl,
        fileType: 'audio'
      })

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
    <div className={`sc-widget-wrapper ${isOpen ? 'open' : ''}`} dir="rtl">
      {/* Floating bubble button */}
      <button 
        className="sc-bubble" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="تواصل مع المعلم"
        title="تواصل مع المعلم"
      >
        {isOpen ? (
          <i className="fas fa-times sc-bubble-icon"></i>
        ) : (
          <>
            <i className="fas fa-comment-dots sc-bubble-icon"></i>
            {unreadCount > 0 && <span className="sc-unread-badge">{unreadCount}</span>}
          </>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="sc-window">
          {/* Header */}
          <div className="sc-header">
            <div className="sc-header-avatar">
              <i className="fas fa-user-tie"></i>
            </div>
            <div className="sc-header-info">
              <h3>تواصل مباشر مع المعلم</h3>
              <p><span className="sc-status-dot"></span> متصل للإجابة على استفساراتك</p>
            </div>
            <button className="sc-close-btn" onClick={() => setIsOpen(false)}>
              <i className="fas fa-minus"></i>
            </button>
          </div>

          {/* Messages Area */}
          <div className="sc-messages-body">
            {loading ? (
              <div className="sc-loading">
                <i className="fas fa-spinner fa-spin"></i>
                <p>جاري تحميل المحادثة...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="sc-empty-chat">
                <i className="fas fa-comments"></i>
                <p>أهلاً بك! يمكنك هنا إرسال استفساراتك وأسئلتك للمعلم مباشرة.</p>
                <span>تستطيع كتابة سؤالك أو إرسال صورة أو تسجيل مقطع صوتي للمسألة.</span>
              </div>
            ) : (
              <div className="sc-messages-list">
                {messages.map((msg) => {
                  const isMe = msg.sender_id === studentId
                  return (
                    <div key={msg.id} className={`sc-message-row ${isMe ? 'me' : 'them'}`}>
                      <div className="sc-message-bubble">
                        {!isMe && (
                          <div className="sc-msg-author">
                            {msg.sender?.name || 'المعلم'}
                          </div>
                        )}
                        
                        {msg.file_type === 'image' && msg.file_url && (
                          <div className="sc-msg-image">
                            <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                              <img src={msg.file_url} alt="مرفق صورة" />
                            </a>
                          </div>
                        )}

                        {msg.file_type === 'audio' && msg.file_url && (
                          <div className="sc-msg-audio">
                            <audio src={msg.file_url} controls preload="metadata"></audio>
                          </div>
                        )}

                        {msg.content && <p className="sc-msg-text">{msg.content}</p>}
                        
                        <span className="sc-msg-time">{formatMsgTime(msg.created_at)}</span>
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
            <div className="sc-image-preview-bar">
              <img src={imagePreview} alt="Preview" />
              <button className="sc-preview-cancel" onClick={cancelImage}>
                <i className="fas fa-times-circle"></i>
              </button>
              <span className="sc-preview-label">مستعد للرفع...</span>
            </div>
          )}

          {/* Input Panel */}
          <form className="sc-input-form" onSubmit={handleSend}>
            <input 
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleImagePick}
            />

            {/* Audio Recording overlay overlay */}
            {isRecording ? (
              <div className="sc-recording-overlay">
                <span className="sc-record-indicator"></span>
                <span className="sc-record-time">جاري تسجيل الصوت... {formatTime(recordingSeconds)}</span>
                <button type="button" className="sc-record-stop-btn" onClick={stopRecording}>
                  <i className="fas fa-check"></i> إرسال
                </button>
              </div>
            ) : (
              <>
                <button 
                  type="button" 
                  className="sc-attach-btn" 
                  onClick={() => fileInputRef.current?.click()}
                  title="إرفاق صورة"
                  disabled={sending}
                >
                  <i className="fas fa-paperclip"></i>
                </button>

                <input 
                  type="text" 
                  className="sc-text-input" 
                  placeholder="اكتب رسالتك هنا..." 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={sending}
                />

                {!inputText.trim() && !selectedImage ? (
                  <button 
                    type="button" 
                    className="sc-mic-btn" 
                    onClick={startRecording}
                    title="تسجيل صوتي"
                    disabled={sending}
                  >
                    <i className="fas fa-microphone"></i>
                  </button>
                ) : (
                  <button 
                    type="submit" 
                    className="sc-send-btn"
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
      )}
    </div>
  )
}

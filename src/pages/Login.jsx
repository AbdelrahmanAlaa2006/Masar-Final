import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, tokenAPI } from '../services/api'
import './Login.css'

const translations = {
  ar: {
    login: 'تسجيل الدخول',
    phone: 'رقم الهاتف',
    name: 'الاسم الكامل',
    password: 'كلمة المرور',
    remember: 'تذكرني',
    forgot: 'نسيت كلمة المرور؟',
    'platform-title': 'منصة مسار التعليمية',
    'platform-description': 'منصة مسار تقدم لك تجربة تعليمية متكاملة تشمل الدروس التفاعلية، التمارين، والاختبارات الإلكترونية. تعلم أينما كنت، وبالطريقة التي تناسبك. انطلق الآن وابدأ مسارك نحو التميز والنجاح.',
  },
  en: {
    login: 'Login',
    phone: 'Phone Number',
    name: 'Full Name',
    password: 'Password',
    remember: 'Remember me',
    forgot: 'Forgot password?',
    'platform-title': 'Masar Educational Platform',
    'platform-description': 'The Masar platform offers you a comprehensive educational experience, including interactive lessons, exercises, and online tests. Learn wherever you are, in the way that suits you. Get started now and begin your path to excellence and success.',
  },
}

export default function Login() {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const [tab, setTab] = useState('login') // 'login' or 'register'
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const t = translations[lang]

  const switchLang = newLang => {
    setLang(newLang)
    localStorage.setItem('lang', newLang)
    document.documentElement.lang = newLang
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError('')

    if (phone.trim().length < 8) {
      setError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number')
      return
    }

    if (password.length < 6) {
      setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const response = await authAPI.login(phone.trim(), password)
      
      console.log('Login response:', response)

      // Validate response has required fields
      if (!response.token || !response.user) {
        throw new Error('Invalid response from server')
      }
      
      // Store token and user data
      tokenAPI.setToken(response.token)
      localStorage.setItem('masar-user', JSON.stringify(response.user))
      
      console.log('Token stored:', response.token)
      console.log('User stored:', response.user)
      
      showSuccessMessage()

      // Navigate after showing success message
      setTimeout(() => {
        navigate('/')
      }, 1500)
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'))
      setLoading(false)
    }
  }

  const handleRegister = async e => {
    e.preventDefault()
    setError('')

    if (name.trim().length < 3) {
      setError(lang === 'ar' ? 'الاسم يجب أن يكون 3 أحرف على الأقل' : 'Name must be at least 3 characters')
      return
    }

    if (phone.trim().length < 8) {
      setError(lang === 'ar' ? 'رقم الهاتف غير صحيح' : 'Invalid phone number')
      return
    }

    if (password.length < 6) {
      setError(lang === 'ar' ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' : 'Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const response = await authAPI.register(name.trim(), phone.trim(), password)
      
      // Store token and user data
      tokenAPI.setToken(response.token)
      localStorage.setItem('masar-user', JSON.stringify(response.user))
      
      showSuccessMessage()

      setTimeout(() => {
        // Clear any success messages
        const messages = document.querySelectorAll('div[style*="position: fixed"]')
        messages.forEach(msg => {
          if (msg.innerHTML.includes('✔️')) {
            msg.remove()
          }
        })
        navigate('/')
      }, 1500)
    } catch (err) {
      setError(err.message || (lang === 'ar' ? 'فشل التسجيل' : 'Registration failed'))
      setLoading(false)
    }
  }

  const showSuccessMessage = () => {
    const msg = document.createElement('div')
    msg.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff;
      padding: 40px 60px;
      border-radius: 24px;
      font-size: 2rem;
      font-weight: bold;
      box-shadow: 0 12px 40px rgba(102,126,234,0.25);
      z-index: 9999;
      text-align: center;
      opacity: 0;
      transition: opacity 0.4s ease, transform 0.5s ease;
    `

    msg.innerHTML = `
      <div style="font-size: 3.5rem; margin-bottom: 12px;">✔️</div>
      <div>${lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Login Successful!'}</div>
    `

    document.body.appendChild(msg)

    setTimeout(() => {
      msg.style.opacity = '1'
      msg.style.transform = 'translate(-50%, -50%) scale(1)'
    }, 10)

    // Fade out and remove
    setTimeout(() => {
      msg.style.opacity = '0'
      msg.style.transform = 'translate(-50%, -50%) scale(0.8)'
    }, 1200)

    setTimeout(() => {
      if (msg.parentNode) msg.parentNode.removeChild(msg)
    }, 1700)
  }

  return (
    <div className="login-container">
      <div className="lang-toggle">
        <button onClick={() => switchLang('en')} className={`lang-btn ${lang === 'en' ? 'active' : ''}`}>
          English
        </button>
        <button onClick={() => switchLang('ar')} className={`lang-btn ${lang === 'ar' ? 'active' : ''}`}>
          العربية
        </button>
      </div>

      <div className="left-section fade-all">
        <div className="overlay"></div>
        <div className="login modern-login-box">
          <div className="tabs-container">
            <button
              className={`tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); setPassword(''); setName(''); }}
            >
              {lang === 'ar' ? 'دخول' : 'Login'}
            </button>
            <button
              className={`tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setPassword(''); setName(''); }}
            >
              {lang === 'ar' ? 'تسجيل' : 'Register'}
            </button>
          </div>

          <h2>{tab === 'login' ? t.login : (lang === 'ar' ? 'إنشاء حساب' : 'Create Account')}</h2>

          {error && <div className="error-message show">{error}</div>}

          <form onSubmit={tab === 'login' ? handleLogin : handleRegister}>
            {tab === 'register' && (
              <div className="input-wrapper">
                <i className="fas fa-user"></i>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder={t.name}
                  minLength="3"
                />
              </div>
            )}

            <div className="input-wrapper">
              <i className="fas fa-phone"></i>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                placeholder={t.phone}
                dir="ltr"
              />
            </div>

            <div className="input-wrapper">
              <i className="fas fa-lock"></i>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder={t.password}
                minLength="3"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="toggle-password-btn"
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>

            {tab === 'login' && (
              <div className="form-options">
                <label className="switch">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  <span className="slider"></span>
                </label>
                <span className="remember-text">{t.remember}</span>
                <a href="#" className="forgot">
                  {t.forgot}
                </a>
              </div>
            )}

            <button type="submit" className="modern-btn" disabled={loading}>
              <span className="btn-text">{tab === 'login' ? t.login : (lang === 'ar' ? 'تسجيل' : 'Register')}</span>
              {loading && (
                <span className="btn-loader">
                  <span className="spinner"></span>
                </span>
              )}
            </button>
          </form>

          <div className="demo-hint">{tab === 'register' ? (lang === 'ar' ? 'أنشئ حسابًا جديدًا للبدء' : 'Create a new account to get started') : ''}</div>
        </div>
      </div>

      <div className="right-section fade-all">
        <div className="right-content">
          <img src="/images/logo.white.png" alt="Masar Logo" />
          <h2>{t['platform-title']}</h2>
          <p>{t['platform-description']}</p>
        </div>
      </div>
    </div>
  )
}

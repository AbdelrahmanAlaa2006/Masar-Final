import React, { useEffect, useState } from 'react'
import './Home.css'
import examsIcon from '../assets/exams.png'
import lecturesIcon from '../assets/lectures.png'
import reportsIcon from '../assets/reports.png'
import videosIcon from '../assets/videos.png'

export default function Home() {
  const [username, setUsername] = useState('')

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('masar-user'))
      if (user && user.username) {
        setUsername(user.username)
      }
    } catch (err) {
      console.error('Error reading user from localStorage:', err)
    }

    // Show cards on mount with animation
    const cards = document.querySelectorAll('.card')
    setTimeout(() => {
      cards.forEach((card, index) => {
        setTimeout(() => {
          card.style.transform = 'translateY(0)'
          card.style.opacity = '1'
        }, index * 150)
      })
    }, 500)

    // Scroll event listener for cards
    const handleScroll = () => {
      cards.forEach(card => {
        const cardTop = card.getBoundingClientRect().top
        const cardVisible = 150

        if (cardTop < window.innerHeight - cardVisible) {
          card.style.transform = 'translateY(0)'
          card.style.opacity = '1'
        }
      })
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    // Create particle effects
    const createParticle = () => {
      const particle = document.createElement('div')
      particle.style.cssText = `
        position: fixed;
        width: 4px;
        height: 4px;
        background: linear-gradient(45deg, #667eea, #764ba2);
        border-radius: 50%;
        pointer-events: none;
        z-index: -1;
        animation: particleFloat 6s linear infinite;
      `

      particle.style.left = Math.random() * 100 + 'vw'
      particle.style.animationDelay = Math.random() * 6 + 's'

      document.body.appendChild(particle)

      setTimeout(() => particle.remove(), 6000)
    }

    const particleInterval = setInterval(createParticle, 800)
    return () => clearInterval(particleInterval)
  }, [])

  return (
    <main className="home">
      {/* Hero Section */}
      <section className="hero">
        <h1>طور مهاراتك مع منصة مسار</h1>
        <p>
          أكتشف مجموعة واسعة من الدورات التعليمية المصممة خصيصًا للطلاب، من البرمجة إلى التصميم الجرافيكي. كل ما
          تحتاجه لتطوير مهاراتك وتحقيق أهدافك المهنية.
        </p>
        <a href="#cards" className="hero-btn">
          ابدأ التعلم الآن
        </a>
      </section>

      {/* Cards Section */}
      <div className="container">
        <div id="cards" className="cards-grid">
          <div className="card" onClick={() => (window.location.href = '/exams')}>
            <img src={examsIcon} alt="Exams Icon" />
            <h2>الامتحانات</h2>
            <p>اختبارات التدريب والامتحانات السابقة</p>
          </div>

          <div className="card" onClick={() => (window.location.href = '/lectures')}>
            <img src={lecturesIcon} alt="Lectures Icon" />
            <h2>المحاضرات</h2>
            <p>جميع ملاحظاتك ومحاضراتك الدراسية</p>
          </div>

          <div className="card" onClick={() => (window.location.href = '/report')}>
            <img src={reportsIcon} alt="Reports Icon" />
            <h2>التقارير</h2>
            <p>عرض تقارير الأداء والتقدم</p>
          </div>

          <div className="card" onClick={() => (window.location.href = '/videos')}>
            <img src={videosIcon} alt="Videos Icon" />
            <h2>الفيديوهات</h2>
            <p>مشاهدة الفيديوهات التعليمية</p>
          </div>
        </div>
      </div>

      {/* Greeting Section */}
      <section className="greeting-section">
        <h2>
          <span className="name-highlight">
            يومك سعيد يا {username || 'الطالب'}
          </span>
        </h2>
        <p>
          لو بتواجهك أي مشاكل أو عندك أي استفسارات أو اقتراحات أو أي حاجة عايزنا نعرفها متترددش إنك تتواصل معانا
        </p>

        {/* Social Icons Section */}
        <div className="social-icons-container">
          <a href="https://github.com/yourUsername" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" alt="GitHub" />
          </a>

          <a href="https://wa.me/201234567890" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" alt="WhatsApp" />
          </a>

          <a href="https://www.facebook.com/yourPage" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="Facebook" />
          </a>

          <a href="https://www.linkedin.com/in/yourProfile" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/145/145807.png" alt="LinkedIn" />
          </a>

          <a href="mailto:yourEmail@gmail.com" target="_blank" rel="noopener noreferrer" className="social-icon">
            <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" alt="Gmail" />
          </a>
        </div>
      </section>
    </main>
  )
}

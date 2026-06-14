/**
 * Configuration registry for tenant-specific themes and animations.
 */
export const tenantThemes = {
  chemistry: {
    themeClass: 'aa-chem-theme',
    canvasFont: '"Orbitron", sans-serif',
    primaryColor: '#06b6d4',
    secondaryColor: '#0d9488',
    particleColors: ['#0d9488', '#06b6d4', '#14b8a6', '#22d3ee', '#38bdf8', '#8b5cf6'],
    formulas: ['H₂O', 'CO₂', 'C₆H₆', 'HCl', 'NaOH', 'NH₃', 'CH₄', 'NaCl'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(120, 200, 255, ${alpha * 0.22})`
        : `rgba(13, 148, 136, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'benzene') {
        ctx.beginPath()
        const r = size * 5.5
        for (let s = 0; s < 6; s++) {
          const angle = (s * Math.PI) / 3
          const px = p.x + r * Math.cos(angle)
          const py = p.y + r * Math.sin(angle)
          if (s === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.lineWidth = 1.2
        ctx.stroke()
        
        ctx.beginPath()
        ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2)
        ctx.stroke()
        return true
      } else if (type === 'flask') {
        const sizeVal = size * 6
        ctx.beginPath()
        ctx.moveTo(p.x - sizeVal * 0.2, p.y - sizeVal * 0.6)
        ctx.lineTo(p.x + sizeVal * 0.2, p.y - sizeVal * 0.6)
        ctx.lineTo(p.x + sizeVal * 0.2, p.y - sizeVal * 0.2)
        ctx.lineTo(p.x + sizeVal * 0.6, p.y + sizeVal * 0.6)
        ctx.lineTo(p.x - sizeVal * 0.6, p.y + sizeVal * 0.6)
        ctx.lineTo(p.x - sizeVal * 0.2, p.y - sizeVal * 0.2)
        ctx.closePath()
        ctx.lineWidth = 1.2
        ctx.stroke()
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.20) return 'benzene'
      if (rand < 0.40) return 'flask'
      if (rand < 0.70) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'الأستاذة منى كيمياء', en: 'Mona Chemistry' },
      hero_title_a: { ar: 'علم الكيمياء', en: 'Chemistry Science' },
      hero_title_b: { ar: 'المتعة والفهم معاً', en: 'Understanding made fun' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في الكيمياء - شرح مبسط وتجارب تفاعلية تجعلك تعشق الكيمياء وتتفوق فيها.',
        en: 'An educational platform specializing in chemistry - simplified explanations and interactive experiments that make you love chemistry.'
      }
    },
    teacher: {
      name: { ar: 'منى أحمد', en: 'Mona Ahmed' },
      role: { ar: 'مدرّسة الكيمياء القديرة', en: 'Senior Chemistry Teacher' },
      bio: {
        ar: 'بشرح الكيمياء بأسلوب علمي حديث وتجارب عملية تقرب المفاهيم والمعادلات لذهن الطالب وتسهل عليه الفهم والاستيعاب.',
        en: 'I teach chemistry with a modern scientific style and practical experiments that bring concepts and equations to life.'
      },
      quote: {
        ar: '«الكيمياء ليست حفظاً للمعادلات، بل فهم لكيفية عمل الكون.»',
        en: '“Chemistry is not about memorizing equations, but understanding how the universe works.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+8', en: '+8' },
      students_count: { ar: '+1,500', en: '+1,500' },
      satisfaction: { ar: '99%', en: '99%' },
      target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
      target_stage_label: { ar: 'المرحلة التي تدرّسها', en: 'Stage she teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'زورنا في مقرنا', en: 'Visit our center' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للدروس والمراجعات العملية بدمنهور.',
        en: 'Our main center for lectures and practical reviews in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  physics: {
    themeClass: 'aa-phys-theme',
    canvasFont: '"Space Mono", monospace',
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    particleColors: ['#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0', '#047857'],
    formulas: ['π', 'σ', 'λ', 'Ω', 'μ', 'h', 'ℏ', 'E=mc²', 'F=ma', 'V=IR', 'p=mv', 'ΔE=hν'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(110, 231, 183, ${alpha * 0.22})`
        : `rgba(5, 150, 105, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'atom') {
        // Nucleus
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2)
        ctx.fill()
        
        // Orbit 1
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, 0, 0, Math.PI * 2)
        ctx.lineWidth = 1.0
        ctx.stroke()
        
        // Orbit 2
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, Math.PI / 3, 0, Math.PI * 2)
        ctx.stroke()
        
        // Orbit 3
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, size * 8.5, size * 2.5, -Math.PI / 3, 0, Math.PI * 2)
        ctx.stroke()
        
        // Animated Electrons
        ctx.fillStyle = ctx.strokeStyle
        const orbits = [0, Math.PI / 3, -Math.PI / 3]
        orbits.forEach((angle, idx) => {
          const tVal = (Date.now() * 0.0025 + idx * Math.PI / 1.5) % (Math.PI * 2)
          const A = size * 8.5
          const B = size * 2.5
          const xl = A * Math.cos(tVal)
          const yl = B * Math.sin(tVal)
          const x = p.x + xl * Math.cos(angle) - yl * Math.sin(angle)
          const y = p.y + xl * Math.sin(angle) + yl * Math.cos(angle)
          
          ctx.beginPath()
          ctx.arc(x, y, size * 1.2, 0, Math.PI * 2)
          ctx.fill()
        })
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.30) return 'atom'
      if (rand < 0.70) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة شريف فيزياء', en: 'Sherif Physics Platform' },
      hero_title_a: { ar: 'علم الفيزياء الكلاسيكية', en: 'Classical Physics' },
      hero_title_b: { ar: 'افهم قوانين الطبيعة', en: 'Discover Nature Laws' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في الفيزياء - شرح مبسط وتطبيقات عملية تجعلك تفهم الطبيعة والكون من حولك بسهولة.',
        en: 'An educational platform specializing in physics - simplified explanations and practical applications that help you understand nature.'
      }
    },
    teacher: {
      name: { ar: 'شريف محمد', en: 'Sherif Mohamed' },
      role: { ar: 'مدرّس الفيزياء للثانوية العامة', en: 'Physics Teacher' },
      bio: {
        ar: 'شرح مبسط لقوانين الفيزياء الكلاسيكية والحديثة مع حلول عملية ونماذج تفاعلية لضمان الدرجات النهائية.',
        en: 'Simplified explanations of classical and modern physics with practical solutions and interactive models.'
      },
      quote: {
        ar: '«الفيزياء هي لغة الكون، وفهمها هو أول خطوة لتغيير العالم.»',
        en: '“Physics is the language of the universe, and understanding it is the first step to changing the world.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+12', en: '+12' },
      students_count: { ar: '+3,000', en: '+3,000' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
      target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'زورنا في مقرنا', en: 'Visit our center' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب.',
        en: 'Our main center for lectures and student follow-up.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  math: {
    themeClass: 'aa-math-theme',
    canvasFont: 'italic "Cinzel", serif',
    primaryColor: '#2563eb',
    secondaryColor: '#3b82f6',
    particleColors: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af'],
    formulas: ['π', 'σ', '∑', '√', '∫', '∞', 'f(x)', 'x²', 'a²+b²=c²', 'sin(θ)', 'cos(θ)', 'tan(θ)'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(96, 165, 250, ${alpha * 0.22})`
        : `rgba(37, 99, 219, ${alpha * 0.15})`
    },
    drawCustomShape: () => false,
    generateCustomShape: () => 'formula',
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة الرياضيات', en: 'Math Platform' },
      hero_title_a: { ar: 'علم الرياضيات', en: 'Mathematics Science' },
      hero_title_b: { ar: 'الأرقام بلغة الفهم', en: 'Numbers made easy' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في الرياضيات - شرح مبسط وتطبيقات عملية تجعلك تتفوق في المعادلات وتتقن الحساب هندسياً وجبرياً.',
        en: 'An educational platform specializing in mathematics - simplified explanations and practical applications that help you master equations.'
      }
    },
    teacher: {
      name: { ar: 'محمد علي', en: 'Mohamed Ali' },
      role: { ar: 'مدرّس الرياضيات القدير', en: 'Senior Mathematics Teacher' },
      bio: {
        ar: 'شرح مبسط لقواعد الحساب، الجبر، والهندسة بأساليب حديثة وحلول ذكية تؤهلك للتفوق والدرجة النهائية.',
        en: 'Simplified explanations of calculus, algebra, and geometry with modern techniques and smart solutions.'
      },
      quote: {
        ar: '«الرياضيات هي مفتاح كل العلوم، وفهمها يفتح لك أبواب المستقبل.»',
        en: '“Mathematics is the key to all sciences, and understanding it opens the doors to the future.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+15', en: '+15' },
      students_count: { ar: '+4,000', en: '+4,000' },
      satisfaction: { ar: '99%', en: '99%' },
      target_stage: { ar: 'الإعدادية والثانوية', en: 'Prep & Secondary' },
      target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'زورنا في مقرنا', en: 'Visit our center' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب.',
        en: 'Our main center for lectures and student follow-up.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  biology: {
    themeClass: 'aa-bio-theme',
    canvasFont: '"Quicksand", sans-serif',
    primaryColor: '#22c55e',
    secondaryColor: '#15803d',
    particleColors: ['#22c55e', '#15803d', '#4ade80', '#86efac', '#166534', '#14532d'],
    formulas: ['DNA', 'RNA', 'ATP', 'Cell', 'Plant', 'C₆H₁₂O₆', 'Bio', 'Genetics', 'Proteins'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(74, 222, 128, ${alpha * 0.22})`
        : `rgba(34, 197, 94, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'dna') {
        const length = size * 8
        const amplitude = size * 2.5
        
        // Draw links (rungs)
        ctx.beginPath()
        ctx.lineWidth = 0.8
        for (let xl = -length; xl <= length; xl += 4) {
          const phase = xl * 0.25 + (Date.now() * 0.0025)
          const y1 = amplitude * Math.sin(phase)
          const y2 = -amplitude * Math.sin(phase)
          ctx.moveTo(p.x + xl, p.y + y1)
          ctx.lineTo(p.x + xl, p.y + y2)
        }
        ctx.stroke()
        
        // Draw strands
        ctx.beginPath()
        ctx.lineWidth = 1.2
        for (let xl = -length; xl <= length; xl += 1) {
          const phase = xl * 0.25 + (Date.now() * 0.0025)
          const y1 = amplitude * Math.sin(phase)
          if (xl === -length) ctx.moveTo(p.x + xl, p.y + y1)
          else ctx.lineTo(p.x + xl, p.y + y1)
        }
        ctx.stroke()

        ctx.beginPath()
        for (let xl = -length; xl <= length; xl += 1) {
          const phase = xl * 0.25 + (Date.now() * 0.0025)
          const y2 = -amplitude * Math.sin(phase)
          if (xl === -length) ctx.moveTo(p.x + xl, p.y + y2)
          else ctx.lineTo(p.x + xl, p.y + y2)
        }
        ctx.stroke()
        return true
      }
      if (type === 'leaf') {
        const r = size * 6.0
        ctx.beginPath()
        // Left curve
        ctx.moveTo(p.x, p.y + r)
        ctx.bezierCurveTo(p.x - r * 0.75, p.y + r * 0.5, p.x - r * 0.75, p.y - r * 0.5, p.x, p.y - r)
        // Right curve
        ctx.bezierCurveTo(p.x + r * 0.75, p.y - r * 0.5, p.x + r * 0.75, p.y + r * 0.5, p.x, p.y + r)
        ctx.closePath()
        ctx.lineWidth = 1.3
        ctx.stroke()
        
        // Center spine / stem
        ctx.beginPath()
        ctx.moveTo(p.x, p.y + r)
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r * 0.9)
        ctx.lineWidth = 0.9
        ctx.stroke()
        
        // Side veins
        ctx.beginPath()
        ctx.lineWidth = 0.7
        // Lower veins
        ctx.moveTo(p.x, p.y + r * 0.4)
        ctx.lineTo(p.x - r * 0.4, p.y + r * 0.1)
        ctx.moveTo(p.x, p.y + r * 0.4)
        ctx.lineTo(p.x + r * 0.4, p.y + r * 0.1)
        // Middle veins
        ctx.moveTo(p.x, p.y - r * 0.1)
        ctx.lineTo(p.x - r * 0.45, p.y - r * 0.4)
        ctx.moveTo(p.x, p.y - r * 0.1)
        ctx.lineTo(p.x + r * 0.45, p.y - r * 0.4)
        // Upper veins
        ctx.moveTo(p.x, p.y - r * 0.5)
        ctx.lineTo(p.x - r * 0.3, p.y - r * 0.75)
        ctx.moveTo(p.x, p.y - r * 0.5)
        ctx.lineTo(p.x + r * 0.3, p.y - r * 0.75)
        ctx.stroke()
        return true
      }
      if (type === 'cell') {
        ctx.beginPath()
        ctx.arc(p.x, p.y, size * 4.5, 0, Math.PI * 2)
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(p.x - size * 1, p.y - size * 1, size * 1.5, 0, Math.PI * 2)
        ctx.fill()
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.25) return 'dna'
      if (rand < 0.40) return 'leaf'
      if (rand < 0.55) return 'cell'
      if (rand < 0.85) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة الأحياء', en: 'Biology Platform' },
      hero_title_a: { ar: 'علم الأحياء والخلية', en: 'Biology & Cells' },
      hero_title_b: { ar: 'أسرار الكائنات الحية', en: 'Secrets of Life' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في الأحياء - شرح تفاعلي ثلاثي الأبعاد يبسط فهم الكائنات الحية وجسم الإنسان.',
        en: 'An educational platform specializing in biology - interactive 3D explanations that simplify living organisms.'
      }
    },
    teacher: {
      name: { ar: 'شريف الأحياء', en: 'Sherif Biology' },
      role: { ar: 'مدرّس الأحياء والجيولوجيا القدير', en: 'Senior Biology Lecturer' },
      bio: {
        ar: 'خبرة طويلة في تدريس منهج الأحياء للثانوية العامة وتبسيطه للطلاب بأسلوب شيق ونماذج ثلاثية الأبعاد.',
        en: 'Long experience in teaching biology for secondary stages with interactive visual models.'
      },
      quote: {
        ar: '«الأحياء ليست مجرد حفظ، بل رحلة داخل أجهزة جسمك لتعرف كيف تعيش.»',
        en: '“Biology is not just memorization, it is a journey inside your body to understand life.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+12', en: '+12' },
      students_count: { ar: '+3,500', en: '+3,500' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
      target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'مقرنا الرئيسي', en: 'Visit our center' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا للمحاضرات التفاعلية والمراجعات العملية بدمنهور.',
        en: 'Our main center for lectures and practical reviews in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  science: {
    themeClass: 'aa-science-theme',
    canvasFont: '"Rajdhani", sans-serif',
    primaryColor: '#0ea5e9',
    secondaryColor: '#6366f1',
    particleColors: ['#0ea5e9', '#6366f1', '#38bdf8', '#818cf8', '#0284c7', '#4f46e5'],
    formulas: ['H₂O', 'CO₂', 'E=mc²', 'F=ma', 'Prism', 'Gravity', 'Magnet', 'Force', 'Refraction'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(129, 140, 248, ${alpha * 0.22})`
        : `rgba(14, 165, 233, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'glass') {
        ctx.beginPath()
        ctx.arc(p.x - size * 1.5, p.y - size * 1.5, size * 3.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(p.x + size * 0.5, p.y + size * 0.5)
        ctx.lineTo(p.x + size * 4.5, p.y + size * 4.5)
        ctx.lineWidth = 1.8
        ctx.stroke()
        return true
      }
      if (type === 'tube') {
        ctx.beginPath()
        ctx.arc(p.x, p.y - size * 2.5, size * 2, Math.PI, 0)
        ctx.lineTo(p.x + size * 2, p.y + size * 2)
        ctx.arc(p.x, p.y + size * 2, size * 2, 0, Math.PI)
        ctx.closePath()
        ctx.lineWidth = 1.2
        ctx.stroke()
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.20) return 'glass'
      if (rand < 0.40) return 'tube'
      if (rand < 0.75) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة العلوم', en: 'Science Platform' },
      hero_title_a: { ar: 'مادة العلوم العامة', en: 'General Science' },
      hero_title_b: { ar: 'اكتشف عالم الطبيعة', en: 'Discover the World' },
      hero_sub: {
        ar: 'منصة تعليمية متكاملة لتبسيط منهج العلوم للمرحلة الإعدادية باستخدام أحدث الرسوم التوضيحية والتجارب.',
        en: 'An educational platform simplifying the prep stage science curriculum with modern illustrations.'
      }
    },
    teacher: {
      name: { ar: 'شريف علوم', en: 'Sherif Science' },
      role: { ar: 'مدرّس العلوم للمرحلة الإعدادية', en: 'General Science Teacher' },
      bio: {
        ar: 'خبير تدريس مادة العلوم للمرحلة الإعدادية مع تبسيط الأقسام الفيزيائية والكيميائية والأحيائية للطلاب.',
        en: 'Expert in teaching general science, bridging physics, chemistry, and biology concepts.'
      },
      quote: {
        ar: '«العلوم هي المغامرة التي تكشف لنا أسرار الكون من حولنا.»',
        en: '“Science is the adventure that reveals the secrets of the universe to us.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+10', en: '+10' },
      students_count: { ar: '+2,500', en: '+2,500' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'المرحلة الإعدادية', en: 'Preparatory Stage' },
      target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'مقرنا الرئيسي', en: 'Our Location' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب بدمنهور.',
        en: 'Our main center for lectures and student follow-up in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  geology: {
    themeClass: 'aa-geo-theme',
    canvasFont: '"Outfit", sans-serif',
    primaryColor: '#d97706',
    secondaryColor: '#78350f',
    particleColors: ['#d97706', '#78350f', '#f59e0b', '#b45309', '#92400e', '#fef3c7'],
    formulas: ['SiO₂', 'CaCO₃', 'Fe₂O₃', 'القشرة الأرضية', 'الوشاح', 'اللب', 'صخور', 'طبقات الأرض', 'بركان'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(251, 191, 36, ${alpha * 0.22})`
        : `rgba(180, 83, 9, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'crystal') {
        const r = size * 6.5
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - r)
        ctx.lineTo(p.x + r * 0.8, p.y)
        ctx.lineTo(p.x, p.y + r)
        ctx.lineTo(p.x - r * 0.8, p.y)
        ctx.closePath()
        ctx.lineWidth = 1.2
        ctx.stroke()
        
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - r)
        ctx.lineTo(p.x, p.y + r)
        ctx.moveTo(p.x - r * 0.8, p.y)
        ctx.lineTo(p.x + r * 0.8, p.y)
        ctx.lineWidth = 0.8
        ctx.stroke()
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.35) return 'crystal'
      if (rand < 0.70) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة الجيولوجيا', en: 'Geology Platform' },
      hero_title_a: { ar: 'علم الأرض والجيولوجيا', en: 'Geology Science' },
      hero_title_b: { ar: 'أسرار الصخور والطبقات', en: 'Rocks & Layers' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في الجيولوجيا وعلوم البيئة - شرح مفصل بالخرائط والصور لكافة التراكيب الجيولوجية الصعبة.',
        en: 'An educational platform specializing in geology and environmental sciences with maps and structures.'
      }
    },
    teacher: {
      name: { ar: 'شريف جيولوجيا', en: 'Sherif Geology' },
      role: { ar: 'مدرّس الجيولوجيا وعلوم البيئة', en: 'Geology Teacher' },
      bio: {
        ar: 'شرح مبسط لكافة التراكيب الصخرية، الفوالق، والألواح التكتونية بأسلوب علمي تفاعلي لضمان الدرجة النهائية.',
        en: 'Simplified geology lectures covering rock structures, faults, and plate tectonics.'
      },
      quote: {
        ar: '«الأرض كتاب مفتوح، والجيولوجيا تعلمك كيف تقرأ لغة الصخور وتفهم تاريخ كوكبنا.»',
        en: '“Earth is an open book, and geology teaches you how to read the language of rocks.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+12', en: '+12' },
      students_count: { ar: '+3,500', en: '+3,500' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
      target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'مقرنا الرئيسي', en: 'Our Location' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للدروس العملية ومتابعة الطلاب بدمنهور.',
        en: 'Our main center for lectures and student follow-up in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  english: {
    themeClass: 'aa-english-theme',
    canvasFont: 'italic "Playfair Display", serif',
    primaryColor: '#ec4899',
    secondaryColor: '#db2777',
    particleColors: ['#ec4899', '#db2777', '#f472b6', '#fbcfe8', '#be185d', '#9d174d'],
    formulas: ['Hello', 'World', 'Verb', 'Noun', 'English', 'A', 'B', 'C', 'Grammar', 'Poetry', 'Drama'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(244, 114, 182, ${alpha * 0.22})`
        : `rgba(236, 72, 153, ${alpha * 0.15})`
    },
    drawCustomShape: () => false,
    generateCustomShape: () => 'formula',
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة اللغة الإنجليزية', en: 'English Platform' },
      hero_title_a: { ar: 'اللغة الإنجليزية', en: 'English Language' },
      hero_title_b: { ar: 'اتقان الطلاقة والقواعد', en: 'Fluency & Grammar' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في اللغة الإنجليزية - مراجعات تفاعلية وطرق حديثة لشرح القواعد والنصوص الأدبية بيسر.',
        en: 'An educational platform specializing in English - interactive reviews and modern methods to explain grammar and literature.'
      }
    },
    teacher: {
      name: { ar: 'شريف إنجليزي', en: 'Sherif English' },
      role: { ar: 'خبير اللغة الإنجليزية للثانوية العامة', en: 'English Language Expert' },
      bio: {
        ar: 'تبسيط شامل لمنهج اللغة الإنجليزية، القواعد والنصوص والترجمة، باستخدام طرق تعليمية حديثة وممتعة.',
        en: 'Comprehensive tutoring of the English curriculum, grammar, and translation with modern methodologies.'
      },
      quote: {
        ar: '“English is not just a subject, it is a global bridge to your future career and dreams.”',
        en: '“English is not just a subject, it is a global bridge to your future career and dreams.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+15', en: '+15' },
      students_count: { ar: '+5,000', en: '+5,000' },
      satisfaction: { ar: '99%', en: '99%' },
      target_stage: { ar: 'المرحلة الثانوية', en: 'Secondary Stage' },
      target_stage_label: { ar: 'المرحلة التي يدرّسها', en: 'Stage he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'تواصل معنا', en: 'Contact us' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي بدمنهور للمحاضرات وورش العمل.',
        en: 'Our main center in Damanhour for lectures and workshops.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الخميس', en: 'Sat - Thu' },
      hours_time: { ar: '٩ صباحاً - ٩ مساءً', en: '9 AM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  humanities: {
    themeClass: 'aa-humanities-theme',
    canvasFont: '"Amiri", serif',
    primaryColor: '#b45309',
    secondaryColor: '#d97706',
    particleColors: ['#b45309', '#d97706', '#f59e0b', '#fef3c7', '#78350f', '#d97706'],
    formulas: ['مصر', 'النيل', 'التاريخ', 'الجغرافيا', 'خريطة', 'القاهرة', 'حضارة', 'أهرامات', 'وطن'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(251, 191, 36, ${alpha * 0.22})`
        : `rgba(180, 83, 9, ${alpha * 0.15})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'compass') {
        const r = size * 6.5
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - r)
        ctx.lineTo(p.x + size * 1.5, p.y - size * 1.5)
        ctx.lineTo(p.x + r, p.y)
        ctx.lineTo(p.x + size * 1.5, p.y + size * 1.5)
        ctx.lineTo(p.x, p.y + r)
        ctx.lineTo(p.x - size * 1.5, p.y + size * 1.5)
        ctx.lineTo(p.x - r, p.y)
        ctx.lineTo(p.x - size * 1.5, p.y - size * 1.5)
        ctx.closePath()
        ctx.lineWidth = 1.2
        ctx.stroke()
        
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - r)
        ctx.lineTo(p.x, p.y + r)
        ctx.moveTo(p.x - r, p.y)
        ctx.lineTo(p.x + r, p.y)
        ctx.lineWidth = 0.8
        ctx.stroke()
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.35) return 'compass'
      if (rand < 0.70) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة الدراسات الاجتماعية', en: 'Humanities Platform' },
      hero_title_a: { ar: 'الجغرافيا والتاريخ', en: 'Geography & History' },
      hero_title_b: { ar: 'رحلة عبر التاريخ والجغرافيا', en: 'Journey Through Time' },
      hero_sub: {
        ar: 'منصة تعليمية متخصصة في التاريخ والجغرافيا - شرح مبسط للخرائط والأحداث التاريخية بأسلوب سردي ممتع وسهل الحفظ.',
        en: 'An educational platform specializing in history and geography - simplifying maps and historical events.'
      }
    },
    teacher: {
      name: { ar: 'شريف المواد الأدبية', en: 'Sherif Humanities' },
      role: { ar: 'مدرّس التاريخ والجغرافيا للمرحلتين الإعدادية والثانوية', en: 'History & Geography Teacher' },
      bio: {
        ar: 'شرح مفصل لكافة الأحداث والخرائط التاريخية والجغرافية بأساليب تعليمية حديثة تعزز الحفظ والفهم.',
        en: 'Detailed lectures covering geography maps and historical events with modern tools.'
      },
      quote: {
        ar: '«التاريخ يعلمنا من أين أتينا، والجغرافيا ترسم لنا أين نحن ذاهبون.»',
        en: '“History teaches us where we came from, and geography shows where we are going.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+15', en: '+15' },
      students_count: { ar: '+3,500', en: '+3,500' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'الإعدادية والثانوية', en: 'Prep & Secondary' },
      target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'مقرنا الرئيسي', en: 'Our Location' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للدروس العملية ومتابعة الطلاب بدمنهور.',
        en: 'Our main center for lectures and student follow-up in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  cyber: {
    themeClass: 'aa-cyber-theme',
    canvasFont: '"Fira Code", monospace',
    primaryColor: '#10b981',
    secondaryColor: '#06b6d4',
    particleColors: ['#10b981', '#06b6d4', '#059669', '#34d399', '#6ee7b7', '#0891b2'],
    formulas: ['01', '10', 'if', 'for', 'code', 'HTML', 'JS', 'C++', 'Python', 'Query', 'Binary'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(110, 231, 183, ${alpha * 0.22})`
        : `rgba(6, 182, 212, ${alpha * 0.15})`
    },
    drawCustomShape: () => false,
    generateCustomShape: () => 'formula',
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة البرمجة والبكالوريا', en: 'Cyber Baccalaureate' },
      hero_title_a: { ar: 'الحاسب الآلي والبرمجة', en: 'Computer & Coding' },
      hero_title_b: { ar: 'نظام البكالوريا الحديثة بمصر', en: 'Modern Baccalaureate' },
      hero_sub: {
        ar: 'منصة متخصصة في تدريس الحاسب الآلي والبرمجة لنظام البكالوريا الحديث في مصر - شرح متكامل لأقوى لغات البرمجة ونظم التكنولوجيا الحديثة.',
        en: 'A specialized platform for computer science and coding under the modern Egyptian Baccalaureate educational system.'
      }
    },
    teacher: {
      name: { ar: 'خبير البرمجيات شريف', en: 'Sherif Computer Expert' },
      role: { ar: 'محاضر الحاسب الآلي والبرمجة لنظام البكالوريا الحديث', en: 'Baccalaureate Computer Science Lecturer' },
      bio: {
        ar: 'أقدم شرحاً تفاعلياً مميزاً لنظم التكنولوجيا وقواعد البرمجة الحديثة لتهيئة طلاب نظام البكالوريا للمستقبل التقني.',
        en: 'Interactive coding courses and computer science lectures tailored for the modern Baccalaureate framework.'
      },
      quote: {
        ar: '«البرمجة ليست مجرد كتابة كود، بل هي التفكير المنطقي والقدرة على حل مشكلات المستقبل.»',
        en: '“Coding is not just writing lines of code, it is logical thinking and the power to solve future problems.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+12', en: '+12' },
      students_count: { ar: '+3,500', en: '+3,500' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'البكالوريا المصرية', en: 'Egyptian Baccalaureate' },
      target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'تواصل معنا', en: 'Contact us' },
      title: { ar: 'موقع السنتر', en: 'Our Location' },
      description: {
        ar: 'مقرنا الرئيسي للمحاضرات العملية ومتابعة الطلاب بدمنهور.',
        en: 'Our main center for lectures and student follow-up in Damanhour.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 100 000 0000',
      hours_days: { ar: 'السبت - الأربعاء', en: 'Sat - Wed' },
      hours_time: { ar: '٣ مساءً - ٩ مساءً', en: '3 PM - 9 PM' },
      directions_link: 'https://maps.google.com',
      whatsapp_link: 'https://wa.me/201000000000'
    }
  },
  default: {
    themeClass: 'aa-default-theme',
    canvasFont: '"Aref Ruqaa", serif',
    primaryColor: '#764ba2',
    secondaryColor: '#667eea',
    particleColors: ['#764ba2', '#667eea', '#06b6d4', '#ec4899', '#f59e0b', '#10b981'],
    formulas: ['ض', 'الضاد', 'لغة الضاد', 'أ', 'ب', 'ت', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي', 'ـَ', 'ـُ', 'ـِ', 'ـّ'],
    getLineColor: (theme, alpha) => {
      return theme === 'dark'
        ? `rgba(102, 126, 234, ${alpha * 0.35})`
        : `rgba(118, 75, 162, ${alpha * 0.25})`
    },
    drawCustomShape: (ctx, p, size) => {
      const type = p.type || p.shapeType
      if (type === 'dhad') {
        ctx.font = `bold ${Math.round(size * 9.5)}px "Aref Ruqaa", "Amiri", "Tajawal", serif`
        ctx.fillText('ض', p.x - size * 4.5, p.y + size * 3)
        return true
      }
      if (type === 'aldhad') {
        ctx.font = `bold ${Math.round(size * 7)}px "Aref Ruqaa", "Amiri", "Tajawal", serif`
        ctx.fillText('الضاد', p.x - size * 6, p.y + size * 2.5)
        return true
      }
      return false
    },
    generateCustomShape: () => {
      const rand = Math.random()
      if (rand < 0.25) return 'dhad'
      if (rand < 0.45) return 'aldhad'
      if (rand < 0.85) return 'formula'
      return 'circle'
    },
    logoUrl: null,
    branding: {
      brand_short: { ar: 'منصة مسار التعليمية', en: 'Masar Educational Platform' },
      hero_title_a: { ar: 'اللغة العربية', en: 'Arabic Language' },
      hero_title_b: { ar: 'لغة الضاد بطعم جديد', en: 'made enjoyable' },
      hero_sub: {
        ar: 'منصة تعليمية متخصّصة في اللغة العربية — سجّل حسابك، يتم اعتماده، وابدأ رحلتك مع شرح يخلّيك تفهم وتحب اللغة.',
        en: 'A learning platform dedicated to Arabic. Create your account, get approved, and start learning with a teacher who makes the language click.'
      }
    },
    teacher: {
      name: { ar: 'عبدالرحمن علاء', en: 'Abdelrahman Alaa' },
      role: { ar: 'مدرّس اللغة العربية', en: 'Arabic Language Teacher' },
      bio: {
        ar: 'بشرح اللغة العربية بأسلوب بسيط وحديث يقرّب القواعد والنحو والأدب لذهن الطالب. هدفي إن كل طالب يطلع من الدرس فاهم ومستمتع — مش بس حافظ.',
        en: 'I teach Arabic with a modern, approachable style that brings grammar, syntax, and literature to life. My goal: every student walks out understanding — not just memorising.'
      },
      quote: {
        ar: '«اللغة العربية مش صعبة — محتاجة بس حد يقدّمها بطريقة صح.»',
        en: '“Arabic isn\'t hard — it just needs to be taught the right way.”'
      },
      image_base: '/images/profile.png',
      image_hover: '/images/me.png',
      experience: { ar: '+10', en: '+10' },
      students_count: { ar: '+2,000', en: '+2,000' },
      satisfaction: { ar: '98%', en: '98%' },
      target_stage: { ar: 'الإعدادية والثانوية', en: 'Prep & Secondary' },
      target_stage_label: { ar: 'المراحل التي يدرّسها', en: 'Stages he teaches' },
      learning_system: { ar: 'أونلاين تفاعلي', en: 'Online Interactive' }
    },
    socials: {
      facebook: 'https://www.facebook.com',
      whatsapp: 'https://wa.me/',
      instagram: 'https://www.instagram.com',
      youtube: 'https://www.youtube.com',
      tiktok: 'https://www.tiktok.com'
    },
    location: {
      kicker: { ar: 'زورنا', en: 'Visit us' },
      title: { ar: 'موقعنا على الخريطة', en: 'Find Us on the Map' },
      description: {
        ar: 'تقدر تزورنا في مقرّنا بدمنهور — قريب وسهل توصله.',
        en: 'Drop by our center in Damanhour — easy to find and easy to reach.'
      },
      address: { ar: 'دمنهور، البحيرة', en: 'Damanhour, Beheira' },
      country: { ar: 'جمهورية مصر العربية', en: 'Arab Republic of Egypt' },
      map_iframe_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3412.5!2d30.4272213!3d31.0379878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDAyJzE2LjgiTiAzMMKwMjUnMzguMCJF!5e0!3m2!1sen!2seg!4v1700000000000',
      phone: '+20 XXX XXX XXXX',
      hours_days: { ar: 'السبت – الخميس', en: 'Sat – Thu' },
      hours_time: { ar: '٩ صباحًا – ٩ مساءً', en: '9 AM – 9 PM' },
      directions_link: 'https://maps.app.goo.gl/W93aUn2jgM7cb2tT7',
      whatsapp_link: 'https://wa.me/20XXXXXXXXXX'
    }
  }
}

/**
 * Resolves the configuration for a given tenant.
 * @param {Object} tenant 
 * @param {string} tenantSlug 
 */
export function getTenantThemeConfig(tenant, tenantSlug) {
  const subject = tenant?.config?.subject || ''
  
  if (subject === 'chemistry' || tenantSlug === 'mona-chem') {
    return tenantThemes.chemistry
  }
  
  if (subject === 'physics' || tenantSlug === 'sherif-physics') {
    return tenantThemes.physics
  }

  if (subject === 'math' || subject === 'mathematics' || tenantSlug?.includes('math')) {
    return tenantThemes.math
  }

  if (subject === 'biology' || tenantSlug?.includes('bio')) {
    return tenantThemes.biology
  }

  if (subject === 'science' || tenantSlug?.includes('science')) {
    return tenantThemes.science
  }

  if (subject === 'geology' || tenantSlug?.includes('geo')) {
    return tenantThemes.geology
  }

  if (subject === 'english' || tenantSlug?.includes('english') || tenantSlug?.includes('eng')) {
    return tenantThemes.english
  }

  if (subject === 'humanities' || subject === 'geography' || subject === 'history' || tenantSlug?.includes('humanities') || tenantSlug?.includes('geo-hist')) {
    return tenantThemes.humanities
  }

  if (subject === 'cyber' || subject === 'computer' || subject === 'programming' || tenantSlug?.includes('cyber') || tenantSlug?.includes('prog') || tenantSlug?.includes('baccalaureate')) {
    return tenantThemes.cyber
  }
  
  return tenantThemes.default
}

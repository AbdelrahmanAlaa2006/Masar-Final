import { useNavigate } from 'react-router-dom'
import './PolicyPage.css'

const SECTIONS = [
  {
    icon: 'fa-circle-info',
    title: 'تعريف المنصّة',
    body: 'منصة «مسار» هي منصة تعليمية إلكترونية موجّهة لطلاب المرحلة الإعدادية، تقدّم محاضرات وفيديوهات وامتحانات تحت إشراف المعلم. باستخدامك للمنصة فأنت توافق على الشروط الموضّحة في هذه الصفحة.',
    bullets: null,
  },
  {
    icon: 'fa-user-shield',
    title: 'الحساب الشخصي',
    body: 'يُمنح الحساب من قِبَل المعلم بعد تسجيل الطالب رسمياً. الطالب مسؤول عن:',
    bullets: [
      'الحفاظ على سرية بيانات الدخول وعدم مشاركتها مع أي شخص آخر.',
      'استخدام الحساب من جهازه الشخصي فقط — أي مشاركة قد تؤدي إلى إيقافه.',
      'إبلاغ المعلم فوراً عند الاشتباه في استخدام غير مصرّح به للحساب.',
    ],
  },
  {
    icon: 'fa-ban',
    title: 'الاستخدام المقبول',
    body: 'يتعهّد الطالب بعدم القيام بأي مما يلي:',
    bullets: [
      'محاولة تنزيل أو نسخ الفيديوهات أو محتوى الامتحانات.',
      'الغش بأي شكل في الامتحانات (بما في ذلك مشاركة الإجابات أو استخدام أدوات خارجية).',
      'محاولة الوصول إلى محتوى لمراحل دراسية غير مسجَّل بها.',
      'محاولة اختراق أو إساءة استخدام أي جزء من المنصّة.',
    ],
  },
  {
    icon: 'fa-copyright',
    title: 'الملكية الفكرية',
    body: 'جميع المحتويات (فيديوهات، شروحات، أسئلة، تصاميم) ملك حصري لمنصّة مسار والمعلمين المتعاونين. لا يُسمح بإعادة نشرها أو توزيعها أو استخدامها تجارياً تحت أي ظرف. أي مخالفة قد تعرّض صاحبها للمساءلة القانونية.',
    bullets: null,
  },
  {
    icon: 'fa-gavel',
    title: 'إيقاف الحساب',
    body: 'تحتفظ إدارة المنصّة بحقّ إيقاف أو حذف أي حساب بشكل فوري وبدون إشعار مسبق في حالات: محاولة الغش، تسريب المحتوى، مشاركة الحساب، أو أي انتهاك لهذه الشروط. لا يحقّ للطالب المطالبة باسترداد أي رسوم في حال الإيقاف بسبب مخالفة.',
    bullets: null,
  },
  {
    icon: 'fa-rotate',
    title: 'تعديل الشروط',
    body: 'قد يتم تحديث هذه الشروط من وقت لآخر. سيُعلَن عن أي تغيير جوهري داخل المنصّة. استمرار استخدامك للمنصّة بعد التحديث يعني موافقتك على النسخة الجديدة من الشروط.',
    bullets: null,
  },
]

export default function Terms() {
  const navigate = useNavigate()

  return (
    <main className="pp-page" dir="rtl">
      <div className="pp-container">
        <button className="pp-back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-right"></i> رجوع
        </button>

        <div className="pp-hero">
          <div className="pp-hero-icon"><i className="fas fa-file-contract"></i></div>
          <h1>شروط الاستخدام</h1>
          <p>الشروط التي تحكم استخدامك لمنصّة مسار التعليمية. يرجى قراءتها بعناية قبل استخدام المنصّة.</p>
          <div className="pp-meta">آخر تحديث: يناير 2026</div>
        </div>

        {SECTIONS.map((s, i) => (
          <div key={i} className="pp-card">
            <h2>
              <span className="pp-num"><i className={`fas ${s.icon}`}></i></span>
              {s.title}
            </h2>
            <p>{s.body}</p>
            {s.bullets && (
              <ul>{s.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            )}
          </div>
        ))}

        <div className="pp-contact-card">
          <h3>لديك سؤال حول الشروط؟</h3>
          <p>راسلنا وسنوضّح لك أي بند تحتاج فهمه.</p>
          <div className="pp-contact-row">
            <a href="mailto:legal@masar.edu"><i className="fas fa-envelope"></i> legal@masar.edu</a>
          </div>
        </div>
      </div>
    </main>
  )
}

/* Default home-page marquee announcements. A tenant overrides these via
   config.announcements (array of { icon, text }); an explicit empty array
   hides the strip entirely. Shared by Home.jsx and the super admin editor. */
export const DEFAULT_ANNOUNCEMENTS = [
  { icon: '🚀', text: 'قريبًا: دورات مكثفة للمرحلة الإعدادية' },
  { icon: '📅', text: 'امتحانات شهرية جديدة كل أسبوع' },
  { icon: '🎁', text: 'خصومات خاصة لأوائل المشتركين' },
  { icon: '🎥', text: 'فيديوهات حصرية قادمة هذا الشهر' },
  { icon: '💬', text: 'انضم لمجتمع الطلاب على الواتساب' },
  { icon: '🏆', text: 'مسابقة شهرية بجوائز قيمة' },
]

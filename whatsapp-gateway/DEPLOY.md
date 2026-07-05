# نشر بوابة الواتساب (خطوات قليلة جداً لاحقاً)

كل التجهيز جاهز. عند الحاجة، اختر أحد المسارين — لن يستغرق أكثر من دقائق.

الأشياء الثلاثة السرية التي ستطلبها أي استضافة:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  (من Supabase → Project Settings → API → service_role)

> مهم: لا تستخدم الخطط المجانية التي «تنام» بعد فترة خمول (مثل Render Free) —
> فهي تقطع جلسة الواتساب وتجبر المعلمين على إعادة مسح الـ QR. استخدم خطة صغيرة
> دائمة التشغيل (~5–7 دولار/شهر) أو جهازاً يعمل ٢٤ ساعة.

---

## المسار (أ) — Render (الأسهل)
1. ادفع المشروع إلى GitHub.
2. Render → **New +** → **Blueprint** → اختر المستودع.
   (سيقرأ ملف `render.yaml` تلقائياً: يضبط مجلد المشروع، القرص الدائم، وأمر التشغيل.)
3. الصق القيم الثلاثة السرية عندما يطلبها.
4. Deploy. ستحصل على رابط مثل `https://masaar-whatsapp-gateway.onrender.com`.

## المسار (ب) — أي VPS / Railway / Fly (عبر Docker)
```bash
# على الخادم
docker build -t masaar-wa ./whatsapp-gateway
docker run -d --name masaar-wa -p 8790:8790 \
  -v wa_sessions:/data \
  -e SUPABASE_URL=... \
  -e SUPABASE_ANON_KEY=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  masaar-wa
```
(الـ volume باسم `wa_sessions` يحفظ جلسات الواتساب بين عمليات إعادة التشغيل.)

## المسار (ج) — جهاز يعمل دائماً (مجاني)
على أي كمبيوتر/راسبيري باي يعمل ٢٤ ساعة:
```bash
cd whatsapp-gateway
cp .env.example .env   # املأ القيم
npm install
npm start
```
(للتشغيل الدائم استخدم `pm2`: `npm i -g pm2 && pm2 start server.js --name masaar-wa && pm2 save`.)

---

## الخطوة الأخيرة (مشتركة لكل المسارات)
في ملف `.env` الخاص بالتطبيق (الواجهة) ضع رابط الخادم:
```
VITE_WHATSAPP_GATEWAY_URL=https://your-server-url
```
ثم أعد بناء/نشر التطبيق. سيظهر كارت «الإرسال التلقائي المجاني» تلقائياً لكل المعلمين،
ويربط كل معلم واتسابه بمسح QR داخل التطبيق — بدون تشغيل أي شيء على أجهزتهم.

## للتأكد أن الخادم يعمل
افتح في المتصفح: `https://your-server-url/health` — يجب أن يرد `{"ok":true}`.

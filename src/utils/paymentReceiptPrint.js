import { GRADE_LABEL } from '../pages/ControlPanel/shared'

/**
 * Formats date and time in Arabic / Egyptian locale.
 */
function formatReceiptDateTime(dateStr) {
  if (!dateStr) return { date: '—', time: '—' }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return { date: String(dateStr), time: '—' }

  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const date = `${day}/${month}/${year}`

  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'م' : 'ص'
  hours = hours % 12 || 12
  const time = `${hours}:${minutes} ${ampm}`

  return { date, time }
}

/**
 * Escapes HTML characters to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generates an isolated HTML document for thermal receipt printing and opens the print dialog.
 * 
 * @param {Object} options
 * @param {Object} options.payment - The student_ledger payment record
 * @param {Object} [options.student] - Optional student profile object if not attached to payment.profiles
 * @param {Object} [options.tenant] - Active tenant branding/name from TenantContext
 * @param {string} [options.adminName] - Current secretary/admin name who handled the receipt
 */
export function printThermalPaymentReceipt({ payment, student = null, tenant = null, adminName = null }) {
  if (!payment) return

  const studentData = payment.profiles || student || {}
  const studentName = studentData.name || 'طالب'
  const studentGrade = GRADE_LABEL[studentData.grade] || studentData.grade || ''
  const studentGroup = studentData.group || studentData['group'] || ''
  const studentPhone = studentData.phone || ''

  const tenantName = tenant?.name || 'المنصة التعليمية'
  const receiptNumber = payment.id ? payment.id.slice(0, 8).toUpperCase() : '------'
  
  // Use transaction_date if available (actual payment date), fallback to created_at
  const dateSource = payment.transaction_date || payment.created_at || new Date().toISOString()
  const { date: receiptDate, time: receiptTime } = formatReceiptDateTime(payment.created_at || payment.transaction_date)
  const actualDateFormatted = payment.transaction_date ? formatReceiptDateTime(payment.transaction_date).date : receiptDate

  const packageName = payment.package_name || payment.description || payment.billing_period || 'اشتراك شهري'
  const amount = Number(payment.amount || 0).toLocaleString('en-US')
  
  let methodLabel = 'دفع نقدي'
  if (payment.payment_method === 'InstaPay') methodLabel = 'تحويل InstaPay'
  else if (payment.payment_method === 'Vodafone Cash' || payment.payment_method === 'E-wallet') methodLabel = 'محفظة إلكترونية'
  else if (payment.payment_method) methodLabel = payment.payment_method

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>إيصال دفع — ${escapeHtml(studentName)}</title>
  <style>
    @page {
      size: 72mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 72mm;
      max-width: 72mm;
      margin: 0 auto;
      padding: 4mm 3mm 8mm 3mm;
      font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 11.5px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      direction: rtl;
    }
    .receipt-header {
      text-align: center;
      margin-bottom: 6px;
    }
    .tenant-title {
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 2px;
    }
    .receipt-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 800;
      border: 1.5px solid #000;
      padding: 2px 10px;
      border-radius: 4px;
      margin: 3px 0 6px 0;
      letter-spacing: 0.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
      margin-bottom: 2px;
    }
    .meta-label {
      color: #222;
      font-weight: 600;
    }
    .meta-value {
      font-weight: 700;
    }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .solid-divider {
      border: none;
      border-top: 1.5px solid #000;
      margin: 6px 0;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin: 3px 0;
    }
    .info-table td {
      padding: 2px 0;
      vertical-align: top;
    }
    .info-table .lbl {
      width: 32%;
      font-weight: 600;
      color: #222;
      font-size: 11px;
    }
    .info-table .val {
      width: 68%;
      font-weight: 700;
      font-size: 11.5px;
      text-align: right;
    }
    .student-name-val {
      font-size: 13px;
      font-weight: 800;
    }
    .total-box {
      background: #f4f4f4;
      border: 1.5px solid #000;
      padding: 6px 8px;
      margin: 6px 0;
      text-align: center;
      border-radius: 4px;
    }
    .total-label {
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .total-amount {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .status-badge {
      text-align: center;
      font-size: 11.5px;
      font-weight: 800;
      margin: 6px 0 2px 0;
    }
    .footer-notes {
      text-align: center;
      font-size: 9px;
      color: #444;
      margin-top: 6px;
      line-height: 1.3;
    }
    @media print {
      body {
        width: 100%;
        max-width: 100%;
        padding: 2mm;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-header">
    <div class="tenant-title">${escapeHtml(tenantName)}</div>
    <div class="receipt-badge">إيصال استلام نقدية</div>
  </div>

  <div class="meta-row">
    <span class="meta-label">رقم العملية:</span>
    <span class="meta-value">#${escapeHtml(receiptNumber)}</span>
  </div>
  <div class="meta-row">
    <span class="meta-label">التاريخ:</span>
    <span class="meta-value">${escapeHtml(actualDateFormatted)}</span>
  </div>
  <div class="meta-row">
    <span class="meta-label">الوقت:</span>
    <span class="meta-value">${escapeHtml(receiptTime)}</span>
  </div>

  <hr class="solid-divider" />

  <table class="info-table">
    <tr>
      <td class="lbl">اسم الطالب:</td>
      <td class="val student-name-val">${escapeHtml(studentName)}</td>
    </tr>
    ${studentGrade ? `<tr>
      <td class="lbl">المرحلة:</td>
      <td class="val">${escapeHtml(studentGrade)}</td>
    </tr>` : ''}
    ${studentGroup ? `<tr>
      <td class="lbl">المجموعة:</td>
      <td class="val">${escapeHtml(studentGroup)}</td>
    </tr>` : ''}
    ${studentPhone ? `<tr>
      <td class="lbl">رقم الهاتف:</td>
      <td class="val" style="direction:ltr; text-align:right;">${escapeHtml(studentPhone)}</td>
    </tr>` : ''}
  </table>

  <hr class="divider" />

  <table class="info-table">
    <tr>
      <td class="lbl">البيان / الشهر:</td>
      <td class="val">${escapeHtml(packageName)}</td>
    </tr>
    <tr>
      <td class="lbl">طريقة الدفع:</td>
      <td class="val">${escapeHtml(methodLabel)}</td>
    </tr>
    ${payment.admin_notes || payment.notes ? `<tr>
      <td class="lbl">ملاحظات:</td>
      <td class="val">${escapeHtml(payment.admin_notes || payment.notes)}</td>
    </tr>` : ''}
  </table>

  <div class="total-box">
    <div class="total-label">إجمالي المبلغ المدفوع</div>
    <div class="total-amount">${escapeHtml(amount)} ج.م</div>
  </div>

  <div class="status-badge">
    ✓ تم استلام المبلغ بنجاح وتفعيل الحساب
  </div>

  <hr class="divider" />

  <div class="footer-notes">
    ${adminName ? `المستلم: ${escapeHtml(adminName)}<br/>` : ''}
    شكراً لتعاونكم معنا — يرجى الاحتفاظ بهذا الإيصال
  </div>

  <script>
    (function() {
      try { window.focus(); } catch(e) {}
      setTimeout(function() {
        window.print();
        setTimeout(function() {
          try { window.close(); } catch(e) {}
        }, 500);
      }, 250);
    })();
  </script>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=400,height=600,menubar=no,toolbar=no,location=no,status=no')
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة (Popups) لتتمكن من طباعة إيصال الدفع.')
    return
  }

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

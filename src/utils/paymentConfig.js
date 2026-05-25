// paymentConfig.js — 중앙 결제 계정 정보
// You can easily modify these parameters to update the platform's payment details.

export const PAYMENT_CONFIG = {
  vodafoneCash: {
    number: '01007297960',
    label: '01007297960',
    qrOverride: '', // Optional: Add a custom local/web image URL (e.g. '/assets/voda-qr.png') if you have a static merchant QR code.
  },
  instaPay: {
    address: 'abdoalaa@instapay',
    label: 'abdoalaa@instapay',
    link: 'https://ipn.eg/S/abdoalaa', // Official deep link to redirect to the InstaPay app directly
    qrOverride: '', // Optional: Add a custom InstaPay QR image URL if preferred.
  }
}

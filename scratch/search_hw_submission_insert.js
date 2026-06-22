import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/src/pages/Homework.jsx', 'utf8')
const lines = content.split('\n')
lines.forEach((line, idx) => {
  if (line.includes('homework_submissions') || line.includes('submission_url') || line.includes('submission_key')) {
    console.log(`${idx + 1}: ${line.trim()}`)
  }
})

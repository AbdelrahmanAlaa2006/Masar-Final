import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/backend/homeworksApi.js', 'utf8')
const lines = content.split('\n')
lines.forEach((line, idx) => {
  if (line.includes('homework_submissions') || line.includes('submission_url') || line.includes('insert') || line.includes('submit')) {
    console.log(`${idx + 1}: ${line.trim()}`)
  }
})

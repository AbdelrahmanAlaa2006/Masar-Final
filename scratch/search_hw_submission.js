import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/src/pages/Homework.jsx', 'utf8')
const lines = content.split('\n')
lines.forEach((line, idx) => {
  if (line.includes('handleSubmit') || line.includes('uploadHomework') || line.includes('submission') || line.includes('note') || line.includes('graded')) {
    if (idx > 300) {
      console.log(`${idx + 1}: ${line.trim()}`)
    }
  }
})

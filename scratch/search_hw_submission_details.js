import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/src/pages/Homework.jsx', 'utf8')
const lines = content.split('\n')
for (let i = 329; i < 380; i++) {
  console.log(`${i + 1}: ${lines[i]}`)
}

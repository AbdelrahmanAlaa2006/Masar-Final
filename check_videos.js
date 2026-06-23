import fs from 'fs'

const content = fs.readFileSync('src/pages/Videos.jsx', 'utf8')
const lines = content.split('\n')
let found = false
lines.forEach((line, i) => {
  if (line.includes('gradeNames')) {
    console.log(`Line ${i + 1}: ${line}`)
    found = true
  }
})
if (!found) {
  console.log("No gradeNames references found in Videos.jsx")
}

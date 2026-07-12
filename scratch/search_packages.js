import fs from 'fs'

const content = fs.readFileSync('src/pages/Packages.jsx', 'utf8')
const lines = content.split('\n')

console.log("Searching for functions in Packages.jsx...")
const targets = ['remainingFor', 'effectiveMaxAttempts', 'effectiveExpiryFor', 'effectiveHoursFor', 'isVideoAllowed']
lines.forEach((line, idx) => {
  targets.forEach(target => {
    if (line.includes(`function ${target}`) || line.includes(`const ${target}`)) {
      console.log(`${idx + 1}: ${line.trim()}`)
    }
  })
})

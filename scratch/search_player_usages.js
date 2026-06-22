import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/src/pages/Videos.jsx', 'utf8')

const lines = content.split('\n')
lines.forEach((line, idx) => {
  if (line.includes('PlayerFacade') || line.includes('function PlayerFacade')) {
    console.log(`${idx + 1}: ${line.trim()}`)
  }
})



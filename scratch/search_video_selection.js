import fs from 'fs'

const content = fs.readFileSync('c:/Work/alaaaaaa/Masar-Final/src/pages/Videos.jsx', 'utf8')
console.log("Videos.jsx has videoId query param check:")
console.log(content.includes('videoId') || content.includes('video-id') || content.includes('activeVideo') || content.includes('selectedVideo'))

// Print some occurrences of video selection in Videos.jsx
const lines = content.split('\n')
for (let i = 0; i < 150; i++) {
  console.log(`${i + 1}: ${lines[i]}`)
}





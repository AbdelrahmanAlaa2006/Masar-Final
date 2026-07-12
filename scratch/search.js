import fs from 'fs'
import path from 'path'

const searchDir = (dir, query) => {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        searchDir(fullPath, query)
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        const content = fs.readFileSync(fullPath, 'utf8')
        if (content.includes(query)) {
          console.log(`Found "${query}" in: ${fullPath}`)
          const lines = content.split('\n')
          lines.forEach((line, idx) => {
            if (line.includes(query)) {
              console.log(`  Line ${idx + 1}: ${line.trim()}`)
            }
          })
        }
      }
    }
  }
}

const query = process.argv[2] || 'student_groups'
console.log(`Searching for "${query}"...`)
searchDir('.', query)

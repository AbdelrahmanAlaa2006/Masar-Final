import dotenv from 'dotenv'
dotenv.config()
console.log("Keys in env:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("DATABASE") || k.includes("PORT") || k.includes("KEY")))

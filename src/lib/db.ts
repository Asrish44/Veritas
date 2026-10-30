import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

// On Vercel serverless, root filesystem is read-only. Copy SQLite db to /tmp if using SQLite
if (process.env.VERCEL && (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:'))) {
  const tmpDbPath = '/tmp/custom.db'
  if (!fs.existsSync(/*turbopackIgnore: true*/ tmpDbPath)) {
    const src = path.join(process.cwd(), 'db', 'custom.db')
    if (fs.existsSync(/*turbopackIgnore: true*/ src)) {
      try {
        fs.copyFileSync(src, tmpDbPath)
      } catch (e) {
        console.error('Failed copying SQLite db to /tmp:', e)
      }
    }
  }
  process.env.DATABASE_URL = `file:${tmpDbPath}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
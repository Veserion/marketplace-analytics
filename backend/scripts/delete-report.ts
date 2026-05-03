import { prisma } from '../src/lib/prisma.js'
import { promises as fs } from 'fs'

async function main() {
  const organizationId = 'cmokhz4ws0003doiqo11rd8bq'

  console.log(`Deleting all reports for organization: ${organizationId}`)

  // Get all reports for this organization
  const reports = await prisma.wbApiReport.findMany({
    where: {
      organizationId,
      deletedAt: null,
    },
  })

  console.log(`Found ${reports.length} reports to delete`)

  // Delete files from file system
  for (const report of reports) {
    if (report.filePath) {
      const filePath = report.filePath.startsWith('/storage/wb-reports/')
        ? `./storage/wb-reports${report.filePath.replace('/storage/wb-reports', '')}`
        : report.filePath.startsWith('./storage/wb-reports/')
        ? report.filePath
        : `./storage/wb-reports${report.filePath}`

      try {
        await fs.unlink(filePath)
        console.log(`Deleted file: ${filePath}`)
      } catch (error) {
        console.log(`File not found or error deleting: ${filePath}`)
      }
    }
  }

  // Delete records from database
  const deleted = await prisma.wbApiReport.deleteMany({
    where: {
      organizationId,
    },
  })

  console.log(`Deleted ${deleted.count} reports from database`)
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

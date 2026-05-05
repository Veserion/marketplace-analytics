import type { Marketplace, PrismaClient } from '@prisma/client'
import { StoredArtifactStatus } from '@prisma/client'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { extractArticleDigits, normalizeArticleKey, parseCogsCsv } from './parser.js'

const COGS_STORAGE_BASE_PATH = process.env.COGS_STORAGE_PATH || path.join(process.env.HOME || '', 'storage', 'marketplace-cogs')

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

function getCogsFilePath(organizationId: string, marketplace: Marketplace, fileId: string): string {
  return path.join(COGS_STORAGE_BASE_PATH, organizationId, marketplace, `${fileId}.csv`)
}

export class MarketplaceCogsService {
  constructor(private prisma: PrismaClient) {}

  async getActiveCogsFile(organizationId: string, marketplace: Marketplace) {
    return this.prisma.marketplaceCogsFile.findFirst({
      where: {
        organizationId,
        marketplace,
        deletedAt: null,
        status: StoredArtifactStatus.ready,
      },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async assertConnectedMarketplace(organizationId: string, marketplace: Marketplace): Promise<void> {
    const connection = await this.prisma.marketplaceConnection.findUnique({
      where: {
        organizationId_marketplace: {
          organizationId,
          marketplace,
        },
      },
      select: {
        status: true,
        encryptedCredentials: true,
      },
    })

    if (!connection || connection.status !== 'connected' || !connection.encryptedCredentials) {
      throw new Error('Marketplace API key is required before uploading COGS.')
    }
  }

  async saveCogsFile(input: {
    organizationId: string
    userId: string
    marketplace: Marketplace
    fileName: string
    csvText: string
  }) {
    await this.assertConnectedMarketplace(input.organizationId, input.marketplace)
    const parsed = parseCogsCsv(input.csvText)

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceCogsFile.updateMany({
        where: {
          organizationId: input.organizationId,
          marketplace: input.marketplace,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      })

      const cogsFile = await tx.marketplaceCogsFile.create({
        data: {
          organizationId: input.organizationId,
          marketplace: input.marketplace,
          fileName: input.fileName,
          filePath: '',
          fileSize: BigInt(Buffer.byteLength(parsed.compactCsv, 'utf8')),
          fileHash: parsed.hash,
          rowsCount: parsed.rows.length,
          status: StoredArtifactStatus.processing,
          uploadedByUserId: input.userId,
        },
      })

      await tx.marketplaceCogsItem.createMany({
        data: parsed.rows.map((row) => ({
          organizationId: input.organizationId,
          marketplace: input.marketplace,
          cogsFileId: cogsFile.id,
          article: row.article,
          articleNormalized: normalizeArticleKey(row.article),
          articleDigits: extractArticleDigits(row.article),
          unitCost: row.unitCost,
        })),
      })

      return cogsFile
    })

    const filePath = getCogsFilePath(input.organizationId, input.marketplace, created.id)
    await ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, parsed.compactCsv, 'utf8')

    const readyFile = await this.prisma.marketplaceCogsFile.update({
      where: { id: created.id },
      data: {
        filePath,
        status: StoredArtifactStatus.ready,
      },
    })

    return {
      id: readyFile.id,
      marketplace: readyFile.marketplace,
      fileName: readyFile.fileName,
      rowsCount: readyFile.rowsCount,
      fileHash: readyFile.fileHash,
      updatedAt: readyFile.updatedAt.toISOString(),
    }
  }

  async getCogsMetadata(organizationId: string, marketplace: Marketplace) {
    const file = await this.getActiveCogsFile(organizationId, marketplace)
    if (!file) return null

    return {
      id: file.id,
      marketplace: file.marketplace,
      fileName: file.fileName,
      rowsCount: file.rowsCount,
      fileHash: file.fileHash,
      updatedAt: file.updatedAt.toISOString(),
    }
  }

  async readCogsCsv(organizationId: string, marketplace: Marketplace): Promise<{ fileName: string; csvText: string } | null> {
    const file = await this.getActiveCogsFile(organizationId, marketplace)
    if (!file) return null

    return {
      fileName: file.fileName,
      csvText: await fs.readFile(file.filePath, 'utf8'),
    }
  }

  async deleteCogsFile(organizationId: string, marketplace: Marketplace): Promise<void> {
    const file = await this.getActiveCogsFile(organizationId, marketplace)
    if (!file) return

    await this.prisma.marketplaceCogsFile.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    })
  }

  async getCogsCostMap(organizationId: string, marketplace: Marketplace, mode: 'full' | 'digits'): Promise<{
    cogsFileId: string | null
    cogsHash: string
    costByKey: Map<string, number>
  }> {
    const file = await this.getActiveCogsFile(organizationId, marketplace)
    if (!file) {
      return {
        cogsFileId: null,
        cogsHash: 'no-cogs',
        costByKey: new Map(),
      }
    }

    const rows = await this.prisma.marketplaceCogsItem.findMany({
      where: {
        organizationId,
        marketplace,
        cogsFileId: file.id,
      },
      select: {
        articleNormalized: true,
        articleDigits: true,
        unitCost: true,
      },
    })

    const buckets = new Map<string, { sum: number; count: number }>()
    for (const row of rows) {
      const keyValue = mode === 'digits' ? row.articleDigits : row.articleNormalized
      if (!keyValue) continue
      const key = mode === 'digits' ? `digits:${keyValue}` : `full:${keyValue}`
      const bucket = buckets.get(key) ?? { sum: 0, count: 0 }
      bucket.sum += Number(row.unitCost)
      bucket.count += 1
      buckets.set(key, bucket)
    }

    const costByKey = new Map<string, number>()
    for (const [key, bucket] of buckets) {
      costByKey.set(key, bucket.sum / bucket.count)
    }

    return {
      cogsFileId: file.id,
      cogsHash: file.fileHash,
      costByKey,
    }
  }
}

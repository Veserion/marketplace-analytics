import { apiRequest } from '@/shared/api/client'
import type { Marketplace } from '@/shared/api/use-marketplace-connection'

export type MarketplaceCogsFile = {
  id: string
  marketplace: Marketplace
  fileName: string
  rowsCount: number
  fileHash: string
  updatedAt: string
}

export async function uploadMarketplaceCogs(input: {
  token: string
  marketplace: Marketplace
  fileName: string
  csvText: string
}): Promise<MarketplaceCogsFile> {
  const response = await apiRequest<{ cogsFile: MarketplaceCogsFile }>(`/marketplaces/${input.marketplace}/cogs`, {
    token: input.token,
    method: 'PUT',
    body: JSON.stringify({
      fileName: input.fileName,
      csvText: input.csvText,
    }),
  })

  return response.cogsFile
}

export async function downloadMarketplaceCogsCsv(input: {
  token: string
  marketplace: Marketplace
}): Promise<{ fileName: string; csvText: string }> {
  return apiRequest<{ fileName: string; csvText: string }>(`/marketplaces/${input.marketplace}/cogs/download`, {
    token: input.token,
  })
}

export async function deleteMarketplaceCogs(input: {
  token: string
  marketplace: Marketplace
}): Promise<void> {
  await apiRequest<{ ok: true }>(`/marketplaces/${input.marketplace}/cogs`, {
    token: input.token,
    method: 'DELETE',
  })
}

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/features/auth'
import { apiRequest } from '@/shared/api/client'

export type Marketplace = 'ozon' | 'wildberries'

export type MarketplaceConnection = {
  id: string
  marketplace: Marketplace
  status: 'not_connected' | 'connected' | 'invalid'
  credentialPreview: string | null
  updatedAt: string
}

type MarketplaceConnectionsResponse = {
  connections: MarketplaceConnection[]
}

/**
 * Хук для загрузки статуса подключений маркетплейсов.
 * Возвращает карту подключений по маркетплейсу и флаг загрузки.
 */
export function useMarketplaceConnections() {
  const { session } = useAuth()
  const [connections, setConnections] = useState<MarketplaceConnection[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadConnections = useCallback(async (): Promise<void> => {
    if (!session) return

    setIsLoading(true)
    try {
      const response = await apiRequest<MarketplaceConnectionsResponse>('/marketplace-connections', {
        token: session.token,
      })
      setConnections(response.connections)
    } catch {
      // silently ignore — connection status is non-critical UI hint
    } finally {
      setIsLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (!session) return

    const timeoutId = window.setTimeout(() => {
      void loadConnections()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadConnections, session])

  const isConnected = (marketplace: Marketplace): boolean => {
    return connections.some(
      (connection) => connection.marketplace === marketplace && connection.status === 'connected',
    )
  }

  return {
    connections,
    isLoading,
    isConnected,
    reload: loadConnections,
  }
}

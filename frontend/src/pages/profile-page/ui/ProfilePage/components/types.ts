export type ProfileSection = 'apiKeys' | 'uploadedFiles' | 'security'

export type Marketplace = 'ozon' | 'wildberries'

export type MarketplaceConnection = {
  id: string
  marketplace: Marketplace
  status: 'not_connected' | 'connected' | 'invalid'
  credentialPreview: string | null
  updatedAt: string
}

export type StatusMessage = {
  type: 'success' | 'error'
  text: string
}

export type SecurityStep = 'requestCode' | 'changePassword'

export type SecurityFormState = {
  code: string
  newPassword: string
  repeatPassword: string
}

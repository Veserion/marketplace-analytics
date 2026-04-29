import classNames from 'classnames/bind'
import { MenuOutlined, UserOutlined } from '@ant-design/icons'
import Button from 'antd/es/button'
import Dropdown from 'antd/es/dropdown'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Marketplace } from '@/entities/ozon-report'
import { AuthModal, useAuth } from '@/features/auth'
import { Typography } from '@/shared/ui-kit/typography'
import { MarketplaceNav } from './components/MarketplaceNav'
import styles from './index.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'AppHeader'

export function AppHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const logoSrc = `${import.meta.env.BASE_URL}marketplace-metrics-logo.svg`

  const activeMarketplace = location.pathname.includes('/wildberries') ? 'wildberries' : 'ozon'
  const isProfilePage = location.pathname.startsWith('/profile')

  const marketplaceItems = useMemo(
    () => [
      { key: 'ozon' as Marketplace, label: 'Ozon' },
      { key: 'wildberries' as Marketplace, label: 'Wildberries' },
    ],
    [],
  )

  const onChangeMarketplace = (marketplace: Marketplace): void => {
    void navigate(marketplace === 'wildberries' ? '/wildberries' : '/ozon')
  }

  const onProfileButtonClick = (): void => {
    if (!isAuthenticated) {
      setIsAuthModalOpen(true)
      return
    }

    void navigate('/profile')
  }

  return (
    <>
      <header className={cn(BLOCK_NAME)}>
        <div className={cn(`${BLOCK_NAME}__content`)}>
          <button
            type="button"
            className={cn(`${BLOCK_NAME}__brand`)}
            onClick={() => onChangeMarketplace('ozon')}
          >
            <img
              className={cn(`${BLOCK_NAME}__logo`)}
              src={logoSrc}
              alt="Маркетплейс Метрика"
            />
            <Typography as="span" variant="h2" color="accent" className={cn(`${BLOCK_NAME}__brand-text`)}>
              Маркетплейс Метрика
            </Typography>
          </button>

          <div className={cn(`${BLOCK_NAME}__nav`)}>
            <MarketplaceNav activeMarketplace={activeMarketplace} onChange={onChangeMarketplace} />
          </div>

          <div className={cn(`${BLOCK_NAME}__right`)}>
            <Button
              type="text"
              icon={<UserOutlined />}
              className={cn(`${BLOCK_NAME}__profile-button`, {
                [`${BLOCK_NAME}__profile-button--active`]: isAuthenticated && isProfilePage,
              })}
              onClick={onProfileButtonClick}
            >
              {isAuthenticated ? 'Профиль' : 'Логин'}
            </Button>
            <div className={cn(`${BLOCK_NAME}__mobile-nav`)}>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: marketplaceItems.map((item) => ({
                    key: item.key,
                    label: item.label,
                  })),
                  selectedKeys: [activeMarketplace],
                  onClick: ({ key }) => onChangeMarketplace(key as Marketplace),
                }}
              >
                <Button
                  type="text"
                  aria-label="Меню маркетплейсов"
                  className={cn(`${BLOCK_NAME}__burger-button`)}
                  icon={<MenuOutlined />}
                />
              </Dropdown>
            </div>
          </div>
        </div>
      </header>
      <AuthModal open={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  )
}

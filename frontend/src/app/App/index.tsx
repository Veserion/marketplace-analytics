import classNames from 'classnames/bind'
import { createElement, lazy, Suspense, useEffect } from 'react'
import ConfigProvider from 'antd/es/config-provider'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppHeader } from '@/app/layout/AppHeader'
import { getAntdTheme } from '@/app/theme/antd-theme'
import { AuthProvider } from '@/features/auth'
import styles from './index.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'
const lazyAnalyticsPage = lazy(async () => import('@/pages/analytics-page/ui/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const lazyWildberriesPage = lazy(async () => import('@/pages/wildberries-page/ui/WildberriesPage').then((module) => ({ default: module.WildberriesPage })))
const lazyProfilePage = lazy(async () => import('@/pages/profile-page').then((module) => ({ default: module.ProfilePage })))

function App() {
  const location = useLocation()
  const isWildberriesRoute = location.pathname.includes('/wildberries')
  const appTheme = isWildberriesRoute ? 'purple' : 'blue'
  const antdTheme = getAntdTheme(appTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme)
    document.body.setAttribute('data-theme', appTheme)
    return () => {
      document.documentElement.removeAttribute('data-theme')
      document.body.removeAttribute('data-theme')
    }
  }, [appTheme])

  return (
    <ConfigProvider theme={antdTheme}>
      <AuthProvider>
        <div className={cn(BLOCK_NAME)} data-theme={appTheme}>
          <AppHeader />
          <main className={cn(`${BLOCK_NAME}__main`)}>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Navigate to="/ozon" replace />} />
                <Route path="/ozon" element={createElement(lazyAnalyticsPage)} />
                <Route path="/wildberries" element={createElement(lazyWildberriesPage)} />
                <Route path="/profile" element={createElement(lazyProfilePage)} />
                <Route path="*" element={<Navigate to="/ozon" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </AuthProvider>
    </ConfigProvider>
  )
}

export default App

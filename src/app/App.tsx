import classNames from 'classnames/bind'
import { createElement, lazy, Suspense, useEffect } from 'react'
import ConfigProvider from 'antd/es/config-provider'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getAntdTheme } from '@/app/theme/antd-theme'
import styles from './App.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'
const lazyAnalyticsPage = lazy(async () => import('@/pages/analytics-page/ui/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const lazyWildberriesPage = lazy(async () => import('@/pages/wildberries-page/ui/WildberriesPage').then((module) => ({ default: module.WildberriesPage })))

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
      <div className={cn(BLOCK_NAME)} data-theme={appTheme}>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/ozon" replace />} />
            <Route path="/ozon" element={createElement(lazyAnalyticsPage)} />
            <Route path="/wildberries" element={createElement(lazyWildberriesPage)} />
            <Route path="*" element={<Navigate to="/ozon" replace />} />
          </Routes>
        </Suspense>
      </div>
    </ConfigProvider>
  )
}

export default App

import classNames from 'classnames/bind'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnalyticsPage } from '@/pages/analytics-page'
import { WildberriesPage } from '@/pages/wildberries-page'
import styles from './App.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'

function App() {
  const location = useLocation()
  const appTheme = location.pathname.startsWith('/wildberries') ? 'purple' : 'blue'

  useEffect(() => {
    document.body.setAttribute('data-theme', appTheme)
    return () => {
      document.body.removeAttribute('data-theme')
    }
  }, [appTheme])

  return (
    <div className={cn(BLOCK_NAME)} data-theme={appTheme}>
      <Routes>
        <Route path="/" element={<Navigate to="/ozon" replace />} />
        <Route path="/ozon" element={<AnalyticsPage />} />
        <Route path="/wildberries" element={<WildberriesPage />} />
        <Route path="*" element={<Navigate to="/ozon" replace />} />
      </Routes>
    </div>
  )
}

export default App

import classNames from 'classnames/bind'
import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnalyticsPage } from '@/pages/analytics-page'
import { ProfilePage } from '@/pages/profile-page'
import { WildberriesPage } from '@/pages/wildberries-page'
import styles from './App.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'

function App() {
  const location = useLocation()
  const isWildberriesRoute = location.pathname.includes('/wildberries')
  const appTheme = isWildberriesRoute ? 'purple' : 'blue'

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', appTheme)
    document.body.setAttribute('data-theme', appTheme)
    return () => {
      document.documentElement.removeAttribute('data-theme')
      document.body.removeAttribute('data-theme')
    }
  }, [appTheme])

  return (
    <div className={cn(BLOCK_NAME)} data-theme={appTheme}>
      <header className={cn(`${BLOCK_NAME}__header`)}>
        <nav className={cn(`${BLOCK_NAME}__nav`)}>
          <NavLink
            to="/ozon"
            className={({ isActive }) =>
              cn(`${BLOCK_NAME}__navItem`, { [`${BLOCK_NAME}__navItem_active`]: isActive })
            }
          >
            Аналитика
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              cn(`${BLOCK_NAME}__navItem`, { [`${BLOCK_NAME}__navItem_active`]: isActive })
            }
          >
            Личный кабинет
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/ozon" replace />} />
        <Route path="/ozon" element={<AnalyticsPage />} />
        <Route path="/wildberries" element={<WildberriesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/ozon" replace />} />
      </Routes>
    </div>
  )
}

export default App

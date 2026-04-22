import classNames from 'classnames/bind'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AnalyticsPage } from '@/pages/analytics-page'
import { WildberriesPage } from '@/pages/wildberries-page'
import styles from './App.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'

function App() {
  return (
    <div className={cn(BLOCK_NAME)}>
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

import classNames from 'classnames/bind'
import { AnalyticsPage } from '@/pages/analytics-page'
import styles from './App.module.scss'
import '@/app/styles/app.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'App'

function App() {
  return (
    <div className={cn(BLOCK_NAME)}>
      <AnalyticsPage />
    </div>
  )
}

export default App

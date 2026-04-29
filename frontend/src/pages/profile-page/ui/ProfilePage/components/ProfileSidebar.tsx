import classNames from 'classnames/bind'
import {
  ApiOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import styles from '../index.module.scss'
import type { ProfileSection } from './types'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ProfilePage'

type SectionItem = {
  key: ProfileSection
  title: string
  description: string
  icon: ReactNode
}

const PROFILE_SECTIONS: SectionItem[] = [
  {
    key: 'apiKeys',
    title: 'API-ключи',
    description: 'Подключения маркетплейсов',
    icon: <ApiOutlined />,
  },
  {
    key: 'uploadedFiles',
    title: 'Загруженные файлы',
    description: 'Отчеты и себестоимость',
    icon: <DatabaseOutlined />,
  },
  {
    key: 'security',
    title: 'Безопасность',
    description: 'Смена пароля через код',
    icon: <SafetyOutlined />,
  },
]

type ProfileSidebarProps = {
  activeSection: ProfileSection
  onSectionChange: (section: ProfileSection) => void
  onLogout: () => void
}

export function ProfileSidebar({ activeSection, onSectionChange, onLogout }: ProfileSidebarProps) {
  return (
    <aside className={cn(`${BLOCK_NAME}__sidebar`)} aria-label="Разделы профиля">
      <div className={cn(`${BLOCK_NAME}__section-list`)}>
        {PROFILE_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={cn(`${BLOCK_NAME}__section-button`, {
              [`${BLOCK_NAME}__section-button--active`]: activeSection === section.key,
            })}
            onClick={() => onSectionChange(section.key)}
          >
            <span className={cn(`${BLOCK_NAME}__section-title`)}>
              <span className={cn(`${BLOCK_NAME}__section-icon`)}>
                {section.icon}
              </span>
              {section.title}
            </span>
            <span className={cn(`${BLOCK_NAME}__section-description`)}>
              {section.description}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={cn(`${BLOCK_NAME}__section-button`, `${BLOCK_NAME}__action-button--danger`)}
        onClick={onLogout}
      >
        <span className={cn(`${BLOCK_NAME}__section-title`)}>
          <span className={cn(`${BLOCK_NAME}__section-icon`)}>
            <LogoutOutlined />
          </span>
          Выйти
        </span>
        <span className={cn(`${BLOCK_NAME}__section-description`)}>
          Завершить текущую сессию
        </span>
      </button>
    </aside>
  )
}

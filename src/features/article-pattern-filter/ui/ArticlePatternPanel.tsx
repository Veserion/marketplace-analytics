import classNames from 'classnames/bind'
import Input from 'antd/es/input'
import { UiPanel } from '@/shared/ui-kit/panel'
import { Typography } from '@/shared/ui-kit/typography'
import styles from './ArticlePatternPanel.module.scss'

const cn = classNames.bind(styles)
const BLOCK_NAME = 'ArticlePatternPanel'

type ArticlePatternPanelProps = {
  pattern: string
  onPatternChange: (pattern: string) => void
}

export function ArticlePatternPanel({ pattern, onPatternChange }: ArticlePatternPanelProps) {
  return (
    <UiPanel title="Фильтр артикулов">
      <div className={cn(BLOCK_NAME)}>
        <label htmlFor="articlePatternInput" className={cn(`${BLOCK_NAME}__label`)}>
          <Typography as="span" variant="body2" color="accent" semiBold>Паттерн</Typography>
        </label>
        <Input
          id="articlePatternInput"
          className={cn(`${BLOCK_NAME}__input`)}
          value={pattern}
          onChange={(event) => onPatternChange(event.target.value)}
          placeholder="Например: st*"
        />
        <Typography variant="body3" color="muted" className={cn(`${BLOCK_NAME}__hint`)}>
          Поддерживаются шаблоны: `*` — любые символы, `?` — один символ.
        </Typography>
      </div>
    </UiPanel>
  )
}

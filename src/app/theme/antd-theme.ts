import type { ThemeConfig } from 'antd'

const commonToken: ThemeConfig['token'] = {
  borderRadius: 12,
  borderRadiusLG: 16,
  colorError: '#d02525',
  colorSuccess: '#05a413',
  colorWarning: '#8a6400',
  colorText: '#17355d',
  colorTextSecondary: '#4d6786',
  fontFamily: "'Montserrat', 'Avenir Next', 'Manrope', 'IBM Plex Sans', 'Segoe UI', sans-serif",
}

const blueTheme: ThemeConfig = {
  token: {
    ...commonToken,
    colorBgBase: '#eef3fa',
    colorBgContainer: '#ffffff',
    colorBorder: '#d7e0ec',
    colorInfo: '#12305d',
    colorPrimary: '#12305d',
    colorText: '#17355d',
    colorTextSecondary: '#4d6786',
  },
}

const purpleTheme: ThemeConfig = {
  token: {
    ...commonToken,
    colorBgBase: '#faf5ff',
    colorBgContainer: '#ffffff',
    colorBorder: '#e2d5ef',
    colorInfo: '#6b4c8e',
    colorPrimary: '#6b4c8e',
    colorSuccess: '#2e8d58',
    colorText: '#3a2554',
    colorTextSecondary: '#6b5382',
  },
}

export type AppThemeName = 'blue' | 'purple'

export function getAntdTheme(themeName: AppThemeName): ThemeConfig {
  return themeName === 'purple' ? purpleTheme : blueTheme
}

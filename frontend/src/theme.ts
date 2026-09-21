import { useEffect, useState } from 'react'

const STORAGE_KEY = 'pg1-theme'

export type ThemeMode = 'light' | 'dark'

function readStored(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
    // 没存过就跟随系统
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    // 隐私模式下 localStorage 可能直接抛错
    return 'light'
  }
}

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(readStored)

  useEffect(() => {
    // 同步给浏览器，滚动条和原生控件才会跟着变色
    document.documentElement.style.colorScheme = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 存不了就只在本次会话生效，不影响使用
    }
  }, [mode])

  return { mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }
}

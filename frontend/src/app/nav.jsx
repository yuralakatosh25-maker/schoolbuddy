import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const NavCtx = createContext(null)
export const useNav = () => useContext(NavCtx)

// Стек екранів поверх вкладок. Синхронізований з історією браузера,
// тож системна кнопка «Назад» (Android / PWA) закриває верхній екран.
export function NavProvider({ initialTab = 'home', children }) {
  const [tab, setTabState] = useState(initialTab)
  const [stack, setStack] = useState([])
  const stackRef = useRef(stack)
  useEffect(() => { stackRef.current = stack }, [stack])

  useEffect(() => {
    window.history.replaceState({ sbDepth: 0 }, '')
    const onPop = (e) => {
      const depth = e.state?.sbDepth ?? 0
      setStack((s) => s.slice(0, depth))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const push = useCallback((screen, params = {}) => {
    const depth = stackRef.current.length + 1
    window.history.pushState({ sbDepth: depth }, '')
    setStack((s) => [...s, { screen, params, key: `${screen}-${Date.now()}` }])
  }, [])

  const pop = useCallback(() => {
    if (stackRef.current.length > 0) window.history.back()
  }, [])

  // Замінити верхній екран (напр. SOS → чат), не додаючи кроку в історію
  const replace = useCallback((screen, params = {}) => {
    if (stackRef.current.length === 0) return push(screen, params)
    setStack((s) => [...s.slice(0, -1), { screen, params, key: `${screen}-${Date.now()}` }])
  }, [push])

  const setTab = useCallback((next) => {
    const depth = stackRef.current.length
    setStack([])
    setTabState(next)
    if (depth > 0) window.history.go(-depth)
  }, [])

  // Посилання зі сповіщень: "/chat/12", "/meetings/3", "/schedule" …
  const openLink = useCallback((link) => {
    if (!link) return
    const [, a, b] = link.split('/')
    const id = b ? Number(b) : undefined
    const tabs = { sos: 'sos', cabinet: 'cabinet', profile: 'profile', home: 'home' }
    if (tabs[a]) return setTab(tabs[a])
    const screens = {
      chat: ['chat', { id }], meetings: id ? ['meeting', { id }] : ['meetings', {}], events: id ? ['event', { id }] : ['events', {}],
      schedule: ['schedule', {}], homework: ['homework', {}], announcements: ['announcements', {}], achievements: ['achievements', {}],
      wallet: ['wallet', {}], groups: id ? ['group', { id }] : ['groups', {}], forum: id ? ['post', { id }] : ['forum', {}],
    }
    const target = screens[a]
    if (target) push(target[0], target[1])
  }, [push, setTab])

  const value = useMemo(() => ({ tab, setTab, stack, push, pop, replace, openLink }), [tab, setTab, stack, push, pop, replace, openLink])
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { api, session, ApiError } from '../lib/api'
import { makeT, pick } from '../lib/i18n'
import { describeNotification } from '../lib/notifications'
import { Button, Sheet, cx } from '../components/ui'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

export const EMAIL_DOMAIN = 'infis.cz'

function initialTheme() {
  try { return localStorage.getItem('sb.theme') || 'system' } catch { return 'system' }
}

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function initialLang() {
  try {
    const saved = localStorage.getItem('sb.lang')
    if (saved) return saved
  } catch { /* приватний режим */ }
  const nav = (navigator.language || '').toLowerCase()
  if (nav.startsWith('cs') || nav.startsWith('sk')) return 'CZ'
  if (nav.startsWith('en')) return 'EN'
  return 'UA'
}

// Завантаження даних з API з перезавантаженням і локальним оновленням
export function useApi(path) {
  const [state, setState] = useState({ data: null, loading: Boolean(path), error: null })
  const load = useCallback(async () => {
    if (!path) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.get(path)
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }))
    }
  }, [path])
  useEffect(() => { load() }, [load])
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])
  return { ...state, reload: load, setData }
}

export function usePolling(fn, ms, enabled = true) {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => { if (!document.hidden) ref.current() }, ms)
    return () => clearInterval(id)
  }, [ms, enabled])
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(session.token)
  const [lang, setLangState] = useState(initialLang)
  const [theme, setThemeState] = useState(initialTheme) // 'light' | 'dark' | 'system'
  const [resolvedTheme, setResolvedTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  const [me, setMe] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null)
  const [unread, setUnread] = useState(0)
  const lastSeenId = useRef(null)
  const t = useMemo(() => makeT(lang), [lang])

  const setLang = useCallback((l) => {
    setLangState(l)
    try { localStorage.setItem('sb.lang', l) } catch { /* ignore */ }
    if (session.token) api.put('/api/me', { preferredLang: l }).catch(() => {})
  }, [])

  useEffect(() => { document.documentElement.lang = { UA: 'uk', CZ: 'cs', EN: 'en' }[lang] }, [lang])

  // Тема: явний вибір або системна; застосовується атрибутом data-theme на <html>
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const next = theme === 'system' ? (systemDark() ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = next
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0e0f11' : '#f4f4f2')
      setResolvedTheme(next)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((next) => {
    setThemeState(next)
    try { localStorage.setItem('sb.theme', next) } catch { /* ignore */ }
  }, [])
  const toggleTheme = useCallback(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'), [resolvedTheme, setTheme])

  const toast = useCallback((text, tone = 'ok') => {
    const id = Math.random()
    setToasts((list) => [...list.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3200)
  }, [])

  const errText = useCallback((e) => {
    const code = e instanceof ApiError ? e.code : 'unknown'
    const key = 'err_' + code
    const text = t(key, { domain: EMAIL_DOMAIN })
    return text === key ? t('err_unknown') : text
  }, [t])

  const fail = useCallback((e) => toast(errText(e), 'error'), [toast, errText])

  // Діалог підтвердження: ask({ title, text, confirm, danger, input }) → true / рядок / false
  const ask = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve, value: '' })), [])

  const login = useCallback((newToken) => {
    session.set(newToken)
    setToken(newToken)
  }, [])

  const logout = useCallback(() => {
    session.clear()
    setToken(null)
    setMe(null)
    setUnread(0)
    lastSeenId.current = null
  }, [])

  useEffect(() => {
    const onLogout = () => logout()
    window.addEventListener('sb:logout', onLogout)
    return () => window.removeEventListener('sb:logout', onLogout)
  }, [logout])

  const reloadMe = useCallback(async () => {
    const profile = await api.get('/api/me')
    setMe(profile)
    return profile
  }, [])

  useEffect(() => {
    if (!token) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- стан оновлюється після відповіді API
    reloadMe().catch(() => {})
    api.get('/api/subjects').then(setSubjects).catch(() => {})
  }, [token, reloadMe])

  const subjectById = useCallback((id) => subjects.find((s) => s.id === id), [subjects])
  const subjectName = useCallback((id) => pick(subjectById(id), 'name', lang), [subjectById, lang])
  const topicName = useCallback((subjectId, topicId) => {
    const topic = subjectById(subjectId)?.topics?.find((x) => x.id === topicId)
    return pick(topic, 'name', lang)
  }, [subjectById, lang])

  // Сповіщення: опитуємо сервер, показуємо in-app тост і системне push-сповіщення для нових
  const checkNotifications = useCallback(async () => {
    if (!session.token) return
    try {
      const res = await api.get('/api/notifications?take=15')
      setUnread(res.unread)
      const newest = res.items[0]?.id ?? 0
      if (lastSeenId.current != null) {
        const fresh = res.items.filter((n) => n.id > lastSeenId.current && !n.isRead).reverse()
        for (const n of fresh) {
          const { title, body } = describeNotification(n, { t, lang, subjectName })
          if (me?.notify?.inApp !== false) toast(body ? `${title} · ${body}` : title, 'info')
          if (me?.notify?.push && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification(title, { body, icon: '/favicon.svg', tag: 'sb-' + n.id }) } catch { /* ignore */ }
          }
        }
      }
      lastSeenId.current = Math.max(lastSeenId.current ?? 0, newest)
    } catch { /* офлайн */ }
  }, [t, lang, subjectName, me, toast])

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- перше опитування після входу
  useEffect(() => { if (me) checkNotifications() }, [me?.id])
  useEffect(() => {
    if (!me) return
    const id = setInterval(checkNotifications, 15000)
    return () => clearInterval(id)
  }, [me, checkNotifications])

  const value = {
    token, login, logout, me, setMe, reloadMe, lang, setLang, t, toast, fail, errText, ask,
    theme, setTheme, resolvedTheme, toggleTheme,
    subjects, subjectById, subjectName, topicName, unread, setUnread, checkNotifications,
  }

  return (
    <AppCtx.Provider value={value}>
      {children}
      <Toasts toasts={toasts} />
      <Dialog dialog={dialog} setDialog={setDialog} t={t} />
    </AppCtx.Provider>
  )
}

function Toasts({ toasts }) {
  const icons = { ok: CheckCircle2, error: AlertCircle, info: Info }
  const colors = { ok: 'text-ok', error: 'text-danger', info: 'text-info' }
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((x) => {
        const Icon = icons[x.tone] ?? Info
        return (
          <div key={x.id} className="pointer-events-auto flex max-w-[400px] items-start gap-2.5 rounded-xl border border-line-strong bg-raised px-3.5 py-2.5 text-[13.5px] leading-5 shadow-2xl shadow-black/40 animate-in">
            <Icon className={cx('mt-0.5 size-4 shrink-0', colors[x.tone])} />
            <span>{x.text}</span>
          </div>
        )
      })}
    </div>
  )
}

function Dialog({ dialog, setDialog, t }) {
  if (!dialog) return null
  const close = (result) => {
    dialog.resolve(result)
    setDialog(null)
  }
  const needsInput = dialog.input !== undefined
  const canConfirm = !needsInput || (dialog.match ? dialog.value === dialog.match : dialog.value.trim().length > 0)
  return (
    <Sheet open onClose={() => close(false)} title={dialog.title}
      footer={
        <div className="flex gap-2">
          <Button full onClick={() => close(false)}>{t('cancel')}</Button>
          <Button full variant={dialog.danger ? 'danger' : 'primary'} disabled={!canConfirm}
            onClick={() => close(needsInput ? dialog.value.trim() : true)}>
            {dialog.confirm ?? t('confirm')}
          </Button>
        </div>
      }>
      {dialog.text && <p className="text-[14px] leading-6 text-muted">{dialog.text}</p>}
      {needsInput && (
        dialog.multiline
          ? <textarea autoFocus rows={3} className="field mt-3 resize-none" placeholder={dialog.input}
              value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
          : <input autoFocus className="field mt-3" placeholder={dialog.input} value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />
      )}
    </Sheet>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Bell, House, Search, LifeBuoy, LayoutGrid, CircleUser, ShieldHalf, Check, Sun, Moon } from 'lucide-react'
import { useApp } from './context'
import { useNav } from './nav'
import { IconButton, cx } from '../components/ui'
import { LANGS } from '../lib/i18n'
import EasterEgg from '../components/EasterEgg'

// Рамка «мобільного вікна»: на телефоні — на весь екран, на компʼютері — акуратна колонка
export function Frame({ children }) {
  return (
    <div className="flex h-full w-full justify-center bg-bg sm:items-center sm:p-6">
      <div className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden bg-surface sm:h-[min(900px,100%)] sm:rounded-[32px] sm:border sm:border-line sm:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.35)]">
        {children}
        <div id="overlay-root" />
      </div>
    </div>
  )
}

// Знак: два переплетені кільця. На хвилі — інвертований
export function LogoMark({ size = 28, onWave }) {
  const bg = onWave ? 'var(--on-wave)' : 'var(--ink)'
  const fg = onWave ? 'var(--wave-1)' : 'var(--surface)'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="18" fill={bg} />
      <circle cx="25" cy="32" r="11" fill="none" stroke={fg} strokeWidth="5" />
      <circle cx="39" cy="32" r="11" fill="none" stroke={fg} strokeWidth="5" strokeOpacity="0.55" />
      <path d="M32 23.2a11 11 0 0 1 0 17.6" fill="none" stroke={fg} strokeWidth="5" />
    </svg>
  )
}

export function Wordmark({ onWave, className }) {
  return (
    <span className={cx('flex items-center gap-2', className)}>
      <LogoMark onWave={onWave} />
      <span className="font-display text-[19px] font-semibold tracking-wide">SchoolBuddy</span>
    </span>
  )
}

const pill = (onWave) => cx('h-8 rounded-full border px-2.5 text-[12px] font-semibold tracking-wide transition',
  onWave ? 'border-on-wave/25 text-on-wave hover:border-on-wave/50' : 'border-line text-muted hover:border-line-strong hover:text-ink')

export function ThemeToggle({ onWave }) {
  const { resolvedTheme, toggleTheme, t } = useApp()
  const Icon = resolvedTheme === 'dark' ? Sun : Moon
  return (
    <button type="button" onClick={toggleTheme} aria-label={t('toggleTheme')} title={t('toggleTheme')}
      className={cx('grid size-8 place-items-center rounded-full border transition',
        onWave ? 'border-on-wave/25 text-on-wave hover:border-on-wave/50' : 'border-line text-muted hover:border-line-strong hover:text-ink')}>
      <Icon className="size-[15px]" strokeWidth={2} />
    </button>
  )
}

export function LangSwitch({ onWave }) {
  const { lang, setLang, t } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label={t('language')} className={pill(onWave)}>{lang}</button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-44 overflow-hidden rounded-xl border border-line bg-card py-1 text-ink shadow-xl shadow-black/20 animate-in">
          {LANGS.map((l) => (
            <button key={l} type="button" onClick={() => { setLang(l); setOpen(false) }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] hover:bg-raised">
              <span className="w-6 text-[12px] font-semibold text-muted">{l}</span>
              <span className="flex-1">{t('langName_' + l)}</span>
              {l === lang && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopBar({ onWave }) {
  const { t, unread } = useApp()
  const nav = useNav()
  const [taps, setTaps] = useState([])
  const [egg, setEgg] = useState(false)

  // Пасхалка: 5 натискань на логотип протягом 2 секунд
  const onLogo = () => {
    const now = Date.now()
    const recent = [...taps.filter((x) => now - x < 2000), now]
    if (recent.length >= 5) {
      setEgg(true)
      setTaps([])
    } else setTaps(recent)
  }

  return (
    <header className={cx('flex h-14 shrink-0 items-center justify-between px-4 transition-colors', onWave ? 'bg-wave text-on-wave' : 'bg-surface')}>
      <button type="button" onClick={onLogo} className="select-none" aria-label="SchoolBuddy">
        <Wordmark onWave={onWave} />
      </button>
      <div className="flex items-center gap-1.5">
        <IconButton icon={Bell} label={t('notifications')} badge={unread} onClick={() => nav.push('notifications')}
          className={onWave ? 'text-on-wave hover:bg-on-wave/10 hover:text-on-wave' : undefined} />
        <ThemeToggle onWave={onWave} />
        <LangSwitch onWave={onWave} />
      </div>
      <EasterEgg open={egg} onClose={() => setEgg(false)} />
    </header>
  )
}

export function TabBar() {
  const { t, me } = useApp()
  const { tab, setTab } = useNav()
  const items = [
    { id: 'home', icon: House, label: t('tabHome') },
    { id: 'match', icon: Search, label: t('tabMatch') },
    { id: 'sos', icon: LifeBuoy, label: t('tabSos'), sos: true },
    me?.role === 'admin'
      ? { id: 'admin', icon: ShieldHalf, label: t('tabAdmin') }
      : { id: 'cabinet', icon: LayoutGrid, label: t('tabCabinet') },
    { id: 'profile', icon: CircleUser, label: t('tabProfile') },
  ]
  return (
    <nav className="shrink-0 border-t border-line bg-surface/95 pb-safe backdrop-blur">
      <div className="grid h-[62px] grid-cols-5">
        {items.map(({ id, icon: Icon, label, sos }) => {
          const active = tab === id
          return (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cx('flex flex-col items-center justify-center gap-1 text-[11px] transition',
                active ? (sos ? 'text-danger' : 'text-ink') : 'text-faint hover:text-muted')}>
              <span className={cx('grid h-7 w-12 place-items-center rounded-full transition',
                active && (sos ? 'bg-danger/12' : 'bg-ink text-surface'))}>
                <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              </span>
              <span className={cx(active && 'font-medium')}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

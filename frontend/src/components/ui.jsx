import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Loader2, BadgeCheck } from 'lucide-react'

export const cx = (...c) => c.filter(Boolean).join(' ')

const buttonVariants = {
  primary: 'bg-accent text-accent-ink hover:brightness-105 font-semibold',
  secondary: 'bg-card text-ink border border-line hover:border-line-strong',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'bg-danger/12 text-danger hover:bg-danger/20',
  sos: 'bg-danger text-white font-semibold hover:brightness-110',
}
const buttonSizes = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, full, className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      disabled={loading || rest.disabled}
      className={cx(
        'inline-flex items-center justify-center font-medium transition active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100 select-none whitespace-nowrap',
        buttonVariants[variant], buttonSizes[size], full && 'w-full', className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, label, className, badge, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cx('relative grid size-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink', className)} {...rest}>
      <Icon className="size-[19px]" strokeWidth={1.8} />
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  )
}

export function Card({ className, children, ...rest }) {
  return <div className={cx('card-shadow rounded-2xl border border-line bg-card', className)} {...rest}>{children}</div>
}

export function List({ className, children }) {
  return <div className={cx('card-shadow overflow-hidden rounded-2xl border border-line bg-card divide-y divide-line', className)}>{children}</div>
}

export function Row({ left, title, subtitle, right, onClick, chevron, className, children }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cx('flex w-full items-center gap-3 px-4 py-3 text-left', onClick && 'transition hover:bg-raised/60 active:bg-raised', className)}>
      {left}
      <div className="min-w-0 flex-1">
        {title != null && <div className="truncate text-[15px] leading-5 text-ink">{title}</div>}
        {subtitle != null && <div className="mt-0.5 truncate text-[13px] leading-4 text-muted">{subtitle}</div>}
        {children}
      </div>
      {right}
      {(chevron ?? !!onClick) && <ChevronRight className="size-4 shrink-0 text-faint" />}
    </Tag>
  )
}

export function Section({ title, action, onAction, children, className }) {
  return (
    <section className={cx('mt-6', className)}>
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h3 className="text-[13px] font-medium text-muted">{title}</h3>
          {action && <button type="button" onClick={onAction} className="text-[13px] text-muted hover:text-ink">{action}</button>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Chip({ active, onClick, children, className, tone }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] transition',
        active ? 'border-ink bg-ink text-surface' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
        tone === 'danger' && active && 'border-danger bg-danger text-white',
        className,
      )}>
      {children}
    </button>
  )
}

const tones = {
  neutral: 'bg-raised text-muted',
  accent: 'bg-accent/12 text-accent',
  danger: 'bg-danger/12 text-danger',
  warn: 'bg-warn/12 text-warn',
  ok: 'bg-ok/12 text-ok',
  info: 'bg-info/12 text-info',
}

export function Badge({ tone = 'neutral', children, className, icon: Icon }) {
  return (
    <span className={cx('inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium', tones[tone], className)}>
      {Icon && <Icon className="size-3" strokeWidth={2.2} />}
      {children}
    </span>
  )
}

// Аватар: фото або ініціали на приглушеному кольорі, стабільному для імені
function hue(str = '') {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export function Avatar({ user, size = 40, ring }) {
  const name = user?.nickname || '?'
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  const h = hue(name)
  const style = { width: size, height: size, fontSize: size * 0.36 }
  return (
    <div className={cx('relative shrink-0 overflow-hidden rounded-full', ring && 'ring-2 ring-surface')} style={style}>
      {user?.avatar ? (
        <img src={user.avatar} alt="" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center font-semibold" style={{ background: `hsl(${h} 16% var(--avatar-bg))`, color: `hsl(${h} 45% var(--avatar-fg))` }}>
          {initials}
        </div>
      )}
    </div>
  )
}

const availColor = { available: 'bg-ok', busy: 'bg-warn', dnd: 'bg-danger' }

export function AvailabilityDot({ value, className }) {
  return <span className={cx('inline-block size-2 shrink-0 rounded-full', availColor[value] ?? 'bg-faint', className)} />
}

export function AvatarWithStatus({ user, size = 40 }) {
  return (
    <div className="relative shrink-0">
      <Avatar user={user} size={size} />
      {user?.role === 'mentor' && (
        <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full bg-card p-[3px]">
          <AvailabilityDot value={user.availability} />
        </span>
      )}
    </div>
  )
}

export function VerifiedMark({ user, className }) {
  if (!user?.verified) return null
  return <BadgeCheck className={cx('inline size-4 shrink-0 text-accent', className)} strokeWidth={2} />
}

export function Segmented({ value, options, onChange, className }) {
  return (
    <div className={cx('flex rounded-xl bg-raised p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('min-h-8 flex-1 rounded-lg px-2 py-1 text-[13px] leading-4 transition', value === o.value ? 'card-shadow bg-card font-medium text-ink' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] text-muted">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 block text-[12.5px] text-danger">{error}</span>
        : hint ? <span className="mt-1.5 block text-[12.5px] text-faint">{hint}</span> : null}
    </label>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-10 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-line-strong')}>
      <span className={cx('absolute top-0.5 size-5 rounded-full shadow-sm transition-all', checked ? 'left-[18px] bg-accent-ink' : 'left-0.5 bg-white')} />
    </button>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />
}

export function Loading({ className }) {
  return <div className={cx('grid place-items-center py-16', className)}><Spinner /></div>
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-xl bg-raised/70', className)} />
}

export function Empty({ icon: Icon, title, text, action, className }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && <div className="mb-3 grid size-11 place-items-center rounded-full border border-line bg-card text-muted"><Icon className="size-5" strokeWidth={1.8} /></div>}
      {title && <p className="text-[15px] text-ink">{title}</p>}
      {text && <p className="mt-1 max-w-[280px] text-[13px] leading-5 text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Progress({ value, max = 100, className, tone = 'accent' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-raised', className)}>
      <div className={cx('h-full rounded-full transition-all', { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' }[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function SubjectDot({ color, className }) {
  return <span className={cx('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color || '#8c929b' }} />
}

// Шапка вкладеного екрана з кнопкою «Назад»
export function ScreenHeader({ title, subtitle, onBack, backLabel, right }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur">
      {onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel}
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink">
          <ChevronLeft className="size-5" />
        </button>
      )}
      <div className={cx('min-w-0 flex-1', !onBack && 'pl-2')}>
        <div className="truncate text-[16px] font-semibold leading-5">{title}</div>
        {subtitle && <div className="truncate text-[12.5px] leading-4 text-muted">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-0.5">{right}</div>
    </header>
  )
}

export function PageTitle({ children, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-1">
      <div className="min-w-0">
        <h1 className="font-display text-[30px] font-semibold leading-9 tracking-wide">{children}</h1>
        {sub && <p className="mt-1 text-[13.5px] leading-5 text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// Нижній лист (bottom sheet) — рендериться всередині рамки застосунку
export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  const root = open ? document.getElementById('overlay-root') : null
  if (!open || !root) return null
  return createPortal(
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60 animate-in" onClick={onClose} />
      <div className="relative flex max-h-[90%] flex-col rounded-t-[26px] border-t border-line bg-card animate-sheet">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" />
        {title && <div className="px-5 pb-1 pt-3 font-display text-[20px] font-medium tracking-wide">{title}</div>}
        <div className="scroll-area flex-1 px-5 pb-5 pt-2">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>,
    root,
  )
}

export function Stat({ label, value, sub, className }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-card px-4 py-3', className)}>
      <div className="text-[12.5px] text-muted">{label}</div>
      <div className="mt-1 font-display text-[24px] font-medium leading-7 tabular">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-faint">{sub}</div>}
    </div>
  )
}

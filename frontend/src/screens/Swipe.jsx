import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, X, RotateCcw, UserRound, Users } from 'lucide-react'
import { useApp } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { Avatar, Badge, Button, Segmented, Sheet, Skeleton, cx } from '../components/ui'

const THRESHOLD = 90   // px, після якого відпускання зараховується як свайп
const REFILL_AT = 3    // скільки карток лишається, коли підвантажуємо нові

function ProfileCard({ item, onInfo }) {
  const { t } = useApp()
  const { user, bio, tags, sharedTags, match } = item
  const rest = tags.filter((x) => !sharedTags.includes(x))
  return (
    <div className="flex h-full flex-col rounded-[24px] border border-line bg-card p-5">
      <div className="flex items-start gap-4">
        <Avatar user={user} size={88} />
        <div className="min-w-0 flex-1 pt-1">
          <div className="break-words font-display text-[22px] font-semibold leading-6">{user.nickname}</div>
          <div className="mt-0.5 text-[13.5px] text-muted">{t(user.role)}{user.class ? ` · ${user.class}` : ''}</div>
          <div className="mt-2 text-[13px] text-muted"><span className={cx('font-semibold tabular', match >= 60 ? 'text-accent' : 'text-ink')}>{match}%</span> {t('match')}</div>
        </div>
        <button type="button" onClick={onInfo} aria-label={t('viewProfile')}
          onPointerDown={(e) => e.stopPropagation()}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-ink">
          <UserRound className="size-[18px]" />
        </button>
      </div>

      <p className={cx('mt-5 text-[15px] leading-6', bio ? 'text-ink' : 'text-faint')}>{bio || t('swipeNoBio')}</p>

      <div className="mt-auto pt-4">
        {sharedTags.length > 0 && (
          <>
            <div className="mb-1.5 text-[12px] text-faint">{t('commonInterests')}</div>
            <div className="mb-3 flex flex-wrap gap-1.5">{sharedTags.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}</div>
          </>
        )}
        {rest.length > 0 && <div className="flex flex-wrap gap-1.5">{rest.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}</div>}
      </div>
    </div>
  )
}

// Верхня картка: тягнеться пальцем/мишею, при відпусканні за порогом відлітає
function TopCard({ item, onDecide, onInfo, decideRef }) {
  const { t } = useApp()
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(0)
  const start = useRef(null)

  const decide = useCallback((like) => {
    setLeaving(like ? 1 : -1)
    setTimeout(() => onDecide(item, like), 220)
  }, [item, onDecide])

  useEffect(() => { decideRef.current = leaving ? null : decide; return () => { decideRef.current = null } }, [decide, leaving, decideRef])

  // Стрілки на клавіатурі: ← пропустити, → вподобати
  useEffect(() => {
    const onKey = (e) => {
      if (leaving || e.target.closest?.('input,textarea,select')) return
      if (e.key === 'ArrowRight') decide(true)
      else if (e.key === 'ArrowLeft') decide(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, leaving])

  const x = leaving ? leaving * 520 : dx
  const likeOpacity = Math.max(0, Math.min(1, x / THRESHOLD))
  const skipOpacity = Math.max(0, Math.min(1, -x / THRESHOLD))

  return (
    <div className="absolute inset-0 select-none"
      style={{
        touchAction: 'pan-y',
        transform: `translateX(${x}px) rotate(${x / 22}deg)`,
        transition: dragging ? 'none' : 'transform 0.22s ease-out, opacity 0.22s',
        opacity: leaving ? 0 : 1,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={(e) => {
        if (leaving) return
        start.current = e.clientX
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => { if (dragging && start.current != null) setDx(e.clientX - start.current) }}
      onPointerUp={() => {
        setDragging(false)
        start.current = null
        if (dx > THRESHOLD) decide(true)
        else if (dx < -THRESHOLD) decide(false)
        else setDx(0)
      }}
      onPointerCancel={() => { setDragging(false); start.current = null; setDx(0) }}>
      <ProfileCard item={item} onInfo={onInfo} />
      <span className="pointer-events-none absolute left-5 top-5 -rotate-6 rounded-lg border-2 border-ok px-2.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide text-ok" style={{ opacity: likeOpacity }}>{t('stampLike')}</span>
      <span className="pointer-events-none absolute right-5 top-5 rotate-6 rounded-lg border-2 border-faint px-2.5 py-0.5 text-[15px] font-semibold uppercase tracking-wide text-muted" style={{ opacity: skipOpacity }}>{t('stampSkip')}</span>
    </div>
  )
}

export default function Swipe() {
  const { t } = useApp()
  const [role, setRole] = useState('student')
  return (
    <div>
      <p className="mt-4 text-[13.5px] leading-5 text-muted">{t('swipeLead')}</p>
      <Segmented className="mt-3" value={role} onChange={setRole} options={[
        { value: 'student', label: t('filterStudents') },
        { value: 'mentor', label: t('filterMentors') },
        { value: 'all', label: t('filterAll') },
      ]} />
      <Deck key={role} role={role} />
    </div>
  )
}

// Колода одного фільтра; зміна ролі перемонтовує її з чистим станом
function Deck({ role }) {
  const { t, fail } = useApp()
  const nav = useNav()
  const [deck, setDeck] = useState([])
  const [loading, setLoading] = useState(true)
  const [matched, setMatched] = useState(null)
  const [busy, setBusy] = useState(false)
  const handled = useRef(new Set())   // id, на які вже свайпнули (щоб не повертались з підвантаження)
  const fetching = useRef(false)

  const load = useCallback(async (replace = false) => {
    if (fetching.current) return
    fetching.current = true
    try {
      const list = await api.get(`/api/swipe/deck?role=${role}`)
      setDeck((prev) => {
        const base = replace ? [] : prev
        const have = new Set(base.map((c) => c.user.id))
        return [...base, ...list.filter((c) => !have.has(c.user.id) && !handled.current.has(c.user.id))]
      })
    } catch (e) { fail(e) } finally { fetching.current = false; setLoading(false) }
  }, [role, fail])

  useEffect(() => { load(true) }, [load])

  const decide = useCallback(async (item, like) => {
    handled.current.add(item.user.id)
    setDeck((d) => {
      const next = d.filter((c) => c.user.id !== item.user.id)
      if (next.length <= REFILL_AT) setTimeout(() => load(false), 0)
      return next
    })
    try {
      const res = await api.post('/api/swipe', { targetId: item.user.id, like })
      if (res.matched) setMatched({ ...res, name: item.user.nickname })
    } catch (e) { fail(e) }
  }, [load, fail])

  const resetSkipped = async () => {
    setBusy(true)
    try {
      await api.del('/api/swipe/skipped')
      handled.current = new Set()
      setLoading(true)
      await load(true)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const top = deck[0]
  const topRef = useRef(null)
  const press = (like) => topRef.current?.(like)

  return (
    <>
      <div className="relative mx-auto mt-4 h-[372px] max-w-[360px]">
        {loading && !top ? (
          <Skeleton className="h-full rounded-[24px]" />
        ) : !top ? (
          <div className="grid h-full place-items-center rounded-[24px] border border-dashed border-line-strong px-6 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-raised text-muted"><Users className="size-5" /></span>
              <div className="mt-3 text-[16px] font-medium">{t('swipeEmpty')}</div>
              <p className="mt-1 text-[13px] leading-5 text-muted">{t('swipeEmptySub')}</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button icon={RotateCcw} onClick={resetSkipped} loading={busy}>{t('swipeResetSkipped')}</Button>
                <Button variant="ghost" onClick={() => { setLoading(true); load(true) }}>{t('swipeRefresh')}</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {deck[1] && (
              <div className="absolute inset-0" style={{ transform: 'scale(0.95) translateY(10px)', opacity: 0.7 }}>
                <ProfileCard item={deck[1]} onInfo={() => {}} />
              </div>
            )}
            <TopCard key={top.user.id} item={top} onDecide={decide}
              onInfo={() => nav.push('user', { id: top.user.id })} decideRef={topRef} />
          </>
        )}
      </div>

      {top && (
        <div className="mt-5 flex items-center justify-center gap-6">
          <button type="button" onClick={() => press(false)} aria-label={t('swipeSkip')}
            className="grid size-14 place-items-center rounded-full border border-line-strong bg-card text-muted transition hover:text-ink active:scale-95">
            <X className="size-6" />
          </button>
          <button type="button" onClick={() => press(true)} aria-label={t('swipeLike')}
            className="grid size-14 place-items-center rounded-full bg-accent text-accent-ink transition active:scale-95">
            <Heart className="size-6" />
          </button>
        </div>
      )}

      <Sheet open={Boolean(matched)} onClose={() => setMatched(null)} title={t('matchTitle')}
        footer={matched && (
          <div className="flex gap-2">
            <Button full onClick={() => setMatched(null)}>{t('keepSwiping')}</Button>
            <Button full variant="primary" onClick={() => { const id = matched.connectionId; setMatched(null); nav.push('chat', { id }) }}>{t('matchWrite')}</Button>
          </div>
        )}>
        {matched && (
          <div className="flex flex-col items-center py-3 text-center">
            <Avatar user={matched.user} size={84} />
            <p className="mt-3 text-[14.5px] leading-6 text-muted">{t('matchBody', { name: matched.name })}</p>
          </div>
        )}
      </Sheet>
    </>
  )
}

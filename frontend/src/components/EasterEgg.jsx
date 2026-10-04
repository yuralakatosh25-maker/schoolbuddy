import { useEffect, useRef, useState } from 'react'
import { Bug } from 'lucide-react'
import { useApp } from '../app/context'
import { Button, Sheet } from './ui'

const DURATION = 30

// Пасхалка: міні-гра «Лови баги» (5 натискань на логотип)
export default function EasterEgg({ open, onClose }) {
  const { t } = useApp()
  const [state, setState] = useState('idle') // idle | play | over
  const [bugs, setBugs] = useState([])
  const [score, setScore] = useState(0)
  const [left, setLeft] = useState(DURATION)
  const [best, setBest] = useState(() => {
    try { return Number(localStorage.getItem('sb.egg')) || 0 } catch { return 0 }
  })
  const scoreRef = useRef(0)

  useEffect(() => {
    if (state !== 'play') return
    const spawn = setInterval(() => {
      const id = Math.random()
      const size = 26 + Math.random() * 14
      setBugs((b) => [...b, { id, x: 4 + Math.random() * 82, y: 4 + Math.random() * 82, size, rot: Math.random() * 360 }])
      setTimeout(() => setBugs((b) => b.filter((x) => x.id !== id)), 1300)
    }, 520)
    const endsAt = Date.now() + DURATION * 1000
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setLeft(remaining)
      if (remaining > 0) return
      clearInterval(spawn)
      clearInterval(tick)
      setState('over')
      setBugs([])
      setBest((b) => {
        if (scoreRef.current <= b) return b
        try { localStorage.setItem('sb.egg', String(scoreRef.current)) } catch { /* ignore */ }
        return scoreRef.current
      })
    }, 250)
    return () => { clearInterval(spawn); clearInterval(tick) }
  }, [state])

  const start = () => {
    scoreRef.current = 0
    setScore(0)
    setLeft(DURATION)
    setBugs([])
    setState('play')
  }

  const hit = (id) => {
    setBugs((b) => b.filter((x) => x.id !== id))
    scoreRef.current += 1
    setScore(scoreRef.current)
  }

  const close = () => {
    setState('idle')
    setBugs([])
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={t('eggTitle')}>
      <div className="mb-3 flex items-center justify-between text-[13px] text-muted tabular">
        <span>{t('eggScore', { n: score })}</span>
        <span>{state === 'play' ? `0:${String(left).padStart(2, '0')}` : t('eggBest', { n: best })}</span>
      </div>
      <div className="relative h-[300px] overflow-hidden rounded-2xl border border-line bg-surface"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, var(--line-strong) 1px, transparent 0)', backgroundSize: '18px 18px' }}>
        {state !== 'play' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="text-[15px]">{state === 'over' ? t('eggOver') : t('eggTitle')}</p>
              <p className="mt-1 text-[13px] text-muted">{state === 'over' ? t('eggScore', { n: score }) : t('eggLead')}</p>
              <Button variant="primary" className="mt-4" onClick={start}>{state === 'over' ? t('eggAgain') : t('eggStart')}</Button>
            </div>
          </div>
        )}
        {bugs.map((b) => (
          <button key={b.id} type="button" onPointerDown={() => hit(b.id)}
            className="absolute grid place-items-center text-accent animate-in"
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: b.size + 12, height: b.size + 12, transform: `rotate(${b.rot}deg)` }}>
            <Bug style={{ width: b.size, height: b.size }} strokeWidth={1.8} />
          </button>
        ))}
      </div>
    </Sheet>
  )
}

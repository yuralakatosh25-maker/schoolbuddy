import { cx } from './ui'

// Хвиляста «шапка»: суцільний блок кольору хвилі з плавним нижнім краєм і двома тінями-хвилями під ним.
// У світлій темі — чорна (як у референсі), у темній — трохи світліший за фон графіт.
export function WaveBand({ children, className, contentClassName, variant = 'a', doodle = true }) {
  const paths = {
    a: [
      'M0 0H400V40C330 78 262 84 196 58C128 32 66 36 0 66Z',
      'M0 0H400V30C334 70 262 74 196 48C128 22 66 26 0 54Z',
      'M0 0H400V18C334 58 262 62 196 36C128 10 66 14 0 40Z',
    ],
    b: [
      'M0 0H400V70C344 74 300 38 240 36C170 34 120 82 0 62Z',
      'M0 0H400V56C344 62 300 26 240 24C170 22 120 70 0 50Z',
      'M0 0H400V42C344 50 300 14 240 12C170 10 120 58 0 38Z',
    ],
  }[variant]
  return (
    <div className={cx('relative text-on-wave', className)}>
      <div className={cx('relative overflow-hidden bg-wave', contentClassName)}>
        {doodle && <Doodle />}
        <div className="relative">{children}</div>
      </div>
      <svg viewBox="0 0 400 86" preserveAspectRatio="none" className="-mt-px block h-14 w-full" aria-hidden="true">
        <path d={paths[0]} fill="var(--wave-3)" />
        <path d={paths[1]} fill="var(--wave-2)" />
        <path d={paths[2]} fill="var(--wave-1)" />
      </svg>
    </div>
  )
}

// Тонкі декоративні лінії, як контурні візерунки в референсі
function Doodle() {
  return (
    <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 size-full opacity-[0.14]" aria-hidden="true">
      <g fill="none" stroke="var(--on-wave)" strokeWidth="1.1">
        <path d="M250 -10C290 30 260 70 300 100S380 120 410 170" />
        <path d="M270 -10C306 26 280 66 318 94S392 112 420 158" />
        <path d="M-10 150C40 120 70 160 120 140S170 80 220 96" />
        <path d="M330 220C340 190 372 182 380 150S360 100 410 86" />
      </g>
    </svg>
  )
}

// Фонові лінії для світлих зон (екран входу)
export function LineBackdrop({ className }) {
  return (
    <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className={cx('pointer-events-none absolute inset-0 size-full opacity-[0.5]', className)} aria-hidden="true">
      <g fill="none" stroke="var(--line-strong)" strokeWidth="1">
        <path d="M-20 300C40 270 60 330 120 320S190 250 250 270 330 350 420 320" />
        <path d="M-20 318C40 288 60 348 120 338S190 268 250 288 330 368 420 338" />
        <path d="M300 420C320 380 380 380 390 340S350 280 420 260" />
      </g>
    </svg>
  )
}

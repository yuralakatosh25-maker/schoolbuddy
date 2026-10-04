import { useEffect, useState } from 'react'
import { ArrowRight, GraduationCap, Sparkles, ShieldCheck, Mail, ChevronLeft, Gift, FlaskConical } from 'lucide-react'
import { useApp, EMAIL_DOMAIN } from '../app/context'
import { Wordmark, LangSwitch, ThemeToggle } from '../app/Shell'
import { WaveBand, LineBackdrop } from '../components/Waves'
import { api } from '../lib/api'
import { Button, Field, cx } from '../components/ui'

const CLASSES = ['1.IT', '2.IT', '3.IT', '4.IT']

function readInvite() {
  const m = window.location.pathname.match(/^\/invite\/([A-Za-z0-9]+)/)
  if (m) {
    try { sessionStorage.setItem('sb.invite', m[1].toUpperCase()) } catch { /* ignore */ }
    window.history.replaceState(null, '', '/')
  }
  try { return sessionStorage.getItem('sb.invite') } catch { return null }
}

export default function Auth() {
  const { t, lang, login, errText } = useApp()
  const [step, setStep] = useState('email') // email | code | role | consent
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [role, setRole] = useState('student')
  const [nickname, setNickname] = useState('')
  const [cls, setCls] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteCode] = useState(readInvite)
  const [invite, setInvite] = useState(null)

  useEffect(() => {
    if (inviteCode) api.get(`/api/invites/${inviteCode}`).then(setInvite).catch(() => setInvite(null))
  }, [inviteCode])

  const run = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const fullEmail = email.includes('@') ? email.trim().toLowerCase() : `${email.trim().toLowerCase()}@${EMAIL_DOMAIN}`

  const requestCode = () => run(async () => {
    const res = await api.post('/api/auth/request-code', { email: fullEmail })
    setIsNew(res.isNew)
    setDevCode(res.devCode)
    setCode('')
    setStep('code')
  })

  const verify = () => run(async () => {
    const res = await api.post('/api/auth/verify', {
      email: fullEmail, code, role, nickname, consent, inviteCode, class: cls || null, lang,
    })
    try { sessionStorage.removeItem('sb.invite') } catch { /* ignore */ }
    login(res.token)
  })

  const demo = (r) => run(async () => {
    const res = await api.post('/api/demo/login', { role: r })
    login(res.token)
  })

  const onCodeNext = () => (isNew ? setStep('role') : verify())

  return (
    <div className="scroll-area flex h-full flex-col">
      <WaveBand className="shrink-0" contentClassName="pb-4" variant={step === 'email' ? 'a' : 'b'}>
        <header className="flex h-14 items-center justify-between px-4">
          <Wordmark onWave />
          <div className="flex items-center gap-1.5"><ThemeToggle onWave /><LangSwitch onWave /></div>
        </header>
        {step === 'email' && (
          <div className="px-5 pb-2 pt-6">
            <p className="font-display text-[44px] font-semibold leading-[1.02] tracking-wide">{t('authHero')}</p>
            <p className="mt-2 text-[14px] text-on-wave-muted">SŠINFIS · Plzeň</p>
          </div>
        )}
      </WaveBand>

      <div className="relative flex flex-1 flex-col px-5 pb-6">
        <LineBackdrop />
        {step !== 'email' && (
          <button type="button" onClick={() => { setError(''); setStep(step === 'consent' ? 'role' : step === 'role' ? 'code' : 'email') }}
            className="-ml-1 mt-2 flex items-center gap-1 self-start text-[13px] text-muted hover:text-ink">
            <ChevronLeft className="size-4" />{t('back')}
          </button>
        )}

        {step === 'email' && (
          <div className="animate-in">
            <div className="mt-2">
              <h1 className="font-display text-[26px] font-medium leading-8 tracking-wide">{t('authTitle')}</h1>
              <p className="mt-2 text-[14.5px] leading-6 text-muted">{t('authLead', { domain: EMAIL_DOMAIN })}</p>
            </div>

            {invite && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent/8 p-3.5 text-[13.5px] leading-5">
                <Gift className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{t('invitedBy', { name: invite.nickname, bonus: invite.bonus })}</span>
              </div>
            )}

            <form className="mt-7" onSubmit={(e) => { e.preventDefault(); requestCode() }}>
              <Field label={t('emailLabel')} error={error}>
                <div className="flex items-center rounded-xl border border-transparent bg-raised focus-within:border-line-strong focus-within:bg-card">
                  <Mail className="ml-3 size-4 shrink-0 text-faint" />
                  <input autoFocus inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder').split('@')[0]}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-3 text-[15px] outline-none placeholder:text-faint" />
                  {!email.includes('@') && <span className="pr-3 text-[14px] text-faint">@{EMAIL_DOMAIN}</span>}
                </div>
              </Field>
              <Button type="submit" variant="primary" size="lg" full className="mt-4" loading={busy} disabled={!email.trim()}>
                {t('getCode')}<ArrowRight className="size-4" />
              </Button>
            </form>

            <DemoBlock t={t} onDemo={demo} busy={busy} />
          </div>
        )}

        {step === 'code' && (
          <form className="animate-in" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) onCodeNext() }}>
            <h1 className="mt-4 font-display text-[32px] font-semibold leading-9 tracking-wide">{t('codeTitle')}</h1>
            <p className="mt-2 text-[14px] leading-6 text-muted">{t('codeLead', { email: fullEmail })}</p>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="field mt-6 text-center font-mono text-[26px] tracking-[0.5em]" placeholder="••••••" />
            {devCode && (
              <button type="button" onClick={() => setCode(devCode)}
                className="mt-3 w-full rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-[12.5px] leading-5 text-muted hover:text-ink">
                {t('devCodeHint', { code: devCode })}
              </button>
            )}
            {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
            <Button type="submit" variant="primary" size="lg" full className="mt-5" loading={busy} disabled={code.length !== 6}>
              {isNew ? t('continue') : t('signIn')}
            </Button>
            <div className="mt-3 flex justify-between text-[13px]">
              <button type="button" className="text-muted hover:text-ink" onClick={() => setStep('email')}>{t('changeEmail')}</button>
              <button type="button" className="text-muted hover:text-ink" onClick={requestCode}>{t('resendCode')}</button>
            </div>
          </form>
        )}

        {step === 'role' && (
          <form className="animate-in" onSubmit={(e) => { e.preventDefault(); setStep('consent') }}>
            <h1 className="mt-4 font-display text-[32px] font-semibold leading-9 tracking-wide">{t('newAccountTitle')}</h1>
            <p className="mt-5 mb-2 text-[13px] text-muted">{t('chooseRole')}</p>
            <div className="grid gap-2">
              {[
                { id: 'student', icon: GraduationCap, title: t('roleStudentLong'), desc: t('roleStudentDesc') },
                { id: 'mentor', icon: Sparkles, title: t('roleMentorLong'), desc: t('roleMentorDesc') },
              ].map(({ id, icon: Icon, title, desc }) => (
                <button key={id} type="button" onClick={() => setRole(id)}
                  className={cx('flex items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                    role === id ? 'border-ink bg-card ring-1 ring-ink' : 'border-line bg-card hover:border-line-strong')}>
                  <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', role === id ? 'bg-accent text-accent-ink' : 'bg-raised text-muted')}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[15px]">{title}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-muted">{desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <Field label={t('nicknameLabel')} className="mt-5">
              <input className="field" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} required minLength={2} />
            </Field>
            <Field label={t('classLabel')} className="mt-3">
              <div className="flex gap-2">
                {CLASSES.map((c) => (
                  <button key={c} type="button" onClick={() => setCls(c)}
                    className={cx('h-10 flex-1 rounded-xl border text-[14px] transition', cls === c ? 'border-ink bg-ink text-surface' : 'border-line bg-card text-muted hover:text-ink')}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" full className="mt-6" disabled={nickname.trim().length < 2}>{t('continue')}</Button>
          </form>
        )}

        {step === 'consent' && (
          <div className="animate-in">
            <div className="mt-4 grid size-11 place-items-center rounded-2xl bg-ink text-surface"><ShieldCheck className="size-5" /></div>
            <h1 className="mt-4 font-display text-[28px] font-semibold leading-9 tracking-wide">{t('consentTitle')}</h1>
            <p className="mt-3 text-[14px] leading-6 text-muted">{t('consentText')}</p>
            <p className="mt-3 text-[14px] leading-6 text-muted">{t('rulesText')}</p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-card p-3.5">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-(--accent)" />
              <span className="text-[14px] leading-5">{t('consentCheck')}</span>
            </label>
            {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
            <Button variant="primary" size="lg" full className="mt-5" disabled={!consent} loading={busy} onClick={verify}>{t('createAccount')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function DemoBlock({ t, onDemo, busy }) {
  return (
    <div className="card-shadow relative mt-10 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-center gap-2 text-[14px]"><FlaskConical className="size-4 text-muted" />{t('demoTitle')}</div>
      <p className="mt-1 text-[12.5px] leading-5 text-muted">{t('demoLead')}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={() => onDemo('student')} disabled={busy}>{t('demoAsStudent')}</Button>
        <Button size="sm" onClick={() => onDemo('mentor')} disabled={busy}>{t('demoAsMentor')}</Button>
        <Button size="sm" onClick={() => onDemo('admin')} disabled={busy}>{t('demoAsAdmin')}</Button>
      </div>
    </div>
  )
}

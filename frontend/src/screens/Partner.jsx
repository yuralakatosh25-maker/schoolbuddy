import { useCallback, useEffect, useState } from 'react'
import { Store, ScanLine, LogOut, Coins, BadgeCheck, Trash2, Plus, Copy, Hourglass } from 'lucide-react'
import { useApp } from '../app/context'
import { LogoMark, LangSwitch, ThemeToggle } from '../app/Shell'
import { request } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtRelative } from '../lib/format'
import { Avatar, Badge, Button, Card, Field, List, Row, Section, Segmented, Stat } from '../components/ui'
import { QrScanner } from '../components/Qr'
import { extractToken } from '../lib/qr'

const KEY = 'sb.partnerKey'
const KINDS = ['cafe', 'cyberclub', 'shop', 'sport', 'other']

// Кабінет партнера: реєстрація закладу, каса (QR + сума чека), пропозиції та звіт
export default function Partner() {
  const { t, errText } = useApp()
  const [key, setKey] = useState(() => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } })
  const [partner, setPartner] = useState(null)
  const [error, setError] = useState('')

  const call = useCallback((path, opts = {}) => request(path, { ...opts, headers: { 'X-Partner-Key': key } }), [key])

  const loadPartner = useCallback(async () => {
    if (!key) return
    try {
      setPartner(await call('/api/partner/me'))
      setError('')
    } catch (e) {
      setError(errText(e))
      setPartner(null)
    }
  }, [key, call, errText])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- стан оновлюється після відповіді API
  useEffect(() => { loadPartner() }, [loadPartner])

  const signIn = (value) => {
    const k = value.trim()
    try { localStorage.setItem(KEY, k) } catch { /* ignore */ }
    setError('')
    setKey(k)
  }
  const signOut = () => {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    setKey('')
    setPartner(null)
  }

  return (
    <div className="scroll-area flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2"><LogoMark /><span className="text-[17px] font-semibold tracking-tight">{t('partnerTitle')}</span></div>
        <div className="flex items-center gap-1.5">
          {partner && <button type="button" onClick={signOut} className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised" aria-label={t('partnerLogout')}><LogOut className="size-4" /></button>}
          <ThemeToggle />
          <LangSwitch />
        </div>
      </header>
      <div className="px-4 pb-8">
        {!partner ? <Welcome error={error} onSignIn={signIn} /> : partner.status === 'pending' ? (
          <Pending partner={partner} reload={loadPartner} />
        ) : (
          <Dashboard partner={partner} call={call} reload={loadPartner} />
        )}
      </div>
    </div>
  )
}

function Welcome({ error, onSignIn }) {
  const { t, errText } = useApp()
  const [mode, setMode] = useState('login')
  const [keyInput, setKeyInput] = useState('')
  const [form, setForm] = useState({ name: '', kind: 'cafe', address: '', contactEmail: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [created, setCreated] = useState(null)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const register = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try { setCreated((await request('/api/partner/register', { method: 'POST', body: form })).apiKey) } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }

  if (created) {
    return (
      <div className="mt-8">
        <div className="grid size-11 place-items-center rounded-2xl bg-raised text-accent"><Hourglass className="size-5" /></div>
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{t('bizRegisteredTitle')}</h1>
        <p className="mt-2 text-[14px] leading-6 text-muted">{t('bizKeyWarn')}</p>
        <Card className="mt-4 flex items-center gap-2 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-[13px]">{created}</code>
          <Button size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(created)} aria-label={t('copy')} />
        </Card>
        <Button variant="primary" size="lg" full className="mt-4" onClick={() => onSignIn(created)}>{t('bizEnter')}</Button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="grid size-11 place-items-center rounded-2xl bg-raised text-accent"><Store className="size-5" /></div>
      <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{t('partnerTitle')}</h1>
      <Segmented className="mt-4" value={mode} onChange={setMode} options={[
        { value: 'login', label: t('bizLoginTab') },
        { value: 'register', label: t('bizRegisterTab') },
      ]} />

      {mode === 'login' ? (
        <form onSubmit={(e) => { e.preventDefault(); onSignIn(keyInput) }}>
          <Field label={t('partnerKey')} className="mt-5" error={error} hint={t('partnerDemoKeys')}>
            <input className="field font-mono" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoFocus />
          </Field>
          <Button type="submit" variant="primary" size="lg" full className="mt-4" disabled={!keyInput.trim()}>{t('partnerLogin')}</Button>
        </form>
      ) : (
        <form onSubmit={register}>
          <p className="mt-4 text-[13.5px] leading-5 text-muted">{t('bizRegisterLead')}</p>
          <Field label={t('bizName')} className="mt-4"><input className="field" value={form.name} onChange={set('name')} maxLength={60} required /></Field>
          <Field label={t('bizKind')} className="mt-3">
            <select className="field" value={form.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k} value={k}>{t('kind_' + k)}</option>)}</select>
          </Field>
          <Field label={t('bizAddress')} className="mt-3"><input className="field" value={form.address} onChange={set('address')} maxLength={120} required /></Field>
          <Field label={t('bizEmail')} className="mt-3" error={err}><input className="field" type="email" value={form.contactEmail} onChange={set('contactEmail')} maxLength={200} required /></Field>
          <Button type="submit" variant="primary" size="lg" full className="mt-4" loading={busy}>{t('bizRegister')}</Button>
        </form>
      )}
    </div>
  )
}

function Pending({ partner, reload }) {
  const { t } = useApp()
  return (
    <div className="mt-8">
      <div className="grid size-11 place-items-center rounded-2xl bg-raised text-warn"><Hourglass className="size-5" /></div>
      <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{t('bizPendingTitle')}</h1>
      <Card className="mt-4 p-4">
        <div className="text-[18px] font-semibold">{partner.name}</div>
        <div className="text-[13px] text-muted">{partner.address}</div>
      </Card>
      <p className="mt-3 text-[14px] leading-6 text-muted">{t('bizPendingText')}</p>
      <Button className="mt-4" onClick={reload}>{t('retry')}</Button>
    </div>
  )
}

function Dashboard({ partner, call, reload }) {
  const { t } = useApp()
  const [tab, setTab] = useState('till')
  return (
    <>
      <Card className="mt-2 p-4">
        <div className="flex items-center gap-2 text-[18px] font-semibold">{partner.name}<Badge tone="ok">{t('approved')}</Badge></div>
        <div className="text-[13px] text-muted">{partner.address}</div>
      </Card>
      <Segmented className="mt-4" value={tab} onChange={setTab} options={[
        { value: 'till', label: t('bizTabTill') },
        { value: 'offers', label: t('bizTabOffers') },
        { value: 'report', label: t('bizTabReport') },
      ]} />
      {tab === 'till' && <Till partner={partner} call={call} />}
      {tab === 'offers' && <Offers partner={partner} call={call} reload={reload} />}
      {tab === 'report' && <Report call={call} />}
    </>
  )
}

function Till({ partner, call }) {
  const { t, lang, errText, toast } = useApp()
  const [code, setCode] = useState('')
  const [customer, setCustomer] = useState(null)
  const [scan, setScan] = useState(false)
  const [amount, setAmount] = useState('')

  const find = async (raw) => {
    const token = extractToken(raw)
    setScan(false)
    setCode(token)
    try { setCustomer({ ...(await call(`/api/partner/customer/${encodeURIComponent(token)}`)), token }) } catch (e) { toast(errText(e), 'error'); setCustomer(null) }
  }

  const redeem = async (reward) => {
    try {
      const res = await call('/api/partner/redeem', { method: 'POST', body: { qrToken: customer.token, rewardId: reward.id, purchaseAmount: Number(amount) } })
      toast(t('redeemed', { n: res.balance }))
      setCustomer({ ...customer, coins: res.balance })
      setAmount('')
    } catch (e) { toast(errText(e), 'error') }
  }

  return (
    <>
      <Section title={t('partnerScanLead')}>
        <Button variant="primary" full size="lg" icon={ScanLine} onClick={() => setScan(true)}>{t('scanQr')}</Button>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) find(code) }}>
          <input className="field font-mono text-[13px]" placeholder={t('customerCode')} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={!code.trim()}>{t('findCustomer')}</Button>
        </form>
      </Section>

      {customer && (
        <Section>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Avatar user={customer} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[16px]">{customer.nickname}{customer.verified && <BadgeCheck className="size-4 text-accent" />}</div>
                <div className="text-[13px] text-muted">{t(customer.role)} · {t('tier_' + customer.tier)}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[20px] font-semibold tabular"><Coins className="size-5 text-accent" />{customer.coins}</div>
            </div>
            <Field label={t('bizPurchase')} hint={t('bizPurchaseHint')} className="mt-4">
              <input className="field" type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <List className="mt-4">
              {partner.rewards.map((r) => {
                const locked = customer.tier < r.minTier
                const poor = customer.coins < r.cost
                return (
                  <Row key={r.id} chevron={false} title={pick(r, 'title', lang)}
                    subtitle={locked ? t('fromTier', { tier: t('tier_' + r.minTier) }) : `${r.cost} BC`}
                    right={<Button size="sm" variant="primary" disabled={locked || poor || !(Number(amount) > 0)} onClick={() => redeem(r)}>{t('redeem')}</Button>} />
                )
              })}
            </List>
          </Card>
        </Section>
      )}
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={find} />
    </>
  )
}

function Offers({ partner, call, reload }) {
  const { t, lang, errText, toast } = useApp()
  const [form, setForm] = useState({ title: '', cost: 50, minTier: 0 })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await call('/api/partner/rewards', { method: 'POST', body: { title: form.title, cost: Number(form.cost), minTier: Number(form.minTier) } })
      setForm({ title: '', cost: 50, minTier: 0 })
      reload()
    } catch (x) { setErr(errText(x)) } finally { setBusy(false) }
  }
  const remove = async (id) => {
    try { await call(`/api/partner/rewards/${id}`, { method: 'DELETE' }); reload() } catch (x) { toast(errText(x), 'error') }
  }

  return (
    <Section title={t('bizTabOffers')}>
      <p className="mb-3 text-[13px] leading-5 text-muted">{t('bizOffersLead')}</p>
      {partner.rewards.length > 0 && (
        <List>
          {partner.rewards.map((r) => (
            <Row key={r.id} chevron={false} title={pick(r, 'title', lang)} subtitle={`${r.cost} BC · ${t('tier_' + r.minTier)}`}
              right={<Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(r.id)} aria-label={t('delete')} />} />
          ))}
        </List>
      )}
      <form onSubmit={add} className="mt-4">
        <Field label={t('bizOfferTitle')} error={err}>
          <input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={100} placeholder={t('bizOfferPlaceholder')} required />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label={t('bizOfferCost')}><input className="field" type="number" min="10" max="1000" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          <Field label={t('bizOfferTier')}>
            <select className="field" value={form.minTier} onChange={(e) => setForm({ ...form, minTier: e.target.value })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{t('tier_' + n)}</option>)}</select>
          </Field>
        </div>
        <Button type="submit" variant="primary" icon={Plus} full className="mt-3" loading={busy} disabled={form.title.trim().length < 5}>{t('bizAddOffer')}</Button>
      </form>
    </Section>
  )
}

function Report({ call }) {
  const { t, lang } = useApp()
  const [stats, setStats] = useState(null)
  const [tx, setTx] = useState([])

  useEffect(() => {
    call('/api/partner/stats').then(setStats).catch(() => {})
    call('/api/partner/transactions').then(setTx).catch(() => {})
  }, [call])

  const block = (title, s) => (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('bizVisits')} value={s.visits} />
        <Stat label={t('bizCustomers')} value={s.customers} />
        <Stat label={t('bizRevenue')} value={`${s.purchaseTotal} Kč`} />
        <Stat label={t('bizAvg')} value={`${s.avgCheck} Kč`} />
      </div>
    </Section>
  )

  return (
    <>
      <p className="mt-4 text-[13px] leading-5 text-muted">{t('bizReportLead')}</p>
      {stats && block(t('bizReport30'), stats.last30)}
      {stats && block(t('bizReportTotal'), stats.total)}
      {stats?.top.length > 0 && (
        <Section title={t('bizTop')}>
          <List>{stats.top.map((x) => <Row key={x.title} chevron={false} title={x.title} right={<Badge>{x.count}</Badge>} />)}</List>
        </Section>
      )}
      <Section title={t('transactions')}>
        <List>
          {tx.length === 0 ? <p className="p-4 text-center text-[13px] text-muted">{t('noData')}</p> : tx.map((x) => (
            <Row key={x.id} chevron={false} title={x.nickname}
              subtitle={`${fmtRelative(x.createdAt, lang, t)}${x.purchaseAmount ? ` · ${x.purchaseAmount} Kč` : ''}`} right={<Badge>{x.amount} BC</Badge>} />
          ))}
        </List>
      </Section>
    </>
  )
}

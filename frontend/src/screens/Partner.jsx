import { useCallback, useEffect, useState } from 'react'
import { Store, ScanLine, LogOut, Coins, BadgeCheck } from 'lucide-react'
import { useApp } from '../app/context'
import { LogoMark, LangSwitch, ThemeToggle } from '../app/Shell'
import { request } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtRelative } from '../lib/format'
import { Avatar, Badge, Button, Card, Field, List, Row, Section } from '../components/ui'
import { QrScanner } from '../components/Qr'
import { extractToken } from '../lib/qr'

const KEY = 'sb.partnerKey'

// Каса партнерського закладу: сканування QR ментора і списання Buddy Coins
export default function Partner() {
  const { t, lang, errText, toast } = useApp()
  const [key, setKey] = useState(() => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } })
  const [keyInput, setKeyInput] = useState('')
  const [partner, setPartner] = useState(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [customer, setCustomer] = useState(null)
  const [scan, setScan] = useState(false)
  const [tx, setTx] = useState([])

  const call = useCallback((path, opts = {}) => request(path, { ...opts, headers: { 'X-Partner-Key': key } }), [key])

  const loadPartner = useCallback(async () => {
    if (!key) return
    try {
      setPartner(await call('/api/partner/me'))
      setTx(await call('/api/partner/transactions'))
    } catch (e) {
      setError(errText(e))
      setPartner(null)
    }
  }, [key, call, errText])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- стан оновлюється після відповіді API
  useEffect(() => { loadPartner() }, [loadPartner])

  const signIn = (e) => {
    e.preventDefault()
    setError('')
    try { localStorage.setItem(KEY, keyInput.trim()) } catch { /* ignore */ }
    setKey(keyInput.trim())
  }
  const signOut = () => {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    setKey('')
    setPartner(null)
    setCustomer(null)
  }

  const find = async (raw) => {
    const token = extractToken(raw)
    setScan(false)
    setCode(token)
    try { setCustomer({ ...(await call(`/api/partner/customer/${encodeURIComponent(token)}`)), token }) } catch (e) { toast(errText(e), 'error'); setCustomer(null) }
  }

  const redeem = async (reward) => {
    try {
      const res = await call('/api/partner/redeem', { method: 'POST', body: { qrToken: customer.token, rewardId: reward.id } })
      toast(t('redeemed', { n: res.balance }))
      setCustomer({ ...customer, coins: res.balance })
      setTx(await call('/api/partner/transactions'))
    } catch (e) { toast(errText(e), 'error') }
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
        {!partner ? (
          <form onSubmit={signIn} className="mt-8">
            <div className="grid size-11 place-items-center rounded-2xl bg-raised text-accent"><Store className="size-5" /></div>
            <h1 className="mt-4 text-[24px] font-semibold tracking-tight">{t('partnerTitle')}</h1>
            <Field label={t('partnerKey')} className="mt-5" error={error} hint={t('partnerDemoKeys')}>
              <input className="field font-mono" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} autoFocus />
            </Field>
            <Button type="submit" variant="primary" size="lg" full className="mt-4" disabled={!keyInput.trim()}>{t('partnerLogin')}</Button>
          </form>
        ) : (
          <>
            <Card className="mt-2 p-4">
              <div className="text-[18px] font-semibold">{partner.name}</div>
              <div className="text-[13px] text-muted">{partner.address}</div>
            </Card>

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
                  <List className="mt-4">
                    {partner.rewards.map((r) => {
                      const locked = customer.tier < r.minTier
                      const poor = customer.coins < r.cost
                      return (
                        <Row key={r.id} chevron={false} title={pick(r, 'title', lang)}
                          subtitle={locked ? t('fromTier', { tier: t('tier_' + r.minTier) }) : `${r.cost} BC`}
                          right={<Button size="sm" variant="primary" disabled={locked || poor} onClick={() => redeem(r)}>{t('redeem')}</Button>} />
                      )
                    })}
                  </List>
                </Card>
              </Section>
            )}

            <Section title={t('transactions')}>
              <List>
                {tx.length === 0 ? <p className="p-4 text-center text-[13px] text-muted">{t('noData')}</p> : tx.map((x) => (
                  <Row key={x.id} chevron={false} title={x.nickname} subtitle={fmtRelative(x.createdAt, lang, t)} right={<Badge>{x.amount} BC</Badge>} />
                ))}
              </List>
            </Section>
          </>
        )}
      </div>
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={find} />
    </div>
  )
}

import { useState } from 'react'
import {
  Award, Lock, Share2, Flame, Link2, LifeBuoy, CalendarCheck, Users, Trophy, CalendarDays, Handshake, QrCode, Store, Coins,
} from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { pick } from '../lib/i18n'
import { fmtDate, fmtRelative } from '../lib/format'
import { makeStoryImage, shareImage } from '../lib/share'
import { Badge, Button, Card, List, Loading, Progress, Row, ScreenHeader, Section, Segmented, Sheet, cx } from '../components/ui'
import { QrImage } from '../components/Qr'

const achIcons = {
  FIRST_MENTOR: Link2, FIRST_HELP: LifeBuoy, FIRST_MEETING: CalendarCheck, HELPED_5: Users, HELPED_10: Trophy,
  ACTIVE_30: Flame, EVENT_PARTICIPANT: CalendarDays, TEAM_PLAYER: Handshake,
}

export function Achievements() {
  const { t, lang, me, toast } = useApp()
  const nav = useNav()
  const { data, loading } = useApi('/api/me/achievements')
  const [busy, setBusy] = useState(false)

  const shareStory = async () => {
    setBusy(true)
    try {
      const unlocked = (data ?? []).filter((a) => a.unlocked).map((a) => t('ach_' + a.code))
      const blob = await makeStoryImage({
        name: me.nickname, streak: me.streak, streakLabel: t('streakDays', { n: me.streak }).replace(/^\d+\s*-?\s*/, ''),
        title: t('title_' + me.stats.title), rankLabel: t('rank'), achievements: unlocked, footer: 'SchoolBuddy · SŠINFIS Plzeň',
      })
      const r = await shareImage(blob, 'schoolbuddy-story.png', `SchoolBuddy · ${t('streakDays', { n: me.streak })}`)
      if (r === 'downloaded') toast(t('storyReady'))
    } finally { setBusy(false) }
  }

  return (
    <>
      <ScreenHeader title={t('achievements')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <Card className="flex items-center gap-4 p-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-warn/12"><Flame className="size-7 text-warn" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[22px] font-semibold leading-7 tabular">{t('streakDays', { n: me.streak })}</div>
            <div className="text-[13px] text-muted">{t('rank')}: {t('title_' + me.stats.title)} · {t('jointActivities', { n: me.stats.joint })}</div>
          </div>
        </Card>
        <Button variant="primary" full icon={Share2} className="mt-3" loading={busy} onClick={shareStory}>{t('shareStory')}</Button>

        <Section title={t('badges')}>
          {loading && !data ? <Loading /> : (
            <div className="grid grid-cols-2 gap-2">
              {data?.map((a) => {
                const Icon = achIcons[a.code] ?? Award
                return (
                  <Card key={a.code} className={cx('p-3.5', !a.unlocked && 'opacity-55')}>
                    <div className="flex items-start justify-between">
                      <span className={cx('grid size-10 place-items-center rounded-xl', a.unlocked ? 'bg-accent/12 text-accent' : 'bg-raised text-faint')}>
                        {a.unlocked ? <Icon className="size-5" /> : <Lock className="size-4" />}
                      </span>
                      <span className="text-[12px] text-muted tabular">+{a.coins}</span>
                    </div>
                    <div className="mt-3 text-[14px] leading-5">{t('ach_' + a.code)}</div>
                    <div className="mt-0.5 text-[12px] leading-4 text-muted">{t('ach_' + a.code + '_d')}</div>
                    <div className="mt-2 text-[11.5px] text-faint">{a.unlocked ? fmtDate(a.unlockedAt, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : t('locked')}</div>
                  </Card>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </>
  )
}

const tierColors = ['#b9784a', '#9aa3ad', '#d9a521', 'var(--ink)']

export function Wallet({ tab: initialTab }) {
  const { t, lang } = useApp()
  const nav = useNav()
  const { data: w, loading } = useApi('/api/wallet')
  const [tab, setTab] = useState(initialTab ?? 'history')
  const [qr, setQr] = useState(false)

  const reasonLabel = (r) => (r.startsWith('achievement:') ? `${t('tx_achievement')} · ${t('ach_' + r.split(':')[1])}` : t('tx_' + r))

  return (
    <>
      <ScreenHeader title={t('wallet')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        {loading && !w ? <Loading /> : w && (
          <>
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[12.5px] text-muted">{t('balance')}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[34px] font-semibold leading-10 tracking-tight tabular">
                    <Coins className="size-7 text-muted" />{w.balance}
                  </div>
                </div>
                <Button size="sm" icon={QrCode} onClick={() => setQr(true)}>QR</Button>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-1">
                {w.thresholds.map((th, i) => (
                  <div key={i} className="text-center">
                    <div className={cx('h-1.5 rounded-full', i <= w.tier ? '' : 'bg-raised')} style={i <= w.tier ? { background: tierColors[i] } : undefined} />
                    <div className={cx('mt-1.5 text-[11.5px]', i === w.tier ? 'text-ink' : 'text-faint')}>{t('tier_' + i)}</div>
                    <div className="text-[10.5px] text-faint tabular">{th}+</div>
                  </div>
                ))}
              </div>
              {w.nextTierAt ? (
                <>
                  <Progress className="mt-3" value={w.brought} max={w.nextTierAt} />
                  <p className="mt-1.5 text-[12px] text-faint">{t('tierProgress', { n: w.brought, next: w.nextTierAt })}</p>
                </>
              ) : <p className="mt-3 text-[12px] text-accent">{t('tierMax')}</p>}
            </Card>

            <Segmented className="mt-4" value={tab} onChange={setTab} options={[{ value: 'history', label: t('history') }, { value: 'rewards', label: t('partnerBonuses') }]} />

            {tab === 'history' && (
              <List className="mt-3">
                {w.transactions.length === 0 ? <p className="p-4 text-center text-[13px] text-muted">{t('noData')}</p> : w.transactions.map((x) => (
                  <Row key={x.id} chevron={false} title={reasonLabel(x.reason)} subtitle={[x.partner, fmtRelative(x.createdAt, lang, t)].filter(Boolean).join(' · ')}
                    right={<span className={cx('text-[15px] font-medium tabular', x.amount > 0 ? 'text-ok' : 'text-muted')}>{x.amount > 0 ? '+' : ''}{x.amount}</span>} />
                ))}
              </List>
            )}

            {tab === 'rewards' && (
              <>
                <p className="mt-3 px-1 text-[12.5px] leading-5 text-faint">{t('walletQrLead')}</p>
                <List className="mt-2">
                  {w.rewards.map((r) => (
                    <Row key={r.id} chevron={false}
                      left={<span className="grid size-9 place-items-center rounded-full bg-raised"><Store className="size-4 text-muted" /></span>}
                      title={<span className={cx(!r.unlocked && 'text-muted')}>{pick(r, 'title', lang)}</span>}
                      subtitle={r.unlocked ? r.partner : `${r.partner} · ${t('fromTier', { tier: t('tier_' + r.minTier) })}`}
                      right={<Badge tone={!r.unlocked ? 'neutral' : r.affordable ? 'accent' : 'neutral'} icon={!r.unlocked ? Lock : undefined}>{r.cost} BC</Badge>} />
                  ))}
                </List>
              </>
            )}
          </>
        )}
      </div>
      <Sheet open={qr} onClose={() => setQr(false)} title={t('wallet')}>
        {w && (
          <div className="flex flex-col items-center pb-2 text-center">
            <QrImage value={w.qrToken} size={232} />
            <p className="mt-3 max-w-[300px] text-[13px] leading-5 text-muted">{t('walletQrLead')}</p>
          </div>
        )}
      </Sheet>
    </>
  )
}

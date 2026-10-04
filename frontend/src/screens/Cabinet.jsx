import { useState } from 'react'
import {
  CalendarClock, Users, MapPin, ShieldCheck, Wallet as WalletIcon, QrCode, KeyRound, ChevronRight, Clock3, Check, X, Archive,
  Search, Gift, CalendarCheck,
} from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { fmtDayTime } from '../lib/format'
import {
  Avatar, Badge, Button, Card, Empty, List, PageTitle, Progress, Row, Section, Segmented, Sheet, Loading, VerifiedMark,
} from '../components/ui'
import { MeetingRow, PersonRow } from '../components/items'
import { QrScanner } from '../components/Qr'
import { PlacesMap } from './SafeMap'

export default function Cabinet() {
  const { me } = useApp()
  return me.role === 'mentor' ? <MentorCabinet /> : <StudentCabinet />
}

function useConnections() {
  return useApi('/api/connections')
}

function StudentCabinet() {
  const { t, me } = useApp()
  const nav = useNav()
  const meetings = useApi('/api/meetings')
  const conns = useConnections()
  const places = useApi('/api/places')
  const mentors = (conns.data ?? []).filter((c) => c.myRole === 'student' && c.status !== 'archived')
  const archived = (conns.data ?? []).filter((c) => c.status === 'archived').length

  return (
    <div className="px-4 pb-8">
      <PageTitle>{t('cabinetStudent')}</PageTitle>

      <Section title={t('plannedMeetings')} action={t('seeAll')} onAction={() => nav.push('meetings')}>
        {meetings.loading && !meetings.data ? <Loading /> : !meetings.data?.length ? (
          <Card><Empty icon={CalendarClock} text={t('noMeetings')} /></Card>
        ) : (
          <List>{meetings.data.slice(0, 4).map((m) => <MeetingRow key={m.id} meeting={m} onClick={() => nav.push('meeting', { id: m.id })} />)}</List>
        )}
        {!!meetings.data?.length && <p className="mt-2 px-1 text-[12.5px] leading-5 text-faint">{t('pinLead')}</p>}
      </Section>

      <Section title={t('myMentors')} action={archived ? `${t('archived')} · ${archived}` : undefined} onAction={() => nav.push('chats')}>
        {conns.loading && !conns.data ? <Loading /> : mentors.length === 0 ? (
          <Card><Empty icon={Users} text={t('noConnections')} action={<Button size="sm" icon={Search} onClick={() => nav.setTab('match')}>{t('qaFindMentor')}</Button>} /></Card>
        ) : (
          <List>
            {mentors.map((c) => (
              <PersonRow key={c.id} person={c.with}
                subtitle={c.status === 'pending' ? t('pending') : c.lastMessage?.text || t('openChat')}
                right={c.status === 'pending' ? <Badge tone="warn">{t('pending')}</Badge> : null}
                onClick={() => (c.status === 'active' ? nav.push('chat', { id: c.id }) : nav.push('user', { id: c.with.id }))} />
            ))}
          </List>
        )}
      </Section>

      <Section title={t('safePlaces')} action={t('seeAll')} onAction={() => nav.push('map')}>
        <Card className="overflow-hidden">
          <div className="h-44">{places.data && <PlacesMap places={places.data} compact />}</div>
          <div className="divide-y divide-line border-t border-line">
            {(places.data ?? []).slice(0, 3).map((p) => (
              <Row key={p.id} onClick={() => nav.push('map', { placeId: p.id })}
                left={<MapPin className="size-4 text-muted" />} title={p.name} subtitle={`${t('place_' + p.kind)} · ${p.address}`}
                right={p.partner ? <Badge tone="accent">{t('partner')}</Badge> : null} />
            ))}
          </div>
        </Card>
      </Section>

      <Section>
        <List>
          <Row left={<ShieldCheck className="size-4 text-muted" />} title={t('trustedContacts')} onClick={() => nav.push('trusted')} />
          <Row left={<WalletIcon className="size-4 text-muted" />} title={t('wallet')} right={<span className="text-[14px] tabular text-muted">{me.coins} BC</span>} onClick={() => nav.push('wallet')} />
        </List>
      </Section>
    </div>
  )
}

function MentorCabinet() {
  const { t, me, setMe, lang, fail, toast, ask } = useApp()
  const nav = useNav()
  const wallet = useApi('/api/wallet')
  const conns = useConnections()
  const meetings = useApi('/api/meetings')
  const [scan, setScan] = useState(false)
  const [pinFor, setPinFor] = useState(false)

  const active = (conns.data ?? []).filter((c) => c.myRole === 'mentor' && c.status === 'active')
  const pending = (conns.data ?? []).filter((c) => c.myRole === 'mentor' && c.status === 'pending')
  const mentorMeetings = (meetings.data ?? []).filter((m) => m.myRole === 'mentor')

  const setAvailability = async (availability) => {
    setMe((m) => ({ ...m, availability }))
    try { await api.put('/api/me', { availability }) } catch (e) { fail(e) }
  }

  const respond = async (c, action) => {
    try {
      await api.post(`/api/connections/${c.id}/${action}`)
      conns.reload()
      if (action === 'accept') nav.push('chat', { id: c.id })
    } catch (e) { fail(e) }
  }

  const confirmMeeting = async (payload) => {
    try {
      const res = await api.post('/api/meetings/confirm', payload)
      toast(t('meetingConfirmed', { coins: res.coins }))
      setScan(false)
      setPinFor(false)
      meetings.reload()
      wallet.reload()
    } catch (e) { fail(e) }
  }

  const enterPin = async (m) => {
    const pin = await ask({ title: t('meetingWith', { name: m.with?.nickname }), text: fmtDayTime(m.scheduledAt, lang, t), input: '000000', confirm: t('confirm') })
    if (pin) confirmMeeting({ meetingId: m.id, pin })
  }

  const w = wallet.data
  return (
    <div className="px-4 pb-8">
      <PageTitle>{t('cabinetMentor')}</PageTitle>

      <Card className="mt-4 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12.5px] text-muted">{t('coins')}</div>
            <div className="mt-0.5 text-[30px] font-semibold leading-9 tracking-tight tabular">{w?.balance ?? me.coins}</div>
          </div>
          {w && <Badge tone="accent">{t('tier')}: {t('tier_' + w.tier)}</Badge>}
        </div>
        {w && (
          <>
            <Progress className="mt-3" value={w.brought} max={w.nextTierAt ?? w.brought} />
            <div className="mt-1.5 text-[12px] text-faint">{w.nextTierAt ? t('tierProgress', { n: w.brought, next: w.nextTierAt }) : t('tierMax')}</div>
          </>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button icon={WalletIcon} onClick={() => nav.push('wallet')}>{t('wallet')}</Button>
          <Button icon={Gift} onClick={() => nav.push('wallet', { tab: 'rewards' })}>{t('partnerBonuses')}</Button>
        </div>
      </Card>

      <Section title={t('availability')}>
        <Segmented value={me.availability} onChange={setAvailability}
          options={['available', 'busy', 'dnd'].map((a) => ({ value: a, label: t('avail_' + a) }))} />
        <List className="mt-2">
          <Row left={<Clock3 className="size-4 text-muted" />} title={t('officeHours')} onClick={() => nav.push('officeHours')} />
        </List>
      </Section>

      <Section title={t('meetingConfirm')}>
        <Card className="p-4">
          <p className="text-[13px] leading-5 text-muted">{t('meetingConfirmLead')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="primary" icon={QrCode} onClick={() => setScan(true)}>{t('scanQr')}</Button>
            <Button icon={KeyRound} onClick={() => setPinFor(true)} disabled={!mentorMeetings.length}>{t('enterPin')}</Button>
          </div>
        </Card>
      </Section>

      {pending.length > 0 && (
        <Section title={t('pendingRequests')}>
          <List>
            {pending.map((c) => (
              <PersonRow key={c.id} person={c.with} chevron={false} onClick={() => nav.push('user', { id: c.with.id })}
                right={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="primary" icon={Check} onClick={(e) => { e.stopPropagation(); respond(c, 'accept') }} aria-label={t('accept')} />
                    <Button size="sm" variant="ghost" icon={X} onClick={(e) => { e.stopPropagation(); respond(c, 'decline') }} aria-label={t('decline')} />
                  </div>
                } />
            ))}
          </List>
        </Section>
      )}

      <Section title={t('connectionsMap')} action={t('capacity', { n: active.length, max: me.maxStudents })}>
        {conns.loading && !conns.data ? <Loading /> : active.length === 0 ? (
          <Card><Empty icon={Users} text={t('noStudents')} /></Card>
        ) : (
          <>
            <ConnectionsGraph me={me} connections={active} onOpen={(c) => nav.push('chat', { id: c.id })} />
            <List className="mt-2">
              {active.map((c) => (
                <PersonRow key={c.id} person={c.with} subtitle={c.lastMessage?.text || t('openChat')}
                  right={c.meetings ? <Badge icon={CalendarCheck}>{c.meetings}</Badge> : null}
                  onClick={() => nav.push('chat', { id: c.id })} />
              ))}
            </List>
          </>
        )}
        <button type="button" onClick={() => nav.push('chats')} className="mt-2 flex items-center gap-1.5 px-1 text-[13px] text-muted hover:text-ink">
          <Archive className="size-3.5" />{t('archived')}<ChevronRight className="size-3.5" />
        </button>
      </Section>

      {mentorMeetings.length > 0 && (
        <Section title={t('plannedMeetings')} action={t('seeAll')} onAction={() => nav.push('meetings')}>
          <List>{mentorMeetings.slice(0, 4).map((m) => <MeetingRow key={m.id} meeting={m} onClick={() => nav.push('meeting', { id: m.id })} />)}</List>
        </Section>
      )}

      <QrScanner open={scan} onClose={() => setScan(false)} title={t('meetingConfirm')} onResult={(qrToken) => confirmMeeting({ qrToken })} />
      <Sheet open={pinFor} onClose={() => setPinFor(false)} title={t('enterPin')}>
        <List>
          {mentorMeetings.map((m) => <MeetingRow key={m.id} meeting={m} onClick={() => enterPin(m)} />)}
        </List>
      </Sheet>
    </div>
  )
}

// Мапа активних звʼязків: ментор у центрі, новачки по колу
function ConnectionsGraph({ me, connections, onOpen }) {
  const size = 280
  const c = size / 2
  const r = connections.length === 1 ? 82 : 100
  const nodes = connections.map((conn, i) => {
    const a = (i / connections.length) * Math.PI * 2 - Math.PI / 2
    return { conn, x: c + r * Math.cos(a), y: c + r * Math.sin(a) }
  })
  return (
    <Card className="relative mx-auto overflow-hidden" >
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-strong)" strokeDasharray="3 5" />
          {nodes.map(({ conn, x, y }) => (
            <line key={conn.id} x1={c} y1={c} x2={x} y2={y} stroke={conn.meetings ? 'var(--ink)' : 'var(--line-strong)'} strokeOpacity={conn.meetings ? 0.6 : 1} strokeWidth={conn.meetings ? 1.5 : 1} />
          ))}
        </svg>
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: c, top: c }}>
          <div className="rounded-full ring-2 ring-ink ring-offset-2 ring-offset-card"><Avatar user={me} size={54} /></div>
        </div>
        {nodes.map(({ conn, x, y }) => (
          <button key={conn.id} type="button" onClick={() => onOpen(conn)} className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: x, top: y }}>
            <Avatar user={conn.with} size={38} ring />
            <span className="mt-1 flex max-w-full items-center gap-0.5 truncate text-[11px] text-muted">{conn.with.nickname.split(' ')[0]}<VerifiedMark user={conn.with} className="size-3" /></span>
          </button>
        ))}
      </div>
    </Card>
  )
}

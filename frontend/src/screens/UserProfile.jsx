import { useState } from 'react'
import { MessageCircle, UserPlus, Clock3, Flag, Ban, CalendarPlus, Award, Hourglass, Languages, Monitor } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { weekdayName } from '../lib/format'
import { AvailabilityDot, Avatar, Badge, Button, Chip, List, Loading, Row, ScreenHeader, Section, Stat, VerifiedMark } from '../components/ui'
import { MatchScore } from '../components/items'
import { MeetingPlanner } from './Meetings'

export default function UserProfile({ id }) {
  const { t, lang, me, subjects, fail, toast, ask } = useApp()
  const nav = useNav()
  const { data: p, loading, reload } = useApi(`/api/users/${id}`)
  const [planner, setPlanner] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading && !p) return <><ScreenHeader onBack={nav.pop} backLabel={t('back')} title="" /><Loading /></>
  if (!p) return <ScreenHeader onBack={nav.pop} backLabel={t('back')} title={t('err_not_found')} />

  const u = p.user
  const isMentor = u.role === 'mentor'
  const canRequest = !p.isMe && !p.connection && ((isMentor && me.role === 'student') || (!isMentor && u.role === 'student' && me.role === 'mentor'))

  const request = async () => {
    setBusy(true)
    try {
      const conn = await api.post('/api/connections', { mentorId: u.id })
      toast(conn.status === 'active' ? t('n_connection_accepted') : t('requestSent'))
      reload()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const report = async () => {
    const reason = await ask({ title: t('report'), input: t('reportReason'), multiline: true, confirm: t('send') })
    if (!reason) return
    try { await api.post('/api/reports', { targetType: 'user', targetId: u.id, reason }); toast(t('reportSent')) } catch (e) { fail(e) }
  }
  const toggleBlock = async () => {
    if (p.blockedByMe) {
      try { await api.del(`/api/users/${u.id}/block`); reload() } catch (e) { fail(e) }
      return
    }
    if (!(await ask({ title: t('block'), text: t('blockConfirm', { name: u.nickname }), danger: true, confirm: t('block') }))) return
    try { await api.post(`/api/users/${u.id}/block`); toast(t('blocked')); reload() } catch (e) { fail(e) }
  }

  return (
    <>
      <ScreenHeader onBack={nav.pop} backLabel={t('back')} title={u.nickname} />
      <div className="scroll-area flex-1 px-4 pb-8">
        <div className="flex items-start gap-4 pt-4">
          <Avatar user={u} size={76} />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="flex items-center gap-1.5 text-[21px] font-semibold leading-7 tracking-tight">
              <span className="truncate">{u.nickname}</span><VerifiedMark user={u} className="size-[18px]" />
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={isMentor ? 'accent' : 'neutral'}>{t(u.role)}</Badge>
              {u.class && <Badge>{u.class}</Badge>}
              {u.verified && <Badge tone="ok">{t('verified')}</Badge>}
            </div>
            {isMentor && (
              <div className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                <AvailabilityDot value={u.availability} />{t('avail_' + u.availability)}
                {p.inOffice && <Badge tone="ok" icon={Clock3} className="ml-1">{t('inOffice')}</Badge>}
              </div>
            )}
          </div>
          {!p.isMe && <MatchScore value={p.match} />}
        </div>
        {p.bio && <p className="mt-4 text-[14px] leading-6 text-muted">{p.bio}</p>}

        {!p.isMe && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {p.connection?.status === 'active' ? (
              <>
                <Button variant="primary" icon={MessageCircle} onClick={() => nav.push('chat', { id: p.connection.id })}>{t('message')}</Button>
                <Button icon={CalendarPlus} onClick={() => setPlanner(true)}>{t('bookSlot')}</Button>
              </>
            ) : p.connection?.status === 'pending' ? (
              <Button full disabled icon={Hourglass} className="col-span-2">{t('requestSent')}</Button>
            ) : canRequest ? (
              <Button variant="primary" icon={UserPlus} loading={busy} className="col-span-2" onClick={request}>
                {isMentor ? t('requestMentor') : t('addStudent')}
              </Button>
            ) : p.connection?.status === 'archived' ? (
              <Button className="col-span-2" icon={MessageCircle} onClick={() => nav.push('chat', { id: p.connection.id })}>{t('archived')}</Button>
            ) : null}
          </div>
        )}

        {isMentor && (
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label={t('helpedStudents')} value={p.stats.helped} />
            <Stat label={t('meetingsDone')} value={p.stats.meetings} />
            <Stat label="Buddy Coins" value={p.coins ?? 0} />
          </div>
        )}

        {isMentor && p.helpSubjects.length > 0 && (
          <Section title={t('helpsWith')}>
            <div className="flex flex-wrap gap-1.5">
              {p.helpSubjects.map((sid) => {
                const s = subjects.find((x) => x.id === sid)
                return s && (
                  <span key={sid} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px]">
                    <span className="size-2 rounded-full" style={{ background: s.color }} />{pick(s, 'name', lang)}
                  </span>
                )
              })}
            </div>
          </Section>
        )}

        {isMentor && (
          <Section>
            <List>
              <Row chevron={false} left={<Languages className="size-4 text-muted" />} title={t('languages')} right={<span className="text-[13px] text-muted">{p.languages.join(' · ') || '—'}</span>} />
              <Row chevron={false} left={<Monitor className="size-4 text-muted" />} title={t('helpFormat')}
                right={<span className="max-w-[55%] truncate text-right text-[13px] text-muted">{p.helpFormats.map((f) => t('fmt_' + f)).join(', ') || '—'}</span>} />
            </List>
          </Section>
        )}

        {isMentor && p.officeHours.length > 0 && (
          <Section title={t('officeHours')}>
            <List>
              {p.officeHours.map((h) => (
                <Row key={h.id} chevron={false}
                  left={<span className="w-8 text-[13px] capitalize text-muted">{weekdayName(h.dayOfWeek, lang)}</span>}
                  title={<span className="font-mono text-[14px] tabular">{h.start} – {h.end}</span>}
                  subtitle={[t('mode_' + h.mode), h.note].filter(Boolean).join(' · ')} />
              ))}
            </List>
          </Section>
        )}

        {p.achievements.length > 0 && (
          <Section title={t('badges')}>
            <div className="flex flex-wrap gap-1.5">
              {p.achievements.map((c) => <Badge key={c} tone="accent" icon={Award}>{t('ach_' + c)}</Badge>)}
              <Badge>{t('title_' + p.stats.title)}</Badge>
            </div>
          </Section>
        )}

        {p.tags.length > 0 && (
          <Section title={t('tags')}>
            <div className="flex flex-wrap gap-1.5">{p.tags.map((x) => <Chip key={x.id}>{x.name}</Chip>)}</div>
          </Section>
        )}

        {!p.isMe && (
          <Section>
            <List>
              <Row left={<Flag className="size-4 text-warn" />} title={t('report')} onClick={report} />
              <Row left={<Ban className="size-4 text-danger" />} title={<span className="text-danger">{p.blockedByMe ? t('unblock') : t('block')}</span>} onClick={toggleBlock} />
            </List>
          </Section>
        )}
      </div>
      {p.connection?.status === 'active' && (
        <MeetingPlanner open={planner} onClose={() => setPlanner(false)} connectionId={p.connection.id}
          mentorId={isMentor ? u.id : me.id} onCreated={() => setPlanner(false)} />
      )}
    </>
  )
}


import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  SendHorizontal, CalendarPlus, MoreHorizontal, LifeBuoy, CalendarClock, CalendarCheck, Link2, Archive, UserRound, Flag, Ban,
  MessagesSquare, Users, Heart,
} from 'lucide-react'
import { useApp, useApi, usePolling } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtDay, fmtDayTime, fmtRelative, fmtTime, fmtDate, parseJson } from '../lib/format'
import { Avatar, AvailabilityDot, Badge, Card, Empty, IconButton, List, Loading, Row, ScreenHeader, Section, Sheet, Stat, cx } from '../components/ui'
import { PersonRow } from '../components/items'
import { MeetingPlanner } from './Meetings'

export function Chats() {
  const { t, lang } = useApp()
  const nav = useNav()
  const { data, loading } = useApi('/api/connections')
  const groups = useApi('/api/groups')
  const list = data ?? []
  const sections = [
    ['activeConnections', list.filter((c) => c.status === 'active')],
    ['pending', list.filter((c) => c.status === 'pending')],
    ['archived', list.filter((c) => c.status === 'archived')],
  ]
  const myGroups = (groups.data ?? []).filter((g) => g.joined)

  const preview = (c) => {
    if (!c.lastMessage) return c.status === 'pending' ? t('pending') : ''
    if (c.lastMessage.systemType) return t('sys_' + c.lastMessage.systemType, { name: '' })
    return (c.lastMessage.mine ? `${t('you')}: ` : '') + c.lastMessage.text
  }

  return (
    <>
      <ScreenHeader title={t('chats')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8">
        {loading && !data ? <Loading /> : list.length === 0 && myGroups.length === 0 ? (
          <Empty icon={MessagesSquare} text={t('noConnections')} className="mt-10" />
        ) : (
          <>
            {sections.map(([key, items]) => items.length > 0 && (
              <Section key={key} title={t(key)}>
                <List>
                  {items.map((c) => (
                    <PersonRow key={c.id} person={c.with} subtitle={preview(c) || t(c.myRole === 'peer' ? 'peerLabel' : c.myRole === 'mentor' ? 'student' : 'mentor')}
                      right={c.lastMessage ? <span className="shrink-0 text-[11.5px] text-faint">{fmtRelative(c.lastMessage.createdAt, lang, t)}</span> : null}
                      onClick={() => (c.status === 'pending' ? nav.push('user', { id: c.with.id }) : nav.push('chat', { id: c.id }))} />
                  ))}
                </List>
              </Section>
            ))}
            {myGroups.length > 0 && (
              <Section title={t('myGroups')}>
                <List>
                  {myGroups.map((g) => (
                    <Row key={g.id} onClick={() => nav.push('group', { id: g.id, tab: 'chat' })}
                      left={<span className="grid size-[42px] place-items-center rounded-full bg-raised text-muted"><Users className="size-[18px]" /></span>}
                      title={g.name} subtitle={t('membersN', { n: g.members })} />
                  ))}
                </List>
              </Section>
            )}
          </>
        )}
      </div>
    </>
  )
}

function SystemMessage({ m, onMeeting }) {
  const { t, lang, subjectById, topicName } = useApp()
  const d = parseJson(m.data)
  if (m.systemType === 'sos') {
    const s = subjectById(d.subjectId)
    return (
      <Card className="mx-auto w-[88%] border-danger/25 p-3">
        <div className="flex items-center gap-1.5 text-[12px] text-danger"><LifeBuoy className="size-3.5" />{t('sys_sos')} · {t('sos_' + (d.kind || 'question'))}</div>
        <div className="mt-1 text-[14px]">{pick(s, 'name', lang)} · {d.topicId ? topicName(d.subjectId, d.topicId) : d.topic}</div>
        {d.description && <div className="mt-0.5 text-[13px] text-muted">{d.description}</div>}
      </Card>
    )
  }
  if (m.systemType === 'meeting') {
    return (
      <button type="button" onClick={() => onMeeting(d.id)} className="mx-auto flex w-[88%] items-center gap-3 rounded-2xl border border-line bg-card p-3 text-left hover:border-line-strong">
        <CalendarClock className="size-5 text-accent" />
        <span><span className="block text-[13px] text-muted">{t('sys_meeting')}</span><span className="text-[14px]">{fmtDayTime(d.at, lang, t)}</span></span>
      </button>
    )
  }
  const icons = { meeting_done: CalendarCheck, connected: Link2, archived: Archive, matched: Heart }
  const Icon = icons[m.systemType] ?? Link2
  return (
    <div className="mx-auto flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-[12px] text-muted">
      <Icon className="size-3.5" />{t('sys_' + m.systemType, { name: d.name })}
    </div>
  )
}

export function Chat({ id }) {
  const { t, lang, me, fail, toast, ask } = useApp()
  const nav = useNav()
  const conn = useApi(`/api/connections/${id}`)
  const [messages, setMessages] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [menu, setMenu] = useState(false)
  const [planner, setPlanner] = useState(false)
  const endRef = useRef(null)
  const lastId = useRef(0)

  const fetchNew = useCallback(async () => {
    try {
      const list = await api.get(`/api/connections/${id}/messages?after=${lastId.current}`)
      if (list.length) {
        lastId.current = list[list.length - 1].id
        setMessages((prev) => [...prev, ...list.filter((m) => !prev.some((p) => p.id === m.id))])
      }
      setLoaded(true)
    } catch { setLoaded(true) }
  }, [id])

  useEffect(() => { fetchNew() }, [fetchNew])
  usePolling(fetchNew, 3000)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  // Позначаємо сповіщення про цей чат прочитаними
  useEffect(() => {
    api.get('/api/notifications?take=30').then((res) => {
      res.items.filter((n) => !n.isRead && n.link === `/chat/${id}`).forEach((n) => api.post(`/api/notifications/${n.id}/read`).catch(() => {}))
    }).catch(() => {})
  }, [id])

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      const msg = await api.post(`/api/connections/${id}/messages`, { text: body })
      setText('')
      lastId.current = Math.max(lastId.current, msg.id)
      setMessages((prev) => [...prev, msg])
    } catch (err) { fail(err) } finally { setSending(false) }
  }

  const c = conn.data
  const other = c?.with
  const archived = c?.status === 'archived'

  const archive = async () => {
    setMenu(false)
    if (!(await ask({ title: t('archive'), text: t('archiveConfirm'), confirm: t('archive') }))) return
    try { await api.post(`/api/connections/${id}/archive`); conn.reload(); fetchNew() } catch (err) { fail(err) }
  }
  const report = async () => {
    setMenu(false)
    const reason = await ask({ title: t('report'), input: t('reportReason'), multiline: true, confirm: t('send') })
    if (!reason) return
    try { await api.post('/api/reports', { targetType: 'user', targetId: other.id, reason }); toast(t('reportSent')) } catch (err) { fail(err) }
  }
  const block = async () => {
    setMenu(false)
    if (!(await ask({ title: t('block'), text: t('blockConfirm', { name: other.nickname }), danger: true, confirm: t('block') }))) return
    try { await api.post(`/api/users/${other.id}/block`); toast(t('blocked')); nav.pop() } catch (err) { fail(err) }
  }

  const dayKey = (m) => new Date(m.createdAt).toDateString()
  return (
    <>
      <ScreenHeader onBack={nav.pop} backLabel={t('back')}
        title={other ? (
          <button type="button" onClick={() => nav.push('user', { id: other.id })} className="flex items-center gap-2.5 text-left">
            <Avatar user={other} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-5">{other.nickname}</span>
              <span className="flex items-center gap-1 text-[12px] font-normal text-muted">
                {other.role === 'mentor' && <AvailabilityDot value={other.availability} />}
                {other.role === 'mentor' ? t('avail_' + other.availability) : t(other.role)}
              </span>
            </span>
          </button>
        ) : ''}
        right={c && (
          <>
            {!archived && c.myRole !== 'peer' && <IconButton icon={CalendarPlus} label={t('scheduleMeeting')} onClick={() => setPlanner(true)} />}
            <IconButton icon={MoreHorizontal} label={t('more')} onClick={() => setMenu(true)} />
          </>
        )} />

      <div className="scroll-area flex-1 px-3 py-3">
        {!loaded ? <Loading /> : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m, i) => {
              const sep = i === 0 || dayKey(messages[i - 1]) !== dayKey(m)
              return (
                <Fragment key={m.id}>
                  {sep && <div className="my-2 text-center text-[11.5px] text-faint">{fmtDay(m.createdAt, lang, t)}</div>}
                  {m.systemType ? (
                    <div className="my-1"><SystemMessage m={m} onMeeting={(mid) => nav.push('meeting', { id: mid })} /></div>
                  ) : (
                    <div className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
                      <div className={cx('max-w-[78%] rounded-2xl px-3 py-2 text-[14.5px] leading-5',
                        m.mine ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-raised text-ink')}>
                        <span className="whitespace-pre-wrap break-words">{m.text}</span>
                        <span className={cx('ml-2 inline-block translate-y-0.5 text-[10.5px] tabular', m.mine ? 'text-accent-ink/60' : 'text-faint')}>{fmtTime(m.createdAt, lang)}</span>
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {archived ? (
        <div className="border-t border-line px-4 py-3 text-center text-[13px] text-muted pb-safe">{t('chatArchived')}</div>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface px-3 py-2.5 pb-safe">
          <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeMessage')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            className="field max-h-28 min-h-10 resize-none rounded-[20px] py-2.5" />
          <button type="submit" disabled={!text.trim() || sending} aria-label={t('send')}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-40">
            <SendHorizontal className="size-[18px]" />
          </button>
        </form>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={other?.nickname}>
        {c && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <Stat label={t('messagesCount')} value={c.stats.messages} />
              <Stat label={t('meetingsDone')} value={c.stats.meetings} />
              <Stat label={t('sosCount')} value={c.stats.sos} />
            </div>
            <p className="mb-3 text-[12.5px] text-faint">{t('since', { date: fmtDate(c.acceptedAt ?? c.createdAt, lang, { day: 'numeric', month: 'long', year: 'numeric' }) })}{archived && c.archivedAt ? ` · ${t('archived')} ${fmtDate(c.archivedAt, lang)}` : ''}</p>
            <List>
              <Row left={<UserRound className="size-4 text-muted" />} title={t('viewProfile')} onClick={() => { setMenu(false); nav.push('user', { id: other.id }) }} />
              {c.meetings.length > 0 && <Row left={<CalendarClock className="size-4 text-muted" />} title={t('meetings')} right={<Badge>{c.meetings.length}</Badge>} onClick={() => { setMenu(false); nav.push('meetings') }} />}
              {!archived && <Row left={<Archive className="size-4 text-muted" />} title={t('archive')} onClick={archive} />}
              <Row left={<Flag className="size-4 text-warn" />} title={t('report')} onClick={report} />
              <Row left={<Ban className="size-4 text-danger" />} title={<span className="text-danger">{t('block')}</span>} onClick={block} />
            </List>
          </>
        )}
      </Sheet>

      {c && other && c.myRole !== 'peer' && (
        <MeetingPlanner open={planner} onClose={() => setPlanner(false)} connectionId={c.id}
          mentorId={c.myRole === 'mentor' ? me.id : other.id}
          onCreated={() => { setPlanner(false); fetchNew() }} />
      )}
    </>
  )
}

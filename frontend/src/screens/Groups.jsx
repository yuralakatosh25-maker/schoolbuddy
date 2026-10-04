import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Users, SendHorizontal, LogOut, CalendarPlus, Search } from 'lucide-react'
import { useApp, useApi, usePolling } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtDay, fmtDayTime, fmtTime, parseJson } from '../lib/format'
import { Avatar, Badge, Button, Empty, Field, IconButton, List, Loading, Row, ScreenHeader, Section, Segmented, Sheet, SubjectDot, cx } from '../components/ui'
import { PersonRow } from '../components/items'
import { EventForm } from './Events'

function GroupIcon({ subject }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: subject ? subject.color + '24' : 'var(--raised)' }}>
      {subject ? <SubjectDot color={subject.color} className="size-2.5" /> : <Users className="size-4 text-muted" />}
    </span>
  )
}

export function Groups() {
  const { t, lang, subjects, subjectById, fail, toast } = useApp()
  const nav = useNav()
  const [q, setQ] = useState('')
  const { data, loading, reload } = useApi('/api/groups')
  const [form, setForm] = useState(null)

  const list = (data ?? []).filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || (g.topic ?? '').toLowerCase().includes(q.toLowerCase()))
  const mine = list.filter((g) => g.joined)
  const others = list.filter((g) => !g.joined)

  const join = async (g) => {
    try { await api.post(`/api/groups/${g.id}/join`); toast(t('joined')); reload() } catch (e) { fail(e) }
  }
  const create = async () => {
    try {
      const g = await api.post('/api/groups', { ...form, subjectId: form.subjectId || null })
      setForm(null)
      nav.push('group', { id: g.id })
      reload()
    } catch (e) { fail(e) }
  }

  const item = (g) => (
    <Row key={g.id} onClick={() => nav.push('group', { id: g.id })}
      left={<GroupIcon subject={subjectById(g.subjectId)} />}
      title={g.name}
      subtitle={[g.subjectId && pick(subjectById(g.subjectId), 'name', lang), g.topic, t('membersN', { n: g.members })].filter(Boolean).join(' · ')}
      right={g.joined ? null : <Button size="sm" onClick={(e) => { e.stopPropagation(); join(g) }}>{t('join')}</Button>}
      chevron={g.joined} />
  )

  return (
    <>
      <ScreenHeader title={t('groups')} onBack={nav.pop} backLabel={t('back')}
        right={<IconButton icon={Plus} label={t('groupNew')} onClick={() => setForm({ name: '', subjectId: '', topic: '', description: '' })} />} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="field pl-9" />
        </div>
        {loading && !data ? <Loading /> : (
          <>
            {mine.length > 0 && <Section title={t('myGroups')}><List>{mine.map(item)}</List></Section>}
            {others.length > 0 && <Section title={t('otherGroups')}><List>{others.map(item)}</List></Section>}
            {list.length === 0 && <Empty icon={Users} text={t('noData')} />}
          </>
        )}
      </div>
      <Sheet open={!!form} onClose={() => setForm(null)} title={t('groupNew')}
        footer={<Button variant="primary" full onClick={create} disabled={!form?.name?.trim() || form.name.trim().length < 3}>{t('create')}</Button>}>
        {form && (
          <div className="space-y-3">
            <Field label={t('groupName')}><input autoFocus className="field" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Python Beginners" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('subject')}>
                <select className="field" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
                </select>
              </Field>
              <Field label={t('topic')}><input className="field" maxLength={60} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
            </div>
            <Field label={t('groupDesc')}><textarea rows={3} className="field resize-none" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </>
  )
}

export function Group({ id, tab: initialTab }) {
  const { t, lang, subjectById, fail, toast, ask } = useApp()
  const nav = useNav()
  const { data: g, loading, reload } = useApi(`/api/groups/${id}`)
  const [tab, setTab] = useState(initialTab ?? 'chat')
  const [eventForm, setEventForm] = useState(false)

  const join = async () => { try { await api.post(`/api/groups/${id}/join`); toast(t('joined')); reload() } catch (e) { fail(e) } }
  const leave = async () => {
    if (!(await ask({ title: t('leave'), text: g.name, confirm: t('leave') }))) return
    try { await api.post(`/api/groups/${id}/leave`); nav.pop() } catch (e) { fail(e) }
  }

  const subject = g ? subjectById(g.subjectId) : null
  return (
    <>
      <ScreenHeader onBack={nav.pop} backLabel={t('back')} title={g?.name ?? ''}
        subtitle={g ? [subject && pick(subject, 'name', lang), g.topic, t('membersN', { n: g.members.length })].filter(Boolean).join(' · ') : ''}
        right={g?.joined && <IconButton icon={LogOut} label={t('leave')} onClick={leave} />} />
      {loading && !g ? <Loading /> : g && (
        <>
          <div className="border-b border-line px-4 py-3">
            {g.description && <p className="mb-3 text-[13.5px] leading-5 text-muted">{g.description}</p>}
            {!g.joined ? <Button variant="primary" full onClick={join}>{t('join')}</Button> : (
              <Segmented value={tab} onChange={setTab} options={[
                { value: 'chat', label: t('groupChat') },
                { value: 'members', label: t('members') },
                { value: 'events', label: `${t('events')}${g.events.length ? ' · ' + g.events.length : ''}` },
              ]} />
            )}
          </div>
          {g.joined && tab === 'chat' && <GroupChat id={id} />}
          {(!g.joined || tab === 'members') && (
            <div className="scroll-area flex-1 px-4 pb-8 pt-3">
              <List>
                {g.members.map((m) => (
                  <PersonRow key={m.user.id} person={m.user} onClick={() => nav.push('user', { id: m.user.id })}
                    right={m.role === 'owner' ? <Badge tone="accent">{t('owner')}</Badge> : null} />
                ))}
              </List>
              {!g.joined && <p className="mt-3 text-center text-[13px] text-faint">{t('joinToChat')}</p>}
            </div>
          )}
          {g.joined && tab === 'events' && (
            <div className="scroll-area flex-1 px-4 pb-8 pt-3">
              <Button full icon={CalendarPlus} onClick={() => setEventForm(true)}>{t('eventNew')}</Button>
              <List className="mt-3">
                {g.events.length === 0 ? <Empty text={t('noData')} /> : g.events.map((e) => (
                  <Row key={e.id} onClick={() => nav.push('event', { id: e.id })} title={e.title}
                    subtitle={`${fmtDayTime(e.startsAt, lang, t)} · ${e.location}`} right={<Badge>{t('ev_' + e.kind)}</Badge>} />
                ))}
              </List>
            </div>
          )}
          <EventForm open={eventForm} onClose={() => setEventForm(false)} groupId={id} onCreated={() => { setEventForm(false); reload() }} />
        </>
      )}
    </>
  )
}

function GroupChat({ id }) {
  const { t, lang, fail } = useApp()
  const nav = useNav()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const lastId = useRef(0)
  const endRef = useRef(null)

  const fetchNew = useCallback(async () => {
    try {
      const list = await api.get(`/api/groups/${id}/messages?after=${lastId.current}`)
      if (list.length) {
        lastId.current = list[list.length - 1].id
        setMessages((prev) => [...prev, ...list.filter((m) => !prev.some((p) => p.id === m.id))])
      }
    } catch { /* ignore */ } finally { setLoaded(true) }
  }, [id])
  useEffect(() => { fetchNew() }, [fetchNew])
  usePolling(fetchNew, 3500)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  const send = async (e) => {
    e?.preventDefault()
    if (!text.trim()) return
    try {
      const msg = await api.post(`/api/groups/${id}/messages`, { text })
      setText('')
      lastId.current = Math.max(lastId.current, msg.id)
      setMessages((prev) => [...prev, msg])
    } catch (err) { fail(err) }
  }

  const dayKey = (m) => new Date(m.createdAt).toDateString()
  return (
    <>
      <div className="scroll-area flex-1 px-3 py-3">
        {!loaded ? <Loading /> : (
          <div className="flex flex-col gap-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const sep = !prev || dayKey(prev) !== dayKey(m)
              const showName = !m.mine && (sep || prev.senderId !== m.senderId || !!prev.systemType)
              const d = parseJson(m.data)
              return (
                <Fragment key={m.id}>
                  {sep && <div className="my-2 text-center text-[11.5px] text-faint">{fmtDay(m.createdAt, lang, t)}</div>}
                  {m.systemType ? (
                    <div className="my-1 text-center text-[12px] text-faint">{t('sys_' + m.systemType, { name: d.name })}</div>
                  ) : (
                    <div className={cx('flex items-end gap-2', m.mine ? 'justify-end' : 'justify-start', showName && 'mt-2')}>
                      {!m.mine && (showName
                        ? <button type="button" onClick={() => nav.push('user', { id: m.senderId })}><Avatar user={m.sender} size={26} /></button>
                        : <span className="w-[26px]" />)}
                      <div className={cx('max-w-[75%] rounded-2xl px-3 py-2 text-[14.5px] leading-5', m.mine ? 'rounded-br-md bg-accent text-accent-ink' : 'rounded-bl-md bg-raised')}>
                        {showName && <div className="mb-0.5 text-[12px] text-muted">{m.sender?.nickname}</div>}
                        <span className="whitespace-pre-wrap break-words">{m.text}</span>
                        <span className={cx('ml-2 inline-block text-[10.5px] tabular', m.mine ? 'text-accent-ink/60' : 'text-faint')}>{fmtTime(m.createdAt, lang)}</span>
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
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line px-3 py-2.5 pb-safe">
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('typeMessage')}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          className="field max-h-28 min-h-10 resize-none rounded-[20px] py-2.5" />
        <button type="submit" disabled={!text.trim()} aria-label={t('send')} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
          <SendHorizontal className="size-[18px]" />
        </button>
      </form>
    </>
  )
}

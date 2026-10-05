import { useState } from 'react'
import { Check, Ban, RotateCcw, EyeOff, Eye, Megaphone, RefreshCw, Mail, Store, ShieldAlert, Search } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtRelative, isoDate, parseLocalDate, fmtWeekday, toLocalInput } from '../lib/format'
import { Badge, Button, Card, Empty, Field, List, Loading, PageTitle, Row, Section, Segmented, Stat, cx } from '../components/ui'
import { PersonRow } from '../components/items'

const CLASSES = ['1.IT', '2.IT', '3.IT', '4.IT']

export default function Admin() {
  const { t } = useApp()
  const [tab, setTab] = useState('overview')
  return (
    <div className="px-4 pb-8">
      <PageTitle>{t('adminPanel')}</PageTitle>
      <Segmented className="mt-4" value={tab} onChange={setTab} options={[
        { value: 'overview', label: t('overview') },
        { value: 'users', label: t('users') },
        { value: 'moderation', label: t('moderation') },
        { value: 'school', label: t('schedule') },
        { value: 'partners', label: t('partnersTab') },
      ]} />
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <UsersTab />}
      {tab === 'moderation' && <Moderation />}
      {tab === 'school' && <SchoolTab />}
      {tab === 'partners' && <PartnersTab />}
    </div>
  )
}

function PartnersTab() {
  const { t, lang, fail, toast } = useApp()
  const { data, loading, reload } = useApi('/api/admin/partners')
  const act = async (id, action) => {
    try { await api.post(`/api/admin/partners/${id}/${action}`); toast(t('saved')); reload() } catch (e) { fail(e) }
  }
  return (
    <div className="mt-4">
      {loading && !data ? <Loading /> : !data?.length ? <Empty text={t('noData')} /> : (
        <List>
          {data.map((p) => (
            <Row key={p.id} chevron={false} left={<Store className="size-4 text-muted" />}
              title={<span className="flex items-center gap-2">{p.name}{p.status === 'pending' && <Badge tone="warn">{t('pending')}</Badge>}</span>}
              subtitle={`${t('kind_' + p.kind)} · ${p.address}${p.contactEmail ? ` · ${p.contactEmail}` : ''} · ${p.visits} ${t('bizVisits').toLowerCase()}`}
              right={p.status === 'pending' ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="primary" icon={Check} onClick={() => act(p.id, 'approve')}>{t('approve')}</Button>
                  <Button size="sm" variant="ghost" icon={Ban} onClick={() => act(p.id, 'reject')} aria-label={t('reject')} />
                </div>
              ) : <span className="text-[11.5px] text-faint">{fmtRelative(p.createdAt, lang, t)}</span>} />
          ))}
        </List>
      )}
    </div>
  )
}

function Overview() {
  const { t, lang } = useApp()
  const { data: s, loading } = useApi('/api/admin/stats')
  if (loading && !s) return <Loading />
  if (!s) return null
  const max = Math.max(1, ...s.daily.map((d) => Math.max(d.messages, d.sos)))
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label={t('statUsers')} value={s.users.total} sub={`${s.users.students} · ${t('filterStudents').toLowerCase()}`} />
        <Stat label={t('statMentors')} value={s.users.mentors} />
        <Stat label={t('statPending')} value={s.users.pending} />
        <Stat label={t('statActiveToday')} value={s.users.activeToday} />
        <Stat label={t('statSosActive')} value={s.sos.active} sub={`${s.sos.accepted} · ${t('status_accepted').toLowerCase()}`} />
        <Stat label={t('statMeetings')} value={s.meetings.completed} sub={`${s.meetings.scheduled} · ${t('upcoming').toLowerCase()}`} />
        <Stat label={t('statConnections')} value={s.connections} />
        <Stat label={t('statReports')} value={s.reportsOpen} />
      </div>
      <Stat className="mt-2" label={t('statCoins')} value={s.coinsIssued} />

      <Section title={t('activity7')}>
        <Card className="p-4">
          <div className="flex h-36 items-end gap-2">
            {s.daily.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 max-w-3 rounded-t bg-accent" style={{ height: `${(d.messages / max) * 100}%`, minHeight: d.messages ? 3 : 0 }} title={`${d.messages}`} />
                  <div className="w-1/2 max-w-3 rounded-t bg-danger" style={{ height: `${(d.sos / max) * 100}%`, minHeight: d.sos ? 3 : 0 }} title={`${d.sos}`} />
                </div>
                <span className="text-[10.5px] capitalize text-faint">{fmtWeekday(parseLocalDate(d.date), lang)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-accent" />{t('legendMessages')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-danger" />{t('legendSos')}</span>
          </div>
        </Card>
      </Section>
    </>
  )
}

function UsersTab() {
  const { t, lang, fail, toast } = useApp()
  const nav = useNav()
  const [filter, setFilter] = useState('pending')
  const [q, setQ] = useState('')
  const { data, loading, reload } = useApi(`/api/admin/users?filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
  const act = async (id, action) => {
    try { await api.post(`/api/admin/users/${id}/${action}`); toast(t('saved')); reload() } catch (e) { fail(e) }
  }
  return (
    <>
      <div className="mt-4 flex gap-1.5">
        {['pending', 'blocked', 'all'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={cx('h-8 rounded-full border px-3 text-[13px]', filter === f ? 'border-accent/40 bg-accent/12 text-accent' : 'border-line text-muted')}>
            {f === 'pending' ? t('filterPending') : f === 'blocked' ? t('filterBlocked') : t('all')}
          </button>
        ))}
      </div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input className="field pl-9" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mt-3">
        {loading && !data ? <Loading /> : !data?.length ? <Empty text={t('noData')} /> : (
          <List>
            {data.map((x) => (
              <PersonRow key={x.user.id} person={x.user} onClick={() => nav.push('user', { id: x.user.id })}
                subtitle={`${x.email} · ${fmtRelative(x.createdAt, lang, t)}`}
                right={
                  <div className="flex gap-1">
                    {!x.user.verified && x.user.role !== 'admin' && <Button size="sm" variant="primary" icon={Check} onClick={(e) => { e.stopPropagation(); act(x.user.id, 'approve') }}>{t('approve')}</Button>}
                    {x.isBlocked
                      ? <Button size="sm" icon={RotateCcw} onClick={(e) => { e.stopPropagation(); act(x.user.id, 'unblock') }} aria-label={t('unblock')} />
                      : x.user.role !== 'admin' && <Button size="sm" variant="ghost" icon={Ban} onClick={(e) => { e.stopPropagation(); act(x.user.id, 'block') }} aria-label={t('block')} />}
                  </div>
                } />
            ))}
          </List>
        )}
      </div>
    </>
  )
}

function Moderation() {
  const { t, lang, fail } = useApp()
  const nav = useNav()
  const reports = useApi('/api/admin/reports')
  const forum = useApi('/api/admin/forum')
  const resolve = async (id, verb) => {
    try { await api.post(`/api/admin/reports/${id}/${verb}`); reports.reload(); forum.reload() } catch (e) { fail(e) }
  }
  const hide = async (p) => {
    try { await api.post(`/api/admin/forum/${p.id}/hide?hidden=${!p.isHidden}`); forum.reload() } catch (e) { fail(e) }
  }
  const targetText = (r) => {
    if (!r.target) return `#${r.targetId}`
    if (r.targetType === 'user') return r.target.nickname
    if (r.targetType === 'post') return r.target.title
    if (r.targetType === 'message') return r.target.text
    return `#${r.targetId}`
  }
  return (
    <>
      <Section title={t('reports')}>
        {reports.loading && !reports.data ? <Loading /> : !reports.data?.length ? <Card><Empty icon={ShieldAlert} text={t('noReports')} /></Card> : (
          <div className="space-y-2">
            {reports.data.map((r) => (
              <Card key={r.id} className="p-3.5">
                <div className="flex items-center gap-2">
                  <Badge tone="warn">{t('target_' + r.targetType)}</Badge>
                  <span className="text-[12px] text-faint">{fmtRelative(r.createdAt, lang, t)}</span>
                </div>
                <button type="button" className="mt-1.5 block text-left text-[14.5px] leading-5 hover:underline"
                  onClick={() => (r.targetType === 'user' ? nav.push('user', { id: r.targetId }) : r.targetType === 'post' ? nav.push('post', { id: r.targetId }) : null)}>
                  {targetText(r)}
                </button>
                <p className="mt-1 text-[13px] text-muted">“{r.reason}”</p>
                {r.reporter && <p className="mt-1 text-[12px] text-faint">{t('reportedBy', { name: r.reporter.nickname })}</p>}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="danger" onClick={() => resolve(r.id, 'resolve')}>{t('resolve')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve(r.id, 'dismiss')}>{t('dismiss')}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
      <Section title={t('forum')}>
        {forum.loading && !forum.data ? <Loading /> : (
          <List>
            {(forum.data ?? []).map((p) => (
              <Row key={p.id} chevron={false} title={<span className={cx(p.isHidden && 'text-muted line-through')}>{p.title}</span>}
                subtitle={[p.author, t('fc_' + p.category), fmtRelative(p.createdAt, lang, t)].join(' · ')}
                right={
                  <div className="flex items-center gap-1.5">
                    {p.reports > 0 && <Badge tone="warn">{t('reportsN', { n: p.reports })}</Badge>}
                    <Button size="sm" variant="ghost" icon={p.isHidden ? Eye : EyeOff} onClick={() => hide(p)}>{p.isHidden ? t('show') : t('hide')}</Button>
                  </div>
                } />
            ))}
          </List>
        )}
      </Section>
    </>
  )
}

function SchoolTab() {
  const { t, lang, subjects, subjectById, fail, toast, ask } = useApp()
  const nav = useNav()
  const outbox = useApi('/api/admin/outbox')
  const [change, setChange] = useState({ class: '2.IT', date: isoDate(), lessonId: '', kind: 'cancelled', newRoom: '', newTeacher: '', note: '' })
  const lessons = useApi(`/api/admin/lessons?class=${change.class}&date=${change.date}`)
  const [exam, setExam] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    d.setHours(10, 0, 0, 0)
    return { class: '2.IT', subjectId: '', topicId: '', date: toLocalInput(d), kind: 'test', note: '' }
  })

  const addChange = async () => {
    try {
      await api.post('/api/schedule/changes', { ...change, lessonId: Number(change.lessonId), newRoom: change.newRoom || null, newTeacher: change.newTeacher || null })
      toast(t('saved'))
      setChange({ ...change, lessonId: '', newRoom: '', newTeacher: '', note: '' })
    } catch (e) { fail(e) }
  }
  const addExam = async () => {
    try {
      await api.post('/api/schedule/exams', { ...exam, subjectId: Number(exam.subjectId), topicId: exam.topicId ? Number(exam.topicId) : null, date: new Date(exam.date).toISOString() })
      toast(t('saved'))
    } catch (e) { fail(e) }
  }
  const resetDemo = async () => {
    if (!(await ask({ title: t('demoReset'), danger: true, confirm: t('demoReset') }))) return
    try { await api.post('/api/demo/reset'); toast(t('demoResetDone')) } catch (e) { fail(e) }
  }
  const examSubject = subjectById(Number(exam.subjectId))

  return (
    <>
      <Section>
        <List>
          <Row left={<Megaphone className="size-4 text-muted" />} title={t('newAnnouncement')} onClick={() => nav.push('announcements')} />
        </List>
      </Section>

      <Section title={t('addScheduleChange')}>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('classLabel')}>
              <select className="field" value={change.class} onChange={(e) => setChange({ ...change, class: e.target.value, lessonId: '' })}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label={t('date')}><input type="date" className="field" value={change.date} onChange={(e) => setChange({ ...change, date: e.target.value, lessonId: '' })} /></Field>
          </div>
          <Field label={t('lesson')}>
            <select className="field" value={change.lessonId} onChange={(e) => setChange({ ...change, lessonId: e.target.value })}>
              <option value="">—</option>
              {(lessons.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.start} · {pick(subjectById(l.subjectId), 'name', lang)} · {l.room}</option>)}
            </select>
          </Field>
          <Segmented value={change.kind} onChange={(v) => setChange({ ...change, kind: v })} options={['cancelled', 'room', 'substitute'].map((k) => ({ value: k, label: t('change_' + k) }))} />
          {change.kind === 'room' && <input className="field" placeholder={t('newRoom')} value={change.newRoom} onChange={(e) => setChange({ ...change, newRoom: e.target.value })} />}
          {change.kind === 'substitute' && <input className="field" placeholder={t('newTeacher')} value={change.newTeacher} onChange={(e) => setChange({ ...change, newTeacher: e.target.value })} />}
          <input className="field" placeholder={t('note')} value={change.note} onChange={(e) => setChange({ ...change, note: e.target.value })} />
          <Button variant="primary" full disabled={!change.lessonId} onClick={addChange}>{t('save')}</Button>
        </Card>
      </Section>

      <Section title={t('addExam')}>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('classLabel')}>
              <select className="field" value={exam.class} onChange={(e) => setExam({ ...exam, class: e.target.value })}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label={t('eventKind')}>
              <select className="field" value={exam.kind} onChange={(e) => setExam({ ...exam, kind: e.target.value })}>{['test', 'exam', 'quiz'].map((k) => <option key={k} value={k}>{t('exam_' + k)}</option>)}</select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('subject')}>
              <select className="field" value={exam.subjectId} onChange={(e) => setExam({ ...exam, subjectId: e.target.value, topicId: '' })}>
                <option value="">—</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
              </select>
            </Field>
            <Field label={t('topic')}>
              <select className="field" value={exam.topicId} onChange={(e) => setExam({ ...exam, topicId: e.target.value })}>
                <option value="">—</option>
                {examSubject?.topics.map((tp) => <option key={tp.id} value={tp.id}>{pick(tp, 'name', lang)}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('date')}><input type="datetime-local" className="field" value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} /></Field>
          <Button variant="primary" full disabled={!exam.subjectId} onClick={addExam}>{t('save')}</Button>
        </Card>
      </Section>

      <Section title={t('outbox')}>
        {outbox.loading && !outbox.data ? <Loading /> : !outbox.data?.length ? <Card><Empty icon={Mail} text={t('noData')} /></Card> : (
          <List>
            {outbox.data.slice(0, 12).map((o) => (
              <Row key={o.id} chevron={false} title={o.subject} subtitle={`${o.channel} · ${o.recipient} · ${fmtRelative(o.createdAt, lang, t)}`}
                right={<Badge tone={o.status === 'sent' ? 'ok' : o.status === 'failed' ? 'danger' : 'neutral'}>{o.status}</Badge>} />
            ))}
          </List>
        )}
        <p className="mt-2 px-1 text-[12px] text-faint">{t('outboxSimulated')}</p>
      </Section>

      <Section>
        <Card className="flex items-start gap-3 p-3.5">
          <Store className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="text-[13px] leading-5 text-muted">
            {t('partnerApiHint')}
            <a href="/partner" target="_blank" rel="noreferrer" className="mt-1 block text-accent">{window.location.origin}/partner</a>
          </div>
        </Card>
        <Button variant="danger" full icon={RefreshCw} className="mt-3" onClick={resetDemo}>{t('demoReset')}</Button>
      </Section>
    </>
  )
}

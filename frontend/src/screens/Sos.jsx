import { useState } from 'react'
import { LifeBuoy, Send, MessageCircle, Check, X, Clock3, PartyPopper } from 'lucide-react'
import { useApp, useApi, usePolling } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtRelative } from '../lib/format'
import { Avatar, Badge, Button, Card, Chip, Empty, Field, PageTitle, ScreenHeader, Section, Segmented, SubjectDot, VerifiedMark, Loading, cx } from '../components/ui'

const statusTone = { active: 'warn', accepted: 'info', resolved: 'ok', cancelled: 'neutral' }

export default function Sos({ pushed, ...prefill }) {
  const { me, t } = useApp()
  const nav = useNav()
  const body = me.role === 'student' ? <StudentSos prefill={prefill} /> : <MentorQueue />
  if (!pushed) return body
  return (
    <>
      <ScreenHeader title={t('sosTitle')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1">{body}</div>
    </>
  )
}

function SosCard({ r, children, showStudent }) {
  const { t, lang, subjectById, topicName } = useApp()
  const s = subjectById(r.subjectId)
  const topic = r.topicId ? topicName(r.subjectId, r.topicId) : r.topicText
  return (
    <Card className="p-4">
      {showStudent && r.student && (
        <div className="mb-3 flex items-center gap-2.5">
          <Avatar user={r.student} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate text-[14px]">{r.student.nickname}<VerifiedMark user={r.student} className="size-3.5" /></div>
            <div className="text-[12px] text-faint">{fmtRelative(r.createdAt, lang, t)}{r.student.class ? ` · ${r.student.class}` : ''}</div>
          </div>
          <Badge tone="danger">SOS</Badge>
        </div>
      )}
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <SubjectDot color={s?.color} />{pick(s, 'name', lang)}<span className="text-faint">·</span>{t('sos_' + r.kind)}
      </div>
      <div className="mt-1 text-[15.5px] leading-6">{topic}</div>
      {r.description && <p className="mt-1 text-[13.5px] leading-5 text-muted">{r.description}</p>}
      {!showStudent && (
        <div className="mt-3 flex items-center gap-2">
          <Badge tone={statusTone[r.status]}>{t('status_' + r.status)}</Badge>
          {r.mentor && <span className="truncate text-[12.5px] text-muted">{t('takenBy', { name: r.mentor.nickname })}</span>}
          <span className="ml-auto text-[12px] text-faint">{fmtRelative(r.createdAt, lang, t)}</span>
        </div>
      )}
      {children}
    </Card>
  )
}

function StudentSos({ prefill }) {
  const { t, lang, subjects, toast, fail, subjectById } = useApp()
  const nav = useNav()
  const [subjectId, setSubjectId] = useState(prefill.subjectId ?? subjects[0]?.id ?? '')
  const [topicId, setTopicId] = useState(prefill.topicId ?? null)
  const [topicText, setTopicText] = useState(prefill.topicText ?? '')
  const [kind, setKind] = useState(prefill.kind ?? 'test')
  const [description, setDescription] = useState(prefill.description ?? '')
  const [busy, setBusy] = useState(false)
  const mine = useApi('/api/sos/mine')
  usePolling(mine.reload, 12000)

  const sid = Number(subjectId) || subjects[0]?.id
  const subject = subjectById(sid)
  const other = topicId === null
  const canSend = sid && (topicId || topicText.trim())

  const send = async () => {
    setBusy(true)
    try {
      const res = await api.post('/api/sos', {
        subjectId: sid, topicId, topicText: other ? topicText : null, kind, description,
      })
      toast(t('sosSent', { n: res.notified }))
      setTopicText('')
      setDescription('')
      mine.reload()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const act = async (r, action) => {
    try {
      await api.post(`/api/sos/${r.id}/${action}`)
      mine.reload()
    } catch (e) { fail(e) }
  }

  const active = (mine.data ?? []).filter((r) => r.status === 'active' || r.status === 'accepted')
  const history = (mine.data ?? []).filter((r) => r.status === 'resolved' || r.status === 'cancelled').slice(0, 6)

  return (
    <div className="px-4 pb-8">
      <PageTitle sub={t('sosLead')}>{t('sosTitle')}</PageTitle>

      <Card className="mt-4 space-y-4 p-4">
        <Field label={t('subject')}>
          <select value={sid ?? ''} onChange={(e) => { setSubjectId(Number(e.target.value)); setTopicId(null) }} className="field">
            {subjects.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
          </select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] text-muted">{t('topic')}</span>
          <div className="flex flex-wrap gap-1.5">
            {subject?.topics.map((tp) => (
              <Chip key={tp.id} active={topicId === tp.id} onClick={() => setTopicId(tp.id)}>{pick(tp, 'name', lang)}</Chip>
            ))}
            <Chip active={other} onClick={() => setTopicId(null)}>{t('otherTopic')}</Chip>
          </div>
          {other && <input value={topicText} onChange={(e) => setTopicText(e.target.value)} maxLength={120} placeholder={t('topicPlaceholder')} className="field mt-2" />}
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] text-muted">{t('taskType')}</span>
          <Segmented value={kind} onChange={setKind} options={['test', 'question', 'homework'].map((k) => ({ value: k, label: t('sos_' + k) }))} />
        </div>
        <Field label={t('sosDetails')}>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000}
            placeholder={t('sosDetailsPlaceholder')} className="field resize-none" />
        </Field>
        <Button variant="sos" size="lg" full icon={Send} loading={busy} disabled={!canSend} onClick={send}>{t('sendSos')}</Button>
      </Card>

      {active.length > 0 && (
        <Section title={t('mySos')}>
          <div className="space-y-2">
            {active.map((r) => (
              <SosCard key={r.id} r={r}>
                <div className="mt-3 flex gap-2">
                  {r.status === 'accepted' && r.connectionId && (
                    <Button size="sm" variant="primary" icon={MessageCircle} onClick={() => nav.push('chat', { id: r.connectionId })}>{t('openChat')}</Button>
                  )}
                  {r.status === 'accepted' && <Button size="sm" icon={Check} onClick={() => act(r, 'resolve')}>{t('markResolved')}</Button>}
                  {r.status === 'active' && <Button size="sm" variant="ghost" icon={X} onClick={() => act(r, 'cancel')}>{t('cancel')}</Button>}
                </div>
              </SosCard>
            ))}
          </div>
        </Section>
      )}

      {history.length > 0 && (
        <Section title={t('history')}>
          <div className="space-y-2 opacity-80">{history.map((r) => <SosCard key={r.id} r={r} />)}</div>
        </Section>
      )}
    </div>
  )
}

function MentorQueue() {
  const { t, me, fail } = useApp()
  const nav = useNav()
  const queue = useApi('/api/sos/active')
  const mine = useApi('/api/sos/mine')
  const [busyId, setBusyId] = useState(null)
  usePolling(queue.reload, 10000)

  const accept = async (r) => {
    setBusyId(r.id)
    try {
      const res = await api.post(`/api/sos/${r.id}/accept`)
      nav.push('chat', { id: res.connectionId })
      queue.reload()
      mine.reload()
    } catch (e) {
      fail(e)
      queue.reload()
    } finally { setBusyId(null) }
  }

  const resolve = async (r) => {
    try { await api.post(`/api/sos/${r.id}/resolve`); mine.reload() } catch (e) { fail(e) }
  }

  const canAccept = me.role === 'mentor' && me.verified
  const myAccepted = (mine.data ?? []).filter((r) => r.mentor?.id === me.id && r.status === 'accepted')

  return (
    <div className="px-4 pb-8">
      <PageTitle sub={t('sosQueueLead')}>{t('sosQueue')}</PageTitle>
      {me.role === 'mentor' && !me.verified && (
        <Card className="mt-4 flex items-start gap-3 border-warn/25 bg-warn/6 p-3.5 text-[13px] leading-5">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-warn" />{t('mentorNeedsApproval')}
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {queue.loading && !queue.data ? <Loading /> : !queue.data?.length ? (
          <Card><Empty icon={PartyPopper} text={t('sosEmpty')} /></Card>
        ) : queue.data.map((r) => (
          <SosCard key={r.id} r={r} showStudent>
            {canAccept && (
              <Button variant="primary" full className="mt-3" icon={LifeBuoy} loading={busyId === r.id} onClick={() => accept(r)}>{t('accept')}</Button>
            )}
          </SosCard>
        ))}
      </div>

      {myAccepted.length > 0 && (
        <Section title={t('status_accepted')}>
          <div className="space-y-2">
            {myAccepted.map((r) => (
              <SosCard key={r.id} r={r} showStudent>
                <div className={cx('mt-3 flex gap-2')}>
                  {r.connectionId && <Button size="sm" variant="primary" icon={MessageCircle} onClick={() => nav.push('chat', { id: r.connectionId })}>{t('openChat')}</Button>}
                  <Button size="sm" icon={Check} onClick={() => resolve(r)}>{t('markResolved')}</Button>
                </div>
              </SosCard>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Plus, CalendarDays, MapPin, Users, ScanLine, Check, CalendarClock } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { fmtDate, fmtDayTime, fmtTime, toLocalInput } from '../lib/format'
import { Badge, Button, Card, Empty, Field, IconButton, List, Loading, Row, ScreenHeader, Section, Segmented, Sheet } from '../components/ui'
import { PersonRow } from '../components/items'
import { QrScanner } from '../components/Qr'

const KINDS = ['study', 'social', 'gaming', 'sport', 'school']

function DateBlock({ at }) {
  const { lang } = useApp()
  const d = new Date(at)
  return (
    <div className="flex w-11 shrink-0 flex-col items-center rounded-xl border border-line bg-surface py-1.5">
      <span className="text-[10.5px] uppercase text-muted">{fmtDate(d, lang, { month: 'short' }).replace('.', '')}</span>
      <span className="text-[17px] font-semibold leading-5 tabular">{d.getDate()}</span>
    </div>
  )
}

export function Events() {
  const { t, lang } = useApp()
  const nav = useNav()
  const [scope, setScope] = useState('upcoming')
  const { data, loading, reload } = useApi(`/api/events?scope=${scope}`)
  const [form, setForm] = useState(false)
  return (
    <>
      <ScreenHeader title={t('events')} onBack={nav.pop} backLabel={t('back')} right={<IconButton icon={Plus} label={t('eventNew')} onClick={() => setForm(true)} />} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'upcoming', label: t('upcoming') }, { value: 'past', label: t('pastEvents') }]} />
        <div className="mt-3">
          {loading && !data ? <Loading /> : !data?.length ? <Empty icon={CalendarDays} text={t('noData')} /> : (
            <List>
              {data.map((e) => (
                <Row key={e.id} onClick={() => nav.push('event', { id: e.id })}
                  left={<DateBlock at={e.startsAt} />}
                  title={e.title}
                  subtitle={`${fmtTime(e.startsAt, lang)} · ${e.location}${e.group ? ' · ' + e.group.name : ''}`}
                  right={<div className="flex flex-col items-end gap-1">
                    {e.joined ? <Badge tone="accent" icon={Check}>{t('going')}</Badge> : <Badge>{t('ev_' + e.kind)}</Badge>}
                    <span className="text-[11.5px] text-faint tabular">{e.participants}{e.capacity ? `/${e.capacity}` : ''}</span>
                  </div>} />
              ))}
            </List>
          )}
        </div>
      </div>
      <EventForm open={form} onClose={() => setForm(false)} onCreated={(e) => { setForm(false); reload(); nav.push('event', { id: e.id }) }} />
    </>
  )
}

export function EventDetail({ id }) {
  const { t, lang, fail, toast } = useApp()
  const nav = useNav()
  const { data, loading, reload } = useApi(`/api/events/${id}`)
  const [scan, setScan] = useState(false)
  const e = data?.event

  const toggle = async () => {
    try { await api.post(`/api/events/${id}/${e.joined ? 'leave' : 'join'}`); reload() } catch (err) { fail(err) }
  }
  const checkIn = async (qrToken) => {
    try {
      const res = await api.post(`/api/events/${id}/checkin`, { qrToken })
      toast(t('checkedInToast', { name: res.user.nickname }))
      reload()
    } catch (err) { fail(err) }
  }
  const past = e && new Date(e.startsAt) < new Date()
  const full = e?.capacity && e.participants >= e.capacity

  return (
    <>
      <ScreenHeader title={e?.title ?? ''} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        {loading && !data ? <Loading /> : e && (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2"><Badge>{t('ev_' + e.kind)}</Badge>{e.group && <Badge tone="info">{e.group.name}</Badge>}</div>
              <h1 className="mt-2 text-[20px] font-semibold leading-7 tracking-tight">{e.title}</h1>
              <div className="mt-3 space-y-2 text-[14px]">
                <div className="flex items-center gap-2.5"><CalendarClock className="size-4 text-muted" />{fmtDayTime(e.startsAt, lang, t)}</div>
                <div className="flex items-center gap-2.5"><MapPin className="size-4 text-muted" />{e.place ? `${e.place.name}, ${e.place.address}` : e.location}</div>
                <div className="flex items-center gap-2.5"><Users className="size-4 text-muted" />{e.participants}{e.capacity ? ` / ${e.capacity}` : ''}</div>
              </div>
              {e.description && <p className="mt-3 text-[14px] leading-6 text-muted">{e.description}</p>}
              {!past && (
                <Button full className="mt-4" variant={e.joined ? 'secondary' : 'primary'} icon={e.joined ? undefined : Check}
                  disabled={!e.joined && full} onClick={toggle}>
                  {e.joined ? t('notGoing') : full ? t('eventFull') : t('going')}
                </Button>
              )}
              {(e.isOwner) && <Button full className="mt-2" icon={ScanLine} onClick={() => setScan(true)}>{t('checkIn')}</Button>}
            </Card>
            {e.author && (
              <Section title={t('organizer')}>
                <List><PersonRow person={e.author} onClick={() => nav.push('user', { id: e.author.id })} /></List>
              </Section>
            )}
            <Section title={t('participants')}>
              <List>
                {data.people.map((p) => (
                  <PersonRow key={p.user.id} person={p.user} onClick={() => nav.push('user', { id: p.user.id })}
                    right={p.checkedIn ? <Badge tone="ok" icon={Check}>{t('checkedIn')}</Badge> : null} />
                ))}
              </List>
            </Section>
          </>
        )}
      </div>
      <QrScanner open={scan} onClose={() => setScan(false)} title={t('checkIn')} onResult={(token) => { setScan(false); checkIn(token) }} />
    </>
  )
}

export function EventForm({ open, onClose, groupId, onCreated }) {
  const { t, fail } = useApp()
  const places = useApi(open ? '/api/places' : null)
  const groups = useApi(open && !groupId ? '/api/groups' : null)
  const initial = () => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    d.setHours(16, 0, 0, 0)
    return { title: '', description: '', startsAt: toLocalInput(d), placeId: '', location: '', kind: 'study', capacity: '', groupId: groupId ?? '' }
  }
  const [form, setForm] = useState(initial)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async () => {
    try {
      const e = await api.post('/api/events', {
        ...form, startsAt: new Date(form.startsAt).toISOString(), placeId: form.placeId || null,
        capacity: form.capacity ? Number(form.capacity) : null, groupId: form.groupId || null,
      })
      setForm(initial())
      onCreated?.(e)
    } catch (err) { fail(err) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('eventNew')}
      footer={<Button variant="primary" full onClick={submit} disabled={form.title.trim().length < 3}>{t('create')}</Button>}>
      <div className="space-y-3">
        <Field label={t('eventTitle')}><input autoFocus className="field" maxLength={80} value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('eventKind')}>
            <select className="field" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{t('ev_' + k)}</option>)}
            </select>
          </Field>
          <Field label={t('capacityOptional')}><input type="number" min={1} className="field" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
        </div>
        <Field label={t('when')}><input type="datetime-local" className="field" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} /></Field>
        <Field label={t('location')}>
          <select className="field" value={form.placeId} onChange={(e) => set({ placeId: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">—</option>
            {(places.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        {!form.placeId && <input className="field" placeholder={t('location')} value={form.location} onChange={(e) => set({ location: e.target.value })} />}
        {!groupId && (
          <Field label={t('forGroup')}>
            <select className="field" value={form.groupId} onChange={(e) => set({ groupId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">{t('noGroup')}</option>
              {(groups.data ?? []).filter((g) => g.joined).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('groupDesc')}><textarea rows={3} className="field resize-none" maxLength={600} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      </div>
    </Sheet>
  )
}

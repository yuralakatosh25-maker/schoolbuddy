import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, MapPin, ExternalLink, QrCode, KeyRound, ShieldCheck, X, RefreshCw, MessageSquareText } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { fmtCountdown, fmtDate, fmtDay, fmtDayTime, fmtTime, toLocalInput } from '../lib/format'
import { shareText } from '../lib/share'
import { Avatar, Badge, Button, Card, Chip, Empty, Field, List, Loading, Row, ScreenHeader, Segmented, Sheet, VerifiedMark } from '../components/ui'
import { MeetingRow } from '../components/items'
import { QrImage, QrScanner } from '../components/Qr'

const statusTone = { scheduled: 'info', completed: 'ok', cancelled: 'neutral' }

export function Meetings() {
  const { t } = useApp()
  const nav = useNav()
  const [scope, setScope] = useState('upcoming')
  const { data, loading } = useApi(`/api/meetings?scope=${scope}`)
  return (
    <>
      <ScreenHeader title={t('meetings')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'upcoming', label: t('upcoming') }, { value: 'past', label: t('pastMeetings') }]} />
        <div className="mt-3">
          {loading && !data ? <Loading /> : !data?.length ? <Empty icon={CalendarClock} text={t('noMeetings')} /> : (
            <List>
              {data.map((m) => (
                <div key={m.id} className="relative">
                  <MeetingRow meeting={m} onClick={() => nav.push('meeting', { id: m.id })} />
                  {scope === 'past' && <Badge tone={statusTone[m.status]} className="absolute right-10 top-1/2 -translate-y-1/2">{t('meetingStatus_' + m.status)}</Badge>}
                </div>
              ))}
            </List>
          )}
        </div>
      </div>
    </>
  )
}

export function Meeting({ id }) {
  const { t, lang, fail, toast, ask, reloadMe } = useApp()
  const nav = useNav()
  const { data: m, setData, reload, loading } = useApi(`/api/meetings/${id}`)
  const contacts = useApi('/api/me/trusted-contacts')
  const [now, setNow] = useState(() => Date.now())
  const [scan, setScan] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const left = m?.pinExpiresAt ? new Date(m.pinExpiresAt) - now : 0

  const genPin = async () => {
    try { setData(await api.post(`/api/meetings/${id}/pin`)) } catch (e) { fail(e) }
  }
  const confirm = async (payload) => {
    try {
      const res = await api.post('/api/meetings/confirm', { meetingId: id, ...payload })
      setScan(false)
      toast(t('meetingConfirmed', { coins: res.coins }))
      reload()
      reloadMe()
    } catch (e) { fail(e) }
  }
  const enterPin = async () => {
    const pin = await ask({ title: t('confirmWithPin'), input: '000000', confirm: t('confirm') })
    if (pin) confirm({ pin })
  }
  const cancel = async () => {
    if (!(await ask({ title: t('cancelMeeting'), danger: true, confirm: t('cancelMeeting') }))) return
    try { setData(await api.post(`/api/meetings/${id}/cancel`)) } catch (e) { fail(e) }
  }
  const shareTrusted = async () => {
    // Мінімум даних: дата, час, місце і нікнейм — без телефонів, класу чи пошти
    const text = t('shareMeetingText', {
      date: fmtDate(m.scheduledAt, lang, { weekday: 'long', day: 'numeric', month: 'long' }),
      time: fmtTime(m.scheduledAt, lang),
      place: m.place ? `${m.place.name}, ${m.place.address}` : t('noPlace'),
      name: m.with?.nickname,
    })
    const r = await shareText({ title: 'SchoolBuddy', text })
    if (r === 'copied') toast(t('copied'))
  }

  return (
    <>
      <ScreenHeader title={t('meeting')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        {loading && !m ? <Loading /> : m && (
          <>
            <Card className="p-4">
              <button type="button" onClick={() => nav.push('user', { id: m.with.id })} className="flex w-full items-center gap-3 text-left">
                <Avatar user={m.with} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[16px]">{m.with.nickname}<VerifiedMark user={m.with} /></div>
                  <div className="text-[13px] text-muted">{t(m.with.role)}</div>
                </div>
                <Badge tone={statusTone[m.status]}>{t('meetingStatus_' + m.status)}</Badge>
              </button>
              <div className="mt-4 space-y-2.5 text-[14px]">
                <div className="flex items-center gap-2.5"><CalendarClock className="size-4 text-muted" />{fmtDayTime(m.scheduledAt, lang, t)}</div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 text-muted" />
                  {m.place ? (
                    <span>
                      {m.place.name}<span className="block text-[13px] text-muted">{m.place.address}</span>
                      <a className="mt-1 inline-flex items-center gap-1 text-[13px] text-accent" target="_blank" rel="noreferrer"
                        href={`https://www.openstreetmap.org/?mlat=${m.place.lat}&mlon=${m.place.lng}#map=17/${m.place.lat}/${m.place.lng}`}>
                        {t('openInMaps')}<ExternalLink className="size-3" />
                      </a>
                    </span>
                  ) : t('noPlace')}
                </div>
                {m.topic && <div className="flex items-start gap-2.5"><MessageSquareText className="mt-0.5 size-4 text-muted" />{m.topic}</div>}
              </div>
            </Card>

            {m.status === 'scheduled' && m.myRole === 'student' && (
              <Card className="mt-3 p-4">
                {m.pin && left > 0 ? (
                  <div className="flex flex-col items-center text-center">
                    <div className="font-mono text-[38px] font-semibold tracking-[0.25em] tabular">{m.pin}</div>
                    <div className="mt-1 text-[12.5px] text-muted">{t('pinExpires', { t: fmtCountdown(left) })}</div>
                    <div className="mt-4"><QrImage value={m.qrToken} size={200} /></div>
                    <p className="mt-3 text-[13px] leading-5 text-muted">{t('pinLead')}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[13.5px] leading-5 text-muted">{m.pin ? t('pinExpired') : t('pinLead')}</p>
                    <Button variant="primary" full className="mt-3" icon={m.pin ? RefreshCw : QrCode} onClick={genPin}>{m.pin ? t('newPin') : t('generatePin')}</Button>
                  </>
                )}
              </Card>
            )}

            {m.status === 'scheduled' && m.myRole === 'mentor' && (
              <Card className="mt-3 p-4">
                <p className="text-[13.5px] leading-5 text-muted">{t('meetingConfirmLead')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="primary" icon={QrCode} onClick={() => setScan(true)}>{t('scanQr')}</Button>
                  <Button icon={KeyRound} onClick={enterPin}>{t('enterPin')}</Button>
                </div>
              </Card>
            )}

            {m.status === 'scheduled' && (
              <List className="mt-3">
                <Row left={<ShieldCheck className="size-4 text-muted" />} title={t('shareTrusted')}
                  subtitle={contacts.data?.length ? contacts.data.map((c) => c.name).join(', ') : t('trustedLead')}
                  onClick={contacts.data?.length ? shareTrusted : () => nav.push('trusted')} />
                <Row left={<X className="size-4 text-danger" />} title={<span className="text-danger">{t('cancelMeeting')}</span>} onClick={cancel} />
              </List>
            )}
          </>
        )}
      </div>
      <QrScanner open={scan} onClose={() => setScan(false)} onResult={(qrToken) => confirm({ qrToken })} />
    </>
  )
}

// Планування зустрічі: вільні слоти з годин консультацій ментора, безпечне місце і тема
export function MeetingPlanner({ open, onClose, connectionId, mentorId, onCreated }) {
  const { t, lang, fail, toast } = useApp()
  const slots = useApi(open ? `/api/office-hours/${mentorId}/slots` : null)
  const places = useApi(open ? '/api/places' : null)
  const [slot, setSlot] = useState(null)
  const [custom, setCustom] = useState('')
  const [placeId, setPlaceId] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)

  const byDay = useMemo(() => {
    const g = new Map()
    for (const s of slots.data ?? []) {
      const key = new Date(s.at).toDateString()
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(s)
    }
    return [...g.values()]
  }, [slots.data])

  const at = custom ? new Date(custom) : slot ? new Date(slot) : null

  const submit = async () => {
    setBusy(true)
    try {
      await api.post('/api/meetings', { connectionId, scheduledAt: at.toISOString(), placeId: placeId || null, topic })
      toast(t('meetingCreated'))
      setSlot(null); setCustom(''); setTopic('')
      onCreated?.()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('scheduleMeeting')}
      footer={<Button variant="primary" full loading={busy} disabled={!at} onClick={submit}>{t('scheduleMeeting')}</Button>}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-[13px] text-muted">{t('freeSlots')}</span>
          {slots.loading ? <Loading className="py-4" /> : byDay.length === 0 ? <p className="text-[13px] text-faint">{t('noData')}</p> : (
            <div className="space-y-2">
              {byDay.slice(0, 4).map((list) => (
                <div key={list[0].at}>
                  <div className="mb-1 text-[12px] text-faint">{fmtDay(list[0].at, lang, t)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((s) => (
                      <Chip key={s.at} active={!custom && slot === s.at} onClick={() => { setSlot(s.at); setCustom('') }}>
                        {fmtTime(s.at, lang)} · {t('mode_' + s.mode)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Field label={t('customTime')}>
          <input type="datetime-local" className="field" value={custom} min={toLocalInput(new Date())} onChange={(e) => setCustom(e.target.value)} />
        </Field>
        <Field label={t('where')} hint={t('safePlacesLead')}>
          <select className="field" value={placeId} onChange={(e) => setPlaceId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('noPlace')}</option>
            {(places.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {t('place_' + p.kind)}</option>)}
          </select>
        </Field>
        <Field label={t('meetingTopic')}>
          <input className="field" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}

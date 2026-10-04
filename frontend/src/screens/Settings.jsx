import { useState } from 'react'
import { Plus, Trash2, ShieldCheck, Download, UserX, Check, ChevronDown, Info, BookOpen } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { LANGS, pick } from '../lib/i18n'
import { fmtDate, weekdayName } from '../lib/format'
import { downloadJson } from '../lib/share'
import { Avatar, Button, Card, Chip, Empty, Field, List, Loading, Row, ScreenHeader, Section, Segmented, Toggle, cx } from '../components/ui'

const CLASSES = ['1.IT', '2.IT', '3.IT', '4.IT']

function Page({ title, children, footer }) {
  const { t } = useApp()
  const nav = useNav()
  return (
    <>
      <ScreenHeader title={title} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">{children}</div>
      {footer && <div className="border-t border-line px-4 py-3 pb-safe">{footer}</div>}
    </>
  )
}

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function EditProfile() {
  const { t, lang, me, setMe, subjects, fail, toast } = useApp()
  const nav = useNav()
  const [form, setForm] = useState({
    nickname: me.nickname, bio: me.bio ?? '', class: me.class ?? '', languages: me.languages,
    helpFormats: me.helpFormats, helpSubjects: me.helpSubjects, maxStudents: me.maxStudents,
  })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const isMentor = me.role === 'mentor'

  const save = async () => {
    setBusy(true)
    try {
      const profile = await api.put('/api/me', { ...form, class: form.class })
      setMe(profile)
      toast(t('saved'))
      nav.pop()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  return (
    <Page title={t('editProfile')} footer={<Button variant="primary" full loading={busy} onClick={save}>{t('save')}</Button>}>
      <div className="space-y-4">
        <Field label={t('nicknameLabel')}><input className="field" maxLength={40} value={form.nickname} onChange={(e) => set({ nickname: e.target.value })} /></Field>
        <Field label={t('bio')}><textarea rows={3} maxLength={300} className="field resize-none" value={form.bio} onChange={(e) => set({ bio: e.target.value })} /></Field>
        <Field label={t('classLabel')}>
          <div className="flex gap-2">
            {CLASSES.map((c) => (
              <button key={c} type="button" onClick={() => set({ class: c })}
                className={cx('h-10 flex-1 rounded-xl border text-[14px]', form.class === c ? 'border-ink bg-ink text-surface' : 'border-line bg-card text-muted')}>{c}</button>
            ))}
          </div>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] text-muted">{t('languages')}</span>
          <div className="flex gap-1.5">{LANGS.map((l) => <Chip key={l} active={form.languages.includes(l)} onClick={() => set({ languages: toggleIn(form.languages, l) })}>{t('langName_' + l)}</Chip>)}</div>
        </div>
        {isMentor && (
          <>
            <div>
              <span className="mb-1.5 block text-[13px] text-muted">{t('helpFormat')}</span>
              <div className="flex flex-wrap gap-1.5">
                {['online', 'offline', 'school', 'place'].map((f) => <Chip key={f} active={form.helpFormats.includes(f)} onClick={() => set({ helpFormats: toggleIn(form.helpFormats, f) })}>{t('fmt_' + f)}</Chip>)}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] text-muted">{t('helpsWith')}</span>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((s) => (
                  <Chip key={s.id} active={form.helpSubjects.includes(s.id)} onClick={() => set({ helpSubjects: toggleIn(form.helpSubjects, s.id) })}>
                    <span className="size-2 rounded-full" style={{ background: s.color }} />{pick(s, 'name', lang)}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label={t('maxStudents')}>
              <input type="number" min={1} max={20} className="field" value={form.maxStudents} onChange={(e) => set({ maxStudents: Number(e.target.value) })} />
            </Field>
          </>
        )}
      </div>
    </Page>
  )
}

export function OfficeHours() {
  const { t, lang, me, setMe, fail, toast } = useApp()
  const { data, loading, setData } = useApi(`/api/office-hours/${me.id}`)
  const [busy, setBusy] = useState(false)
  const hours = data ?? []
  const update = (i, patch) => setData((list) => list.map((h, j) => (j === i ? { ...h, ...patch } : h)))

  const setAvailability = async (availability) => {
    setMe((m) => ({ ...m, availability }))
    try { await api.put('/api/me', { availability }) } catch (e) { fail(e) }
  }
  const save = async () => {
    setBusy(true)
    try {
      setData(await api.put('/api/office-hours', hours))
      toast(t('saved'))
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  return (
    <Page title={t('officeHours')} footer={<Button variant="primary" full loading={busy} onClick={save}>{t('save')}</Button>}>
      <p className="text-[13px] leading-5 text-muted">{t('officeHoursLead')}</p>
      <Section title={t('availability')}>
        <Segmented value={me.availability} onChange={setAvailability} options={['available', 'busy', 'dnd'].map((a) => ({ value: a, label: t('avail_' + a) }))} />
      </Section>
      <Section title={t('officeHours')}>
        {loading && !data ? <Loading /> : (
          <div className="space-y-2">
            {hours.map((h, i) => (
              <Card key={i} className="p-3">
                <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                  <select className="field h-10 py-0 capitalize" value={h.dayOfWeek} onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{weekdayName(d, lang)}</option>)}
                  </select>
                  <input type="time" className="field h-10 w-[92px] px-2 py-0" value={h.start} onChange={(e) => update(i, { start: e.target.value })} />
                  <input type="time" className="field h-10 w-[92px] px-2 py-0" value={h.end} onChange={(e) => update(i, { end: e.target.value })} />
                  <button type="button" onClick={() => setData((list) => list.filter((_, j) => j !== i))} className="grid size-9 place-items-center text-faint hover:text-danger" aria-label={t('delete')}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-[auto_1fr] gap-2">
                  <select className="field h-10 py-0" value={h.mode} onChange={(e) => update(i, { mode: e.target.value })}>
                    {['school', 'online', 'place'].map((m) => <option key={m} value={m}>{t('mode_' + m)}</option>)}
                  </select>
                  <input className="field h-10 py-0" placeholder={t('note')} value={h.note ?? ''} maxLength={100} onChange={(e) => update(i, { note: e.target.value })} />
                </div>
              </Card>
            ))}
            <Button full icon={Plus} onClick={() => setData((list) => [...(list ?? []), { dayOfWeek: 1, start: '14:30', end: '16:00', mode: 'school', note: '' }])}>{t('addHours')}</Button>
          </div>
        )}
      </Section>
    </Page>
  )
}

export function TrustedContacts() {
  const { t, fail } = useApp()
  const { data, loading, reload } = useApi('/api/me/trusted-contacts')
  const [form, setForm] = useState({ name: '', contact: '', relation: '' })

  const add = async (e) => {
    e.preventDefault()
    try { await api.post('/api/me/trusted-contacts', form); setForm({ name: '', contact: '', relation: '' }); reload() } catch (err) { fail(err) }
  }
  const remove = async (id) => {
    try { await api.del(`/api/me/trusted-contacts/${id}`); reload() } catch (err) { fail(err) }
  }

  return (
    <Page title={t('trustedContacts')}>
      <Card className="flex items-start gap-3 p-3.5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="text-[13.5px] leading-5 text-muted">{t('trustedLead')}</p>
      </Card>
      <Section>
        {loading && !data ? <Loading /> : data?.length ? (
          <List>
            {data.map((c) => (
              <Row key={c.id} chevron={false} title={c.name} subtitle={[c.relation, c.contact].filter(Boolean).join(' · ')}
                right={<button type="button" onClick={() => remove(c.id)} className="text-faint hover:text-danger" aria-label={t('delete')}><Trash2 className="size-4" /></button>} />
            ))}
          </List>
        ) : <Empty icon={ShieldCheck} text={t('noData')} />}
      </Section>
      {(data?.length ?? 0) < 3 && (
        <Section title={t('addContact')}>
          <form onSubmit={add} className="space-y-2">
            <input className="field" placeholder={t('contactName')} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="field" placeholder={t('contactValue')} value={form.contact} maxLength={100} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className="field" placeholder={`${t('contactRelation')} (${t('optional')})`} value={form.relation} maxLength={40} onChange={(e) => setForm({ ...form, relation: e.target.value })} />
            <Button type="submit" full icon={Plus} disabled={!form.name.trim() || !form.contact.trim()}>{t('addContact')}</Button>
          </form>
        </Section>
      )}
    </Page>
  )
}

export function Settings() {
  const { t, lang, setLang, me, setMe, fail, toast, ask, logout, theme, setTheme } = useApp()
  const blocked = useApi('/api/users/blocked')
  const [faq, setFaq] = useState(null)
  const [telegram, setTelegram] = useState(me.notify.telegramHandle ?? '')

  const setNotify = async (patch) => {
    const next = { ...me.notify, ...patch }
    if (patch.push && 'Notification' in window && Notification.permission === 'default') {
      const p = await Notification.requestPermission()
      if (p !== 'granted') toast(t('pushDenied'), 'error')
    }
    setMe((m) => ({ ...m, notify: next }))
    try { await api.put('/api/me/notifications', next) } catch (e) { fail(e) }
  }

  const exportData = async () => {
    try { downloadJson(await api.get('/api/me/export'), `schoolbuddy-${me.id}.json`) } catch (e) { fail(e) }
  }
  const deleteAccount = async () => {
    const res = await ask({ title: t('deleteAccount'), text: t('deleteConfirm'), input: 'DELETE', match: 'DELETE', danger: true, confirm: t('delete') })
    if (res !== 'DELETE') return
    try { await api.del('/api/me'); toast(t('accountDeleted')); logout() } catch (e) { fail(e) }
  }
  const unblock = async (id) => {
    try { await api.del(`/api/users/${id}/block`); blocked.reload() } catch (e) { fail(e) }
  }

  const channels = [
    ['push', t('ch_push'), t('ch_push_d')],
    ['inApp', t('ch_inApp'), t('ch_inApp_d')],
    ['email', t('ch_email'), t('ch_email_d')],
    ['telegram', t('ch_telegram'), t('ch_telegram_d')],
  ]

  return (
    <Page title={t('settings')}>
      <Section title={t('theme')} className="mt-0">
        <Segmented value={theme} onChange={setTheme} options={[
          { value: 'light', label: t('themeLight') },
          { value: 'dark', label: t('themeDark') },
          { value: 'system', label: t('themeSystem') },
        ]} />
      </Section>

      <Section title={t('language')}>
        <List>
          {LANGS.map((l) => (
            <Row key={l} chevron={false} onClick={() => setLang(l)} title={t('langName_' + l)}
              left={<span className="w-6 text-[12px] font-semibold text-muted">{l}</span>}
              right={l === lang ? <Check className="size-4" /> : null} />
          ))}
        </List>
      </Section>

      <Section title={t('notifChannels')}>
        <List>
          {channels.map(([key, title, desc]) => (
            <div key={key}>
              <Row chevron={false} title={title} subtitle={desc} right={<Toggle checked={!!me.notify[key]} onChange={(v) => setNotify({ [key]: v })} label={title} />} />
              {key === 'telegram' && me.notify.telegram && (
                <div className="flex gap-2 px-4 pb-3">
                  <input className="field h-10 py-0" placeholder={t('telegramHandle')} value={telegram} onChange={(e) => setTelegram(e.target.value)} />
                  <Button onClick={() => setNotify({ telegramHandle: telegram })}>{t('save')}</Button>
                </div>
              )}
            </div>
          ))}
        </List>
      </Section>

      <Section title={t('privacy')}>
        <List>
          {me.consentAt && <Row chevron={false} left={<ShieldCheck className="size-4 text-ok" />} title={t('consentTitle')} subtitle={t('consentGiven', { date: fmtDate(me.consentAt, lang, { day: 'numeric', month: 'long', year: 'numeric' }) })} />}
          <Row left={<Download className="size-4 text-muted" />} title={t('exportData')} onClick={exportData} />
          <Row left={<UserX className="size-4 text-danger" />} title={<span className="text-danger">{t('deleteAccount')}</span>} onClick={deleteAccount} />
        </List>
      </Section>

      {blocked.data?.length > 0 && (
        <Section title={t('blockedUsers')}>
          <List>
            {blocked.data.map((u) => (
              <Row key={u.id} chevron={false} left={<Avatar user={u} size={34} />} title={u.nickname}
                right={<Button size="sm" onClick={() => unblock(u.id)}>{t('unblock')}</Button>} />
            ))}
          </List>
        </Section>
      )}

      <Section title={t('faq')}>
        <List>
          {[1, 2, 3].map((i) => (
            <button key={i} type="button" onClick={() => setFaq(faq === i ? null : i)} className="block w-full px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3 text-[14.5px]">{t(`faq${i}q`)}<ChevronDown className={cx('size-4 shrink-0 text-faint transition', faq === i && 'rotate-180')} /></div>
              {faq === i && <p className="mt-2 text-[13.5px] leading-5 text-muted">{t(`faq${i}a`)}</p>}
            </button>
          ))}
        </List>
      </Section>

      <Section title={t('rules')}>
        <Card className="flex items-start gap-3 p-3.5"><BookOpen className="mt-0.5 size-4 shrink-0 text-muted" /><p className="text-[13.5px] leading-5 text-muted">{t('rulesText')}</p></Card>
      </Section>

      <Section title={t('about')}>
        <Card className="flex items-start gap-3 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" />
          <div className="text-[13.5px] leading-5 text-muted">{t('aboutText')}<div className="mt-1 text-[12px] text-faint">{t('version', { v: '1.0.0' })}</div></div>
        </Card>
      </Section>
    </Page>
  )
}

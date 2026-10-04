import { useState } from 'react'
import { Plus, Megaphone, Pin, Trash2 } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtRelative } from '../lib/format'
import { Badge, Button, Card, Chip, Empty, Field, IconButton, Loading, ScreenHeader, Segmented, Sheet, Toggle } from '../components/ui'

const CATS = ['schedule', 'room', 'exam', 'event', 'general', 'urgent']
const tone = { urgent: 'danger', exam: 'warn', room: 'info', schedule: 'info', event: 'accent', general: 'neutral' }

export default function Announcements() {
  const { t, lang, me, fail, toast, ask } = useApp()
  const nav = useNav()
  const [cat, setCat] = useState('')
  const { data, loading, reload } = useApi(`/api/announcements${cat ? `?category=${cat}` : ''}`)
  const [form, setForm] = useState(null)
  const [formLang, setFormLang] = useState('UA')
  const isAdmin = me.role === 'admin'

  const publish = async () => {
    try {
      await api.post('/api/announcements', form)
      setForm(null)
      toast(t('published'))
      reload()
    } catch (e) { fail(e) }
  }
  const remove = async (a) => {
    if (!(await ask({ title: t('delete'), text: pick(a, 'title', lang), danger: true, confirm: t('delete') }))) return
    try { await api.del(`/api/announcements/${a.id}`); reload() } catch (e) { fail(e) }
  }
  const suffix = { UA: 'Ua', CZ: 'Cs', EN: 'En' }[formLang]

  return (
    <>
      <ScreenHeader title={t('announcements')} onBack={nav.pop} backLabel={t('back')}
        right={isAdmin && <IconButton icon={Plus} label={t('newAnnouncement')} onClick={() => setForm({ category: 'general', pinned: false })} />} />
      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-4 py-3">
        <Chip active={!cat} onClick={() => setCat('')}>{t('all')}</Chip>
        {CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{t('ann_' + c)}</Chip>)}
      </div>
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        {loading && !data ? <Loading /> : !data?.length ? <Empty icon={Megaphone} text={t('noData')} /> : (
          <div className="space-y-2">
            {data.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex items-center gap-2">
                  <Badge tone={tone[a.category]}>{t('ann_' + a.category)}</Badge>
                  {a.pinned && <Badge icon={Pin}>{t('pinned')}</Badge>}
                  <span className="ml-auto text-[12px] text-faint">{fmtRelative(a.createdAt, lang, t)}</span>
                  {isAdmin && <button type="button" onClick={() => remove(a)} className="text-faint hover:text-danger" aria-label={t('delete')}><Trash2 className="size-4" /></button>}
                </div>
                <h3 className="mt-2 text-[16px] font-medium leading-6">{pick(a, 'title', lang)}</h3>
                <p className="mt-1 whitespace-pre-wrap text-[14px] leading-6 text-muted">{pick(a, 'body', lang)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!form} onClose={() => setForm(null)} title={t('newAnnouncement')}
        footer={<Button variant="primary" full onClick={publish} disabled={!form || !['Ua', 'Cs', 'En'].some((s) => form['title' + s]?.trim() && form['body' + s]?.trim())}>{t('publish')}</Button>}>
        {form && (
          <div className="space-y-3">
            <Field label={t('eventKind')}>
              <select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map((c) => <option key={c} value={c}>{t('ann_' + c)}</option>)}
              </select>
            </Field>
            <Segmented value={formLang} onChange={setFormLang} options={['UA', 'CZ', 'EN'].map((l) => ({ value: l, label: l }))} />
            <Field label={`${t('annTitle')} (${formLang})`}>
              <input className="field" value={form['title' + suffix] ?? ''} onChange={(e) => setForm({ ...form, ['title' + suffix]: e.target.value })} />
            </Field>
            <Field label={`${t('annBody')} (${formLang})`} hint={t('annLangHint')}>
              <textarea rows={4} className="field resize-none" value={form['body' + suffix] ?? ''} onChange={(e) => setForm({ ...form, ['body' + suffix]: e.target.value })} />
            </Field>
            <label className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
              <span className="text-[14px]">{t('pinIt')}</span>
              <Toggle checked={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} />
            </label>
          </div>
        )}
      </Sheet>
    </>
  )
}

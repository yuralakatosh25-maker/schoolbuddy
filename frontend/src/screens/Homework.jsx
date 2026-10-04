import { useState } from 'react'
import { Plus, Check, LifeBuoy, Search, Pencil, Trash2, RotateCcw, ClipboardList } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { fmtDayTime, toLocalInput } from '../lib/format'
import { Badge, Button, Card, Empty, Field, IconButton, List, Loading, ScreenHeader, Segmented, Sheet, SubjectDot } from '../components/ui'
import { DifficultyDots, HomeworkRow } from '../components/items'

function defaultDeadline() {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  d.setHours(20, 0, 0, 0)
  return toLocalInput(d)
}

export default function Homework({ id: openId, newFor }) {
  const { t, lang, subjects, subjectById, topicName, toast, fail, ask } = useApp()
  const nav = useNav()
  const { data, loading, reload } = useApi('/api/homework')
  const [tab, setTab] = useState('open')
  const [detailId, setDetailId] = useState(openId ?? null)
  const detail = (data ?? []).find((h) => h.id === detailId) ?? null
  const setDetail = (h) => setDetailId(h?.id ?? null)
  const [form, setForm] = useState(() => (newFor
    ? { title: '', subjectId: newFor.subjectId, topicId: newFor.topicId ?? '', deadline: defaultDeadline(), difficulty: 2, description: '' }
    : null))

  const list = (data ?? []).filter((h) => h.status === tab)

  const openNew = () => setForm({ title: '', subjectId: subjects[0]?.id, topicId: '', deadline: defaultDeadline(), difficulty: 2, description: '' })
  const openEdit = (h) => {
    setDetail(null)
    setForm({ id: h.id, title: h.title, subjectId: h.subjectId, topicId: h.topicId ?? '', deadline: toLocalInput(h.deadline), difficulty: h.difficulty, description: h.description })
  }

  const save = async () => {
    const body = { ...form, topicId: form.topicId || null, deadline: new Date(form.deadline).toISOString() }
    try {
      if (form.id) await api.put(`/api/homework/${form.id}`, body)
      else await api.post('/api/homework', body)
      setForm(null)
      toast(t('saved'))
      reload()
    } catch (e) { fail(e) }
  }

  const toggle = async (h) => {
    try { await api.post(`/api/homework/${h.id}/toggle`); setDetail(null); reload() } catch (e) { fail(e) }
  }
  const toSos = async (h) => {
    try {
      const res = await api.post(`/api/homework/${h.id}/sos`)
      setDetail(null)
      toast(t('sosSent', { n: res.notified }))
      nav.setTab('sos')
    } catch (e) { fail(e) }
  }
  const remove = async (h) => {
    if (!(await ask({ title: t('delete'), text: h.title, danger: true, confirm: t('delete') }))) return
    try { await api.del(`/api/homework/${h.id}`); setDetail(null); reload() } catch (e) { fail(e) }
  }

  const formSubject = form ? subjectById(Number(form.subjectId)) : null

  return (
    <>
      <ScreenHeader title={t('homework')} onBack={nav.pop} backLabel={t('back')}
        right={<IconButton icon={Plus} label={t('hwNew')} onClick={openNew} />} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'open', label: `${t('hwCurrent')} · ${(data ?? []).filter((h) => h.status === 'open').length}` },
          { value: 'done', label: t('hwDone') },
        ]} />
        <div className="mt-3">
          {loading && !data ? <Loading /> : list.length === 0 ? (
            <Card><Empty icon={ClipboardList} text={t('hwEmpty')} action={tab === 'open' && <Button size="sm" icon={Plus} onClick={openNew}>{t('hwNew')}</Button>} /></Card>
          ) : (
            <List>{list.map((h) => <HomeworkRow key={h.id} hw={h} onClick={() => setDetail(h)} />)}</List>
          )}
        </div>
      </div>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title}>
        {detail && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <SubjectDot color={subjectById(detail.subjectId)?.color} />
              {pick(subjectById(detail.subjectId), 'name', lang)}
              {detail.topicId && <span>· {topicName(detail.subjectId, detail.topicId)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>{t('hwDeadline')}: {fmtDayTime(detail.deadline, lang, t)}</Badge>
              <Badge><DifficultyDots value={detail.difficulty} /> {t('diff_' + detail.difficulty)}</Badge>
            </div>
            {detail.description && <p className="mt-3 whitespace-pre-wrap text-[14px] leading-6">{detail.description}</p>}
            <div className="mt-5 grid gap-2">
              {detail.status === 'open' ? (
                <>
                  <Button variant="primary" full icon={Check} onClick={() => toggle(detail)}>{t('hwMarkDone')}</Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="sos" icon={LifeBuoy} onClick={() => toSos(detail)}>{t('hwToSos')}</Button>
                    <Button icon={Search} onClick={() => { setDetail(null); nav.push('findMentor', { subjectId: detail.subjectId }) }}>{t('hwAskMentor')}</Button>
                  </div>
                </>
              ) : <Button full icon={RotateCcw} onClick={() => toggle(detail)}>{t('hwReopen')}</Button>}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" icon={Pencil} onClick={() => openEdit(detail)}>{t('edit')}</Button>
                <Button variant="ghost" icon={Trash2} onClick={() => remove(detail)}>{t('delete')}</Button>
              </div>
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('edit') : t('hwNew')}
        footer={<Button variant="primary" full onClick={save} disabled={!form?.title?.trim()}>{t('save')}</Button>}>
        {form && (
          <div className="space-y-3">
            <Field label={t('hwTitle')}>
              <input autoFocus className="field" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('subject')}>
                <select className="field" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: Number(e.target.value), topicId: '' })}>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
                </select>
              </Field>
              <Field label={t('topic')}>
                <select className="field" value={form.topicId} onChange={(e) => setForm({ ...form, topicId: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {formSubject?.topics.map((tp) => <option key={tp.id} value={tp.id}>{pick(tp, 'name', lang)}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t('hwDeadline')}>
              <input type="datetime-local" className="field" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] text-muted">{t('hwDifficulty')}</span>
              <Segmented value={form.difficulty} onChange={(v) => setForm({ ...form, difficulty: v })} options={[1, 2, 3].map((d) => ({ value: d, label: t('diff_' + d) }))} />
            </div>
            <Field label={t('hwProblem')}>
              <textarea rows={3} className="field resize-none" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </>
  )
}

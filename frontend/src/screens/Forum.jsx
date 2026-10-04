import { useState } from 'react'
import { Plus, MessageSquare, Fingerprint, SendHorizontal, Flag, Trash2 } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { fmtRelative } from '../lib/format'
import { Badge, Button, Card, Chip, Empty, Field, IconButton, Loading, ScreenHeader, Section, Segmented, Sheet, cx } from '../components/ui'

const CATS = ['school', 'teachers', 'city', 'other']

// Ідентикон з хешу: однаковий псевдонім → однакова позначка
function Alias({ name, op, mine }) {
  const { t } = useApp()
  const hue = parseInt(name.slice(5, 8), 16) % 360
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]">
      <span className="grid size-5 place-items-center rounded-md" style={{ background: `hsl(${hue} 18% var(--avatar-bg))`, color: `hsl(${hue} 45% var(--avatar-fg))` }}>
        <Fingerprint className="size-3" />
      </span>
      <span className="font-mono text-muted">{name}</span>
      {op && <Badge tone="info">{t('op')}</Badge>}
      {mine && <Badge>{t('yourPost')}</Badge>}
    </span>
  )
}

export function Forum() {
  const { t, lang, fail } = useApp()
  const nav = useNav()
  const [cat, setCat] = useState('')
  const { data, loading, reload } = useApi(`/api/forum${cat ? `?category=${cat}` : ''}`)
  const [form, setForm] = useState(null)

  const submit = async () => {
    try {
      const res = await api.post('/api/forum', form)
      setForm(null)
      reload()
      nav.push('post', { id: res.id })
    } catch (e) { fail(e) }
  }

  return (
    <>
      <ScreenHeader title={t('forum')} onBack={nav.pop} backLabel={t('back')}
        right={<IconButton icon={Plus} label={t('askQuestion')} onClick={() => setForm({ title: '', content: '', category: cat || 'school' })} />} />
      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-4 py-3">
        <Chip active={!cat} onClick={() => setCat('')}>{t('all')}</Chip>
        {CATS.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{t('fc_' + c)}</Chip>)}
      </div>
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <p className="mb-3 flex items-start gap-2 px-1 text-[12.5px] leading-5 text-faint"><Fingerprint className="mt-0.5 size-3.5 shrink-0" />{t('forumLead')}</p>
        {loading && !data ? <Loading /> : !data?.length ? <Empty icon={MessageSquare} text={t('noData')} /> : (
          <div className="space-y-2">
            {data.map((p) => (
              <button key={p.id} type="button" onClick={() => nav.push('post', { id: p.id })}
                className="block w-full rounded-2xl border border-line bg-card p-4 text-left transition hover:border-line-strong">
                <div className="flex items-center justify-between gap-2">
                  <Alias name={p.author} mine={p.mine} />
                  <span className="text-[12px] text-faint">{fmtRelative(p.createdAt, lang, t)}</span>
                </div>
                <div className="mt-2 text-[15.5px] leading-6">{p.title}</div>
                {p.content && <div className="mt-1 line-clamp-2 text-[13.5px] leading-5 text-muted">{p.content}</div>}
                <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-muted">
                  <Badge>{t('fc_' + p.category)}</Badge>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" />{t('repliesN', { n: p.replies })}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Sheet open={!!form} onClose={() => setForm(null)} title={t('askQuestion')}
        footer={<Button variant="primary" full onClick={submit} disabled={!form || form.title.trim().length < 5}>{t('send')}</Button>}>
        {form && (
          <div className="space-y-3">
            <Segmented value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATS.map((c) => ({ value: c, label: t('fc_' + c) }))} />
            <Field label={t('postTitle')}><input autoFocus className="field" maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label={t('postContent')} hint={t('forumLead')}>
              <textarea rows={5} className="field resize-none" maxLength={3000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </>
  )
}

export function ForumPost({ id }) {
  const { t, lang, me, fail, toast, ask } = useApp()
  const nav = useNav()
  const { data: p, loading, reload } = useApi(`/api/forum/${id}`)
  const [text, setText] = useState('')

  const reply = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    try { await api.post(`/api/forum/${id}/replies`, { content: text }); setText(''); reload() } catch (err) { fail(err) }
  }
  const report = async (targetType, targetId) => {
    const reason = await ask({ title: t('report'), input: t('reportReason'), multiline: true, confirm: t('send') })
    if (!reason) return
    try { await api.post('/api/reports', { targetType, targetId, reason }); toast(t('reportSent')) } catch (err) { fail(err) }
  }
  const remove = async () => {
    if (!(await ask({ title: t('delete'), danger: true, confirm: t('delete') }))) return
    try { await api.del(`/api/forum/${id}`); nav.pop() } catch (err) { fail(err) }
  }

  return (
    <>
      <ScreenHeader title={t('forum')} onBack={nav.pop} backLabel={t('back')}
        right={p && (p.mine || me.role === 'admin')
          ? <IconButton icon={Trash2} label={t('delete')} onClick={remove} />
          : p && <IconButton icon={Flag} label={t('report')} onClick={() => report('post', p.id)} />} />
      <div className="scroll-area flex-1 px-4 pb-6 pt-3">
        {loading && !p ? <Loading /> : p && (
          <>
            <Card className="p-4">
              <div className="flex items-center justify-between"><Alias name={p.author} mine={p.mine} /><Badge>{t('fc_' + p.category)}</Badge></div>
              <h1 className="mt-3 text-[19px] font-semibold leading-7 tracking-tight">{p.title}</h1>
              {p.content && <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-6 text-muted">{p.content}</p>}
              <div className="mt-3 text-[12px] text-faint">{fmtRelative(p.createdAt, lang, t)}</div>
            </Card>
            <Section title={`${t('replies')} · ${p.replies.length}`}>
              <div className="space-y-2">
                {p.replies.map((r) => (
                  <div key={r.id} className={cx('rounded-2xl border p-3.5', r.op ? 'border-info/25 bg-info/5' : 'border-line bg-card')}>
                    <div className="flex items-center justify-between">
                      <Alias name={r.author} op={r.op} mine={r.mine} />
                      <div className="flex items-center gap-2">
                        <span className="text-[11.5px] text-faint">{fmtRelative(r.createdAt, lang, t)}</span>
                        {!r.mine && <button type="button" onClick={() => report('reply', r.id)} className="text-faint hover:text-warn" aria-label={t('report')}><Flag className="size-3.5" /></button>}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6">{r.content}</p>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
      <form onSubmit={reply} className="flex items-end gap-2 border-t border-line px-3 py-2.5 pb-safe">
        <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('reply')} className="field max-h-28 min-h-10 resize-none rounded-[20px] py-2.5" />
        <button type="submit" disabled={!text.trim()} aria-label={t('send')} className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
          <SendHorizontal className="size-[18px]" />
        </button>
      </form>
    </>
  )
}

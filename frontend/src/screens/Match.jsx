import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, X, Clock3, SearchX } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { pick } from '../lib/i18n'
import { Badge, Button, Chip, Empty, List, PageTitle, ScreenHeader, Section, Segmented, Skeleton, cx } from '../components/ui'
import { PersonRow } from '../components/items'
import Swipe from './Swipe'

const CATEGORIES = ['it', 'games', 'sport', 'hobby', 'study']

// Вкладка «Пошук»: перемикач між каталогом людей і свайпами (seznamka)
export default function Match(props) {
  const { t } = useApp()
  const [mode, setMode] = useState('people')
  if (props.pushed) return <People {...props} />
  return (
    <div className="px-4 pb-8">
      <PageTitle sub={mode === 'people' ? t('interestsLead') : undefined}>{mode === 'people' ? t('interests') : t('tabSwipe')}</PageTitle>
      <Segmented className="mt-4" value={mode} onChange={setMode} options={[
        { value: 'people', label: t('tabPeople') },
        { value: 'swipe', label: t('tabSwipe') },
      ]} />
      {mode === 'swipe' ? <Swipe /> : <People embedded />}
    </div>
  )
}

function People({ pushed, embedded, subjectId: initialSubject }) {
  const { t, me, setMe, lang, subjects, fail, errText, toast } = useApp()
  const nav = useNav()
  const { data: allTags, setData: setAllTags } = useApi('/api/tags')
  const [selected, setSelected] = useState(() => new Set(me.tags.map((x) => x.id)))
  const [role, setRole] = useState(me.role === 'mentor' ? 'student' : 'mentor')
  const [subjectId, setSubjectId] = useState(initialSubject ?? '')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState('')
  const [version, setVersion] = useState(0)
  const saveTimer = useRef(null)

  useEffect(() => {
    const id = setTimeout(() => setQuery(q), 250)
    return () => clearTimeout(id)
  }, [q])

  const path = `/api/users/match?role=${role}${subjectId ? `&subjectId=${subjectId}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}&v=${version}`
  const { data: people, loading } = useApi(path)

  const toggle = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const tags = await api.put('/api/me/tags', { tagIds: [...next] })
        setMe((m) => ({ ...m, tags }))
        setVersion((v) => v + 1)
      } catch (e) { fail(e) }
    }, 500)
  }

  const addCustom = async (e) => {
    e.preventDefault()
    if (!custom.trim()) return
    setCustomError('')
    try {
      const tag = await api.post('/api/tags', { name: custom, category: 'hobby' })
      setAllTags((list) => (list?.some((x) => x.id === tag.id) ? list : [...(list ?? []), tag]))
      setSelected((s) => new Set([...s, tag.id]))
      setMe((m) => ({ ...m, tags: [...m.tags.filter((x) => x.id !== tag.id), tag] }))
      setCustom('')
      setVersion((v) => v + 1)
      toast(t('tagAdded'))
    } catch (err) {
      setCustomError(errText(err))
    }
  }

  const grouped = useMemo(() => {
    const g = {}
    for (const tag of allTags ?? []) (g[tag.category] ??= []).push(tag)
    return g
  }, [allTags])

  const content = (
    <div className={embedded ? '' : 'px-4 pb-8'}>
      <div className={cx('relative', pushed ? 'mt-3' : 'mt-4')}>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPeople')} className="field pl-9" />
        {q && <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"><X className="size-4" /></button>}
      </div>

      <div className={cx('relative mt-4 overflow-hidden', !expanded && 'max-h-[218px]')}>
        {CATEGORIES.filter((c) => grouped[c]).map((c) => (
          <div key={c} className="mb-3">
            <div className="mb-1.5 text-[12px] text-faint">{t('cat_' + c)}</div>
            <div className="flex flex-wrap gap-1.5">
              {grouped[c].map((tag) => (
                <Chip key={tag.id} active={selected.has(tag.id)} onClick={() => toggle(tag.id)}>{tag.name}</Chip>
              ))}
            </div>
          </div>
        ))}
        {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      <button type="button" onClick={() => setExpanded(!expanded)} className="text-[13px] text-muted hover:text-ink">
        {expanded ? t('close') : `${t('more')} · ${(allTags ?? []).length}`}
      </button>

      <form onSubmit={addCustom} className="mt-3 flex gap-2">
        <input value={custom} onChange={(e) => { setCustom(e.target.value); setCustomError('') }} maxLength={24}
          placeholder={`${t('addTag')}: ${t('addTagPlaceholder')}`} className="field h-10 py-0" />
        <Button type="submit" icon={Plus} disabled={!custom.trim()} className="shrink-0">{t('create')}</Button>
      </form>
      {customError && <p className="mt-1.5 text-[12.5px] text-danger">{customError}</p>}

      <Section title={t('matches')}>
        <Segmented value={role} onChange={setRole} options={[
          { value: 'mentor', label: t('filterMentors') },
          { value: 'student', label: t('filterStudents') },
          { value: 'all', label: t('filterAll') },
        ]} />
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')} className="field mt-2 h-10 py-0 text-[14px]">
          <option value="">{t('anySubject')}</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{pick(s, 'name', lang)}</option>)}
        </select>

        {selected.size === 0 && <p className="mt-3 text-[12.5px] text-faint">{t('pickTagsFirst')}</p>}

        <div className="mt-3">
          {loading && !people ? (
            <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : !people?.length ? (
            <Empty icon={SearchX} text={t('noMatches')} />
          ) : (
            <List>
              {people.map((p) => (
                <div key={p.user.id}>
                  <PersonRow person={p.user} match={selected.size ? p.match : null} onClick={() => nav.push('user', { id: p.user.id })} />
                  {(p.sharedTags.length > 0 || p.inOffice || p.helpSubjects.length > 0) && (
                    <div className="-mt-1.5 flex flex-wrap gap-1 pb-3 pl-[70px] pr-4">
                      {p.inOffice && <Badge tone="ok" icon={Clock3}>{t('inOffice')}</Badge>}
                      {p.sharedTags.map((s) => <Badge key={s} tone="accent">{s}</Badge>)}
                      {p.helpSubjects.slice(0, 3).map((id) => {
                        const s = subjects.find((x) => x.id === id)
                        return s ? <Badge key={id}>{pick(s, 'name', lang)}</Badge> : null
                      })}
                    </div>
                  )}
                </div>
              ))}
            </List>
          )}
        </div>
      </Section>
    </div>
  )

  if (embedded) return content
  return (
    <>
      <ScreenHeader title={t('qaFindMentor')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1">{content}</div>
    </>
  )
}

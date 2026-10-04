import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search, LifeBuoy, ClipboardPlus, CalendarRange, ClipboardList, Repeat, Clock, DoorOpen, UserRound } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { pick } from '../lib/i18n'
import { fmtDate, fmtDay, fmtWeekday, isoDate, parseLocalDate } from '../lib/format'
import { Badge, Button, Card, Empty, List, Loading, Row, ScreenHeader, Segmented, Sheet, SubjectDot, cx } from '../components/ui'
import { ExamRow, LessonRow } from '../components/items'

// Дії з предметом/темою: знайти ментора, SOS, домашка
function SubjectActions({ subjectId, topicId, kind = 'question', onDone }) {
  const { t } = useApp()
  const nav = useNav()
  const go = (screen, params) => { onDone?.(); nav.push(screen, params) }
  return (
    <div className="grid gap-2">
      <Button icon={Search} full onClick={() => go('findMentor', { subjectId })}>{t('findMentorFor')}</Button>
      <Button icon={LifeBuoy} variant="sos" full onClick={() => go('sosNew', { subjectId, topicId, kind })}>{t('sosFor')}</Button>
      <Button icon={ClipboardPlus} full onClick={() => go('homework', { newFor: { subjectId, topicId } })}>{t('createHomework')}</Button>
    </div>
  )
}

export function Schedule({ view: initialView = 'week' }) {
  const { t, lang, me, subjectById, topicName } = useApp()
  const nav = useNav()
  const [view, setView] = useState(initialView)
  const [offset, setOffset] = useState(0)
  const week = useApi(`/api/schedule/week?offset=${offset}`)
  const exams = useApi('/api/schedule/exams')
  const changes = useApi('/api/schedule/changes')
  const todayIso = isoDate()
  const [day, setDay] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [exam, setExam] = useState(null)

  const days = week.data?.days ?? []
  const defaultDay = days.find((d) => d.date === todayIso)?.date ?? days.find((d) => d.date > todayIso)?.date ?? days[0]?.date
  const selected = days.find((d) => d.date === day) ?? days.find((d) => d.date === defaultDay)

  return (
    <>
      <ScreenHeader title={t('schedule')} subtitle={me.class ?? undefined} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <Segmented value={view} onChange={setView} options={[
          { value: 'week', label: t('week') },
          { value: 'exams', label: t('examsTitle') },
          { value: 'changes', label: t('changes') },
        ]} />

        {!me.class && <Card className="mt-4"><Empty icon={CalendarRange} text={t('noClass')} action={<Button size="sm" onClick={() => nav.push('editProfile')}>{t('editProfile')}</Button>} /></Card>}

        {me.class && view === 'week' && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={() => { setOffset(offset - 1); setDay(null) }} className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => { setOffset(0); setDay(null) }} className="text-[14px]">
                {offset === 0 ? t('thisWeek') : days.length ? `${fmtDate(parseLocalDate(days[0].date), lang)} – ${fmtDate(parseLocalDate(days[days.length - 1].date), lang)}` : ''}
              </button>
              <button type="button" onClick={() => { setOffset(offset + 1); setDay(null) }} className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"><ChevronRight className="size-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {days.map((d) => {
                const date = parseLocalDate(d.date)
                const active = selected?.date === d.date
                const hasChange = d.lessons.some((l) => l.status !== 'normal')
                return (
                  <button key={d.date} type="button" onClick={() => setDay(d.date)}
                    className={cx('relative flex flex-col items-center rounded-xl border py-2 transition',
                      active ? 'border-accent/40 bg-accent/10' : 'border-line bg-card hover:border-line-strong')}>
                    <span className={cx('text-[11.5px] capitalize', active ? 'text-accent' : 'text-muted')}>{fmtWeekday(date, lang)}</span>
                    <span className={cx('text-[17px] font-semibold tabular', d.date === todayIso && !active && 'text-accent')}>{date.getDate()}</span>
                    {hasChange && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warn" />}
                  </button>
                )
              })}
            </div>
            <div className="mt-3">
              {week.loading && !week.data ? <Loading /> : !selected?.lessons.length ? (
                <Card><Empty icon={CalendarRange} text={t('noLessons')} /></Card>
              ) : (
                <List>
                  {selected.lessons.map((l) => <LessonRow key={l.id} lesson={l} isToday={selected.date === todayIso} onClick={() => setLesson({ ...l, date: selected.date })} />)}
                </List>
              )}
            </div>
          </>
        )}

        {me.class && view === 'exams' && (
          <div className="mt-4">
            {exams.loading && !exams.data ? <Loading /> : !exams.data?.length ? <Card><Empty icon={ClipboardList} text={t('noData')} /></Card> : (
              <List>{exams.data.map((e) => <ExamRow key={e.id} exam={e} onClick={() => setExam(e)} />)}</List>
            )}
          </div>
        )}

        {me.class && view === 'changes' && (
          <div className="mt-4">
            {changes.loading && !changes.data ? <Loading /> : !changes.data?.length ? <Card><Empty icon={Repeat} text={t('noData')} /></Card> : (
              <List>
                {changes.data.map((c) => {
                  const s = subjectById(c.lesson?.subjectId)
                  return (
                    <Row key={c.id} chevron={false}
                      left={<SubjectDot color={s?.color} className="size-2.5" />}
                      title={`${pick(s, 'name', lang)} · ${c.lesson?.start ?? ''}`}
                      subtitle={[fmtDay(parseLocalDate(c.date), lang, t), c.newRoom && `${t('room')}: ${c.newRoom}`, c.newTeacher, c.note].filter(Boolean).join(' · ')}
                      right={<Badge tone={c.kind === 'cancelled' ? 'danger' : 'warn'}>{t('change_' + c.kind)}</Badge>} />
                  )
                })}
              </List>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!lesson} onClose={() => setLesson(null)} title={lesson ? pick(subjectById(lesson.subjectId), 'name', lang) : ''}>
        {lesson && (
          <>
            <List className="mb-4">
              <Row left={<Clock className="size-4 text-muted" />} title={`${lesson.start} – ${lesson.end}`} subtitle={`${fmtDay(parseLocalDate(lesson.date), lang, t)} · ${t('lessonN', { n: lesson.period })}`} chevron={false} />
              <Row left={<DoorOpen className="size-4 text-muted" />} title={lesson.newRoom || lesson.room} subtitle={lesson.newRoom ? `${t('change_room')} (${lesson.room})` : t('room')} chevron={false} />
              <Row left={<UserRound className="size-4 text-muted" />} title={lesson.newTeacher || lesson.teacher} subtitle={lesson.newTeacher ? t('change_substitute') : t('teacher')} chevron={false} />
              {lesson.status !== 'normal' && (
                <Row left={<Repeat className="size-4 text-warn" />} title={t('change_' + lesson.status)} subtitle={lesson.note || undefined} chevron={false} />
              )}
            </List>
            <SubjectActions subjectId={lesson.subjectId} onDone={() => setLesson(null)} />
          </>
        )}
      </Sheet>

      <Sheet open={!!exam} onClose={() => setExam(null)} title={exam ? `${t('exam_' + exam.kind)} · ${pick(subjectById(exam.subjectId), 'name', lang)}` : ''}>
        {exam && (
          <>
            <p className="mb-4 text-[14px] text-muted">
              {exam.topicId ? topicName(exam.subjectId, exam.topicId) + ' · ' : ''}{fmtDay(exam.date, lang, t)}
            </p>
            <SubjectActions subjectId={exam.subjectId} topicId={exam.topicId} kind="test" onDone={() => setExam(null)} />
          </>
        )}
      </Sheet>
    </>
  )
}

export function Subjects() {
  const { t, lang, subjects } = useApp()
  const nav = useNav()
  const [open, setOpen] = useState(null)
  const [topic, setTopic] = useState(null)
  return (
    <>
      <ScreenHeader title={t('subjects')} onBack={nav.pop} backLabel={t('back')} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        <List>
          {subjects.map((s) => (
            <div key={s.id}>
              <Row onClick={() => setOpen(open === s.id ? null : s.id)} chevron={false}
                left={<span className="grid size-9 place-items-center rounded-xl" style={{ background: s.color + '1f' }}><SubjectDot color={s.color} className="size-2.5" /></span>}
                title={pick(s, 'name', lang)} subtitle={`${s.topics.length} · ${t('topics').toLowerCase()}`}
                right={<ChevronRight className={cx('size-4 text-faint transition', open === s.id && 'rotate-90')} />} />
              {open === s.id && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-4 pl-16">
                  {s.topics.map((tp) => (
                    <button key={tp.id} type="button" onClick={() => setTopic({ subject: s, topic: tp })}
                      className="h-8 rounded-full border border-line px-3 text-[13px] text-muted transition hover:border-line-strong hover:text-ink">
                      {pick(tp, 'name', lang)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </List>
      </div>
      <Sheet open={!!topic} onClose={() => setTopic(null)} title={topic ? `${pick(topic.subject, 'name', lang)} · ${pick(topic.topic, 'name', lang)}` : ''}>
        <p className="mb-4 text-[13.5px] text-muted">{t('topicActions')}</p>
        {topic && <SubjectActions subjectId={topic.subject.id} topicId={topic.topic.id} onDone={() => setTopic(null)} />}
      </Sheet>
    </>
  )
}

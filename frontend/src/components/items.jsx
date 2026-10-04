import { MapPin, Clock, CircleDot } from 'lucide-react'
import { useApp } from '../app/context'
import { pick } from '../lib/i18n'
import { fmtDay, fmtDayTime, fmtRelative, fmtTime, nowHm } from '../lib/format'
import { describeNotification } from '../lib/notifications'
import { Avatar, AvailabilityDot, Badge, Row, SubjectDot, VerifiedMark, cx } from './ui'

export function LessonRow({ lesson, isToday, onClick }) {
  const { t, subjectById, lang } = useApp()
  const s = subjectById(lesson.subjectId)
  const hm = nowHm()
  const current = isToday && lesson.start <= hm && lesson.end > hm
  const past = isToday && lesson.end <= hm
  const cancelled = lesson.status === 'cancelled'
  const room = lesson.newRoom || lesson.room
  const teacher = lesson.newTeacher || lesson.teacher
  return (
    <button type="button" onClick={onClick}
      className={cx('relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-raised/60', past && 'opacity-50')}>
      {current && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" />}
      <div className="w-11 shrink-0 font-mono text-[12.5px] leading-4 text-muted tabular">
        <div className={cx(current && 'text-ink')}>{lesson.start}</div>
        <div className="text-faint">{lesson.end}</div>
      </div>
      <SubjectDot color={s?.color} />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-[14.5px]', cancelled && 'text-muted line-through')}>{pick(s, 'name', lang)}</div>
        <div className="truncate text-[12.5px] text-muted">
          <span className={cx(lesson.status === 'room' && 'text-warn')}>{room}</span> · <span className={cx(lesson.status === 'substitute' && 'text-warn')}>{teacher}</span>
        </div>
      </div>
      {current && <Badge tone="accent">{t('nowLabel')}</Badge>}
      {lesson.status !== 'normal' && <Badge tone={cancelled ? 'danger' : 'warn'}>{t('change_' + lesson.status)}</Badge>}
    </button>
  )
}

export function ExamRow({ exam, onClick }) {
  const { t, lang, subjectById, topicName } = useApp()
  const s = subjectById(exam.subjectId)
  const days = Math.round((new Date(exam.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return (
    <Row onClick={onClick} chevron={false}
      left={<SubjectDot color={s?.color} className="size-2.5" />}
      title={<span>{pick(s, 'name', lang)}{exam.topicId ? <span className="text-muted"> · {topicName(exam.subjectId, exam.topicId)}</span> : null}</span>}
      subtitle={`${t('exam_' + exam.kind)} · ${fmtDayTime(exam.date, lang, t)}`}
      right={<Badge tone={days <= 2 ? 'warn' : 'neutral'}>{days <= 1 ? fmtDay(exam.date, lang, t) : t('inDays', { n: days })}</Badge>} />
  )
}

export function DifficultyDots({ value }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[1, 2, 3].map((i) => <span key={i} className={cx('size-1.5 rounded-full', i <= value ? (value === 3 ? 'bg-danger' : value === 2 ? 'bg-warn' : 'bg-ok') : 'bg-line-strong')} />)}
    </span>
  )
}

export function HomeworkRow({ hw, onClick, right }) {
  const { t, lang, subjectById } = useApp()
  const s = subjectById(hw.subjectId)
  const msLeft = new Date(hw.deadline) - new Date()
  const overdue = hw.status !== 'done' && msLeft < 0
  const soon = !overdue && msLeft < 86400000 * 1.2
  return (
    <Row onClick={onClick}
      left={<SubjectDot color={s?.color} className="size-2.5" />}
      title={<span className={cx(hw.status === 'done' && 'text-muted line-through')}>{hw.title}</span>}
      subtitle={<span className="inline-flex items-center gap-2">{pick(s, 'name', lang)} <DifficultyDots value={hw.difficulty} /></span>}
      right={right ?? (hw.status === 'done' ? null : (
        <Badge tone={overdue ? 'danger' : soon ? 'warn' : 'neutral'}>{overdue ? t('hwOverdue') : fmtDay(hw.deadline, lang, t)}</Badge>
      ))} chevron={false} />
  )
}

export function MeetingRow({ meeting, onClick }) {
  const { t, lang } = useApp()
  const place = typeof meeting.place === 'string' ? meeting.place : meeting.place?.name
  return (
    <Row onClick={onClick}
      left={<Avatar user={meeting.with} size={38} />}
      title={meeting.with?.nickname}
      subtitle={
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{fmtDayTime(meeting.scheduledAt, lang, t)}</span>
          {place && <span className="inline-flex min-w-0 items-center gap-1 truncate"><MapPin className="size-3 shrink-0" />{place}</span>}
        </span>
      } />
  )
}

export function PersonRow({ person, match, subtitle, right, onClick, chevron }) {
  const { t } = useApp()
  return (
    <Row onClick={onClick} chevron={chevron}
      left={<Avatar user={person} size={42} />}
      title={<span className="inline-flex max-w-full items-center gap-1.5"><span className="truncate">{person.nickname}</span><VerifiedMark user={person} /></span>}
      subtitle={subtitle ?? (
        <span className="inline-flex items-center gap-1.5">
          {person.role === 'mentor' && <AvailabilityDot value={person.availability} />}
          {t(person.role)}{person.class ? ` · ${person.class}` : ''}
        </span>
      )}
      right={right ?? (match != null ? <MatchScore value={match} /> : null)} />
  )
}

export function MatchScore({ value }) {
  const { t } = useApp()
  return (
    <div className="shrink-0 text-right">
      <div className={cx('text-[16px] font-semibold leading-5 tabular', value >= 60 ? 'text-accent' : value >= 30 ? 'text-ink' : 'text-muted')}>{value}%</div>
      <div className="text-[11px] text-faint">{t('match')}</div>
    </div>
  )
}

export function NotificationRow({ n, onClick }) {
  const { t, lang, subjectName } = useApp()
  const { title, body, icon: Icon } = describeNotification(n, { t, lang, subjectName })
  return (
    <Row onClick={onClick} chevron={false}
      left={<span className={cx('grid size-9 shrink-0 place-items-center rounded-full', n.isRead ? 'bg-raised text-muted' : 'bg-accent/12 text-accent')}><Icon className="size-4" /></span>}
      title={<span className={cx(!n.isRead && 'font-medium')}>{title}</span>}
      subtitle={body || undefined}
      right={<div className="flex shrink-0 flex-col items-end gap-1"><span className="text-[11.5px] text-faint">{fmtRelative(n.createdAt, lang, t)}</span>{!n.isRead && <CircleDot className="size-2.5 text-accent" />}</div>} />
  )
}

export function TimeChip({ at }) {
  const { lang } = useApp()
  return <span className="font-mono text-[12.5px] tabular text-muted">{fmtTime(at, lang)}</span>
}

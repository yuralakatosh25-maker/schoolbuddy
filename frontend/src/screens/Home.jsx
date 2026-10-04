import {
  Search, LifeBuoy, ClipboardList, MessagesSquare, CalendarDays, Flame, CalendarRange, Library,
  Users, MessageSquareQuote, Map as MapIcon, Megaphone, ChevronRight, ShieldHalf, Clock3,
} from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { pick } from '../lib/i18n'
import { fmtDay, fmtRelative, parseLocalDate } from '../lib/format'
import { Avatar, Badge, Card, Empty, List, Section, Skeleton, VerifiedMark, cx } from '../components/ui'
import { ExamRow, HomeworkRow, LessonRow, MeetingRow, NotificationRow } from '../components/items'
import { WaveBand } from '../components/Waves'

export default function Home() {
  const { t, me, lang } = useApp()
  const nav = useNav()
  const { data, loading } = useApi('/api/me/dashboard')

  const quick = [
    { icon: Search, label: t('qaFindMentor'), on: () => nav.setTab('match') },
    { icon: LifeBuoy, label: t('qaSos'), on: () => nav.setTab('sos'), sos: true },
    { icon: ClipboardList, label: t('qaHomework'), on: () => nav.push('homework') },
    { icon: MessagesSquare, label: t('qaChat'), on: () => nav.push('chats') },
    { icon: CalendarDays, label: t('qaEvents'), on: () => nav.push('events') },
  ]
  const more = [
    { icon: CalendarRange, label: t('qaSchedule'), on: () => nav.push('schedule') },
    { icon: Library, label: t('qaSubjects'), on: () => nav.push('subjects') },
    { icon: Users, label: t('qaGroups'), on: () => nav.push('groups') },
    { icon: MessageSquareQuote, label: t('qaForum'), on: () => nav.push('forum') },
    { icon: MapIcon, label: t('qaMap'), on: () => nav.push('map') },
    { icon: Megaphone, label: t('qaNews'), on: () => nav.push('announcements') },
  ]

  const firstName = me.nickname.split(' ')[0]

  return (
    <div className="px-4 pb-8">
      <WaveBand className="-mx-4" contentClassName="px-4 pb-6 pt-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => nav.setTab('profile')} className="rounded-full ring-2 ring-on-wave/20"><Avatar user={me} size={52} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[25px] font-semibold leading-8 tracking-wide">{t('hello', { name: firstName })}</h1>
            <p className="flex items-center gap-1.5 text-[13px] text-on-wave-muted">
              {t(me.role)}{me.class ? ` · ${me.class}` : ''}<VerifiedMark user={me} className="size-3.5 text-on-wave" />
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-on-wave/10 py-1.5 pl-2 pr-3" title={t('streakDays', { n: me.streak })}>
            <Flame className={cx('size-4', me.streak > 0 ? 'text-warn' : 'text-on-wave-muted')} />
            <span className="text-[14px] font-semibold tabular">{me.streak}</span>
          </div>
        </div>
      </WaveBand>

      <div className="relative -mt-10 grid grid-cols-5 gap-2">
        {quick.map(({ icon: Icon, label, on, sos }) => (
          <button key={label} type="button" onClick={on}
            className={cx('flex min-h-[74px] flex-col items-center justify-start gap-1.5 rounded-2xl border pb-2 pt-3 transition active:scale-[0.97]',
              sos ? 'card-shadow border-danger/30 bg-card text-danger hover:border-danger/60' : 'card-shadow border-line bg-card hover:border-line-strong')}>
            <Icon className="size-5" strokeWidth={1.8} />
            <span className={cx('line-clamp-2 w-full px-1 text-center text-[11px] leading-[13px]', sos ? 'text-danger' : 'text-muted')}>{label}</span>
          </button>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
        {more.map(({ icon: Icon, label, on }) => (
          <button key={label} type="button" onClick={on}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[13px] text-muted transition hover:border-line-strong hover:text-ink">
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {me.role === 'mentor' && !me.verified && (
        <Card className="mt-4 flex items-start gap-3 border-warn/25 bg-warn/6 p-3.5 text-[13px] leading-5">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-warn" />{t('mentorNeedsApproval')}
        </Card>
      )}

      {data && me.role === 'mentor' && data.sosOpen > 0 && (
        <button type="button" onClick={() => nav.setTab('sos')}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-danger/25 bg-danger/8 p-3.5 text-left transition hover:bg-danger/12">
          <span className="grid size-9 place-items-center rounded-xl bg-danger text-white"><LifeBuoy className="size-[18px]" /></span>
          <span className="flex-1 text-[14px]">{t('sosQueueCard', { n: data.sosOpen })}</span>
          <ChevronRight className="size-4 text-muted" />
        </button>
      )}
      {data && me.role === 'student' && data.sosOpen > 0 && (
        <button type="button" onClick={() => nav.setTab('sos')}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left hover:border-line-strong">
          <LifeBuoy className="size-5 text-danger" />
          <span className="flex-1 text-[14px]">{t('mySosCard', { n: data.sosOpen })}</span>
          <ChevronRight className="size-4 text-muted" />
        </button>
      )}
      {me.role === 'admin' && (
        <button type="button" onClick={() => nav.setTab('admin')}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-left hover:border-line-strong">
          <ShieldHalf className="size-5 text-accent" />
          <span className="flex-1 text-[14px]">{t('openAdmin')}</span>
          <ChevronRight className="size-4 text-muted" />
        </button>
      )}

      {loading && !data ? (
        <div className="mt-6 space-y-3"><Skeleton className="h-40" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : data && (
        <>
          {me.role !== 'admin' && <Section
            title={data.lessonsIsToday ? t('todaySchedule') : t('scheduleFor', { day: fmtDay(parseLocalDate(data.lessonsDate), lang, t).toLowerCase() })}
            action={t('seeAll')} onAction={() => nav.push('schedule')}>
            {!me.class ? (
              <Card><Empty icon={CalendarRange} text={t('noClass')} /></Card>
            ) : data.lessons.length === 0 ? (
              <Card><Empty icon={CalendarRange} text={t('noLessons')} /></Card>
            ) : (
              <List>
                {data.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} isToday={data.lessonsIsToday} onClick={() => nav.push('schedule', { lessonId: l.id })} />
                ))}
              </List>
            )}
          </Section>}

          {data.exams.length > 0 && (
            <Section title={t('upcomingExams')} action={t('seeAll')} onAction={() => nav.push('schedule', { view: 'exams' })}>
              <List>{data.exams.map((e) => <ExamRow key={e.id} exam={e} onClick={() => nav.push('schedule', { view: 'exams' })} />)}</List>
            </Section>
          )}

          {data.meetings.length > 0 && (
            <Section title={t('plannedMeetings')} action={t('seeAll')} onAction={() => nav.push('meetings')}>
              <List>{data.meetings.map((m) => <MeetingRow key={m.id} meeting={m} onClick={() => nav.push('meeting', { id: m.id })} />)}</List>
            </Section>
          )}

          {me.role !== 'admin' && (
            <Section title={t('activeHomework')} action={t('seeAll')} onAction={() => nav.push('homework')}>
              {data.homework.length === 0
                ? <Card><Empty icon={ClipboardList} text={t('hwEmpty')} /></Card>
                : <List>{data.homework.map((h) => <HomeworkRow key={h.id} hw={h} onClick={() => nav.push('homework', { id: h.id })} />)}</List>}
            </Section>
          )}

          {data.mentors.length > 0 && me.role === 'student' && (
            <Section title={t('availableMentors')} action={t('seeAll')} onAction={() => nav.setTab('match')}>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {data.mentors.map(({ user, match }) => (
                  <button key={user.id} type="button" onClick={() => nav.push('user', { id: user.id })}
                    className="flex w-[118px] shrink-0 flex-col items-center rounded-2xl border border-line bg-card px-2 py-3 transition hover:border-line-strong">
                    <Avatar user={user} size={44} />
                    <span className="mt-2 w-full truncate text-center text-[13px]">{user.nickname}</span>
                    <span className="mt-0.5 text-[12px] text-muted tabular">{match}% {t('match')}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {data.announcements.length > 0 && (
            <Section title={t('schoolNews')} action={t('seeAll')} onAction={() => nav.push('announcements')}>
              <List>
                {data.announcements.map((a) => (
                  <button key={a.id} type="button" onClick={() => nav.push('announcements')} className="block w-full px-4 py-3 text-left hover:bg-raised/60">
                    <div className="flex items-center gap-2">
                      <Badge tone={a.category === 'urgent' ? 'danger' : a.pinned ? 'accent' : 'neutral'}>{t('ann_' + a.category)}</Badge>
                      <span className="text-[12px] text-faint">{fmtRelative(a.createdAt, lang, t)}</span>
                    </div>
                    <div className="mt-1.5 text-[14.5px] leading-5">{pick(a, 'title', lang)}</div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted">{pick(a, 'body', lang)}</div>
                  </button>
                ))}
              </List>
            </Section>
          )}

          {data.notifications.length > 0 && (
            <Section title={t('latestNotifications')} action={t('seeAll')} onAction={() => nav.push('notifications')}>
              <List>{data.notifications.map((n) => <NotificationRow key={n.id} n={n} onClick={() => nav.openLink(n.link)} />)}</List>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

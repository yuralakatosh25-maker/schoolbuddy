import {
  LifeBuoy, MessageCircle, UserPlus, Link2, Archive, CalendarClock, CalendarCheck, CalendarX, BookOpen,
  ClipboardList, PartyPopper, Megaphone, Award, Gift, Coins, ShieldCheck, Bell, Repeat, Heart,
} from 'lucide-react'
import { pick } from './i18n'
import { fmtDayTime, fmtTime, fmtDay, parseLocalDate, parseJson } from './format'

const icons = {
  sos_new: LifeBuoy, sos_accepted: LifeBuoy, connection_request: UserPlus, connection_accepted: Link2,
  connection_archived: Archive, message_new: MessageCircle, meeting_scheduled: CalendarClock, meeting_reminder: CalendarClock,
  meeting_confirm_needed: CalendarCheck, meeting_completed: CalendarCheck, meeting_cancelled: CalendarX,
  lesson_reminder: BookOpen, exam_reminder: ClipboardList, exam_added: ClipboardList, schedule_change: Repeat,
  homework_deadline: ClipboardList, event_reminder: PartyPopper, event_new: PartyPopper, announcement: Megaphone,
  match_new: Heart, achievement: Award, invite_joined: Gift, coins_spent: Coins, school_approved: ShieldCheck,
}

// Локалізований заголовок і текст сповіщення за його типом і параметрами
export function describeNotification(n, { t, lang, subjectName }) {
  const d = parseJson(n.data)
  const subj = d.subjectId ? subjectName(d.subjectId) : d.subject
  const at = d.at ? fmtDayTime(d.at, lang, t) : ''
  const map = {
    sos_new: [t('n_sos_new'), [d.name, subj, d.topic].filter(Boolean).join(' · ')],
    sos_accepted: [t('n_sos_accepted', { name: d.name }), subj],
    connection_request: [t('n_connection_request'), t('n_connection_request_body', { name: d.name })],
    connection_accepted: [t('n_connection_accepted'), t('n_connection_accepted_body', { name: d.name })],
    connection_archived: [t('n_connection_archived'), d.name],
    match_new: [t('n_match_new'), t('n_match_new_body', { name: d.name })],
    message_new: [d.mentor ? t('n_message_mentor') : t('n_message_new'), d.name],
    meeting_scheduled: [t('n_meeting_scheduled'), [d.name, at].filter(Boolean).join(' · ')],
    meeting_reminder: [t('n_meeting_reminder'), [d.name, d.at ? fmtTime(d.at, lang) : ''].filter(Boolean).join(' · ')],
    meeting_confirm_needed: [t('n_meeting_confirm_needed'), t('n_meeting_confirm_body', { name: d.name })],
    meeting_completed: [t('n_meeting_completed'), d.coins ? `+${d.coins} Buddy Coins` : ''],
    meeting_cancelled: [t('n_meeting_cancelled'), d.name],
    lesson_reminder: [t('n_lesson_reminder'), [subj, d.room, d.start].filter(Boolean).join(' · ')],
    exam_reminder: [t('n_exam_reminder'), [subj, t('exam_' + (d.kind || 'test')), at].filter(Boolean).join(' · ')],
    exam_added: [t('n_exam_added'), [subj, at].filter(Boolean).join(' · ')],
    schedule_change: [t('n_schedule_change'), [subj, d.start, d.date ? fmtDay(parseLocalDate(d.date), lang, t) : '', t('change_' + d.kind)].filter(Boolean).join(' · ')],
    homework_deadline: [t('n_homework_deadline'), [d.title, d.deadline ? fmtDayTime(d.deadline, lang, t) : ''].filter(Boolean).join(' · ')],
    event_reminder: [t('n_event_reminder'), [d.title, at].filter(Boolean).join(' · ')],
    event_new: [t('n_event_new'), [d.title, at].filter(Boolean).join(' · ')],
    announcement: [t('n_announcement'), pick(d, 'title', lang)],
    achievement: [t('n_achievement'), [t('ach_' + d.code), d.coins ? `+${d.coins} BC` : ''].filter(Boolean).join(' · ')],
    invite_joined: [t('n_invite_joined'), [d.name, d.coins ? `+${d.coins} BC` : ''].filter(Boolean).join(' · ')],
    coins_spent: [t('n_coins_spent'), [`−${d.amount} BC`, d.partner, pick(d, 'reward', lang)].filter(Boolean).join(' · ')],
    school_approved: [t('n_school_approved'), ''],
  }
  const [title, body] = map[n.type] ?? [n.type, '']
  return { title, body, icon: icons[n.type] ?? Bell }
}

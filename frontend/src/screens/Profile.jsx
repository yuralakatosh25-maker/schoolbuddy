import { useRef, useState } from 'react'
import {
  Camera, Pencil, QrCode, ScanLine, Gift, ShieldCheck, Settings as SettingsIcon, LogOut, Award, Flame, Coins, Users,
  MailCheck, Repeat, Copy, Share2, FlaskConical, CalendarCheck,
} from 'lucide-react'
import { useApp } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { resizeImage, shareText, copyText } from '../lib/share'
import { Avatar, Badge, Button, Card, Chip, List, Row, Section, Sheet, Stat, VerifiedMark } from '../components/ui'
import { QrImage, QrScanner } from '../components/Qr'
import { WaveBand } from '../components/Waves'
import { profileQrValue } from '../lib/qr'

export default function Profile() {
  const { t, me, setMe, reloadMe, logout, fail, toast, ask } = useApp()
  const nav = useNav()
  const fileRef = useRef(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const onPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const avatar = await resizeImage(file)
      const profile = await api.put('/api/me', { avatar })
      setMe(profile)
      toast(t('saved'))
    } catch (err) { fail(err) }
  }

  const onScan = async (token) => {
    setScanOpen(false)
    try {
      const { id } = await api.get(`/api/users/by-qr/${encodeURIComponent(token)}`)
      nav.push('user', { id })
    } catch (err) { fail(err) }
  }

  const switchRole = async () => {
    const next = me.role === 'mentor' ? 'student' : 'mentor'
    const ok = await ask({ title: next === 'mentor' ? t('becomeMentor') : t('becomeStudent'), text: next === 'mentor' ? t('becomeMentorLead') : undefined })
    if (!ok) return
    try {
      await api.put('/api/me/role', { role: next })
      await reloadMe()
    } catch (err) { fail(err) }
  }

  const inviteUrl = `${window.location.origin}/invite/${me.inviteCode}`
  const unlocked = me.achievements.map((a) => a.code)

  return (
    <div className="px-4 pb-8">
      <WaveBand className="-mx-4" contentClassName="h-16" variant="b" />
      <div className="relative -mt-24 flex flex-col items-center text-center">
        <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full ring-4 ring-surface" aria-label="Avatar">
          <Avatar user={me} size={96} />
          <span className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border-4 border-surface bg-raised text-muted group-hover:text-ink">
            <Camera className="size-3.5" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        <h1 className="mt-3 flex items-center gap-1.5 font-display text-[28px] font-semibold leading-9 tracking-wide">{me.nickname}<VerifiedMark user={me} className="size-5" /></h1>
        <p className="mt-0.5 text-[13px] text-muted">{me.email}</p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <Badge tone={me.role === 'mentor' ? 'accent' : 'neutral'}>{t(me.role)}</Badge>
          {me.class && <Badge>{me.class}</Badge>}
          {me.emailVerified && <Badge tone="ok" icon={MailCheck}>{t('emailVerified')}</Badge>}
          <Badge tone={me.verified ? 'ok' : 'warn'} icon={ShieldCheck}>{me.verified ? t('verified') : t('notVerified')}</Badge>
          {me.isDemo && <Badge tone="info" icon={FlaskConical}>{t('demoBadge')}</Badge>}
        </div>
        {me.bio && <p className="mt-3 max-w-[320px] text-[14px] leading-5 text-muted">{me.bio}</p>}
        <Button size="sm" icon={Pencil} className="mt-3" onClick={() => nav.push('editProfile')}>{t('editProfile')}</Button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat label={t('streak')} value={<span className="inline-flex items-center gap-1.5"><Flame className="size-5 text-warn" />{me.streak}</span>} />
        <Stat label={t('coins')} value={<span className="inline-flex items-center gap-1.5"><Coins className="size-5 text-muted" />{me.coins}</span>} />
        {me.role === 'mentor'
          ? <Stat label={t('helpedStudents')} value={<span className="inline-flex items-center gap-1.5"><Users className="size-5 text-muted" />{me.stats.helped}</span>} />
          : <Stat label={t('meetingsDone')} value={<span className="inline-flex items-center gap-1.5"><CalendarCheck className="size-5 text-muted" />{me.stats.meetings}</span>} />}
        <Stat label={t('rank')} value={<span className="text-[17px]">{t('title_' + me.stats.title)}</span>} sub={t('jointActivities', { n: me.stats.joint })} />
      </div>

      <Section title={t('badges')} action={t('seeAll')} onAction={() => nav.push('achievements')}>
        <button type="button" onClick={() => nav.push('achievements')} className="flex w-full flex-wrap gap-1.5 rounded-2xl border border-line bg-card p-3 text-left">
          {unlocked.length === 0 ? <span className="text-[13px] text-muted">{t('locked')}</span>
            : unlocked.map((c) => <Badge key={c} tone="accent" icon={Award}>{t('ach_' + c)}</Badge>)}
        </button>
      </Section>

      <Section title={t('tags')} action={t('edit')} onAction={() => nav.setTab('match')}>
        <div className="flex flex-wrap gap-1.5">
          {me.tags.length === 0 ? <span className="px-1 text-[13px] text-muted">{t('pickTagsFirst')}</span>
            : me.tags.map((x) => <Chip key={x.id} onClick={() => nav.setTab('match')}>{x.name}</Chip>)}
        </div>
      </Section>

      <Section>
        <List>
          <Row left={<QrCode className="size-4 text-muted" />} title={t('myQr')} onClick={() => setQrOpen(true)} />
          <Row left={<ScanLine className="size-4 text-muted" />} title={t('scanSomeone')} onClick={() => setScanOpen(true)} />
          <Row left={<Gift className="size-4 text-muted" />} title={t('inviteFriends')} right={<span className="text-[13px] text-faint">{t('invitedCount', { n: me.stats.invited })}</span>} onClick={() => setInviteOpen(true)} />
          <Row left={<ShieldCheck className="size-4 text-muted" />} title={t('trustedContacts')} onClick={() => nav.push('trusted')} />
          <Row left={<SettingsIcon className="size-4 text-muted" />} title={t('settings')} onClick={() => nav.push('settings')} />
        </List>
      </Section>

      {me.role !== 'admin' && (
        <Section>
          <List>
            <Row left={<Repeat className="size-4 text-muted" />} title={me.role === 'mentor' ? t('becomeStudent') : t('becomeMentor')}
              subtitle={me.role === 'student' ? t('becomeMentorLead') : undefined} onClick={switchRole} />
          </List>
        </Section>
      )}

      <Button variant="danger" full icon={LogOut} className="mt-6" onClick={logout}>{t('logout')}</Button>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title={t('myQr')}>
        <div className="flex flex-col items-center pb-2 text-center">
          <QrImage value={profileQrValue(me.qrToken)} size={232} />
          <p className="mt-3 text-[15px]">{me.nickname}</p>
          <p className="mt-1 max-w-[300px] text-[13px] leading-5 text-muted">{t('myQrLead')}</p>
        </div>
      </Sheet>

      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScan} />

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={t('inviteFriends')}>
        <p className="text-[13.5px] leading-5 text-muted">{t('inviteLead')}</p>
        <Card className="mt-3 flex items-center gap-2 p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{inviteUrl}</span>
          <Button size="sm" icon={Copy} onClick={async () => { if (await copyText(inviteUrl)) toast(t('copied')) }}>{t('copy')}</Button>
        </Card>
        <Button variant="primary" full icon={Share2} className="mt-3"
          onClick={async () => { const r = await shareText({ title: 'SchoolBuddy', text: t('inviteLead'), url: inviteUrl }); if (r === 'copied') toast(t('copied')) }}>
          {t('share')}
        </Button>
        <p className="mt-3 text-center text-[12.5px] text-faint">{t('invitedCount', { n: me.stats.invited })}</p>
      </Sheet>
    </div>
  )
}

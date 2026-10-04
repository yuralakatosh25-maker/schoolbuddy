import { useState } from 'react'
import { BellOff, BellRing, CheckCheck } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { api } from '../lib/api'
import { Button, Card, Empty, IconButton, List, Loading, ScreenHeader } from '../components/ui'
import { NotificationRow } from '../components/items'

export default function Notifications() {
  const { t, me, setUnread, fail, toast } = useApp()
  const nav = useNav()
  const { data, loading, setData } = useApi('/api/notifications?take=60')
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))

  const readAll = async () => {
    try {
      await api.post('/api/notifications/read-all')
      setData((d) => ({ ...d, unread: 0, items: d.items.map((n) => ({ ...n, isRead: true })) }))
      setUnread(0)
    } catch (e) { fail(e) }
  }

  const open = async (n) => {
    if (!n.isRead) {
      api.post(`/api/notifications/${n.id}/read`).catch(() => {})
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) }))
      setUnread((u) => Math.max(0, u - 1))
    }
    nav.openLink(n.link)
  }

  const enablePush = async () => {
    const result = await Notification.requestPermission()
    setPerm(result)
    if (result === 'granted') {
      if (!me.notify.push) await api.put('/api/me/notifications', { ...me.notify, push: true }).catch(() => {})
      toast(t('pushEnabled'))
    } else toast(t('pushDenied'), 'error')
  }

  return (
    <>
      <ScreenHeader title={t('notifications')} onBack={nav.pop} backLabel={t('back')}
        right={data?.unread > 0 && <IconButton icon={CheckCheck} label={t('markAllRead')} onClick={readAll} />} />
      <div className="scroll-area flex-1 px-4 pb-8 pt-3">
        {perm === 'default' && (
          <Card className="mb-3 flex items-center gap-3 p-3.5">
            <BellRing className="size-5 shrink-0 text-accent" />
            <span className="flex-1 text-[13.5px] leading-5">{t('enablePush')}</span>
            <Button size="sm" variant="primary" onClick={enablePush}>{t('confirm')}</Button>
          </Card>
        )}
        {perm === 'denied' && <p className="mb-3 px-1 text-[12.5px] text-faint">{t('pushDenied')}</p>}
        {loading && !data ? <Loading /> : !data?.items.length ? <Empty icon={BellOff} text={t('noNotifications')} /> : (
          <List>{data.items.map((n) => <NotificationRow key={n.id} n={n} onClick={() => open(n)} />)}</List>
        )}
      </div>
    </>
  )
}

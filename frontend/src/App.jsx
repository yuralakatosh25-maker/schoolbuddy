import { useEffect } from 'react'
import { AppProvider, useApp } from './app/context'
import { api } from './lib/api'
import { NavProvider, useNav } from './app/nav'
import { Frame, TopBar, TabBar } from './app/Shell'
import { Loading } from './components/ui'
import Auth from './screens/Auth'
import Partner from './screens/Partner'
import Home from './screens/Home'
import Match from './screens/Match'
import Sos from './screens/Sos'
import Cabinet from './screens/Cabinet'
import Profile from './screens/Profile'
import Admin from './screens/Admin'
import { Schedule, Subjects } from './screens/Schedule'
import Homework from './screens/Homework'
import { Chats, Chat } from './screens/Chat'
import UserProfile from './screens/UserProfile'
import { Meetings, Meeting } from './screens/Meetings'
import SafeMap from './screens/SafeMap'
import { Groups, Group } from './screens/Groups'
import { Events, EventDetail } from './screens/Events'
import Announcements from './screens/Announcements'
import Notifications from './screens/Notifications'
import { Achievements, Wallet } from './screens/Rewards'
import { Forum, ForumPost } from './screens/Forum'
import { OfficeHours, TrustedContacts, Settings, EditProfile } from './screens/Settings'

const tabs = { home: Home, match: Match, sos: Sos, cabinet: Cabinet, profile: Profile, admin: Admin }

const screens = {
  schedule: Schedule, subjects: Subjects, homework: Homework, chats: Chats, chat: Chat, user: UserProfile,
  meetings: Meetings, meeting: Meeting, map: SafeMap, groups: Groups, group: Group, events: Events, event: EventDetail,
  announcements: Announcements, notifications: Notifications, achievements: Achievements, wallet: Wallet,
  forum: Forum, post: ForumPost, officeHours: OfficeHours, trusted: TrustedContacts, settings: Settings,
  editProfile: EditProfile,
  findMentor: (p) => <Match pushed {...p} />,
  sosNew: (p) => <Sos pushed {...p} />,
}

// Відкриття профілю за посиланням з QR-коду: /u/{token}
function useProfileDeepLink() {
  const nav = useNav()
  const { fail } = useApp()
  useEffect(() => {
    const m = window.location.pathname.match(/^\/u\/([^/?#]+)/)
    if (!m) return
    window.history.replaceState({ sbDepth: 0 }, '', '/')
    api.get(`/api/users/by-qr/${encodeURIComponent(m[1])}`).then(({ id }) => nav.push('user', { id })).catch(fail)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

function Shell() {
  const { tab, stack } = useNav()
  useProfileDeepLink()
  const TabScreen = tabs[tab] ?? Home
  const top = stack[stack.length - 1]
  const Pushed = top ? screens[top.screen] : null
  return (
    <>
      <TopBar onWave={tab === 'home' || tab === 'profile'} />
      <main className="relative min-h-0 flex-1">
        <div key={tab} className="scroll-area absolute inset-0 animate-in">
          <TabScreen />
        </div>
      </main>
      <TabBar />
      {Pushed && (
        <div key={top.key} className="absolute inset-0 z-30 flex flex-col bg-surface animate-push">
          <Pushed {...top.params} />
        </div>
      )}
    </>
  )
}

function Root() {
  const { token, me } = useApp()
  if (!token) return <Auth />
  if (!me) return <Loading className="h-full" />
  return (
    <NavProvider>
      <Shell />
    </NavProvider>
  )
}

export default function App() {
  const isPartner = window.location.pathname.startsWith('/partner')
  return (
    <AppProvider>
      <Frame>{isPartner ? <Partner /> : <Root />}</Frame>
    </AppProvider>
  )
}

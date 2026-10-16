import { lazy, Suspense, useEffect } from 'react'
import { AppProvider, useApp } from './app/context'
import { api } from './lib/api'
import { NavProvider, useNav } from './app/nav'
import { Frame, TopBar, TabBar } from './app/Shell'
import { Loading } from './components/ui'
import Auth from './screens/Auth'
import Home from './screens/Home'

// Решта екранів вантажиться окремими файлами лише тоді, коли їх відкривають:
// перше відкриття застосунку (особливо з телефону) швидше
const lazyNamed = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const Partner = lazy(() => import('./screens/Partner'))
const Match = lazy(() => import('./screens/Match'))
const Sos = lazy(() => import('./screens/Sos'))
const Cabinet = lazy(() => import('./screens/Cabinet'))
const Profile = lazy(() => import('./screens/Profile'))
const Admin = lazy(() => import('./screens/Admin'))
const Homework = lazy(() => import('./screens/Homework'))
const UserProfile = lazy(() => import('./screens/UserProfile'))
const SafeMap = lazy(() => import('./screens/SafeMap'))
const Announcements = lazy(() => import('./screens/Announcements'))
const Notifications = lazy(() => import('./screens/Notifications'))
const loadSchedule = () => import('./screens/Schedule')
const Schedule = lazyNamed(loadSchedule, 'Schedule')
const Subjects = lazyNamed(loadSchedule, 'Subjects')
const loadChat = () => import('./screens/Chat')
const Chats = lazyNamed(loadChat, 'Chats')
const Chat = lazyNamed(loadChat, 'Chat')
const loadMeetings = () => import('./screens/Meetings')
const Meetings = lazyNamed(loadMeetings, 'Meetings')
const Meeting = lazyNamed(loadMeetings, 'Meeting')
const loadGroups = () => import('./screens/Groups')
const Groups = lazyNamed(loadGroups, 'Groups')
const Group = lazyNamed(loadGroups, 'Group')
const loadEvents = () => import('./screens/Events')
const Events = lazyNamed(loadEvents, 'Events')
const EventDetail = lazyNamed(loadEvents, 'EventDetail')
const loadRewards = () => import('./screens/Rewards')
const Achievements = lazyNamed(loadRewards, 'Achievements')
const Wallet = lazyNamed(loadRewards, 'Wallet')
const loadForum = () => import('./screens/Forum')
const Forum = lazyNamed(loadForum, 'Forum')
const ForumPost = lazyNamed(loadForum, 'ForumPost')
const loadSettings = () => import('./screens/Settings')
const OfficeHours = lazyNamed(loadSettings, 'OfficeHours')
const TrustedContacts = lazyNamed(loadSettings, 'TrustedContacts')
const Settings = lazyNamed(loadSettings, 'Settings')
const EditProfile = lazyNamed(loadSettings, 'EditProfile')

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
    api.get(`/api/users/by-qr/${encodeURIComponent(m[1])}`).then(({ id }) => nav.push('user', { id, qr: m[1] })).catch(fail)
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
          <Suspense fallback={<Loading className="h-full" />}>
            <TabScreen />
          </Suspense>
        </div>
      </main>
      <TabBar />
      {Pushed && (
        <div key={top.key} className="absolute inset-0 z-30 flex flex-col bg-surface animate-push">
          <Suspense fallback={<Loading className="h-full" />}>
            <Pushed {...top.params} />
          </Suspense>
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
      <Frame>
        {isPartner ? (
          <Suspense fallback={<Loading className="h-full" />}>
            <Partner />
          </Suspense>
        ) : <Root />}
      </Frame>
    </AppProvider>
  )
}

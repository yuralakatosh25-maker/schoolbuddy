import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, ExternalLink, BadgeCheck } from 'lucide-react'
import { useApp, useApi } from '../app/context'
import { useNav } from '../app/nav'
import { pick } from '../lib/i18n'
import { Badge, Chip, List, Loading, Row, ScreenHeader, cx } from '../components/ui'

const kindColor = { school: 'var(--ink)', library: '#7fa7ff', cafe: '#f5b74f', cyberclub: '#b98cf0', park: '#4fd1a5' }

function pinIcon(kind, active) {
  const color = kindColor[kind] ?? 'var(--muted)'
  const s = active ? 18 : 14
  return L.divIcon({
    className: '',
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    html: `<span style="display:block;width:${s}px;height:${s}px;border-radius:999px;background:${color};box-shadow:0 0 0 4px color-mix(in srgb, ${color} 22%, transparent), 0 0 0 2px var(--card)"></span>`,
  })
}

function FlyTo({ place }) {
  const map = useMap()
  useEffect(() => {
    if (place) map.flyTo([place.lat, place.lng], 16, { duration: 0.6 })
  }, [map, place])
  return null
}

export function PlacesMap({ places, compact, active, onSelect }) {
  const { t } = useApp()
  const center = useMemo(() => [49.7295, 13.3685], [])
  return (
    <MapContainer center={center} zoom={compact ? 14 : 14} className="size-full" zoomControl={!compact} attributionControl={!compact}
      dragging={!compact} scrollWheelZoom={!compact} doubleClickZoom={!compact} touchZoom={!compact}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      {places.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.kind, active?.id === p.id)}
          eventHandlers={{ click: () => onSelect?.(p) }}>
          {!compact && <Popup><b>{p.name}</b><br />{t('place_' + p.kind)}</Popup>}
        </Marker>
      ))}
      {active && !compact && <FlyTo place={active} />}
    </MapContainer>
  )
}

export default function SafeMap({ placeId }) {
  const { t, lang } = useApp()
  const nav = useNav()
  const { data, loading } = useApi('/api/places')
  const [kind, setKind] = useState('all')
  const [activeId, setActiveId] = useState(placeId ?? null)
  const places = (data ?? []).filter((p) => kind === 'all' || p.kind === kind)
  const active = (data ?? []).find((p) => p.id === activeId)
  const kinds = [...new Set((data ?? []).map((p) => p.kind))]

  return (
    <>
      <ScreenHeader title={t('map')} subtitle={t('safePlacesLead')} onBack={nav.pop} backLabel={t('back')} />
      {loading && !data ? <Loading /> : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-[46%] shrink-0 border-b border-line">
            <PlacesMap places={places} active={active} onSelect={(p) => setActiveId(p.id)} />
          </div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3">
            <Chip active={kind === 'all'} onClick={() => setKind('all')}>{t('all')}</Chip>
            {kinds.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                <span className="size-2 rounded-full" style={{ background: kindColor[k] }} />{t('place_' + k)}
              </Chip>
            ))}
          </div>
          <div className="scroll-area flex-1 px-4 pb-6">
            <List>
              {places.map((p) => (
                <div key={p.id} className={cx(activeId === p.id && 'bg-raised/50')}>
                  <Row onClick={() => setActiveId(p.id)} chevron={false}
                    left={<span className="grid size-9 place-items-center rounded-full bg-raised"><MapPin className="size-4" style={{ color: kindColor[p.kind] }} /></span>}
                    title={<span className="inline-flex items-center gap-1.5">{p.name}{p.isVerified && <BadgeCheck className="size-3.5 text-accent" />}</span>}
                    subtitle={`${t('place_' + p.kind)} · ${p.address} · ${p.hours}`}
                    right={p.partner ? <Badge tone="accent">{t('partner')}</Badge> : null} />
                  {activeId === p.id && (
                    <div className="px-4 pb-3 pl-16">
                      {p.rewards?.map((r) => (
                        <div key={r.id} className="flex items-center justify-between py-1 text-[13px]">
                          <span className="text-muted">{pick(r, 'title', lang)}</span><span className="tabular text-faint">{r.cost} BC</span>
                        </div>
                      ))}
                      <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[13px] text-accent">
                        {t('openInMaps')}<ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </List>
          </div>
        </div>
      )}
    </>
  )
}

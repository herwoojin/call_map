import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../resize.css'; // Add resize CSS
import { collection, addDoc, deleteDoc, doc, onSnapshot, setDoc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Crosshair, Navigation, X, List, Plus, Trash2, Loader2, Share2, Eye, EyeOff, Settings as SettingsIcon, Edit2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GlobalChat from './GlobalChat';

// ── Fix default Leaflet icon ──
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ── Pin Icons ──
const savedPinIcon = L.divIcon({
  className: 'meet4u-pin',
  html: `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z" fill="#dc2626" stroke="white" stroke-width="3" stroke-linejoin="round"/><circle cx="17" cy="17" r="6" fill="white"/></svg>`,
  iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38],
});

const pendingIcon = L.divIcon({
  className: 'meet4u-pending-pin',
  html: `<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z" fill="#f97316" stroke="white" stroke-width="3" stroke-linejoin="round"/><circle cx="17" cy="17" r="6" fill="white"/></svg>`,
  iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38],
});

const myLocationIcon = L.divIcon({
  className: 'meet4u-my-location',
  html: `<div style="position:relative;width:20px;height:20px;"><div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;animation:pulse 1.8s ease-out infinite;"></div><div style="position:absolute;inset:4px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div></div>`,
  iconSize: [20, 20], iconAnchor: [10, 10],
});

function sharedLocationIcon(name, isSelf) {
  const color = isSelf ? '#ef4444' : '#22c55e';
  return L.divIcon({
    className: 'meet4u-shared-location',
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <div style="width:14px;height:14px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
      <span style="margin-top:2px;font-size:10px;font-weight:600;color:${color};text-shadow:0 0 3px white,0 0 3px white;white-space:nowrap;">${name}</span>
    </div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

// ── Nominatim helpers ──
const NOMINATIM_HEADERS = { 'Accept': 'application/json', 'Accept-Language': 'ko,en;q=0.8,zh;q=0.6' };

async function geocodeAddress(addr) {
  // 괄호 안의 내용(예: (해도동))은 Nominatim 검색을 방해하므로 제거합니다.
  const cleanAddr = addr.replace(/\s*\(.*?\)\s*/g, '').trim();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(cleanAddr)}`, { headers: NOMINATIM_HEADERS });
  const data = await res.json();
  
  if (!data.length) {
    // 매칭되는 좌표가 없으면 시/군/구 수준까지만 잘라내어 2차 시도를 합니다.
    const fallbackAddr = cleanAddr.split(' ').slice(0, 3).join(' ');
    const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fallbackAddr)}`, { headers: NOMINATIM_HEADERS });
    const fallbackData = await fallbackRes.json();
    if (!fallbackData.length) return null;
    return { lat: parseFloat(fallbackData[0].lat), lng: parseFloat(fallbackData[0].lon), display: addr };
  }
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: addr };
}

async function reverseGeocode(lat, lng) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: NOMINATIM_HEADERS });
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function searchNominatim(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}`, { headers: NOMINATIM_HEADERS });
  return res.json();
}

// ── Map sub-components ──
function MapResizeFix() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function MapFlyTo({ center, zoom }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, zoom || map.getZoom(), { duration: 1.2 }); }, [center, zoom, map]);
  return null;
}

function ClickToPin({ onMapClick }) {
  useMapEvents({ click(e) { onMapClick(e.latlng); } });
  return null;
}

// ── Main Component ──
export default function GlobalMeetingMap() {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myEmail = currentUser?.email || '';

  // State
  const [pins, setPins] = useState([]);
  const [address, setAddress] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [flyZoom, setFlyZoom] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showPinsList, setShowPinsList] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharedUsers, setSharedUsers] = useState([]);
  const [showSharedPanel, setShowSharedPanel] = useState(false);
  const watchIdRef = useRef(null);

  // Resize state
  const [mapHeight, setMapHeight] = useState(500); // 500px 기본 높이
  const isResizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);
  
  const [tableFilter, setTableFilter] = useState('');
  const [editInfo, setEditInfo] = useState({});
  
  const [editingPinId, setEditingPinId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // Password Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('globalMapAuthenticated') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === '2525') {
      localStorage.setItem('globalMapAuthenticated', 'true');
      setIsAuthenticated(true);
    } else {
      setPasswordError('비밀번호가 일치하지 않습니다.');
      setPasswordInput('');
    }
  };

  const handleUpdatePinTitle = async (pinId) => {
    try {
      await updateDoc(doc(db, 'globalPins', pinId), {
        title: editTitle || '제목 없음'
      });
      setEditingPinId(null);
      setEditTitle('');
    } catch (error) {
      console.error("Error updating pin title:", error);
    }
  };

  const handleUpdateAdditionalInfo = async (pinId, info) => {
    try {
      await updateDoc(doc(db, 'globalPins', pinId), {
        additionalInfo: info || ''
      });
    } catch (error) {
      console.error("Error updating additional info:", error);
    }
  };

  const handleResizeMove = useCallback((e) => {
    if (!isResizing.current) return;
    const clientY = e.clientY;
    const dy = clientY - startY.current;
    const newHeight = startHeight.current + dy;
    setMapHeight(Math.max(200, Math.min(newHeight, window.innerHeight * 0.85)));
  }, [mapHeight]);

  const handleTouchMove = useCallback((e) => {
    if (!isResizing.current) return;
    if (e.cancelable) e.preventDefault(); // 모바일 스크롤 방지
    const clientY = e.touches[0].clientY;
    const dy = clientY - startY.current;
    const newHeight = startHeight.current + dy;
    setMapHeight(Math.max(200, Math.min(newHeight, window.innerHeight * 0.85)));
  }, [mapHeight]);

  const handleResizeEnd = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleResizeEnd);
    document.body.style.userSelect = '';
    document.body.style.overscrollBehavior = '';
  }, [handleResizeMove, handleTouchMove]);

  const handleResizeStart = (e) => {
    isResizing.current = true;
    startY.current = e.clientY || (e.touches && e.touches[0].clientY);
    startHeight.current = mapHeight;
    
    if (e.type === 'touchstart') {
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleResizeEnd);
    } else {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    }
    
    document.body.style.userSelect = 'none'; 
    document.body.style.overscrollBehavior = 'none';
  };

  const openPostcode = () => {
    if (!window.daum || !window.daum.Postcode) {
      alert(t('map.postcodeNotLoaded', '주소 검색 서비스를 불러오지 못했습니다.'));
      return;
    }
    new window.daum.Postcode({
      oncomplete: function(data) {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.addressType === 'R') {
          if (data.bname !== '') {
            extraAddress += data.bname;
          }
          if (data.buildingName !== '') {
            extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
          }
          fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
        }

        setAddress(fullAddress);
      }
    }).open();
  };

  // Subscribe to pins
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'globalPins'), snap => {
      setPins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Subscribe to live locations
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'liveLocations'), snap => {
      const now = Date.now();
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.updatedAt && (now - u.updatedAt.toMillis()) < 10 * 60 * 1000);
      setSharedUsers(users);
    });
    return unsub;
  }, []);

  // Add pin via address
  const handleAddByAddress = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    try {
      const result = await geocodeAddress(address);
      if (!result) { alert(t('map.addressNotFound', '주소를 찾을 수 없습니다')); return; }
      await addDoc(collection(db, 'globalPins'), {
        lat: result.lat, lng: result.lng,
        address: address.trim(), resolvedAddress: result.display,
        title: pinTitle.trim() || address.trim(),
        createdBy: myEmail, createdByName: currentUser.displayName || '',
        createdAt: serverTimestamp(),
      });
      setFlyTarget([result.lat, result.lng]);
      setFlyZoom(14);
      setAddress(''); setPinTitle('');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Click on map → pending pin
  const handleMapClick = async (latlng) => {
    const { lat, lng } = latlng;
    const display = await reverseGeocode(lat, lng);
    setPendingPin({ lat, lng, address: display });
  };

  // Confirm pending pin
  const confirmPending = async () => {
    if (!pendingPin) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'globalPins'), {
        lat: pendingPin.lat, lng: pendingPin.lng,
        address: pendingPin.address,
        resolvedAddress: pendingPin.address,
        title: pinTitle.trim() || pendingPin.address.split(',')[0],
        createdBy: myEmail, createdByName: currentUser.displayName || '',
        createdAt: serverTimestamp(),
      });
      setPendingPin(null); setPinTitle('');
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Delete pin
  const handleDeletePin = async (pinId) => {
    try { await deleteDoc(doc(db, 'globalPins', pinId)); } catch (err) { console.error(err); }
  };

  // My location
  const handleLocateMe = () => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(loc);
        setFlyTarget(loc);
        setFlyZoom(15);
      },
      err => alert(t('map.locationError', '위치를 가져올 수 없습니다')),
      { enableHighAccuracy: true }
    );
  };

  // Search
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await searchNominatim(searchQuery);
      setSearchResults(results);
    } catch (err) { console.error(err); }
    finally { setSearchLoading(false); }
  };

  const selectSearchResult = (item) => {
    const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
    setPendingPin({ lat, lng, address: item.display_name });
    setFlyTarget([lat, lng]); setFlyZoom(15);
    setShowSearch(false); setSearchResults([]); setSearchQuery('');
  };

  // Location sharing
  const toggleSharing = () => {
    if (sharing) {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      deleteDoc(doc(db, 'liveLocations', currentUser.uid)).catch(() => {});
      setSharing(false);
    } else {
      const wid = navigator.geolocation.watchPosition(
        pos => {
          setDoc(doc(db, 'liveLocations', currentUser.uid), {
            uid: currentUser.uid, email: myEmail,
            displayName: currentUser.displayName || '',
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy || null,
            updatedAt: serverTimestamp(),
          });
        },
        () => {}, { enableHighAccuracy: true }
      );
      watchIdRef.current = wid;
      setSharing(true);
    }
  };

  useEffect(() => {
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 transform transition-all">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <MapPin className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">글로벌 미팅 지도</h2>
            <p className="text-sm text-slate-500 mt-2 text-center">지도에 접근하기 위해<br/>비밀번호를 입력해주세요.</p>
          </div>
          
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                placeholder="비밀번호"
                autoFocus
                className={`w-full px-4 py-3.5 border ${passwordError ? 'border-red-400 bg-red-50/30' : 'border-slate-200'} rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-center tracking-[0.5em] text-xl font-medium`}
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2 text-center font-medium animate-pulse">{passwordError}</p>
              )}
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg"
            >
              확인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <span className="text-2xl">🌐</span> 연결<span className="text-indigo-500">.</span>잇다<span className="text-indigo-500">.</span>
          </h1>
          <div 
            onClick={() => navigate('/settings')}
            className="flex items-center gap-3 cursor-pointer hover:bg-slate-100 p-2 rounded-xl transition-colors"
            title={t('settings.title', '내 프로필')}
          >
            <span className="text-sm font-medium text-slate-700 hidden sm:block">{currentUser?.displayName}</span>
            <div className="relative">
              <img src={currentUser?.photoURL || ''} alt="" className="w-9 h-9 rounded-full border border-slate-200 object-cover" />
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-slate-100">
                <SettingsIcon className="w-3 h-3 text-slate-500" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Address input form */}
        <form onSubmit={handleAddByAddress} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="pin-title-input" value={pinTitle} onChange={e => setPinTitle(e.target.value)}
              placeholder={t('map.pinTitlePlaceholder', '핀 제목 (선택)')}
              className="flex-[0.4] px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <div className="flex-1 relative flex items-center">
              <input id="address-input" value={address} onChange={e => setAddress(e.target.value)}
                placeholder={t('map.addressPlaceholder', '주소를 입력하세요')}
                className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button 
                type="button"
                onClick={openPostcode}
                className="absolute right-2 p-1.5 text-lg hover:bg-slate-100 rounded-md btn-ghost gc-postcode transition-colors"
                title="도로명·지번 상세 주소 검색 (행정안전부)"
              >
                📫
              </button>
            </div>
            <button type="submit" disabled={loading} id="add-pin-btn"
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('map.addPin', '핀 추가')}
            </button>
          </div>
        </form>

        {/* Search toolbar */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(!showSearch)}
            className="map-control-btn flex items-center gap-1.5 text-sm text-slate-600">
            <Search className="w-4 h-4" /> {t('map.search', '검색')}
          </button>
        </div>

        {showSearch && (
          <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
            <div className="flex gap-2">
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('map.searchPlaceholder', '장소 키워드 검색...')}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button type="submit" disabled={searchLoading}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800 disabled:opacity-50">
                {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('map.searchBtn', '검색')}
              </button>
            </div>
            {searchResults.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map(item => (
                  <li key={item.place_id} onClick={() => selectSearchResult(item)}
                    className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer rounded transition-colors">
                    {item.display_name}
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}

        {/* Pending pin card */}
        {pendingPin && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <MapPin className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-800">{t('map.confirmPin', '이 위치에 핀을 추가할까요?')}</p>
              <p className="text-xs text-orange-600 truncate mt-0.5">{pendingPin.address}</p>
              <input value={pinTitle} onChange={e => setPinTitle(e.target.value)}
                placeholder={t('map.pinTitlePlaceholder', '핀 제목 (선택)')}
                className="mt-2 w-full px-2 py-1.5 border border-orange-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-orange-300" />
            </div>
            <div className="flex gap-2">
              <button onClick={confirmPending} disabled={loading}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                {t('map.confirm', '추가')}
              </button>
              <button onClick={() => { setPendingPin(null); setPinTitle(''); }}
                className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
                {t('map.cancel', '취소')}
              </button>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="relative rounded-xl overflow-hidden shadow-lg border border-slate-200 flex flex-col" style={{ height: mapHeight, minHeight: 200 }}>
          <div className="relative flex-1 min-h-0">
            <MapContainer center={[37.5665, 126.9780]} zoom={6} style={{ height: '100%', width: '100%' }}
            zoomControl={true} scrollWheelZoom={true}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
            <MapResizeFix />
            <ClickToPin onMapClick={handleMapClick} />
            {flyTarget && <MapFlyTo center={flyTarget} zoom={flyZoom} />}

            {/* Clustered saved pins */}
            <MarkerClusterGroup 
              chunkedLoading 
              maxClusterRadius={60} 
              spiderfyOnMaxZoom 
              showCoverageOnHover={false} 
              zoomToBoundsOnClick
              iconCreateFunction={(cluster) => {
                const count = cluster.getChildCount();
                // 최대 50개를 기준으로 색상 변화 (초록 -> 노랑 -> 빨강)
                const maxCountForColor = 50;
                const clamped = Math.min(count, maxCountForColor);
                // Hue: 120 (Green) to 0 (Red)
                const hue = 120 - (clamped / maxCountForColor) * 120;
                
                return L.divIcon({
                  html: `<div style="background-color: hsla(${hue}, 85%, 65%, 0.5); border-radius: 50%; padding: 5px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;">
                           <div style="background-color: hsla(${hue}, 90%, 45%, 0.95); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.4); box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                             ${count}
                           </div>
                         </div>`,
                  className: 'custom-dynamic-cluster',
                  iconSize: L.point(40, 40, true)
                });
              }}
            >
              {pins.map(pin => (
                <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={savedPinIcon}>
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold text-sm">{pin.title || pin.address}</p>
                      <p className="text-xs text-gray-500 mt-1">{pin.resolvedAddress || pin.address}</p>
                      <p className="text-xs text-gray-400 mt-1">📌 {pin.createdByName || pin.createdBy}</p>
                      {pin.createdBy === myEmail && (
                        <button onClick={() => handleDeletePin(pin.id)}
                          className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                          <Trash2 className="w-3 h-3" /> {t('map.deletePin', '삭제')}
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>

            {/* Pending pin */}
            {pendingPin && <Marker position={[pendingPin.lat, pendingPin.lng]} icon={pendingIcon} />}

            {/* My location */}
            {myLocation && <Marker position={myLocation} icon={myLocationIcon} />}

            {/* Shared locations */}
            {sharedUsers.map(u => (
              <Marker key={u.id} position={[u.lat, u.lng]}
                icon={sharedLocationIcon(u.displayName || u.email, u.uid === currentUser?.uid)} />
            ))}
          </MapContainer>

          {/* Map control buttons (right side) */}
          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
            {sharedUsers.length > 0 && (
              <button onClick={() => setShowSharedPanel(!showSharedPanel)} className="map-control-btn" title="공유 사용자">
                {showSharedPanel ? <EyeOff className="w-5 h-5 text-slate-600" /> : <Eye className="w-5 h-5 text-slate-600" />}
              </button>
            )}
          </div>

          {showSharedPanel && sharedUsers.length > 0 && (
            <div className="absolute top-14 right-3 z-[1000] bg-white rounded-xl shadow-lg border p-3 w-56 max-h-60 overflow-y-auto">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">{t('map.sharingUsers', '위치 공유 중')}</h4>
              {sharedUsers.map(u => (
                <div key={u.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <div className={`w-2.5 h-2.5 rounded-full ${u.uid === currentUser?.uid ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span className="truncate">{u.displayName || u.email}</span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2">
            <button onClick={handleLocateMe} className="map-control-btn" title={t('map.myLocation', '내 위치')}>
              <Crosshair className="w-5 h-5 text-blue-600" />
            </button>
            <button onClick={toggleSharing} className={`map-control-btn ${sharing ? 'ring-2 ring-green-400' : ''}`}
              title={sharing ? t('map.stopSharing', '공유 중지') : t('map.startSharing', '위치 공유')}>
              <Share2 className={`w-5 h-5 ${sharing ? 'text-green-600' : 'text-slate-600'}`} />
            </button>
          </div>
          </div>

          <div id="mapResizeHandle" className="map-resize-handle" title="드래그하여 지도 높이 조절 (더블클릭 = 초기화)" role="separator" aria-orientation="horizontal" tabIndex="0" onMouseDown={handleResizeStart} onTouchStart={handleResizeStart} onDoubleClick={() => setMapHeight(500)}>
            <span className="mrh-grip"></span>
            <span className="mrh-label">↕ 높이 조절</span>
          </div>
        </div>

        {/* Pins List Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <List className="w-5 h-5 text-indigo-500" />
              <span>{t('map.allPins', '전체 핀 목록')} ({pins.length})</span>
            </h3>
            
            {/* Filtering input */}
            <div className="w-full sm:w-64 relative">
              <input 
                type="text" 
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                placeholder="목록 검색..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto border border-slate-100 rounded-lg">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-medium whitespace-nowrap">
                <tr>
                  <th className="p-3 border-b border-slate-100">핀제목(정보기입)</th>
                  <th className="p-3 border-b border-slate-100 hidden sm:table-cell">작성자</th>
                  <th className="p-3 border-b border-slate-100">주소</th>
                  <th className="p-3 border-b border-slate-100 text-center">기능</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {pins.filter(pin => {
                  const searchLower = tableFilter.toLowerCase();
                  return (
                    (pin.title || '').toLowerCase().includes(searchLower) ||
                    (pin.address || '').toLowerCase().includes(searchLower) ||
                    (pin.createdByName || pin.createdBy || '').toLowerCase().includes(searchLower)
                  );
                }).map(pin => (
                  <tr key={pin.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-medium text-slate-900 min-w-[140px]">
                      {editingPinId === pin.id ? (
                        <input 
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          autoFocus
                        />
                      ) : (
                        <button 
                          onClick={() => { setFlyTarget([pin.lat, pin.lng]); setFlyZoom(15); }}
                          className="hover:text-indigo-600 hover:underline text-left font-semibold break-words"
                        >
                          {pin.title || '제목 없음'}
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-slate-500 hidden sm:table-cell whitespace-nowrap">
                      {pin.createdByName || pin.createdBy}
                    </td>
                    <td className="p-3 text-slate-500 max-w-[120px] sm:max-w-xs truncate" title={pin.address}>
                      {(pin.address || '').split(' ').slice(0, 2).join(' ')}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        {editingPinId === pin.id ? (
                          <>
                            <button 
                              onClick={() => handleUpdatePinTitle(pin.id)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                              title="저장"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => { setEditingPinId(null); setEditTitle(''); }}
                              className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-md transition-colors"
                              title="취소"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => { setFlyTarget([pin.lat, pin.lng]); setFlyZoom(15); }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                              title="지도에서 보기"
                            >
                              <MapPin className="w-4 h-4" />
                            </button>
                            {pin.createdBy === myEmail && (
                              <>
                                <button 
                                  onClick={() => { setEditingPinId(pin.id); setEditTitle(pin.title || ''); }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                  title="제목 수정"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeletePin(pin.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="삭제"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pins.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-6 text-center text-slate-400 text-sm">
                      등록된 핀이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chat */}
        {/* <GlobalChat /> */}
      </main>
    </div>
  );
}

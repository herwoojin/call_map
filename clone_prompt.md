# 🤖 AI Prompt — GlobalMeet 클론 프로젝트 생성

## 프롬프트

아래 요구사항에 맞는 **"연결.잇다."** 단일 페이지 웹 애플리케이션을 Vite + React 기반으로 만들어 주세요.

---

### 프로젝트 개요
Google 로그인으로 인증된 사용자가 **Leaflet.js 지도** 위에 핀을 등록·관리하고, **실시간 대화방**에서 소통하는 웹앱입니다.
기존 "PromiseU > 글로벌 미팅" 기능만을 독립 사이트로 추출합니다.

---

### 핵심 기능 (3가지)

#### 1. Google 로그인 (Firebase Auth)
- Firebase `signInWithPopup(auth, GoogleAuthProvider)` 사용
- 로그인 후 Firestore `users/{uid}` 프로필 자동 생성 (email, displayName, photoURL, preferredLanguage)
- `AuthContext`로 전역 상태 관리 (`currentUser`, `login()`, `logout()`)
- 미인증 사용자는 로그인 화면으로 리다이렉트 (`PrivateRoute`)

#### 2. Leaflet 지도 (OpenStreetMap + 마커 클러스터링)
- **타일 소스**: OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
- **라이브러리**: `react-leaflet` v5 + `leaflet` v1.9 + `react-leaflet-cluster` v4
- **핀 타입 3종**:
  - 🔴 **저장 핀 (savedPinIcon)**: 빨강 teardrop SVG, Firestore `globalPins` 컬렉션에 저장
  - 🟠 **임시 핀 (pendingIcon)**: 오렌지 teardrop SVG, 저장 전 확인용 (지도 클릭 or 검색 선택)
  - 🔵 **내 위치 (myLocationIcon)**: 파란색 pulse 애니메이션 원형 dot
- **주소 입력으로 핀 추가**: Nominatim geocoding API (`/search?format=json`) 사용
- **지도 클릭으로 핀 추가**: `useMapEvents` → 클릭 좌표 → reverse geocode → 임시 핀 → 사용자 확인 후 저장
- **장소 검색**: Nominatim 키워드 검색, 결과 리스트에서 선택하면 임시 핀 생성
- **핀 팝업**: 제목, 주소, 등록자 표시. 자신의 핀은 삭제 버튼
- **내 위치 버튼**: `navigator.geolocation.getCurrentPosition()` → 파란 dot + 지도 이동
- **위치 공유 기능**: `watchPosition()` + Firestore `liveLocations/{uid}` → 다른 사용자의 실시간 위치 표시 (초록/빨강 dot + 이름 라벨)
- **⭐ 마커 클러스터링 (필수)**:
  - `react-leaflet-cluster` (MarkerClusterGroup) 사용
  - 핀이 많은 영역에서 자동으로 숫자 뱃지(초록/노란색 원)로 묶임
  - 줌인하면 개별 핀으로 펼쳐짐, 줌아웃하면 다시 묶임
  - 클러스터 클릭 시 해당 영역으로 줌인
  - 클러스터 스타일: 
    - small (10개 이하): 초록색 원
    - medium (10~100개): 노란색 원
    - large (100개 이상): 빨간색 원
  - CSS: `marker-cluster-small`, `marker-cluster-medium`, `marker-cluster-large` 클래스 스타일링

#### 3. 실시간 대화방 (Firestore 기반)
- **채팅방 CRUD**: Firestore `globalChatRooms` 컬렉션
  - `members` (array): 초대된 사용자 이메일 (lowercase)
  - `memberNames` (map): 이메일→이름 매핑
  - `createdBy`: 방장 이메일
- **메시지**: `globalChatRooms/{roomId}/messages` 서브컬렉션
  - `text`, `senderEmail`, `senderName`, `sourceLanguage`, `timestamp`, `readBy[]`
  - 이미지 첨부: Firebase Storage + WebP 변환
- **기능**:
  - 대화방 생성/삭제/나가기
  - 실시간 메시지 수신 (`onSnapshot`)
  - 읽음 확인 (`readBy` arrayUnion)
  - 음성 입력 (Web Speech API — STT)
  - 텍스트 음성 재생 (SpeechSynthesis — TTS)
  - 자동 음성 재생 (새 메시지 자동 TTS)
  - 이미지 첨부 (WebP 압축 후 Firebase Storage 업로드)
  - 이미지 라이트박스 (전체화면 뷰어 + 다운로드)

---

### 기술 스택

| 항목 | 기술 |
|------|------|
| **프레임워크** | Vite + React 19 |
| **스타일링** | TailwindCSS 3 |
| **인증** | Firebase Auth (Google Provider) |
| **데이터베이스** | Cloud Firestore (realtime) |
| **스토리지** | Firebase Storage |
| **지도** | Leaflet.js + react-leaflet + react-leaflet-cluster |
| **Geocoding** | Nominatim (OpenStreetMap) |
| **아이콘** | Lucide React |
| **날짜** | date-fns |
| **다국어** | i18next + react-i18next |
| **라우팅** | react-router-dom v7 |

---

### Firestore 컬렉션 구조

```
users/{uid}
  ├─ email: string
  ├─ displayName: string
  ├─ photoURL: string
  ├─ preferredLanguage: string ('ko' | 'en' | 'zh')
  ├─ createdAt: string (ISO)
  └─ lastSeen: string (ISO)

globalPins/{pinId}
  ├─ lat: number
  ├─ lng: number
  ├─ address: string
  ├─ resolvedAddress: string
  ├─ title: string
  ├─ createdBy: string (email)
  ├─ createdByName: string
  └─ createdAt: Timestamp

liveLocations/{uid}
  ├─ uid: string
  ├─ email: string
  ├─ displayName: string
  ├─ lat: number
  ├─ lng: number
  ├─ accuracy: number | null
  └─ updatedAt: Timestamp

globalChatRooms/{roomId}
  ├─ name: string
  ├─ createdBy: string (email, lowercase)
  ├─ createdByName: string
  ├─ members: string[] (emails, lowercase)
  ├─ memberNames: map<string, string>
  ├─ createdAt: Timestamp
  └─ messages/{messageId}  (subcollection)
      ├─ text: string
      ├─ imageUrl?: string
      ├─ imagePath?: string
      ├─ imageWidth?: number
      ├─ imageHeight?: number
      ├─ senderEmail: string
      ├─ senderName: string
      ├─ sourceLanguage: string
      ├─ timestamp: Timestamp
      ├─ readBy: string[] (emails)
      └─ translations?: map<string, string>
```

---

### 핀 SVG 아이콘 코드

#### 저장 핀 (빨강)
```html
<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z"
        fill="#dc2626" stroke="white" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="17" cy="17" r="6" fill="white"/>
</svg>
```

#### 임시 핀 (오렌지)
```html
<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 2C8.716 2 2 8.716 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.716 25.284 2 17 2z"
        fill="#f97316" stroke="white" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="17" cy="17" r="6" fill="white"/>
</svg>
```

#### 내 위치 (파란 pulse dot)
```html
<div style="position:relative;width:20px;height:20px;">
  <div style="position:absolute;inset:0;background:rgba(59,130,246,0.25);border-radius:50%;
              animation:pulse 1.8s ease-out infinite;"></div>
  <div style="position:absolute;inset:4px;background:#2563eb;border:3px solid white;
              border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>
</div>
```

---

### 마커 클러스터 CSS 스타일

```css
/* MarkerCluster 기본 스타일 */
.marker-cluster-small {
  background-color: rgba(181, 226, 140, 0.6);
}
.marker-cluster-small div {
  background-color: rgba(110, 204, 57, 0.6);
}
.marker-cluster-medium {
  background-color: rgba(241, 211, 87, 0.6);
}
.marker-cluster-medium div {
  background-color: rgba(240, 194, 12, 0.6);
}
.marker-cluster-large {
  background-color: rgba(253, 156, 115, 0.6);
}
.marker-cluster-large div {
  background-color: rgba(241, 128, 23, 0.6);
}
.marker-cluster {
  background-clip: padding-box;
  border-radius: 20px;
}
.marker-cluster div {
  width: 30px;
  height: 30px;
  margin-left: 5px;
  margin-top: 5px;
  text-align: center;
  border-radius: 15px;
  font: 12px "Helvetica Neue", Arial, Helvetica, sans-serif;
  font-weight: bold;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: center;
}
.marker-cluster span {
  line-height: 30px;
}
```

---

### 페이지 구조 (단일 사이트, 2 route)

```
/login        → Google 로그인 페이지
/             → GlobalMeeting 페이지 (지도 + 채팅)
```

---

### 반드시 지켜야 할 사항
2. 지도 기본 중심 좌표: `[37.5665, 126.9780]` (서울), 기본 줌: `6`
3. 클러스터링은 줌-인/아웃에 따라 자연스럽게 묶이고 펼쳐져야 함
4. Firebase 프로젝트는 기존 것을 공유하거나 별도 생성 가능 (config만 교체)
5. Nominatim API 호출 시 `Accept-Language: ko,en;q=0.8,zh;q=0.6` 헤더 포함
6. 한국어/영어/중국어 다국어 지원 (i18next)

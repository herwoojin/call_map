// 이 앱 전용 Firestore / Storage 네임스페이스.
//
// 같은 Firebase 프로젝트(gen-lang-client-0283055211)를 meet4u 등 다른 앱도
// 사용하고 있다. Firestore 에는 "어느 사이트에서 썼는지"라는 개념이 없어서
// 컬렉션 이름이 같으면 물리적으로 같은 데이터가 된다. 예전에는 이 앱도
// globalPins / liveLocations / globalChatRooms / users 를 그대로 써서
// 다른 사이트에서 찍은 핀이 이 지도에 같이 보였다.
//
// 컬렉션 이름을 이 앱 전용으로 바꿔 데이터를 분리한다.
// 컬렉션 이름은 반드시 여기서만 정의하고, 각 컴포넌트는 COL 을 import 해서 쓴다.
// (나중에 아예 별도 Firebase 프로젝트로 옮길 때도 이 파일이 기준점이 된다.)

export const COL = {
  pins: 'callMapPins',
  liveLocations: 'callMapLiveLocations',
  chatRooms: 'callMapChatRooms',
  users: 'callMapUsers',
};

// Storage 버킷도 같은 프로젝트를 공유하므로 경로를 분리한다.
export const STORAGE = {
  chatImages: 'callMapChatImages',
};

// 예전 컬렉션 이름. 마이그레이션 스크립트(scripts/migrate-pins.mjs)에서만 참조한다.
export const LEGACY_COL = {
  pins: 'globalPins',
  liveLocations: 'liveLocations',
  chatRooms: 'globalChatRooms',
  users: 'users',
};

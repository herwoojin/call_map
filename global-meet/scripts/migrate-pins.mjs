#!/usr/bin/env node
//
// globalPins (meet4u 와 공유하던 옛 컬렉션) → callMapPins (이 앱 전용) 복사 스크립트.
//
// 안전 장치:
//   - 기본이 dry-run 이다. --apply 를 붙이기 전에는 아무것도 쓰지 않는다.
//   - 원본 globalPins 는 절대 수정/삭제하지 않는다. 오직 읽기만 한다.
//   - 문서 ID 를 그대로 유지하므로 여러 번 실행해도 중복이 생기지 않는다.
//
// 준비:
//   npm install firebase-admin        (devDependency 로 한 번만)
//   Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
//   (이미 ~/Downloads 에 gen-lang-client-*-firebase-adminsdk-*.json 이 있다면 그걸 써도 된다)
//
// 사용법:
//   node scripts/migrate-pins.mjs --key ~/Downloads/<서비스계정>.json                 # 미리보기(전체)
//   node scripts/migrate-pins.mjs --key <키> --email me@gmail.com                     # 내 핀만 미리보기
//   node scripts/migrate-pins.mjs --key <키> --since 2026-04-01                       # 특정 날짜 이후만
//   node scripts/migrate-pins.mjs --key <키> --email me@gmail.com --apply             # 실제 복사
//
// 되돌리기: callMapPins 컬렉션을 콘솔에서 지우면 된다. 원본은 그대로 남아있다.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SOURCE = 'globalPins';
const TARGET = 'callMapPins';

// ---------- 인자 파싱 ----------
const argv = process.argv.slice(2);
const opts = { emails: [], since: null, apply: false, all: false, key: null };

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--apply') opts.apply = true;
  else if (a === '--dry-run') opts.apply = false;
  else if (a === '--all') opts.all = true;
  else if (a === '--email') opts.emails.push((argv[++i] || '').toLowerCase());
  else if (a === '--since') opts.since = argv[++i];
  else if (a === '--key') opts.key = argv[++i];
  else {
    console.error(`알 수 없는 옵션: ${a}`);
    process.exit(1);
  }
}

if (!opts.key) {
  console.error('오류: --key <서비스계정.json> 이 필요합니다.\n파일 상단의 사용법을 참고하세요.');
  process.exit(1);
}

const keyPath = opts.key.startsWith('~')
  ? resolve(homedir(), opts.key.slice(2))
  : resolve(opts.key);

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (err) {
  console.error(`서비스 계정 키를 읽을 수 없습니다: ${keyPath}\n${err.message}`);
  process.exit(1);
}

const sinceDate = opts.since ? new Date(opts.since) : null;
if (opts.since && Number.isNaN(sinceDate.getTime())) {
  console.error(`--since 날짜 형식이 잘못됐습니다: ${opts.since} (예: 2026-04-01)`);
  process.exit(1);
}

// ---------- 실행 ----------
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
};

const matches = (data) => {
  if (opts.all) return true;
  if (opts.emails.length > 0) {
    const owner = (data.createdBy || '').toLowerCase();
    if (!opts.emails.includes(owner)) return false;
  }
  if (sinceDate) {
    const created = toDate(data.createdAt);
    if (!created || created < sinceDate) return false;
  }
  // 아무 조건도 안 준 경우엔 전체를 대상으로 본다(미리보기 용도).
  return true;
};

const run = async () => {
  console.log(`\n원본:  ${SOURCE}`);
  console.log(`대상:  ${TARGET}`);
  console.log(`모드:  ${opts.apply ? '⚠️  실제 복사(--apply)' : '미리보기(dry-run)'}`);
  if (opts.emails.length) console.log(`필터:  작성자 = ${opts.emails.join(', ')}`);
  if (sinceDate) console.log(`필터:  ${sinceDate.toISOString().slice(0, 10)} 이후 생성`);
  if (!opts.emails.length && !sinceDate && !opts.all) console.log('필터:  없음 (전체 대상)');
  console.log('');

  const snap = await db.collection(SOURCE).get();
  const selected = [];
  const skipped = [];

  snap.docs.forEach((d) => {
    const data = d.data();
    (matches(data) ? selected : skipped).push({ id: d.id, data });
  });

  console.log(`${SOURCE} 전체 ${snap.size}건 중 ${selected.length}건이 대상입니다. (제외 ${skipped.length}건)\n`);

  selected.slice(0, 30).forEach(({ id, data }) => {
    const created = toDate(data.createdAt);
    console.log(
      `  · ${id}  ${(data.title || '(제목 없음)').slice(0, 28).padEnd(30)}` +
      `${(data.createdBy || '-').padEnd(28)}` +
      `${created ? created.toISOString().slice(0, 10) : '-'}`
    );
  });
  if (selected.length > 30) console.log(`  ... 외 ${selected.length - 30}건`);

  if (!opts.apply) {
    console.log('\n미리보기만 했습니다. 실제로 복사하려면 같은 명령에 --apply 를 붙이세요.\n');
    return;
  }

  if (selected.length === 0) {
    console.log('\n복사할 문서가 없습니다.\n');
    return;
  }

  // Firestore 배치는 500개 제한 → 400개씩 나눠 커밋
  let written = 0;
  for (let i = 0; i < selected.length; i += 400) {
    const chunk = selected.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach(({ id, data }) => {
      batch.set(db.collection(TARGET).doc(id), { ...data, migratedFrom: SOURCE });
    });
    await batch.commit();
    written += chunk.length;
    console.log(`  ${written}/${selected.length} 복사 완료`);
  }

  console.log(`\n✅ ${written}건을 ${TARGET} 로 복사했습니다. 원본 ${SOURCE} 는 그대로입니다.\n`);
};

run().catch((err) => {
  console.error('\n실패:', err.message);
  process.exit(1);
});

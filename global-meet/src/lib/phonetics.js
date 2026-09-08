// 발음 표기 변환 — PRD 4.5 F-CHAT-03 "번역문 아래 발음 표기".
//
// 구글 번역이 원문의 로마자 표기(romanization)를 함께 돌려준다.
// 한국어 사용자에게는 그 로마자를 한글로 음차해 보여주고,
// 그 외 언어 사용자에게는 로마자를 그대로 보여준다.
//
// 정밀한 음성학적 변환이 아니라 "읽을 수 있게 해주는 근사치"가 목표다.
// 완벽한 표기를 기대하지 말 것.

const CHO  = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

const compose = (cho, jung, jong = '') => {
  const ci = CHO.indexOf(cho);
  const vi = JUNG.indexOf(jung);
  const ti = Math.max(0, JONG.indexOf(jong));
  if (ci < 0 || vi < 0) return '';
  return String.fromCharCode(0xac00 + (ci * 21 + vi) * 28 + ti);
};

// 긴 패턴이 먼저 와야 한다 (greedy longest-match).
// w / y 는 초성이 아니라 아래 VOWEL 에서 복합모음으로 처리한다.
const ONSET = [
  ['sch','ㅅ'], ['tch','ㅊ'],
  ['ch','ㅊ'], ['sh','ㅅ'], ['th','ㅅ'], ['ph','ㅍ'], ['kh','ㅋ'], ['gh','ㄱ'],
  ['zh','ㅈ'], ['ts','ㅊ'], ['dz','ㅈ'], ['ck','ㅋ'], ['qu','ㅋ'], ['ng','ㅇ'],
  ['b','ㅂ'], ['c','ㅋ'], ['d','ㄷ'], ['f','ㅍ'], ['g','ㄱ'], ['h','ㅎ'],
  ['j','ㅈ'], ['k','ㅋ'], ['l','ㄹ'], ['m','ㅁ'], ['n','ㄴ'], ['p','ㅍ'],
  ['q','ㅋ'], ['r','ㄹ'], ['s','ㅅ'], ['t','ㅌ'], ['v','ㅂ'], ['x','ㅋ'], ['z','ㅈ'],
];

// 모음 없이 끝나는 자음을 홀로 음절로 만들 때 붙일 모음.
// 치찰음 계열은 'ㅡ' 보다 'ㅣ' 가 자연스럽다 (ch → 치, sh → 시, j → 지).
const FILLER_I = new Set(['ch', 'sh', 'j', 'zh', 'tch', 'ts', 'dz']);

const VOWEL = [
  ['yeo','ㅕ'], ['yae','ㅒ'], ['wae','ㅙ'],
  ['eo','ㅓ'], ['eu','ㅡ'], ['ae','ㅐ'], ['oe','ㅚ'], ['ui','ㅢ'],
  ['ya','ㅑ'], ['yo','ㅛ'], ['yu','ㅠ'], ['ye','ㅖ'], ['yi','ㅣ'],
  ['wa','ㅘ'], ['wo','ㅝ'], ['we','ㅞ'], ['wi','ㅟ'], ['wu','ㅜ'],
  ['ai','ㅐ'], ['ei','ㅔ'], ['ee','ㅣ'], ['oo','ㅜ'], ['ou','ㅜ'],
  ['au','ㅗ'], ['aw','ㅗ'], ['ow','ㅗ'], ['ew','ㅠ'],
  ['ia','ㅑ'], ['ie','ㅖ'], ['io','ㅛ'], ['iu','ㅠ'],
  ['ua','ㅘ'], ['uo','ㅝ'], ['ue','ㅞ'],
  ['a','ㅏ'], ['e','ㅔ'], ['i','ㅣ'], ['o','ㅗ'], ['u','ㅜ'], ['y','ㅣ'],
];

// 앞 음절에 받침으로 붙일 수 있는 자음. 나머지(f·v·z·ch…)는
// 모음 없는 자음으로 떨어져 '프·브·즈·치' 같은 별도 음절이 된다.
const CODA = [
  ['ng','ㅇ'],
  ['b','ㅂ'], ['d','ㄷ'], ['g','ㄱ'], ['k','ㄱ'], ['l','ㄹ'],
  ['m','ㅁ'], ['n','ㄴ'], ['p','ㅂ'], ['r','ㄹ'], ['s','ㅅ'], ['t','ㅅ'],
];

// ── 언어별 보정
// 로마자 표기 체계는 언어마다 다르다. 같은 'x' 라도 중국어 병음에서는 'ㅅ',
// 영어에서는 'ㅋㅅ' 에 가깝다. 아래 표는 기본 표보다 먼저 매칭되어 덮어쓴다.
// (원문 언어를 알 때만 적용)
const LANG_ONSET = {
  'zh-CN': [['zh','ㅈ'], ['ch','ㅊ'], ['sh','ㅅ'], ['q','ㅊ'], ['x','ㅅ'], ['c','ㅊ'], ['z','ㅈ'], ['r','ㄹ']],
  ja:      [['ts','ㅊ'], ['ch','ㅊ'], ['sh','ㅅ'], ['f','ㅎ'], ['r','ㄹ'], ['j','ㅈ']],
  vi:      [['x','ㅅ'], ['tr','ㅉ'], ['ph','ㅍ'], ['gi','ㅈ'], ['nh','ㄴ'], ['d','ㅈ']],
  th:      [['ph','ㅍ'], ['th','ㅌ'], ['kh','ㅋ'], ['ng','ㅇ']],
  ko:      [['jj','ㅉ'], ['kk','ㄲ'], ['tt','ㄸ'], ['pp','ㅃ'], ['ss','ㅆ'], ['j','ㅈ']],
};

// 세 번째 원소는 "음절 뒤에 그대로 덧붙일 글자". 이중모음을 두 음절로
// 펼칠 때 쓴다. 예) 병음 ai → 'ㅏ' + '이' = 아이
const LANG_VOWEL = {
  'zh-CN': [['iao','ㅣ','아오'], ['ai','ㅏ','이'], ['ao','ㅏ','오'], ['ei','ㅔ','이'],
            ['ou','ㅓ','우'], ['iu','ㅣ','우'], ['ui','ㅜ','이'], ['ie','ㅣ','에'],
            ['ia','ㅣ','아'], ['uo','ㅝ'], ['ue','ㅜ','에']],
  ja:      [['ou','ㅗ'], ['oo','ㅗ'], ['uu','ㅜ'], ['ii','ㅣ'], ['ee','ㅔ'],
            ['ai','ㅏ','이'], ['ei','ㅔ','이'], ['au','ㅏ','우'], ['oi','ㅗ','이']],
  vi:      [['ai','ㅏ','이'], ['ao','ㅏ','오'], ['oi','ㅗ','이'], ['ua','ㅜ','아'], ['ie','ㅣ','에']],
  th:      [['ai','ㅏ','이'], ['ao','ㅏ','오'], ['ae','ㅐ'], ['oe','ㅓ'], ['ue','ㅡ']],
  es:      [['ue','ㅜ','에'], ['ia','ㅣ','아'], ['ie','ㅣ','에'], ['io','ㅣ','오'],
            ['ai','ㅏ','이'], ['au','ㅏ','우'], ['ei','ㅔ','이'], ['oi','ㅗ','이']],
  id:      [['ai','ㅏ','이'], ['au','ㅏ','우'], ['ua','ㅜ','아'], ['ia','ㅣ','아']],
  tl:      [['ai','ㅏ','이'], ['ao','ㅏ','오'], ['ua','ㅜ','아'], ['ia','ㅣ','아']],
};

// 이미 만들어진 음절에 받침만 갈아끼운다. (자이지아 + ㄴ → 자이지안)
const withCoda = (syllable, jong) => {
  const code = syllable.charCodeAt(0) - 0xac00;
  const ti = JONG.indexOf(jong);
  if (code < 0 || code > 11171 || ti <= 0) return syllable;
  return String.fromCharCode(0xac00 + Math.floor(code / 28) * 28 + ti);
};

const matchAt = (table, s, pos) => {
  for (const [pat, val, suffix] of table) {
    if (s.startsWith(pat, pos)) return { len: pat.length, val, pat, suffix: suffix || '' };
  }
  return null;
};

/**
 * 로마자 문자열을 한글 음차로 근사 변환한다.
 * 알파벳이 아닌 문자(공백·문장부호·숫자)는 그대로 통과시킨다.
 *
 * @param input      로마자 표기
 * @param sourceLang 원문 언어 코드. 주면 언어별 보정표를 함께 적용한다.
 */
export function romanToHangul(input, sourceLang = '') {
  const s = String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // 발음기호(결합 문자) 제거: é → e
    .toLowerCase();

  const onsetTable = [...(LANG_ONSET[sourceLang] || []), ...ONSET];
  const vowelTable = [...(LANG_VOWEL[sourceLang] || []), ...VOWEL];

  const isVowelAt = (pos) => matchAt(vowelTable, s, pos) !== null;

  // 이 위치에서 새 음절이 시작되는가? (자음 + 모음)
  // 받침을 붙이기 전에 확인해야 다음 음절의 첫 자음을 빼앗지 않는다.
  // 예) duo|shao → 's' 를 '둇' 의 받침으로 삼으면 안 된다.
  const startsSyllable = (pos) => {
    const on = matchAt(onsetTable, s, pos);
    return on ? isVowelAt(pos + on.len) : isVowelAt(pos);
  };

  let out = '';
  let i = 0;

  while (i < s.length) {
    if (!/[a-z]/.test(s[i])) { out += s[i]; i += 1; continue; }

    // ── 초성
    let cho = 'ㅇ';
    const onset = matchAt(onsetTable, s, i);
    if (onset) {
      if (isVowelAt(i + onset.len)) {
        cho = onset.val;
        i += onset.len;
      } else {
        // 모음이 따라오지 않는 자음 → 'ㅡ'(또는 'ㅣ') 를 붙여 한 음절로
        out += compose(onset.val, FILLER_I.has(onset.pat) ? 'ㅣ' : 'ㅡ');
        i += onset.len;
        continue;
      }
    }

    // ── 중성
    const vowel = matchAt(vowelTable, s, i);
    if (!vowel) { i += 1; continue; } // 도달할 일이 거의 없지만 무한루프 방지
    i += vowel.len;

    // 이중모음을 두 음절로 펼치는 경우(병음 ai → 아이).
    // 받침은 앞 음절이 아니라 펼쳐진 마지막 음절에 붙어야 한다.
    if (vowel.suffix) {
      let piece = compose(cho, vowel.val) + vowel.suffix;
      const tail = matchAt(CODA, s, i);
      if (tail && !startsSyllable(i)) {
        piece = piece.slice(0, -1) + withCoda(piece.slice(-1), tail.val);
        i += tail.len;
      }
      out += piece;
      continue;
    }

    // ── 종성 (뒤에 모음이 없을 때만 받침으로)
    let jong = '';
    const coda = matchAt(CODA, s, i);
    if (coda && !startsSyllable(i)) {
      jong = coda.val;
      i += coda.len;
    }

    out += compose(cho, vowel.val, jong);
  }

  return out;
}

const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * 화면에 보여줄 발음 표기를 만든다.
 *
 * @param romanization 구글이 돌려준 원문의 로마자 표기
 * @param original     원문 (로마자와 사실상 같으면 표기를 생략하기 위해)
 * @param viewerLang   보는 사람의 언어
 * @param sourceLang   원문 언어 (언어별 로마자 보정에 사용)
 * @returns 표시할 문자열. 보여줄 게 없으면 ''.
 */
export function pronunciationFor(romanization, original, viewerLang, sourceLang = '') {
  const rm = String(romanization || '').trim();
  if (!rm) return '';

  // 원문이 이미 로마자면(영어·스페인어 등) 발음 표기가 의미 없다.
  if (normalize(rm) === normalize(original)) return '';

  // 한국어 사용자에게만 한글 음차. 그 외에는 로마자 그대로가 더 읽기 쉽다.
  return viewerLang === 'ko' ? romanToHangul(rm, sourceLang) : rm;
}

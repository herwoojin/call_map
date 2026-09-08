// 번역 프록시 — 브라우저에서 구글 번역을 직접 부르면 CORS 로 막히거나
// 요청이 차단되므로 서버를 거친다. (PRD 4.5 F-CHAT-03 / TRD 1.3)
//
// 입력  POST { text, target, source? }
// 출력  { text, romanization, detected }
//   romanization = 원문의 로마자 표기. 발음 표기를 만드는 데 쓴다(dt=rm).

const GTX = 'https://translate.googleapis.com/translate_a/single';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

// gtx 응답 구조:
//   [ [ [번역문, 원문, ...], [null, null, translit, src_translit], ... ], ..., 감지언어 ]
export const parseGtx = (data) => {
  let text = '';
  let romanization = '';
  for (const seg of data?.[0] || []) {
    if (typeof seg?.[0] === 'string') text += seg[0];
    if (typeof seg?.[3] === 'string') romanization += seg[3];
  }
  return { text, romanization: romanization.trim(), detected: data?.[2] || '' };
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'method-not-allowed' }) };
  }

  try {
    const { text, target, source } = JSON.parse(event.body || '{}');

    if (!text || !target) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'text-and-target-required' }) };
    }
    // 과도한 길이는 자른다 (gtx URL 길이 제한 + 남용 방지)
    const q = String(text).slice(0, 2000);

    const url = `${GTX}?client=gtx&sl=${encodeURIComponent(source || 'auto')}`
      + `&tl=${encodeURIComponent(target)}&dt=t&dt=rm&q=${encodeURIComponent(q)}`;

    // gtx 는 비공식 엔드포인트라 몰아서 부르면 429 를 준다.
    // 짧게 한 번 쉬었다가 한 번만 더 시도한다.
    let res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chatcheck/1.0)' },
    });
    if (res.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chatcheck/1.0)' },
      });
    }
    if (!res.ok) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: `upstream-${res.status}` }) };
    }

    const parsed = parseGtx(await res.json());
    if (!parsed.text) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'empty-translation' }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(err?.message || err) }) };
  }
};

// TTS 프록시 — 구글 번역 TTS 는 브라우저에서 직접 부르면 차단되므로 서버를 거친다.
// (PRD 4.5 F-CHAT-04 "원문 소리내어 듣기")
//
// 입력  GET ?text=...&lang=ko
// 출력  audio/mpeg
//
// ※ 구글 TTS 는 요청당 약 200자 제한이 있다. 나누는 책임은 클라이언트
//   (src/lib/translate.js 의 chunkTextForTTS) 에 있다. 여기서는 한 조각만 처리한다.

const TTS = 'https://translate.google.com/translate_tts';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    const text = (event.queryStringParameters?.text || '').slice(0, 200);
    const lang = event.queryStringParameters?.lang || 'ko';
    if (!text) return { statusCode: 400, headers: CORS, body: 'text required' };

    const url = `${TTS}?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}`
      + `&q=${encodeURIComponent(text)}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chatcheck/1.0)' },
    });
    if (!res.ok) return { statusCode: 502, headers: CORS, body: `upstream-${res.status}` };

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        ...CORS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: String(err?.message || err) };
  }
};

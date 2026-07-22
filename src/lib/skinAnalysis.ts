// ═══════════════════════════════════════════════════════════════
// skinAnalysis — AI 피부 분석 (킬러 기능 ①, 비코어)
// ───────────────────────────────────────────────────────────────
// 얼굴 사진 1장 → 비전 지원 AI(OpenAI gpt-4o / Gemini 1.5)로 피부 상태를
// 5개 지표(수분/유분/색소/모공/주름) 0~100 점수 + 간단 소견으로 분석.
// 키는 AiChat과 동일하게 localStorage('ai_key_openai'/'ai_key_gemini')에서 읽음.
//
// ⚠️ 의료법 제27조 준수: '진단/처방/치료'가 아닌 '분석/소견/추천' 표현만 사용.
//    본 분석은 관리 참고용이며 의학적 진단이 아님(호출부 UI에도 명시).
// ⚠️ NAS 백엔드 준비 시: 키를 서버에 두고 이 파일의 fetch를 NAS 프록시로
//    교체하면 클라이언트에 키 노출 없이 동작(연동 지점 = 이 파일).
// ═══════════════════════════════════════════════════════════════

export interface SkinScores {
  moisture: number;      // 수분
  oil: number;           // 유분
  pigmentation: number;  // 색소침착
  pore: number;          // 모공
  wrinkle: number;       // 주름
}

export interface SkinAnalysisResult {
  available: boolean;
  reason?: string;          // 미가용 사유 (키 없음 등)
  scores?: SkinScores;
  comment?: string;         // 짧은 소견(관리 추천)
  provider?: 'openai' | 'gemini';
}

const PROMPT = [
  '너는 에스테틱 피부관리 보조 도구다. 첨부된 얼굴 사진을 보고 피부 상태를 5개 지표로 평가해라.',
  '반드시 아래 JSON만 출력해라(코드블록/설명 없이):',
  '{"moisture":0-100,"oil":0-100,"pigmentation":0-100,"pore":0-100,"wrinkle":0-100,"comment":"한 문장 관리 소견"}',
  '수분=촉촉할수록 높음, 유분=번들거릴수록 높음, 색소침착=기미·잡티 심할수록 높음, 모공=넓을수록 높음, 주름=많을수록 높음.',
  '주의: 이것은 의학적 진단이 아니라 관리 참고용 분석이다. comment에는 진단·처방 표현을 쓰지 말고 관리·추천 표현만 사용해라.',
].join('\n');

function getKeys() {
  let openai = '', gemini = '';
  try {
    openai = localStorage.getItem('ai_key_openai') || '';
    gemini = localStorage.getItem('ai_key_gemini') || '';
  } catch { /* noop */ }
  return { openai, gemini };
}

/** 비전 지원 AI 키가 하나라도 있는지 */
export function isSkinAnalysisAvailable(): boolean {
  const { openai, gemini } = getKeys();
  return !!(openai || gemini);
}

function clamp(n: any): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function parseResult(text: string): { scores: SkinScores; comment: string } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const obj = JSON.parse(match[0]);
    return {
      scores: {
        moisture: clamp(obj.moisture),
        oil: clamp(obj.oil),
        pigmentation: clamp(obj.pigmentation),
        pore: clamp(obj.pore),
        wrinkle: clamp(obj.wrinkle),
      },
      comment: typeof obj.comment === 'string' ? obj.comment : '',
    };
  } catch {
    return null;
  }
}

/** data URL(base64)에서 순수 base64와 mime 추출 */
function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/);
  if (!m) return { mime: 'image/jpeg', base64: dataUrl };
  return { mime: m[1], base64: m[2] };
}

async function analyzeWithOpenAI(apiKey: string, dataUrl: string): Promise<SkinAnalysisResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      max_tokens: 300,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const parsed = parseResult(text);
  if (!parsed) throw new Error('분석 결과 파싱 실패');
  return { available: true, scores: parsed.scores, comment: parsed.comment, provider: 'openai' };
}

async function analyzeWithGemini(apiKey: string, dataUrl: string): Promise<SkinAnalysisResult> {
  const { mime, base64 } = splitDataUrl(dataUrl);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mime, data: base64 } },
          ],
        }],
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = parseResult(text);
  if (!parsed) throw new Error('분석 결과 파싱 실패');
  return { available: true, scores: parsed.scores, comment: parsed.comment, provider: 'gemini' };
}

/**
 * 얼굴 사진(base64 data URL)을 AI로 분석.
 * 비전 키 우선순위: OpenAI(gpt-4o) → Gemini(1.5-flash). 둘 다 없으면 available:false.
 */
export async function analyzeSkinPhoto(dataUrl: string): Promise<SkinAnalysisResult> {
  const { openai, gemini } = getKeys();
  if (!openai && !gemini) {
    return { available: false, reason: 'AI 비전 키가 설정되지 않았습니다. (설정 > 연동 설정 > AI 피부분석에서 OpenAI 또는 Gemini 키 입력)' };
  }
  const errors: string[] = [];
  if (openai) {
    try { return await analyzeWithOpenAI(openai, dataUrl); }
    catch (e: any) { errors.push(`OpenAI: ${e?.message || e}`); }
  }
  if (gemini) {
    try { return await analyzeWithGemini(gemini, dataUrl); }
    catch (e: any) { errors.push(`Gemini: ${e?.message || e}`); }
  }
  return { available: false, reason: `AI 분석 실패 — ${errors.join(' / ')}` };
}

export const SKIN_LABELS: { key: keyof SkinScores; label: string }[] = [
  { key: 'moisture', label: '수분' },
  { key: 'oil', label: '유분' },
  { key: 'pigmentation', label: '색소침착' },
  { key: 'pore', label: '모공' },
  { key: 'wrinkle', label: '주름' },
];

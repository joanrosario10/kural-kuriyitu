import type { VercelRequest, VercelResponse } from '@vercel/node';

const NVCF_FUNCTION_ID = '877104f7-e885-42b9-8de8-f6e4c6303969';
const NVCF_TTS_URL = `https://${NVCF_FUNCTION_ID}.invocation.api.nvcf.nvidia.com/v1/audio/synthesize`;

function buildMultipartBody(fields: Record<string, string>): { body: string; boundary: string } {
  const boundary = '----RivaTTS-' + Math.random().toString(36).slice(2);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    lines.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  lines.push(`--${boundary}--\r\n`);
  return { body: lines.join(''), boundary };
}

/**
 * Proxy for NVIDIA Riva TTS in production.
 * Forwards request to NVCF HTTP invocation. Returns JSON errors so client can fall back to Web Speech.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sendJsonError = (status: number, message: string) => {
    res.setHeader('Content-Type', 'application/json');
    return res.status(status).json({ error: message });
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJsonError(405, 'Method not allowed');
  }

  const apiKey = process.env.VITE_NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return sendJsonError(500, 'NVIDIA API key not configured');
  }

  let body: Record<string, unknown> = {};
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  } catch {
    return sendJsonError(400, 'Invalid JSON body');
  }

  const text = String(body.text ?? '');
  const voice = String(body.voice ?? 'Magpie-Multilingual.EN-US.Aria');
  const language_code = String(body.language_code ?? 'en-US');
  const sample_rate = Number(body.sample_rate ?? 24000);

  if (!text.trim()) {
    return sendJsonError(400, 'Missing "text" field');
  }

  try {
    const { body: multipartBody, boundary } = buildMultipartBody({
      text: text.trim(),
      voice,
      language: language_code,
      sample_rate: String(sample_rate),
    });

    const upstream = await fetch(NVCF_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(Buffer.byteLength(multipartBody, 'utf8')),
      },
      body: multipartBody,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[api/riva-tts] Upstream:', upstream.status, errText.slice(0, 200));
      return sendJsonError(502, 'TTS service unavailable');
    }

    const contentType = upstream.headers.get('content-type') || 'audio/wav';
    res.setHeader('Content-Type', contentType);
    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/riva-tts] Error:', message);
    return sendJsonError(500, 'TTS request failed');
  }
}

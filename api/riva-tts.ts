import type { VercelRequest, VercelResponse } from '@vercel/node';

const NVCF_FUNCTION_ID = '877104f7-e885-42b9-8de8-f6e4c6303969';
const NVCF_TTS_URL = `https://${NVCF_FUNCTION_ID}.invocation.api.nvcf.nvidia.com/v1/audio/synthesize`;

/**
 * Proxy for NVIDIA Riva TTS in production.
 * Forwards JSON body to NVCF HTTP invocation endpoint (if exposed by the function).
 * Uses same API key as chat; falls back to Web Speech if this returns an error.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.VITE_NVIDIA_API_KEY || process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA API key not configured' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = String(body.text ?? '');
  const voice = String(body.voice ?? 'Magpie-Multilingual.EN-US.Aria');
  const language_code = String(body.language_code ?? 'en-US');
  const sample_rate = Number(body.sample_rate ?? 24000);

  if (!text.trim()) {
    return res.status(400).json({ error: 'Missing "text" field' });
  }

  try {
    const form = new FormData();
    form.append('text', text);
    form.append('voice', voice);
    form.append('language', language_code);
    form.append('sample_rate', String(sample_rate));

    const upstream = await fetch(NVCF_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('[api/riva-tts] Upstream error:', upstream.status, errText);
      res.status(upstream.status);
      return res.send(errText || JSON.stringify({ error: 'TTS request failed' }));
    }

    const contentType = upstream.headers.get('content-type') || 'audio/wav';
    res.setHeader('Content-Type', contentType);
    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[api/riva-tts] Error:', err);
    return res.status(500).json({ error: 'Failed to reach NVIDIA TTS' });
  }
}

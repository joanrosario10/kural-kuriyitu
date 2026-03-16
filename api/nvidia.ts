import type { VercelRequest, VercelResponse } from '@vercel/node';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Proxy for NVIDIA NIM chat/completions. Frontend calls POST /api/nvidia; we forward to avoid CORS.
 * All errors return JSON so the client can handle them and fall back if needed.
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

  let body: unknown = {};
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  } catch {
    return sendJsonError(400, 'Invalid JSON body');
  }

  try {
    const upstream = await fetch(NVIDIA_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error('[api/nvidia] Upstream:', upstream.status, text.slice(0, 300));
      return sendJsonError(502, 'NVIDIA API error');
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/nvidia] Error:', message);
    return sendJsonError(500, 'Failed to reach NVIDIA API');
  }
}

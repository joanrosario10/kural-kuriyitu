import type { VercelRequest, VercelResponse } from '@vercel/node';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/**
 * Single-route proxy for NVIDIA NIM chat/completions.
 * Frontend calls POST /api/nvidia; we forward to NVIDIA to avoid CORS.
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

  try {
    const upstream = await fetch(NVIDIA_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    console.error('[api/nvidia] Upstream error:', err);
    return res.status(500).json({ error: 'Failed to reach NVIDIA API' });
  }
}

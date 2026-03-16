import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Server-side proxy for NVIDIA NIM.
 *
 * This avoids browser CORS issues by keeping the actual call to
 * https://integrate.api.nvidia.com on the server. The frontend
 * talks only to /api/nvidia/..., which is same-origin.
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
    // Strip the /api/nvidia prefix and forward the remainder to NVIDIA.
    const path = req.url?.replace(/^\/api\/nvidia/, '') || '';
    const url = `https://integrate.api.nvidia.com${path}`;

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();

    // Mirror status and basic headers; CORS is same-origin here.
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    console.error('[api/nvidia] Upstream error:', err);
    return res.status(500).json({ error: 'Failed to reach NVIDIA API' });
  }
}


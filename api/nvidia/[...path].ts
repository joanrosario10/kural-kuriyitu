import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Catch-all proxy for NVIDIA NIM: /api/nvidia/v1/chat/completions etc.
 * Forwards to https://integrate.api.nvidia.com to avoid browser CORS.
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

  const pathSegments = req.query.path;
  const path = Array.isArray(pathSegments) ? pathSegments.join('/') : String(pathSegments || '');
  const upstreamPath = path ? `/${path}` : '';

  try {
    const url = `https://integrate.api.nvidia.com${upstreamPath}`;

    const upstream = await fetch(url, {
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

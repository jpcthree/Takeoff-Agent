/**
 * POST /api/estimate
 * Proxy: forwards address to Python API for existing home estimate.
 * Returns JSON with line items, property data, notes, images, etc.
 */

export const maxDuration = 60;

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address, climate_zone } = body;

    if (!address || typeof address !== 'string') {
      return Response.json({ error: 'Address is required' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    try {
      const res = await fetch(`${PYTHON_API_URL}/estimate/from-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, climate_zone: climate_zone || '5B' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ detail: 'Unknown error' }));
        return Response.json(
          { error: errorBody.detail || `Estimate error: ${res.status}` },
          { status: res.status }
        );
      }

      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return Response.json(
          { error: 'Estimate timed out. The address lookup may be slow — try again.' },
          { status: 504 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Estimate proxy error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Estimate failed' },
      { status: 500 }
    );
  }
}

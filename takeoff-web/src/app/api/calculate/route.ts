/**
 * POST /api/calculate
 * Proxy: forwards building model to Python API calculators.
 * Body: { building_model: object, costs?: object, trade?: string }
 * If trade is specified, runs single trade; otherwise runs all.
 */

export const maxDuration = 60;

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { building_model, costs, trade } = body;

    if (!building_model) {
      return Response.json({ error: 'No building_model provided' }, { status: 400 });
    }

    const path = trade ? `/calculate/${trade}` : '/calculate/all';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(`${PYTHON_API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ building_model, costs: costs || null }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Unknown error');
        return Response.json(
          { error: `Calculator error: ${res.status} - ${errorBody}` },
          { status: res.status }
        );
      }

      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return Response.json(
          { error: 'Calculator timed out. The Python API may be starting up — try again in 30s.' },
          { status: 504 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Calculate proxy error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Calculation failed' },
      { status: 500 }
    );
  }
}

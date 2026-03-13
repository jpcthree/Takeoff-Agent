/**
 * POST /api/pdf/convert
 * Proxy: receives a PDF file upload, forwards to Python API, returns page images.
 * Keeps PYTHON_API_URL server-side only (no NEXT_PUBLIC_ needed).
 */

export const maxDuration = 120; // Pro plan: allow up to 2 min for large PDFs

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const dpi = formData.get('dpi')?.toString() || '150';

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Forward to Python API
    const proxyForm = new FormData();
    proxyForm.append('file', file);

    const url = `${PYTHON_API_URL}/pdf/convert?dpi=${dpi}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: proxyForm,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Unknown error');
        return Response.json(
          { error: `Python API error: ${res.status} - ${errorBody}` },
          { status: res.status }
        );
      }

      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return Response.json(
          { error: 'PDF conversion timed out (90s). Try a smaller file or fewer pages.' },
          { status: 504 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('PDF convert proxy error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'PDF conversion failed' },
      { status: 500 }
    );
  }
}

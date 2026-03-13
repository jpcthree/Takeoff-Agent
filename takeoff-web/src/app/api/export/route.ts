/**
 * POST /api/export
 * Proxy: forwards line items to Python API for .xlsx generation.
 * Returns the binary xlsx file for browser download.
 */

export const maxDuration = 30;

const PYTHON_API_URL =
  process.env.PYTHON_API_URL ||
  process.env.NEXT_PUBLIC_PYTHON_API_URL ||
  'http://localhost:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { line_items, project_name, project_address } = body;

    if (!line_items || !Array.isArray(line_items)) {
      return Response.json({ error: 'No line_items provided' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(`${PYTHON_API_URL}/export/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line_items, project_name, project_address }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Unknown error');
        return Response.json(
          { error: `Export error: ${res.status} - ${errorBody}` },
          { status: res.status }
        );
      }

      // Pass through the binary response
      const blob = await res.blob();
      return new Response(blob, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${project_name || 'Estimate'}.xlsx"`,
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        return Response.json(
          { error: 'Export timed out. Try again.' },
          { status: 504 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Export proxy error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Try loading from the web project's own config directory first (works on Vercel)
    const localConfigPath = path.resolve(process.cwd(), 'config', 'default_costs.json');
    if (fs.existsSync(localConfigPath)) {
      const data = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
      return NextResponse.json(data);
    }

    // Try loading from the parent project's config directory (local dev)
    const parentConfigPath = path.resolve(process.cwd(), '..', 'config', 'default_costs.json');
    if (fs.existsSync(parentConfigPath)) {
      const data = JSON.parse(fs.readFileSync(parentConfigPath, 'utf-8'));
      return NextResponse.json(data);
    }

    // Fallback: try Python API
    const pythonApiUrl = process.env.PYTHON_API_URL || 'http://localhost:8000';
    const res = await fetch(`${pythonApiUrl}/costs/default`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: 'Could not load cost database' },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to load costs: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

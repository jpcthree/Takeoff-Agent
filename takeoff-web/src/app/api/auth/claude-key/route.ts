/**
 * GET /api/auth/claude-key
 *
 * Returns the Anthropic API key for client-side Claude calls.
 * This allows the browser to call Claude directly, avoiding
 * Vercel's body size and timeout limits.
 *
 * In production, this should check the user's Supabase session.
 * For now, it returns the key if configured.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === 'your-anthropic-api-key') {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 503 }
    );
  }

  // TODO: In production, validate Supabase session here:
  // const supabase = createServerClient(...)
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ key: apiKey });
}

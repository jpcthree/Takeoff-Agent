/**
 * GET /api/places/autocomplete?input=...
 * Uses Google Geocoding API to provide address suggestions.
 * Keeps the API key server-side.
 */

import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

function getGoogleApiKey(): string {
  // Try env var first
  const envKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (envKey) return envKey;

  // Fall back to config file
  try {
    const configPath = join(process.cwd(), '..', 'config', 'api_keys.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.google_api_key || '';
  } catch {
    return '';
  }
}

export async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get('input');
  if (!input || input.length < 3) {
    return Response.json({ predictions: [] });
  }

  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    return Response.json(
      { error: 'Google API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Use Geocoding API — already enabled on the project
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', input);
    url.searchParams.set('components', 'country:US');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === 'OK') {
      const predictions = data.results
        .slice(0, 5)
        .map((r: { place_id: string; formatted_address: string }) => ({
          place_id: r.place_id,
          description: r.formatted_address,
        }));

      return Response.json({ predictions });
    }

    if (data.status === 'ZERO_RESULTS') {
      return Response.json({ predictions: [] });
    }

    return Response.json(
      { error: data.error_message || `Geocoding error: ${data.status}` },
      { status: 502 }
    );
  } catch (error) {
    console.error('Address autocomplete error:', error);
    return Response.json(
      { error: 'Failed to fetch address suggestions' },
      { status: 500 }
    );
  }
}

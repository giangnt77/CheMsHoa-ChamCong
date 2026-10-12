import { NextResponse } from 'next/server';

const ALLOWED_TABLES = new Set([
  'availability',
  'branches',
  'employees',
  'employee_rates',
  'penalties',
  'schedule',
  'shift_swaps',
  'system_settings',
]);

const ALLOWED_OPERATIONS = new Set(['select', 'insert', 'upsert', 'update', 'delete']);

export async function POST(request) {
  if (process.env.GOOGLE_SHEETS_API_ENABLED !== 'true') {
    return NextResponse.json(
      { data: null, error: { message: 'Google Sheets connector is disabled.' } },
      { status: 503 }
    );
  }

  const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const apiToken = process.env.GOOGLE_APPS_SCRIPT_API_TOKEN;

  if (!scriptUrl || !apiToken) {
    return NextResponse.json(
      { data: null, error: { message: 'Missing Google Apps Script server configuration.' } },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid request body.' } },
      { status: 400 }
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !ALLOWED_TABLES.has(body.table) ||
    !ALLOWED_OPERATIONS.has(body.operation)
  ) {
    return NextResponse.json(
      { data: null, error: { message: 'Unsupported table or operation.' } },
      { status: 400 }
    );
  }

  try {
    const parsedUrl = new URL(scriptUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'script.google.com') {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid Google Apps Script URL.' } },
        { status: 503 }
      );
    }

    const response = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, token: apiToken }),
      cache: 'no-store',
      redirect: 'follow',
    });
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error(
        `Google Apps Script returned non-JSON (HTTP ${response.status}, ${response.headers.get('content-type') || 'unknown content type'}).`
      );
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'INVALID_SCRIPT_RESPONSE',
            message: 'Google Apps Script did not return JSON. Check its /exec URL, access, and deployment.',
          },
        },
        { status: 502 }
      );
    }

    if (!result || typeof result !== 'object') {
      return NextResponse.json(
        { data: null, error: { code: 'INVALID_SCRIPT_RESPONSE', message: 'Invalid Apps Script response.' } },
        { status: 502 }
      );
    }

    if (!response.ok || !result.ok) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: result.error || `Google Apps Script returned HTTP ${response.status}.`,
            code: result.code,
          },
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch (error) {
    console.error('Google Sheets API error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Could not connect to Google Apps Script.' } },
      { status: 502 }
    );
  }
}

import { NextResponse } from 'next/server';
import https from 'https';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const DEFAULT_BOT_TOKEN = '8903834760:AAEdo7C9zdoj5uC63nMc_rnh7MWMavOhb98';
  let token = searchParams.get('token') || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || '';

  if (!token || token === '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8') {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const sbRes = await fetch(`${supabaseUrl}/rest/v1/system_settings?key=eq.telegram_config&select=value`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          cache: 'no-store',
        });
        if (sbRes.ok) {
          const sbData = await sbRes.json();
          if (Array.isArray(sbData) && sbData.length > 0 && sbData[0].value) {
            const val = typeof sbData[0].value === 'string' ? JSON.parse(sbData[0].value) : sbData[0].value;
            if (val.bot_token && val.bot_token !== '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8') {
              token = val.bot_token;
            }
          }
        }
      }
    } catch (e) {}
  }

  if (!token || token === '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8') {
    token = DEFAULT_BOT_TOKEN;
  }

  try {
    const telegramRes = await new Promise((resolve) => {
      const options = {
        hostname: 'api.telegram.org',
        path: `/bot${token}/getUpdates`,
        method: 'GET',
        family: 4,
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(responseBody));
          } catch (e) {
            resolve({ ok: false, error: 'JSON_PARSE_ERROR' });
          }
        });
      });

      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ ok: false, error: 'TIMEOUT' });
      });

      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.end();
    });

    return NextResponse.json(telegramRes);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err?.message || 'Không thể lấy updates Telegram' }, { status: 500 });
  }
}

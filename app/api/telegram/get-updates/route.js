import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') || '8514257668:AAFjq2t3a9p--jmwLomShVX4HSOJ8WNyIGw';

  const endpoints = [
    `https://api.telegram.org/bot${token}/getUpdates`,
    `https://tg-api-proxy.deno.dev/bot${token}/getUpdates`
  ];

  let lastError = null;
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data && data.ok) {
        return NextResponse.json(data);
      }
    } catch (err) {
      lastError = err;
    }
  }

  return NextResponse.json({ ok: false, error: lastError?.message || 'Không thể lấy updates Telegram' }, { status: 500 });
}

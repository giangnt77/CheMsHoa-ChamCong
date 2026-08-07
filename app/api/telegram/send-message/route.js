import { NextResponse } from 'next/server';
import https from 'https';

export async function POST(request) {
  try {
    const body = await request.json();
    const { token, chatId, text } = body;

    const botToken = token || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || '8514257668:AAFjq2t3a9p--jmwLomShVX4HSOJ8WNyIGw';
    const targetChatId = chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || '5766522088';

    if (!targetChatId || !text) {
      return NextResponse.json({ ok: false, message: 'Thiếu Chat ID hoặc nội dung tin nhắn' });
    }

    const payloadData = JSON.stringify({
      chat_id: String(targetChatId),
      text: text,
      parse_mode: 'HTML',
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadData),
      },
      family: 4,
    };

    const telegramRes = await new Promise((resolve, reject) => {
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
      req.on('error', (err) => reject(err));
      req.write(payloadData);
      req.end();
    });

    return NextResponse.json(telegramRes);
  } catch (err) {
    console.error('Lỗi API Telegram send-message:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

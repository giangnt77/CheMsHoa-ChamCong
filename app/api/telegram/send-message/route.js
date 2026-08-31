import { NextResponse } from 'next/server';
import https from 'https';

// Rate limiting đơn giản: tối đa 5 request/phút/IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Dọn dẹp bộ nhớ rate limit mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.start > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function POST(request) {
  try {
    // Kiểm tra rate limit
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { ok: false, error: 'Bạn đang gửi quá nhanh. Vui lòng đợi 1 phút rồi thử lại!' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { token, chatId, text } = body;

    const DEFAULT_BOT_TOKEN = '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8';
    const DEFAULT_CHAT_ID = '5616165281';

    const botToken = token || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
    const targetChatId = chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;

    if (!botToken || !targetChatId || !text) {
      return NextResponse.json({ ok: false, message: 'Thiếu Bot Token, Chat ID hoặc nội dung tin nhắn' });
    }

    // Giới hạn độ dài tin nhắn (chống abuse)
    const safeText = String(text).slice(0, 4000);

    const payloadData = JSON.stringify({
      chat_id: String(targetChatId),
      text: safeText,
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
      req.setTimeout(6000, () => {
        req.destroy();
        resolve({ ok: false, error: 'TIMEOUT' });
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.write(payloadData);
      req.end();
    });

    return NextResponse.json(telegramRes);
  } catch (err) {
    console.error('Lỗi API Telegram send-message:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}


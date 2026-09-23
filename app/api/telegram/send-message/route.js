import { NextResponse } from 'next/server';
import https from 'https';

// Rate limiting: tối đa 60 request/phút/IP (chống spam nhưng không nghẽn hệ thống)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 phút
const RATE_LIMIT_MAX = 60;

function isRateLimited(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return false;
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { start: now, count: 1 });
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
    const { token, chatId, text, isTest } = body;

    const DEFAULT_BOT_TOKEN = '8903834760:AAEdo7C9zdoj5uC63nMc_rnh7MWMavOhb98';
    const DEFAULT_CHAT_ID = '5616165281';

    let botToken = (token && token !== '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8') ? token : null;
    let targetChatId = chatId || null;

    // Nếu thiếu token hoặc chatId, truy vấn cấu hình từ Supabase
    if (!botToken || !targetChatId) {
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
              if (!botToken && val.bot_token && val.bot_token !== '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8') {
                botToken = val.bot_token;
              }
              if (!targetChatId && val.chat_id) {
                targetChatId = val.chat_id;
              }
            }
          }
        }
      } catch (sbErr) {
        console.warn('Lỗi đọc telegram_config từ Supabase trong send-message:', sbErr.message);
      }
    }

    botToken = botToken || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
    targetChatId = targetChatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;

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


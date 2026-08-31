import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Đọc file .env.local
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        process.env[key.trim()] = rest.join('=').trim();
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Lỗi: Không tìm thấy NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLES_ORDER = [
  'system_settings',
  'branches',
  'employees',
  'employee_rates',
  'availability',
  'schedule',
  'penalties',
  'shift_swaps'
];

async function runRestore() {
  const backupDir = path.resolve(process.cwd(), 'backups');
  let targetFile = process.argv[2];

  if (!targetFile) {
    if (!fs.existsSync(backupDir)) {
      console.error('❌ Không tìm thấy thư mục backups!');
      process.exit(1);
    }
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort().reverse();
    if (files.length === 0) {
      console.error('❌ Không tìm thấy file backup nào trong thư mục backups!');
      process.exit(1);
    }
    targetFile = path.join(backupDir, files[0]);
    console.log(`💡 Tự động chọn file backup mới nhất: ${files[0]}`);
  } else {
    targetFile = path.resolve(process.cwd(), targetFile);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`❌ File backup không tồn tại: ${targetFile}`);
    process.exit(1);
  }

  console.log(`🚀 Bắt đầu khôi phục dữ liệu từ: ${targetFile}\n`);
  const rawContent = fs.readFileSync(targetFile, 'utf8');
  const backupData = JSON.parse(rawContent);

  if (!backupData.tables) {
    console.error('❌ Định dạng file backup không hợp lệ!');
    process.exit(1);
  }

  for (const table of TABLES_ORDER) {
    const rows = backupData.tables[table];
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      console.log(`ℹ️ Bảng ${table}: Không có dữ liệu để khôi phục.`);
      continue;
    }

    console.log(`⏳ Đang nạp ${rows.length} dòng vào bảng ${table}...`);
    const chunkSize = 200;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(table).upsert(chunk, { ignoreDuplicates: false });
      if (error) {
        console.warn(`⚠️ Lỗi khi nạp bảng ${table} (lô ${i + 1}-${i + chunk.length}): ${error.message}`);
      } else {
        inserted += chunk.length;
      }
    }
    console.log(`✅ Bảng ${table}: Khôi phục thành công ${inserted}/${rows.length} dòng.`);
  }

  console.log(`\n🎉 QUÁ TRÌNH KHÔI PHỤC DỮ LIỆU ĐÃ HOÀN TẤT!`);
}

runRestore();

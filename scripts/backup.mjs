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

const TABLES = [
  'system_settings',
  'branches',
  'employees',
  'employee_rates',
  'availability',
  'schedule',
  'penalties',
  'shift_swaps'
];

async function runBackup() {
  console.log('🚀 Bắt đầu quá trình sao lưu toàn bộ dữ liệu Chè Ms Hoa...\n');
  const backupData = {
    version: '1.0',
    backup_date: new Date().toISOString(),
    project_url: supabaseUrl,
    tables: {}
  };

  for (const table of TABLES) {
    try {
      console.log(`⏳ Đang sao lưu bảng: ${table}...`);
      let allRows = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          console.warn(`⚠️ Bảng ${table}: ${error.message}`);
          break;
        }

        if (data && data.length > 0) {
          allRows = allRows.concat(data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      backupData.tables[table] = allRows;
      console.log(`✅ Bảng ${table}: Đã sao lưu ${allRows.length} dòng.`);
    } catch (err) {
      console.error(`❌ Lỗi khi tải bảng ${table}:`, err.message);
      backupData.tables[table] = [];
    }
  }

  // Tạo thư mục backups nếu chưa có
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `chems_hoa_backup_${dateStr}.json`;
  const filePath = path.join(backupDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

  console.log(`\n🎉 SAO LƯU THÀNH CÔNG!`);
  console.log(`📁 File lưu tại: ${filePath}`);
  console.log(`📊 Tổng kích thước file: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
}

runBackup();

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

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

async function runExcelBackup() {
  console.log('📊 Bắt đầu quá trình sao lưu toàn bộ dữ liệu ra file EXCEL (.xlsx)...\n');
  const tables = {};

  for (const table of TABLES) {
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
    tables[table] = allRows;
    console.log(`✅ Đã tải bảng ${table}: ${allRows.length} dòng.`);
  }

  // 1. Tạo Map tên nhân viên và chi nhánh
  const empMap = {};
  (tables.employees || []).forEach((e) => {
    empMap[e.id] = e.name || 'Không rõ';
  });

  const branchMap = {};
  (tables.branches || []).forEach((b) => {
    branchMap[b.id] = b.name || 'Không rõ';
  });

  // 2. Tạo workbook mới
  const workbook = XLSX.utils.book_new();

  // SHEET 1: NHÂN VIÊN
  const empRows = (tables.employees || []).map((e, idx) => ({
    'STT': idx + 1,
    'Họ và Tên': e.name || '',
    'Biệt Danh': e.nickname || '',
    'Mức Lương (VNĐ/h)': e.hourly_rate || 20000,
    'Chức Vụ': e.role === 'owner' ? 'Chủ Quán' : (e.role === 'manager' ? 'Quản Lý' : 'Nhân Viên'),
    'Trạng Thái': e.status === 'off' || e.is_active === false ? 'Đã Nghỉ Việc' : (e.status === 'leave' ? 'Xin Nghỉ Tạm' : 'Đang Làm Việc'),
    'Số Điện Thoại': e.phone || '',
    'SĐT Người Thân': e.relative_phone || '',
    'Địa Chỉ': e.address || '',
    'Ngân Hàng': e.bank_name || '',
    'Số Tài Khoản': e.bank_account_number || '',
    'Chủ Tài Khoản': e.bank_account_holder || '',
    'Ngày Vào Làm': e.created_at ? e.created_at.slice(0, 10) : '',
    'Ngày Nghỉ Việc': e.resigned_at || '',
    'Mã PIN Cá Nhân': e.pin || '',
    'Ghi Chú': e.note || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(empRows), 'Danh Sách Nhân Viên');

  // SHEET 2: CHI NHÁNH
  const branchRows = (tables.branches || []).map((b, idx) => ({
    'STT': idx + 1,
    'Tên Chi Nhánh': b.name || '',
    'Mã Màu': b.color || '#f59e0b',
    'Thứ Tự Hiển Thị': b.sort_order || idx + 1,
    'Trạng Thái': b.is_active === false ? 'Đã Ẩn' : 'Đang Hoạt Động',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(branchRows), 'Chi Nhánh');

  // SHEET 3: LỊCH LÀM VIỆC CHÍNH THỨC
  const schedRows = (tables.schedule || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((s, idx) => ({
    'STT': idx + 1,
    'Ngày Làm Việc': s.date || '',
    'Nhân Viên': empMap[s.employee_id] || s.employee_id || '',
    'Chi Nhánh': branchMap[s.branch_id] || s.branch_id || '',
    'Giờ Bắt Đầu': s.start_time ? String(s.start_time).slice(0, 5) : '',
    'Giờ Kết Thúc': s.end_time ? String(s.end_time).slice(0, 5) : '',
    'Tổng Số Tiếng': Number(s.hours) || 0,
    'Ghi Chú Ca Làm': s.note || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(schedRows), 'Lịch Làm Việc');

  // SHEET 4: ĐĂNG KÝ LỊCH RẢNH
  const availRows = (tables.availability || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((a, idx) => ({
    'STT': idx + 1,
    'Ngày': a.date || '',
    'Nhân Viên': empMap[a.employee_id] || a.employee_id || '',
    'Loại Đăng Ký': a.type === 'full' ? 'Làm Cả Ngày' : (a.type === 'off' ? 'Xin Nghỉ (Off)' : 'Làm Tùy Ca'),
    'Ghi Chú / Lý Do': a.note || '',
    'Người Gán': a.is_admin_assigned ? 'Quản Lý Gán' : 'Nhân Viên Tự Đăng Ký',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(availRows), 'Đăng Ký Lịch Rảnh');

  // SHEET 5: THƯỞNG & PHẠT
  const penaltyRows = (tables.penalties || []).sort((a, b) => (b.month || '').localeCompare(a.month || '')).map((p, idx) => ({
    'STT': idx + 1,
    'Tháng Áp Dụng': p.month || '',
    'Ngày Ghi Nhận': p.date || '',
    'Nhân Viên': empMap[p.employee_id] || p.employee_id || '',
    'Loại': p.type === 'bonus' ? 'Thưởng (Phụ Cấp)' : 'Phạt (Khấu Trừ)',
    'Số Tiền (VNĐ)': Number(p.amount) || 0,
    'Lý Do Chi Tiết': p.reason || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(penaltyRows), 'Thưởng & Phạt');

  // SHEET 6: LỊCH SỬ TĂNG LƯƠNG
  const rateRows = (tables.employee_rates || []).sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || '')).map((r, idx) => ({
    'STT': idx + 1,
    'Nhân Viên': empMap[r.employee_id] || r.employee_id || '',
    'Mức Lương Mới (VNĐ/h)': Number(r.hourly_rate) || 0,
    'Ngày Có Hiệu Lực': r.effective_date || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rateRows), 'Mốc Tăng Lương');

  // SHEET 7: YÊU CẦU ĐỔI CA
  const swapRows = (tables.shift_swaps || []).sort((a, b) => (b.shift_date || '').localeCompare(a.shift_date || '')).map((sw, idx) => ({
    'STT': idx + 1,
    'Ngày Diễn Ra': sw.shift_date || '',
    'Nhân Viên Yêu Cầu': sw.requester_name || empMap[sw.requester_id] || '',
    'Đổi Với / Đối Tượng': sw.target_employee_name || empMap[sw.target_employee_id] || '',
    'Loại Yêu Cầu': sw.request_type === 'time_change' ? 'Báo Đổi Giờ Làm' : 'Đổi Ca Làm',
    'Hình Thức Giờ': sw.time_change_type || 'swap',
    'Ca Gốc': sw.original_time || sw.my_shift_info || '',
    'Ca Thực Tế': sw.adjusted_time || sw.target_shift_info || '',
    'Chênh Lệch Giờ': sw.extra_hours || 0,
    'Lý Do': sw.reason || '',
    'Trạng Thái': sw.status === 'approved' ? 'Đã Duyệt' : (sw.status === 'rejected' ? 'Từ Chối' : 'Chờ Duyệt'),
    'Lý Do Từ Chối': sw.rejection_reason || '',
    'Thời Gian Tạo': sw.created_at || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(swapRows), 'Yêu Cầu Đổi Ca');

  // SHEET 8: CẤU HÌNH HỆ THỐNG
  const settingsRows = (tables.system_settings || []).map((s, idx) => ({
    'STT': idx + 1,
    'Khóa Cấu Hình': s.key || '',
    'Giá Trị': typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value || ''),
    'Cập Nhật Lúc': s.updated_at || '',
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settingsRows), 'Cấu Hình Hệ Thống');

  // Lưu file Excel vào thư mục backups
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const fileName = `CheMsHoa_Backup_ToanBo_${y}-${m}-${d}.xlsx`;
  const filePath = path.join(backupDir, fileName);

  XLSX.writeFile(workbook, filePath);

  console.log(`\n🎉 XUẤT FILE EXCEL THÀNH CÔNG!`);
  console.log(`📁 File lưu tại: ${filePath}`);
  console.log(`📊 Tổng kích thước: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);
  console.log(`📋 Các sheet: Nhân viên (${empRows.length}), Lịch làm (${schedRows.length}), Đăng ký (${availRows.length}), Thưởng/Phạt (${penaltyRows.length}), Mốc lương (${rateRows.length}), Đổi ca (${swapRows.length}).`);
}

runExcelBackup();

import * as XLSX from 'xlsx';
import { exportAllDataToJSON } from './supabase';

/**
 * Xuất toàn bộ dữ liệu 8 bảng trong cơ sở dữ liệu thành file Excel (.xlsx) đa sheet chuẩn đẹp
 */
export async function exportAllDataToExcel() {
  const data = await exportAllDataToJSON();
  const tables = data.tables || {};

  // 1. Tạo Map tên nhân viên và chi nhánh để điền tên tiếng Việt thay vì UUID
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

  // --- SHEET 1: NHÂN VIÊN ---
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
  const wsEmployees = XLSX.utils.json_to_sheet(empRows);
  XLSX.utils.book_append_sheet(workbook, wsEmployees, 'Danh Sách Nhân Viên');

  // --- SHEET 2: CHI NHÁNH ---
  const branchRows = (tables.branches || []).map((b, idx) => ({
    'STT': idx + 1,
    'Tên Chi Nhánh': b.name || '',
    'Mã Màu': b.color || '#f59e0b',
    'Thứ Tự Hiển Thị': b.sort_order || idx + 1,
    'Trạng Thái': b.is_active === false ? 'Đã Ẩn' : 'Đang Hoạt Động',
  }));
  const wsBranches = XLSX.utils.json_to_sheet(branchRows);
  XLSX.utils.book_append_sheet(workbook, wsBranches, 'Chi Nhánh');

  // --- SHEET 3: LỊCH LÀM VIỆC CHÍNH THỨC ---
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
  const wsSchedule = XLSX.utils.json_to_sheet(schedRows);
  XLSX.utils.book_append_sheet(workbook, wsSchedule, 'Lịch Làm Việc');

  // --- SHEET 4: ĐĂNG KÝ LỊCH RẢNH ---
  const availRows = (tables.availability || []).sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((a, idx) => ({
    'STT': idx + 1,
    'Ngày': a.date || '',
    'Nhân Viên': empMap[a.employee_id] || a.employee_id || '',
    'Loại Đăng Ký': a.type === 'full' ? 'Làm Cả Ngày' : (a.type === 'off' ? 'Xin Nghỉ (Off)' : 'Làm Tùy Ca'),
    'Ghi Chú / Lý Do': a.note || '',
    'Người Gán': a.is_admin_assigned ? 'Quản Lý Gán' : 'Nhân Viên Tự Đăng Ký',
  }));
  const wsAvail = XLSX.utils.json_to_sheet(availRows);
  XLSX.utils.book_append_sheet(workbook, wsAvail, 'Đăng Ký Lịch Rảnh');

  // --- SHEET 5: THƯỞNG & PHẠT ---
  const penaltyRows = (tables.penalties || []).sort((a, b) => (b.month || '').localeCompare(a.month || '')).map((p, idx) => ({
    'STT': idx + 1,
    'Tháng Áp Dụng': p.month || '',
    'Ngày Ghi Nhận': p.date || '',
    'Nhân Viên': empMap[p.employee_id] || p.employee_id || '',
    'Loại': p.type === 'bonus' ? 'Thưởng (Phụ Cấp)' : 'Phạt (Khấu Trừ)',
    'Số Tiền (VNĐ)': Number(p.amount) || 0,
    'Lý Do Chi Tiết': p.reason || '',
  }));
  const wsPenalties = XLSX.utils.json_to_sheet(penaltyRows);
  XLSX.utils.book_append_sheet(workbook, wsPenalties, 'Thưởng & Phạt');

  // --- SHEET 6: LỊCH SỬ TĂNG LƯƠNG ---
  const rateRows = (tables.employee_rates || []).sort((a, b) => (b.effective_date || '').localeCompare(a.effective_date || '')).map((r, idx) => ({
    'STT': idx + 1,
    'Nhân Viên': empMap[r.employee_id] || r.employee_id || '',
    'Mức Lương Mới (VNĐ/h)': Number(r.hourly_rate) || 0,
    'Ngày Có Hiệu Lực': r.effective_date || '',
  }));
  const wsRates = XLSX.utils.json_to_sheet(rateRows);
  XLSX.utils.book_append_sheet(workbook, wsRates, 'Mốc Tăng Lương');

  // --- SHEET 7: YÊU CẦU ĐỔI CA & BÁO GIỜ ---
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
  const wsSwaps = XLSX.utils.json_to_sheet(swapRows);
  XLSX.utils.book_append_sheet(workbook, wsSwaps, 'Yêu Cầu Đổi Ca');

  // --- SHEET 8: CẤU HÌNH HỆ THỐNG ---
  const settingsRows = (tables.system_settings || []).map((s, idx) => ({
    'STT': idx + 1,
    'Khóa Cấu Hình': s.key || '',
    'Giá Trị': typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value || ''),
    'Cập Nhật Lúc': s.updated_at || '',
  }));
  const wsSettings = XLSX.utils.json_to_sheet(settingsRows);
  XLSX.utils.book_append_sheet(workbook, wsSettings, 'Cấu Hình Hệ Thống');

  // 3. Xuất file binary
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return { excelBuffer, rowCounts: {
    employees: empRows.length,
    schedule: schedRows.length,
    availability: availRows.length,
    penalties: penaltyRows.length,
    rates: rateRows.length,
    swaps: swapRows.length,
  }};
}

/**
 * Kích hoạt tải file Excel trực tiếp trên trình duyệt Web
 */
export async function downloadExcelBackup() {
  const { excelBuffer, rowCounts } = await exportAllDataToExcel();
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
  });

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const fileName = `CheMsHoa_Backup_ToanBo_${y}-${m}-${d}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { fileName, rowCounts };
}

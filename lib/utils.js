// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format số tiền VNĐ
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Tính số giờ giữa 2 mốc thời gian
 */
export function calculateHours(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hours < 0) hours += 24; // qua ngày
  return Math.round(hours * 100) / 100;
}

/**
 * Format date string sang tiếng Việt
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Format date ngắn gọn
 */
export function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * Format ngày đầy đủ DD/MM/YYYY
 */
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return String(dateStr);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Lấy tháng hiện tại dạng YYYY-MM
 */
export function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Lấy ngày hiện tại dạng YYYY-MM-DD
 */
export function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateISO(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format tên tháng tiếng Việt
 */
export function getMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

/**
 * Lấy thông tin calendar cho 1 tháng
 */
export function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Bắt đầu từ thứ Hai (1) thay vì CN (0)
  let startDayOfWeek = firstDay.getDay();
  if (startDayOfWeek === 0) startDayOfWeek = 7;
  startDayOfWeek -= 1; // 0-indexed from Monday

  const days = [];

  // Ngày tháng trước
  const prevMonth = new Date(year, month, 0);
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: prevMonth.getDate() - i,
      isCurrentMonth: false,
      date: null,
    });
  }

  // Ngày tháng hiện tại
  for (let i = 1; i <= daysInMonth; i++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({
      day: i,
      isCurrentMonth: true,
      date,
    });
  }

  // Ngày tháng sau
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: null,
      });
    }
  }

  return days;
}

/**
 * Lấy avatar initials từ tên tiếng Việt
 */
export function getInitials(name) {
  if (!name) return 'NV';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Lấy style chuẩn màu sắc động của chi nhánh dựa trên mã color lưu trong Database 100% (Zero Hardcode)
 */
export function getBranchColorStyle(name = '', colorFromDb = '') {
  // Lấy màu hex từ DB, nếu không có thì mặc định màu tím nhã nhặn #7e22ce
  const hex = colorFromDb && String(colorFromDb).startsWith('#') ? colorFromDb : '#7e22ce';

  // Kiểm tra độ sáng của màu hex để quyết định màu chữ (Trắng hoặc Đen)
  let isLight = false;
  try {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    // Công thức tính độ sáng YIQ
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = yiq >= 180;
  } catch (e) {
    isLight = false;
  }

  return {
    hex: hex,
    badgeStyle: {
      backgroundColor: hex,
      borderColor: hex,
      color: isLight ? '#0f172a' : '#ffffff',
    },
    text: hex,
    bg: `${hex}18`,
    border: `${hex}40`,
  };
}

/**
 * Tạo ID ngẫu nhiên
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

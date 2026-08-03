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
  return now.toISOString().split('T')[0];
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
 * Lấy chữ cái đầu của tên
 */
export function getInitials(name) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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

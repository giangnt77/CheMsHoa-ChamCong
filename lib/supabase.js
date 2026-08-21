import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http');

// Cơ chế Singleton Client loại bỏ hoàn toàn cảnh báo Multiple GoTrueClient (Safe for iOS 14/15 Safari)
const globalForSupabase =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : {};

export const supabase = isConfigured
  ? (globalForSupabase._supabaseClient ||
      (globalForSupabase._supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })))
  : null;

function checkSupabase() {
  if (!supabase) {
    throw new Error('⚠️ Supabase chưa được cấu hình!');
  }
}

// ============================================
// SYSTEM SETTINGS / RULES FOR BLOCKED OFF DAYS
// ============================================

export async function getBlockedOffDays() {
  let cached = {};
  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_blocked_off_days');
      if (localData) {
        cached = JSON.parse(localData);
      }
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'blocked_off_days')
        .maybeSingle();
      if (!error && data && data.value !== undefined && data.value !== null) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_blocked_off_days', JSON.stringify(data.value));
          } catch (e) {}
        }
        return data.value;
      }
    }
  } catch (err) {
    console.error('getBlockedOffDays error:', err);
  }

  return cached;
}

export async function saveBlockedOffDays(daysList) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_blocked_off_days', JSON.stringify(daysList));
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'blocked_off_days', value: daysList, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) console.error('saveBlockedOffDays error:', error);
    }
  } catch (err) {
    console.error('saveBlockedOffDays error:', err);
  }
  return daysList;
}

// ============================================
// SYSTEM ANNOUNCEMENT NOTICES (TỰ ĐỘNG LƯU SUPABASE)
// ============================================

export async function getAnnouncementNotice() {
  const DEFAULT_NOTICE = '📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!';

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'announcement_notice')
        .single();
      if (!error && data?.value) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_admin_notice_content', String(data.value));
          } catch (e) {}
        }
        return String(data.value);
      }
    }
  } catch (err) {}

  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_admin_notice_content');
      if (localData) return localData;
    } catch (e) {}
  }
  return DEFAULT_NOTICE;
}

export async function saveAnnouncementNotice(content) {
  const cleanText = String(content || '').trim();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_admin_notice_content', cleanText);
    } catch (e) {}
  }

  try {
    if (supabase) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'announcement_notice', value: cleanText }, { onConflict: 'key' });
    }
  } catch (err) {}
  return cleanText;
}

// ============================================
// CHẾ ĐỘ ĐĂNG KÝ DỊP ĐẶC BIỆT (TẾT/LỄ 1 THÁNG)
// ============================================

export async function getSpecialEventMode() {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'special_event_mode')
        .single();
      if (!error && data?.value !== undefined) {
        return Boolean(data.value);
      }
    }
  } catch (err) {}

  if (typeof window !== 'undefined') {
    try {
      const localMode = localStorage.getItem('chems_special_event_mode');
      if (localMode !== null) return localMode === 'true';
    } catch (e) {}
  }
  return false;
}

export async function saveSpecialEventMode(enabled) {
  const isEnabled = Boolean(enabled);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_special_event_mode', String(isEnabled));
    } catch (e) {}
  }

  try {
    if (supabase) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'special_event_mode', value: isEnabled }, { onConflict: 'key' });
    }
  } catch (err) {}
  return isEnabled;
}

// ============================================
// CẤU HÌNH NGÀY LỄ / TẾT & HỆ SỐ LƯƠNG (x2, x3...)
// ============================================

export async function getHolidaySettings() {
  let cached = [];
  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_holiday_rates');
      if (localData) {
        cached = JSON.parse(localData);
        if (!Array.isArray(cached)) cached = [];
      }
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'holiday_rates')
        .maybeSingle();
      if (!error && data && data.value !== undefined && data.value !== null) {
        const val = Array.isArray(data.value) ? data.value : [];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_holiday_rates', JSON.stringify(val));
          } catch (e) {}
        }
        return val;
      }
    }
  } catch (err) {
    console.error('getHolidaySettings error:', err);
  }

  return cached;
}

export async function saveHolidaySettings(holidaysList) {
  const cleanList = Array.isArray(holidaysList) ? holidaysList : [];
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_holiday_rates', JSON.stringify(cleanList));
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'holiday_rates', value: cleanList, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) console.error('saveHolidaySettings error:', error);
    }
  } catch (err) {
    console.error('saveHolidaySettings error:', err);
  }
  return cleanList;
}

/**
 * Tìm thông tin ngày lễ cho một ngày cụ thể (nếu có)
 */
export function getHolidayForDate(dateStr, holidaysList = []) {
  if (!dateStr || !Array.isArray(holidaysList) || holidaysList.length === 0) return null;
  const targetDate = String(dateStr).slice(0, 10);
  return holidaysList.find((h) => {
    if (!h) return false;
    if (h.date && String(h.date).slice(0, 10) === targetDate) return true;
    if (h.startDate && h.endDate) {
      return targetDate >= h.startDate && targetDate <= h.endDate;
    }
    return false;
  }) || null;
}

// ============================================
// EMPLOYEE OPERATIONS
// ============================================

export async function getEmployees() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
          const cachedNick = localStorage.getItem(`chems_emp_nickname_${e.id}`);
          if (cachedNick !== null) ext.nickname = cachedNick;
          const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${e.id}`);
          if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
        } catch (err) {}
      }
      if (e.note && e.note.startsWith('{')) {
        try {
          const parsed = JSON.parse(e.note);
          ext = { ...ext, ...parsed };
        } catch (err) {}
      }
      const finalNick = e.nickname !== undefined && e.nickname !== null ? e.nickname : ext.nickname || '';
      const finalNickTime = e.nickname_updated_at || ext.nickname_updated_at || null;
      return { ...e, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };
    });

    // GIỮ LẠI CÁC NHÂN VIÊN ĐANG LÀM ('active') VÀ XIN OFF TẠM THỜI ('leave'), chỉ lọc bỏ người đã nghỉ hẳn ('off')
    const res = list.filter((e) => e.status !== 'off' && e.is_active !== false);

    if (res.length > 0 && typeof window !== 'undefined') {
      try {
        localStorage.setItem('chems_employees_cache', JSON.stringify(res));
      } catch (e) {}
    }
    return res;
  } catch (err) {
    console.error('getEmployees Error:', err);
    // Try fallback to local storage cache if Network/Safari Fetch throws
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chems_employees_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  }
}

function getLocalTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getAllEmployees() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const todayStr = getLocalTodayStr();
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
          const cachedNick = localStorage.getItem(`chems_emp_nickname_${e.id}`);
          if (cachedNick !== null) ext.nickname = cachedNick;
          const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${e.id}`);
          if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
        } catch (err) {}
      }
      if (e.note && e.note.startsWith('{')) {
        try {
          const parsed = JSON.parse(e.note);
          ext = { ...ext, ...parsed };
        } catch (err) {}
      }

      const finalNick = e.nickname !== undefined && e.nickname !== null ? e.nickname : ext.nickname || '';
      const finalNickTime = e.nickname_updated_at || ext.nickname_updated_at || null;
      let empObj = { ...e, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };

      // TỰ ĐỘNG CHUYỂN TRẠNG THÁI: KHI ĐÃ QUA NGÀY KẾT THÚC OFF (today > off_end_date) -> TỰ ĐỘNG CHUYỂN VỀ 'active' (ĐANG LÀM VIỆC)
      if (empObj.status === 'leave') {
        const offEnd = empObj.off_end_date || empObj.off_date || empObj.off_start_date;
        if (offEnd && todayStr > offEnd) {
          empObj.status = 'active';
          // Đồng bộ ngầm lên Supabase DB
          try {
            supabase
              .from('employees')
              .update({ status: 'active' })
              .eq('id', e.id)
              .then(() => {});
          } catch (err) {}
        }
      }

      return empObj;
    });
    return list.sort((a, b) => {
      const isOffA = a.status === 'off';
      const isOffB = b.status === 'off';
      if (isOffA !== isOffB) return isOffA ? 1 : -1;
      return 0;
    });
  } catch (err) {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name');
    if (error) throw error;
    const todayStr = getLocalTodayStr();
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
        } catch (err) {}
      }

      let empObj = { ...e, ...ext };

      if (empObj.status === 'leave') {
        const offEnd = empObj.off_end_date || empObj.off_date || empObj.off_start_date;
        if (offEnd && todayStr > offEnd) {
          empObj.status = 'active';
          try {
            supabase
              .from('employees')
              .update({ status: 'active' })
              .eq('id', e.id)
              .then(() => {});
          } catch (err) {}
        }
      }

      return empObj;
    });
    return list.sort((a, b) => {
      const isOffA = a.status === 'off';
      const isOffB = b.status === 'off';
      if (isOffA !== isOffB) return isOffA ? 1 : -1;
      return 0;
    });
  }
}

export async function updateEmployeesSortOrders(employeeOrders) {
  checkSupabase();
  const promises = employeeOrders.map(({ id, sort_order }) =>
    supabase
      .from('employees')
      .update({ sort_order })
      .eq('id', id)
  );
  const results = await Promise.all(promises);
  return results;
}

export async function updateEmployeeContactInfo(id, contactData = {}) {
  checkSupabase();
  const payload = {};
  if (contactData.phone !== undefined) payload.phone = contactData.phone;
  if (contactData.relative_phone !== undefined) payload.relative_phone = contactData.relative_phone;
  if (contactData.address !== undefined) payload.address = contactData.address;
  if (contactData.cccd_url !== undefined) payload.cccd_url = contactData.cccd_url;

  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeBankInfo(id, bankData = {}) {
  checkSupabase();
  const payload = {};
  if (bankData.bank_name !== undefined) payload.bank_name = bankData.bank_name;
  if (bankData.bank_account_number !== undefined) payload.bank_account_number = bankData.bank_account_number;
  if (bankData.bank_account_holder !== undefined) payload.bank_account_holder = bankData.bank_account_holder;
  if (bankData.bank_qr_code_url !== undefined) payload.bank_qr_code_url = bankData.bank_qr_code_url;

  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getEmployeeByName(name) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', name.trim())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;

  let ext = {};
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`chems_emp_status_ext_${data.id}`);
      if (cached) ext = JSON.parse(cached);
      const cachedNick = localStorage.getItem(`chems_emp_nickname_${data.id}`);
      if (cachedNick !== null) ext.nickname = cachedNick;
      const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${data.id}`);
      if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
    } catch (err) {}
  }
  if (data.note && data.note.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.note);
      ext = { ...ext, ...parsed };
    } catch (err) {}
  }
  const finalNick = data.nickname !== undefined && data.nickname !== null ? data.nickname : ext.nickname || '';
  const finalNickTime = data.nickname_updated_at || ext.nickname_updated_at || null;
  return { ...data, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };
}

export const NICKNAME_COOLDOWN_DAYS = 60;

/**
 * Kiểm tra xem nhân viên có đang trong thời gian khóa đổi biệt danh (2 tháng = 60 ngày) không
 * @param {string|null} updatedAt - Thời điểm đổi biệt danh gần nhất
 * @returns {{ isLocked: boolean, daysLeft: number, unlockDateStr: string }}
 */
export function checkNicknameCooldown(updatedAt) {
  if (!updatedAt) return { isLocked: false, daysLeft: 0, unlockDateStr: '' };

  const lastTime = new Date(updatedAt).getTime();
  if (isNaN(lastTime)) return { isLocked: false, daysLeft: 0, unlockDateStr: '' };

  const unlockTime = lastTime + NICKNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= unlockTime) {
    return { isLocked: false, daysLeft: 0, unlockDateStr: '' };
  }

  const msLeft = unlockTime - now;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  const d = new Date(unlockTime);
  const dayStr = String(d.getDate()).padStart(2, '0');
  const monthStr = String(d.getMonth() + 1).padStart(2, '0');
  const yearStr = d.getFullYear();
  const unlockDateStr = `${dayStr}/${monthStr}/${yearStr}`;

  return { isLocked: true, daysLeft, unlockDateStr };
}

export async function updateEmployeeNickname(id, nickname) {
  checkSupabase();
  const cleanNick = String(nickname || '').trim();
  const nowISO = new Date().toISOString();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`chems_emp_nickname_${id}`, cleanNick);
      localStorage.setItem(`chems_emp_nick_time_${id}`, nowISO);
    } catch (e) {}
  }

  // Cố gắng update trực tiếp trường nickname và nickname_updated_at
  try {
    const { data, error } = await supabase
      .from('employees')
      .update({ nickname: cleanNick, nickname_updated_at: nowISO })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      return { ...data, nickname: cleanNick, nickname_updated_at: nowISO };
    }
  } catch (err) {}

  // Fallback lưu vào trường note JSON
  try {
    const { data: emp } = await supabase.from('employees').select('note').eq('id', id).single();
    let currentExt = {};
    if (emp?.note && emp.note.startsWith('{')) {
      try { currentExt = JSON.parse(emp.note); } catch (e) {}
    }
    currentExt.nickname = cleanNick;
    currentExt.nickname_updated_at = nowISO;
    const { data, error } = await supabase
      .from('employees')
      .update({ note: JSON.stringify(currentExt) })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, nickname: cleanNick, nickname_updated_at: nowISO };
  } catch (fallbackErr) {
    console.error('updateEmployeeNickname fallback error:', fallbackErr);
    return { id, nickname: cleanNick, nickname_updated_at: nowISO };
  }
}

export async function createEmployee(name, pin = '123456', hourlyRate = 20000, createdAt = null) {
  checkSupabase();
  const payload = { name: name.trim(), pin: pin.trim(), hourly_rate: Number(hourlyRate) || 20000 };
  if (createdAt) {
    payload.created_at = new Date(createdAt + 'T00:00:00').toISOString();
  }
  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeRate(id, hourlyRate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update({ hourly_rate: hourlyRate })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeName(id, name) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeCreatedAt(id, createdAt) {
  checkSupabase();
  const isoDate = new Date(createdAt + 'T00:00:00').toISOString();
  const { data, error } = await supabase
    .from('employees')
    .update({ created_at: isoDate })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeStatus(id, status, extraFields = {}) {
  checkSupabase();
  const isActive = status !== 'off';

  // Always save extraFields to local storage as fallback cache
  if (typeof window !== 'undefined' && Object.keys(extraFields).length > 0) {
    try {
      const existingStr = localStorage.getItem(`chems_emp_status_ext_${id}`);
      const existing = existingStr ? JSON.parse(existingStr) : {};
      const merged = { ...existing, ...extraFields };
      localStorage.setItem(`chems_emp_status_ext_${id}`, JSON.stringify(merged));
    } catch (e) {}
  }

  // Try updating DB with full fields if schema supports them
  try {
    const payload = {
      status: status,
      is_active: isActive,
      ...extraFields,
    };
    const { data, error } = await supabase
      .from('employees')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data;
  } catch (err) {}

  // Safe Fallback: Update default fields only to avoid PostgREST PGRST204 missing column error
  const { data, error } = await supabase
    .from('employees')
    .update({ status: status, is_active: isActive })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return { ...data, status: status, is_active: isActive, ...extraFields };
}

// ============================================
// EMPLOYEE RATES HISTORY & DYNAMIC SALARY CALCULATOR
// ============================================

export async function getEmployeeRates(employeeId) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employee_rates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getEmployeeRates fallback:', err);
    return [];
  }
}

export async function getAllEmployeeRates() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employee_rates')
      .select('*')
      .order('effective_date', { ascending: true });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getAllEmployeeRates fallback:', err);
    return [];
  }
}

export async function addEmployeeRate(employeeId, hourlyRate, effectiveDate) {
  checkSupabase();
  try {
    const { data: existing, error: findError } = await supabase
      .from('employee_rates')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('effective_date', effectiveDate)
      .maybeSingle();

    if (findError) {
      if (findError.code === 'PGRST205' || findError.code === '42P01') {
        throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
      }
    }

    if (existing && existing.id) {
      const { data, error } = await supabase
        .from('employee_rates')
        .update({ hourly_rate: Number(hourlyRate) })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('employee_rates')
        .insert({
          employee_id: employeeId,
          hourly_rate: Number(hourlyRate),
          effective_date: effectiveDate,
        })
        .select()
        .single();
      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
          throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
        }
        throw error;
      }
      return data;
    }
  } catch (err) {
    if (err.message && err.message.includes('SQL Editor')) {
      throw err;
    }
    if (err.code === 'PGRST205' || err.code === '42P01') {
      throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
    }
    throw err;
  }
}

export async function deleteEmployeeRate(id) {
  checkSupabase();
  const { error } = await supabase
    .from('employee_rates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Tính tổng lương cho danh sách ca làm việc dựa trên mốc lương lịch sử và hệ số ngày Lễ an toàn 100%
 */
export function calculateSalaryFromShifts(shifts = [], rates = [], defaultRate = 20000, holidays = []) {
  if (!Array.isArray(shifts) || shifts.length === 0) return { totalHours: 0, grossSalary: 0, shiftDetails: [] };

  const sortedRates = [...(rates || [])].sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''));

  let totalHours = 0;
  let grossSalary = 0;
  const shiftDetails = [];

  shifts.forEach((shift) => {
    if (!shift) return;
    let hours = Number(shift.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      if (shift.start_time && shift.end_time) {
        const sParts = String(shift.start_time).split(':');
        const eParts = String(shift.end_time).split(':');
        const sh = Number(sParts[0]) || 0;
        const sm = Number(sParts[1]) || 0;
        const eh = Number(eParts[0]) || 0;
        const em = Number(eParts[1]) || 0;
        let calcH = (eh * 60 + em - (sh * 60 + sm)) / 60;
        if (calcH < 0) calcH += 24;
        hours = Math.round(calcH * 100) / 100;
      } else {
        hours = 0;
      }
    }

    const shiftDate = shift.date || '';

    let applicableRate = Number(defaultRate) || 20000;
    for (let i = sortedRates.length - 1; i >= 0; i--) {
      if (sortedRates[i].effective_date && sortedRates[i].effective_date <= shiftDate) {
        const rVal = Number(sortedRates[i].hourly_rate);
        if (Number.isFinite(rVal) && rVal > 0) {
          applicableRate = rVal;
          break;
        }
      }
    }

    // Kiểm tra Ngày Lễ & Hệ số nhân (x2, x3...)
    const holiday = getHolidayForDate(shiftDate, holidays);
    const multiplier = holiday && Number(holiday.multiplier) > 0 ? Number(holiday.multiplier) : 1;
    const effectiveRate = Math.round(applicableRate * multiplier);

    const shiftSalary = Math.round(hours * effectiveRate);
    totalHours += hours;
    grossSalary += shiftSalary;

    shiftDetails.push({
      ...shift,
      hours,
      applicableRate,
      effectiveRate,
      multiplier,
      holidayName: holiday?.name || null,
      shiftSalary,
    });
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    grossSalary: Math.round(grossSalary),
    shiftDetails,
  };
}

export async function updateEmployee(id, employeeData) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update(employeeData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeePin(id, pin) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update({ pin: pin.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmployee(id) {
  checkSupabase();
  // Soft Delete: Chuyển status = 'off' và is_active = false trong DB Supabase
  // Giữ lại 100% dữ liệu lịch sử ca làm, chấm công, tính lương trong Database để tra cứu 3-4 năm sau!
  const { error } = await supabase
    .from('employees')
    .update({ status: 'off', is_active: false })
    .eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================
// BRANCH OPERATIONS
// ============================================

export async function getBranches() {
  checkSupabase();
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function createBranch(branchData) {
  checkSupabase();
  const { data, error } = await supabase
    .from('branches')
    .insert([branchData])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBranch(id, branchData) {
  checkSupabase();
  const { data, error } = await supabase
    .from('branches')
    .update(branchData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBranch(id) {
  checkSupabase();
  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================
// AVAILABILITY OPERATIONS (nhân viên đăng ký rảnh)
// ============================================

export async function getAvailabilityByDateRange(startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('availability')
    .select('*, employees(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getAvailabilityByEmployee(employeeId, startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function upsertAvailability(employeeId, date, type, note = '', isAdminAssigned = false) {
  checkSupabase();
  try {
    // 1. Kiểm tra bản ghi cũ
    const { data: existing } = await supabase
      .from('availability')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    const payload = { type, note, is_admin_assigned: isAdminAssigned };

    if (existing && existing.id) {
      // 2a. Nếu đã có -> Update
      const { data, error } = await supabase
        .from('availability')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // 2b. Nếu chưa có -> Insert
      const { data, error } = await supabase
        .from('availability')
        .insert({ employee_id: employeeId, date, ...payload })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  } catch (err) {
    console.error('upsertAvailability error:', err);
    throw err;
  }
}

export async function deleteAvailability(employeeId, date) {
  checkSupabase();
  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('employee_id', employeeId)
    .eq('date', date);
  if (error) throw error;
}

// ============================================
// SCHEDULE OPERATIONS (chủ quán xếp lịch)
// ============================================

export async function getScheduleByDateRange(startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('schedule')
    .select('*, employees(name), branches(name, color)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getScheduleByEmployee(employeeId) {
  checkSupabase();
  const { data, error } = await supabase
    .from('schedule')
    .select('*, employees(name), branches(name, color)')
    .eq('employee_id', employeeId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertSchedule({ employeeId, branchId, date, startTime, endTime, hours, note }) {
  checkSupabase();
  // Cải tiến: Tự động tính hours từ start_time/end_time nếu không truyền vào
  let calcHours = hours;
  if ((!calcHours || calcHours <= 0) && startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let h = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (h < 0) h += 24;
    calcHours = Math.round(h * 100) / 100;
  }
  const row = {
    employee_id: employeeId,
    branch_id: branchId,
    date,
    start_time: startTime || null,
    end_time: endTime || null,
    hours: calcHours || null,
    note: note || '',
  };
  const { data, error } = await supabase
    .from('schedule')
    .upsert(row, { onConflict: 'employee_id,date' })
    .select('*, employees(name), branches(name, color)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSchedule(id) {
  checkSupabase();
  const { error } = await supabase.from('schedule').delete().eq('id', id);
  if (error) throw error;
}

// ============================================
// PENALTY OPERATIONS
// ============================================

export async function getPenaltiesByEmployee(employeeId, month) {
  checkSupabase();
  let query = supabase
    .from('penalties')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (month) {
    query = query.eq('month', month);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Lấy tất cả thưởng/phạt của toàn bộ nhân viên theo tháng (dùng cho bảng báo cáo lương tổng)
 */
export async function getAllPenaltiesByMonth(month) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('penalties')
      .select('*')
      .eq('month', month)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getAllPenaltiesByMonth fallback:', err);
    return [];
  }
}

export async function createPenalty(penalty) {
  checkSupabase();
  try {
    // Đảm bảo số tiền nằm trong giới hạn Integer an toàn của Postgres (tối đa 1 Tỷ đồng)
    const sanitizedAmount = Math.min(Math.max(Math.round(Number(penalty.amount) || 0), 0), 1000000000);
    const safePenalty = {
      ...penalty,
      amount: sanitizedAmount,
    };

    const { data, error } = await supabase
      .from('penalties')
      .insert(safePenalty)
      .select()
      .single();

    if (error) {
      // Nếu cơ sở dữ liệu cũ chưa nâng cấp cột 'date' hoặc 'type', tự động thử loại bỏ từng trường thiếu
      if (
        error.code === 'PGRST204' ||
        (error.message && (error.message.includes('date') || error.message.includes('type')))
      ) {
        const { date, type, ...cleanPenalty } = safePenalty;
        const { data: retryData, error: retryError } = await supabase
          .from('penalties')
          .insert(cleanPenalty)
          .select()
          .single();
        if (retryError) throw retryError;
        return retryData;
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.error('Error creating penalty:', err);
    throw err;
  }
}

export async function deletePenalty(id) {
  checkSupabase();
  try {
    const { error } = await supabase.from('penalties').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting penalty:', err);
    throw err;
  }
}

// ============================================
// SHIFT SWAP OPERATIONS (QUẢN LÝ ĐỔI CA)
// ============================================

export async function getShiftSwapsByEmployee(employeeId) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .select('*')
      .or(`requester_id.eq.${employeeId},target_employee_id.eq.${employeeId}`)
      .order('created_at', { ascending: false });

    if (!error && data) return data;
  } catch (err) {
    console.error('Error fetching shift swaps:', err);
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('chems_shift_swaps');
      if (local) {
        const parsed = JSON.parse(local);
        return parsed.filter(
          (s) => s.requester_id === employeeId || s.target_employee_id === employeeId
        );
      }
    } catch (e) {}
  }
  return [];
}

export async function getAllShiftSwaps() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) return data;
  } catch (err) {
    console.error('Error fetching all shift swaps:', err);
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('chems_shift_swaps');
      if (local) return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

export async function createShiftSwap(swapData) {
  checkSupabase();
  const newSwap = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...swapData,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .insert(swapData)
      .select()
      .single();

    if (!error && data) {
      syncShiftSwapToLocalStorage(data);
      return data;
    }
  } catch (err) {
    console.error('Error inserting shift swap into DB:', err);
  }

  // Fallback LocalStorage if DB table not created yet
  syncShiftSwapToLocalStorage(newSwap);
  return newSwap;
}

function syncShiftSwapToLocalStorage(swapItem) {
  if (typeof window === 'undefined') return;
  try {
    const local = JSON.parse(localStorage.getItem('chems_shift_swaps') || '[]');
    const filtered = local.filter((s) => s.id !== swapItem.id);
    const updated = [swapItem, ...filtered];
    localStorage.setItem('chems_shift_swaps', JSON.stringify(updated));
  } catch (e) {}
}

export async function updateShiftSwapStatus(swapId, status, rejectionReason = '') {
  checkSupabase();
  const updateData = {
    status,
    rejection_reason: rejectionReason,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .update(updateData)
      .eq('id', swapId)
      .select()
      .single();

    if (!error && data) {
      syncShiftSwapToLocalStorage(data);
      return data;
    }
  } catch (err) {
    console.error('Error updating shift swap status:', err);
  }

  // LocalStorage Fallback Sync
  if (typeof window !== 'undefined') {
    try {
      const local = JSON.parse(localStorage.getItem('chems_shift_swaps') || '[]');
      const idx = local.findIndex((s) => s.id === swapId);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...updateData };
        localStorage.setItem('chems_shift_swaps', JSON.stringify(local));
        return local[idx];
      }
    } catch (e) {}
  }
  return { id: swapId, ...updateData };
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http');

// Cơ chế Singleton Client loại bỏ hoàn toàn cảnh báo Multiple GoTrueClient
const globalForSupabase = globalThis;

export const supabase = isConfigured
  ? (globalForSupabase._supabaseClient || (globalForSupabase._supabaseClient = createClient(supabaseUrl, supabaseAnonKey)))
  : null;

function checkSupabase() {
  if (!supabase) {
    throw new Error('⚠️ Supabase chưa được cấu hình!');
  }
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
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data || []).filter((e) => e.status !== 'off');
  } catch (err) {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data || []).filter((e) => e.status !== 'off');
  }
}

export async function getAllEmployees() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const list = data || [];
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
    const list = data || [];
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

export async function getEmployeeByName(name) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', name.trim())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
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

export async function updateEmployeeStatus(id, status) {
  checkSupabase();
  const isActive = status === 'active';
  const { data, error } = await supabase
    .from('employees')
    .update({ status: status, is_active: isActive })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
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
 * Tính tổng lương cho danh sách ca làm việc dựa trên mốc lương lịch sử theo từng ngày
 */
export function calculateSalaryFromShifts(shifts = [], rates = [], defaultRate = 20000) {
  if (!shifts || shifts.length === 0) return { totalHours: 0, grossSalary: 0, shiftDetails: [] };

  // Import calculateHours nếu cần từ utils
  const sortedRates = [...(rates || [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  let totalHours = 0;
  let grossSalary = 0;
  const shiftDetails = [];

  shifts.forEach((shift) => {
    let hours = Number(shift.hours);
    if (isNaN(hours) || hours <= 0) {
      if (shift.start_time && shift.end_time) {
        const [sh, sm] = shift.start_time.split(':').map(Number);
        const [eh, em] = shift.end_time.split(':').map(Number);
        let calcH = (eh * 60 + em - (sh * 60 + sm)) / 60;
        if (calcH < 0) calcH += 24;
        hours = Math.round(calcH * 100) / 100;
      } else {
        hours = 0;
      }
    }

    const shiftDate = shift.date;

    let applicableRate = Number(defaultRate) || 20000;
    for (let i = sortedRates.length - 1; i >= 0; i--) {
      if (sortedRates[i].effective_date <= shiftDate) {
        applicableRate = Number(sortedRates[i].hourly_rate) || applicableRate;
        break;
      }
    }

    const shiftSalary = hours * applicableRate;
    totalHours += hours;
    grossSalary += shiftSalary;

    shiftDetails.push({
      ...shift,
      hours,
      applicableRate,
      shiftSalary,
    });
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    grossSalary: Math.round(grossSalary),
    shiftDetails,
  };
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

export async function upsertAvailability(employeeId, date, type, note = '') {
  checkSupabase();
  try {
    // 1. Kiểm tra bản ghi cũ
    const { data: existing } = await supabase
      .from('availability')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle();

    if (existing && existing.id) {
      // 2a. Nếu đã có -> Update
      const { data, error } = await supabase
        .from('availability')
        .update({ type, note })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      // 2b. Nếu chưa có -> Insert
      const { data, error } = await supabase
        .from('availability')
        .insert({ employee_id: employeeId, date, type, note })
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

export async function upsertSchedule({ employeeId, branchId, date, startTime, endTime, hours, note }) {
  checkSupabase();
  const row = {
    employee_id: employeeId,
    branch_id: branchId,
    date,
    start_time: startTime || null,
    end_time: endTime || null,
    hours: hours || null,
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

export async function createPenalty(penalty) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('penalties')
      .insert(penalty)
      .select()
      .single();

    if (error) {
      // Nếu cơ sở dữ liệu cũ chưa có cột 'type', tự động thử lại bằng cách nhúng vào reason
      if (error.code === 'PGRST204' || (error.message && error.message.includes('type'))) {
        const { type, ...cleanPenalty } = penalty;
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
    console.error('createPenalty error:', err);
    throw err;
  }
}

export async function deletePenalty(id) {
  checkSupabase();
  const { error } = await supabase.from('penalties').delete().eq('id', id);
  if (error) throw error;
}

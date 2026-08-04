import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http');

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
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
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
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

export async function createEmployee(name, pin = '123456', hourlyRate = 20000) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .insert({ name: name.trim(), pin: pin.trim(), hourly_rate: Number(hourlyRate) || 20000 })
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
  const { error } = await supabase
    .from('employees')
    .delete()
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
  const { data, error } = await supabase
    .from('availability')
    .upsert(
      { employee_id: employeeId, date, type, note },
      { onConflict: 'employee_id,date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
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
  const { data, error } = await supabase
    .from('penalties')
    .insert(penalty)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deletePenalty(id) {
  checkSupabase();
  const { error } = await supabase.from('penalties').delete().eq('id', id);
  if (error) throw error;
}

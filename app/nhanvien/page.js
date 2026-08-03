'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import EmployeeSelector from '@/components/EmployeeSelector';
import WeeklyAvailability from '@/components/WeeklyAvailability';
import ScheduleCalendar from '@/components/ScheduleCalendar';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployeeByName,
  createEmployee,
  getScheduleByDateRange,
  updateEmployeeRate,
} from '@/lib/supabase';
import { getCurrentMonth, formatCurrency } from '@/lib/utils';

function EmployeeContent() {
  const toast = useToast();

  // Auth state
  const [employee, setEmployee] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // View state
  const [view, setView] = useState('schedule');

  // Worked hours & salary state
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyHours, setMonthlyHours] = useState(0);
  const [monthlyShiftsCount, setMonthlyShiftsCount] = useState(0);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');

  // Check localStorage for remembered name
  useEffect(() => {
    const saved = localStorage.getItem('chemshoa_employee_name');
    if (saved) {
      handleLogin(saved, false);
    } else {
      setInitialLoading(false);
    }
  }, []);

  // Load employee monthly hours whenever employee or selectedMonth changes
  useEffect(() => {
    if (employee) {
      loadEmployeeHours();
    }
  }, [employee, selectedMonth]);

  async function loadEmployeeHours() {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      const schedData = await getScheduleByDateRange(startDate, endDate);
      
      // Filter for this employee
      const myShifts = schedData.filter((s) => s.employee_id === employee.id);
      const totalH = myShifts.reduce((sum, s) => sum + (Number(s.hours) || 5), 0);
      
      setMonthlyHours(Math.round(totalH * 100) / 100);
      setMonthlyShiftsCount(myShifts.length);
    } catch (err) {
      console.error(err);
    }
  }

  function handlePrevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${year}-${month}`);
  }

  function handleNextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${year}-${month}`);
  }

  async function handleSaveRate() {
    const rate = parseInt(rateInput);
    if (!rate || rate <= 0) return;
    try {
      const updated = await updateEmployeeRate(employee.id, rate);
      setEmployee(updated);
      setEditingRate(false);
      toast.success('Cập nhật', `Lương của bạn đã đặt: ${formatCurrency(rate)}/giờ`);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể cập nhật lương');
    }
  }

  async function handleLogin(name, showToast = true, pin = '1234', isNew = false) {
    setAuthLoading(true);
    try {
      let emp = await getEmployeeByName(name);
      if (!emp) {
        if (isNew) {
          emp = await createEmployee(name, pin);
          if (showToast) toast.success('Chào mừng!', `Đã tạo tài khoản cho ${emp.name}`);
        } else {
          // Nhân viên cũ đã bị Admin xóa -> Clear localStorage
          localStorage.removeItem('chemshoa_employee_name');
          setEmployee(null);
          setAuthLoading(false);
          setInitialLoading(false);
          return;
        }
      } else {
        if (showToast) toast.success('Xin chào!', `Chào mừng ${emp.name} quay lại`);
      }
      setEmployee(emp);
      localStorage.setItem('chemshoa_employee_name', emp.name);
      localStorage.setItem(`chemshoa_saved_pin_${emp.id}`, emp.pin || '1234');
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể kết nối. Kiểm tra lại Supabase config.');
    }
    setAuthLoading(false);
    setInitialLoading(false);
  }

  async function handleSelectEmployee(name, isNew, pin = '1234') {
    await handleLogin(name, true, pin, isNew);
  }

  function handleLogout() {
    setEmployee(null);
    localStorage.removeItem('chemshoa_employee_name');
  }

  const hourlyRate = employee?.hourly_rate || 20000;
  const estimatedSalary = monthlyHours * hourlyRate;

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce-in">🍵</div>
          <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <EmployeeSelector onSelect={handleSelectEmployee} loading={authLoading} />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        title="Tiệm Chè Ms Hoa"
        icon="🍵"
        employeeName={employee.name}
      />

      <main className="flex-1 relative z-10 px-4 md:px-6 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5 animate-fade-in-up">
            <div>
              <h1 className="text-xl md:text-2xl font-bold">
                Xin chào, <span className="text-gradient">{employee.name}</span>! 👋
              </h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Xem lịch làm phân công & đăng ký ca làm
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-glass-border)] rounded-xl text-sm text-[var(--color-text-secondary)] hover:text-white transition-all cursor-pointer"
            >
              🔄 Đổi
            </button>
          </div>

          {/* =========================================================================
             BẢNG THỐNG KÊ GIỜ LÀM & TÍNH LƯƠNG TỰ ĐỘNG CÁ NHÂN
             ========================================================================= */}
          <div className="glass rounded-3xl p-5 mb-5 space-y-4 shadow-xl border border-[rgba(245,158,11,0.25)] animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base text-white flex items-center gap-1.5">
                  <span>💰</span> Thu Nhập
                </h3>
                {/* Bộ chọn tháng */}
                <div className="flex items-center gap-1 bg-[var(--color-surface-2)] px-2 py-1 rounded-xl border border-[rgba(255,255,255,0.1)]">
                  <button
                    onClick={handlePrevMonth}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-white border-0 bg-transparent cursor-pointer px-1 font-bold"
                    title="Tháng trước"
                  >
                    ◀
                  </button>
                  <span className="text-xs font-black text-amber-400">
                    Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
                  </span>
                  <button
                    onClick={handleNextMonth}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-white border-0 bg-transparent cursor-pointer px-1 font-bold"
                    title="Tháng sau"
                  >
                    ▶
                  </button>
                </div>
              </div>

              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                {monthlyShiftsCount} ca làm
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tổng số giờ làm */}
              <div className="p-4 bg-[var(--color-surface-1)] rounded-2xl border border-[rgba(255,255,255,0.06)] text-center">
                <div className="text-xs text-[var(--color-text-secondary)] font-bold mb-1">⏱️ Tổng số giờ làm</div>
                <div className="text-2xl font-black text-amber-400">{monthlyHours} <span className="text-xs font-normal">tiếng</span></div>
              </div>

              {/* Lương thỏa thuận đ/giờ */}
              <div className="p-4 bg-[var(--color-surface-1)] rounded-2xl border border-[rgba(255,255,255,0.06)] text-center flex flex-col justify-between">
                <div className="text-xs text-[var(--color-text-secondary)] font-bold mb-1">
                  💵 Lương thỏa thuận
                </div>

                {editingRate ? (
                  <div className="flex items-center justify-center gap-1.5 my-1">
                    <input
                      type="number"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                      className="w-24 px-2 py-1.5 bg-[#12121e] border border-amber-400 rounded-xl text-white text-sm font-bold text-center outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveRate}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black border-0 cursor-pointer active:scale-95"
                    >
                      Lưu
                    </button>
                    <button
                      onClick={() => setEditingRate(false)}
                      className="px-2 py-1.5 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] text-xs font-bold border-0 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="text-xl font-black text-white">
                      {formatCurrency(hourlyRate)}
                      <span className="text-xs font-normal text-[var(--color-text-muted)]">/h</span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRate(true);
                        setRateInput(String(hourlyRate));
                      }}
                      className="mt-1.5 px-3 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer transition-all active:scale-95 inline-flex items-center gap-1"
                    >
                      <span>✏️</span> Sửa lương/h
                    </button>
                  </div>
                )}
              </div>

              {/* Lương ước tính */}
              <div className="p-4 bg-gradient-to-tr from-amber-500/20 to-orange-500/20 rounded-2xl border border-amber-500/40 text-center shadow-md">
                <div className="text-xs text-amber-300 font-black mb-1">💰 Lương ước tính</div>
                <div className="text-xl md:text-2xl font-black text-emerald-400">{formatCurrency(estimatedSalary)}</div>
              </div>
            </div>
          </div>

          {/* Tab Toggle - Lịch Làm lên trước */}
          <div className="flex gap-1 bg-[var(--color-surface-1)] rounded-xl p-1 mb-5 animate-fade-in-up">
            <button
              onClick={() => setView('schedule')}
              className={`flex-1 py-3 rounded-lg font-bold text-base cursor-pointer border-0 transition-all ${
                view === 'schedule'
                  ? 'bg-[var(--color-surface-3)] text-white shadow-md'
                  : 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              📅 Lịch Làm Việc
            </button>
            <button
              onClick={() => setView('availability')}
              className={`flex-1 py-3 rounded-lg font-bold text-base cursor-pointer border-0 transition-all ${
                view === 'availability'
                  ? 'bg-[var(--color-surface-3)] text-white shadow-md'
                  : 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              ✋ Đăng Ký Làm
            </button>
          </div>

          {/* SCHEDULE VIEW (Bảng lịch làm tháng phân công bởi chủ) */}
          {view === 'schedule' && (
            <div className="animate-fade-in">
              <ScheduleCalendar highlightEmployeeId={employee.id} />
            </div>
          )}

          {/* AVAILABILITY VIEW (Đăng ký rảnh theo tuần) */}
          {view === 'availability' && (
            <div className="animate-fade-in">
              <WeeklyAvailability employee={employee} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function NhanVienPage() {
  return (
    <ToastProvider>
      <EmployeeContent />
    </ToastProvider>
  );
}

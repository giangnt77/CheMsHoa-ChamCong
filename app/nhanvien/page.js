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
  getPenaltiesByEmployee,
} from '@/lib/supabase';
import { getCurrentMonth, formatCurrency } from '@/lib/utils';

function EmployeeContent() {
  const toast = useToast();

  // Auth state
  const [employee, setEmployee] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // View state: Mặc định hiện Lịch Làm ('schedule') trước thay vì Đăng ký ca
  const [view, setView] = useState('schedule'); // 'schedule' | 'availability'

  // Check localStorage for remembered name
  useEffect(() => {
    const saved = localStorage.getItem('chemshoa_employee_name');
    if (saved) {
      handleLogin(saved, false); // false = don't show welcome toast on auto-restore
    } else {
      setInitialLoading(false);
    }
  }, []);

  async function handleLogin(name, showToast = true, pin = '1234') {
    setAuthLoading(true);
    try {
      let emp = await getEmployeeByName(name);
      if (!emp) {
        emp = await createEmployee(name, pin);
        if (showToast) toast.success('Chào mừng!', `Đã tạo tài khoản cho ${emp.name} (Mã PIN: ${emp.pin})`);
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
    await handleLogin(name, true, pin);
  }

  function handleLogout() {
    setEmployee(null);
    localStorage.removeItem('chemshoa_employee_name');
  }

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
        title="Chè Ms Hoa"
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
                Xem lịch làm phân công & đăng ký ca rảnh
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-glass-border)] rounded-xl text-sm text-[var(--color-text-secondary)] hover:text-white transition-all cursor-pointer"
            >
              🔄 Đổi
            </button>
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
              ✋ Đăng Ký Rảnh
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

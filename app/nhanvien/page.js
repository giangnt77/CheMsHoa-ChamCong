'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import EmployeeSelector from '@/components/EmployeeSelector';
import WeeklyAvailability from '@/components/WeeklyAvailability';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployeeByName,
  getEmployees,
  createEmployee,
  getScheduleByDateRange,
  updateEmployeeRate,
  getEmployeeRates,
  calculateSalaryFromShifts,
} from '@/lib/supabase';
import { getCurrentMonth, formatCurrency, getToday } from '@/lib/utils';

function EmployeeContent() {
  const toast = useToast();

  // Auth state
  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    getEmployees().then(setEmployees).catch(console.error);
  }, []);

  // View state
  const [view, setView] = useState('schedule');

  // Worked hours & salary state
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyHours, setMonthlyHours] = useState(0);
  const [monthlyShiftsCount, setMonthlyShiftsCount] = useState(0);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [empRates, setEmpRates] = useState([]);
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false);

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

      const [schedData, rates] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(employee.id),
      ]);

      setEmpRates(rates);

      const myShifts = schedData.filter((s) => s.employee_id === employee.id);
      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        myShifts,
        rates,
        employee.hourly_rate || 20000
      );

      setMonthlyHours(totalHours);
      setMonthlyShiftsCount(myShifts.length);
      setMonthlySalary(grossSalary);
    } catch (err) {
      console.error('Error loading employee hours:', err);
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

  async function handleLogin(name, showToast = true) {
    setAuthLoading(true);
    try {
      const emp = await getEmployeeByName(name);
      if (!emp) {
        toast.error('Lỗi', 'Không tìm thấy thông tin tài khoản! Vui lòng báo Admin tạo tài khoản.');
        localStorage.removeItem('chemshoa_employee_name');
      } else {
        setEmployee(emp);
        localStorage.setItem('chemshoa_employee_name', emp.name);
        if (showToast) toast.success('Đăng nhập', `Xin chào ${emp.name}!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể đăng nhập');
    }
    setAuthLoading(false);
    setInitialLoading(false);
  }

  async function handleSelectEmployee(name) {
    await handleLogin(name, true);
  }

  function handleLogout() {
    setEmployee(null);
    localStorage.removeItem('chemshoa_employee_name');
  }

  // Mức lương hiệu lực hiện tại (tính tới ngày hôm nay)
  const currentRate = useMemo(() => {
    if (!employee) return 20000;
    const todayStr = getToday();
    const sortedRates = [...empRates].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    let rate = employee.hourly_rate || 20000;
    for (let i = sortedRates.length - 1; i >= 0; i--) {
      if (sortedRates[i].effective_date <= todayStr) {
        rate = Number(sortedRates[i].hourly_rate);
        break;
      }
    }
    return rate;
  }, [employee, empRates]);

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

      <main className="flex-1 relative z-10 px-3 sm:px-4 md:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto space-y-3">
          {/* Top Header Row: Greeting & Action Controls - Purple Brand Style */}
          <div className="flex items-center justify-between flex-wrap gap-2 py-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-purple-950 tracking-tight">
                Xin chào, <span className="text-purple-700 font-black">{employee.name}</span>! 👋
              </h1>
              <button
                type="button"
                onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
                className="px-3 py-1 rounded-full bg-purple-100/80 hover:bg-purple-200 text-purple-900 text-xs font-black border border-purple-200 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                title="Bấm để xem thu nhập cá nhân"
              >
                <span>💰</span>
                <span>{isIncomeExpanded ? 'Thu nhỏ' : 'Lương'}</span>
              </button>
            </div>

            {/* Segmented Control Switcher (Lịch Phân Công / Đăng Ký Làm) */}
            <div className="flex bg-purple-100/70 p-1 rounded-xl w-full sm:w-auto border border-purple-200/80 shadow-2xs">
              <button
                onClick={() => setView('schedule')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${
                  view === 'schedule'
                    ? 'bg-purple-700 text-white shadow-xs font-black'
                    : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
              >
                📅 Lịch Phân Công
              </button>
              <button
                onClick={() => setView('availability')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${
                  view === 'availability'
                    ? 'bg-purple-700 text-white shadow-xs font-black'
                    : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
              >
                ✋ Đăng Ký Làm
              </button>
            </div>
          </div>

          {/* THÔNG TIN THU NHẬP CÁ NHÂN (BRAND PURPLE CARD) */}
          {isIncomeExpanded && (
            <div className="bg-white rounded-2xl p-4 border border-purple-200/90 shadow-2xs animate-fade-in space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💰</span>
                  <h3 className="font-black text-base md:text-lg text-purple-950">Thu Nhập Cá Nhân</h3>
                </div>
                {/* Bộ chọn tháng */}
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200/80">
                  <button onClick={handlePrevMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">◀</button>
                  <span className="text-xs sm:text-sm font-black text-purple-900">
                    Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
                  </span>
                  <button onClick={handleNextMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">▶</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200/70 text-center">
                  <div className="text-xs text-purple-700 font-bold mb-0.5">⏱️ Tổng giờ làm</div>
                  <div className="text-lg sm:text-xl font-black text-purple-800">{monthlyHours} <span className="text-xs font-normal text-purple-600">tiếng</span> ({monthlyShiftsCount} ca)</div>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200/70 text-center">
                  <div className="text-xs text-purple-700 font-bold mb-0.5">💵 Lương thỏa thuận</div>
                  <div className="text-lg sm:text-xl font-black text-purple-950">{formatCurrency(currentRate)}<span className="text-xs font-normal text-purple-600">/h</span></div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 text-center">
                  <div className="text-xs text-emerald-700 font-black mb-0.5">💰 Lương ước tính</div>
                  <div className="text-lg sm:text-xl font-black text-emerald-700">{formatCurrency(monthlySalary)}</div>
                </div>
              </div>
            </div>
          )}

          {/* SCHEDULE VIEW */}
          {view === 'schedule' && (
            <div className="animate-fade-in">
              <WeeklyMatrixBoard employees={employees} highlightEmployeeId={employee.id} readOnly={true} />
            </div>
          )}

          {/* AVAILABILITY VIEW */}
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

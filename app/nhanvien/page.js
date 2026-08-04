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

      <main className="flex-1 relative z-10 px-4 md:px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header Chào & Đổi Tài Khoản - Chữ To Rõ */}
          <div className="glass rounded-lg p-4 flex items-center justify-between flex-wrap gap-3 border border-slate-700">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <span>Xin chào, <span className="text-amber-400 font-black">{employee.name}</span>! 👋</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-300 font-bold mt-0.5">
                Lịch làm việc phân công tuần này
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Nút Xem Thu Nhập Nhanh */}
              <button
                type="button"
                onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
                className="px-3.5 py-2 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs md:text-sm font-black border border-amber-500/40 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>💰</span>
                <span>{isIncomeExpanded ? 'Thu nhỏ' : 'Xem Lương'}</span>
              </button>
            </div>
          </div>

          {/* BẢNG TÍNH LƯƠNG TỰ ĐỘNG CÁ NHÂN (ẨN/HIỆN THEO NHU CẦU) */}
          {isIncomeExpanded && (
            <div className="glass rounded-lg p-4 border border-amber-500/30 animate-fade-in space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💰</span>
                  <h3 className="font-black text-base text-white">Thu Nhập Cá Nhân</h3>
                </div>
                {/* Bộ chọn tháng */}
                <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-md border border-white/10">
                  <button onClick={handlePrevMonth} className="text-slate-300 hover:text-white font-bold text-sm">◀</button>
                  <span className="text-xs md:text-sm font-black text-amber-400">
                    Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
                  </span>
                  <button onClick={handleNextMonth} className="text-slate-300 hover:text-white font-bold text-sm">▶</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 bg-slate-900/60 rounded-md border border-white/5 text-center">
                  <div className="text-xs text-slate-400 font-bold mb-1">⏱️ Tổng số giờ làm</div>
                  <div className="text-xl md:text-2xl font-black text-amber-400">{monthlyHours} <span className="text-xs font-normal">tiếng</span> ({monthlyShiftsCount} ca)</div>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-md border border-white/5 text-center">
                  <div className="text-xs text-slate-400 font-bold mb-1">💵 Lương thỏa thuận</div>
                  <div className="text-xl md:text-2xl font-black text-white">{formatCurrency(currentRate)}<span className="text-xs font-normal text-slate-400">/h</span></div>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-md border border-amber-500/30 text-center">
                  <div className="text-xs text-amber-300 font-black mb-1">💰 Lương ước tính</div>
                  <div className="text-xl md:text-2xl font-black text-emerald-400">{formatCurrency(monthlySalary)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Navigation - Góc Vuông Phẳng */}
          <div className="flex gap-2 bg-slate-900 rounded-lg p-1.5 border border-slate-700 mb-6 animate-fade-in-up">
            <button
              onClick={() => setView('schedule')}
              className={`flex-1 py-2.5 rounded-md font-black text-sm cursor-pointer border transition-all ${
                view === 'schedule'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white'
              }`}
            >
              📅 Lịch Làm Việc
            </button>
            <button
              onClick={() => setView('availability')}
              className={`flex-1 py-2.5 rounded-md font-black text-sm cursor-pointer border transition-all ${
                view === 'availability'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-transparent text-slate-400 border-transparent hover:text-white'
              }`}
            >
              ✋ Đăng Ký Làm
            </button>
          </div>

          {/* SCHEDULE VIEW (Bảng lịch làm tuần chuẩn Excel phân công bởi chủ - CHỈ XEM, KHÔNG ĐƯỢC CHỈNH SỬA) */}
          {view === 'schedule' && (
            <div className="animate-fade-in">
              <WeeklyMatrixBoard employees={employees} highlightEmployeeId={employee.id} readOnly={true} />
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

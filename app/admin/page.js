'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import ScheduleCalendar from '@/components/ScheduleCalendar';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployees,
  createEmployee,
  updateEmployeeRate,
  updateEmployeePin,
  deleteEmployee,
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
  getPenaltiesByEmployee,
  createPenalty,
  deletePenalty,
} from '@/lib/supabase';
import {
  getCurrentMonth,
  getMonthName,
  formatCurrency,
  formatDateShort,
  getInitials,
  getToday,
} from '@/lib/utils';

function AdminContent() {
  const toast = useToast();

  // PIN Auth
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'employees' | 'salary' | 'penalty'

  // Data
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [empSchedule, setEmpSchedule] = useState([]);
  const [empPenalties, setEmpPenalties] = useState([]);

  // Month picker & Date picker for scheduling
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [schedDate, setSchedDate] = useState(getToday());
  const [availabilities, setAvailabilities] = useState([]);
  const [daySchedule, setDaySchedule] = useState([]);

  // Loading
  const [loading, setLoading] = useState(true);

  // Penalty form
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');

  // Rate & PIN edit
  const [editingRate, setEditingRate] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [editingPinEmpId, setEditingPinEmpId] = useState(null);
  const [newPinInput, setNewPinInput] = useState('');

  // Check PIN on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('chemshoa_admin_unlocked');
    if (saved === 'true') {
      setIsUnlocked(true);
      loadInitialData();
    }
  }, []);

  function handlePinSubmit(e) {
    e.preventDefault();
    const correctPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '1234';
    if (pinInput === correctPin) {
      setIsUnlocked(true);
      sessionStorage.setItem('chemshoa_admin_unlocked', 'true');
      setPinError(false);
      loadInitialData();
    } else {
      setPinError(true);
      setPinInput('');
    }
  }

  async function loadInitialData() {
    setLoading(true);
    try {
      const [empData, branchData] = await Promise.all([
        getEmployees(),
        getBranches(),
      ]);
      setEmployees(empData);
      setBranches(branchData);
      if (empData.length > 0 && !selectedEmployee) {
        setSelectedEmployee(empData[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải dữ liệu ban đầu');
    }
    setLoading(false);
  }

  // Load scheduling data when date changes in 'schedule' tab
  useEffect(() => {
    if (isUnlocked && activeTab === 'schedule' && schedDate) {
      loadDaySchedulingData();
    }
  }, [isUnlocked, activeTab, schedDate]);

  // Load employee detail data (salary/penalty)
  useEffect(() => {
    if (selectedEmployee) {
      loadEmployeeData();
    }
  }, [selectedEmployee, selectedMonth]);

  async function loadDaySchedulingData() {
    try {
      const [availData, schedData] = await Promise.all([
        getAvailabilityByDateRange(schedDate, schedDate),
        getScheduleByDateRange(schedDate, schedDate),
      ]);
      setAvailabilities(availData);
      setDaySchedule(schedData);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadEmployeeData() {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      const [sched, penalties] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getPenaltiesByEmployee(selectedEmployee.id, selectedMonth),
      ]);
      const mySched = sched.filter(s => s.employee_id === selectedEmployee.id);
      setEmpSchedule(mySched);
      setEmpPenalties(penalties);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải dữ liệu nhân viên');
    }
  }

  async function handleAssignBranch(employeeId, branchId, startTime = '08:00', endTime = '13:00', hours = 5) {
    try {
      await upsertSchedule({
        employeeId,
        branchId,
        date: schedDate,
        startTime,
        endTime,
        hours,
      });
      toast.success('Thành công', 'Đã phân công nhân viên');
      loadDaySchedulingData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể phân công');
    }
  }

  async function handleRemoveSchedule(scheduleId) {
    try {
      await deleteSchedule(scheduleId);
      toast.info('Đã xóa', 'Đã hủy phân công');
      loadDaySchedulingData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể xóa phân công');
    }
  }

  async function handleUpdateRate() {
    const rate = parseInt(newRate);
    if (!rate || rate <= 0) return;
    try {
      const updated = await updateEmployeeRate(selectedEmployee.id, rate);
      setSelectedEmployee(updated);
      setEditingRate(false);
      toast.success('Cập nhật', `Lương đã set: ${formatCurrency(rate)}/giờ`);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể cập nhật lương');
    }
  }

  async function handleAddPenalty() {
    const amount = parseInt(penaltyAmount);
    if (!amount || !penaltyReason.trim()) return;
    try {
      await createPenalty({
        employee_id: selectedEmployee.id,
        month: selectedMonth,
        amount,
        reason: penaltyReason.trim(),
      });
      toast.warning('Phạt đã thêm', `${formatCurrency(amount)} - ${penaltyReason}`);
      setPenaltyAmount('');
      setPenaltyReason('');
      loadEmployeeData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể thêm phạt');
    }
  }

  async function handleDeletePenalty(id) {
    try {
      await deletePenalty(id);
      toast.info('Đã xóa', 'Đã xóa khoản phạt');
      loadEmployeeData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể xóa phạt');
    }
  }

  // Salary calculation
  const salaryData = useMemo(() => {
    if (!selectedEmployee) return null;
    const totalShifts = empSchedule.length;
    // Mặc định mỗi ca 5 tiếng hoặc tính theo hours field nếu có
    const totalHours = empSchedule.reduce((sum, s) => sum + (Number(s.hours) || 5), 0);
    const rate = selectedEmployee.hourly_rate || 20000;
    const grossSalary = totalHours * rate;
    const totalPenalty = empPenalties.reduce((sum, p) => sum + p.amount, 0);
    const netSalary = grossSalary - totalPenalty;
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalShifts,
      rate,
      grossSalary,
      totalPenalty,
      netSalary,
    };
  }, [empSchedule, empPenalties, selectedEmployee]);

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (m === 1) {
      setSelectedMonth(`${y - 1}-12`);
    } else {
      setSelectedMonth(`${y}-${String(m - 1).padStart(2, '0')}`);
    }
  }

  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (m === 12) {
      setSelectedMonth(`${y + 1}-01`);
    } else {
      setSelectedMonth(`${y}-${String(m + 1).padStart(2, '0')}`);
    }
  }

  // ========================================
  // PIN LOGIN SCREEN
  // ========================================
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="glass rounded-3xl p-8 md:p-10 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">👑</div>
          <h2 className="font-[family-name:var(--font-playfair)] text-2xl font-bold mb-2">
            <span className="text-gradient">Chủ Quán</span>
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-8">
            Nhập mã PIN để truy cập
          </p>

          <form onSubmit={handlePinSubmit}>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value.replace(/\D/g, ''));
                setPinError(false);
              }}
              placeholder="••••"
              required
              autoFocus
              className={`pin-input w-full px-5 py-5 bg-[var(--color-surface-1)] border rounded-xl text-white text-2xl text-center focus:ring-2 outline-none transition-all mb-4 placeholder:text-[var(--color-text-muted)] ${
                pinError
                  ? 'border-[var(--color-coral-400)] focus:border-[var(--color-coral-400)] focus:ring-[rgba(244,63,94,0.2)] animate-shake'
                  : 'border-[var(--color-glass-border)] focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            {pinError && (
              <p className="text-[var(--color-coral-400)] text-sm mb-4 animate-fade-in">
                ❌ Mã PIN không đúng
              </p>
            )}
            <button
              type="submit"
              disabled={!pinInput}
              className="w-full py-4 rounded-xl btn-gradient btn-shine text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0 text-base"
            >
              🔓 Mở Khóa
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Chè Ms Hoa" icon="👑" />

      <main className="flex-1 relative z-10 px-4 md:px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl md:text-2xl font-bold">
              <span className="text-gradient">Quản Lý</span> Xếp Lịch & Chấm Công 👑
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Phân công 5 chi nhánh, xem đăng ký rảnh và tính lương
            </p>
          </div>

          {/* Tabs - Chỉ 3 ô gọn gàng */}
          <div className="flex gap-1 bg-[var(--color-surface-1)] rounded-xl p-1 mb-6 overflow-x-auto">
            {[
              { id: 'schedule', label: '📅 Xếp Lịch' },
              { id: 'employees', label: '👥 Nhân viên & Lương' },
              { id: 'penalty', label: '⚠️ Phạt' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[100px] py-3 px-3 rounded-xl text-sm font-extrabold cursor-pointer border-0 transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-surface-3)] text-white shadow-lg'
                    : 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ============ TAB: SCHEDULE (MA TRẬN XẾP LỊCH TUẦN 5 CHI NHÁNH) ============ */}
          {activeTab === 'schedule' && (
            <div className="space-y-6 animate-fade-in">
              {/* Bảng Ma Trận Xếp Lịch Theo Tuần Cho 5 Chi Nhánh */}
              <WeeklyMatrixBoard employees={employees} toast={toast} />

              {/* Overview Calendar Tháng Bên Dưới */}
              <div className="mt-8">
                <h3 className="font-bold text-lg mb-3">📊 Tổng Quan Lịch Phân Công Tháng</h3>
                <ScheduleCalendar />
              </div>
            </div>
          )}

          {/* ============ TAB: EMPLOYEES & SALARY (MASTER-DETAIL 2 CỘT TẬP TRUNG) ============ */}
          {activeTab === 'employees' && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* CỘT TRÁI (4/12): DANH SÁCH NHÂN VIÊN & TÌM KIẾM NHANH */}
                <div className="lg:col-span-4 glass rounded-3xl p-4 md:p-5 border border-[var(--color-glass-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                      <span>👥</span> Nhân Viên ({employees.length})
                    </h3>
                    <span className="text-[11px] text-[var(--color-text-muted)] font-semibold">
                      Chấm chọn để xem lương
                    </span>
                  </div>

                  {/* Thanh tìm kiếm live */}
                  <div className="relative">
                    <input
                      type="text"
                      value={empSearchQuery}
                      onChange={(e) => setEmpSearchQuery(e.target.value)}
                      placeholder="🔍 Tim tên nhân viên nhanh..."
                      className="w-full pl-9 pr-3 py-2 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-xs font-semibold outline-none focus:border-amber-500 transition-all"
                    />
                    {empSearchQuery && (
                      <button
                        onClick={() => setEmpSearchQuery('')}
                        className="absolute right-2.5 top-2 text-xs text-[var(--color-text-muted)] hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Danh sách nhân viên cuộn mượt */}
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="inline-block w-6 h-6 border-2 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
                    </div>
                  ) : employees.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)] text-center py-6">Chưa có nhân viên</p>
                  ) : (
                    <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                      {employees
                        .filter((e) => e.name.toLowerCase().includes(empSearchQuery.toLowerCase()))
                        .map((emp) => {
                          const isSelected = selectedEmployee?.id === emp.id;
                          return (
                            <div
                              key={emp.id}
                              className={`rounded-2xl p-3 flex items-center justify-between gap-3 border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-amber-500/20 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                  : 'bg-[var(--color-surface-1)] border-[rgba(255,255,255,0.06)] hover:bg-[var(--color-surface-2)] hover:border-amber-500/30'
                              }`}
                              onClick={() => setSelectedEmployee(emp)}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center font-extrabold text-white text-xs flex-shrink-0 shadow">
                                  {getInitials(emp.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-extrabold text-white text-sm truncate flex items-center gap-1.5">
                                    <span>{emp.name}</span>
                                    {isSelected && <span className="text-amber-400 text-xs">✓</span>}
                                  </div>
                                  <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                                    <span className="text-amber-300 font-bold">{formatCurrency(emp.hourly_rate || 20000)}/h</span>
                                    <span className="mx-1">•</span>
                                    <span>PIN: {emp.pin || '1234'}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Quản lý PIN/Xóa gọn gàng */}
                              {editingPinEmpId === emp.id ? (
                                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={newPinInput}
                                    onChange={(e) => setNewPinInput(e.target.value)}
                                    className="w-14 px-1.5 py-1 bg-[var(--color-surface-2)] border border-amber-500 rounded-lg text-white text-xs font-bold text-center outline-none"
                                    autoFocus
                                  />
                                  <button
                                    onClick={async () => {
                                      if (!newPinInput.trim()) return;
                                      try {
                                        await updateEmployeePin(emp.id, newPinInput.trim());
                                        toast.success('Đã lưu PIN', `PIN mới của ${emp.name}: ${newPinInput.trim()}`);
                                        setEditingPinEmpId(null);
                                        setNewPinInput('');
                                        loadInitialData();
                                      } catch (err) {
                                        console.error(err);
                                        toast.error('Lỗi', 'Không thể đổi PIN');
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg bg-emerald-500 text-black text-xs font-black"
                                  >
                                    Lưu
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => {
                                      setEditingPinEmpId(emp.id);
                                      setNewPinInput(emp.pin || '1234');
                                    }}
                                    className="p-1.5 rounded-lg bg-[var(--color-surface-2)] text-amber-300 hover:bg-amber-500/20 text-xs border border-[rgba(255,255,255,0.08)] cursor-pointer"
                                    title="Đổi PIN"
                                  >
                                    🔑
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Bạn có chắc chắn muốn XÓA nhân viên "${emp.name}"?`)) {
                                        try {
                                          await deleteEmployee(emp.id);
                                          toast.success('Đã xóa', `Đã xóa ${emp.name}`);
                                          if (selectedEmployee?.id === emp.id) setSelectedEmployee(null);
                                          loadInitialData();
                                        } catch (err) {
                                          console.error(err);
                                          toast.error('Lỗi', 'Không thể xóa');
                                        }
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-xs border border-rose-500/30 cursor-pointer"
                                    title="Xóa nhân viên"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* CỘT PHẢI (8/12): BẢNG TÍNH LƯƠNG & CHI TIẾT CÔNG PHÂN SONG SONG */}
                <div className="lg:col-span-8 space-y-5">
                  {!selectedEmployee ? (
                    <div className="glass rounded-3xl p-12 text-center text-[var(--color-text-muted)] border border-[var(--color-glass-border)]">
                      <div className="text-4xl mb-3 opacity-40">👈</div>
                      <p className="font-bold text-base text-white mb-1">Vui lòng bấm chọn 1 nhân viên ở danh sách bên trái</p>
                      <p className="text-xs">Bảng tính lương chi tiết, tổng số ca làm và số tiền thực nhận sẽ hiển thị ngay tại đây.</p>
                    </div>
                  ) : (
                    <div className="space-y-5 animate-fade-in">
                      {/* Employee Info Header & Month Switcher */}
                      <div className="glass rounded-3xl p-5 border border-[var(--color-glass-border)] space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center font-extrabold text-white text-base shadow-md">
                              {getInitials(selectedEmployee.name)}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                                <span>{selectedEmployee.name}</span>
                                <span className="text-xs bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                                  PIN: {selectedEmployee.pin || '1234'}
                                </span>
                              </h3>
                              <div className="flex items-center gap-2 mt-1">
                                {editingRate ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      value={newRate}
                                      onChange={(e) => setNewRate(e.target.value)}
                                      placeholder="VD: 25000"
                                      className="w-28 px-2.5 py-1 bg-[var(--color-surface-1)] border border-amber-500 rounded-lg text-white text-xs font-bold outline-none"
                                    />
                                    <button onClick={handleUpdateRate} className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black text-xs font-black cursor-pointer">Lưu</button>
                                    <button onClick={() => setEditingRate(false)} className="px-2 py-1 rounded-lg bg-[var(--color-surface-2)] text-xs border-0 cursor-pointer">Hủy</button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-xs text-amber-400 font-extrabold">
                                      Lương thỏa thuận: {formatCurrency(selectedEmployee.hourly_rate || 20000)}/giờ
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingRate(true);
                                        setNewRate(String(selectedEmployee.hourly_rate || 20000));
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/30 cursor-pointer hover:bg-amber-500/30"
                                    >
                                      ✏️ Sửa lương/h
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bộ chuyển tháng */}
                          <div className="flex items-center gap-2 bg-[var(--color-surface-2)] p-1 rounded-2xl border border-[rgba(255,255,255,0.1)]">
                            <button onClick={prevMonth} className="px-2.5 py-1 text-xs font-bold text-[var(--color-text-secondary)] hover:text-white bg-[var(--color-surface-1)] rounded-xl cursor-pointer">◀</button>
                            <span className="font-black text-xs px-2 text-amber-300">{getMonthName(selectedMonth)}</span>
                            <button onClick={nextMonth} className="px-2.5 py-1 text-xs font-bold text-[var(--color-text-secondary)] hover:text-white bg-[var(--color-surface-1)] rounded-xl cursor-pointer">▶</button>
                          </div>
                        </div>

                        {/* Summary Stats Cards */}
                        {salaryData && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-xs text-[var(--color-text-muted)] font-bold uppercase mb-1">📅 Ca đã làm</div>
                              <div className="text-xl font-extrabold text-amber-400">{salaryData.totalShifts} ca</div>
                            </div>
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-xs text-[var(--color-text-muted)] font-bold uppercase mb-1">💵 Tổng Lương</div>
                              <div className="text-base font-extrabold text-emerald-400">{formatCurrency(salaryData.grossSalary)}</div>
                            </div>
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3.5 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-xs text-[var(--color-text-muted)] font-bold uppercase mb-1">⚠️ Tiền Phạt</div>
                              <div className="text-base font-extrabold text-rose-400">-{formatCurrency(salaryData.totalPenalty)}</div>
                            </div>
                            <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl p-3.5 border border-amber-500/40">
                              <div className="text-xs text-amber-300 font-extrabold uppercase mb-1">🎉 Thực Nhận</div>
                              <div className="text-base font-black text-white">{formatCurrency(salaryData.netSalary)}</div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Chi tiết danh sách ca đã được gán */}
                      <div className="glass rounded-3xl p-5 border border-[var(--color-glass-border)]">
                        <h4 className="font-extrabold text-sm text-white mb-3 flex items-center gap-2">
                          <span>📋</span> Ca đã phân công cho {selectedEmployee.name} ({empSchedule.length} ca)
                        </h4>
                        {empSchedule.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)] py-6 text-center">Chưa có ca làm nào trong tháng này</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[350px] overflow-y-auto pr-1">
                            {empSchedule.map((s) => (
                              <div
                                key={s.id}
                                className="p-3 bg-[var(--color-surface-1)] rounded-2xl flex items-center justify-between text-xs border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.15)] transition-all"
                              >
                                <span className="font-bold text-white">{formatDateShort(s.date)}</span>
                                <span
                                  className="px-2.5 py-1 rounded-xl text-[11px] font-black"
                                  style={{ backgroundColor: `${s.branches?.color}25`, color: s.branches?.color }}
                                >
                                  {s.branches?.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ============ TAB: PENALTY ============ */}
          {activeTab === 'penalty' && (
            <div className="animate-fade-in">
              {!selectedEmployee ? (
                <div className="text-center py-16 text-[var(--color-text-muted)]">
                  <div className="text-4xl mb-3 opacity-50">⚠️</div>
                  <p>Chọn nhân viên từ tab &quot;Nhân viên&quot; trước</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="glass rounded-2xl p-5 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center font-extrabold text-white text-sm">
                        {getInitials(selectedEmployee.name)}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base">{selectedEmployee.name}</h3>
                        <p className="text-xs text-[var(--color-text-muted)]">{getMonthName(selectedMonth)}</p>
                      </div>
                    </div>

                    {/* Ô chọn nhân viên trực tiếp */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)] font-bold uppercase">Chọn NV:</span>
                      <select
                        value={selectedEmployee.id}
                        onChange={(e) => {
                          const emp = employees.find((em) => em.id === e.target.value);
                          if (emp) setSelectedEmployee(emp);
                        }}
                        className="px-4 py-2 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm font-bold outline-none cursor-pointer"
                      >
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            👤 {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Add Penalty Form */}
                  <div className="glass rounded-2xl p-6">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <span>➕</span> Thêm phạt / trừ lương
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase mb-2">Số tiền (VNĐ)</label>
                        <input
                          type="number"
                          value={penaltyAmount}
                          onChange={(e) => setPenaltyAmount(e.target.value)}
                          placeholder="VD: 50000"
                          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase mb-2">Lý do</label>
                        <input
                          type="text"
                          value={penaltyReason}
                          onChange={(e) => setPenaltyReason(e.target.value)}
                          placeholder="VD: Đi trễ 3 lần"
                          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm outline-none"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={handleAddPenalty}
                          disabled={!penaltyAmount || !penaltyReason.trim()}
                          className="w-full py-3 rounded-xl btn-gradient-danger text-white font-semibold text-sm cursor-pointer border-0"
                        >
                          ⚠️ Thêm phạt
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Penalty List */}
                  <div className="glass rounded-2xl p-6">
                    <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                      <span>📋</span> Danh sách phạt - {getMonthName(selectedMonth)}
                    </h3>
                    {empPenalties.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-muted)] text-center py-4">Không có khoản phạt nào 🎉</p>
                    ) : (
                      <div className="space-y-2">
                        {empPenalties.map((p) => (
                          <div key={p.id} className="bg-[rgba(244,63,94,0.08)] border border-[rgba(244,63,94,0.2)] rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-sm text-[var(--color-coral-400)]">{p.reason}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-[var(--color-coral-400)]">-{formatCurrency(p.amount)}</span>
                              <button onClick={() => handleDeletePenalty(p.id)} className="text-xs text-[var(--color-coral-400)] border-0 bg-transparent cursor-pointer">🗑️</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminContent />
    </ToastProvider>
  );
}

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
  getEmployeeRates,
  addEmployeeRate,
  deleteEmployeeRate,
  calculateSalaryFromShifts,
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

  // Penalty & Bonus form
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [penaltyReason, setPenaltyReason] = useState('');
  const [recordType, setRecordType] = useState('bonus'); // 'bonus' | 'penalty'

  // Rate & PIN edit
  const [editingRate, setEditingRate] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [editingPinEmpId, setEditingPinEmpId] = useState(null);
  const [newPinInput, setNewPinInput] = useState('');

  // Create New Employee State
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [addEmpName, setAddEmpName] = useState('');
  const [addEmpRate, setAddEmpRate] = useState('20000');
  const [addEmpPin, setAddEmpPin] = useState('');

  function generateRandom6Pin() {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    setAddEmpPin(pin);
  }

  async function handleCreateNewEmployee(e) {
    e.preventDefault();
    if (!addEmpName.trim()) return;
    const finalPin = addEmpPin.trim() || Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const newEmp = await createEmployee(addEmpName.trim(), finalPin, Number(addEmpRate) || 20000);
      toast.success('Đã tạo nhân viên!', `Tên: ${newEmp.name} • PIN 6 số: ${finalPin}`);
      setAddEmpName('');
      setAddEmpPin('');
      setAddEmpRate('20000');
      setShowAddEmpModal(false);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tạo nhân viên mới!');
    }
  }

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

  // Rate History state
  const [empRates, setEmpRates] = useState([]);
  const [showAddRateModal, setShowAddRateModal] = useState(false);
  const [inputRateValue, setInputRateValue] = useState('24000');
  const [inputRateDate, setInputRateDate] = useState(getToday());

  async function loadEmployeeData() {
    if (!selectedEmployee) return;
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      const [sched, penalties, rates] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getPenaltiesByEmployee(selectedEmployee.id, selectedMonth),
        getEmployeeRates(selectedEmployee.id),
      ]);
      const mySched = sched.filter(s => s.employee_id === selectedEmployee.id);
      setEmpSchedule(mySched);
      setEmpPenalties(penalties);
      setEmpRates(rates);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải dữ liệu nhân viên');
    }
  }

  async function handleAddRate(e) {
    e.preventDefault();
    const rate = parseInt(inputRateValue);
    if (!rate || rate <= 0 || !inputRateDate) return;
    try {
      await addEmployeeRate(selectedEmployee.id, rate, inputRateDate);
      toast.success('Đã lưu mốc lương!', `Lương ${formatCurrency(rate)}/h áp dụng từ ngày ${inputRateDate.split('-').reverse().join('/')}`);
      setShowAddRateModal(false);
      loadEmployeeData();
    } catch (err) {
      console.error(err);
      toast.error('Cần tạo bảng', err.message || 'Không thể thêm mốc lương');
    }
  }

  async function handleDeleteRate(id) {
    try {
      await deleteEmployeeRate(id);
      toast.info('Đã xóa', 'Đã xóa mốc lương');
      loadEmployeeData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể xóa mốc lương');
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
    if (!amount || !penaltyReason.trim() || !selectedEmployee) return;
    try {
      const isBonus = recordType === 'bonus';
      const cleanReason = penaltyReason.trim();
      const prefix = isBonus ? '[THƯỞNG]' : '[PHẠT]';
      const finalReason = cleanReason.startsWith('[THƯỞNG]') || cleanReason.startsWith('[PHẠT]')
        ? cleanReason
        : `${prefix} ${cleanReason}`;

      await createPenalty({
        employee_id: selectedEmployee.id,
        month: selectedMonth,
        amount,
        type: isBonus ? 'bonus' : 'penalty',
        reason: finalReason,
      });

      if (isBonus) {
        toast.success('Đã thêm thưởng!', `🎁 +${formatCurrency(amount)} - ${cleanReason}`);
      } else {
        toast.warning('Đã thêm phạt!', `⚠️ -${formatCurrency(amount)} - ${cleanReason}`);
      }

      setPenaltyAmount('');
      setPenaltyReason('');
      loadEmployeeData();
    } catch (err) {
      console.error('handleAddPenalty error:', err);
      toast.error('Lỗi', err.message || 'Không thể lưu khoản thưởng/phạt');
    }
  }

  async function handleDeletePenalty(id) {
    try {
      await deletePenalty(id);
      toast.info('Đã xóa', 'Đã xóa khoản thưởng/phạt');
      loadEmployeeData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể xóa');
    }
  }

  // Salary calculation including gross, bonus, penalty, net with dynamic rates history
  const salaryData = useMemo(() => {
    if (!selectedEmployee) return null;
    const totalShifts = empSchedule.length;
    const defaultRate = selectedEmployee.hourly_rate || 20000;

    const { totalHours, grossSalary, shiftDetails } = calculateSalaryFromShifts(
      empSchedule,
      empRates,
      defaultRate
    );

    let totalBonus = 0;
    let totalPenalty = 0;

    empPenalties.forEach((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
      if (isBonus) {
        totalBonus += Math.abs(p.amount);
      } else {
        totalPenalty += Math.abs(p.amount);
      }
    });

    const netSalary = grossSalary + totalBonus - totalPenalty;
    return {
      totalHours,
      totalShifts,
      rate: defaultRate,
      grossSalary,
      totalBonus,
      totalPenalty,
      netSalary,
      shiftDetails,
    };
  }, [selectedEmployee, empSchedule, empPenalties, empRates]);

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

          {/* Segmented Control Navigation Tabs - Góc Vuông Phẳng */}
          <div className="flex gap-2 bg-slate-900 rounded-lg p-1.5 border border-slate-700 mb-6 max-w-2xl mx-auto animate-fade-in">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-3 rounded-md text-xs sm:text-sm font-black cursor-pointer border transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-transparent text-slate-400 border-transparent hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ============ TAB: SCHEDULE (MA TRẬN XẾP LỊCH TUẦN 5 CHI NHÁNH) ============ */}
          {activeTab === 'schedule' && (
            <div className="animate-fade-in">
              {/* Bảng Ma Trận Xếp Lịch Theo Tuần Cho 5 Chi Nhánh Tinh Gọn */}
              <WeeklyMatrixBoard employees={employees} toast={toast} />
            </div>
          )}

          {/* ============ TAB: EMPLOYEES & SALARY (MASTER-DETAIL 2 CỘT TẬP TRUNG) ============ */}
          {activeTab === 'employees' && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* CỘT TRÁI (4/12): DANH SÁCH NHÂN VIÊN (MASTER) + NÚT THÊM NHÂN VIÊN MỚI */}
                <div className="lg:col-span-4 glass rounded-3xl p-5 border border-[var(--color-glass-border)] space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] pb-3">
                    <h3 className="font-black text-base text-white flex items-center gap-2">
                      <span>👥</span> Nhân Viên ({employees.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddEmpModal(true);
                        generateRandom6Pin();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs cursor-pointer shadow-md border-0 transition-all flex items-center gap-1 active:scale-95"
                    >
                      ➕ Thêm Mới
                    </button>
                  </div>

                  {/* Search box */}
                  <div className="relative">
                    <input
                      type="text"
                      value={empSearchQuery}
                      onChange={(e) => setEmpSearchQuery(e.target.value)}
                      placeholder="🔍 Tìm nhân viên..."
                      className="w-full px-4 py-2.5 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-xs font-semibold outline-none focus:border-amber-500 transition-all"
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

                  {/* MODAL / FORM TẠO NHÂN VIÊN MỚI DO ADMIN THỰC HIỆN */}
                  {showAddEmpModal && (
                    <div className="p-4 bg-[var(--color-surface-1)] rounded-2xl border border-amber-500/40 space-y-3 animate-fade-in shadow-xl">
                      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.06)] pb-2">
                        <h4 className="font-extrabold text-xs text-amber-300 flex items-center gap-1">
                          ✨ Thêm Nhân Viên & Cấp PIN 6 Số
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowAddEmpModal(false)}
                          className="text-xs text-[var(--color-text-muted)] hover:text-white bg-transparent border-0 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={handleCreateNewEmployee} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">
                            Tên nhân viên:
                          </label>
                          <input
                            type="text"
                            value={addEmpName}
                            onChange={(e) => setAddEmpName(e.target.value)}
                            placeholder="VD: Nguyễn Văn A..."
                            required
                            autoFocus
                            className="w-full px-3 py-2 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-xs font-bold outline-none focus:border-amber-400"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-bold text-[var(--color-text-secondary)] uppercase mb-1">
                              Lương đ/giờ:
                            </label>
                            <input
                              type="number"
                              value={addEmpRate}
                              onChange={(e) => setAddEmpRate(e.target.value)}
                              placeholder="20000"
                              required
                              className="w-full px-3 py-2 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-xs font-bold outline-none focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-bold text-amber-400 uppercase">
                                PIN 6 số:
                              </label>
                              <button
                                type="button"
                                onClick={generateRandom6Pin}
                                className="text-[10px] text-amber-300 underline cursor-pointer bg-transparent border-0"
                              >
                                🎲 Đổi
                              </button>
                            </div>
                            <input
                              type="text"
                              maxLength={6}
                              value={addEmpPin}
                              onChange={(e) => setAddEmpPin(e.target.value.replace(/\D/g, ''))}
                              placeholder="123456"
                              required
                              className="w-full px-3 py-2 bg-[var(--color-surface-2)] border border-amber-500/50 rounded-xl text-amber-300 text-xs font-black text-center outline-none focus:border-amber-400 tracking-wider"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddEmpModal(false)}
                            className="px-3 py-1.5 rounded-xl bg-[var(--color-surface-2)] text-xs text-[var(--color-text-secondary)] font-bold border-0 cursor-pointer"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-xl bg-emerald-500 text-black text-xs font-black border-0 cursor-pointer shadow-md hover:bg-emerald-400 transition-all"
                          >
                            🚀 Tạo & Cấp PIN
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

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
                                    onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                    className="w-16 px-1.5 py-1 bg-[var(--color-surface-2)] border border-amber-500 rounded-lg text-white text-xs font-bold text-center outline-none"
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

                        {/* KHỐI LỊCH SỬ MỨC LƯƠNG THEO MỐC NGÀY */}
                        <div className="bg-[var(--color-surface-1)] p-4 rounded-2xl border border-[rgba(255,255,255,0.08)] space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                                <span>📜 Lịch Sử Mức Lương & Đợt Tăng Lương</span>
                              </h4>
                              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                                Lương áp dụng linh hoạt theo mốc ngày (VD: 1/7-18/7 20k/h, từ 19/7 tăng lên 24k/h)
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAddRateModal(!showAddRateModal)}
                              className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-black border border-amber-500/40 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                            >
                              <span>➕ Thêm Mốc Lương</span>
                            </button>
                          </div>

                          {/* Form Thêm Mốc Lương Mới */}
                          {showAddRateModal && (
                            <form onSubmit={handleAddRate} className="p-3 bg-[var(--color-surface-2)] rounded-xl border border-amber-500/40 space-y-3 animate-fade-in">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-amber-300 mb-1">Mức lương mới (đ/giờ):</label>
                                  <input
                                    type="number"
                                    value={inputRateValue}
                                    onChange={(e) => setInputRateValue(e.target.value)}
                                    placeholder="24000"
                                    required
                                    className="w-full px-3 py-1.5 bg-[var(--color-surface-1)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white text-xs font-bold outline-none focus:border-amber-400"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-amber-300 mb-1">Ngày bắt đầu áp dụng:</label>
                                  <input
                                    type="date"
                                    value={inputRateDate}
                                    onChange={(e) => setInputRateDate(e.target.value)}
                                    required
                                    className="w-full px-3 py-1.5 bg-[var(--color-surface-1)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white text-xs font-bold outline-none focus:border-amber-400"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowAddRateModal(false)}
                                  className="px-3 py-1 rounded-lg bg-[var(--color-surface-1)] text-xs text-[var(--color-text-secondary)] font-bold border-0 cursor-pointer"
                                >
                                  Hủy
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-1 rounded-lg bg-amber-500 text-black text-xs font-black border-0 cursor-pointer shadow-md hover:bg-amber-400"
                                >
                                  💾 Lưu Mốc Lương
                                </button>
                              </div>
                            </form>
                          )}

                          {/* Danh Sách Các Mốc Lương Đã Thêm */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white flex items-center gap-2">
                              <span className="text-amber-400 font-extrabold">Mặc định:</span>
                              <span>{formatCurrency(selectedEmployee.hourly_rate || 20000)}/h</span>
                            </div>
                            {empRates.map((r) => (
                              <div
                                key={r.id}
                                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-xs font-extrabold text-amber-300 flex items-center gap-2 shadow-sm"
                              >
                                <span>📅 Từ {r.effective_date.split('-').reverse().join('/')}:</span>
                                <span className="text-white text-sm font-black">{formatCurrency(r.hourly_rate)}/h</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRate(r.id)}
                                  className="text-rose-400 hover:text-white ml-1 bg-transparent border-0 cursor-pointer text-xs font-bold"
                                  title="Xóa mốc lương này"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Summary Stats Cards - 5 Thẻ Chi Tiết */}
                        {salaryData && (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-[11px] text-[var(--color-text-muted)] font-bold uppercase mb-1">📅 Ca đã làm</div>
                              <div className="text-base font-extrabold text-amber-400">{salaryData.totalShifts} ca ({salaryData.totalHours}h)</div>
                            </div>
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-[11px] text-[var(--color-text-muted)] font-bold uppercase mb-1">💵 Lương Ca</div>
                              <div className="text-sm font-extrabold text-blue-400">{formatCurrency(salaryData.grossSalary)}</div>
                            </div>
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-[11px] text-emerald-400 font-bold uppercase mb-1">🎁 Thưởng</div>
                              <div className="text-sm font-extrabold text-emerald-400">+{formatCurrency(salaryData.totalBonus)}</div>
                            </div>
                            <div className="bg-[var(--color-surface-1)] rounded-2xl p-3 border border-[rgba(255,255,255,0.06)]">
                              <div className="text-[11px] text-rose-400 font-bold uppercase mb-1">⚠️ Phạt</div>
                              <div className="text-sm font-extrabold text-rose-400">-{formatCurrency(salaryData.totalPenalty)}</div>
                            </div>
                            <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl p-3 border border-amber-500/40">
                              <div className="text-[11px] text-amber-300 font-extrabold uppercase mb-1">🎉 Thực Nhận</div>
                              <div className="text-sm font-black text-white">{formatCurrency(salaryData.netSalary)}</div>
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

          {/* ============ TAB: REWARD & PENALTY (THƯỞNG & PHẠT GỘP CHUNG) ============ */}
          {activeTab === 'penalty' && (
            <div className="animate-fade-in">
              {!selectedEmployee ? (
                <div className="text-center py-16 text-[var(--color-text-muted)]">
                  <div className="text-4xl mb-3 opacity-50">🎁</div>
                  <p>Chọn nhân viên để xem hoặc thêm tiền Thưởng / Phạt</p>
                </div>
              ) : (
                <div className="space-y-6 max-w-4xl mx-auto">
                  <div className="glass rounded-3xl p-5 flex items-center justify-between flex-wrap gap-4 border border-[var(--color-glass-border)]">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-emerald-500 flex items-center justify-center font-extrabold text-white text-base shadow-md">
                        {getInitials(selectedEmployee.name)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
                          <span>{selectedEmployee.name}</span>
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] font-semibold">
                          Thống kê Thưởng & Phạt • <span className="text-amber-400 font-bold">{getMonthName(selectedMonth)}</span>
                        </p>
                      </div>
                    </div>

                    {/* Ô chọn nhân viên trực tiếp */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)] font-bold uppercase">Nhân viên:</span>
                      <select
                        value={selectedEmployee.id}
                        onChange={(e) => {
                          const emp = employees.find((em) => em.id === e.target.value);
                          if (emp) setSelectedEmployee(emp);
                        }}
                        className="px-4 py-2.5 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm font-extrabold outline-none cursor-pointer focus:border-amber-500"
                      >
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            👤 {emp.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Form Thêm Khoản Thưởng / Phạt */}
                  <div className="glass rounded-3xl p-6 border border-[var(--color-glass-border)] shadow-xl">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                        <span>➕</span> Ghi Nhận Khoản Tiền Cho {selectedEmployee.name}
                      </h3>

                      {/* Nút Toggle Loại Khoản: Thưởng (+) vs Phạt (-) */}
                      <div className="flex bg-[var(--color-surface-2)] p-1 rounded-2xl border border-[rgba(255,255,255,0.08)]">
                        <button
                          type="button"
                          onClick={() => setRecordType('bonus')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 ${
                            recordType === 'bonus'
                              ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                              : 'text-[var(--color-text-muted)] hover:text-white'
                          }`}
                        >
                          <span>🎁</span> THƯỞNG (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordType('penalty')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 ${
                            recordType === 'penalty'
                              ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                              : 'text-[var(--color-text-muted)] hover:text-white'
                          }`}
                        >
                          <span>⚠️</span> PHẠT (-)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">
                          Số tiền (VNĐ)
                        </label>
                        <input
                          type="number"
                          value={penaltyAmount}
                          onChange={(e) => setPenaltyAmount(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: 100000 (Thưởng)' : 'VD: 50000 (Phạt)'}
                          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm font-bold outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-2">
                          Lý do
                        </label>
                        <input
                          type="text"
                          value={penaltyReason}
                          onChange={(e) => setPenaltyReason(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: Thưởng làm tốt, doanh số...' : 'VD: Đi trễ 20 phút, vi phạm...'}
                          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm font-bold outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddPenalty}
                          disabled={!penaltyAmount || !penaltyReason.trim()}
                          className={`w-full py-3 rounded-xl font-extrabold text-sm cursor-pointer border-0 shadow-lg transition-all active:scale-95 ${
                            recordType === 'bonus'
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black'
                              : 'bg-gradient-to-r from-rose-500 to-red-600 text-white'
                          }`}
                        >
                          {recordType === 'bonus' ? '🎁 Thêm Tiền Thưởng' : '⚠️ Thêm Tiền Phạt'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danh Sách Khoản Thưởng & Phạt */}
                  <div className="glass rounded-3xl p-6 border border-[var(--color-glass-border)] shadow-xl">
                    <h3 className="font-extrabold text-base text-white mb-4 flex items-center gap-2">
                      <span>📋</span> Danh sách Thưởng & Phạt - {getMonthName(selectedMonth)} ({empPenalties.length} khoản)
                    </h3>
                    {empPenalties.length === 0 ? (
                      <p className="text-xs text-[var(--color-text-muted)] text-center py-6 font-semibold">
                        Chưa có khoản Thưởng hoặc Phạt nào trong tháng này ✨
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {empPenalties.map((p) => {
                          const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
                          const displayReason = p.reason ? p.reason.replace('[THƯỞNG] ', '') : '';

                          return (
                            <div
                              key={p.id}
                              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-md ${
                                isBonus
                                  ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : 'bg-rose-500/10 border-rose-500/30'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{isBonus ? '🎁' : '⚠️'}</span>
                                <div>
                                  <div className={`font-extrabold text-sm ${isBonus ? 'text-emerald-300' : 'text-rose-300'}`}>
                                    {displayReason}
                                  </div>
                                  <span className="text-[11px] text-[var(--color-text-muted)] font-semibold">
                                    {isBonus ? 'Khoản Thưởng' : 'Khoản Phạt'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className={`font-black text-base ${isBonus ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isBonus ? `+${formatCurrency(p.amount)}` : `-${formatCurrency(p.amount)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePenalty(p.id)}
                                  className="w-8 h-8 rounded-xl bg-black/30 hover:bg-rose-500 hover:text-white text-xs font-bold border-0 cursor-pointer flex items-center justify-center transition-all"
                                  title="Xóa khoản này"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          );
                        })}
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

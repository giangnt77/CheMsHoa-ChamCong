'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import ScheduleCalendar from '@/components/ScheduleCalendar';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import VnDatePicker from '@/components/VnDatePicker';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployees,
  getAllEmployees,
  createEmployee,
  updateEmployeeRate,
  updateEmployeeName,
  updateEmployeePin,
  updateEmployeeCreatedAt,
  updateEmployeeStatus,
  deleteEmployee,
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
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
  formatDateFull,
  getInitials,
  getToday,
  getBranchColorStyle,
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

  // Name, Rate, PIN & Start Date edit
  const [editingName, setEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  const [editingRate, setEditingRate] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [editingPinEmpId, setEditingPinEmpId] = useState(null);
  const [newPinInput, setNewPinInput] = useState('');
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [newStartDate, setNewStartDate] = useState(getToday());

  // Create New Employee State
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [addEmpName, setAddEmpName] = useState('');
  const [addEmpRate, setAddEmpRate] = useState('20000');
  const [addEmpPin, setAddEmpPin] = useState('');
  const [addEmpStartDate, setAddEmpStartDate] = useState(getToday());

  // Branch Management State
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchNameInput, setBranchNameInput] = useState('');
  const [branchColorInput, setBranchColorInput] = useState('#7e22ce');
  const [branchAddressInput, setBranchAddressInput] = useState('');
  const [branchSortOrderInput, setBranchSortOrderInput] = useState('1');

  function handleOpenAddBranch() {
    setEditingBranch(null);
    setBranchNameInput('');
    setBranchColorInput('#7e22ce');
    setBranchAddressInput('');
    setBranchSortOrderInput(String(branches.length + 1));
    setShowBranchModal(true);
  }

  function handleOpenEditBranch(b) {
    const style = getBranchColorStyle(b.name, b.color);
    setEditingBranch(b);
    setBranchNameInput(b.name || '');
    setBranchColorInput(style.hex);
    setBranchAddressInput(b.address || '');
    setBranchSortOrderInput(String(b.sort_order || 1));
    setShowBranchModal(true);
  }

  async function handleSaveBranch(e) {
    e.preventDefault();
    if (!branchNameInput.trim()) return;

    try {
      const payload = {
        name: branchNameInput.trim(),
        color: branchColorInput || '#7e22ce',
        address: branchAddressInput.trim() || null,
        sort_order: parseInt(branchSortOrderInput, 10) || 1,
      };

      if (editingBranch) {
        await updateBranch(editingBranch.id, payload);
        toast.success('Thành công', `Đã cập nhật chi nhánh ${branchNameInput}`);
      } else {
        await createBranch(payload);
        toast.success('Thành công', `Đã tạo chi nhánh mới ${branchNameInput}`);
      }

      setShowBranchModal(false);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu chi nhánh');
    }
  }

  async function handleDeleteBranchItem(branchId, branchName) {
    if (confirm(`Bạn có chắc chắn muốn XÓA chi nhánh "${branchName}"?`)) {
      try {
        await deleteBranch(branchId);
        toast.success('Đã xóa', `Đã xóa chi nhánh ${branchName}`);
        loadInitialData();
      } catch (err) {
        console.error(err);
        toast.error('Lỗi', 'Không thể xóa chi nhánh');
      }
    }
  }

  function generateRandom6Pin() {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    setAddEmpPin(pin);
  }

  async function handleCreateNewEmployee(e) {
    e.preventDefault();
    if (!addEmpName.trim()) return;
    const finalPin = addEmpPin.trim() || Math.floor(100000 + Math.random() * 900000).toString();
    try {
      const newEmp = await createEmployee(
        addEmpName.trim(),
        finalPin,
        Number(addEmpRate) || 20000,
        addEmpStartDate || getToday()
      );
      toast.success('Đã tạo nhân viên!', `Tên: ${newEmp.name} • PIN: ${finalPin} • Ngày làm: ${formatDateFull(newEmp.created_at)}`);
      setAddEmpName('');
      setAddEmpPin('');
      setAddEmpRate('20000');
      setAddEmpStartDate(getToday());
      setShowAddEmpModal(false);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tạo nhân viên mới!');
    }
  }

  async function handleUpdateName() {
    if (!newNameInput.trim() || !selectedEmployee) return;
    try {
      const updated = await updateEmployeeName(selectedEmployee.id, newNameInput.trim());
      setSelectedEmployee(updated);
      setEditingName(false);
      toast.success('Đổi tên nhân viên', `Tên mới: ${updated.name}`);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể đổi tên (có thể tên bị trùng)');
    }
  }

  async function handleUpdateStartDate() {
    if (!newStartDate || !selectedEmployee) return;
    try {
      const updated = await updateEmployeeCreatedAt(selectedEmployee.id, newStartDate);
      setSelectedEmployee(updated);
      setEditingStartDate(false);
      toast.success('Cập nhật ngày làm', `Ngày bắt đầu làm của ${updated.name}: ${formatDateFull(updated.created_at)}`);
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể cập nhật ngày bắt đầu làm');
    }
  }

  async function handleUpdateStatus(status) {
    if (!selectedEmployee) return;
    try {
      const updated = await updateEmployeeStatus(selectedEmployee.id, status);
      setSelectedEmployee(updated);
      if (status === 'active') {
        toast.success('Cập nhật trạng thái', `${updated.name}: 🟢 Đang làm (Hiển thị trong bảng xếp lịch)`);
      } else if (status === 'leave') {
        toast.warning('Cập nhật trạng thái', `${updated.name}: 🟡 Xin off (Tạm nghỉ vài ngày)`);
      } else {
        toast.error('Cập nhật trạng thái', `${updated.name}: 🔴 Nghỉ việc (Ngừng xếp lịch làm)`);
      }
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể cập nhật trạng thái');
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
        getAllEmployees(),
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
        <div className="bg-white rounded-3xl p-8 md:p-10 max-w-sm w-full text-center border border-purple-200 shadow-xs">
          <div className="w-24 h-24 mx-auto mb-3">
            <img src="/logo.png" alt="Chè Ms Hoa Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl font-black mb-1 text-purple-950">
            Chủ Quán Admin
          </h2>
          <p className="text-xs text-purple-700 font-black mb-6">
            Nhập mã PIN Admin để truy cập
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
              className={`w-full px-5 py-4 bg-purple-50 border rounded-2xl text-purple-950 text-2xl text-center focus:ring-2 outline-none transition-all mb-4 placeholder:text-purple-300 font-black ${pinError
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-200 animate-shake'
                : 'border-purple-200 focus:border-purple-600 focus:ring-purple-200'
                }`}
            />
            {pinError && (
              <p className="text-rose-600 text-xs font-black mb-4 animate-fade-in">
                ❌ Mã PIN không đúng!
              </p>
            )}
            <button
              type="submit"
              disabled={!pinInput}
              className="w-full py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0 text-base shadow-xs"
            >
              🔓 Mở Khóa Admin
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        title="Chè Ms Hoa Chủ"
        icon="👑"
        backHref="/admin"
        homeTitle="Quản lý Admin"
        onBackClick={() => setActiveTab('schedule')}
      />

      <main className="flex-1 relative z-10 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header Bar */}
          <div className="mb-2">
            <h1 className="text-xl md:text-2xl font-black text-purple-950 tracking-tight">
              <span className="text-purple-700 font-black">Quản Lý</span> Xếp Lịch & Chấm Công 👑
            </h1>
            <p className="text-xs md:text-sm text-purple-800 font-black mt-0.5">
              Phân công 5 chi nhánh, xem đăng ký ngày và tính lương
            </p>
          </div>

          {/* Segmented Control Navigation Tabs - Purple Brand Bar */}
          <div className="flex gap-1.5 bg-purple-100/70 rounded-2xl p-1.5 border border-purple-200/80 mb-4 max-w-3xl mx-auto animate-fade-in shadow-2xs">
            {[
              { id: 'schedule', label: '📅 Xếp Lịch' },
              { id: 'employees', label: '👥 Nhân viên & Lương' },
              { id: 'penalty', label: '⚠️ Thưởng & Phạt' },
              { id: 'branches', label: '🏢 Chi Nhánh' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black cursor-pointer border transition-all ${activeTab === tab.id
                  ? 'bg-purple-700 text-white border-purple-700 shadow-xs font-black'
                  : 'bg-transparent text-purple-900 border-transparent hover:text-purple-700 font-bold'
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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                {/* CỘT TRÁI (4/12): DANH SÁCH NHÂN VIÊN (MASTER) + NÚT THÊM NHÂN VIÊN MỚI */}
                <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-purple-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-purple-100 pb-3">
                    <h3 className="font-black text-base text-purple-950 flex items-center gap-2">
                      <span>👥</span> Nhân Viên ({employees.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddEmpModal(true);
                        generateRandom6Pin();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer shadow-2xs border-0 transition-all flex items-center gap-1 active:scale-95"
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
                      className="w-full px-4 py-2.5 bg-purple-50/50 border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-xs font-bold outline-none transition-all placeholder:text-purple-400"
                    />
                    {empSearchQuery && (
                      <button
                        onClick={() => setEmpSearchQuery('')}
                        className="absolute right-2.5 top-2.5 text-xs text-purple-500 hover:text-purple-950 border-0 bg-transparent cursor-pointer font-black"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* MODAL / FORM TẠO NHÂN VIÊN MỚI DO ADMIN THỰC HIỆN */}
                  {showAddEmpModal && (
                    <div className="p-4 bg-purple-50 rounded-2xl border border-purple-300 space-y-3 animate-fade-in shadow-2xs">
                      <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                        <h4 className="font-black text-xs text-purple-950 flex items-center gap-1">
                          ✨ Thêm Nhân Viên & Cấp PIN 6 Số
                        </h4>
                        <button
                          type="button"
                          onClick={() => setShowAddEmpModal(false)}
                          className="text-xs text-purple-600 hover:text-purple-950 bg-transparent border-0 cursor-pointer font-black"
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={handleCreateNewEmployee} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-black text-purple-900 uppercase mb-1">
                            Tên nhân viên:
                          </label>
                          <input
                            type="text"
                            value={addEmpName}
                            onChange={(e) => setAddEmpName(e.target.value)}
                            placeholder="VD: Nguyễn Văn A..."
                            required
                            autoFocus
                            className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] font-black text-purple-900 uppercase mb-1">
                              Lương đ/giờ:
                            </label>
                            <input
                              type="number"
                              value={addEmpRate}
                              onChange={(e) => setAddEmpRate(e.target.value)}
                              placeholder="20000"
                              required
                              className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-black text-purple-900 uppercase">
                                PIN 6 số:
                              </label>
                              <button
                                type="button"
                                onClick={generateRandom6Pin}
                                className="text-[10px] text-purple-700 font-bold underline cursor-pointer bg-transparent border-0"
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
                              className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl text-purple-950 text-xs font-black text-center outline-none focus:border-purple-600 tracking-wider"
                            />
                          </div>
                        </div>

                        {/* Ô chọn Ngày Bắt Đầu Làm */}
                        <div>
                          <label className="block text-[11px] font-black text-purple-900 uppercase mb-1">
                            📅 Ngày bắt đầu làm:
                          </label>
                          <VnDatePicker value={addEmpStartDate} onChange={setAddEmpStartDate} />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddEmpModal(false)}
                            className="px-3 py-1.5 rounded-xl bg-purple-100 text-xs text-purple-900 font-bold border-0 cursor-pointer"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-black border-0 cursor-pointer shadow-2xs hover:bg-purple-800 transition-all"
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
                      <div className="inline-block w-6 h-6 border-2 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                    </div>
                  ) : employees.length === 0 ? (
                    <p className="text-xs text-purple-600 font-bold text-center py-6">Chưa có nhân viên</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
                      {employees
                        .filter((e) => e.name.toLowerCase().includes(empSearchQuery.toLowerCase()))
                        .map((emp) => {
                          const isSelected = selectedEmployee?.id === emp.id;
                          return (
                            <div
                              key={emp.id}
                              className={`rounded-2xl px-3 py-2 flex items-center justify-between gap-2.5 border cursor-pointer transition-all ${isSelected
                                  ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                                  : 'bg-white text-purple-950 border-purple-200/90 hover:bg-purple-50'
                                }`}
                              onClick={() => setSelectedEmployee(emp)}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${isSelected ? 'bg-white text-purple-950' : 'bg-purple-700 text-white'
                                  }`}>
                                  {getInitials(emp.name)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-black text-xs sm:text-sm truncate flex items-center gap-1">
                                    <span>{emp.name}</span>
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${isSelected ? 'bg-purple-800 text-white' : 'bg-purple-100 text-purple-950'}`}>
                                      PIN: {emp.pin || '1234'}
                                    </span>
                                    {emp.status === 'leave' ? (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-900 font-black border border-amber-300">🟡 Xin off</span>
                                    ) : (emp.status === 'off' || emp.is_active === false) ? (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-rose-100 text-rose-900 font-black border border-rose-300">🔴 Nghỉ việc</span>
                                    ) : (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300">🟢 Làm</span>
                                    )}
                                  </div>
                                  <div className={`text-[10px] font-bold truncate ${isSelected ? 'text-purple-100' : 'text-purple-700'}`}>
                                    {formatCurrency(emp.hourly_rate || 20000)}/h • Làm từ {formatDateFull(emp.created_at)}
                                  </div>
                                </div>
                              </div>

                              {/* Action buttons */}
                              {editingPinEmpId === emp.id ? (
                                <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={newPinInput}
                                    onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                    className="w-14 px-1 py-0.5 bg-white border border-purple-500 rounded text-purple-950 text-xs font-black text-center outline-none"
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
                                    className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black border-0 cursor-pointer"
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
                                    className={`p-1 rounded-lg text-xs border cursor-pointer font-bold ${isSelected ? 'bg-purple-800 text-white border-purple-600' : 'bg-purple-50 text-purple-800 border-purple-200'}`}
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
                                    className={`p-1 rounded-lg text-xs border cursor-pointer font-bold ${isSelected ? 'bg-rose-900 text-rose-200 border-rose-700' : 'bg-rose-50 text-rose-700 border-rose-200'}`}
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

                {/* CỘT PHẢI (8/12): GỘP TẤT CẢ VÀO 1 CARD DUY NHẤT GỌN GÀNG */}
                <div className="lg:col-span-8 space-y-4">
                  {!selectedEmployee ? (
                    <div className="bg-white rounded-3xl p-12 text-center text-purple-700 border border-purple-200/90 shadow-2xs">
                      <div className="text-4xl mb-3 opacity-60">👈</div>
                      <p className="font-black text-base text-purple-950 mb-1">Vui lòng bấm chọn 1 nhân viên ở danh sách bên trái</p>
                      <p className="text-xs font-bold text-purple-700">Bảng tính lương chi tiết, tổng số ca làm và số tiền thực nhận sẽ hiển thị ngay tại đây.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-3xl p-5 border border-purple-200/90 shadow-2xs space-y-4 animate-fade-in">
                      {/* TOP HEADER: Clean Info + Month Switcher */}
                      <div className="flex items-start justify-between flex-wrap gap-3 border-b border-purple-100 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-purple-700 flex items-center justify-center font-black text-white text-base shadow-2xs flex-shrink-0">
                            {getInitials(selectedEmployee.name)}
                          </div>
                          <div>
                            {/* Line 1: Name + Edit + Status */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {editingName ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={newNameInput}
                                    onChange={(e) => setNewNameInput(e.target.value)}
                                    className="w-36 px-2 py-0.5 bg-white border border-purple-400 rounded-lg text-purple-950 text-xs font-black outline-none"
                                    autoFocus
                                  />
                                  <button onClick={handleUpdateName} className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-xs font-black cursor-pointer border-0">Lưu</button>
                                  <button onClick={() => setEditingName(false)} className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 text-xs border-0 cursor-pointer font-bold">Hủy</button>
                                </div>
                              ) : (
                                <>
                                  <h3 className="font-black text-base text-purple-950 flex items-center gap-1.5">
                                    <span>{selectedEmployee.name}</span>
                                    <button
                                      onClick={() => {
                                        setEditingName(true);
                                        setNewNameInput(selectedEmployee.name);
                                      }}
                                      className="text-purple-400 hover:text-purple-800 bg-transparent border-0 cursor-pointer text-xs"
                                      title="Sửa tên"
                                    >
                                      ✏️
                                    </button>
                                  </h3>
                                  <span className="text-[10px] bg-purple-100 text-purple-950 px-2 py-0.5 rounded-md font-extrabold">
                                    PIN: {selectedEmployee.pin || '1234'}
                                  </span>

                                  {/* Select Trạng Thái (Gọn gàng) */}
                                  <select
                                    value={selectedEmployee.status || (selectedEmployee.is_active !== false ? 'active' : 'off')}
                                    onChange={(e) => handleUpdateStatus(e.target.value)}
                                    className={`px-2 py-0.5 rounded-lg text-[11px] font-black outline-none border cursor-pointer ${
                                      (selectedEmployee.status === 'leave')
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : (selectedEmployee.status === 'off' || selectedEmployee.is_active === false)
                                          ? 'bg-rose-100 text-rose-900 border-rose-300'
                                          : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                    }`}
                                  >
                                    <option value="active" className="text-emerald-950 font-bold bg-white">🟢 Làm</option>
                                    <option value="leave" className="text-amber-950 font-bold bg-white">🟡 Xin off (Tạm nghỉ)</option>
                                    <option value="off" className="text-rose-950 font-bold bg-white">🔴 Nghỉ việc (Nghỉ luôn)</option>
                                  </select>
                                </>
                              )}
                            </div>

                            {/* Line 2: Subtle Metadata Row (Lương & Ngày vào làm) */}
                            <div className="flex items-center gap-2 mt-1 text-xs font-bold text-purple-800 flex-wrap">
                              {/* Lương/h */}
                              {editingRate ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={newRate}
                                    onChange={(e) => setNewRate(e.target.value)}
                                    placeholder="25000"
                                    className="w-20 px-2 py-0.5 bg-white border border-purple-400 rounded text-purple-950 text-xs font-black outline-none"
                                  />
                                  <button onClick={handleUpdateRate} className="px-2 py-0.5 rounded bg-emerald-600 text-white text-xs font-black cursor-pointer border-0">Lưu</button>
                                  <button onClick={() => setEditingRate(false)} className="px-2 py-0.5 rounded bg-purple-100 text-purple-900 text-xs border-0 cursor-pointer font-bold">Hủy</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span>💵 Lương gốc: <strong className="text-purple-950 font-black">{formatCurrency(selectedEmployee.hourly_rate || 20000)}/h</strong></span>
                                  <button
                                    onClick={() => {
                                      setEditingRate(true);
                                      setNewRate(String(selectedEmployee.hourly_rate || 20000));
                                    }}
                                    className="text-purple-400 hover:text-purple-800 bg-transparent border-0 cursor-pointer text-xs"
                                    title="Sửa lương gốc"
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}

                              <span className="text-purple-300">•</span>

                              {/* Ngày vào làm */}
                              {editingStartDate ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <VnDatePicker value={newStartDate} onChange={setNewStartDate} />
                                  <button onClick={handleUpdateStartDate} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-black cursor-pointer border-0">Lưu</button>
                                  <button onClick={() => setEditingStartDate(false)} className="px-2 py-1 rounded bg-purple-100 text-purple-900 text-xs border-0 cursor-pointer font-bold">Hủy</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <span>📅 Vào làm: <strong className="text-purple-950 font-black">{formatDateFull(selectedEmployee.created_at)}</strong></span>
                                  <button
                                    onClick={() => {
                                      setEditingStartDate(true);
                                      const dStr = selectedEmployee.created_at ? selectedEmployee.created_at.slice(0, 10) : getToday();
                                      setNewStartDate(dStr);
                                    }}
                                    className="text-purple-400 hover:text-purple-800 bg-transparent border-0 cursor-pointer text-xs"
                                    title="Sửa ngày vào làm"
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bộ chuyển tháng */}
                        <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1 rounded-2xl border border-purple-200 shadow-2xs">
                          <button onClick={prevMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs bg-transparent border-0 cursor-pointer px-1">◀</button>
                          <span className="font-black text-xs text-purple-950 min-w-[85px] text-center">{getMonthName(selectedMonth)}</span>
                          <button onClick={nextMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs bg-transparent border-0 cursor-pointer px-1">▶</button>
                        </div>
                      </div>

                      {/* 5 THẺ THỐNG KÊ LƯƠNG GỌN GÀNG HÀNG NGANG */}
                      {salaryData && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          <div className="bg-purple-50/70 rounded-2xl p-2.5 border border-purple-200/80 text-center">
                            <div className="text-[10px] text-purple-800 font-black uppercase">🗓️ Ca đã làm</div>
                            <div className="text-xs sm:text-sm font-black text-purple-950 mt-0.5">{salaryData.totalShifts} ca ({salaryData.totalHours}h)</div>
                          </div>
                          <div className="bg-purple-50/70 rounded-2xl p-2.5 border border-purple-200/80 text-center">
                            <div className="text-[10px] text-purple-800 font-black uppercase">💵 Lương Ca</div>
                            <div className="text-xs sm:text-sm font-black text-purple-950 mt-0.5">{formatCurrency(salaryData.grossSalary)}</div>
                          </div>
                          <div className="bg-emerald-50/70 rounded-2xl p-2.5 border border-emerald-200/80 text-center">
                            <div className="text-[10px] text-emerald-800 font-black uppercase">🎁 Thưởng</div>
                            <div className="text-xs sm:text-sm font-black text-emerald-700 mt-0.5">+{formatCurrency(salaryData.totalBonus)}</div>
                          </div>
                          <div className="bg-rose-50/70 rounded-2xl p-2.5 border border-rose-200/80 text-center">
                            <div className="text-[10px] text-rose-800 font-black uppercase">⚠️ Phạt</div>
                            <div className="text-xs sm:text-sm font-black text-rose-700 mt-0.5">-{formatCurrency(salaryData.totalPenalty)}</div>
                          </div>
                          <div className="col-span-2 sm:col-span-1 bg-purple-700 rounded-2xl p-2.5 text-white text-center shadow-2xs">
                            <div className="text-[10px] text-purple-200 font-black uppercase">🎉 THỰC NHẬN</div>
                            <div className="text-xs sm:text-sm font-black mt-0.5">{formatCurrency(salaryData.netSalary)}</div>
                          </div>
                        </div>
                      )}

                      {/* SUB-GRID SONG SONG 2 CỘT: CA ĐÃ PHÂN CÔNG & MỐC TĂNG LƯƠNG */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {/* Cột Trái: Ca làm tháng này */}
                        <div className="bg-purple-50/40 p-3 rounded-2xl border border-purple-200/70 space-y-2">
                          <h4 className="font-black text-xs text-purple-950 flex items-center justify-between">
                            <span>📋 Ca làm tháng này ({empSchedule.length} ca)</span>
                          </h4>
                          {empSchedule.length === 0 ? (
                            <p className="text-xs text-purple-600 font-bold py-4 text-center">Chưa có ca làm nào</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                              {empSchedule.map((s) => {
                                const rawBranchName = s.branches?.name || '';
                                const displayBranch = (rawBranchName.toLowerCase().includes('thạch lam') || rawBranchName.toLowerCase().includes('thach lam'))
                                  ? 'TL'
                                  : rawBranchName;

                                return (
                                  <div
                                    key={s.id}
                                    className="px-2.5 py-1.5 bg-white rounded-xl flex items-center justify-between text-xs border border-purple-200/80 shadow-2xs"
                                  >
                                    <span className="font-black text-purple-950 text-[11px]">{formatDateShort(s.date)}</span>
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black text-white bg-purple-700">
                                      {displayBranch}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Cột Phải: Mốc tăng lương */}
                        <div className="bg-purple-50/40 p-3 rounded-2xl border border-purple-200/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-black text-xs text-purple-950">
                              📜 Mốc Tăng Lương
                            </h4>
                            <button
                              type="button"
                              onClick={() => setShowAddRateModal(!showAddRateModal)}
                              className="px-2 py-0.5 rounded-md bg-purple-700 text-white text-[10px] font-black cursor-pointer border-0"
                            >
                              + Thêm mốc
                            </button>
                          </div>

                          {showAddRateModal && (
                            <form onSubmit={handleAddRate} className="p-2.5 bg-white rounded-xl border border-purple-300 space-y-2 animate-fade-in shadow-2xs">
                              <div>
                                <label className="block text-[10px] font-black text-purple-900 mb-1">Mức lương mới (đ/h):</label>
                                <input
                                  type="number"
                                  value={inputRateValue}
                                  onChange={(e) => setInputRateValue(e.target.value)}
                                  placeholder="VD: 25000"
                                  required
                                  className="w-full px-2 py-1 bg-purple-50 border border-purple-200 rounded text-purple-950 text-xs font-bold outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-purple-900 mb-1">Ngày áp dụng:</label>
                                <VnDatePicker value={inputRateDate} onChange={setInputRateDate} />
                              </div>
                              <div className="flex justify-end gap-1 pt-1">
                                <button type="button" onClick={() => setShowAddRateModal(false)} className="px-2 py-0.5 rounded bg-purple-100 text-[10px] text-purple-900 font-bold border-0">Hủy</button>
                                <button type="submit" className="px-2.5 py-0.5 rounded bg-purple-700 text-white text-[10px] font-black border-0">Lưu Mốc</button>
                              </div>
                            </form>
                          )}

                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                            <div className="px-2.5 py-1 rounded-xl bg-white border border-purple-200/80 text-xs font-black text-purple-950 flex items-center justify-between shadow-2xs">
                              <span className="text-purple-700 font-bold text-[11px]">Mặc định:</span>
                              <span className="text-[11px] font-black">{formatCurrency(selectedEmployee.hourly_rate || 20000)}/h</span>
                            </div>
                            {empRates.map((r) => (
                              <div
                                key={r.id}
                                className="px-2.5 py-1 rounded-xl bg-purple-100/70 border border-purple-200 text-xs font-black text-purple-950 flex items-center justify-between shadow-2xs"
                              >
                                <span className="text-[11px] font-bold text-purple-900">📅 Từ {r.effective_date.split('-').reverse().slice(0, 2).join('/')}:</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-purple-950 text-[11px] font-black">{formatCurrency(r.hourly_rate)}/h</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRate(r.id)}
                                    className="text-rose-600 hover:text-rose-900 bg-transparent border-0 cursor-pointer text-xs font-black ml-1"
                                    title="Xóa mốc này"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
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
                <div className="text-center py-16 text-purple-600 font-bold bg-white rounded-3xl border border-purple-200">
                  <div className="text-4xl mb-3 opacity-60">🎁</div>
                  <p>Chọn nhân viên để xem hoặc thêm tiền Thưởng / Phạt</p>
                </div>
              ) : (
                <div className="space-y-5 max-w-4xl mx-auto">
                  <div className="bg-white rounded-3xl p-5 flex items-center justify-between flex-wrap gap-4 border border-purple-200/90 shadow-2xs">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-purple-700 flex items-center justify-center font-black text-white text-base shadow-2xs">
                        {getInitials(selectedEmployee.name)}
                      </div>
                      <div>
                        <h3 className="font-black text-purple-950 text-lg flex items-center gap-2">
                          <span>{selectedEmployee.name}</span>
                        </h3>
                        <p className="text-xs text-purple-700 font-black">
                          Thống kê Thưởng & Phạt • <span className="text-purple-950 font-black">{getMonthName(selectedMonth)}</span>
                        </p>
                      </div>
                    </div>

                    {/* Ô chọn nhân viên trực tiếp */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-900 font-black uppercase">Nhân viên:</span>
                      <select
                        value={selectedEmployee.id}
                        onChange={(e) => {
                          const emp = employees.find((em) => em.id === e.target.value);
                          if (emp) setSelectedEmployee(emp);
                        }}
                        className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-sm font-black outline-none cursor-pointer focus:border-purple-600 shadow-2xs"
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
                  <div className="bg-white rounded-3xl p-6 border border-purple-200/90 shadow-2xs">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                      <h3 className="font-black text-base text-purple-950 flex items-center gap-2">
                        <span>➕</span> Ghi Nhận Khoản Tiền Cho {selectedEmployee.name}
                      </h3>

                      {/* Nút Toggle Loại Khoản: Thưởng (+) vs Phạt (-) */}
                      <div className="flex bg-purple-100/70 p-1 rounded-2xl border border-purple-200/80">
                        <button
                          type="button"
                          onClick={() => setRecordType('bonus')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 ${recordType === 'bonus'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-purple-900 hover:text-purple-700 font-bold'
                            }`}
                        >
                          <span>🎁</span> THƯỞNG (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordType('penalty')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 ${recordType === 'penalty'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'text-purple-900 hover:text-purple-700 font-bold'
                            }`}
                        >
                          <span>⚠️</span> PHẠT (-)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-black text-purple-900 uppercase mb-2">
                          Số tiền (VNĐ)
                        </label>
                        <input
                          type="number"
                          value={penaltyAmount}
                          onChange={(e) => setPenaltyAmount(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: 100000 (Thưởng)' : 'VD: 50000 (Phạt)'}
                          className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl text-purple-950 text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-purple-900 uppercase mb-2">
                          Lý do
                        </label>
                        <input
                          type="text"
                          value={penaltyReason}
                          onChange={(e) => setPenaltyReason(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: Thưởng làm tốt, doanh số...' : 'VD: Đi trễ 20 phút, vi phạm...'}
                          className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl text-purple-950 text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddPenalty}
                          disabled={!penaltyAmount || !penaltyReason.trim()}
                          className={`w-full py-3 rounded-xl font-black text-sm cursor-pointer border-0 shadow-2xs transition-all active:scale-95 ${recordType === 'bonus'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-rose-600 hover:bg-rose-700 text-white'
                            }`}
                        >
                          {recordType === 'bonus' ? '🎁 Thêm Tiền Thưởng' : '⚠️ Thêm Tiền Phạt'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Danh Sách Khoản Thưởng & Phạt */}
                  <div className="bg-white rounded-3xl p-6 border border-purple-200/90 shadow-2xs">
                    <h3 className="font-black text-base text-purple-950 mb-4 flex items-center gap-2">
                      <span>📋</span> Danh sách Thưởng & Phạt - {getMonthName(selectedMonth)} ({empPenalties.length} khoản)
                    </h3>
                    {empPenalties.length === 0 ? (
                      <p className="text-xs text-purple-600 font-extrabold text-center py-6">
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
                              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs ${isBonus
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-rose-50 border-rose-200'
                                }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{isBonus ? '🎁' : '⚠️'}</span>
                                <div>
                                  <div className={`font-black text-sm ${isBonus ? 'text-emerald-950' : 'text-rose-950'}`}>
                                    {displayReason}
                                  </div>
                                  <span className={`text-[11px] font-extrabold ${isBonus ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {isBonus ? 'Khoản Thưởng' : 'Khoản Phạt'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className={`font-black text-base ${isBonus ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {isBonus ? `+${formatCurrency(p.amount)}` : `-${formatCurrency(p.amount)}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePenalty(p.id)}
                                  className="w-8 h-8 rounded-xl bg-white hover:bg-rose-600 hover:text-white text-rose-700 text-xs font-black border border-rose-200 cursor-pointer flex items-center justify-center transition-all shadow-2xs"
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

          {/* TAB 4: QUẢN LÝ CHI NHÁNH */}
          {activeTab === 'branches' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white rounded-3xl p-5 border border-purple-200/90 shadow-2xs flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-black text-lg text-purple-950 flex items-center gap-2">
                    <span>🏢</span> Danh Sách Chi Nhánh Hệ Thống ({branches.length} chi nhánh)
                  </h2>
                  <p className="text-xs font-bold text-purple-700 mt-0.5">
                    Thêm, sửa tên, màu sắc hiển thị và thứ tự sắp xếp các chi nhánh
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddBranch}
                  className="px-4 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer shadow-xs transition-all active:scale-95 border-0 flex items-center gap-1.5"
                >
                  <span>➕</span> Thêm Chi Nhánh Mới
                </button>
              </div>

              {/* Lưới Chi Nhánh */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {branches.map((b) => {
                  const style = getBranchColorStyle(b.name, b.color);

                  return (
                    <div
                      key={b.id}
                      className="p-4 rounded-2xl bg-white border border-purple-200 shadow-2xs space-y-3 relative overflow-hidden transition-all hover:border-purple-300"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full border border-purple-300 flex-shrink-0 shadow-2xs"
                            style={{ backgroundColor: style.hex }}
                          />
                          <h3 className="font-black text-base text-purple-950">{b.name}</h3>
                        </div>
                        <span className="text-[10px] font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                          Thứ tự #{b.sort_order || 1}
                        </span>
                      </div>

                    {b.address && (
                      <p className="text-xs font-extrabold text-purple-800 flex items-center gap-1">
                        📍 <span>{b.address}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-purple-100">
                      <button
                        type="button"
                        onClick={() => handleOpenEditBranch(b)}
                        className="px-3 py-1.5 rounded-xl bg-purple-100 text-purple-950 hover:bg-purple-200 text-xs font-black border-0 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBranchItem(b.id, b.name)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white text-xs font-black border border-rose-200 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                      >
                        🗑️ Xóa
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>

              {/* MODAL THÊM / SỬA CHI NHÁNH */}
              {showBranchModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/60 backdrop-blur-xs animate-fade-in">
                  <div className="bg-white rounded-3xl p-6 border border-purple-200 shadow-xl max-w-md w-full space-y-4 animate-scale-up">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                      <h3 className="font-black text-base text-purple-950 flex items-center gap-2">
                        <span>🏢</span> {editingBranch ? 'Chỉnh Sửa Chi Nhánh' : 'Thêm Chi Nhánh Mới'}
                      </h3>
                      <button
                        onClick={() => setShowBranchModal(false)}
                        className="text-purple-400 hover:text-purple-950 font-black text-sm bg-transparent border-0 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleSaveBranch} className="space-y-3">
                      <div>
                        <label className="block text-xs font-black text-purple-900 mb-1">
                          Tên Chi Nhánh <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={branchNameInput}
                          onChange={(e) => setBranchNameInput(e.target.value)}
                          placeholder="VD: Thạch Lam (TL), HBD, A4..."
                          required
                          className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-black text-purple-900 mb-1">
                            Màu sắc đại diện
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={branchColorInput}
                              onChange={(e) => setBranchColorInput(e.target.value)}
                              className="w-10 h-9 p-0.5 bg-white border border-purple-300 rounded-lg cursor-pointer"
                            />
                            <span className="text-xs font-mono font-black text-purple-950">{branchColorInput}</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-black text-purple-900 mb-1">
                            Thứ tự hiển thị
                          </label>
                          <input
                            type="number"
                            value={branchSortOrderInput}
                            onChange={(e) => setBranchSortOrderInput(e.target.value)}
                            min={1}
                            className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-purple-900 mb-1">
                          Địa chỉ (Tùy chọn)
                        </label>
                        <input
                          type="text"
                          value={branchAddressInput}
                          onChange={(e) => setBranchAddressInput(e.target.value)}
                          placeholder="VD: 123 Đường Thạch Lam, Q.Tân Phú"
                          className="w-full px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-purple-100">
                        <button
                          type="button"
                          onClick={() => setShowBranchModal(false)}
                          className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-bold text-xs border-0 cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 rounded-xl bg-purple-700 text-white font-black text-xs border-0 cursor-pointer shadow-xs"
                        >
                          Lưu Chi Nhánh
                        </button>
                      </div>
                    </form>
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

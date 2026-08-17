'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import ScheduleCalendar from '@/components/ScheduleCalendar';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import WeeklySalaryReportBoard from '@/components/WeeklySalaryReportBoard';
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
  getScheduleByEmployee,
  upsertSchedule,
  deleteSchedule,
  getPenaltiesByEmployee,
  createPenalty,
  deletePenalty,
  getEmployeeRates,
  addEmployeeRate,
  deleteEmployeeRate,
  calculateSalaryFromShifts,
  updateEmployeeContactInfo,
  getAnnouncementNotice,
  saveAnnouncementNotice,
  getSpecialEventMode,
  saveSpecialEventMode,
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

import ModalSortEmployees from '@/components/ModalSortEmployees';
import AdminSelector from '@/components/AdminSelector';
import AdminShiftSwapManager from '@/components/AdminShiftSwapManager';

function AdminContent() {
  const toast = useToast();

  // PIN Auth
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showSortEmpModal, setShowSortEmpModal] = useState(false);
  const [specialEventMode, setSpecialEventMode] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'employees' | 'salary' | 'penalty'

  // State Thông Báo Quan Trọng Admin
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeText, setNoticeText] = useState(
    '📌 LƯU Ý QUAN TRỌNG CHO QUẢN LÝ / CHỦ QUÁN:\n- Hãy kiểm tra và chốt lịch phân công tuần mới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra danh sách các ngày Cao Điểm cấm Off trước khi duyệt ca nghỉ cho nhân viên!'
  );
  const [editingNoticeText, setEditingNoticeText] = useState('');
  const [isEditingNotice, setIsEditingNotice] = useState(false);

  // Tải nội dung thông báo quan trọng & Chế độ Dịp Đặc Biệt từ Supabase DB
  useEffect(() => {
    if (isUnlocked) {
      getAnnouncementNotice().then((text) => {
        if (text) setNoticeText(text);
      });
      getSpecialEventMode().then(setSpecialEventMode);
    }
  }, [isUnlocked]);

  async function handleSaveNoticeContent() {
    if (!editingNoticeText.trim()) return;
    const newText = editingNoticeText.trim();
    setNoticeText(newText);
    setIsEditingNotice(false);
    await saveAnnouncementNotice(newText);
    toast.success('Đã cập nhật', 'Nội dung thông báo quan trọng đã được lưu đồng bộ toàn hệ thống!');
  }

  // Data
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [penaltyEmpSearchQuery, setPenaltyEmpSearchQuery] = useState('');
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);
  const [empSchedule, setEmpSchedule] = useState([]);
  const [empPenalties, setEmpPenalties] = useState([]);

  // Hàm kiểm tra tài khoản quản trị Admin (BẰNG MỌI GIÁ LOẠI BỎ 'Owner' VÀ 'Manager' KHỎI MỌI DANH SÁCH NHÂN VIÊN)
  const isManagementAccount = (emp) => {
    if (!emp) return true;
    const nameLower = String(emp.name || '').toLowerCase().trim();
    const roleLower = String(emp.role || '').toLowerCase().trim();
    return (
      roleLower === 'owner' ||
      roleLower === 'manager' ||
      nameLower === 'owner' ||
      nameLower === 'manager' ||
      nameLower.includes('owner') ||
      nameLower.includes('manager')
    );
  };

  // Danh sách nhân viên thuần túy (Loại bỏ tuyệt đối Owner / Manager)
  const staffEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => !isManagementAccount(emp));
  }, [employees]);

  // Danh sách nhân viên đang hoạt động dành riêng cho tab Thưởng & Phạt (Loại bỏ nhân viên nghỉ luôn & LOẠI BỎ BẰNG MỌI GIÁ Owner, Manager)
  const activePenaltyEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => {
      const isOff = emp.status === 'off' || emp.is_active === false;
      return !isOff && !isManagementAccount(emp);
    });
  }, [employees]);

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
  const [penaltyDate, setPenaltyDate] = useState(getToday());
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

  // Contact & CCCD State cho selectedEmployee
  const [editingContactInfo, setEditingContactInfo] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [relativePhoneInput, setRelativePhoneInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [contactInfo, setContactInfo] = useState({ phone: '', relative_phone: '', address: '', cccd_url: '' });
  const [previewCccdUrl, setPreviewCccdUrl] = useState(null);

  // Load contact info & CCCD khi chọn nhân viên 100% từ Supabase
  useEffect(() => {
    if (selectedEmployee) {
      const currentPhone = selectedEmployee.phone || '';
      const currentRelativePhone = selectedEmployee.relative_phone || '';
      const currentAddress = selectedEmployee.address || '';
      setContactInfo({
        phone: currentPhone,
        relative_phone: currentRelativePhone,
        address: currentAddress,
        cccd_url: selectedEmployee.cccd_url || '',
      });
      setPhoneInput(currentPhone);
      setRelativePhoneInput(currentRelativePhone);
      setAddressInput(currentAddress);
      setEditingContactInfo(false);
    }
  }, [selectedEmployee]);

  async function handleSaveContactInfo(e) {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      const updated = await updateEmployeeContactInfo(selectedEmployee.id, {
        phone: phoneInput.trim(),
        relative_phone: relativePhoneInput.trim(),
        address: addressInput.trim(),
      });

      const newPhone = updated?.phone !== undefined ? updated.phone : phoneInput.trim();
      const newRelativePhone = updated?.relative_phone !== undefined ? updated.relative_phone : relativePhoneInput.trim();
      const newAddress = updated?.address !== undefined ? updated.address : addressInput.trim();

      // 1. Cập nhật thẻ liên hệ hiển thị tức thì
      setContactInfo((prev) => ({
        ...prev,
        phone: newPhone,
        relative_phone: newRelativePhone,
        address: newAddress,
        cccd_url: updated?.cccd_url || prev.cccd_url,
      }));

      // 2. Cập nhật selectedEmployee hiện tại
      setSelectedEmployee((prev) => ({
        ...prev,
        phone: newPhone,
        relative_phone: newRelativePhone,
        address: newAddress,
      }));

      // 3. Cập nhật danh sách employees tổng để đồng bộ 100% không bao giờ bị cũ
      setEmployees((prevEmps) =>
        prevEmps.map((emp) =>
          emp.id === selectedEmployee.id
            ? { ...emp, phone: newPhone, relative_phone: newRelativePhone, address: newAddress }
            : emp
        )
      );

      // 4. Đồng bộ ô nhập liệu và tắt ngay chế độ sửa
      setPhoneInput(newPhone);
      setRelativePhoneInput(newRelativePhone);
      setEditingContactInfo(false);

      toast.success('Đã lưu Supabase', 'Cập nhật thông tin liên hệ thành công!');
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu thông tin liên hệ lên Supabase!');
    }
  }

  async function handleUploadCccdImage(e) {
    const file = e.target.files?.[0];
    if (!file || !selectedEmployee) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        try {
          const updated = await updateEmployeeContactInfo(selectedEmployee.id, {
            cccd_url: dataUrl,
          });
          setContactInfo((prev) => ({ ...prev, cccd_url: updated.cccd_url || dataUrl }));
          setSelectedEmployee((prev) => ({ ...prev, cccd_url: updated.cccd_url || dataUrl }));
          toast.success('Đã lưu Supabase', 'Đã lưu ảnh Căn cước công dân lên Supabase!');
        } catch (err) {
          console.error(err);
          toast.error('Lỗi', 'Không thể lưu ảnh CCCD lên Supabase!');
        }
      }
    };
    reader.readAsDataURL(file);
  }

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



  // Phân chia nhân viên thành 2 nhóm độc lập: Đang Làm & Đã Nghỉ Việc
  const [showResignedGroup, setShowResignedGroup] = useState(false);

  const activeStaffEmployees = useMemo(() => {
    if (!staffEmployees) return [];
    const activeOnly = staffEmployees.filter((e) => e.status !== 'off');
    // Sắp xếp theo trạng thái: Nhân viên '🟢 Làm' lên đầu, nhân viên '🟡 Off' (status === 'leave') đẩy xuống cuối
    return [...activeOnly].sort((a, b) => {
      const aIsLeave = a.status === 'leave' ? 1 : 0;
      const bIsLeave = b.status === 'leave' ? 1 : 0;
      return aIsLeave - bIsLeave;
    });
  }, [staffEmployees]);

  const resignedStaffEmployees = useMemo(() => {
    if (!staffEmployees) return [];
    return staffEmployees.filter((e) => e.status === 'off');
  }, [staffEmployees]);

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

  // State Cấu Hình Thời Gian Off / Nghỉ Việc Dành Cho Nhân Viên
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');
  const [offStartDateInput, setOffStartDateInput] = useState(getToday());
  const [offEndDateInput, setOffEndDateInput] = useState(getToday());
  const [resignedDateInput, setResignedDateInput] = useState(getToday());

  function handleSelectStatusChange(newStatus) {
    if (!selectedEmployee) return;
    if (newStatus === 'active') {
      executeSaveStatus('active', {});
    } else {
      setPendingStatus(newStatus);
      setOffStartDateInput(selectedEmployee.off_start_date || getToday());
      setOffEndDateInput(selectedEmployee.off_end_date || getToday());
      setResignedDateInput(selectedEmployee.resigned_at || getToday());
      setShowStatusModal(true);
    }
  }

  async function executeSaveStatus(status, extraData = {}) {
    if (!selectedEmployee) return;
    try {
      const updated = await updateEmployeeStatus(selectedEmployee.id, status, extraData);
      setSelectedEmployee(updated);
      setShowStatusModal(false);

      if (status === 'active') {
        toast.success('Cập nhật trạng thái', `${updated.name}: 🟢 Đang làm (Hiển thị trong bảng xếp lịch)`);
      } else if (status === 'leave') {
        toast.warning('Cập nhật trạng thái', `${updated.name}: 🟡 Xin off (${extraData.off_start_date} ➔ ${extraData.off_end_date})`);
      } else {
        toast.error('Cập nhật trạng thái', `${updated.name}: 🔴 Nghỉ việc từ ngày ${extraData.resigned_at}`);
      }
      loadInitialData();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể cập nhật trạng thái');
    }
  }

  // Check PIN on mount
  // Role state: 'owner' (Chủ quán - Full Access) | 'manager' (Quản lý - Chỉ Xếp Lịch)
  const [adminRole, setAdminRole] = useState('owner');

  function changeActiveTab(tabId) {
    setActiveTab(tabId);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('chemshoa_admin_active_tab', tabId);
      localStorage.setItem('chemshoa_admin_active_tab', tabId);
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('chemshoa_admin_unlocked');
    const savedRole = sessionStorage.getItem('chemshoa_admin_role') || 'owner';
    const savedTab = sessionStorage.getItem('chemshoa_admin_active_tab') || localStorage.getItem('chemshoa_admin_active_tab');

    if (saved === 'true') {
      setIsUnlocked(true);
      setAdminRole(savedRole);
      if (savedTab && ['schedule', 'shift_swaps', 'salary', 'employees', 'penalty', 'branches'].includes(savedTab)) {
        if (savedRole === 'manager' && savedTab !== 'schedule') {
          setActiveTab('schedule');
        } else {
          setActiveTab(savedTab);
        }
      }
      loadInitialData();
    }
  }, []);

  async function handlePinSubmit(e) {
    e.preventDefault();
    const ownerPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '123456';
    
    // Đọc danh sách nhân viên để check role của PIN trong DB
    let allEmps = [];
    try {
      allEmps = await getAllEmployees();
    } catch (err) {}

    const matchedEmp = allEmps.find((emp) => String(emp.pin) === String(pinInput));
    
    if (pinInput === '666666' || (matchedEmp && matchedEmp.role === 'manager')) {
      // Vai trò QUẢN LÝ (Chỉ Xếp Lịch)
      setIsUnlocked(true);
      setAdminRole('manager');
      changeActiveTab('schedule');
      sessionStorage.setItem('chemshoa_admin_unlocked', 'true');
      sessionStorage.setItem('chemshoa_admin_role', 'manager');
      setPinError(false);
      toast.success('Đăng nhập Quản Lý', 'Quyền Quản Lý: Được xem & xếp lịch làm việc');
      loadInitialData();
    } else if (
      pinInput === ownerPin ||
      pinInput === '888888' ||
      pinInput === '1234' ||
      (matchedEmp && (matchedEmp.role === 'owner' || !matchedEmp.role))
    ) {
      // Vai trò CHỦ QUÁN (Full Access)
      setIsUnlocked(true);
      setAdminRole('owner');
      const savedTab = sessionStorage.getItem('chemshoa_admin_active_tab') || localStorage.getItem('chemshoa_admin_active_tab');
      if (savedTab && ['schedule', 'shift_swaps', 'salary', 'employees', 'penalty', 'branches'].includes(savedTab)) {
        setActiveTab(savedTab);
      }
      sessionStorage.setItem('chemshoa_admin_unlocked', 'true');
      sessionStorage.setItem('chemshoa_admin_role', 'owner');
      setPinError(false);
      toast.success('Đăng nhập Chủ Quán', 'Quyền Chủ Quán: Toàn quyền quản lý hệ thống');
      loadInitialData();
    } else {
      setPinError(true);
      setPinInput('');
    }
  }

  function handleAdminLogout() {
    setIsUnlocked(false);
    setPinInput('');
    setAdminRole('owner');
    sessionStorage.removeItem('chemshoa_admin_unlocked');
    sessionStorage.removeItem('chemshoa_admin_role');
    sessionStorage.removeItem('chemshoa_admin_active_tab');
    localStorage.removeItem('chemshoa_admin_active_tab');
    toast.info('Đã đăng xuất', 'Đã đăng xuất tài khoản Admin');
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
      // Lọc bỏ Owner/Manager ngay từ đầu khi chọn nhân viên mặc định
      const filteredStaff = (empData || []).filter((e) => {
        if (e.role === 'owner' || e.role === 'manager') return false;
        const nLower = (e.name || '').toLowerCase();
        return !nLower.includes('chủ quán') && !nLower.includes('quản lý') && !nLower.includes('owner') && !nLower.includes('manager');
      });
      if (filteredStaff.length > 0 && !selectedEmployee) {
        setSelectedEmployee(filteredStaff[0]);
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

  // Rate History & Lifetime Accumulation state
  const [empRates, setEmpRates] = useState([]);
  const [allLifetimeSched, setAllLifetimeSched] = useState([]);
  const [allLifetimePenalties, setAllLifetimePenalties] = useState([]);
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
      const [sched, penalties, rates, myLifetimeSched, lifetimePenalties] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getPenaltiesByEmployee(selectedEmployee.id, selectedMonth),
        getEmployeeRates(selectedEmployee.id),
        getScheduleByEmployee(selectedEmployee.id),
        getPenaltiesByEmployee(selectedEmployee.id),
      ]);
      const mySched = (sched || []).filter(s => s.employee_id === selectedEmployee.id);
      setEmpSchedule(mySched);
      setEmpPenalties(penalties || []);
      setEmpRates(rates || []);
      setAllLifetimeSched(myLifetimeSched || []);
      setAllLifetimePenalties(lifetimePenalties || []);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải dữ liệu nhân viên');
    }
  }

  // Tính tổng tích lũy từ khi bắt đầu vào làm tới nay
  const lifetimeData = useMemo(() => {
    if (!selectedEmployee) return null;
    const defaultRate = selectedEmployee.hourly_rate || 20000;
    const { totalHours, grossSalary } = calculateSalaryFromShifts(allLifetimeSched, empRates, defaultRate);

    let bonus = 0;
    let penalty = 0;
    allLifetimePenalties.forEach(p => {
      const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
      if (isBonus) bonus += Math.abs(p.amount);
      else penalty += Math.abs(p.amount);
    });

    const netSalary = grossSalary + bonus - penalty;

    return {
      totalShifts: allLifetimeSched.length,
      totalHours,
      grossSalary,
      totalBonus: bonus,
      totalPenalty: penalty,
      netSalary,
    };
  }, [selectedEmployee, allLifetimeSched, empRates, allLifetimePenalties]);

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
    const rawAmount = Number(penaltyAmount);
    if (!penaltyAmount || isNaN(rawAmount) || rawAmount <= 0) {
      toast.warning('Cảnh báo', 'Vui lòng nhập số tiền lớn hơn 0đ!');
      return;
    }
    if (rawAmount > 1000000000) {
      toast.warning('Số tiền quá lớn', 'Số tiền thưởng/phạt 1 lần tối đa là 1.000.000.000đ (1 Tỷ)!');
      return;
    }
    if (!penaltyReason.trim() || !selectedEmployee) {
      toast.warning('Thiếu thông tin', 'Vui lòng chọn nhân viên và nhập lý do!');
      return;
    }

    const amount = Math.min(Math.round(rawAmount), 1000000000);
    try {
      const isBonus = recordType === 'bonus';
      const cleanReason = penaltyReason.trim();
      const prefix = isBonus ? '[THƯỞNG]' : '[PHẠT]';
      const finalReason = cleanReason.startsWith('[THƯỞNG]') || cleanReason.startsWith('[PHẠT]')
        ? cleanReason
        : `${prefix} ${cleanReason}`;

      const targetMonth = penaltyDate ? penaltyDate.slice(0, 7) : selectedMonth;

      await createPenalty({
        employee_id: selectedEmployee.id,
        month: targetMonth,
        date: penaltyDate || getToday(),
        amount,
        type: isBonus ? 'bonus' : 'penalty',
        reason: finalReason,
      });

      const formattedDate = penaltyDate ? penaltyDate.split('-').reverse().join('/') : '';

      if (isBonus) {
        toast.success('Đã thêm thưởng!', `🎁 +${formatCurrency(amount)} - ${cleanReason} (${formattedDate})`);
      } else {
        toast.warning('Đã thêm phạt!', `⚠️ -${formatCurrency(amount)} - ${cleanReason} (${formattedDate})`);
      }

      setPenaltyAmount('');
      setPenaltyReason('');
      setPenaltyDate(getToday());
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

  function handleAdminSelect(role, acc) {
    setIsUnlocked(true);
    setAdminRole(role);
    const savedTab = sessionStorage.getItem('chemshoa_admin_active_tab') || localStorage.getItem('chemshoa_admin_active_tab');
    if (savedTab && ['schedule', 'shift_swaps', 'salary', 'employees', 'penalty', 'branches'].includes(savedTab)) {
      if (role === 'manager' && savedTab !== 'schedule') {
        changeActiveTab('schedule');
      } else {
        setActiveTab(savedTab);
      }
    } else if (role === 'manager') {
      changeActiveTab('schedule');
    }
    sessionStorage.setItem('chemshoa_admin_unlocked', 'true');
    sessionStorage.setItem('chemshoa_admin_role', role);
    loadInitialData();
  }

  function handleGoToEmployeePenalty(empObj, monthStr) {
    if (empObj) {
      setSelectedEmployee(empObj);
    }
    if (monthStr) {
      setSelectedMonth(monthStr);
    }
    changeActiveTab('penalty');
    toast.info('Thưởng & Phạt', `Đã chuyển đến quản lý Thưởng & Phạt của ${empObj?.name || 'nhân viên'}`);
  }

  // ========================================
  // ADMIN LOGIN SELECTOR SCREEN (DẠNG THẺ GIỐNG NHÂN VIÊN)
  // ========================================
  if (!isUnlocked) {
    return <AdminSelector onSelect={handleAdminSelect} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        title="Chè Ms Hoa"
        icon="👑"
        backHref="/nhanvien"
        homeIcon="🚪"
        homeTitle="Đăng Xuất Admin"
        onBackClick={handleAdminLogout}
        employeeName={adminRole === 'manager' ? 'Quản Lý (Chỉ Xếp Lịch)' : 'Chủ Quán (Chị Hoa)'}
      />

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header Bar Mobile Friendly */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2">
            <h1 className="text-lg sm:text-xl md:text-2xl font-black text-purple-950 tracking-tight">
              <span className="text-purple-700 font-black">Quản Lý</span> Xếp Lịch & Chấm Công
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* Nút Bật / Tắt Chế Độ Dịp Đặc Biệt (Đăng ký Tết / 1 Tháng) */}
              <button
                type="button"
                onClick={async () => {
                  const nextState = !specialEventMode;
                  setSpecialEventMode(nextState);
                  await saveSpecialEventMode(nextState);
                  if (nextState) {
                    toast.success('ĐÃ BẬT DỊP ĐẶC BIỆT!', 'Nhân viên nay có thể đăng ký rảnh trọn 1 Tháng (Tết/Lễ)');
                  } else {
                    toast.info('Đã tắt Dịp Đặc Biệt', 'Hệ thống quay về đăng ký theo tuần mặc định');
                  }
                }}
                className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-black border cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1 ${
                  specialEventMode
                    ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
                title="Bấm để BẬT/TẮT cho nhân viên đăng ký 1 Tháng (Tết/Lễ)"
              >
                <span>🎆</span>
                <span>{specialEventMode ? 'Dịp Đặc Biệt: ON' : 'Dịp Đặc Biệt: OFF'}</span>
              </button>

              {/* Nút Bật & Sửa Thông Báo Quan Trọng */}
              <button
                type="button"
                onClick={() => setShowNoticeModal(true)}
                className="px-2.5 sm:px-3 py-1 rounded-full bg-amber-400 hover:bg-amber-500 text-purple-950 text-[11px] sm:text-xs font-black border border-amber-500 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                title="Bấm để xem & sửa Thông Báo Quan Trọng"
              >
                <span>🔔</span>
                <span className="hidden xs:inline">Thông Báo Quan Trọng</span>
                <span className="xs:hidden">Thông Báo</span>
              </button>
            </div>
          </div>

          {/* Segmented Control Navigation Tabs - Vuốt Ngang Mượt Mà Trên Mobile */}
          <div className="flex gap-1.5 bg-purple-100/80 rounded-2xl p-1.5 border border-purple-200/90 mb-4 overflow-x-auto custom-scrollbar whitespace-nowrap shadow-2xs">
            {[
              { id: 'schedule', label: 'Xếp Lịch', icon: '📅' },
              { id: 'shift_swaps', label: 'QL Ca Đổi', icon: '🔄' },
              { id: 'salary', label: 'QL Tính Lương', icon: '💰' },
              { id: 'employees', label: 'QL Nhân Viên', icon: '👥' },
              { id: 'penalty', label: 'Thưởng & Phạt', icon: '🎁' },
              { id: 'branches', label: 'Chi Nhánh', icon: '🏪' },
            ].map((tab) => {
              const isRestricted = adminRole === 'manager' && tab.id !== 'schedule';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => changeActiveTab(tab.id)}
                  className={`px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-purple-700 text-white shadow-xs font-black'
                      : isRestricted
                      ? 'bg-purple-50/50 text-purple-400 font-bold'
                      : 'text-purple-950 hover:bg-purple-200/60 font-bold'
                  }`}
                  title={isRestricted ? 'Quyền Quản Lý bị hạn chế tính năng này' : ''}
                >
                  <span>{isRestricted ? '🔒' : tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* THÔNG BÁO QUYỀN HẠN CHẾ DÀNH CHO TÀI KHOẢN QUẢN LÝ */}
          {adminRole === 'manager' && activeTab !== 'schedule' && (
            <div className="bg-white rounded-3xl p-8 sm:p-12 text-center border border-purple-200 shadow-2xs max-w-2xl mx-auto space-y-4 my-8 animate-fade-in">
              <div className="text-5xl">🔒</div>
              <h3 className="text-xl sm:text-2xl font-black text-purple-950">
                Quyền Truy Cập Bị Hạn Chế
              </h3>
              <p className="text-xs sm:text-sm text-purple-800 font-extrabold leading-relaxed">
                Bạn đang đăng nhập bằng tài khoản <span className="text-amber-700 font-black">Quản Lý</span> (chỉ được phép xem & xếp lịch làm việc).
                <br />
                Các tính năng tính lương, quản lý nhân sự và tài chính chỉ dành riêng cho tài khoản <span className="text-purple-900 font-black">Chủ Quán</span>!
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="px-6 py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm border-0 cursor-pointer shadow-xs transition-all active:scale-95"
              >
                ◀ Quay về Bảng Xếp Lịch
              </button>
            </div>
          )}

          {/* ============ TAB: SCHEDULE (MA TRẬN XẾP LỊCH TUẦN 5 CHI NHÁNH) ============ */}
          {activeTab === 'schedule' && (
            <div className="animate-fade-in">
              {/* Bảng Ma Trận Xếp Lịch Theo Tuần Cho 5 Chi Nhánh Tinh Gọn */}
              <WeeklyMatrixBoard employees={employees} toast={toast} onRefreshEmployees={loadInitialData} />
            </div>
          )}

          {/* CHỈ RENDER CÁC TAB NÀY KHI CÓ QUYỀN CHỦ QUÁN (adminRole === 'owner') */}
          {adminRole === 'owner' && activeTab === 'salary' && (
            <div className="animate-fade-in">
              <WeeklySalaryReportBoard employees={employees} toast={toast} onSelectPenaltyEmployee={handleGoToEmployeePenalty} />
            </div>
          )}

          {adminRole === 'owner' && activeTab === 'employees' && (
            <div className="animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                {/* CỘT TRÁI (4/12): DANH SÁCH NHÂN VIÊN (MASTER) + NÚT THÊM NHÂN VIÊN MỚI */}
                <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-purple-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-purple-100 pb-3">
                    <h3 className="font-black text-base text-purple-950 flex items-center gap-2">
                      <span>👥</span> Nhân Viên ({staffEmployees.length})
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

                  {/* Danh sách nhân viên phân thành 2 khu vực: Đang Làm & Đã Nghỉ Việc */}
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="inline-block w-6 h-6 border-2 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                    </div>
                  ) : staffEmployees.length === 0 ? (
                    <p className="text-xs text-purple-600 font-bold text-center py-6">Chưa có nhân viên</p>
                  ) : (
                    <div className="space-y-4">
                      {/* KHU VỰC 1: NHÂN VIÊN ĐANG LÀM VIỆC (🟢 Active) */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-black text-emerald-900 uppercase tracking-wider flex items-center justify-between bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                          <span className="flex items-center gap-1.5">
                            <span>🟢</span>
                            <span>Đang Làm Việc ({activeStaffEmployees.length})</span>
                          </span>
                        </div>

                        {activeStaffEmployees.length === 0 ? (
                          <p className="text-xs text-purple-600 font-bold text-center py-4">Không có nhân viên đang làm</p>
                        ) : (
                          <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                            {activeStaffEmployees
                              .filter((e) => e.name.toLowerCase().includes(empSearchQuery.toLowerCase()))
                              .map((emp) => {
                                const isSelected = selectedEmployee?.id === emp.id;
                                return (
                                  <div
                                    key={emp.id}
                                    className={`rounded-2xl p-2.5 sm:p-3 border cursor-pointer transition-all ${
                                      isSelected
                                        ? 'bg-purple-900 text-white border-purple-800 shadow-md ring-2 ring-purple-400/50'
                                        : 'bg-white text-purple-950 border-purple-200/90 hover:bg-purple-50'
                                    }`}
                                    onClick={() => setSelectedEmployee(emp)}
                                  >
                                    {/* Hàng 1: Avatar + Tên + Trạng Thái + Nút Thao Tác */}
                                    <div className="flex items-center justify-between gap-1.5">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div
                                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${
                                            isSelected ? 'bg-amber-400 text-purple-950 font-black' : 'bg-purple-700 text-white'
                                          }`}
                                        >
                                          {getInitials(emp.name)}
                                        </div>
                                        <span className={`font-black text-xs sm:text-sm truncate ${isSelected ? 'text-white' : 'text-purple-950'}`}>
                                          {emp.name}
                                        </span>
                                        {emp.status === 'leave' ? (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-black border border-amber-300 flex-shrink-0">🟡 Off</span>
                                        ) : (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-black border border-emerald-300 flex-shrink-0">🟢 Làm</span>
                                        )}
                                      </div>

                                      {/* Action buttons (🔑 Đổi PIN & 🗑️ Xóa) */}
                                      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                        {editingPinEmpId === emp.id ? (
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="text"
                                              maxLength={6}
                                              value={newPinInput}
                                              onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                              className="w-14 px-1 py-0.5 bg-white border border-purple-500 rounded text-purple-950 text-xs font-black text-center outline-none"
                                              autoFocus
                                            />
                                            <button
                                              type="button"
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
                                              ✓
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingPinEmpId(emp.id);
                                                setNewPinInput(emp.pin || '123456');
                                              }}
                                              className={`p-1 rounded-lg border-0 cursor-pointer transition-all text-xs ${
                                                isSelected ? 'bg-purple-800 text-amber-300 hover:bg-purple-700' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                              }`}
                                              title="Đổi PIN nhân viên"
                                            >
                                              🔑
                                            </button>
                                            <button
                                              type="button"
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
                                              className={`p-1 rounded-lg border-0 cursor-pointer transition-all text-xs ${
                                                isSelected ? 'bg-rose-900 text-rose-200 hover:bg-rose-800' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                              }`}
                                              title="Xóa nhân viên"
                                            >
                                              🗑️
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Hàng 2: Lương • Ngày Làm • PIN */}
                                    <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1 border-t border-purple-100/30">
                                      <div className={`truncate ${isSelected ? 'text-purple-200' : 'text-purple-700'}`}>
                                        💰 {formatCurrency(emp.hourly_rate || 20000)}/h • Làm từ {formatDateFull(emp.created_at)}
                                      </div>
                                      <div className={`text-[10px] px-1.5 py-0.2 rounded font-black flex-shrink-0 ml-1 ${
                                        isSelected ? 'bg-purple-800 text-amber-300 border border-purple-700' : 'bg-purple-100 text-purple-900'
                                      }`}>
                                        PIN: {emp.pin || '123456'}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>

                      {/* KHU VỰC 2: HÀNG RIÊNG CHO NHÂN VIÊN ĐÃ NGHỈ VIỆC (🔴 Off / Resigned) */}
                      {resignedStaffEmployees.length > 0 && (
                        <div className="pt-2 border-t border-purple-200 space-y-2">
                          <button
                            type="button"
                            onClick={() => setShowResignedGroup(!showResignedGroup)}
                            className="w-full text-xs font-black text-rose-950 uppercase tracking-wider flex items-center justify-between bg-rose-50 hover:bg-rose-100/90 px-3 py-2 rounded-xl border border-rose-300 cursor-pointer transition-all shadow-2xs"
                          >
                            <span className="flex items-center gap-1.5">
                              <span>🔴</span>
                              <span>Nhân Viên Đã Nghỉ Việc ({resignedStaffEmployees.length})</span>
                            </span>
                            <span className="text-[11px] font-black bg-white px-2 py-0.5 rounded-lg border border-rose-300 text-rose-900">
                              {showResignedGroup ? '▼ Ẩn danh sách' : '▶ Xem danh sách'}
                            </span>
                          </button>

                          {showResignedGroup && (
                            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar animate-fade-in pt-1">
                              {resignedStaffEmployees
                                .filter((e) => e.name.toLowerCase().includes(empSearchQuery.toLowerCase()))
                                .map((emp) => {
                                  const isSelected = selectedEmployee?.id === emp.id;
                                  return (
                                    <div
                                      key={emp.id}
                                      className={`rounded-2xl p-2.5 sm:p-3 border cursor-pointer transition-all opacity-85 hover:opacity-100 ${
                                        isSelected
                                          ? 'bg-purple-900 text-white border-purple-800 shadow-md ring-2 ring-purple-400/50'
                                          : 'bg-rose-50/50 text-purple-950 border-rose-200 hover:bg-rose-100/50'
                                      }`}
                                      onClick={() => setSelectedEmployee(emp)}
                                    >
                                      {/* Hàng 1: Avatar + Tên + Badge Nghỉ Việc */}
                                      <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <div
                                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${
                                              isSelected ? 'bg-amber-400 text-purple-950 font-black' : 'bg-rose-700 text-white'
                                            }`}
                                          >
                                            {getInitials(emp.name)}
                                          </div>
                                          <span className={`font-black text-xs sm:text-sm truncate ${isSelected ? 'text-white' : 'text-purple-950'}`}>
                                            {emp.name}
                                          </span>
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-900 font-black border border-rose-300 flex-shrink-0">
                                            🔴 Đã Nghỉ
                                          </span>
                                        </div>

                                        {/* Action buttons (🔑 Đổi PIN & 🗑️ Xóa) */}
                                        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                          {editingPinEmpId === emp.id ? (
                                            <div className="flex items-center gap-1">
                                              <input
                                                type="text"
                                                maxLength={6}
                                                value={newPinInput}
                                                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                                                className="w-14 px-1 py-0.5 bg-white border border-purple-500 rounded text-purple-950 text-xs font-black text-center outline-none"
                                                autoFocus
                                              />
                                              <button
                                                type="button"
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
                                                ✓
                                              </button>
                                            </div>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingPinEmpId(emp.id);
                                                  setNewPinInput(emp.pin || '123456');
                                                }}
                                                className={`p-1 rounded-lg border-0 cursor-pointer transition-all text-xs ${
                                                  isSelected ? 'bg-purple-800 text-amber-300 hover:bg-purple-700' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                                }`}
                                                title="Đổi PIN nhân viên"
                                              >
                                                🔑
                                              </button>
                                              <button
                                                type="button"
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
                                                className={`p-1 rounded-lg border-0 cursor-pointer transition-all text-xs ${
                                                  isSelected ? 'bg-rose-900 text-rose-200 hover:bg-rose-800' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                                }`}
                                                title="Xóa hẳn khỏi hệ thống"
                                              >
                                                🗑️
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      {/* Hàng 2: Lương • Ngày Nghỉ Việc */}
                                      <div className="flex items-center justify-between text-[11px] font-bold mt-1 pt-1 border-t border-purple-100/30">
                                        <div className={`truncate ${isSelected ? 'text-purple-200' : 'text-rose-900'}`}>
                                          📅 Nghỉ việc từ: <strong>{emp.resigned_at ? emp.resigned_at.split('-').reverse().join('/') : 'Trước đó'}</strong>
                                        </div>
                                        <div className={`text-[10px] px-1.5 py-0.2 rounded font-black flex-shrink-0 ml-1 ${
                                          isSelected ? 'bg-purple-800 text-amber-300 border border-purple-700' : 'bg-rose-100 text-rose-900'
                                        }`}>
                                          PIN: {emp.pin || '123456'}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}
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

                                  {/* Select Trạng Thái (Tự động chuyển 'active' khi hết hạn off_end_date) */}
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={
                                        (selectedEmployee.status === 'leave' && selectedEmployee.off_end_date && getToday() > selectedEmployee.off_end_date)
                                          ? 'active'
                                          : (selectedEmployee.status || (selectedEmployee.is_active !== false ? 'active' : 'off'))
                                      }
                                      onChange={(e) => handleSelectStatusChange(e.target.value)}
                                      className={`px-2 py-0.5 rounded-lg text-[11px] font-black outline-none border cursor-pointer ${
                                        (selectedEmployee.status === 'leave' && (!selectedEmployee.off_end_date || getToday() <= selectedEmployee.off_end_date))
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

                                    {/* Nút sửa mốc thời gian off/nghỉ việc */}
                                    {selectedEmployee.status === 'leave' && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectStatusChange('leave')}
                                        className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 hover:bg-amber-200 text-[10px] font-black border border-amber-300 cursor-pointer"
                                        title="Chỉnh sửa mốc ngày xin off"
                                      >
                                        📅 {selectedEmployee.off_start_date ? `${selectedEmployee.off_start_date.split('-').reverse().slice(0,2).join('/')}-${selectedEmployee.off_end_date ? selectedEmployee.off_end_date.split('-').reverse().slice(0,2).join('/') : ''}` : 'Sửa mốc off'} ✏️
                                      </button>
                                    )}

                                    {selectedEmployee.status === 'off' && (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectStatusChange('off')}
                                        className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-950 hover:bg-rose-200 text-[10px] font-black border border-rose-300 cursor-pointer"
                                        title="Chỉnh sửa ngày nghỉ việc"
                                      >
                                        📅 {selectedEmployee.resigned_at ? selectedEmployee.resigned_at.split('-').reverse().join('/') : 'Sửa ngày nghỉ'} ✏️
                                      </button>
                                    )}
                                  </div>
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

                      </div>

                      {/* 5 THẺ THỐNG KÊ TÍCH LŨY TOÀN BỘ TỪ TRƯỚC TỚI NAY (DÀNH CHO TAB QL NHÂN VIÊN) */}
                      {lifetimeData && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-black text-purple-900 px-1">
                            <span className="uppercase tracking-tight flex items-center gap-1">
                              <span>⚡ TỔNG TÍCH LŨY TOÀN BỘ (TỪ KHI VÀO LÀM ĐẾN NAY)</span>
                            </span>
                            <span className="text-[10px] text-purple-700 font-extrabold bg-purple-100 px-2 py-0.5 rounded-full border border-purple-200">
                              Lũy kế toàn thời gian
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {/* Card 1: Tổng Ca & Giờ Tích Lũy */}
                            <div className="bg-purple-50/80 rounded-2xl p-2.5 sm:p-3 border border-purple-200/90 text-center shadow-2xs space-y-0.5">
                              <div className="text-[10px] text-purple-800 font-black uppercase">⌛ Ca đã làm</div>
                              <div className="text-xs sm:text-sm font-black text-purple-950">
                                {lifetimeData.totalShifts} ca
                              </div>
                              <div className="text-[10.5px] font-extrabold text-purple-700">
                                ({lifetimeData.totalHours}h)
                              </div>
                            </div>

                            {/* Card 2: Lương Ca Tích Lũy */}
                            <div className="bg-purple-50/80 rounded-2xl p-2.5 sm:p-3 border border-purple-200/90 text-center shadow-2xs space-y-0.5">
                              <div className="text-[10px] text-purple-800 font-black uppercase">💵 Lương Ca</div>
                              <div className="text-xs sm:text-sm font-black text-emerald-700">
                                {formatCurrency(lifetimeData.grossSalary)}
                              </div>
                              <div className="text-[10px] font-bold text-slate-500">Toàn thời gian</div>
                            </div>

                            {/* Card 3: Thưởng Tích Lũy */}
                            <div
                              onClick={() => handleGoToEmployeePenalty(selectedEmployee, selectedMonth)}
                              className="bg-emerald-50/80 hover:bg-emerald-100/90 rounded-2xl p-2.5 sm:p-3 border border-emerald-200/90 text-center cursor-pointer transition-all active:scale-95 hover:scale-[1.02] shadow-2xs space-y-0.5"
                              title="Bấm để chuyển sang trang Thưởng & Phạt"
                            >
                              <div className="text-[10px] text-emerald-800 font-black uppercase">🎁 Tổng Thưởng</div>
                              <div className="text-xs sm:text-sm font-black text-emerald-700">
                                +{formatCurrency(lifetimeData.totalBonus)}
                              </div>
                              <div className="text-[9.5px] font-bold text-emerald-800">Bấm để quản lý ➔</div>
                            </div>

                            {/* Card 4: Phạt Tích Lũy */}
                            <div
                              onClick={() => handleGoToEmployeePenalty(selectedEmployee, selectedMonth)}
                              className="bg-rose-50/80 hover:bg-rose-100/90 rounded-2xl p-2.5 sm:p-3 border border-rose-200/90 text-center cursor-pointer transition-all active:scale-95 hover:scale-[1.02] shadow-2xs space-y-0.5"
                              title="Bấm để chuyển sang trang Thưởng & Phạt"
                            >
                              <div className="text-[10px] text-rose-800 font-black uppercase">⚠️ Tổng Phạt</div>
                              <div className="text-xs sm:text-sm font-black text-rose-700">
                                -{formatCurrency(lifetimeData.totalPenalty)}
                              </div>
                              <div className="text-[9.5px] font-bold text-rose-800">Bấm để quản lý ➔</div>
                            </div>

                            {/* Card 5: Thực Nhận Tích Lũy Toàn Thời Gian */}
                            <div
                              className="col-span-2 sm:col-span-1 bg-purple-900 hover:bg-purple-950 rounded-2xl p-2.5 sm:p-3 text-white text-center shadow-md border-2 border-purple-700 transition-all space-y-0.5"
                            >
                              <div className="text-[10px] text-amber-300 font-black uppercase">🚀 THỰC NHẬN</div>
                              <div className="text-xs sm:text-sm font-black text-amber-300">
                                {formatCurrency(lifetimeData.netSalary)}
                              </div>
                              <div className="text-[10px] font-extrabold text-purple-200">
                                ({lifetimeData.totalHours}h • {lifetimeData.totalShifts} ca)
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* SUB-GRID SONG SONG 2 CỘT: CA ĐÃ PHÂN CÔNG & MỐC TĂNG LƯƠNG */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {/* Cột Trái: Danh sách tất cả ca làm tích lũy */}
                        <div className="bg-purple-50/40 p-3 rounded-2xl border border-purple-200/70 space-y-2">
                          <h4 className="font-black text-xs text-purple-950 flex items-center justify-between">
                            <span>📋 Tất cả ca làm tích lũy ({allLifetimeSched.length} ca)</span>
                          </h4>
                          {allLifetimeSched.length === 0 ? (
                            <p className="text-xs text-purple-600 font-bold py-4 text-center">Chưa có ca làm nào</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5 max-h-[190px] overflow-y-auto pr-1 custom-scrollbar">
                              {allLifetimeSched.map((s) => {
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

                      {/* SUB-GRID SONG SONG 2 CỘT MỚI: 📞 THÔNG TIN LIÊN LẠC & 🆔 CĂN CƯỚC CÔNG DÂN (CCCD) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-purple-100">
                        {/* Ô 1: 📞 Thông Tin Liên Lạc (SĐT & SĐT Người Thân) */}
                        <div className="bg-purple-50/40 p-3 rounded-2xl border border-purple-200/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-black text-xs text-purple-950 flex items-center gap-1.5">
                              <span>📞</span> Thông Tin Liên Lạc
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContactInfo(!editingContactInfo);
                                setPhoneInput(contactInfo.phone || '');
                                setRelativePhoneInput(contactInfo.relative_phone || '');
                              }}
                              className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-950 hover:bg-purple-200 text-[10px] font-black cursor-pointer border border-purple-300 transition-all"
                            >
                              {editingContactInfo ? 'Hủy' : '✏️ Sửa liên hệ'}
                            </button>
                          </div>

                          {editingContactInfo ? (
                            <form onSubmit={handleSaveContactInfo} className="p-2.5 bg-white rounded-xl border border-purple-300 space-y-2 animate-fade-in shadow-2xs">
                              <div>
                                <label className="block text-[10px] font-black text-purple-900 mb-0.5">SĐT Nhân Viên:</label>
                                <input
                                  type="text"
                                  value={phoneInput}
                                  onChange={(e) => setPhoneInput(e.target.value)}
                                  placeholder="VD: 0901234567"
                                  className="w-full px-2 py-1 bg-purple-50 border border-purple-200 rounded text-purple-950 text-xs font-bold outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-purple-900 mb-0.5">SĐT Người Thân (Mẹ/Cha...):</label>
                                <input
                                  type="text"
                                  value={relativePhoneInput}
                                  onChange={(e) => setRelativePhoneInput(e.target.value)}
                                  placeholder="VD: 0909876543 (Mẹ)"
                                  className="w-full px-2 py-1 bg-purple-50 border border-purple-200 rounded text-purple-950 text-xs font-bold outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-black text-purple-900 mb-0.5">🏠 Địa Chỉ Nhà:</label>
                                <input
                                  type="text"
                                  value={addressInput}
                                  onChange={(e) => setAddressInput(e.target.value)}
                                  placeholder="VD: 123 Nguyễn Thị Minh Khai, Q.3, TP.HCM"
                                  className="w-full px-2 py-1 bg-purple-50 border border-purple-200 rounded text-purple-950 text-xs font-bold outline-none"
                                />
                              </div>
                              <div className="flex justify-end gap-1 pt-1">
                                <button type="button" onClick={() => setEditingContactInfo(false)} className="px-2 py-0.5 rounded bg-purple-100 text-[10px] text-purple-900 font-bold border-0">Hủy</button>
                                <button type="submit" className="px-2.5 py-0.5 rounded bg-purple-700 text-white text-[10px] font-black border-0">Lưu Thông Tin</button>
                              </div>
                            </form>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="px-2.5 py-1.5 rounded-xl bg-white border border-purple-200/80 text-xs font-black text-purple-950 flex items-center justify-between shadow-2xs">
                                <span className="text-purple-700 font-bold text-[11px]">📱 SĐT Nhân Viên:</span>
                                <span className="text-[11px] font-black text-purple-950">
                                  {contactInfo.phone ? (
                                    <a href={`tel:${contactInfo.phone}`} className="hover:underline text-purple-900">{contactInfo.phone}</a>
                                  ) : (
                                    <span className="text-purple-400 italic font-normal">Chưa nhập</span>
                                  )}
                                </span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-xl bg-white border border-purple-200/80 text-xs font-black text-purple-950 flex items-center justify-between shadow-2xs">
                                <span className="text-purple-700 font-bold text-[11px]">👨‍👩‍👧 SĐT Người Thân:</span>
                                <span className="text-[11px] font-black text-purple-950">
                                  {contactInfo.relative_phone ? (
                                    <a href={`tel:${contactInfo.relative_phone.split(' ')[0]}`} className="hover:underline text-purple-900">{contactInfo.relative_phone}</a>
                                  ) : (
                                    <span className="text-purple-400 italic font-normal">Chưa nhập</span>
                                  )}
                                </span>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-xl bg-white border border-purple-200/80 text-xs font-black text-purple-950 flex items-start justify-between shadow-2xs gap-2">
                                <span className="text-purple-700 font-bold text-[11px] shrink-0">🏠 Địa Chỉ Nhà:</span>
                                <span className="text-[11px] font-black text-purple-950 text-right min-w-0 break-words">
                                  {contactInfo.address ? (
                                    contactInfo.address
                                  ) : (
                                    <span className="text-purple-400 italic font-normal">Chưa nhập</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Ô 2: 🆔 Căn Cước Công Dân (Hình Ảnh CCCD) */}
                        <div className="bg-purple-50/40 p-3 rounded-2xl border border-purple-200/70 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-black text-xs text-purple-950 flex items-center gap-1.5">
                              <span>🆔</span> Căn Cước Công Dân (CCCD)
                            </h4>
                            <label className="px-2 py-0.5 rounded-md bg-purple-700 text-white hover:bg-purple-800 text-[10px] font-black cursor-pointer shadow-2xs border-0 transition-all flex items-center gap-1">
                              <span>📸</span> {contactInfo.cccd_url ? 'Đổi ảnh' : '+ Tải ảnh'}
                              <input type="file" accept="image/*" onChange={handleUploadCccdImage} className="hidden" />
                            </label>
                          </div>

                          {contactInfo.cccd_url ? (
                            <div className="relative group rounded-xl overflow-hidden border border-purple-200 bg-slate-100/80 shadow-2xs">
                              <img
                                src={contactInfo.cccd_url}
                                alt="CCCD Nhân Viên"
                                onClick={() => setPreviewCccdUrl(contactInfo.cccd_url)}
                                className="w-full h-36 object-contain cursor-pointer transition-all hover:scale-102 p-1"
                              />
                              <div className="absolute inset-0 bg-purple-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all pointer-events-none">
                                <span className="text-white text-xs font-black bg-purple-900/90 px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1">
                                  <span>🔍</span> Phóng To Xem Chi Tiết
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed border-purple-200 rounded-xl p-3 text-center bg-white">
                              <span className="text-xl opacity-40">🪪</span>
                              <p className="text-[11px] font-bold text-purple-500 mt-0.5">Chưa có ảnh CCCD nhân viên</p>
                              <label className="inline-block mt-1 px-3 py-1 rounded-lg bg-purple-100 text-purple-950 hover:bg-purple-200 text-[10px] font-black cursor-pointer border border-purple-300">
                                📸 Tải ảnh CCCD từ máy
                                <input type="file" accept="image/*" onChange={handleUploadCccdImage} className="hidden" />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ============ TAB: REWARD & PENALTY (THƯỞNG & PHẠT GỘP CHUNG) ============ */}
          {adminRole === 'owner' && activeTab === 'penalty' && (
            <div className="animate-fade-in">
              {!selectedEmployee ? (
                <div className="text-center py-16 text-purple-600 font-bold bg-white rounded-3xl border border-purple-200">
                  <div className="text-4xl mb-3 opacity-60">🎁</div>
                  <p>Chọn nhân viên để xem hoặc thêm tiền Thưởng / Phạt</p>
                </div>
              ) : (
                <div className="space-y-5 max-w-4xl mx-auto">
                  {/* BỘ CHỌN NHÂN VIÊN DẠNG THẺ HÀNG DỌC TỐI ƯU MOBILE (CHỈ HIỂN THỊ ĐÚNG 3 THẺ) */}
                  <div className="bg-white rounded-3xl p-3.5 sm:p-4 border border-purple-200/90 shadow-2xs space-y-2.5">
                    {/* Header Bar + Bộ chọn tháng */}
                    <div className="flex items-center justify-between gap-2 flex-wrap border-b border-purple-100 pb-2">
                      <span className="text-xs sm:text-sm font-black text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
                        <span>👥</span> Chọn Nhân Viên ({activePenaltyEmployees.length})
                      </span>

                      {/* Bộ điều hướng tháng tiện lợi */}
                      <div className="flex items-center gap-1 bg-purple-50 px-2.5 py-1 rounded-2xl border border-purple-200 shadow-2xs">
                        <button
                          type="button"
                          onClick={prevMonth}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer text-xs active:scale-95 shadow-2xs transition-all"
                          title="Tháng trước"
                        >
                          ◀
                        </button>
                        <span className="font-black text-xs text-purple-950 px-1 min-w-[85px] text-center">
                          {getMonthName(selectedMonth)}
                        </span>
                        <button
                          type="button"
                          onClick={nextMonth}
                          className="w-6 h-6 rounded-lg bg-white hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer text-xs active:scale-95 shadow-2xs transition-all"
                          title="Tháng sau"
                        >
                          ▶
                        </button>
                      </div>
                    </div>

                    {/* Ô Tìm Kiếm Nhân Viên Nhỏ Gọn Tối Ưu Mobile */}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-purple-500">🔍</span>
                      <input
                        type="text"
                        value={penaltyEmpSearchQuery}
                        onChange={(e) => setPenaltyEmpSearchQuery(e.target.value)}
                        placeholder="Tìm nhân viên..."
                        className="w-full pl-8 pr-7 py-2 bg-purple-50/50 border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-xs font-bold outline-none transition-all placeholder:text-purple-400"
                      />
                      {penaltyEmpSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setPenaltyEmpSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-purple-500 hover:text-purple-950 border-0 bg-transparent cursor-pointer font-black"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* DANH SÁCH THẺ NHÂN VIÊN (CHỈ HIỂN THỊ CÁC NHÂN VIÊN ĐANG LÀM VIỆC — LOẠI BỎ NGHỈ LUÔN) */}
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                      {activePenaltyEmployees
                        .filter((emp) => emp.name.toLowerCase().includes(penaltyEmpSearchQuery.toLowerCase().trim()))
                        .map((emp) => {
                          const isSelected = selectedEmployee?.id === emp.id;
                          return (
                            <div
                              key={emp.id}
                              onClick={() => setSelectedEmployee(emp)}
                              className={`rounded-2xl py-2 px-3 border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'bg-purple-900 text-white border-purple-800 shadow-md ring-2 ring-purple-400/50 scale-[1.01]'
                                  : 'bg-white text-purple-950 border-purple-200/90 hover:bg-purple-50'
                              }`}
                            >
                              <div className="flex items-center gap-3 truncate">
                                <div
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                    isSelected ? 'bg-amber-400 text-purple-950' : 'bg-purple-700 text-white'
                                  }`}
                                >
                                  {getInitials(emp.name)}
                                </div>
                                <span className="font-black text-xs sm:text-sm truncate">{emp.name}</span>
                              </div>

                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-amber-400 text-purple-950 font-black text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                                  ✓
                                </span>
                              )}
                            </div>
                          );
                        })}
                      {activePenaltyEmployees.filter((emp) => emp.name.toLowerCase().includes(penaltyEmpSearchQuery.toLowerCase().trim())).length === 0 && (
                        <p className="text-xs text-purple-500 italic text-center py-4">Không tìm thấy nhân viên phù hợp</p>
                      )}
                    </div>
                  </div>

                  {/* Header Thông Tin Nhân Viên Đã Chọn */}
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
                          📅 Ngày Áp Dụng
                        </label>
                        <VnDatePicker value={penaltyDate} onChange={setPenaltyDate} />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
                          Số tiền (VNĐ)
                        </label>
                        <input
                          type="number"
                          value={penaltyAmount}
                          onChange={(e) => setPenaltyAmount(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: 100000' : 'VD: 50000'}
                          className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400 h-[38px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
                          Lý do
                        </label>
                        <input
                          type="text"
                          value={penaltyReason}
                          onChange={(e) => setPenaltyReason(e.target.value)}
                          placeholder={recordType === 'bonus' ? 'VD: Làm tốt, doanh số...' : 'VD: Đi trễ, vi phạm...'}
                          className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400 h-[38px]"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddPenalty}
                          disabled={!penaltyAmount || !penaltyReason.trim()}
                          className={`w-full py-2.5 rounded-xl font-black text-xs sm:text-sm cursor-pointer border-0 shadow-2xs transition-all active:scale-95 h-[38px] ${recordType === 'bonus'
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

                          // Format ngày áp dụng và thời gian ghi nhận (created_at)
                          const effectiveDateStr = p.date
                            ? formatDateFull(p.date)
                            : (p.created_at ? formatDateFull(p.created_at.slice(0, 10)) : 'Chưa rõ');

                          const createdAtFormatted = p.created_at
                            ? `${new Date(p.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} • ${formatDateFull(p.created_at.slice(0, 10))}`
                            : null;

                          return (
                            <div
                              key={p.id}
                              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-2xs ${isBonus
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-rose-50 border-rose-200'
                                }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="text-2xl mt-0.5">{isBonus ? '🎁' : '⚠️'}</span>
                                <div className="space-y-1">
                                  <div className={`font-black text-sm ${isBonus ? 'text-emerald-950' : 'text-rose-950'}`}>
                                    {displayReason}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-extrabold">
                                    <span className={`px-2 py-0.5 rounded-md ${isBonus ? 'bg-emerald-200/70 text-emerald-900 border border-emerald-300' : 'bg-rose-200/70 text-rose-900 border border-rose-300'}`}>
                                      {isBonus ? 'Khoản Thưởng' : 'Khoản Phạt'}
                                    </span>
                                    <span className="text-purple-900 font-bold bg-white/80 px-2 py-0.5 rounded-md border border-purple-200">
                                      📅 Ngày áp dụng: <strong>{effectiveDateStr}</strong>
                                    </span>
                                    {createdAtFormatted && (
                                      <span className="text-purple-700 font-medium">
                                        🕒 Tạo lúc: {createdAtFormatted}
                                      </span>
                                    )}
                                  </div>
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
          {adminRole === 'owner' && activeTab === 'branches' && (
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

          {/* TAB QUẢN LÝ ĐỔI CA FOR ADMIN */}
          {activeTab === 'shift_swaps' && (
            <AdminShiftSwapManager />
          )}

          {/* MODAL SẮP XẾP THỨ TỰ NHÂN VIÊN */}
          <ModalSortEmployees
            isOpen={showSortEmpModal}
            onClose={() => setShowSortEmpModal(false)}
            employees={employees}
            onSaveSuccess={() => {
              loadEmployeeData();
            }}
          />
          {/* MODAL PHÓNG TO XEM ẢNH CCCD SẮC NÉT (KÍCH THƯỚC LỚN RÕ RÀNG) */}
          {previewCccdUrl && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs animate-fade-in" onClick={() => setPreviewCccdUrl(null)}>
              <div className="relative max-w-4xl w-full max-h-[92vh] bg-white rounded-3xl p-4 shadow-2xl space-y-3 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between w-full border-b border-purple-100 pb-2.5 px-1 shrink-0">
                  <h3 className="font-black text-sm sm:text-base text-purple-950 flex items-center gap-2">
                    <span>🆔</span> Ảnh Căn Cước Công Dân — {selectedEmployee?.name}
                  </h3>
                  <button onClick={() => setPreviewCccdUrl(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border-0 cursor-pointer flex items-center justify-center">✕</button>
                </div>
                <div className="overflow-auto flex-1 flex items-center justify-center p-1 w-full max-h-[82vh]">
                  <img src={previewCccdUrl} alt="CCCD Phóng To" className="max-h-[80vh] max-w-full w-auto h-auto rounded-2xl object-contain shadow-xl border border-purple-200" />
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
             POPUP THÔNG BÁO QUAN TRỌNG ADMIN (CÓ NÚT ẨN TRONG 4 GIỜ)
             ========================================================================= */}
          {showNoticeModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in">
              <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in">
                {/* Header Popup */}
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-2xs">
                      🔔
                    </div>
                    <div>
                      <h3 className="font-black text-base sm:text-lg text-purple-950">
                        Thông Báo Quan Trọng
                      </h3>
                      <p className="text-[11px] text-purple-700 font-extrabold">
                        Hệ thống thông báo Chè Ms Hoa
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(false)}
                    className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung Thông báo */}
                {isEditingNotice ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-black text-purple-950 uppercase">
                      ✏️ Soạn nội dung thông báo quan trọng:
                    </label>
                    <textarea
                      rows={5}
                      value={editingNoticeText}
                      onChange={(e) => setEditingNoticeText(e.target.value)}
                      className="w-full p-3 bg-purple-50 border border-purple-300 rounded-2xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600 custom-scrollbar"
                      placeholder="Nhập thông báo quan trọng..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingNotice(false)}
                        className="px-3 py-1.5 rounded-xl bg-purple-100 text-purple-950 font-bold text-xs border-0 cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveNoticeContent}
                        className="px-4 py-1.5 rounded-xl bg-purple-700 text-white font-black text-xs border-0 cursor-pointer shadow-2xs"
                      >
                        🚀 Lưu Thay Đổi
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300/90 text-purple-950 text-xs sm:text-sm font-extrabold whitespace-pre-wrap leading-relaxed shadow-2xs">
                      {noticeText}
                    </div>

                    {/* Nút bấm tác vụ phía Admin */}
                    <div className="flex gap-2 pt-1">
                      {adminRole === 'owner' && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoticeText(noticeText);
                            setIsEditingNotice(true);
                          }}
                          className="flex-1 py-2.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-500 text-purple-950 border border-amber-500 cursor-pointer shadow-2xs"
                        >
                          ✏️ Sửa Thông Báo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowNoticeModal(false)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-black bg-purple-700 hover:bg-purple-800 text-white border-0 cursor-pointer shadow-2xs"
                      >
                        Đã Hiểu / Đóng
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* POPUP CẤU HÌNH THỜI GIAN XIN OFF / NGHỈ VIỆC */}
          {showStatusModal && selectedEmployee && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in">
              <div className="relative max-w-md w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in">
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{pendingStatus === 'leave' ? '🟡' : '🔴'}</span>
                    <h3 className="font-black text-purple-950 text-base">
                      {pendingStatus === 'leave' ? `Cấu Hình Ngày Xin Off — ${selectedEmployee.name}` : `Cấu Hình Ngày Nghỉ Việc — ${selectedEmployee.name}`}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStatusModal(false)}
                    className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-sm flex items-center justify-center border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {pendingStatus === 'leave' ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 font-bold">
                      📌 Nhập mốc thời gian nhân viên xin Off. Trong khoảng thời gian này nhân viên mới bị đánh dấu Off, các mốc thời gian trước đó vẫn giữ nguyên tên trên bảng ma trận lịch!
                    </div>

                    <div>
                      <label className="block font-black text-purple-950 mb-1">📅 Bắt đầu Off từ ngày:</label>
                      <VnDatePicker value={offStartDateInput} onChange={setOffStartDateInput} />
                    </div>

                    <div>
                      <label className="block font-black text-purple-950 mb-1">📅 Off đến hết ngày:</label>
                      <VnDatePicker value={offEndDateInput} onChange={setOffEndDateInput} />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowStatusModal(false)}
                        className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-bold cursor-pointer border-0"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => executeSaveStatus('leave', { off_start_date: offStartDateInput, off_end_date: offEndDateInput })}
                        className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black cursor-pointer border-0 shadow-2xs"
                      >
                        Lưu Mốc Xin Off
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-rose-900 font-bold">
                      📌 Nhập ngày nhân viên chính thức nghỉ việc. Các tuần trước ngày nghỉ việc vẫn hiển thị tên nhân viên để xem lại lịch sử chấm công!
                    </div>

                    <div>
                      <label className="block font-black text-purple-950 mb-1">📅 Ngày chính thức nghỉ việc:</label>
                      <VnDatePicker value={resignedDateInput} onChange={setResignedDateInput} />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowStatusModal(false)}
                        className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-bold cursor-pointer border-0"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={() => executeSaveStatus('off', { resigned_at: resignedDateInput })}
                        className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black cursor-pointer border-0 shadow-2xs"
                      >
                        Lưu Ngày Nghỉ Việc
                      </button>
                    </div>
                  </div>
                )}
              </div>
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

'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Navbar from '@/components/Navbar';
import EmployeeSelector from '@/components/EmployeeSelector';
import WeeklyAvailability from '@/components/WeeklyAvailability';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import ModalShiftSwap from '@/components/ModalShiftSwap';
import SalaryConfirmationBox from '@/components/SalaryConfirmationBox';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployeeByName,
  getEmployees,
  getAllEmployees,
  createEmployee,
  getScheduleByDateRange,
  updateEmployeeRate,
  getEmployeeRates,
  calculateSalaryFromShifts,
  getAnnouncementNotice,
  getShiftSwapsByEmployee,
  getPenaltiesByEmployee,
  getHolidaySettings,
  getBranches,
  updateEmployeeNickname,
  checkNicknameCooldown,
  verifyEmployeePin,
} from '@/lib/supabase';
import {
  getCurrentMonth,
  formatCurrency,
  getToday,
  formatDateFull,
  formatDateWithDayVN,
  validateNickname,
  getBranchColorStyle,
  getDayOfWeekLabel,
} from '@/lib/utils';

function EmployeeContent() {
  const toast = useToast();

  // Auth state
  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  useEffect(() => {
    getAllEmployees().then((data) => {
      const filtered = (data || []).filter((emp) => {
        const nameLower = String(emp.name || '').toLowerCase().trim();
        const roleLower = String(emp.role || '').toLowerCase().trim();
        return (
          roleLower !== 'owner' &&
          roleLower !== 'manager' &&
          nameLower !== 'owner' &&
          nameLower !== 'manager' &&
          !nameLower.includes('owner') &&
          !nameLower.includes('manager')
        );
      });
      setEmployees(filtered);
    }).catch(console.error);
  }, []);

  // View state
  const [view, setView] = useState('schedule');

  // Worked hours & salary state
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyHours, setMonthlyHours] = useState(0);
  const [monthlyShiftsCount, setMonthlyShiftsCount] = useState(0);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [empRates, setEmpRates] = useState([]);
  const [empPenalties, setEmpPenalties] = useState([]);
  const [monthlyShiftDetails, setMonthlyShiftDetails] = useState([]);
  const [branches, setBranches] = useState([]);
  const [salaryViewMode, setSalaryViewMode] = useState('grid');
  const [isSalaryConfirmed, setIsSalaryConfirmed] = useState(false);
  
  // Password change modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  // Nickname state
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false);

  // State Thông Báo Quan Trọng Dành Cho Nhân Viên
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeText, setNoticeText] = useState(
    '📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!'
  );

  // State Quản Lý Đổi Ca & Chi Tiết Lỗi Phạt / Thưởng
  const [shiftSwaps, setShiftSwaps] = useState([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showPenaltyDetailModal, setShowPenaltyDetailModal] = useState(false);
  const [showBonusDetailModal, setShowBonusDetailModal] = useState(false);
  const [swapFilterMonth, setSwapFilterMonth] = useState(getCurrentMonth());

  useEffect(() => {
    if (employee) {
      getAnnouncementNotice().then((text) => {
        if (text) setNoticeText(text);
      });

      loadMyShiftSwaps();

      const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
      const snooze = localStorage.getItem(snoozeKey);
      if (!snooze || Date.now() > Number(snooze)) {
        setShowNoticeModal(true);
      } else {
        setShowNoticeModal(false);
      }
    }
  }, [employee]);

  async function loadMyShiftSwaps() {
    if (!employee) return;
    try {
      const data = await getShiftSwapsByEmployee(employee.id);
      setShiftSwaps(data);
    } catch (e) {
      console.error(e);
    }
  }

  // Chấm xanh nháy phát sáng: Chỉ hiện khi có ca vừa được duyệt/từ chối TRONG VÒNG 24 GIỜ và CHƯA ĐỌC
  const hasUnreadApprovedSwap = useMemo(() => {
    if (!employee || !shiftSwaps || shiftSwaps.length === 0) return false;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000; // 24 giờ
    const lastRead = Number(localStorage.getItem(`chems_last_read_swaps_${employee.id}`) || '0');

    return shiftSwaps.some((s) => {
      if (s.status !== 'approved' && s.status !== 'rejected') return false;
      const updatedAt = s.updated_at ? new Date(s.updated_at).getTime() : new Date(s.created_at).getTime();
      const isRecentWithin24h = (now - updatedAt) <= oneDayMs;
      const isNewerThanLastRead = updatedAt > lastRead;
      return isRecentWithin24h && isNewerThanLastRead;
    });
  }, [employee, shiftSwaps]);

  function handleMarkSwapsAsRead() {
    if (!employee) return;
    localStorage.setItem(`chems_last_read_swaps_${employee.id}`, String(Date.now()));
  }

  function handleSnoozeEmployeeNotice4Hours() {
    if (!employee) return;
    const snoozeTime = Date.now() + 4 * 60 * 60 * 1000; // 4 tiếng
    const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
    localStorage.setItem(snoozeKey, String(snoozeTime));
    setShowNoticeModal(false);
  }

  // Luôn bắt đầu từ Màn Hình Chọn Nhân Viên (Không tự động nhảy thẳng vào app qua cache)
  useEffect(() => {
    setInitialLoading(false);
  }, []);

  // Load employee monthly hours whenever employee or selectedMonth changes
  useEffect(() => {
    if (employee) {
      loadEmployeeHours();
    }
  }, [employee, selectedMonth]);

  async function loadEmployeeHours() {
    try {
      let cleanMonth = selectedMonth;
      if (!cleanMonth || typeof cleanMonth !== 'string' || cleanMonth.includes('NaN') || !cleanMonth.includes('-')) {
        cleanMonth = getCurrentMonth();
        setSelectedMonth(cleanMonth);
      }

      const parts = cleanMonth.split('-').map(Number);
      const year = parts[0] || new Date().getFullYear();
      const month = parts[1] || (new Date().getMonth() + 1);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

      const [schedData, rates, penaltiesData, holidayData, branchData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(employee.id),
        getPenaltiesByEmployee(employee.id, cleanMonth),
        getHolidaySettings(),
        getBranches(),
      ]);

      setEmpRates(rates || []);
      setEmpPenalties(penaltiesData || []);
      setBranches(branchData || []);

      // Quy tắc tính lương chuẩn: Chỉ cộng dồn ca làm ĐÃ DIỄN RA (s.date <= getToday())
      // Các ca tương lai được xếp sẵn chưa đến ngày sẽ KHÔNG bị dồn cộng trước!
      const todayStr = getToday();
      const myShifts = (schedData || []).filter(
        (s) => s.employee_id === employee.id && s.date <= todayStr
      );

      myShifts.sort((a, b) => a.date.localeCompare(b.date));

      const { totalHours, grossSalary, shiftDetails } = calculateSalaryFromShifts(
        myShifts,
        rates || [],
        employee.hourly_rate || 20000,
        holidayData || []
      );

      setMonthlyHours(totalHours);
      setMonthlyShiftsCount(myShifts.length);
      setMonthlySalary(grossSalary);
      setMonthlyShiftDetails(shiftDetails || []);
    } catch (err) {
      console.error('Error loading employee hours:', err);
    }
  }

  // Lọc danh sách khoản phạt vi phạm (không tính thưởng)
  const penaltyList = useMemo(() => {
    if (!empPenalties) return [];
    return empPenalties.filter((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      return !isBonus;
    });
  }, [empPenalties]);

  const totalPenaltyAmount = useMemo(() => {
    return penaltyList.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
  }, [penaltyList]);

  // Lọc danh sách khoản thưởng / phụ cấp
  const bonusList = useMemo(() => {
    if (!empPenalties) return [];
    return empPenalties.filter((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      return isBonus;
    });
  }, [empPenalties]);

  const totalBonusAmount = useMemo(() => {
    return bonusList.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
  }, [bonusList]);

  // Lương thực nhận = Lương ca làm + Thưởng - Phạt
  const netSalary = useMemo(() => {
    return Math.max(0, Math.round(monthlySalary + totalBonusAmount - totalPenaltyAmount));
  }, [monthlySalary, totalBonusAmount, totalPenaltyAmount]);

  // Chuỗi hiển thị Tháng an toàn 100% không bao giờ bị NaN/NaN
  const displayMonthStr = useMemo(() => {
    const clean = (selectedMonth && selectedMonth.includes('-') && !selectedMonth.includes('NaN'))
      ? selectedMonth
      : getCurrentMonth();
    const parts = clean.split('-');
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
    return `${m}/${y}`;
  }, [selectedMonth]);

  // Danh sách các ngày cho lịch tháng 7 cột
  const calendarMonthDays = useMemo(() => {
    if (!selectedMonth || !selectedMonth.includes('-')) return [];
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const shiftsByDate = {};
    (monthlyShiftDetails || []).forEach((s) => {
      if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
      shiftsByDate[s.date].push(s);
    });

    const firstDayObj = new Date(year, month - 1, 1);
    const firstDow = firstDayObj.getDay();
    // Monday is index 0:
    const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;

    // Ngày của tháng trước
    const prevMonthLastDate = new Date(year, month - 1, 0).getDate();
    const prevMonth = month === 1 ? 12 : month - 1;

    const list = [];
    // Các ngày cuối của tháng trước để lấp đầy hàng đầu
    for (let i = leadingBlanks - 1; i >= 0; i--) {
      const prevD = prevMonthLastDate - i;
      list.push({
        isOtherMonth: true,
        key: `prev-${prevD}`,
        dayDisplay: `${String(prevD).padStart(2, '0')}/${String(prevMonth).padStart(2, '0')}`,
      });
    }

    // Các ngày trong tháng hiện tại
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      const dObj = new Date(year, month - 1, d);
      const dow = dObj.getDay();
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const dayShifts = shiftsByDate[dateStr] || [];
      const totalDayHours = dayShifts.reduce((acc, cur) => acc + (cur.hours || 0), 0);
      const totalDaySalary = dayShifts.reduce((acc, cur) => acc + (cur.shiftSalary || 0), 0);

      list.push({
        isOtherMonth: false,
        key: dateStr,
        dayNum: d,
        dateStr,
        dateFormatted: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
        dowLabel,
        isWeekend: dow === 0 || dow === 6,
        shifts: dayShifts,
        totalHours: totalDayHours,
        totalSalary: totalDaySalary,
      });
    }

    // Các ngày đầu tháng sau để lấp đầy hàng cuối của lịch
    const remainder = list.length % 7;
    if (remainder > 0) {
      const trailingCount = 7 - remainder;
      const nextMonth = month === 12 ? 1 : month + 1;
      for (let i = 1; i <= trailingCount; i++) {
        list.push({
          isOtherMonth: true,
          key: `next-${i}`,
          dayDisplay: `${String(i).padStart(2, '0')}/${String(nextMonth).padStart(2, '0')}`,
        });
      }
    }

    return list;
  }, [selectedMonth, monthlyShiftDetails]);

  function handlePrevMonth() {
    const clean = (!selectedMonth || selectedMonth.includes('NaN') || !selectedMonth.includes('-'))
      ? getCurrentMonth()
      : selectedMonth;
    const parts = clean.split('-').map(Number);
    let y = parts[0] || new Date().getFullYear();
    let m = parts[1] || (new Date().getMonth() + 1);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleNextMonth() {
    const clean = (!selectedMonth || selectedMonth.includes('NaN') || !selectedMonth.includes('-'))
      ? getCurrentMonth()
      : selectedMonth;
    const parts = clean.split('-').map(Number);
    let y = parts[0] || new Date().getFullYear();
    let m = parts[1] || (new Date().getMonth() + 1);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleOpenNicknameModal() {
    const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
    if (cooldown.isLocked) {
      toast.info(
        'Giới hạn đổi biệt danh',
        `Bạn vừa đổi biệt danh gần đây. Bạn có thể đổi lại sau ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}).`
      );
      return;
    }
    setNicknameInput(employee?.nickname || '');
    setShowNicknameModal(true);
  }

  async function handleSaveNickname(e) {
    if (e) e.preventDefault();
    if (!employee) return;

    const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
    if (cooldown.isLocked) {
      toast.warning(
        'Chưa đến hạn đổi',
        `Bạn cần đợi thêm ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}) mới được đổi biệt danh tiếp!`
      );
      return;
    }

    const valRes = validateNickname(nicknameInput);
    if (!valRes.isValid) {
      toast.warning('Biệt danh không hợp lệ', valRes.error);
      return;
    }

    setSavingNickname(true);
    try {
      const clean = nicknameInput.trim();
      const updated = await updateEmployeeNickname(employee.id, clean);
      const updatedNick = updated?.nickname !== undefined ? updated.nickname : clean;
      const updatedTime = updated?.nickname_updated_at || new Date().toISOString();

      setEmployee((prev) => ({
        ...prev,
        nickname: clean,
        nickname_updated_at: updatedTime,
      }));
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employee.id
            ? { ...emp, nickname: clean, nickname_updated_at: updatedTime }
            : emp
        )
      );
      setShowNicknameModal(false);
      if (clean) {
        toast.success(
          'Đã đặt biệt danh thành công!',
          `Biệt danh: "${clean}". Bạn có thể đổi lại sau 2 tháng!`
        );
      } else {
        toast.info('Đã xóa biệt danh', 'Đã quay lại hiển thị tên thật');
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu biệt danh');
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleLogin(name, showToast = true) {
    setAuthLoading(true);
    try {
      const emp = await getEmployeeByName(name);
      if (!emp) {
        toast.error('Tài khoản đã bị xóa', 'Không tìm thấy tài khoản nhân viên này.');
        localStorage.removeItem('chemshoa_employee_name');
        setEmployee(null);
      } else if (emp.status === 'off' || emp.is_active === false) {
        toast.error('Tài khoản ngưng hoạt động', `Tài khoản của ${emp.name} đã ngưng hoạt động.`);
        localStorage.removeItem('chemshoa_employee_name');
        localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
        setEmployee(null);
      } else {
        // Kiểm tra nếu PIN đã bị Admin thay đổi trên hệ thống
        const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);

        if (savedPin) {
          const isValid = await verifyEmployeePin(emp.id, savedPin);
          if (!isValid) {
            // Mã PIN đã bị Admin đổi -> Xóa bộ nhớ cũ & yêu cầu nhập PIN mới
            localStorage.removeItem('chemshoa_employee_name');
            localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
            setEmployee(null);
            toast.warning('Mã PIN thay đổi', 'Admin đã thay đổi mã PIN của bạn. Vui lòng nhập mã PIN mới!');
            return;
          }
        }

        setEmployee(emp);
        const todayStr = getToday();
        localStorage.setItem('chemshoa_employee_name', emp.name);
        localStorage.setItem('chemshoa_login_date', todayStr);

        // Cập nhật mảng Lịch Sử Đăng Nhập lên thiết bị này (Đưa ID vừa đăng nhập lên vị trí ĐẦU TIÊN)
        try {
          let recent = JSON.parse(localStorage.getItem('chemshoa_recent_logins') || '[]');
          recent = [emp.id, ...recent.filter((id) => id !== emp.id)].slice(0, 6);
          localStorage.setItem('chemshoa_recent_logins', JSON.stringify(recent));
        } catch (e) { }

        if (showToast) toast.success('Đăng nhập', `Xin chào ${emp.name}!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể kết nối máy chủ để đăng nhập');
      localStorage.removeItem('chemshoa_employee_name');
      setEmployee(null);
    } finally {
      setAuthLoading(false);
      setInitialLoading(false);
    }
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
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden relative">
      <Navbar
        title="Chè Ms Hoa"
        icon="🍵"
        employeeName={employee.name}
        showRulesLink={true}
        onNoticeClick={() => setShowNoticeModal(true)}
        onBackClick={handleLogout}
        homeIcon="🚪"
        homeTitle="Đăng Xuất"
      />

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-3 sm:py-4 w-full">
        <div className="max-w-5xl mx-auto space-y-3 w-full">
          {/* Top Header Row: Greeting & Xem Lương Button */}
          <div className="py-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-extrabold text-purple-950 truncate flex items-center gap-1.5 flex-wrap">
                  <span>Xin chào,</span>
                  <span className="text-purple-700 font-black">
                    {employee.nickname ? `${employee.nickname} (${employee.name})` : employee.name}
                  </span>
                </h1>

                {(() => {
                  const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
                  if (cooldown.isLocked) {
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          toast.info(
                            'Giới hạn đổi biệt danh',
                            `Bạn vừa đổi biệt danh gần đây. Bạn có thể đổi lại sau ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}).`
                          )
                        }
                        className="px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black border border-slate-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                        title={`Đang khóa: Bạn được đổi lại vào ngày ${cooldown.unlockDateStr}`}
                      >
                        <span>🔒</span>
                        <span>Đổi lại sau {cooldown.daysLeft} ngày</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={handleOpenNicknameModal}
                      className="px-2.5 py-0.5 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-black border border-purple-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                      title="Bấm để đặt hoặc đổi biệt danh hiển thị trên bảng xếp ca (Giới hạn 2 tháng/lần)"
                    >
                      <span>🎭</span>
                      <span>{employee.nickname ? 'Đổi Biệt Danh' : '+ Đặt Biệt Danh'}</span>
                    </button>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
                  className="px-3 sm:px-4 py-1.5 rounded-full bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black border border-purple-800 cursor-pointer transition-all active:scale-95 flex items-center justify-center shadow-2xs whitespace-nowrap"
                  title="Bấm để xem thu nhập cá nhân"
                >
                  <span>{isIncomeExpanded ? 'Thu nhỏ' : isSalaryConfirmed ? 'Xem Lương ✍️' : 'Xem Lương'}</span>
                </button>
              </div>
            </div>

            {/* Segmented Tab Switcher (Lịch Phân Công / Đăng Ký Làm / Đổi Ca) - 3 Nút To Rõ Cực Đẹp */}
            <div className="flex bg-purple-100/90 p-1.5 rounded-2xl border border-purple-200 shadow-xs gap-1.5 sm:gap-2 mt-1 max-w-2xl mx-auto w-full">
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 ${view === 'schedule'
                  ? 'bg-purple-700 text-white shadow-md font-black scale-[1.01]'
                  : 'bg-white/80 text-purple-950 hover:bg-white font-extrabold border border-purple-200/60'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Lịch Phân Công</span>
              </button>
              <button
                type="button"
                onClick={() => setView('availability')}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 ${view === 'availability'
                  ? 'bg-orange-600 text-white shadow-md font-black scale-[1.01] border border-orange-700'
                  : 'bg-orange-500 text-white font-black hover:bg-orange-600 border border-orange-600 shadow-2xs'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Đăng Ký Làm</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('swap');
                  loadMyShiftSwaps();
                  handleMarkSwapsAsRead();
                }}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 relative ${view === 'swap'
                  ? 'bg-emerald-600 text-white shadow-md font-black scale-[1.01] border border-emerald-700'
                  : 'bg-emerald-700 text-white font-black hover:bg-emerald-800 border border-emerald-800 shadow-2xs'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Đổi Ca & Báo Giờ</span>
                {hasUnreadApprovedSwap && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
                )}
              </button>
            </div>
          </div>

          {/* THÔNG TIN THU NHẬP CÁ NHÂN (BRAND PURPLE CARD) */}
          {isIncomeExpanded && (
            <div className="bg-white rounded-2xl p-4 border border-purple-200/90 shadow-2xs animate-fade-in space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5">
                <h3 className="font-black text-base md:text-lg text-purple-950">Thu Nhập Cá Nhân</h3>
                {/* Bộ chọn tháng */}
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200/80">
                  <button onClick={handlePrevMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">◀</button>
                  <span className="text-xs sm:text-sm font-black text-purple-900">
                    Tháng {displayMonthStr}
                  </span>
                  <button onClick={handleNextMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">▶</button>
                </div>
              </div>

              {/* 2 Ô Khoanh Nhỏ Phía Trên (Đã làm & Lương thỏa thuận) */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="p-2 sm:p-2.5 bg-purple-50/70 rounded-xl border border-purple-200/80 text-center">
                  <div className="text-[10px] sm:text-xs text-purple-700 font-bold mb-0.5">
                    Đã làm (tính đến hôm nay)
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-purple-900">
                    {monthlyHours} tiếng <span className="font-bold text-purple-700">({monthlyShiftsCount} ca)</span>
                  </div>
                </div>

                <div className="p-2 sm:p-2.5 bg-purple-50/70 rounded-xl border border-purple-200/80 text-center">
                  <div className="text-[10px] sm:text-xs text-purple-700 font-bold mb-0.5">
                    Lương thỏa thuận
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-purple-900">
                    {formatCurrency(currentRate)}<span className="text-[10px] font-bold text-purple-600">/giờ</span>
                  </div>
                </div>
              </div>

              {/* Ô Khoanh Giữa (THỰC NHẬN TÍCH LŨY HÔM NAY) — TO NỔI BẬT RỰC RỠ ⚡ */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-100/90 to-teal-50 border-2 border-emerald-400 shadow-md text-center space-y-1">
                <div className="text-xs sm:text-sm text-emerald-900 font-black uppercase tracking-wider">
                  THỰC NHẬN TÍCH LŨY HÔM NAY
                </div>
                <div className="text-2xl sm:text-4xl font-black text-emerald-700 tracking-tight drop-shadow-xs">
                  {formatCurrency(netSalary)}
                </div>
                {(totalBonusAmount > 0 || totalPenaltyAmount > 0) && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] font-bold text-slate-600">
                    <span className="text-purple-900 bg-purple-100/80 px-2 py-0.5 rounded-full">
                      Lương ca: {formatCurrency(monthlySalary)}
                    </span>
                    {totalBonusAmount > 0 && (
                      <span className="text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        +Thưởng: {formatCurrency(totalBonusAmount)}
                      </span>
                    )}
                    {totalPenaltyAmount > 0 && (
                      <span className="text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-full">
                        -Phạt: {formatCurrency(totalPenaltyAmount)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Ô Khoanh Dưới Cùng (THƯỞNG & PHẠT LỖI DỰ KIẾN) */}
              <div className={`grid gap-2 ${totalBonusAmount > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {totalBonusAmount > 0 && (
                  <div
                    onClick={() => setShowBonusDetailModal(true)}
                    className="p-2.5 sm:p-3 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/90 text-center space-y-0.5 cursor-pointer transition-all active:scale-95 hover:scale-[1.01] hover:shadow-xs group"
                    title="Bấm để xem danh sách chi tiết các khoản thưởng"
                  >
                    <div className="text-[10px] sm:text-xs text-emerald-800 font-black uppercase tracking-wider">
                      Tiền thưởng / Phụ cấp:
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold text-emerald-600">
                      +{formatCurrency(totalBonusAmount)}
                    </div>
                  </div>
                )}

                <div
                  onClick={() => setShowPenaltyDetailModal(true)}
                  className="p-2.5 sm:p-3 bg-rose-50/80 hover:bg-rose-100/90 rounded-xl border border-rose-200/90 text-center space-y-0.5 cursor-pointer transition-all active:scale-95 hover:scale-[1.01] hover:shadow-xs group"
                  title="Bấm để xem danh sách chi tiết các lỗi phạt"
                >
                  <div className="text-[10px] sm:text-xs text-rose-800 font-black uppercase tracking-wider">
                    Tiền phạt lỗi dự kiến:
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-rose-600">
                    {totalPenaltyAmount > 0 ? `-${formatCurrency(totalPenaltyAmount)}` : formatCurrency(0)}
                  </div>
                </div>
              </div>

              {/* KHUNG BẢNG TOÀN BỘ CÁC CA LÀM THÁNG & CHẾ ĐỘ XEM */}
              <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-purple-200 shadow-2xs space-y-2">
                {/* Header: Tiêu đề + Nút chuyển chế độ xem (Thẻ Gọn vs Lịch Tháng 7 cột) */}
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base">📅</span>
                    <h4 className="font-black text-xs sm:text-sm text-purple-950">
                      Các Ca Làm Tháng {displayMonthStr}
                    </h4>
                    <span className="px-2 py-0.2 rounded-full bg-purple-100 text-purple-950 text-[10.5px] sm:text-xs font-black">
                      {monthlyShiftDetails.length} ca làm
                    </span>
                  </div>

                  {/* Nút Toggle 2 Chế Độ Xem */}
                  <div className="flex items-center gap-1 bg-purple-50 p-0.5 rounded-xl border border-purple-200 text-xs">
                    <button
                      type="button"
                      onClick={() => setSalaryViewMode('grid')}
                      className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer border-0 ${
                        salaryViewMode === 'grid'
                          ? 'bg-purple-900 text-white shadow-xs'
                          : 'text-purple-700 hover:text-purple-950 bg-transparent'
                      }`}
                      title="Hiển thị dạng thẻ rút gọn, nhìn rõ toàn bộ ca làm trong tháng"
                    >
                      🗂️ Thẻ Gọn ({monthlyShiftDetails.length} ca)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalaryViewMode('calendar')}
                      className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer border-0 ${
                        salaryViewMode === 'calendar'
                          ? 'bg-purple-900 text-white shadow-xs'
                          : 'text-purple-700 hover:text-purple-950 bg-transparent'
                      }`}
                      title="Hiển thị theo dạng bảng lịch tháng 7 cột (T2 -> CN)"
                    >
                      📅 Lịch Tháng (7 cột)
                    </button>
                  </div>
                </div>

                {/* CHẾ ĐỘ 1: THẺ GỌN (TẤT CẢ CA LÀM ĐƯỢC BÀY TRÍ TRỰC QUAN NHƯ MẪU) */}
                {salaryViewMode === 'grid' && (
                  monthlyShiftDetails.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                      {monthlyShiftDetails.map((s) => {
                        const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                        const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                        const sTime = s.start_time ? s.start_time.slice(0, 5) : '08:30';
                        const eTime = s.end_time ? s.end_time.slice(0, 5) : '22:00';
                        const splitMatch = s.note ? s.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})[^\]]*\].*?\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i) : null;
                        const isSplit = splitMatch && (splitMatch[2] < splitMatch[3] || splitMatch[4] < splitMatch[1]);
                        const timeRangeDisplay = isSplit ? `${splitMatch[1]}-${splitMatch[2]} & ${splitMatch[3]}-${splitMatch[4]}` : `${sTime}-${eTime}`;
                        const dow = getDayOfWeekLabel(s.date);

                        return (
                          <div
                            key={s.id || `${s.date}_${s.start_time}`}
                            className={`px-2 py-1.5 rounded-xl border text-xs transition-all shadow-2xs space-y-0.5 ${
                              s.multiplier > 1
                                ? 'bg-gradient-to-br from-amber-50 to-amber-100/90 border-amber-300 ring-1 ring-amber-300/60'
                                : 'bg-purple-50/40 hover:bg-purple-100/70 border-purple-200/80'
                            }`}
                          >
                            {/* Hàng 1: Ngày + Thứ (bên trái) và Thành Tiền (bên phải) - Thoáng đãng không bị đè */}
                            <div className="flex items-center justify-between gap-1 leading-tight">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100/90 text-purple-950 border border-purple-300 shadow-2xs shrink-0">
                                <span className="font-black text-[11px] font-mono tracking-tight">
                                  {s.date.split('-').reverse().slice(0, 2).join('/')}
                                </span>
                                <span className={`text-[9.5px] font-black ${dow === 'CN' ? 'text-rose-600' : 'text-purple-700'}`}>
                                  {dow}
                                </span>
                              </span>
                              <span className="font-black text-emerald-700 text-xs font-mono shrink-0">
                                {formatCurrency(s.shiftSalary)}
                              </span>
                            </div>

                            {/* Hàng 2: Chi Nhánh + Giờ Làm & Tổng Tiếng */}
                            <div className="flex items-center justify-between gap-1 text-[10.5px] font-bold text-slate-700 leading-tight pt-0.5">
                              <div className="flex items-center gap-1 min-w-0 truncate">
                                {(branchStyle?.badgeText || branchObj?.name) && (
                                  <span
                                    className="px-1 py-0.5 rounded text-[8.5px] font-black text-white shrink-0 shadow-2xs leading-none"
                                    style={{ backgroundColor: branchStyle.hex }}
                                  >
                                    {branchStyle.badgeText || branchObj?.name}
                                  </span>
                                )}
                                <span className="truncate text-slate-600" title={timeRangeDisplay}>
                                  🕒 {timeRangeDisplay}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {s.multiplier > 1 && (
                                  <span className="text-[9px] font-black text-amber-900 bg-amber-200 px-1 rounded shadow-2xs" title={s.holidayName}>
                                    x{s.multiplier}
                                  </span>
                                )}
                                <span className="font-black text-purple-950 text-[11px] font-mono">
                                  ⏳ {s.hours}h
                                </span>
                              </div>
                            </div>

                            {/* Ghi chú ca nếu có */}
                            {s.note && (
                              <div
                                className="text-[9px] font-bold truncate text-purple-700 leading-none pt-0.5 border-t border-purple-200/50"
                                title={s.note}
                              >
                                {s.note.includes('[Gốc:') || s.note.includes('[Ca gốc:') ? `⚡ ${s.note}` : `📝 ${s.note}`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-purple-600 font-bold italic bg-purple-50/60 rounded-xl border border-purple-200">
                      Chưa có ca làm nào trong tháng {displayMonthStr}.
                    </div>
                  )
                )}

                {/* CHẾ ĐỘ 2: LỊCH THÁNG 7 CỘT (T2 -> CN) */}
                {salaryViewMode === 'calendar' && (
                  <div className="border border-purple-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                    <div className="grid grid-cols-7 bg-purple-950 text-white text-center font-black text-xs py-2 border-b border-purple-800">
                      {[
                        { label: 'THỨ 2', short: 'T2' },
                        { label: 'THỨ 3', short: 'T3' },
                        { label: 'THỨ 4', short: 'T4' },
                        { label: 'THỨ 5', short: 'T5' },
                        { label: 'THỨ 6', short: 'T6' },
                        { label: 'THỨ 7', short: 'T7' },
                        { label: 'CHỦ NHẬT', short: 'CN', isSun: true },
                      ].map((d) => (
                        <div key={d.short} className={d.isSun ? 'text-amber-300' : ''}>
                          <span className="hidden sm:inline">{d.label}</span>
                          <span className="sm:hidden">{d.short}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-px bg-purple-200">
                      {calendarMonthDays.map((item) => {
                        if (item.isOtherMonth) {
                          return (
                            <div key={item.key} className="bg-slate-50/60 p-1.5 min-h-[54px] flex flex-col justify-start">
                              <span className="text-[10px] font-bold text-slate-300 font-mono">
                                {item.dayDisplay}
                              </span>
                            </div>
                          );
                        }

                        const hasShifts = item.shifts && item.shifts.length > 0;
                        return (
                          <div
                            key={item.key}
                            className={`p-1 sm:p-1.5 min-h-[62px] sm:min-h-[72px] flex flex-col justify-between transition-colors ${
                              hasShifts
                                ? 'bg-purple-50/30 hover:bg-purple-50/80'
                                : item.isWeekend
                                ? 'bg-amber-50/20'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[11px] font-mono font-black ${
                                item.isWeekend ? 'text-rose-600' : 'text-purple-950'
                              }`}>
                                {item.dayNum}
                              </span>
                              {hasShifts && (
                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1 rounded">
                                  {item.totalHours}h
                                </span>
                              )}
                            </div>

                            {hasShifts ? (
                              <div className="space-y-0.5 mt-1">
                                {item.shifts.map((s, idx) => {
                                  const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                                  const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                                  const sTime = s.start_time ? s.start_time.slice(0, 5) : '';
                                  const eTime = s.end_time ? s.end_time.slice(0, 5) : '';
                                  return (
                                    <div
                                      key={idx}
                                      className="px-1 py-0.5 rounded text-[9px] font-bold border flex items-center justify-between"
                                      style={{
                                        backgroundColor: `${branchStyle.hex}15`,
                                        borderColor: `${branchStyle.hex}40`,
                                      }}
                                    >
                                      <span className="truncate">{sTime}-{eTime}</span>
                                      <span className="font-mono font-black text-emerald-800">
                                        {formatCurrency(s.shiftSalary)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-[9px] text-slate-300 font-bold italic text-center py-1">
                                -
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* KHỐI KÝ XÁC NHẬN BẢNG LƯƠNG ĐIỆN TỬ */}
              <SalaryConfirmationBox
                employee={employee}
                month={selectedMonth}
                displayMonthStr={displayMonthStr}
                netSalary={netSalary}
                monthlyHours={monthlyHours}
                monthlyShiftsCount={monthlyShiftsCount}
                onConfirmedChange={(isConf) => setIsSalaryConfirmed(isConf)}
              />
            </div>
          )}

          {/* SCHEDULE VIEW */}
          {view === 'schedule' && (
            <div className="animate-fade-in space-y-3">
              <WeeklyMatrixBoard employees={employees} highlightEmployeeId={employee.id} readOnly={true} />
            </div>
          )}

          {/* AVAILABILITY VIEW */}
          {view === 'availability' && (
            <div className="animate-fade-in">
              <WeeklyAvailability employee={employee} />
            </div>
          )}

          {/* SHIFT SWAP & TIME CHANGE VIEW (YÊU CẦU CA LÀM & BÁO ĐỔI GIỜ) */}
          {view === 'swap' && (
            <div className="animate-fade-in space-y-4">
              {/* Header Box & Add Button */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-purple-950">
                      Yêu Cầu Ca Làm
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSwapModal(true)}
                    className="px-4 py-2 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md active:scale-95 border-0 shrink-0"
                  >
                    + Tạo Yêu Cầu
                  </button>
                </div>

                {/* BỘ LỌC THEO THÁNG */}
                <div className="flex items-center justify-between gap-2 bg-purple-50 px-3 py-2 rounded-2xl border border-purple-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = swapFilterMonth.split('-').map(Number);
                      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
                      setSwapFilterMonth(prev);
                    }}
                    className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
                  >
                    ◀
                  </button>
                  <span className="text-xs sm:text-sm font-black text-purple-900">
                    Tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = swapFilterMonth.split('-').map(Number);
                      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
                      setSwapFilterMonth(next);
                    }}
                    className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* THẺ HIỂN THỊ DANH SÁCH YÊU CẦU */}
              <div className="space-y-3">
                {(() => {
                  const filteredSwaps = shiftSwaps.filter((s) => {
                    if (!s.shift_date) return false;
                    return s.shift_date.startsWith(swapFilterMonth);
                  });

                  if (filteredSwaps.length === 0) {
                    return (
                      <div className="p-8 bg-white rounded-3xl border border-purple-200 text-center text-purple-600 text-xs font-bold space-y-2.5">
                        <p className="font-extrabold text-purple-900 text-sm">
                          Chưa có yêu cầu nào trong tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowSwapModal(true)}
                          className="px-5 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black cursor-pointer border-0 shadow-sm transition-all"
                        >
                          + Tạo Yêu Cầu
                        </button>
                      </div>
                    );
                  }

                  const sortByNewest = (a, b) => {
                    const dateA = new Date(a.shift_date || a.created_at).getTime();
                    const dateB = new Date(b.shift_date || b.created_at).getTime();
                    return dateB - dateA;
                  };

                  const pendingList = filteredSwaps.filter((s) => s.status === 'pending').sort(sortByNewest);
                  const approvedList = filteredSwaps.filter((s) => s.status === 'approved').sort(sortByNewest);
                  const rejectedList = filteredSwaps.filter((s) => s.status === 'rejected').sort(sortByNewest);

                  // Helper function render thẻ Yêu Cầu
                  function renderTicketCard(swap, statusType) {
                    const isTimeChange = swap.request_type === 'time_change';
                    let typeBadgeText = 'ĐỔI CA';
                    let typeBadgeClass = 'bg-purple-700 text-white';

                    if (isTimeChange) {
                      if (swap.time_change_type === 'overtime') {
                        typeBadgeText = `TĂNG CA ${swap.extra_hours ? `(+${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-emerald-700 text-white';
                      } else if (swap.time_change_type === 'early_leave') {
                        typeBadgeText = `VỀ SỚM ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-amber-600 text-white';
                      } else if (swap.time_change_type === 'late_arrival') {
                        typeBadgeText = `ĐI TRỄ ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-sky-600 text-white';
                      } else {
                        typeBadgeText = `ĐỔI GIỜ ${swap.extra_hours ? `(${swap.extra_hours > 0 ? `+${swap.extra_hours}` : swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-purple-800 text-white';
                      }
                    }

                    const cardBg =
                      statusType === 'pending'
                        ? 'bg-amber-50/90 border-2 border-amber-300'
                        : statusType === 'approved'
                        ? 'bg-emerald-50/90 border-2 border-emerald-400'
                        : 'bg-rose-50/90 border-2 border-rose-400';

                    return (
                      <div key={swap.id} className={`p-4 rounded-3xl shadow-2xs space-y-2.5 transition-all ${cardBg}`}>
                        {/* Header của Thẻ */}
                        <div className="flex items-center justify-between gap-2 border-b pb-2 border-black/10 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow-2xs ${typeBadgeClass}`}>
                              {typeBadgeText}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                statusType === 'pending'
                                  ? 'bg-amber-200 text-amber-900'
                                  : statusType === 'approved'
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : 'bg-rose-200 text-rose-900'
                              }`}
                            >
                              {statusType === 'pending' ? 'Chờ Duyệt' : statusType === 'approved' ? 'Đã Duyệt' : 'Từ Chối'}
                            </span>
                          </div>
                          <span className="text-xs text-purple-950 font-black bg-white px-2.5 py-0.5 rounded-xl border border-purple-200 shadow-2xs">
                            {formatDateWithDayVN(swap.shift_date)}
                          </span>
                        </div>

                        {/* Nội dung chi tiết */}
                        <div className="space-y-1 text-xs text-purple-950 font-bold">
                          {isTimeChange ? (
                            <>
                              <p><strong>Nhân viên:</strong> <span className="font-black text-purple-950">{swap.requester_name}</span></p>
                              <p><strong>Ca gốc:</strong> <span className="text-purple-700 font-extrabold">{swap.original_time || swap.my_shift_info || 'Không rõ'}</span></p>
                              <p><strong>Thực tế:</strong> <span className="text-emerald-800 font-black">{swap.adjusted_time || swap.target_shift_info || 'Chưa nhập'}</span></p>
                            </>
                          ) : (
                            <>
                              <p><strong>Nhờ đổi:</strong> <span className="font-black text-purple-950">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
                              <p><strong>Đổi với:</strong> <span className="font-black text-orange-700">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
                            </>
                          )}
                          <p className="text-purple-900 italic pt-1 border-t border-black/5">
                            <strong>Lý do:</strong> &quot;{swap.reason}&quot;
                          </p>

                          {statusType === 'rejected' && swap.rejection_reason && (
                            <div className="p-2.5 bg-rose-100 rounded-2xl border border-rose-300 text-rose-950 text-xs font-black mt-2 space-y-0.5">
                              <p className="text-rose-900 font-black">
                                Lý do từ chối:
                              </p>
                              <p className="text-rose-800 italic">&quot;{swap.rejection_reason}&quot;</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      {/* NHÓM 1: ĐANG CHỜ DUYỆT */}
                      {pendingList.length > 0 && (
                        <div className="space-y-2.5">
                          <h3 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wider bg-amber-100/90 px-3.5 py-1.5 rounded-2xl border border-amber-300 w-fit">
                            Chờ Duyệt ({pendingList.length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pendingList.map((swap) => renderTicketCard(swap, 'pending'))}
                          </div>
                        </div>
                      )}

                      {/* NHÓM 2: ĐÃ ĐƯỢC PHÊ DUYỆT */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider bg-emerald-100/90 px-3.5 py-1.5 rounded-2xl border border-emerald-300 w-fit">
                          Đã Duyệt ({approvedList.length})
                        </h3>
                        {approvedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Chưa có yêu cầu nào được duyệt trong tháng.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {approvedList.map((swap) => renderTicketCard(swap, 'approved'))}
                          </div>
                        )}
                      </div>

                      {/* NHÓM 3: ĐÃ BỊ TỪ CHỐI */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-rose-950 uppercase tracking-wider bg-rose-100/90 px-3.5 py-1.5 rounded-2xl border border-rose-300 w-fit">
                          Bị Từ Chối ({rejectedList.length})
                        </h3>
                        {rejectedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Không có yêu cầu nào bị từ chối.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {rejectedList.map((swap) => renderTicketCard(swap, 'rejected'))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Đổi Ca 3 Bước */}
              {showSwapModal && (
                <ModalShiftSwap
                  employee={employee}
                  onClose={() => setShowSwapModal(false)}
                  onRefresh={loadMyShiftSwaps}
                />
              )}
            </div>
          )}

          {/* =========================================================================
             POPUP THÔNG BÁO QUAN TRỌNG DÀNH CHO NHÂN VIÊN (TỪ CHỦ QUÁN / ADMIN)
             ========================================================================= */}
          {showNoticeModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in">
                {/* Header Popup */}
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-2xs">
                      🔔
                    </div>
                    <div>
                      <h3 className="font-black text-base sm:text-lg text-purple-950">
                        ALO ALO ALO!!!!!
                      </h3>
                      <p className="text-[11px] text-purple-700 font-extrabold">
                        Chè Ms Hoa Thông Báo!!!!
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
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300/90 text-purple-950 text-xs sm:text-sm font-extrabold whitespace-pre-wrap leading-relaxed shadow-2xs">
                    {noticeText}
                  </div>

                  {/* Nút bấm tác vụ */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSnoozeEmployeeNotice4Hours}
                      className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm bg-purple-100 hover:bg-purple-200 text-purple-950 border border-purple-300 cursor-pointer transition-all shadow-2xs flex items-center justify-center gap-2 active:scale-95"
                    >
                      <span>⏱</span> Ẩn thông báo này trong 4 giờ
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowNoticeModal(false)}
                      className="w-full py-2.5 rounded-xl text-xs sm:text-sm font-black bg-purple-700 hover:bg-purple-800 text-white border-0 cursor-pointer shadow-2xs"
                    >
                      Đã Hiểu / Đóng
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ================= MODAL XEM CHI TIẾT NỘI DUNG LỖI PHẠT ================= */}
          {showPenaltyDetailModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-rose-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-black text-lg">
                      ⚠️
                    </div>
                    <div>
                      <h3 className="font-black text-base text-rose-950">Chi Tiết Tiền Phạt Lỗi Dự Kiến</h3>
                      <p className="text-xs text-purple-700 font-bold">
                        Tháng {displayMonthStr} • {employee.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPenaltyDetailModal(false)}
                    className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung danh sách các khoản phạt */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {penaltyList.length === 0 ? (
                    <div className="py-8 text-center space-y-2 bg-emerald-50/60 rounded-2xl border border-emerald-200 p-4">
                      <div className="text-3xl">🎉</div>
                      <p className="text-xs sm:text-sm font-black text-emerald-900">
                        Tuyệt vời! Bạn không có tiền phạt hay lỗi vi phạm nào trong Tháng {displayMonthStr}.
                      </p>
                    </div>
                  ) : (
                    penaltyList.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-rose-50/60 rounded-2xl border border-rose-200/80 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-black text-rose-950 flex items-center gap-1">
                            <span>📅</span> {item.date ? item.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                          <div className="text-xs font-extrabold text-purple-950 leading-snug">
                            {item.reason || 'Vi phạm quy định / Trừ phạt'}
                          </div>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-rose-600 shrink-0 bg-white px-2.5 py-1 rounded-xl border border-rose-200 shadow-2xs">
                          -{formatCurrency(Math.abs(item.amount || 0))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Tổng Tiền & Nút Đóng */}
                <div className="pt-2 border-t border-purple-100 flex items-center justify-between gap-2">
                  <div className="text-xs font-black text-purple-950">
                    Tổng tiền phạt: <span className="text-rose-600 font-black text-sm">-{formatCurrency(totalPenaltyAmount)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPenaltyDetailModal(false)}
                    className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs active:scale-95 transition-all"
                  >
                    ✕ Đóng Màn Hình
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ================= MODAL XEM CHI TIẾT NỘI DUNG THƯỞNG / PHỤ CẤP ================= */}
          {showBonusDetailModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-emerald-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-lg">
                      🎁
                    </div>
                    <div>
                      <h3 className="font-black text-base text-emerald-950">Chi Tiết Tiền Thưởng & Phụ Cấp</h3>
                      <p className="text-xs text-purple-700 font-bold">
                        Tháng {displayMonthStr} • {employee.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusDetailModal(false)}
                    className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung danh sách các khoản thưởng */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {bonusList.length === 0 ? (
                    <div className="py-8 text-center space-y-2 bg-purple-50/60 rounded-2xl border border-purple-200 p-4">
                      <div className="text-3xl">✨</div>
                      <p className="text-xs sm:text-sm font-black text-purple-900">
                        Chưa có khoản thưởng hay phụ cấp nào trong Tháng {displayMonthStr}.
                      </p>
                    </div>
                  ) : (
                    bonusList.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-black text-emerald-950 flex items-center gap-1">
                            <span>📅</span> {item.date ? item.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                          <div className="text-xs font-extrabold text-purple-950 leading-snug">
                            {item.reason || 'Khen thưởng / Phụ cấp'}
                          </div>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-emerald-600 shrink-0 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                          +{formatCurrency(Math.abs(item.amount || 0))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Tổng Tiền & Nút Đóng */}
                <div className="pt-2 border-t border-purple-100 flex items-center justify-between gap-2">
                  <div className="text-xs font-black text-purple-950">
                    Tổng tiền thưởng: <span className="text-emerald-600 font-black text-sm">+{formatCurrency(totalBonusAmount)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusDetailModal(false)}
                    className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs active:scale-95 transition-all"
                  >
                    ✕ Đóng Màn Hình
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {/* MODAL ĐẶT BIỆT DANH CHO NHÂN VIÊN */}
          {showNicknameModal && typeof document !== 'undefined' && createPortal(
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowNicknameModal(false);
              }}
              className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            >
              <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-purple-200/90 space-y-4 animate-scale-in">
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎭</span>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-purple-950 tracking-tight">
                        Đặt Biệt Danh
                      </h3>
                      <p className="text-[11px] text-purple-700 font-bold">
                        Hiển thị trên Bảng Xếp Lịch Làm Việc
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNicknameModal(false)}
                    className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-xs font-black transition-all"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveNickname} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                      Tên Thật Của Bạn
                    </label>
                    <div className="px-3 py-2 bg-slate-100 rounded-xl text-xs sm:text-sm font-black text-slate-700 border border-slate-200">
                      {employee.name} <span className="text-[10px] text-slate-500 font-bold block mt-0.5">(Tên gốc dùng để tính lương & quản lý)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-black text-purple-950 uppercase">
                        Biệt Danh Muốn Gọi (2 - 12 ký tự)
                      </label>
                      <span className={`text-[10px] font-black ${nicknameInput.trim().length > 12 ? 'text-rose-600' : 'text-purple-600'}`}>
                        {nicknameInput.trim().length}/12
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={12}
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      placeholder="VD: Bé Heo, Cún, Mèo, Sam, Bin..."
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400 shadow-2xs"
                      autoFocus
                    />
                    <span className="text-[10px] text-purple-600 font-bold block mt-1">
                      ✨ Yêu cầu: Tên lịch sự, không tục tĩu, tối đa 12 ký tự để vừa đẹp ô bảng lịch.
                    </span>
                  </div>

                  {/* Thông báo quy định thời gian khóa 2 tháng */}
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] font-bold space-y-1">
                    <div className="font-black text-amber-900 flex items-center gap-1">
                      <span>⏳</span>
                      <span>Quy định thời gian đổi biệt danh:</span>
                    </div>
                    <p className="text-amber-800 leading-snug">
                      Sau khi bấm <strong>&quot;Lưu Biệt Danh&quot;</strong>, bạn sẽ <strong>không thể đổi lại trong vòng 2 tháng (60 ngày)</strong> tiếp theo. Hãy chọn biệt danh thật ưng ý nhé!
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {employee.nickname && (
                      <button
                        type="button"
                        onClick={() => {
                          setNicknameInput('');
                          updateEmployeeNickname(employee.id, '').then(() => {
                            setEmployee((prev) => ({ ...prev, nickname: '' }));
                            setEmployees((prev) =>
                              prev.map((emp) => (emp.id === employee.id ? { ...emp, nickname: '' } : emp))
                            );
                            setShowNicknameModal(false);
                            toast.success('Đã bỏ biệt danh', 'Đã quay lại hiển thị tên thật');
                          });
                        }}
                        className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-black text-xs border border-slate-200 cursor-pointer transition-all active:scale-95"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingNickname}
                      className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm border-0 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <span>{savingNickname ? '⏳ Đang lưu...' : '✓ Lưu Biệt Danh'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
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

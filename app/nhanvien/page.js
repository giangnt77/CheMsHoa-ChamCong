'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import EmployeeSelector from '@/components/EmployeeSelector';
import WeeklyAvailability from '@/components/WeeklyAvailability';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import ModalShiftSwap from '@/components/ModalShiftSwap';
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
} from '@/lib/supabase';
import { getCurrentMonth, formatCurrency, getToday, formatDateFull, formatDateWithDayVN } from '@/lib/utils';

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
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false);

  // State Thông Báo Quan Trọng Dành Cho Nhân Viên
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeText, setNoticeText] = useState(
    '📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!'
  );

  // State Quản Lý Đổi Ca & Chi Tiết Lỗi Phạt
  const [shiftSwaps, setShiftSwaps] = useState([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showPenaltyDetailModal, setShowPenaltyDetailModal] = useState(false);
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
      const [year, month] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

      const [schedData, rates, penaltiesData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(employee.id),
        getPenaltiesByEmployee(employee.id, selectedMonth),
      ]);

      setEmpRates(rates);
      setEmpPenalties(penaltiesData || []);

      // Quy tắc tính lương chuẩn: Chỉ cộng dồn ca làm ĐÃ DIỄN RA (s.date <= getToday())
      // Các ca tương lai được xếp sẵn chưa đến ngày sẽ KHÔNG bị dồn cộng trước!
      const todayStr = getToday();
      const myShifts = schedData.filter(
        (s) => s.employee_id === employee.id && s.date <= todayStr
      );

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

  // Lọc danh sách khoản phạt vi phạm (không tính thưởng)
  const penaltyList = useMemo(() => {
    if (!empPenalties) return [];
    return empPenalties.filter((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
      return !isBonus;
    });
  }, [empPenalties]);

  const totalPenaltyAmount = useMemo(() => {
    return penaltyList.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
  }, [penaltyList]);

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
        toast.error('Tài khoản đã bị xóa', 'Không tìm thấy tài khoản! Bộ nhớ đệm thiết bị đã được dọn sạch.');
        localStorage.clear();
        setEmployee(null);
      } else if (emp.status === 'off' || emp.is_active === false) {
        toast.error('Tài khoản ngưng hoạt động', `Tài khoản của ${emp.name} đã ngưng hoạt động.`);
        localStorage.clear();
        setEmployee(null);
      } else {
        // Kiểm tra nếu PIN đã bị Admin thay đổi trên hệ thống
        const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);
        const actualPin = emp.pin || '123456';

        if (savedPin && savedPin !== actualPin) {
          // Mã PIN đã bị Admin đổi -> Xóa bộ nhớ cũ & yêu cầu nhập PIN mới
          localStorage.removeItem('chemshoa_employee_name');
          localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
          setEmployee(null);
          toast.warning('Mã PIN thay đổi', 'Admin đã thay đổi mã PIN của bạn. Vui lòng nhập mã PIN mới!');
        } else {
          setEmployee(emp);
          const todayStr = new Date().toISOString().slice(0, 10);
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
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tự động đăng nhập');
      localStorage.clear();
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

      <main className="flex-1 relative z-10 px-3 sm:px-4 md:px-6 py-3 sm:py-4 w-full">
        <div className="max-w-5xl mx-auto space-y-3 w-full">
          {/* Top Header Row: Greeting & Xem Lương Button */}
          <div className="py-1">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-base sm:text-2xl font-black text-purple-950 tracking-tight shrink">
                Xin chào, <span className="text-purple-700 font-black">{employee.name}</span>!
              </h1>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
                  className="px-3 sm:px-4 py-1.5 rounded-full bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black border border-purple-800 cursor-pointer transition-all active:scale-95 flex items-center justify-center shadow-2xs whitespace-nowrap"
                  title="Bấm để xem thu nhập cá nhân"
                >
                  <span>{isIncomeExpanded ? 'Thu nhỏ' : 'Xem Lương'}</span>
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
                <span className="tracking-tight whitespace-nowrap">Đổi Ca</span>
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
                    Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
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

              {/* Ô Khoanh Giữa (LƯƠNG TÍCH LŨY HÔM NAY) — TO NỔI BẬT RỰC RỠ ⚡ */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-100/90 to-teal-50 border-2 border-emerald-400 shadow-md text-center space-y-1">
                <div className="text-xs sm:text-sm text-emerald-900 font-black uppercase tracking-wider">
                  LƯƠNG TÍCH LŨY HÔM NAY
                </div>
                <div className="text-2xl sm:text-4xl font-black text-emerald-700 tracking-tight drop-shadow-xs">
                  {formatCurrency(monthlySalary)}
                </div>
              </div>

              {/* Ô Khoanh Dưới Cùng (TIỀN PHẠT LỖI DỰ KIẾN) — BẤM VÀO ĐỂ XEM CHI TIẾT DANH SÁCH LỖI ⚡ */}
              <div
                onClick={() => setShowPenaltyDetailModal(true)}
                className="p-2.5 sm:p-3 bg-rose-50/80 hover:bg-rose-100/90 rounded-xl border border-rose-200/90 text-center space-y-0.5 cursor-pointer transition-all active:scale-95 hover:scale-[1.01] hover:shadow-xs border-rose-200 group"
                title="Bấm để xem danh sách chi tiết các lỗi phạt"
              >
                <div className="text-[10px] sm:text-xs text-rose-800 font-black uppercase tracking-wider">
                  Tiền phạt lỗi dự kiến:
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-rose-600">
                  {formatCurrency(totalPenaltyAmount)}
                </div>
              </div>
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

          {/* SHIFT SWAP VIEW (QUẢN LÝ ĐỔI CA FOR EMPLOYEES) */}
          {view === 'swap' && (
            <div className="animate-fade-in space-y-4">
              {/* Header Box & Add Button */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base sm:text-xl font-black text-purple-950 flex items-center gap-2">
                      <span>🔄</span>
                      <span>Lịch Sử Yêu Cầu Đổi Ca</span>
                    </h2>
                    <p className="text-xs text-purple-700 font-bold mt-0.5">
                      Gửi yêu cầu đổi ca cho Quản Lý phê duyệt sau khi đã chốt thống nhất với nhau ngoài đời.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSwapModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-2 border-0 shrink-0"
                  >
                    <span>➕</span>
                    <span>Đăng Ký Đổi Ca</span>
                  </button>
                </div>

                {/* BỘ LỌC THEO THÁNG */}
                <div className="flex items-center justify-between gap-2 bg-purple-50 px-3 py-2 rounded-xl border border-purple-200/80">
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
                    📅 Tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}
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

              {/* THẺ HIỂN THỊ DANH SÁCH YÊU CẦU (XANH LÁ / ĐỎ / VÀNG) */}
              <div className="space-y-3">
                {(() => {
                  const filteredSwaps = shiftSwaps.filter((s) => {
                    if (!s.shift_date) return false;
                    return s.shift_date.startsWith(swapFilterMonth);
                  });

                  if (filteredSwaps.length === 0) {
                    return (
                      <div className="p-8 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold space-y-2">
                        <div className="text-3xl">🔄</div>
                        <p>Không có yêu cầu đổi ca nào trong tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}.</p>
                        <button
                          type="button"
                          onClick={() => setShowSwapModal(true)}
                          className="px-4 py-2 rounded-xl bg-purple-700 text-white text-xs font-black cursor-pointer border-0"
                        >
                          Tạo yêu cầu đổi ca mới
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

                  return (
                    <div className="space-y-6">
                      {/* NHÓM 1: ĐANG CHỜ XEM XÉT */}
                      {pendingList.length > 0 && (
                        <div className="space-y-2.5">
                          <h3 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5 bg-amber-100/90 px-3 py-1.5 rounded-xl border border-amber-300 w-fit">
                            <span>⏳</span>
                            <span>Đang Chờ Quản Lý Xem Xét ({pendingList.length})</span>
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pendingList.map((swap) => (
                              <div key={swap.id} className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between gap-2 border-b pb-2 border-amber-200">
                                  <span className="px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase text-white bg-amber-500 shadow-2xs">
                                    ⏳ CHỜ DUYỆT
                                  </span>
                                  <span className="text-xs text-purple-950 font-black bg-white px-2 py-0.5 rounded-lg border border-amber-300">
                                    📅 {formatDateWithDayVN(swap.shift_date)}
                                  </span>
                                </div>
                                <div className="space-y-1 text-xs text-purple-950 font-bold">
                                  <p>👤 <strong>Nhân viên nhờ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
                                  <p>🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
                                  <p className="text-purple-800 italic pt-0.5">💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* NHÓM 2: ĐÃ ĐƯỢC ĐỒNG Ý (MỚI NHẤT TRÊN CÙNG) */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5 bg-emerald-100/90 px-3 py-1.5 rounded-xl border border-emerald-300 w-fit">
                          <span>✅</span>
                          <span>Đã Được Đồng Ý ({approvedList.length})</span>
                        </h3>
                        {approvedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Chưa có yêu cầu nào được đồng ý trong tháng này.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {approvedList.map((swap) => (
                              <div key={swap.id} className="p-4 rounded-2xl bg-emerald-50/90 border-2 border-emerald-400 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between gap-2 border-b pb-2 border-emerald-200">
                                  <span className="px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase text-white bg-emerald-600 shadow-2xs">
                                    ✅ ĐÃ ĐỒNG Ý
                                  </span>
                                  <span className="text-xs text-purple-950 font-black bg-white px-2 py-0.5 rounded-lg border border-emerald-300">
                                    📅 {formatDateWithDayVN(swap.shift_date)}
                                  </span>
                                </div>
                                <div className="space-y-1 text-xs text-purple-950 font-bold">
                                  <p>👤 <strong>Nhân viên nhờ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
                                  <p>🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
                                  <p className="text-purple-800 italic pt-0.5">💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;</p>
                                  <div className="p-2 bg-emerald-100/90 rounded-xl border border-emerald-300 text-emerald-950 text-[11px] font-extrabold mt-1 flex items-center gap-1">
                                    <span>🎉</span>
                                    <span>Yêu cầu đổi ca đã được phê duyệt! Quản Lý sẽ điều chỉnh trên Lịch Phân Công.</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* NHÓM 3: ĐÃ BỊ TỪ CHỐI (MỚI NHẤT TRÊN CÙNG) */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5 bg-rose-100/90 px-3 py-1.5 rounded-xl border border-rose-300 w-fit">
                          <span>❌</span>
                          <span>Đã Bị Từ Chối ({rejectedList.length})</span>
                        </h3>
                        {rejectedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Không có yêu cầu nào bị từ chối trong tháng này.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {rejectedList.map((swap) => (
                              <div key={swap.id} className="p-4 rounded-2xl bg-rose-50/90 border-2 border-rose-400 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between gap-2 border-b pb-2 border-rose-200">
                                  <span className="px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-black uppercase text-white bg-rose-600 shadow-2xs">
                                    ❌ ĐÃ TỪ CHỐI
                                  </span>
                                  <span className="text-xs text-purple-950 font-black bg-white px-2 py-0.5 rounded-lg border border-rose-300">
                                    📅 {formatDateWithDayVN(swap.shift_date)}
                                  </span>
                                </div>
                                <div className="space-y-1 text-xs text-purple-950 font-bold">
                                  <p>👤 <strong>Nhân viên nhờ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
                                  <p>🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
                                  <p className="text-purple-800 italic pt-0.5">💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;</p>
                                  {swap.rejection_reason && (
                                    <div className="p-2.5 bg-rose-100 rounded-xl border border-rose-300 text-rose-950 text-xs font-black mt-2 space-y-0.5">
                                      <p className="text-rose-900 font-black flex items-center gap-1">
                                        <span>📢</span>
                                        <span>LÝ DO TỪ CHỐI DO QUẢN LÝ VIẾT:</span>
                                      </p>
                                      <p className="text-rose-800 italic">&quot;{swap.rejection_reason}&quot;</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
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
            </div>
          )}

          {/* ================= MODAL XEM CHI TIẾT NỘI DUNG LỖI PHẠT ================= */}
          {showPenaltyDetailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-purple-950/60 backdrop-blur-xs animate-fade-in">
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
                        Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]} • {employee.name}
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
                        Tuyệt vời! Bạn không có tiền phạt hay lỗi vi phạm nào trong Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}.
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

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
  getAnnouncementNotice,
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

  // State Thông Báo Quan Trọng Dành Cho Nhân Viên
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeText, setNoticeText] = useState(
    '📌 THÔNG BÁO TỪ CHỦ QUÁN (CHỊ HOA):\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!'
  );

  useEffect(() => {
    if (employee) {
      getAnnouncementNotice().then((text) => {
        if (text) setNoticeText(text);
      });

      const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
      const snooze = localStorage.getItem(snoozeKey);
      if (!snooze || Date.now() > Number(snooze)) {
        setShowNoticeModal(true);
      } else {
        setShowNoticeModal(false);
      }
    }
  }, [employee]);

  function handleSnoozeEmployeeNotice4Hours() {
    if (!employee) return;
    const snoozeTime = Date.now() + 4 * 60 * 60 * 1000; // 4 tiếng
    const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
    localStorage.setItem(snoozeKey, String(snoozeTime));
    setShowNoticeModal(false);
    toast.info('Đã ẩn thông báo', 'Thông báo từ Chủ Quán sẽ được tạm ẩn trong 4 giờ!');
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

      const [schedData, rates] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(employee.id),
      ]);

      setEmpRates(rates);

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
                  className="px-3 sm:px-4 py-1.5 rounded-full bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black border border-purple-800 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs whitespace-nowrap"
                  title="Bấm để xem thu nhập cá nhân"
                >
                  <span>💰</span>
                  <span>{isIncomeExpanded ? 'Thu nhỏ' : 'Xem Lương'}</span>
                </button>
              </div>
            </div>

            {/* Segmented Tab Switcher (Lịch Phân Công / Đăng Ký Làm) - Giới Hạn Width Cân Đối Cực Đẹp trên Máy Tính & Mobile */}
            <div className="flex bg-purple-100/90 p-1.5 rounded-2xl border border-purple-200 shadow-xs gap-2 mt-1 max-w-xl mx-auto w-full">
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={`flex-1 py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-black cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-95 ${view === 'schedule'
                  ? 'bg-purple-700 text-white shadow-md font-black scale-[1.01]'
                  : 'bg-white/80 text-purple-950 hover:bg-white font-extrabold border border-purple-200/60'
                  }`}
              >
                <span className="text-base sm:text-lg">📅</span>
                <span className="tracking-tight whitespace-nowrap">Lịch Phân Công</span>
              </button>
              <button
                type="button"
                onClick={() => setView('availability')}
                className={`flex-1 py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-black cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-95 ${view === 'availability'
                  ? 'bg-orange-600 text-white shadow-md font-black scale-[1.01] border border-orange-700'
                  : 'bg-orange-500 text-white font-black hover:bg-orange-600 border border-orange-600 shadow-2xs'
                  }`}
              >
                <span className="text-base sm:text-lg">📝</span>
                <span className="tracking-tight whitespace-nowrap">Đăng Ký Làm</span>
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
                  <div className="text-xs text-purple-700 font-bold mb-0.5">⏱️ Đã làm (tính đến hôm nay)</div>
                  <div className="text-lg sm:text-xl font-black text-purple-800">{monthlyHours} <span className="text-xs font-normal text-purple-600">tiếng</span> ({monthlyShiftsCount} ca)</div>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200/70 text-center">
                  <div className="text-xs text-purple-700 font-bold mb-0.5">💵 Lương thỏa thuận</div>
                  <div className="text-lg sm:text-xl font-black text-purple-950">{formatCurrency(currentRate)}<span className="text-xs font-normal text-purple-600">/h</span></div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200/80 text-center">
                  <div className="text-xs text-emerald-700 font-black mb-0.5">💰 Lương tích lũy hôm nay</div>
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

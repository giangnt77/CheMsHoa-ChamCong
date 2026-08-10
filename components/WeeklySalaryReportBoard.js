'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBranches,
  getScheduleByDateRange,
  getEmployeeRates,
  calculateSalaryFromShifts,
  updateEmployeesSortOrders,
  getAllPenaltiesByMonth,
} from '@/lib/supabase';
import {
  formatCurrency,
  formatDateISO,
  getBranchColorStyle,
} from '@/lib/utils';

function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay(); // 0=CN, 1=T2...
  const daysToSub = day === 0 ? 6 : day - 1;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToSub);
  return formatDateISO(monday);
}

function getWeekDaysFromMonday(mondayStr) {
  const days = [];
  const [y, m, d] = mondayStr.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m - 1, d + i);
    days.push(formatDateISO(dt));
  }
  return days;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function getEffectiveRateForDate(emp, ratesList, dateStr) {
  const defaultRate = emp?.hourly_rate || 20000;
  if (!ratesList || ratesList.length === 0) return defaultRate;
  const sorted = [...ratesList].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const active = sorted.find((r) => r.effective_date <= dateStr);
  return active ? active.hourly_rate : defaultRate;
}

function getCurrentMonthStr() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function WeeklySalaryReportBoard({ employees = [], toast, onSelectPenaltyEmployee }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [schedule, setSchedule] = useState([]);
  const [monthSchedule, setMonthSchedule] = useState([]);
  const [branches, setBranches] = useState([]);
  const [ratesMap, setRatesMap] = useState({});
  const [penaltiesMap, setPenaltiesMap] = useState({});
  const [loading, setLoading] = useState(true);

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startDate = weekDays[0];
  const endDate = weekDays[6];

  const { monthStartDate, monthEndDate } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      monthStartDate: `${y}-${String(m).padStart(2, '0')}-01`,
      monthEndDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [selectedMonth]);

  useEffect(() => {
    loadWeekSalaryData();
  }, [currentMonday, selectedMonth, employees]);

  async function loadWeekSalaryData() {
    setLoading(true);
    try {
      const [schedData, monthSchedData, branchData, allPenalties] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getScheduleByDateRange(monthStartDate, monthEndDate),
        getBranches(),
        getAllPenaltiesByMonth(selectedMonth),
      ]);
      setSchedule(schedData);
      setMonthSchedule(monthSchedData || []);
      setBranches(branchData || []);

      // Tạo map thưởng/phạt theo employee_id
      const pMap = {};
      (allPenalties || []).forEach((p) => {
        if (!pMap[p.employee_id]) pMap[p.employee_id] = [];
        pMap[p.employee_id].push(p);
      });
      setPenaltiesMap(pMap);

      // Tải mốc tăng lương cho tất cả nhân viên
      const ratesPromises = employees.map((emp) =>
        getEmployeeRates(emp.id).then((rList) => ({ empId: emp.id, rates: rList }))
      );
      const ratesResults = await Promise.all(ratesPromises);
      const rMap = {};
      ratesResults.forEach(({ empId, rates }) => {
        rMap[empId] = rates;
      });
      setRatesMap(rMap);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể tải báo cáo lương tuần');
    }
    setLoading(false);
  }

  function prevWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevM = new Date(y, m - 1, d - 7);
    setCurrentMonday(formatDateISO(prevM));
  }

  function nextWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const nextM = new Date(y, m - 1, d + 7);
    setCurrentMonday(formatDateISO(nextM));
  }

  function goTodayWeek() {
    setCurrentMonday(getMondayOfCurrentWeek());
  }

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const newMonthStr = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    setSelectedMonth(newMonthStr);
  }

  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const newMonthStr = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonthStr);
  }

  function goCurrentMonth() {
    setSelectedMonth(getCurrentMonthStr());
  }

  // Sắp xếp danh sách nhân viên y chang Bảng Ma Trận Lịch Tuần (Đẩy OFF xuống cuối cùng)
  const sortedEmployees = useMemo(() => {
    if (!employees) return [];
    return [...employees]
      .filter((emp) => {
        // Lọc bỏ tài khoản Chủ Quán & Quản Lý
        if (emp.role === 'owner' || emp.role === 'manager' || emp.name.includes('Chủ Quán') || emp.name.includes('Quản Lý')) {
          return false;
        }
        const empStartDate = emp.created_at ? emp.created_at.slice(0, 10) : '2000-01-01';
        return empStartDate <= endDate; // Chỉ hiển thị nhân viên đã vào làm mốc tuần này
      })
      .sort((a, b) => {
        const isOffA = a.status === 'off';
        const isOffB = b.status === 'off';
        if (isOffA !== isOffB) return isOffA ? 1 : -1;

        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
  }, [employees, endDate]);

  // Index map dữ liệu ca làm tháng theo employeeId_date (chỉ lọc các ca đúng thuộc selectedMonth)
  const monthScheduleByEmpAndDate = useMemo(() => {
    const map = {};
    (monthSchedule || []).forEach((item) => {
      if (item.date && item.date.startsWith(selectedMonth)) {
        const key = `${item.employee_id}_${item.date}`;
        if (!map[key]) map[key] = [];
        map[key].push(item);
      }
    });
    return map;
  }, [monthSchedule, selectedMonth]);

  // Tính tổng lương tháng cho từng nhân viên & toàn bộ nhân viên
  const { empMonthlyTotals, grandTotalMonthlySalary, grandTotalMonthlyHours, grandTotalMonthlyBonus, grandTotalMonthlyPenalty, grandTotalMonthlyNet } = useMemo(() => {
    const empTotals = {};
    let totalSal = 0;
    let totalHrs = 0;
    let totalBon = 0;
    let totalPen = 0;

    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const mStr = String(m).padStart(2, '0');

    const allDaysInMonth = [];
    for (let i = 1; i <= lastDay; i++) {
      allDaysInMonth.push(`${y}-${mStr}-${String(i).padStart(2, '0')}`);
    }

    sortedEmployees.forEach((emp) => {
      const empShifts = allDaysInMonth.flatMap((dStr) => monthScheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
      const empRates = ratesMap[emp.id] || [];
      const defaultRate = emp.hourly_rate || 20000;

      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        empShifts,
        empRates,
        defaultRate
      );

      // Tính thưởng & phạt cho nhân viên này
      let empBonus = 0;
      let empPenalty = 0;
      const empPenalties = penaltiesMap[emp.id] || [];
      empPenalties.forEach((p) => {
        const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
        if (isBonus) {
          empBonus += Math.abs(p.amount);
        } else {
          empPenalty += Math.abs(p.amount);
        }
      });

      const netSalary = grossSalary + empBonus - empPenalty;

      empTotals[emp.id] = {
        totalHours,
        grossSalary,
        shiftCount: empShifts.length,
        totalBonus: empBonus,
        totalPenalty: empPenalty,
        netSalary,
      };

      totalSal += grossSalary;
      totalHrs += totalHours;
      totalBon += empBonus;
      totalPen += empPenalty;
    });

    return {
      empMonthlyTotals: empTotals,
      grandTotalMonthlySalary: totalSal,
      grandTotalMonthlyHours: totalHrs,
      grandTotalMonthlyBonus: totalBon,
      grandTotalMonthlyPenalty: totalPen,
      grandTotalMonthlyNet: totalSal + totalBon - totalPen,
    };
  }, [sortedEmployees, monthScheduleByEmpAndDate, ratesMap, selectedMonth, penaltiesMap]);

  // Index map dữ liệu ca làm theo employeeId_date
  const scheduleByEmpAndDate = useMemo(() => {
    const map = {};
    schedule.forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [schedule]);

  // Tính tổng lương tuần cho từng nhân viên & toàn tiệm
  const { empWeeklyTotals, grandTotalSalary, grandTotalHours } = useMemo(() => {
    const empTotals = {};
    let totalSal = 0;
    let totalHrs = 0;

    sortedEmployees.forEach((emp) => {
      const empShifts = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
      const empRates = ratesMap[emp.id] || [];

      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        empShifts,
        empRates,
        emp.hourly_rate || 20000
      );

      empTotals[emp.id] = { totalHours, grossSalary, shiftCount: empShifts.length };
      totalSal += grossSalary;
      totalHrs += totalHours;
    });

    return {
      empWeeklyTotals: empTotals,
      grandTotalSalary: totalSal,
      grandTotalHours: totalHrs,
    };
  }, [sortedEmployees, weekDays, scheduleByEmpAndDate, ratesMap]);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header điều hướng Tháng & Tuần gọn gàng 1 hàng (Bên Trái: Tuần - Bên Phải: Tháng) */}
      <div className="bg-white rounded-3xl p-3 sm:p-4 border border-purple-200 shadow-2xs flex items-center justify-between flex-wrap gap-3">
        {/* Cụm Bên Trái: Tuần Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-purple-900 uppercase">⚡ Báo Cáo Lương Tuần:</span>
          <button
            type="button"
            onClick={prevWeek}
            className="w-8 h-8 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tuần trước"
          >
            ◀
          </button>
          <div className="px-3.5 py-1.5 bg-purple-100/70 border border-purple-300 rounded-xl text-center">
            <span className="text-xs sm:text-sm font-black text-purple-950">
              Tuần: {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}/{endDate.split('-')[0]}
            </span>
          </div>
          <button
            type="button"
            onClick={nextWeek}
            className="w-8 h-8 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tuần sau"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={goTodayWeek}
            className="px-3 py-1.5 rounded-xl bg-purple-700 text-white hover:bg-purple-800 text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95"
          >
            Tuần Này
          </button>
        </div>

        {/* Cụm Bên Phải: Tháng Selector (Kéo sang vị trí cũ của 2 thẻ vừa bỏ) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-amber-950 uppercase">📅 Lương Tháng:</span>
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black border border-amber-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tháng trước"
          >
            ◀
          </button>
          <div className="px-3.5 py-1.5 bg-amber-500 text-purple-950 rounded-xl text-center font-black text-xs sm:text-sm shadow-2xs">
            Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black border border-amber-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tháng sau"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={goCurrentMonth}
            className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-purple-950 text-xs font-black border border-amber-300 cursor-pointer shadow-2xs transition-all active:scale-95"
          >
            Tháng Hiện Tại
          </button>
        </div>
      </div>

      {/* BẢNG MA TRẬN BÁO CÁO LƯƠNG CHUẨN ĐỒNG BỘ 100% */}
      <div className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[1020px] border-collapse text-xs">
          <thead>
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-2.5 px-2 border-r-2 border-purple-300 w-28 sm:w-32 text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-xs">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-1 border-r border-purple-800 text-center font-black uppercase text-amber-300 text-xs min-w-[85px] sm:min-w-[92px]">
                  <div>{DAY_LABELS[idx]}</div>
                  <div className="text-[10px] font-extrabold text-purple-200 mt-0.5">{dStr.split('-').reverse().slice(0, 2).join('/')}</div>
                </th>
              ))}
              <th className="py-2.5 px-2 text-center font-black uppercase text-emerald-300 text-xs bg-purple-950 w-32">
                💵 LƯƠNG TUẦN
              </th>
              <th className="py-2.5 px-2 text-center font-black uppercase text-amber-300 text-xs bg-purple-950 w-44 border-l-2 border-amber-400">
                💰 THỰC NHẬN THÁNG ({selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]})
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                </td>
              </tr>
            ) : sortedEmployees.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-purple-600 italic font-bold">
                  Không có nhân viên.
                </td>
              </tr>
            ) : (
              <>
                {sortedEmployees.map((emp) => {
                  const empShiftsThisWeek = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
                  const empRates = ratesMap[emp.id] || [];
                  const defaultRate = emp.hourly_rate || 20000;
                  const currentWeeklyRate = getEffectiveRateForDate(emp, empRates, endDate);

                  const empTotals = empWeeklyTotals[emp.id] || { totalHours: 0, grossSalary: 0, shiftCount: 0 };
                  const empMTotal = empMonthlyTotals[emp.id] || { totalHours: 0, grossSalary: 0, shiftCount: 0, totalBonus: 0, totalPenalty: 0, netSalary: 0 };

                  const isOffWeek = empShiftsThisWeek.length === 0;
                  const rowBgClass = isOffWeek ? 'bg-rose-50/40' : 'bg-white';

                  return (
                    <tr key={emp.id} className={`border-b border-purple-100 transition-all ${rowBgClass} hover:bg-purple-100/70`}>
                      {/* Tên Nhân Viên Sticky */}
                      <td
                        className={`py-2 px-2 border-r-2 border-purple-300 font-black text-purple-950 text-xs sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-28 sm:w-32`}
                      >
                        <div className="truncate">
                          <div className="font-black text-purple-950 truncate text-xs">{emp.name}</div>
                          <div className="text-[10px] font-extrabold text-purple-700 mt-0.5">
                            💵 {formatCurrency(currentWeeklyRate)}/h
                          </div>
                        </div>
                      </td>

                      {/* 7 Ô Ngày (T2 -> CN) */}
                      {weekDays.map((dStr) => {
                        const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];

                        return (
                          <td key={dStr} className="py-1.5 px-1 border-r border-purple-100 text-center align-middle">
                            {empShifts.length > 0 ? (
                              <div className="space-y-1">
                                {empShifts.map((shift) => {
                                  const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                  const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                  const timeRange = `${startTimeStr}-${endTimeStr}`;

                                  const branchObj = branches.find((b) => b.id === shift.branch_id) || shift.branches;
                                  const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                                  const { grossSalary: shiftSalary } = calculateSalaryFromShifts([shift], empRates, defaultRate);

                                  return (
                                    <div
                                      key={shift.id}
                                      className="p-1 rounded-xl bg-purple-50/90 border text-center shadow-2xs space-y-0.5"
                                      style={{ borderColor: `${branchStyle.hex}60` }}
                                    >
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span
                                          className="w-2 h-2 rounded-full border border-white flex-shrink-0 shadow-2xs"
                                          style={{ backgroundColor: branchStyle.hex }}
                                          title={`Chi nhánh: ${branchObj?.name || 'Chưa rõ'}`}
                                        />
                                        <span className="text-[9px] font-black text-purple-950 truncate max-w-[60px]">
                                          {branchStyle.badgeText || branchObj?.name}
                                        </span>
                                      </div>
                                      <div className="text-[10.5px] font-black text-purple-950 tracking-tight">{timeRange}</div>
                                      <div className="text-[9.5px] font-black text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded-md border border-emerald-200">
                                        {formatCurrency(shiftSalary)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-red-500 font-black text-[9.5px] uppercase px-1 py-0.5 rounded-md bg-red-50 border border-red-200 inline-block shadow-2xs">
                                OFF
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Cột TỔNG LƯƠNG TUẦN */}
                      <td className="py-2 px-1 text-center align-middle bg-purple-100/30">
                        <div className="p-1.5 rounded-2xl bg-purple-700 text-white font-black shadow-xs space-y-0.5">
                          <div className="text-xs font-black tracking-tight">{formatCurrency(empTotals.grossSalary)}</div>
                          <div className="text-[9.5px] font-extrabold text-purple-200">({empTotals.totalHours}h • {empTotals.shiftCount} ca)</div>
                        </div>
                      </td>

                      {/* CỘT NỔI BẬT LƯƠNG THÁNG (THỰC NHẬN = LƯƠNG CA + THƯỞNG - PHẠT) - BẤM VÀO ĐỂ CHUYỂN SANG TRANG THƯỞNG/PHẠT */}
                      <td className="py-2 px-1 text-center align-middle bg-amber-50/70 border-l-2 border-amber-400">
                        <div
                          onClick={() => {
                            if (onSelectPenaltyEmployee) {
                              onSelectPenaltyEmployee(emp, selectedMonth);
                            }
                          }}
                          className="p-1.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-purple-950 font-black shadow-xs space-y-0.5 border border-amber-400 cursor-pointer transition-all active:scale-95 hover:scale-[1.03] hover:shadow-md group"
                          title={`Bấm để chuyển sang trang Thưởng & Phạt của ${emp.name}`}
                        >
                          <div className="text-xs font-black tracking-tight">{formatCurrency(empMTotal.netSalary)}</div>
                          <div className="text-[9.5px] font-extrabold text-purple-900">({empMTotal.totalHours}h • {empMTotal.shiftCount} ca)</div>
                          {(empMTotal.totalBonus > 0 || empMTotal.totalPenalty > 0) && (
                            <div className="flex items-center justify-center gap-1 text-[9px] pt-0.5 border-t border-amber-400/60 font-bold">
                              {empMTotal.totalBonus > 0 && <span className="text-emerald-900 font-extrabold">🎁+{formatCurrency(empMTotal.totalBonus)}</span>}
                              {empMTotal.totalPenalty > 0 && <span className="text-rose-900 font-extrabold">⚠️-{formatCurrency(empMTotal.totalPenalty)}</span>}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* HÀNG CỘNG TỔNG TOÀN BỘ CA LÀM VÀ LƯƠNG THÁNG CUỐI BẢNG */}
                <tr className="bg-purple-950 text-white font-black border-t-2 border-purple-800">
                  <td className="py-3 px-2 font-black text-purple-950 text-xs sm:text-sm sticky left-0 z-20 bg-purple-200/90 shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] uppercase">
                    TỔNG LƯƠNG
                  </td>
                  {weekDays.map((dStr) => {
                    const dayShifts = schedule.filter((s) => s.date === dStr);
                    let daySal = 0;
                    let dayHrs = 0;

                    dayShifts.forEach((shift) => {
                      const empRates = ratesMap[shift.employee_id] || [];
                      const emp = sortedEmployees.find((e) => e.id === shift.employee_id);
                      const defaultRate = emp?.hourly_rate || 20000;
                      const { grossSalary, totalHours: shiftHrs } = calculateSalaryFromShifts([shift], empRates, defaultRate);
                      daySal += grossSalary;
                      dayHrs += shiftHrs;
                    });

                    return (
                      <td key={dStr} className="py-3 px-2 border-r border-purple-800 text-center">
                        <div className="text-xs font-black text-emerald-300">{formatCurrency(daySal)}</div>
                        <div className="text-[10px] font-extrabold text-purple-200">{dayHrs}h</div>
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-center bg-purple-900">
                    <div className="text-xs sm:text-sm font-black text-emerald-300">{formatCurrency(grandTotalSalary)}</div>
                    <div className="text-[10px] font-extrabold text-purple-200">({grandTotalHours}h)</div>
                  </td>
                  <td className="py-3 px-3 text-center bg-amber-600 border-l-4 border-amber-400">
                    <div className="text-xs sm:text-sm font-black text-white">{formatCurrency(grandTotalMonthlyNet)}</div>
                    <div className="text-[10px] font-extrabold text-amber-100">({grandTotalMonthlyHours}h)</div>
                    {(grandTotalMonthlyBonus > 0 || grandTotalMonthlyPenalty > 0) && (
                      <div className="flex items-center justify-center gap-1 text-[9.5px] pt-0.5 font-bold">
                        {grandTotalMonthlyBonus > 0 && <span className="text-emerald-200">🎁+{formatCurrency(grandTotalMonthlyBonus)}</span>}
                        {grandTotalMonthlyPenalty > 0 && <span className="text-rose-200">⚠️-{formatCurrency(grandTotalMonthlyPenalty)}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

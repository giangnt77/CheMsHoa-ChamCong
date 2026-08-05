'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBranches,
  getScheduleByDateRange,
  getEmployeeRates,
  calculateSalaryFromShifts,
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

export default function WeeklySalaryReportBoard({ employees = [], toast }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [schedule, setSchedule] = useState([]);
  const [ratesMap, setRatesMap] = useState({});
  const [loading, setLoading] = useState(true);

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startDate = weekDays[0];
  const endDate = weekDays[6];

  useEffect(() => {
    loadWeekSalaryData();
  }, [currentMonday, employees]);

  async function loadWeekSalaryData() {
    setLoading(true);
    try {
      const schedData = await getScheduleByDateRange(startDate, endDate);
      setSchedule(schedData);

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

  // Sắp xếp danh sách nhân viên y chang Bảng Ma Trận Lịch Tuần
  const sortedEmployees = useMemo(() => {
    if (!employees) return [];
    return [...employees].sort((a, b) => {
      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [employees]);

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
      {/* Header điều hướng tuần + Thống kê tổng tiền chi trả lương tuần */}
      <div className="bg-white rounded-3xl p-4 border border-purple-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Tuần Selector */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevWeek}
              className="w-9 h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            >
              ◀
            </button>
            <div className="px-3 py-1.5 bg-purple-100/70 border border-purple-300 rounded-xl text-center">
              <span className="text-xs sm:text-sm font-black text-purple-950">
                Tuần: {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}/{endDate.split('-')[0]}
              </span>
            </div>
            <button
              type="button"
              onClick={nextWeek}
              className="w-9 h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={goTodayWeek}
              className="px-3 py-1.5 rounded-xl bg-purple-700 text-white hover:bg-purple-800 text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              Hôm nay
            </button>
          </div>

          {/* Thẻ Thống Kê Tổng Tiền Lương Tuần Toàn Tiệm */}
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-200 shadow-2xs">
            <div>
              <div className="text-[10px] text-emerald-800 font-black uppercase">💰 TỔNG LƯƠNG TUẦN NÀY (TOÀN TIỆM)</div>
              <div className="text-base sm:text-lg font-black text-emerald-700">
                {formatCurrency(grandTotalSalary)} <span className="text-xs font-extrabold text-emerald-600">({grandTotalHours}h)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BẢNG MA TRẬN BÁO CÁO LƯƠNG TUẦN */}
      <div className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead>
            {/* Header: NHÂN VIÊN + 7 THỨ + TỔNG LƯƠNG TUẦN */}
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-3 px-3 border-r-2 border-purple-300 w-44 sm:w-52 text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)]">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-2 border-r border-purple-800 text-center font-black uppercase text-amber-300 text-xs sm:text-sm min-w-[115px]">
                  <div>{DAY_LABELS[idx]}</div>
                  <div className="text-[11px] font-extrabold text-purple-200 mt-0.5">{dStr.split('-').reverse().slice(0, 2).join('/')}</div>
                </th>
              ))}
              <th className="py-3 px-3 text-center font-black uppercase text-emerald-300 text-xs sm:text-sm bg-purple-950 w-40">
                💵 TỔNG LƯƠNG TUẦN
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                </td>
              </tr>
            ) : sortedEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-purple-600 italic font-bold">
                  Không có nhân viên.
                </td>
              </tr>
            ) : (
              <>
                {sortedEmployees.map((emp, idx) => {
                  const empRates = ratesMap[emp.id] || [];
                  const defaultRate = emp.hourly_rate || 20000;
                  const currentWeeklyRate = getEffectiveRateForDate(emp, empRates, endDate);
                  const empTotals = empWeeklyTotals[emp.id] || { totalHours: 0, grossSalary: 0, shiftCount: 0 };

                  const rowBgClass = idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/60';

                  return (
                    <tr key={emp.id} className={`border-b border-purple-100 transition-all ${rowBgClass} hover:bg-purple-100/70`}>
                      {/* Tên Nhân Viên Sticky + Mức Lương Thỏa Thuận Áp Dụng Cho Tuần */}
                      <td className={`py-3 px-3 border-r-2 border-purple-300 font-black text-purple-950 text-sm sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)]`}>
                        <div className="font-black text-purple-950 truncate text-sm">{emp.name}</div>
                        <div className="text-[11px] font-extrabold text-purple-700 mt-0.5">
                          💵 {formatCurrency(currentWeeklyRate)}/h
                        </div>
                      </td>

                      {/* 7 Ô Ngày (T2 -> CN) */}
                      {weekDays.map((dStr) => {
                        const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];

                        return (
                          <td key={dStr} className="py-2 px-1.5 border-r border-purple-100 text-center align-middle">
                            {empShifts.length > 0 ? (
                              <div className="space-y-1">
                                {empShifts.map((shift) => {
                                  const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                  const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                  const timeRange = `${startTimeStr}-${endTimeStr}`;
                                  const hours = shift.hours || 5;

                                  // Tính tiền ca này theo mốc lương
                                  const { grossSalary: shiftSalary } = calculateSalaryFromShifts([shift], empRates, defaultRate);

                                  return (
                                    <div
                                      key={shift.id}
                                      className="p-1.5 rounded-xl bg-purple-50 border border-purple-200/90 text-center shadow-2xs space-y-0.5"
                                    >
                                      <div className="text-xs font-black text-purple-950 tracking-tight">{timeRange}</div>
                                      <div className="text-[11px] font-black text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded-md border border-emerald-200">
                                        {formatCurrency(shiftSalary)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-red-500 font-black text-[11px] uppercase px-2 py-0.5 rounded-md bg-red-50 border border-red-200 inline-block shadow-2xs">
                                OFF
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Cột TỔNG LƯƠNG TUẦN của Nhân Viên */}
                      <td className="py-2 px-3 text-center align-middle bg-purple-100/50">
                        <div className="p-2 rounded-2xl bg-purple-700 text-white font-black shadow-xs space-y-0.5">
                          <div className="text-xs sm:text-sm font-black tracking-tight">{formatCurrency(empTotals.grossSalary)}</div>
                          <div className="text-[10px] font-extrabold text-purple-200">({empTotals.totalHours}h • {empTotals.shiftCount} ca)</div>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* HÀNG CỘNG TỔNG TOÀN TIỆM CUỐI BẢNG */}
                <tr className="bg-purple-950 text-white font-black border-t-2 border-purple-800">
                  <td className="py-3.5 px-3 border-r-2 border-purple-300 sticky left-0 z-20 bg-purple-950 text-amber-300 text-sm uppercase shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)]">
                    👑 TỔNG CỘNG TIỆM
                  </td>
                  {weekDays.map((dStr) => {
                    const dayShifts = schedule.filter((s) => s.date === dStr);
                    let daySal = 0;
                    let dayHrs = 0;

                    dayShifts.forEach((shift) => {
                      const empRates = ratesMap[shift.employee_id] || [];
                      const emp = sortedEmployees.find((e) => e.id === shift.employee_id);
                      const defaultRate = emp?.hourly_rate || 20000;
                      const { grossSalary } = calculateSalaryFromShifts([shift], empRates, defaultRate);
                      daySal += grossSalary;
                      dayHrs += (shift.hours || 5);
                    });

                    return (
                      <td key={dStr} className="py-3 px-2 border-r border-purple-800 text-center">
                        <div className="text-xs font-black text-emerald-300">{formatCurrency(daySal)}</div>
                        <div className="text-[10px] font-extrabold text-purple-200">{dayHrs}h</div>
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-center bg-purple-900">
                    <div className="text-sm font-black text-amber-300">{formatCurrency(grandTotalSalary)}</div>
                    <div className="text-[10px] font-extrabold text-purple-200">({grandTotalHours}h)</div>
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

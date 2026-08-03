'use client';

import { useState, useEffect, useMemo } from 'react';
import { getScheduleByDateRange, getBranches } from '@/lib/supabase';
import { getCalendarDays, getToday } from '@/lib/utils';

/**
 * ScheduleCalendar — Calendar tháng hiển thị lịch làm việc chính thức.
 * Mỗi ô ngày: hiển thị rõ tên chi nhánh, tên nhân viên và số giờ làm.
 */

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function ScheduleCalendar({ highlightEmployeeId }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schedule, setSchedule] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = getToday();
  const [selectedDate, setSelectedDate] = useState(today);

  useEffect(() => {
    loadData();
  }, [year, month]);

  async function loadData() {
    setLoading(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-31`;
      const [schedData, branchData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getBranches(),
      ]);
      setSchedule(schedData);
      setBranches(branchData);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Group schedule by date
  const scheduleByDate = useMemo(() => {
    const map = {};
    schedule.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, [schedule]);

  // Calendar days
  const calendarDays = useMemo(
    () => getCalendarDays(year, month),
    [year, month]
  );

  function prevMonth() {
    let newYear = year;
    let newMonth = month;
    if (month === 0) {
      newMonth = 11;
      newYear = year - 1;
    } else {
      newMonth = month - 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    const newMonthStr = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    setSelectedDate(today.startsWith(newMonthStr) ? today : `${newMonthStr}-01`);
  }

  function nextMonth() {
    let newYear = year;
    let newMonth = month;
    if (month === 11) {
      newMonth = 0;
      newYear = year + 1;
    } else {
      newMonth = month + 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    const newMonthStr = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    setSelectedDate(today.startsWith(newMonthStr) ? today : `${newMonthStr}-01`);
  }

  // Get selected day detail
  const selectedDaySchedule = selectedDate ? (scheduleByDate[selectedDate] || []) : [];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Month Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-glass-border)]">
        <button
          onClick={prevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-white transition-all text-sm cursor-pointer border-0"
        >
          ◀
        </button>
        <h3 className="font-bold text-base md:text-lg">
          📅 {MONTH_NAMES[month]} {year}
        </h3>
        <button
          onClick={nextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-white transition-all text-sm cursor-pointer border-0"
        >
          ▶
        </button>
      </div>

      {/* Branch Legend */}
      {branches.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-[var(--color-glass-border)]">
          {branches.map((b) => (
            <span
              key={b.id}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{ backgroundColor: `${b.color}25`, color: '#fff', border: `1px solid ${b.color}` }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: b.color }}
              />
              CN {b.name}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div className="px-2 py-3">
            {/* Day Headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_HEADERS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-bold text-[var(--color-text-muted)] py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="grid grid-cols-7 gap-1 md:gap-1.5">
              {calendarDays.map((day, idx) => {
                const daySchedule = day.date ? (scheduleByDate[day.date] || []) : [];
                const isToday = day.date === today;
                const isSelected = day.date === selectedDate;
                const hasMyShift = highlightEmployeeId && daySchedule.some(
                  (s) => s.employee_id === highlightEmployeeId
                );

                return (
                  <button
                    key={idx}
                    onClick={() => day.date && setSelectedDate(day.date === selectedDate ? null : day.date)}
                    disabled={!day.isCurrentMonth}
                    className={`schedule-cal-day relative min-h-[70px] md:min-h-[95px] p-1.5 rounded-xl text-left align-top cursor-pointer border transition-all ${
                      !day.isCurrentMonth
                        ? 'opacity-30 cursor-default border-transparent'
                        : isSelected
                        ? 'border-amber-500 bg-[rgba(245,158,11,0.15)] shadow-lg'
                        : isToday
                        ? 'border-amber-500/60 bg-[var(--color-surface-1)]'
                        : 'border-transparent bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]'
                    } ${hasMyShift ? 'ring-2 ring-emerald-400' : ''}`}
                  >
                    {/* Day Number */}
                    <span
                      className={`text-xs md:text-sm font-extrabold block mb-1 ${
                        isToday
                          ? 'text-amber-400'
                          : day.isCurrentMonth
                          ? 'text-white'
                          : 'text-[var(--color-text-muted)]'
                      }`}
                    >
                      {day.day}
                    </span>

                    {/* Schedule Summary Badges (Gom theo Chi Nhánh để không bị tràn với 25+ nhân viên) */}
                    <div className="space-y-1">
                      {branches.map((b) => {
                        const count = daySchedule.filter(s => s.branch_id === b.id).length;
                        if (count === 0) return null;
                        const hasMe = highlightEmployeeId && daySchedule.some(s => s.branch_id === b.id && s.employee_id === highlightEmployeeId);
                        return (
                          <div
                            key={b.id}
                            className={`text-[10px] md:text-[11px] leading-tight rounded-md px-1.5 py-0.5 font-bold flex items-center justify-between gap-1 ${
                              hasMe ? 'ring-1 ring-white shadow-md' : ''
                            }`}
                            style={{
                              backgroundColor: `${b.color}25`,
                              color: '#ffffff',
                              borderLeft: `3px solid ${b.color}`,
                            }}
                          >
                            <span className="truncate" style={{ color: b.color }}>
                              {hasMe && '⭐ '}{b.name}
                            </span>
                            <span className="text-[10px] text-white font-extrabold bg-white/20 px-1 rounded-full">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Detail */}
          {selectedDate && (
            <div className="px-5 py-4 border-t border-[var(--color-glass-border)] animate-fade-in">
              <h4 className="font-bold text-base mb-3 flex items-center gap-2">
                <span>📋</span>
                Chi tiết ca làm ngày {selectedDate.split('-').reverse().join('/')}
              </h4>
              {selectedDaySchedule.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] italic">
                  Chưa có lịch xếp cho ngày này
                </p>
              ) : (
                <div className="space-y-2">
                  {branches.map((branch) => {
                    const branchItems = selectedDaySchedule.filter(
                      (s) => s.branch_id === branch.id
                    );
                    if (branchItems.length === 0) return null;
                    return (
                      <div
                        key={branch.id}
                        className="rounded-xl p-3"
                        style={{
                          backgroundColor: `${branch.color}15`,
                          border: `1px solid ${branch.color}40`,
                        }}
                      >
                        <div
                          className="text-sm font-bold mb-2 flex items-center gap-1.5"
                          style={{ color: branch.color }}
                        >
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ backgroundColor: branch.color }}
                          />
                          Chi nhánh {branch.name} ({branchItems.length} người)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {branchItems.map((s) => {
                            const isMe = highlightEmployeeId && s.employee_id === highlightEmployeeId;
                            const hours = s.hours || 5;
                            const timeStr = (s.start_time && s.end_time) 
                              ? `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}`
                              : `${hours}h`;
                            return (
                              <span
                                key={s.id}
                                className={`text-sm px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 border ${
                                  isMe
                                    ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow-md'
                                    : 'bg-[var(--color-surface-2)] text-white border-[var(--color-glass-border)]'
                                }`}
                              >
                                <span>{isMe && '⭐ '}{s.employees?.name}</span>
                                <span className={isMe ? 'text-black font-extrabold text-xs bg-black/10 px-2 py-0.5 rounded' : 'text-amber-400 font-bold text-xs bg-amber-500/10 px-2 py-0.5 rounded'}>
                                  ⏱️ {timeStr} ({hours}h)
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

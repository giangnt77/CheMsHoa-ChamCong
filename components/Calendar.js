'use client';

import { useMemo } from 'react';
import { getCalendarDays, getMonthName, getToday } from '@/lib/utils';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Calendar({ year, month, shifts = [], onPrevMonth, onNextMonth, onDayClick, selectedDate }) {
  const today = getToday();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const shiftDates = useMemo(() => {
    const set = new Set();
    shifts.forEach(s => set.add(s.date));
    return set;
  }, [shifts]);

  const getShiftsForDate = (date) => {
    return shifts.filter(s => s.date === date);
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-glass-border)]">
        <button
          onClick={onPrevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-white transition-all text-sm cursor-pointer"
        >
          ◀
        </button>
        <h3 className="font-bold text-base text-white">
          {getMonthName(monthStr)}
        </h3>
        <button
          onClick={onNextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-white transition-all text-sm cursor-pointer"
        >
          ▶
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 px-3 pt-3">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-1">
        {days.map((dayInfo, idx) => {
          const hasShift = dayInfo.date && shiftDates.has(dayInfo.date);
          const isToday = dayInfo.date === today;
          const isSelected = dayInfo.date === selectedDate;
          const dayShifts = dayInfo.date ? getShiftsForDate(dayInfo.date) : [];

          return (
            <button
              key={idx}
              onClick={() => dayInfo.isCurrentMonth && onDayClick?.(dayInfo.date)}
              disabled={!dayInfo.isCurrentMonth}
              className={`
                calendar-day aspect-square flex flex-col items-center justify-center rounded-lg text-sm relative cursor-pointer border-0 bg-transparent
                ${!dayInfo.isCurrentMonth ? 'opacity-20 cursor-default' : ''}
                ${isToday ? 'today' : ''}
                ${hasShift ? 'has-shift' : ''}
                ${isSelected ? 'ring-2 ring-amber-500 bg-[rgba(245,158,11,0.2)]' : ''}
              `}
            >
              <span>{dayInfo.day}</span>
              {hasShift && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getAvailabilityByEmployee,
  upsertAvailability,
  deleteAvailability,
} from '@/lib/supabase';
import { useToast } from '@/components/Toast';

/**
 * WeeklyAvailability — Đăng ký lịch rảnh CHỈ CHO TUẦN SAU.
 * Thao tác chọn thay đổi ở bộ nhớ tạm trước, sau đó bấm nút "XÁC NHẬN ĐĂNG KÝ" mới lưu vào DB.
 */

function formatDateISO(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getThisWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=CN, 1=T2...
  const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToSub);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

function getNextWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=CN, 1=T2...
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysUntilNextMonday);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate() + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];

export default function WeeklyAvailability({ employee, onUpdate }) {
  const toast = useToast();
  const [weekType, setWeekType] = useState('next'); // 'this' | 'next'
  const days = useMemo(() => (weekType === 'this' ? getThisWeekDays() : getNextWeekDays()), [weekType]);

  // Selected state: { [dateStr]: 'full' | 'option' | 'off' }
  const [availability, setAvailability] = useState({});
  // Saved state from DB to compare changes
  const [initialAvailability, setInitialAvailability] = useState({});
  const [noteInputs, setNoteInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadAvailability();
  }, [employee, weekType]);

  async function loadAvailability() {
    setLoading(true);
    try {
      const data = await getAvailabilityByEmployee(
        employee.id,
        days[0],
        days[6]
      );
      const map = {};
      const notes = {};
      data.forEach((item) => {
        map[item.date] = item.type;
        notes[item.date] = item.note || '';
      });
      setAvailability(map);
      setInitialAvailability(map);
      setNoteInputs(notes);
      setHasChanges(false);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải lịch đăng ký');
    }
    setLoading(false);
  }

  function handleSelect(date, type) {
    setAvailability((prev) => {
      const next = { ...prev };
      if (next[date] === type) {
        delete next[date]; // Bấm lại để hủy chọn
      } else {
        next[date] = type;
      }
      return next;
    });
    setHasChanges(true);
  }

  function handleNoteChange(date, text) {
    setNoteInputs((prev) => ({ ...prev, [date]: text }));
    setHasChanges(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      // Xử lý từng ngày trong tuần sau
      for (const dateStr of days) {
        const currentType = availability[dateStr];
        const oldType = initialAvailability[dateStr];

        if (currentType) {
          // Lưu hoặc cập nhật
          const note = (currentType === 'option' || currentType === 'off') ? (noteInputs[dateStr] || '') : '';
          await upsertAvailability(employee.id, dateStr, currentType, note);
        } else if (oldType) {
          // Nếu bỏ chọn ngày đã lưu trước đó -> Xóa khỏi database
          await deleteAvailability(employee.id, dateStr);
        }
      }

      toast.success('ĐÃ CHỐT ĐĂNG KÝ!', `Lịch rảnh ${weekType === 'next' ? 'tuần sau' : 'tuần này'} đã được lưu thành công`);
      setInitialAvailability({ ...availability });
      setHasChanges(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu lịch đăng ký. Vui lòng thử lại.');
    }
    setSubmitting(false);
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  function getWeekLabel() {
    const start = new Date(days[0] + 'T00:00:00');
    const end = new Date(days[6] + 'T00:00:00');
    return `${start.getDate()}/${start.getMonth() + 1} — ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
  }

  if (loading) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Đang tải lịch tuần sau...</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-3xl p-5 md:p-7 space-y-6 shadow-2xl">
      {/* Header */}
      <div className="border-b border-[rgba(255,255,255,0.08)] pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-black text-lg md:text-2xl flex items-center gap-2 text-white">
            <span className="text-2xl">✋</span> Đăng Ký Lịch Rảnh
          </h3>

          {/* Tab chọn Tuần Này vs Tuần Sau */}
          <div className="flex bg-[var(--color-surface-2)] p-1 rounded-2xl border border-[rgba(255,255,255,0.08)]">
            <button
              type="button"
              onClick={() => setWeekType('this')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                weekType === 'this'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              ⚡ Tuần Này
            </button>
            <button
              type="button"
              onClick={() => setWeekType('next')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                weekType === 'next'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              🚀 Tuần Sau
            </button>
          </div>
        </div>

        <p className="text-xs md:text-sm text-[var(--color-text-secondary)] font-semibold">
          📅 Đăng ký cho tuần: <span className="text-amber-400 font-extrabold">{getWeekLabel()}</span> ({weekType === 'next' ? 'Chốt lịch tuần sau' : 'Bổ sung lịch tuần này'})
        </p>
      </div>

      {/* Days Grid */}
      <div className="space-y-3.5">
        {days.map((dateStr, idx) => {
          const status = availability[dateStr]; // 'full' | 'option' | 'off' | undefined

          return (
            <div
              key={dateStr}
              className={`rounded-2xl p-4 border transition-all shadow-md ${
                status === 'full'
                  ? 'border-emerald-500/80 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : status === 'option'
                  ? 'border-amber-500/80 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                  : status === 'off'
                  ? 'border-rose-500/80 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
                  : 'border-[rgba(255,255,255,0.08)] bg-[var(--color-surface-1)]'
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-black text-base md:text-lg text-white">
                    {DAY_NAMES[idx]}
                  </span>
                  <span className="text-xs md:text-sm text-amber-400/90 font-extrabold">
                    ({formatDateLabel(dateStr)})
                  </span>
                </div>
                {status && (
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-white/10 text-white border border-white/20">
                    {status === 'full' && '💪 Chọn Cả Ngày'}
                    {status === 'option' && '📝 Chọn Tùy Chọn Ca'}
                    {status === 'off' && '🛑 Chọn Xin Nghỉ'}
                  </span>
                )}
              </div>

              {/* 3 Nút chọn lớn rõ ràng cho Mobile */}
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'full')}
                  className={`py-3 px-2 rounded-2xl font-black text-xs md:text-sm cursor-pointer border-2 transition-all active:scale-95 shadow-sm ${
                    status === 'full'
                      ? 'border-emerald-400 bg-gradient-to-tr from-emerald-500 to-teal-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                      : 'border-[rgba(255,255,255,0.08)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:border-emerald-500/50 hover:text-white'
                  }`}
                >
                  {status === 'full' ? '✅ Cả ngày' : '💪 Cả ngày'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'option')}
                  className={`py-3 px-2 rounded-2xl font-black text-xs md:text-sm cursor-pointer border-2 transition-all active:scale-95 shadow-sm ${
                    status === 'option'
                      ? 'border-amber-400 bg-gradient-to-tr from-amber-400 to-yellow-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : 'border-[rgba(255,255,255,0.08)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:border-amber-500/50 hover:text-white'
                  }`}
                >
                  {status === 'option' ? '✅ Tùy chọn ca' : '📝 Tùy chọn ca'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'off')}
                  className={`py-3 px-2 rounded-2xl font-black text-xs md:text-sm cursor-pointer border-2 transition-all active:scale-95 shadow-sm ${
                    status === 'off'
                      ? 'border-rose-400 bg-gradient-to-tr from-rose-500 to-red-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                      : 'border-[rgba(255,255,255,0.08)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:border-rose-500/50 hover:text-white'
                  }`}
                >
                  {status === 'off' ? '✅ Xin nghỉ' : '🛑 Xin nghỉ'}
                </button>
              </div>

              {/* Ô ghi chú nếu chọn Tùy chọn ca hoặc Xin nghỉ */}
              {(status === 'option' || status === 'off') && (
                <div className="mt-3 animate-fade-in">
                  <textarea
                    value={noteInputs[dateStr] || ''}
                    onChange={(e) => handleNoteChange(dateStr, e.target.value)}
                    placeholder={
                      status === 'off'
                        ? 'Lý do xin nghỉ (ví dụ: bận việc nhà, thi học kì...)'
                        : 'Ghi chú thời gian làm (ví dụ: rảnh sáng 8-12h, hoặc làm từ 13h...)'
                    }
                    rows={2}
                    className="w-full px-4 py-2.5 bg-[var(--color-surface-1)] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-xs md:text-sm focus:border-amber-400 outline-none transition-all resize-none placeholder:text-[var(--color-text-muted)]"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút XÁC NHẬN ĐĂNG KÝ to chốt lịch */}
      <div className="pt-4 border-t border-[rgba(255,255,255,0.08)]">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full py-4.5 rounded-3xl font-black text-base md:text-xl border-0 cursor-pointer shadow-2xl transition-all active:scale-95 ${
            hasChanges
              ? 'btn-gradient btn-shine text-white animate-pulse'
              : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_25px_rgba(16,185,129,0.3)]'
          }`}
        >
          {submitting
            ? '⏳ Đang chốt lịch...'
            : hasChanges
            ? '🚀 XÁC NHẬN ĐĂNG KÝ TUẦN SAU'
            : '✅ ĐÃ CHỐT ĐĂNG KÝ (Bấm để cập nhật)'}
        </button>
      </div>
    </div>
  );
}

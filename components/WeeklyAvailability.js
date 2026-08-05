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
      <div className="bg-white rounded-2xl p-6 text-center border border-purple-200 shadow-2xs">
        <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-purple-700 font-bold">Đang tải lịch tuần sau...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 space-y-5 border border-purple-200/90 shadow-2xs">
      {/* Header */}
      <div className="border-b border-purple-100 pb-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-black text-lg sm:text-xl flex items-center gap-2 text-purple-950 tracking-tight">
            <span className="text-xl">✋</span> Đăng Ký Lịch Làm
          </h3>

          {/* Tab chọn Tuần Này vs Tuần Sau */}
          <div className="flex bg-purple-100/70 p-1 rounded-xl border border-purple-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setWeekType('this')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${weekType === 'this'
                  ? 'bg-purple-700 text-white shadow-2xs font-black'
                  : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
            >
              ⚡ Tuần Này
            </button>
            <button
              type="button"
              onClick={() => setWeekType('next')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${weekType === 'next'
                  ? 'bg-purple-700 text-white shadow-2xs font-black'
                  : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
            >
              🚀 Tuần Sau
            </button>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-purple-800 font-bold">
          📅 Đăng ký cho tuần: <span className="text-purple-950 font-black">{getWeekLabel()}</span> ({weekType === 'next' ? 'Chốt lịch tuần sau' : 'Bổ sung lịch tuần này'})
        </p>
      </div>

      {/* Days Grid */}
      <div className="space-y-3">
        {days.map((dateStr, idx) => {
          const status = availability[dateStr]; // 'full' | 'option' | 'off' | undefined

          return (
            <div
              key={dateStr}
              className={`rounded-2xl p-3.5 sm:p-4 border transition-all ${status === 'full'
                  ? 'border-emerald-300 bg-emerald-50/90 shadow-2xs'
                  : status === 'option'
                    ? 'border-purple-300 bg-purple-50/90 shadow-2xs'
                    : status === 'off'
                      ? 'border-rose-300 bg-rose-50/90 shadow-2xs'
                      : 'border-purple-100 bg-purple-50/30'
                }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-black text-base sm:text-lg text-purple-950">
                    {DAY_NAMES[idx]}
                  </span>
                  <span className="text-xs sm:text-sm text-purple-800 font-black">
                    ({formatDateLabel(dateStr)})
                  </span>
                </div>
                {status && (
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white text-purple-950 border border-purple-200 shadow-2xs">
                    {status === 'full' && '💪 Chọn Cả Ngày'}
                    {status === 'option' && '📝 Chọn Tùy Ca'}
                    {status === 'off' && '🛑 Chọn Xin Nghỉ'}
                  </span>
                )}
              </div>

              {/* 3 Nút chọn lớn rõ ràng */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'full')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm cursor-pointer border transition-all active:scale-95 shadow-2xs ${status === 'full'
                      ? 'border-emerald-600 bg-emerald-700 text-white font-black'
                      : 'border-purple-200 bg-white text-purple-950 hover:bg-emerald-50 font-bold'
                    }`}
                >
                  {status === 'full' ? '✅ Cả ngày' : '💪 Cả ngày'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'option')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm cursor-pointer border transition-all active:scale-95 shadow-2xs ${status === 'option'
                      ? 'border-purple-600 bg-purple-700 text-white font-black'
                      : 'border-purple-200 bg-white text-purple-950 hover:bg-purple-50 font-bold'
                    }`}
                >
                  {status === 'option' ? '✅ Tùy ca' : '📝 Tùy ca'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelect(dateStr, 'off')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm cursor-pointer border transition-all active:scale-95 shadow-2xs ${status === 'off'
                      ? 'border-rose-600 bg-rose-600 text-white font-black'
                      : 'border-purple-200 bg-white text-purple-950 hover:bg-rose-50 font-bold'
                    }`}
                >
                  {status === 'off' ? '✅ Xin nghỉ' : '🛑 Xin nghỉ'}
                </button>
              </div>

              {/* Ô ghi chú nếu chọn Tùy chọn ca hoặc Xin nghỉ */}
              {(status === 'option' || status === 'off') && (
                <div className="mt-2.5 animate-fade-in">
                  <textarea
                    value={noteInputs[dateStr] || ''}
                    onChange={(e) => handleNoteChange(dateStr, e.target.value)}
                    placeholder={
                      status === 'off'
                        ? 'Lý do xin nghỉ (ví dụ: bận việc nhà, thi học kì...)'
                        : 'Ghi chú thời gian làm (ví dụ: rảnh sáng 8-12h, hoặc làm từ 13h...)'
                    }
                    rows={2}
                    className="w-full px-3.5 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm focus:border-purple-600 outline-none transition-all resize-none placeholder:text-purple-400 font-bold"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút XÁC NHẬN ĐĂNG KÝ */}
      <div className="pt-2 border-t border-purple-100">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`w-full py-3.5 rounded-xl font-black text-sm sm:text-base border-0 cursor-pointer shadow-xs transition-all active:scale-95 ${hasChanges
              ? 'bg-purple-700 hover:bg-purple-800 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
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

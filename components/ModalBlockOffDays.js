'use client';

import { useState, useEffect } from 'react';
import { getBlockedOffDays, saveBlockedOffDays } from '@/lib/supabase';

const DAYS_OPTIONS = [
  { dayIndex: 1, label: 'Thứ 2' },
  { dayIndex: 2, label: 'Thứ 3' },
  { dayIndex: 3, label: 'Thứ 4' },
  { dayIndex: 4, label: 'Thứ 5' },
  { dayIndex: 5, label: 'Thứ 6' },
  { dayIndex: 6, label: 'Thứ 7' },
  { dayIndex: 0, label: 'Chủ Nhật' },
];

export default function ModalBlockOffDays({ isOpen, onClose, toast, onSaved }) {
  const [selectedDays, setSelectedDays] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  async function loadSettings() {
    try {
      const days = await getBlockedOffDays();
      setSelectedDays(days || []);
    } catch (err) {
      console.error(err);
    }
  }

  function toggleDay(dayIndex) {
    setSelectedDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveBlockedOffDays(selectedDays);
      if (toast) toast.success('Đã lưu quy định!', 'Đã cập nhật danh sách các ngày cấm nhân viên xin nghỉ!');
      if (onSaved) onSaved(selectedDays);
      onClose();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể lưu quy định cấm xin nghỉ');
    }
    setSaving(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-purple-200/90 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-purple-950 tracking-tight flex items-center gap-2">
              <span>🚫</span> Quy Định Cấm Xin Nghỉ
            </h3>
            <p className="text-xs text-purple-700 font-bold mt-0.5">
              Chọn các ngày cao điểm trong tuần mà nhân viên KHÔNG ĐƯỢC phép đăng ký Off.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black flex items-center justify-center hover:bg-purple-200 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* List các thứ trong tuần */}
        <div className="space-y-2">
          <label className="text-xs font-black text-purple-950 block uppercase tracking-wider">
            Chọn Ngày Cấm Xin Nghỉ (Bấm để bật/tắt):
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DAYS_OPTIONS.map((item) => {
              const isBlocked = selectedDays.includes(item.dayIndex);
              return (
                <button
                  key={item.dayIndex}
                  type="button"
                  onClick={() => toggleDay(item.dayIndex)}
                  className={`py-2.5 px-3 rounded-2xl font-black text-xs border transition-all cursor-pointer shadow-2xs flex items-center justify-between ${
                    isBlocked
                      ? 'bg-rose-700 text-white border-rose-800 shadow-md font-black animate-pulse'
                      : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200 font-bold'
                  }`}
                >
                  <span>{item.label}</span>
                  <span>{isBlocked ? '🚫 Cấm' : '✅ Cho phép'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chú thích thông báo */}
        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-purple-900 font-extrabold space-y-1">
          <p className="flex items-center gap-1.5 text-amber-950 font-black">
            <span>💡</span> Lưu ý quy định:
          </p>
          <p className="text-[11px] leading-relaxed text-purple-800">
            Khi chọn ngày cấm nghỉ (ví dụ Thứ 2), nút <span className="font-black text-rose-700">"🛑 Xin nghỉ"</span> của Thứ 2 bên phía nhân viên sẽ bị tắt khóa hoàn toàn!
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-2 pt-2 border-t border-purple-100">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-purple-100 text-purple-900 font-black text-xs cursor-pointer border-0"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer border-0 shadow-2xs"
          >
            {saving ? '⏳ Đang lưu...' : '✅ Lưu Quy Định'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { updateEmployeesSortOrders } from '@/lib/supabase';

export default function ModalSortEmployees({ isOpen, onClose, employees = [], onSaveSuccess }) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (employees && employees.length > 0) {
      // Sắp xếp danh sách nhân viên 100% theo sort_order của Supabase DB
      const sorted = [...employees].sort((a, b) => {
        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      setItems(sorted);
    }
  }, [employees, isOpen]);

  if (!isOpen) return null;

  // Di chuyển nhân viên lên 1 nấc
  function moveUp(index) {
    if (index === 0) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    setItems(newItems);
  }

  // Di chuyển nhân viên xuống 1 nấc
  function moveDown(index) {
    if (index === items.length - 1) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    setItems(newItems);
  }

  // Lưu thứ tự hiển thị mới lên Supabase Database 100%
  async function handleSave() {
    setSaving(true);
    try {
      const orders = items.map((emp, idx) => ({
        id: emp.id,
        sort_order: idx + 1,
      }));

      // Cập nhật 100% trực tiếp lên Supabase Database
      await updateEmployeesSortOrders(orders);

      if (onSaveSuccess) onSaveSuccess(items);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Không thể lưu thứ tự nhân viên lên Supabase. Vui lòng kiểm tra lại kết nối!');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl p-5 md:p-6 w-full max-w-lg border border-purple-200 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div>
            <h3 className="font-black text-lg text-purple-950 flex items-center gap-2">
              <span>↕️</span> Sắp Xếp Thứ Tự Nhân Viên
            </h3>
            <p className="text-xs text-purple-700 font-bold mt-0.5">
              Di chuyển để sắp xếp những người làm cùng chi nhánh gần nhau trên Bảng Lịch
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center cursor-pointer border-0"
          >
            ✕
          </button>
        </div>

        {/* Danh Sách Nhân Viên Cho Phép Di Chuyển Lên / Xuống */}
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {items.map((emp, index) => (
            <div
              key={emp.id}
              className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-center justify-between gap-3 shadow-2xs hover:bg-purple-100/60 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 h-6 rounded-full bg-purple-700 text-white font-black text-xs flex items-center justify-center shrink-0">
                  #{index + 1}
                </span>
                <span className="font-black text-sm text-purple-950 truncate">{emp.name}</span>
              </div>

              {/* Nút di chuyển lên / xuống */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className={`w-8 h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === 0
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Di chuyển lên"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === items.length - 1}
                  className={`w-8 h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === items.length - 1
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Di chuyển xuống"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer border-0"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer shadow-md border-0 transition-all active:scale-95"
          >
            {saving ? '⏳ Đang Lưu...' : '💾 LƯU THỨ TỰ BẢNG'}
          </button>
        </div>
      </div>
    </div>
  );
}

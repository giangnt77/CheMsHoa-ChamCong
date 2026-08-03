'use client';

import { useState } from 'react';

/**
 * ModalXepLichQuick — Pop-up gán/chỉnh sửa giờ làm cho nhân viên trực tiếp và tiện lợi.
 * Cho phép tùy chỉnh giờ bắt đầu (HH:mm) và giờ kết thúc (HH:mm) tự do hoàn toàn.
 */
export default function ModalXepLichQuick({
  isOpen,
  onClose,
  date,
  branch,
  employees,
  availabilities,
  daySchedule,
  onSave,
  editItem = null, // Nếu editItem != null -> Chế độ chỉnh sửa ca làm đã có
}) {
  const isEditing = !!editItem;

  // Selected values
  const [selectedEmpId, setSelectedEmpId] = useState(
    editItem ? editItem.employee_id : ''
  );
  const [startTime, setStartTime] = useState(
    editItem?.start_time ? editItem.start_time.slice(0, 5) : '09:00'
  );
  const [endTime, setEndTime] = useState(
    editItem?.end_time ? editItem.end_time.slice(0, 5) : '14:00'
  );
  const [note, setNote] = useState(editItem?.note || '');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  // Tính số giờ
  function calcHours(st, et) {
    if (!st || !et || st === et) return 0;
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    let h = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (h < 0) h += 24;
    return Math.round(h * 100) / 100;
  }

  const hours = calcHours(startTime, endTime);

  // Group nhân viên theo đăng ký rảnh ngày đó
  const registeredEmps = availabilities.filter((a) => a.type !== 'off');
  const offEmps = availabilities.filter((a) => a.type === 'off');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedEmpId) return;
    setSubmitting(true);

    await onSave({
      employeeId: selectedEmpId,
      branchId: branch.id,
      date,
      startTime,
      endTime,
      hours,
      note,
    });

    setSubmitting(false);
    onClose();
  }

  // Quick preset buttons (bấm điền nhanh giờ nhưng vẫn chỉnh tùy ý được)
  function applyPreset(st, et) {
    setStartTime(st);
    setEndTime(et);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="glass rounded-3xl p-6 max-w-md w-full border border-[var(--color-glass-border)] shadow-2xl relative">
        {/* Title */}
        <div className="flex items-center justify-between mb-4 border-b border-[var(--color-glass-border)] pb-3">
          <div>
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <span>{isEditing ? '✏️ Sửa Lịch Làm' : '➕ Xếp Lịch Nhân Viên'}</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              CN <span className="font-bold text-amber-400">{branch?.name}</span> • Ngày <span className="font-bold text-white">{date.split('-').reverse().join('/')}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white flex items-center justify-center border-0 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Chọn nhân viên */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-1.5">
              Nhân viên
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[var(--color-surface-2)] border border-[var(--color-glass-border)] rounded-xl text-white text-base font-bold outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="" disabled className="text-amber-400 font-bold">-- Bấm để chọn nhân viên --</option>

              {/* Nhóm 1: Nhân viên ĐÃ ĐĂNG KÝ LÀM */}
              {registeredEmps.length > 0 && (
                <option disabled className="bg-[var(--color-surface-3)] text-amber-400 font-bold py-1">
                  ─── ✨ NHÂN VIÊN ĐÃ ĐĂNG KÝ LÀM ───
                </option>
              )}
              {registeredEmps.map((a) => (
                <option key={a.employee_id} value={a.employee_id} className="text-white font-bold bg-[#1a1a2e]">
                  ✅ {a.employees?.name} ({a.type === 'full' ? 'Làm Cả Ngày' : `Tùy chọn: ${a.note || 'Ca linh hoạt'}`})
                </option>
              ))}

              {/* Nhóm 2: Nhân viên CHƯA ĐĂNG KÝ hoặc XIN NGHỈ */}
              <option disabled className="bg-[var(--color-surface-3)] text-amber-400 font-bold py-1">
                ─── 👥 NHÂN VIÊN CHƯA ĐĂNG KÝ / XIN NGHỈ ───
              </option>
              {employees
                .filter((e) => !registeredEmps.some((r) => r.employee_id === e.id))
                .map((e) => {
                  const isOff = offEmps.some((o) => o.employee_id === e.id);
                  return (
                    <option key={e.id} value={e.id} className="text-white font-bold bg-[#1a1a2e]">
                      {isOff ? `🛑 ${e.name} (Xin Nghỉ)` : `👤 ${e.name} (Chưa đăng ký ca)`}
                    </option>
                  );
                })}
            </select>

            {/* Hộp Thông Tin & Ghi Chú Đăng Ký Của Nhân Viên Được Chọn */}
            {selectedEmpId && (() => {
              const avail = availabilities.find((a) => a.employee_id === selectedEmpId);
              if (!avail) {
                return (
                  <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-bold flex items-center gap-2">
                    <span>⚠️</span> Nhân viên này CHƯA ĐĂNG KÝ ca làm ngày này.
                  </div>
                );
              }
              return (
                <div
                  className={`mt-2.5 p-3.5 rounded-2xl border text-xs font-bold shadow-md animate-fade-in ${
                    avail.type === 'full'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : avail.type === 'off'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-sm">
                    {avail.type === 'full' && <span>💪 Đã đăng ký: LÀM CẢ NGÀY</span>}
                    {avail.type === 'option' && <span>📝 Đã đăng ký: TÙY CHỌN CA LINH HOẠT</span>}
                    {avail.type === 'off' && <span>🛑 Đã đăng ký: XIN NGHỈ</span>}
                  </div>
                  {avail.note ? (
                    <div className="mt-2 text-xs text-white font-semibold bg-black/40 p-2.5 rounded-xl border border-white/10 flex items-start gap-1.5 leading-relaxed">
                      <span>💬</span>
                      <div>
                        <span className="text-amber-300 font-bold block">Ghi chú giờ làm của NV:</span>
                        &quot;{avail.note}&quot;
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] opacity-80">
                      (Không có ghi chú thêm)
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Gợi ý điền nhanh mốc giờ */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase mb-1.5">
              Gợi ý mốc ca (bấm để chọn nhanh):
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('09:00', '14:00')}
                className="py-1.5 px-1 bg-[var(--color-surface-2)] hover:bg-amber-500/20 text-xs font-semibold rounded-lg text-amber-300 border border-[var(--color-glass-border)] cursor-pointer"
              >
                Sáng (9-14h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('14:00', '18:00')}
                className="py-1.5 px-1 bg-[var(--color-surface-2)] hover:bg-amber-500/20 text-xs font-semibold rounded-lg text-amber-300 border border-[var(--color-glass-border)] cursor-pointer"
              >
                Chiều (14-18h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('18:00', '22:00')}
                className="py-1.5 px-1 bg-[var(--color-surface-2)] hover:bg-amber-500/20 text-xs font-semibold rounded-lg text-amber-300 border border-[var(--color-glass-border)] cursor-pointer"
              >
                Tối (18-22h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('09:00', '22:00')}
                className="py-1.5 px-1 bg-[var(--color-surface-2)] hover:bg-amber-500/20 text-xs font-semibold rounded-lg text-amber-300 border border-[var(--color-glass-border)] cursor-pointer"
              >
                Cả ngày (9-22h)
              </button>
            </div>
          </div>

          {/* TÙY CHỈNH GIỜ TỰ DO HOÀN TOÀN */}
          <div className="grid grid-cols-2 gap-3 bg-[var(--color-surface-1)] p-3 rounded-2xl border border-[var(--color-glass-border)]">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-1">
                Giờ vào (Bắt đầu)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--color-surface-2)] border border-[var(--color-glass-border)] rounded-xl text-white text-base font-bold text-center outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-secondary)] mb-1">
                Giờ ra (Kết thúc)
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--color-surface-2)] border border-[var(--color-glass-border)] rounded-xl text-white text-base font-bold text-center outline-none focus:border-amber-500"
              />
            </div>
            <div className="col-span-2 text-center text-xs text-amber-400 font-bold pt-1">
              ⏱️ Tổng thời gian: <span className="text-base text-white">{hours} giờ</span>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-1">
              Ghi chú (tùy chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Phụ bếp, Trực quầy..."
              className="w-full px-4 py-2.5 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] font-bold text-sm cursor-pointer border-0"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedEmpId}
              className="flex-1 py-3 rounded-xl btn-gradient text-white font-extrabold text-sm cursor-pointer border-0 shadow-lg"
            >
              {submitting ? '⏳ Đang lưu...' : isEditing ? '✅ Cập Nhật Giờ' : '✅ Phân Công Ca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

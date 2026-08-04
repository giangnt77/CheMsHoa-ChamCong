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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="glass rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col border border-[var(--color-glass-border)] shadow-2xl overflow-hidden relative">
        {/* Header Cố Định Nổi Bật Nút X */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-glass-border)] bg-[var(--color-surface-1)] flex-shrink-0 z-20">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-extrabold text-base text-white truncate flex items-center gap-1.5">
              <span>{isEditing ? '✏️ Sửa Lịch Làm' : '➕ Xếp Lịch Nhân Viên'}</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
              CN <span className="font-bold text-amber-400">{branch?.name}</span> • Ngày <span className="font-bold text-white">{date.split('-').reverse().join('/')}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white border border-rose-500/40 flex items-center justify-center cursor-pointer text-base font-black transition-all flex-shrink-0 active:scale-90"
            title="Tắt hộp thoại"
          >
            ✕
          </button>
        </div>

        {/* Nội dung cuộn mượt không bao giờ tràn màn hình */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-5 flex-1 space-y-4">
          {/* Chọn nhân viên */}
          <div>
            <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-1.5">
              Nhân viên
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-[var(--color-surface-2)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm font-bold outline-none focus:border-amber-500 cursor-pointer"
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
                  className={`mt-2.5 p-3.5 rounded-2xl border text-xs font-bold shadow-md animate-fade-in ${avail.type === 'full'
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('07:30', '14:30')}
                className="py-1.5 px-1 bg-amber-500/20 hover:bg-amber-500/30 text-xs font-bold rounded-lg text-amber-300 border border-amber-500/30 cursor-pointer"
              >
                🍳 Bếp 7:30-14:30
              </button>
              <button
                type="button"
                onClick={() => applyPreset('07:30', '17:30')}
                className="py-1.5 px-1 bg-amber-500/20 hover:bg-amber-500/30 text-xs font-bold rounded-lg text-amber-300 border border-amber-500/30 cursor-pointer"
              >
                🍳 Bếp 7:30-17:30
              </button>
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

          {/* BỘ CHỌN GIỜ 24H DỄ BẤM 1 CHẠM */}
          <div className="bg-[var(--color-surface-1)] p-3.5 rounded-2xl border border-[var(--color-glass-border)] space-y-3">
            {/* Hàng chọn Giờ vào */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <span>🟢 Giờ vào:</span>
                  <span className="text-sm font-black text-white bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                    {startTime}
                  </span>
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-2 py-0.5 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white text-xs font-bold outline-none"
                  title="Nhập giờ thủ công nếu cần"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['07:30', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '14:30', '15:00', '16:00', '17:00', '17:30', '18:00', '19:00', '20:00'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStartTime(t)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black cursor-pointer border transition-all active:scale-95 ${startTime === t
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] scale-105'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[rgba(255,255,255,0.06)] hover:text-white'
                      }`}
                  >
                    {t.includes(':30') ? t : `${parseInt(t)}h`}
                  </button>
                ))}
              </div>
            </div>

            {/* Hàng chọn Giờ ra */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1">
                  <span>🔴 Giờ ra:</span>
                  <span className="text-sm font-black text-white bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/30">
                    {endTime}
                  </span>
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-2 py-0.5 bg-[var(--color-surface-2)] border border-[rgba(255,255,255,0.1)] rounded-lg text-white text-xs font-bold outline-none"
                  title="Nhập giờ thủ công nếu cần"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['13:00', '14:00', '14:30', '15:00', '16:00', '17:00', '17:30', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEndTime(t)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-black cursor-pointer border transition-all active:scale-95 ${endTime === t
                      ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)] scale-105'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[rgba(255,255,255,0.06)] hover:text-white'
                      }`}
                  >
                    {t.includes(':30') ? t : `${parseInt(t)}h`}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center text-xs text-amber-400 font-bold pt-2 border-t border-[rgba(255,255,255,0.06)]">
              ⏱️ Số giờ tự tính: <span className="text-base font-black text-white">{hours} tiếng</span>
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

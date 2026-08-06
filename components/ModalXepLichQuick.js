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
  branches = [],
  employees,
  availabilities,
  daySchedule,
  onSave,
  onDelete,
  editItem = null, // Nếu editItem != null -> Chế độ chỉnh sửa ca làm đã có
  initialEmployee = null,
}) {
  const isEditing = !!editItem;

  // Selected values
  const [selectedEmpId, setSelectedEmpId] = useState(
    editItem ? editItem.employee_id : (initialEmployee ? initialEmployee.id : '')
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    editItem ? editItem.branch_id : (branch?.id || (branches[0]?.id || ''))
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
      branchId: selectedBranchId,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/40 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col border border-purple-200 shadow-2xl overflow-hidden relative">
        {/* Header Cố Định Nổi Bật Nút X */}
        <div className="flex items-center justify-between p-4 border-b border-purple-200 bg-purple-100/90 flex-shrink-0 z-20">
          <div className="min-w-0 flex-1 pr-2">
            <h3 className="font-black text-base text-purple-950 truncate flex items-center gap-1.5">
              <span>{isEditing ? '✏️ Sửa Lịch Làm' : '➕ Xếp Lịch Nhân Viên'}</span>
            </h3>
            <p className="text-xs text-purple-800 font-extrabold mt-0.5 truncate">
              CN <span className="font-black text-purple-950">{branch?.name}</span> • Ngày <span className="font-black text-purple-950">{date.split('-').reverse().join('/')}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 flex items-center justify-center cursor-pointer text-sm font-black transition-all flex-shrink-0 active:scale-90"
            title="Tắt hộp thoại"
          >
            ✕
          </button>
        </div>

        {/* Nội dung cuộn mượt không bao giờ tràn màn hình */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-4 sm:p-5 flex-1 space-y-4 custom-scrollbar">
          {/* Chọn chi nhánh */}
          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
                🏢 Chi Nhánh Phân Công
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-sm font-black outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="text-purple-950 font-bold bg-white">
                    🏢 CHI NHÁNH {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Chọn nhân viên */}
          <div>
            <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
              Nhân viên
            </label>
            <select
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 text-sm font-black outline-none focus:border-purple-600 cursor-pointer shadow-2xs"
            >
              <option value="" disabled className="text-purple-600 font-bold">-- Bấm để chọn nhân viên --</option>

              {/* Nhóm 1: Nhân viên ĐÃ ĐĂNG KÝ LÀM */}
              {registeredEmps.length > 0 && (
                <option disabled className="bg-purple-100 text-purple-950 font-black py-1">
                  ─── ✨ NHÂN VIÊN ĐÃ ĐĂNG KÝ LÀM ───
                </option>
              )}
              {registeredEmps.map((a) => (
                <option key={a.employee_id} value={a.employee_id} className="text-purple-950 font-bold bg-white">
                  ✅ {a.employees?.name} ({a.type === 'full' ? 'Làm Cả Ngày' : `Tùy chọn: ${a.note || 'Ca linh hoạt'}`})
                </option>
              ))}

              {/* Nhóm 2: Nhân viên CHƯA ĐĂNG KÝ hoặc XIN NGHỈ */}
              <option disabled className="bg-purple-100 text-purple-950 font-black py-1">
                ─── 👥 NHÂN VIÊN CHƯA ĐĂNG KÝ / XIN NGHỈ ───
              </option>
              {employees
                .filter((e) => !registeredEmps.some((r) => r.employee_id === e.id))
                .map((e) => {
                  const isOff = offEmps.some((o) => o.employee_id === e.id);
                  return (
                    <option key={e.id} value={e.id} className="text-purple-950 font-bold bg-white">
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
                  <div className="mt-2.5 p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-950 font-black flex items-center gap-2 shadow-2xs">
                    <span>⚠️</span> Nhân viên này CHƯA ĐĂNG KÝ ca làm ngày này.
                  </div>
                );
              }
              return (
                <div
                  className={`mt-2.5 p-3.5 rounded-2xl border text-xs font-extrabold shadow-2xs animate-fade-in ${avail.type === 'full'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : avail.type === 'off'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-purple-50 border-purple-300 text-purple-950'
                    }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm">
                    {avail.type === 'full' && <span>💪 Đã đăng ký: LÀM CẢ NGÀY</span>}
                    {avail.type === 'option' && <span>📝 Đã đăng ký: TÙY CHỌN CA LINH HOẠT</span>}
                    {avail.type === 'off' && <span>🛑 Đã đăng ký: XIN NGHỈ</span>}
                  </div>
                  {avail.note ? (
                    <div className="mt-2 text-xs text-purple-950 font-bold bg-white p-2.5 rounded-xl border border-purple-200 flex items-start gap-1.5 leading-relaxed">
                      <span>💬</span>
                      <div>
                        <span className="text-purple-700 font-black block">Ghi chú giờ làm của NV:</span>
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
            <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
              Gợi ý mốc ca (bấm để chọn nhanh):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('07:30', '14:30')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                🍳 Bếp 7:30-14:30
              </button>
              <button
                type="button"
                onClick={() => applyPreset('07:30', '17:30')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                🍳 Bếp 7:30-17:30
              </button>
              <button
                type="button"
                onClick={() => applyPreset('09:00', '14:00')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                Sáng (9-14h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('14:00', '18:00')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                Chiều (14-18h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('18:00', '22:00')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                Tối (18-22h)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('09:00', '22:00')}
                className="py-1.5 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs"
              >
                Cả ngày (9-22h)
              </button>
            </div>
          </div>

          {/* BỘ CHỌN GIỜ 24H DỄ BẤM 1 CHẠM */}
          <div className="bg-purple-50/60 p-3.5 rounded-2xl border border-purple-200/80 space-y-3">
            {/* Hàng chọn Giờ vào */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black text-emerald-800 flex items-center gap-1">
                  <span>🟢 Giờ vào:</span>
                  <span className="text-xs font-black text-white bg-emerald-600 px-2 py-0.5 rounded-lg">
                    {startTime}
                  </span>
                </span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-2 py-0.5 bg-white border border-purple-200 rounded-lg text-purple-950 text-xs font-bold outline-none"
                  title="Nhập giờ thủ công nếu cần"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['07:30', '08:30', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '14:30', '15:00', '16:00', '17:00', '17:30', '18:00', '19:00', '20:00'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStartTime(t)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black cursor-pointer border transition-all active:scale-95 shadow-2xs ${startTime === t
                      ? 'bg-emerald-600 text-white border-emerald-600 scale-105 font-black'
                      : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
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
                <span className="text-xs font-black text-rose-800 flex items-center gap-1">
                  <span>🔴 Giờ ra:</span>
                  <span className="text-xs font-black text-white bg-rose-600 px-2 py-0.5 rounded-lg">
                    {endTime}
                  </span>
                </span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="px-2 py-0.5 bg-white border border-purple-200 rounded-lg text-purple-950 text-xs font-bold outline-none"
                  title="Nhập giờ thủ công nếu cần"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['13:00', '14:00', '14:30', '15:00', '16:00', '17:00', '17:30', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEndTime(t)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black cursor-pointer border transition-all active:scale-95 shadow-2xs ${endTime === t
                      ? 'bg-rose-600 text-white border-rose-600 scale-105 font-black'
                      : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                      }`}
                  >
                    {t.includes(':30') ? t : `${parseInt(t)}h`}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center text-xs text-purple-900 font-extrabold pt-2 border-t border-purple-200/80">
              ⏱️ Số giờ tự tính: <span className="text-sm font-black text-purple-950">{hours} tiếng</span>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-black text-purple-900 uppercase mb-1">
              Ghi chú (tùy chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Phụ bếp, Trực quầy..."
              className="w-full px-3.5 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600 placeholder:text-purple-400"
            />
          </div>

          {/* Submit & Apply Whole Week & Delete */}
          <div className="pt-2 space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-3 rounded-xl bg-purple-100 text-purple-900 font-black text-xs cursor-pointer border-0"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedEmpId}
                className="flex-1 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer border-0 shadow-2xs"
              >
                {submitting ? '⏳ Đang lưu...' : isEditing ? '✅ Cập Nhật Giờ' : '✅ Lưu Ngày Này'}
              </button>
              <button
                type="button"
                disabled={submitting || !selectedEmpId}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!selectedEmpId) return;
                  setSubmitting(true);
                  await onSave({
                    employeeId: selectedEmpId,
                    branchId: selectedBranchId,
                    date,
                    startTime,
                    endTime,
                    hours,
                    note,
                    applyWholeWeek: true,
                  });
                  setSubmitting(false);
                  onClose();
                }}
                className="py-3 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-xs cursor-pointer border border-amber-500/50 shadow-2xs flex items-center gap-1 active:scale-95"
                title="Sao chép ca làm này cho tất cả các ngày từ T2 đến Chủ Nhật trong tuần của nhân viên này"
              >
                <span>📋</span> Copy Cả Tuần
              </button>
            </div>

            {isEditing && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Bạn có chắc muốn xóa ca làm này không? (Trở về OFF)')) {
                    onDelete(editItem.id);
                    onClose();
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-200 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🗑️ XÓA CA NÀY (BÁO OFF)</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

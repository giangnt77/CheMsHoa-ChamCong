'use client';

import { useState, useMemo } from 'react';
import { getBranchColorStyle } from '@/lib/utils';

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

  // States hỗ trợ tìm kiếm và lọc danh sách nhân viên thông minh
  const initialEmpId = editItem ? editItem.employee_id : (initialEmployee ? initialEmployee.id : '');
  const [backupEmpId, setBackupEmpId] = useState(initialEmpId);
  const [searchTerm, setSearchTerm] = useState('');
  const [empFilterTab, setEmpFilterTab] = useState('unassigned'); // 'unassigned': Chưa xếp ca | 'all': Tất cả (Tăng ca)
  const [showAllEmps, setShowAllEmps] = useState(false);

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

  // Lọc danh sách nhân viên thực sự (loại bỏ hoàn toàn Owner / Manager)
  const staffOnlyEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter((e) => {
      if (e.role === 'owner' || e.role === 'manager') return false;
      const nLower = (e.name || '').toLowerCase();
      return (
        !nLower.includes('chủ quán') &&
        !nLower.includes('quản lý') &&
        !nLower.includes('owner') &&
        !nLower.includes('manager')
      );
    });
  }, [employees]);

  // Group nhân viên theo đăng ký rảnh ngày đó (chỉ áp dụng cho nhân viên thực sự)
  const registeredEmps = useMemo(() => {
    const staffIds = new Set(staffOnlyEmployees.map((e) => e.id));
    return availabilities.filter((a) => a.type !== 'off' && staffIds.has(a.employee_id));
  }, [availabilities, staffOnlyEmployees]);

  const offEmps = useMemo(() => {
    const staffIds = new Set(staffOnlyEmployees.map((e) => e.id));
    return availabilities.filter((a) => a.type === 'off' && staffIds.has(a.employee_id));
  }, [availabilities, staffOnlyEmployees]);

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
          {/* Chọn chi nhánh — CÁC Ô TÍCH CHỌN NHANH 1-CHẠM */}
          {branches.length > 0 && (
            <div>
              <label className="block text-xs font-black text-purple-950 uppercase mb-2 flex items-center justify-between">
                <span>🏢 Chi Nhánh Phân Công (Bấm chọn nhanh):</span>
                <span className="text-[11px] text-purple-700 font-extrabold">
                  Đã chọn: {branches.find((b) => b.id === selectedBranchId)?.name || ''}
                </span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {branches.map((b) => {
                  const isSelected = selectedBranchId === b.id;
                  const style = getBranchColorStyle(b.name, b.color);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBranchId(b.id)}
                      className={`py-2.5 px-3 rounded-2xl font-black text-xs border transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1.5 active:scale-95 ${
                        isSelected
                          ? 'bg-purple-900 text-white border-purple-800 shadow-md ring-2 ring-purple-400 scale-[1.02]'
                          : 'bg-purple-50/80 hover:bg-purple-100 text-purple-950 border-purple-200 font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/50 flex-shrink-0 shadow-2xs"
                          style={{ backgroundColor: style.hex }}
                        />
                        <span className="truncate">{b.name}</span>
                      </div>
                      {isSelected ? (
                        <span className="text-amber-300 text-xs">✅</span>
                      ) : (
                        <span className="opacity-0">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black text-purple-950 uppercase">
                👤 Nhân viên phân công:
              </label>
              {selectedEmpId && !showAllEmps ? (
                <button
                  type="button"
                  onClick={() => {
                    setBackupEmpId(selectedEmpId);
                    setShowAllEmps(true);
                  }}
                  className="text-[11px] font-black text-purple-700 hover:text-purple-950 bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                >
                  <span>🔄</span>
                  <span>Đổi NV khác</span>
                </button>
              ) : backupEmpId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmpId(backupEmpId);
                    setShowAllEmps(false);
                  }}
                  className="text-[11px] font-black text-rose-700 hover:text-rose-900 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                  title="Hủy chọn NV mới và giữ lại nhân viên ban đầu"
                >
                  <span>❌</span>
                  <span>Hủy đổi (Giữ {staffOnlyEmployees.find((e) => e.id === backupEmpId)?.name || 'NV cũ'})</span>
                </button>
              ) : null}
            </div>

            {/* THẺ NHÂN VIÊN ĐANG ĐƯỢC CHỌN TRỰC TIẾP TỪ Ô (HIỂN THỊ NỔI BẬT ĐẦU TIÊN ⚡) */}
            {selectedEmpId && !showAllEmps ? (
              <div className="p-3.5 rounded-2xl bg-purple-900 text-white border-2 border-purple-600 shadow-md flex items-center justify-between gap-3 animate-fade-in mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-400 text-purple-950 font-black text-sm flex items-center justify-center flex-shrink-0 shadow-2xs">
                    👤
                  </div>
                  <div className="truncate">
                    <div className="font-black text-sm text-white truncate flex items-center gap-1.5">
                      <span>{staffOnlyEmployees.find((e) => e.id === selectedEmpId)?.name || 'Nhân viên'}</span>
                      <span className="bg-amber-400 text-purple-950 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                        Đang chọn
                      </span>
                    </div>
                    <div className="text-xs font-bold text-amber-300 truncate mt-0.5">
                      {(() => {
                        const avail = availabilities.find((a) => a.employee_id === selectedEmpId);
                        if (!avail) return 'Chưa đăng ký ca';
                        if (avail.type === 'full') return '💪 Đã đăng ký: Làm Cả Ngày';
                        if (avail.type === 'off') return '🛑 Đã đăng ký: Xin Nghỉ';
                        return `📝 Đã đăng ký: Tùy chọn ${avail.note ? `(${avail.note})` : 'ca linh hoạt'}`;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="text-amber-300 font-black text-lg">✓</div>
              </div>
            ) : null}

            {/* DANH SÁCH GỢI Ý CHỌN NHANH ĐƯỢC TỐI ƯU GỌN GÀNG */}
            {(!selectedEmpId || showAllEmps) && (
              <div className="space-y-2">
                {/* Thanh Tìm Kiếm + Bộ Lọc Tab */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="🔍 Tìm tên nhân viên..."
                      className="w-full pl-7 pr-3 py-1.5 bg-purple-50 border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none focus:border-purple-600 placeholder:text-purple-400"
                    />
                    <span className="absolute left-2.5 top-1.5 text-xs text-purple-400">🔍</span>
                  </div>

                  <div className="flex bg-purple-100 p-0.5 rounded-xl border border-purple-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setEmpFilterTab('unassigned')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        empFilterTab === 'unassigned'
                          ? 'bg-purple-900 text-white font-black shadow-2xs'
                          : 'text-purple-950 hover:bg-purple-200 font-bold'
                      }`}
                    >
                      🟢 Chưa có ca
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmpFilterTab('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        empFilterTab === 'all'
                          ? 'bg-purple-900 text-white font-black shadow-2xs'
                          : 'text-purple-950 hover:bg-purple-200 font-bold'
                      }`}
                      title="Xem tất cả nhân viên nếu muốn gán làm thêm ca 2 / tăng ca"
                    >
                      ✨ Làm thêm ca
                    </button>
                  </div>
                </div>

                {/* Danh sách cuộn nhân viên */}
                <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {(() => {
                    // Lọc nhân viên theo tìm kiếm và tab
                    const filteredEmps = staffOnlyEmployees.filter((e) => {
                      if (searchTerm.trim() && !e.name.toLowerCase().includes(searchTerm.toLowerCase().trim())) {
                        return false;
                      }

                      // Kiểm tra xem nhân viên đã có ca làm ngày hôm nay chưa
                      const hasShift = daySchedule.some((s) => s.employee_id === e.id);
                      if (empFilterTab === 'unassigned' && hasShift) {
                        return false; // Chỉ hiển thị những ai chưa có ca
                      }

                      return true;
                    });

                    if (filteredEmps.length === 0) {
                      return (
                        <div className="p-3 text-center text-xs text-purple-800 font-bold bg-purple-50 rounded-xl border border-purple-200">
                          {empFilterTab === 'unassigned'
                            ? '✅ Tất cả nhân viên đã được xếp ca ngày này!'
                            : 'Không tìm thấy nhân viên phù hợp.'}
                        </div>
                      );
                    }

                    return filteredEmps.map((e) => {
                      const isSelected = selectedEmpId === e.id;
                      const hasShift = daySchedule.some((s) => s.employee_id === e.id);
                      const avail = availabilities.find((a) => a.employee_id === e.id);

                      let statusBadge = '🟢 Chưa xếp ca';
                      let badgeStyle = 'bg-purple-100 text-purple-950 border-purple-200';

                      if (hasShift) {
                        statusBadge = '✨ Đã có ca (Làm thêm)';
                        badgeStyle = 'bg-sky-100 text-sky-900 border-sky-300';
                      } else if (avail) {
                        if (avail.type === 'full') {
                          statusBadge = '💪 Đã ĐK: Cả Ngày';
                          badgeStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                        } else if (avail.type === 'off') {
                          statusBadge = '🛑 Đã ĐK: Xin Nghỉ';
                          badgeStyle = 'bg-rose-100 text-rose-900 border-rose-300';
                        } else if (avail.type === 'option') {
                          statusBadge = `📝 Đã ĐK: Tùy ca ${avail.note ? `(${avail.note})` : ''}`;
                          badgeStyle = 'bg-amber-100 text-amber-900 border-amber-300';
                        }
                      }

                      return (
                        <div
                          key={e.id}
                          onClick={() => {
                            setSelectedEmpId(e.id);
                            setShowAllEmps(false);
                          }}
                          className={`p-2.5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-2.5 ${
                            isSelected
                              ? 'bg-purple-900 text-white border-purple-600 shadow-md'
                              : 'bg-purple-50/70 border-purple-200 text-purple-950 hover:bg-purple-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${
                                isSelected ? 'bg-amber-400 text-purple-950' : 'bg-purple-200 text-purple-950'
                              }`}
                            >
                              👤
                            </div>
                            <div className="truncate">
                              <div className={`font-black text-xs sm:text-sm truncate ${isSelected ? 'text-white' : 'text-purple-950'}`}>
                                {e.name}
                              </div>
                              <div className={`text-[10.5px] font-extrabold truncate ${isSelected ? 'text-amber-300' : 'text-purple-700'}`}>
                                {statusBadge}
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                                isSelected
                                  ? 'bg-amber-400 text-purple-950 shadow-2xs scale-110'
                                  : 'border-2 border-purple-300 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Gợi ý điền nhanh mốc giờ */}
          <div>
            <label className="block text-xs font-black text-purple-900 uppercase mb-1.5">
              Gợi ý mốc ca (bấm để chọn nhanh):
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('07:30', '14:30')}
                className="py-2 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                🍳 Bếp 7:30-14:30
              </button>
              <button
                type="button"
                onClick={() => applyPreset('07:30', '17:30')}
                className="py-2 px-1 bg-purple-50 hover:bg-purple-100 text-xs font-black rounded-xl text-purple-950 border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                🍳 Bếp 7:30-17:30
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedEmpId) return;
                  const existingShift = daySchedule.find((s) => s.employee_id === selectedEmpId);
                  if (existingShift && onDelete) {
                    onDelete(existingShift.id);
                    onClose();
                  } else if (editItem && editItem.id && onDelete) {
                    onDelete(editItem.id);
                    onClose();
                  } else {
                    onClose();
                  }
                }}
                className="py-2 px-1 bg-rose-50 hover:bg-rose-100 text-xs font-black rounded-xl text-rose-900 border border-rose-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1"
                title="Gán ca OFF cho nhân viên này (xóa ca nếu có)"
              >
                <span>🛑</span>
                <span>Ca : OFF</span>
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
                {['07:30', '08:30', '09:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((t) => (
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
                {['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'].map((t) => (
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
                className="py-3 px-4 rounded-xl bg-purple-100 text-purple-900 font-black text-xs cursor-pointer border-0"
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

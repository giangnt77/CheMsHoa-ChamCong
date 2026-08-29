'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  onAssignOff,
  onRemoveOff,
  editItem = null, // Nếu editItem != null -> Chế độ chỉnh sửa ca làm đã có
  initialEmployee = null,
  isWeekLocked = false, // CHỈ kích hoạt ghi nhận ca gốc & làm thay khi tuần đã được chốt!
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Tính số giờ (Bắt buộc giờ ra > giờ vào)
  function calcHours(st, et) {
    if (!st || !et || st === et) return 0;
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (endMins <= startMins) return 0;
    const h = (endMins - startMins) / 60;
    return Math.round(h * 100) / 100;
  }

  const hours = calcHours(startTime, endTime);
  const isTimeInvalid = useMemo(() => {
    if (!startTime || !endTime) return true;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) <= (sh * 60 + sm);
  }, [startTime, endTime]);

  // Lọc danh sách nhân viên thực sự (loại bỏ hoàn toàn Owner / Manager và người đã nghỉ việc trước/vào ngày này)
  const staffOnlyEmployees = useMemo(() => {
    if (!employees) return [];
    const targetDate = date ? String(date).slice(0, 10) : '';

    return employees.filter((e) => {
      if (e.role === 'owner' || e.role === 'manager') return false;
      const nLower = (e.name || '').toLowerCase();
      if (
        nLower.includes('chủ quán') ||
        nLower.includes('quản lý') ||
        nLower.includes('owner') ||
        nLower.includes('manager')
      ) {
        return false;
      }

      // 1. Kiểm tra ngày bắt đầu vào làm (Nếu ngày đang xếp xảy ra TRƯỚC ngày vào làm -> Ẩn)
      if (targetDate && e.created_at) {
        const empStartDate = e.created_at.slice(0, 10);
        if (targetDate < empStartDate) return false;
      }

      // 2. Kiểm tra ngày nghỉ việc (Nếu đã nghỉ việc vào hoặc trước ngày này -> Ẩn)
      if (e.status === 'off' || e.is_active === false) {
        // Nếu nhân viên này có ca làm việc thực tế được gán trong ngày này -> Vẫn cho phép hiển thị để xem/sửa
        const hasShiftOnThisDay = (daySchedule || []).some((s) => s.employee_id === e.id);
        if (hasShiftOnThisDay) return true;

        const resignedDate = e.resigned_at || e.off_date || (e.created_at ? e.created_at.slice(0, 10) : '1970-01-01');
        if (targetDate >= resignedDate) {
          return false; // Đã nghỉ việc từ mốc này -> Ẩn hoàn toàn khỏi danh sách!
        }
      }

      return true;
    });
  }, [employees, date, daySchedule]);

  // 1. Trích xuất ca gốc ban đầu (nếu ca này từng được điều chỉnh và có tag [Gốc: ...])
  const origShiftInfo = useMemo(() => {
    if (!editItem) return null;
    const currentStart = editItem.start_time ? editItem.start_time.slice(0, 5) : '';
    const currentEnd = editItem.end_time ? editItem.end_time.slice(0, 5) : '';
    const noteStr = editItem.note || '';

    const match = noteStr.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    if (match) {
      const s = match[1];
      const e = match[2];
      return {
        startTime: s,
        endTime: e,
        hours: calcHours(s, e),
        isPreserved: true,
      };
    }

    if (currentStart && currentEnd) {
      return {
        startTime: currentStart,
        endTime: currentEnd,
        hours: calcHours(currentStart, currentEnd),
        isPreserved: false,
      };
    }
    return null;
  }, [editItem]);

  // 2. Chênh lệch giờ so với ca gốc
  const timeDiff = useMemo(() => {
    if (!origShiftInfo) return { diffHours: 0, isChanged: false };
    const diffHours = Math.round((hours - origShiftInfo.hours) * 100) / 100;
    const isChanged = startTime !== origShiftInfo.startTime || endTime !== origShiftInfo.endTime;
    return { diffHours, isChanged };
  }, [origShiftInfo, hours, startTime, endTime]);

  // 3. Danh sách các nhân viên khác (kèm trạng thái đi làm hoặc đang OFF) để chọn làm thay / hoán đổi ca
  const peerStaffOnDay = useMemo(() => {
    if (!staffOnlyEmployees) return [];
    return staffOnlyEmployees
      .filter((e) => e.id !== selectedEmpId)
      .map((emp) => {
        const s = (daySchedule || []).find((shift) => shift.employee_id === emp.id);
        const branchObj = s ? (branches.find((b) => b.id === s.branch_id) || s.branches) : null;
        const curStart = s?.start_time ? s.start_time.slice(0, 5) : '';
        const curEnd = s?.end_time ? s.end_time.slice(0, 5) : '';

        // Trích xuất ca gốc ban đầu của peer nếu peer này đã từng bị sửa/đổi ca
        let origStart = curStart;
        let origEnd = curEnd;
        if (s?.note) {
          const match = s.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
          if (match) {
            origStart = match[1];
            origEnd = match[2];
          }
        }

        return {
          id: s?.id || null,
          employeeId: emp.id,
          name: emp.name || 'Nhân viên',
          nickname: emp.nickname || '',
          hasShift: Boolean(s),
          branchName: branchObj?.name || '',
          branchColor: branchObj?.color || '',
          startTime: curStart,
          endTime: curEnd,
          origStartTime: origStart,
          origEndTime: origEnd,
          hours: s?.hours || (curStart && curEnd ? calcHours(curStart, curEnd) : 0),
        };
      })
      .filter((p) => p.name && p.name !== 'Nhân viên');
  }, [daySchedule, staffOnlyEmployees, selectedEmpId, branches]);

  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [selectedSwapEmpId, setSelectedSwapEmpId] = useState('');
  const [peerLeftTime, setPeerLeftTime] = useState('18:00');
  const [syncPeerShift, setSyncPeerShift] = useState(true);

  // Group nhân viên theo đăng ký rảnh ngày đó (chỉ áp dụng cho nhân viên thực sự)
  const registeredEmps = useMemo(() => {
    const staffIds = new Set(staffOnlyEmployees.map((e) => e.id));
    return availabilities.filter((a) => a.type !== 'off' && staffIds.has(a.employee_id));
  }, [availabilities, staffOnlyEmployees]);

  const offEmps = useMemo(() => {
    const staffIds = new Set(staffOnlyEmployees.map((e) => e.id));
    return availabilities.filter((a) => a.type === 'off' && staffIds.has(a.employee_id));
  }, [availabilities, staffOnlyEmployees]);

  // Hàm chọn làm thay thông minh: tự động điền ghi chú chuẩn xác kèm mốc giờ làm thay
  function handleSelectPeerHandover(peerId) {
    setSelectedPeerId(peerId);
    if (!peerId) return;

    const peer = peerStaffOnDay.find((p) => p.employeeId === peerId);
    if (!peer || !origShiftInfo) return;

    const diff = timeDiff.diffHours;
    if (diff > 0) {
      const peerEnd = peer.origEndTime || peer.endTime || '22:00';
      const [poeh, poem] = peerEnd.split(':').map(Number);
      const diffMin = Math.round(diff * 60);
      const peerLeftMin = (poeh * 60 + poem - diffMin + 24 * 60) % (24 * 60);
      const peerLeftTimeStr = `${String(Math.floor(peerLeftMin / 60)).padStart(2, '0')}:${String(peerLeftMin % 60).padStart(2, '0')}`;

      setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] +${diff}h làm thay ${peer.name} (từ ${peerLeftTimeStr})`);
    } else if (diff < 0) {
      setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] ${peer.name} làm thay từ ${endTime}`);
    }
  }

  // Cho phép chỉnh giờ bạn kia về trực tiếp trong ô nhập
  function handlePeerLeftTimeChange(newLeftTime) {
    if (!newLeftTime || !selectedPeerId || !origShiftInfo) return;
    const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
    if (!peer) return;

    const peerEnd = peer.origEndTime || peer.endTime || '22:00';
    const handoverH = calcHours(newLeftTime, peerEnd);
    if (handoverH <= 0) return;

    const totalNewH = origShiftInfo.hours + handoverH;
    const [osh, osm] = origShiftInfo.startTime.split(':').map(Number);
    const targetEndMinutes = (osh * 60 + osm + Math.round(totalNewH * 60)) % (24 * 60);
    const newEh = String(Math.floor(targetEndMinutes / 60)).padStart(2, '0');
    const newEm = String(targetEndMinutes % 60).padStart(2, '0');
    const newEndTimeStr = `${newEh}:${newEm}`;

    setEndTime(newEndTimeStr);
    setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] +${handoverH}h làm thay ${peer.name} (từ ${newLeftTime})`);
  }

  // Preset gán lý do nhanh vào ghi chú
  function applyAdjustmentReason(type, extraInfo = {}) {
    if (!origShiftInfo) return;
    const { startTime: os, endTime: oe } = origShiftInfo;
    const diff = timeDiff.diffHours;
    const diffSign = diff > 0 ? `+${diff}h` : `${diff}h`;

    if (type === 'ot') {
      setSelectedPeerId('');
      setNote(`[Gốc: ${os}-${oe}] ${diffSign} tăng ca`);
    } else if (type === 'early') {
      setSelectedPeerId('');
      setNote(`[Gốc: ${os}-${oe}] Về sớm ${endTime}`);
    } else if (type === 'clear') {
      setSelectedPeerId('');
      const cleaned = note.replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '').trim();
      setNote(cleaned);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedEmpId) return;

    if (isTimeInvalid || hours <= 0) {
      alert(`⚠️ Giờ ra (${endTime}) phải lớn hơn giờ vào (${startTime})! Vui lòng chọn lại giờ làm.`);
      return;
    }

    setSubmitting(true);

    // Tự động gỡ bỏ cờ OFF nếu nhân viên này đang bị gán OFF mà lại được xếp ca làm mới!
    const empAvailForOff = availabilities.find((a) => a.employee_id === selectedEmpId);
    if (empAvailForOff?.is_admin_assigned && onRemoveOff) {
      try {
        await onRemoveOff(selectedEmpId, date);
      } catch (err) {
        console.error('Lỗi khi tự động gỡ cờ OFF:', err);
      }
    }

    // Tự động đảm bảo ghi chú có thông tin ca gốc khi sửa giờ (CHỈ KHI TUẦN ĐÃ ĐƯỢC CHỐT LỊCH)
    let finalNote = note;
    if (isWeekLocked && isEditing && origShiftInfo && timeDiff.isChanged) {
      if (!finalNote.includes('[Gốc:') && !finalNote.includes('[Ca gốc:')) {
        const diffSign = timeDiff.diffHours > 0 ? `+${timeDiff.diffHours}h` : `${timeDiff.diffHours}h`;
        const caGocTag = `[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime} | ${diffSign}]`;
        finalNote = caGocTag + (finalNote ? ' ' + finalNote : '');
      }
    } else if (!isWeekLocked) {
      // Khi tuần chưa chốt (đang xếp nháp), tự động loại bỏ các tag [Gốc: ...] nếu có vô tình bị dính
      finalNote = finalNote.replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '').trim();
    }

    // Thông tin đồng bộ ca của bạn làm thay nếu có (CHỈ KHI TUẦN ĐÃ ĐƯỢC CHỐT LỊCH)
    let peerAdjustment = null;
    if (isWeekLocked && selectedPeerId && !selectedSwapEmpId && syncPeerShift && timeDiff.diffHours !== 0) {
      const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
      peerAdjustment = {
        peerEmployeeId: selectedPeerId,
        type: timeDiff.diffHours > 0 ? 'reduce' : 'increase',
        hoursDiff: Math.abs(timeDiff.diffHours),
        peerHasShift: Boolean(peer?.hasShift),
        remainingStartTime: endTime,
        remainingEndTime: origShiftInfo ? origShiftInfo.endTime : '22:00',
        remainingHours: origShiftInfo ? calcHours(endTime, origShiftInfo.endTime) : Math.abs(timeDiff.diffHours),
      };
    }

    await onSave({
      employeeId: selectedEmpId,
      branchId: selectedBranchId,
      date,
      startTime,
      endTime,
      hours,
      note: finalNote,
      editId: editItem?.id || null,
      peerAdjustment,
      swapEmployeeId: selectedSwapEmpId || null,
    });

    setSubmitting(false);
    onClose();
  }

  // Quick preset buttons (bấm điền nhanh giờ nhưng vẫn chỉnh tùy ý được)
  function applyPreset(st, et) {
    setStartTime(st);
    setEndTime(et);
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
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
                      className={`py-2.5 px-3 rounded-2xl font-black text-xs border transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1.5 active:scale-95 ${isSelected
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
                      className={`px-2.5 py-1 rounded-lg transition-all ${empFilterTab === 'unassigned'
                          ? 'bg-purple-900 text-white font-black shadow-2xs'
                          : 'text-purple-950 hover:bg-purple-200 font-bold'
                        }`}
                    >
                      🟢 Chưa có ca
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmpFilterTab('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${empFilterTab === 'all'
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
                          className={`p-2.5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-2.5 ${isSelected
                              ? 'bg-purple-900 text-white border-purple-600 shadow-md'
                              : 'bg-purple-50/70 border-purple-200 text-purple-950 hover:bg-purple-100'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${isSelected ? 'bg-amber-400 text-purple-950' : 'bg-purple-200 text-purple-950'
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
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black transition-all ${isSelected
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
              {(() => {
                const empAvailForOff = selectedEmpId ? availabilities.find((a) => a.employee_id === selectedEmpId) : null;
                const hasActiveShift = selectedEmpId ? daySchedule.some((s) => s.employee_id === selectedEmpId) : false;

                // CHỈ HIỆN "XÓA OFF" KHI NHÂN VIÊN ĐANG CÓ CỜ ADMIN OFF VÀ KHÔNG CÓ CA LÀM NÀO TRONG NGÀY
                const isOffWithoutShift = empAvailForOff?.is_admin_assigned === true && !hasActiveShift;

                return isOffWithoutShift ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedEmpId) return;
                      if (onRemoveOff) onRemoveOff(selectedEmpId, date);
                      onClose();
                    }}
                    className="py-2 px-1 bg-emerald-50 hover:bg-emerald-100 text-xs font-black rounded-xl text-emerald-900 border border-emerald-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1"
                    title="Xóa trạng thái OFF — quay về đi làm"
                  >
                    <span>↩️</span>
                    <span>Xóa OFF</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedEmpId) return;
                      if (onAssignOff) {
                        onAssignOff(selectedEmpId, date);
                      } else if (onDelete) {
                        const existingShift = daySchedule.find((s) => s.employee_id === selectedEmpId);
                        if (existingShift) onDelete(existingShift.id);
                      }
                      onClose();
                    }}
                    className="py-2 px-1 bg-rose-50 hover:bg-rose-100 text-xs font-black rounded-xl text-rose-900 border border-rose-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1"
                    title="Gán ca OFF (Cho nghỉ)"
                  >
                    <span>🛑</span>
                    <span>Ca : OFF</span>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* BỘ CHỌN GIỜ 2 CỘT SONG SONG TRỰC QUAN (TRÁI: GIỜ VÀO - PHẢI: GIỜ RA) */}
          <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200/90 shadow-2xs space-y-2.5">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 divide-x divide-purple-200/90">
              {/* Cột 1: Giờ vào */}
              <div className="space-y-1.5 pr-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
                    <span>🟢 Vào:</span>
                    <span className="text-[11px] font-black text-white bg-emerald-600 px-1.5 py-0.2 rounded-md">
                      {startTime}
                    </span>
                  </span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="px-1 py-0.5 bg-white border border-purple-200 rounded-lg text-purple-950 text-xs font-bold outline-none cursor-pointer max-w-[70px] sm:max-w-[85px]"
                    title="Nhập giờ thủ công nếu cần"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['07:30', '08:30', '09:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStartTime(t)}
                      className={`py-1 rounded-lg text-[11px] font-black cursor-pointer border transition-all active:scale-95 text-center shadow-2xs ${
                        startTime === t
                          ? 'bg-emerald-600 text-white border-emerald-600 font-black shadow-emerald-200'
                          : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                      }`}
                    >
                      {t.endsWith(':00') ? `${parseInt(t)}h` : t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cột 2: Giờ ra */}
              <div className="space-y-1.5 pl-2 sm:pl-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-rose-800 flex items-center gap-1">
                    <span>🔴 Ra:</span>
                    <span className="text-[11px] font-black text-white bg-rose-600 px-1.5 py-0.2 rounded-md">
                      {endTime}
                    </span>
                  </span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="px-1 py-0.5 bg-white border border-purple-200 rounded-lg text-purple-950 text-xs font-bold outline-none cursor-pointer max-w-[70px] sm:max-w-[85px]"
                    title="Nhập giờ thủ công nếu cần"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '21:45', '22:00'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEndTime(t)}
                      className={`py-1 rounded-lg text-[11px] font-black cursor-pointer border transition-all active:scale-95 text-center shadow-2xs ${
                        endTime === t
                          ? 'bg-rose-600 text-white border-rose-600 font-black shadow-rose-200'
                          : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                      }`}
                    >
                      {t.endsWith(':00') ? `${parseInt(t)}h` : t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer số giờ */}
            {isTimeInvalid ? (
              <div className="text-center text-xs font-black p-2 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 flex items-center justify-center gap-1.5 animate-pulse">
                <span>⚠️</span>
                <span>Giờ ra ({endTime}) phải lớn hơn giờ vào ({startTime})!</span>
              </div>
            ) : (
              <div className="text-center text-xs text-purple-900 font-extrabold pt-1.5 border-t border-purple-200/80">
                ⏱️ Số giờ tự tính: <span className="text-sm font-black text-purple-950">{hours} tiếng</span>
              </div>
            )}
          </div>

          {/* ĐIỀU CHỈNH GIỜ & CA GỐC (THIẾT KẾ CARD & CHIP HIỆN ĐẠI, GỌN GÀNG CHO MOBILE) */}
          {isWeekLocked && isEditing && origShiftInfo && (
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 p-3 sm:p-3.5 rounded-2xl border border-purple-200 shadow-2xs space-y-3">
              {/* Dòng 1: Header tóm tắt giờ */}
              <div className="flex items-center justify-between text-xs pb-2 border-b border-purple-200/70">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🕒</span>
                  <span className="font-extrabold text-purple-900">
                    Gốc: <b className="text-purple-950 font-black">{origShiftInfo.startTime}-{origShiftInfo.endTime}</b> ➔ Mới: <b className="text-purple-950 font-black">{startTime}-{endTime}</b>
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-lg font-black text-xs text-white shadow-2xs ${
                    timeDiff.diffHours > 0 ? 'bg-emerald-600' : timeDiff.diffHours < 0 ? 'bg-rose-600' : 'bg-purple-600'
                  }`}
                >
                  {timeDiff.diffHours > 0 ? `+${timeDiff.diffHours}h` : `${timeDiff.diffHours}h`}
                </span>
              </div>

              {/* Dòng 2: Nút chọn chế độ điều chỉnh nhanh (Luôn hiện đủ 3 lựa chọn) */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-black text-purple-950 uppercase tracking-wide">
                  Lý do thay đổi ca:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {/* Nút 1: Làm thay bạn khác */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSwapEmpId('');
                      if (!selectedPeerId && peerStaffOnDay[0]) {
                        handleSelectPeerHandover(peerStaffOnDay[0].employeeId);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                      selectedPeerId && !selectedSwapEmpId
                        ? 'bg-purple-700 text-white shadow-purple-200 scale-102'
                        : 'bg-white text-purple-900 border border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    <span>👥</span>
                    <span>Làm thay bạn khác</span>
                  </button>

                  {/* Nút 2: Tăng ca / Về sớm */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSwapEmpId('');
                      setSelectedPeerId('');
                      if (timeDiff.diffHours > 0) {
                        applyAdjustmentReason('ot');
                      } else if (timeDiff.diffHours < 0) {
                        applyAdjustmentReason('early');
                      } else {
                        setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] Tăng ca`);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                      !selectedPeerId && !selectedSwapEmpId && (note.includes('tăng ca') || note.includes('Về sớm'))
                        ? 'bg-purple-700 text-white shadow-purple-200 scale-102'
                        : 'bg-white text-purple-900 border border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    <span>⚡</span>
                    <span>
                      {timeDiff.diffHours > 0
                        ? `Tăng ca (+${timeDiff.diffHours}h)`
                        : timeDiff.diffHours < 0
                        ? `Về sớm (${endTime})`
                        : 'Tăng ca / Về sớm'}
                    </span>
                  </button>

                  {/* Nút 3: Đổi NV khác (Hoán đổi ca hoàn toàn) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPeerId('');
                      const otherStaff = staffOnlyEmployees.filter((e) => e.id !== selectedEmpId);
                      if (otherStaff.length > 0 && !selectedSwapEmpId) {
                        const target = otherStaff[0];
                        setSelectedSwapEmpId(target.id);
                        setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] Đổi ca với ${target.name}`);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                      selectedSwapEmpId
                        ? 'bg-purple-700 text-white shadow-purple-200 scale-102'
                        : 'bg-white text-purple-900 border border-purple-200 hover:bg-purple-100'
                    }`}
                  >
                    <span>🔄</span>
                    <span>Đổi NV khác</span>
                  </button>
                </div>
              </div>

              {/* Dòng 3A: Danh sách Chip nhân viên làm thay (Khi chọn Làm thay bạn khác) */}
              {selectedPeerId && !selectedSwapEmpId && peerStaffOnDay.length > 0 && (
                <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-purple-200">
                  <div className="text-[11px] font-bold text-purple-900">
                    {timeDiff.diffHours > 0 ? '👉 Bạn đang làm thay cho:' : '👉 Chọn bạn nhận làm hộ phần ca còn lại:'}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {peerStaffOnDay
                      .filter((p) => (timeDiff.diffHours > 0 ? p.hasShift : true))
                      .map((p) => {
                        const isSelected = selectedPeerId === p.employeeId;
                        const shiftStr = p.hasShift
                          ? `${p.origStartTime || p.startTime}-${p.origEndTime || p.endTime}`
                          : 'Đang OFF';
                        return (
                          <button
                            key={p.employeeId}
                            type="button"
                            onClick={() => handleSelectPeerHandover(p.employeeId)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                              isSelected
                                ? 'bg-purple-900 text-white border-2 border-purple-700 ring-2 ring-purple-300'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${p.hasShift ? 'bg-emerald-400' : 'bg-gray-400'} shrink-0`} />
                            <span>{p.name}</span>
                            <span className={`text-[10px] font-bold ${isSelected ? 'text-purple-200' : p.hasShift ? 'text-purple-600' : 'text-amber-700'}`}>
                              ({shiftStr})
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Dòng 3B: Danh sách Chip nhân viên để hoán đổi ca hoàn toàn (Khi chọn Đổi NV khác) */}
              {selectedSwapEmpId && (() => {
                const otherStaff = staffOnlyEmployees.filter((e) => e.id !== selectedEmpId);
                const swapEmp = staffOnlyEmployees.find((e) => e.id === selectedSwapEmpId);
                const currentEmp = staffOnlyEmployees.find((e) => e.id === selectedEmpId);
                const currentEmpName = currentEmp?.name || 'Nhân viên';
                const swapEmpShift = daySchedule.find((s) => s.employee_id === selectedSwapEmpId);

                return (
                  <div className="space-y-2 bg-white p-2.5 rounded-xl border border-purple-200 animate-fade-in">
                    <div className="text-[11px] font-bold text-purple-900">
                      👉 Chọn nhân viên muốn hoán đổi ca làm này:
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {otherStaff.map((emp) => {
                        const isSelected = selectedSwapEmpId === emp.id;
                        const empShift = daySchedule.find((s) => s.employee_id === emp.id);
                        const shiftInfo = empShift
                          ? `${empShift.start_time?.slice(0, 5)}-${empShift.end_time?.slice(0, 5)}`
                          : 'Đang OFF';

                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setSelectedSwapEmpId(emp.id);
                              setSelectedPeerId('');
                              setNote(`[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] Đổi ca với ${emp.name}`);
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                              isSelected
                                ? 'bg-purple-900 text-white border-2 border-purple-700 ring-2 ring-purple-300'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${empShift ? 'bg-emerald-400' : 'bg-gray-300'} shrink-0`} />
                            <span>{emp.name}</span>
                            <span className={`text-[10px] font-bold ${isSelected ? 'text-purple-200' : empShift ? 'text-purple-600' : 'text-amber-700'}`}>
                              ({shiftInfo})
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Tóm tắt hoán đổi ca */}
                    {swapEmp && (
                      <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-xs space-y-1 font-bold text-purple-950">
                        <div className="flex items-center gap-1.5 text-purple-900 font-black pb-1 border-b border-purple-200">
                          <span>🔄</span>
                          <span>Hoán đổi toàn bộ ca làm trong ngày:</span>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span>👤 <b>{currentEmpName}</b>:</span>
                          <span className="font-black text-purple-900">
                            {swapEmpShift
                              ? `${swapEmpShift.start_time?.slice(0, 5)} - ${swapEmpShift.end_time?.slice(0, 5)} (Nhận ca của ${swapEmp.name})`
                              : 'Nghỉ (Nhường ca cho bạn)'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-purple-100">
                          <span>👤 <b>{swapEmp.name}</b>:</span>
                          <span className="font-black text-purple-900">
                            {startTime} - {endTime} (Nhận ca của {currentEmpName})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Dòng 4: Chi tiết trực quan ca làm thay & tự động đồng bộ */}
              {selectedPeerId && !selectedSwapEmpId && (() => {
                const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
                if (!peer) return null;
                const isIncrease = timeDiff.diffHours > 0;
                const currentEmp = staffOnlyEmployees.find((e) => e.id === selectedEmpId);
                const currentEmpName = currentEmp?.name || 'Nhân viên';

                const peerOrigStart = peer.origStartTime || peer.startTime || '09:00';
                const peerOrigEnd = peer.origEndTime || peer.endTime || '22:00';

                // Giờ bạn kia về khi người này tăng ca làm thay
                const [poeh, poem] = peerOrigEnd.split(':').map(Number);
                const diffMin = Math.round(Math.abs(timeDiff.diffHours) * 60);
                const peerLeftMin = (poeh * 60 + poem - diffMin + 24 * 60) % (24 * 60);
                const peerLeftTimeStr = `${String(Math.floor(peerLeftMin / 60)).padStart(2, '0')}:${String(peerLeftMin % 60).padStart(2, '0')}`;

                // Giờ bạn kia ra mới khi người này về sớm
                const peerNewEndMin = (poeh * 60 + poem + diffMin) % (24 * 60);
                const peerNewEndStr = `${String(Math.floor(peerNewEndMin / 60)).padStart(2, '0')}:${String(peerNewEndMin % 60).padStart(2, '0')}`;

                // Phần ca còn lại nếu bạn này đang OFF nhận làm hộ
                const remStart = endTime;
                const remEnd = origShiftInfo.endTime;
                const remHours = calcHours(remStart, remEnd);

                return (
                  <div className="bg-white p-3 rounded-xl border border-purple-200 text-xs space-y-2.5 animate-fade-in shadow-2xs">
                    {/* Hàng 1: Hiển thị rõ bạn kia về lúc mấy giờ */}
                    {isIncrease ? (
                      <div className="flex items-center justify-between bg-purple-50 p-2 rounded-lg border border-purple-100">
                        <span className="font-black text-purple-950 flex items-center gap-1">
                          <span>🕒</span> <b>{peer.name}</b> về lúc:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="time"
                            value={peerLeftTimeStr}
                            onChange={(e) => handlePeerLeftTimeChange(e.target.value)}
                            className="px-2 py-0.5 bg-white border border-purple-300 rounded-lg text-purple-950 font-black text-xs outline-none cursor-pointer"
                            title="Chỉnh giờ bạn kia về để tự tính giờ làm cho mình"
                          />
                          <span className="font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                            +{timeDiff.diffHours}h
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-rose-50 p-2 rounded-lg border border-rose-100">
                        <span className="font-black text-rose-950 flex items-center gap-1">
                          <span>🕒</span> <b>{currentEmpName}</b> về sớm lúc:
                        </span>
                        <span className="font-black text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded text-xs">
                          {endTime} ({timeDiff.diffHours}h)
                        </span>
                      </div>
                    )}

                    {/* Hàng 2: Tóm tắt 2 ca sau khi đổi */}
                    <div className="text-[11px] font-bold text-purple-900 bg-purple-50/50 p-2 rounded-lg border border-purple-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>
                          👤 <b>{peer.name}</b> {!peer.hasShift && <span className="text-[10px] text-amber-700 font-extrabold">(Đang OFF)</span>}:
                        </span>
                        <span className="font-black text-purple-950">
                          {peer.hasShift ? (
                            <>
                              {isIncrease ? `${peerOrigStart} - ${peerLeftTimeStr}` : `${peerOrigStart} - ${peerNewEndStr}`}
                              <span className={`ml-1 text-[10px] font-black ${isIncrease ? 'text-amber-700' : 'text-emerald-700'}`}>
                                ({isIncrease ? `-${timeDiff.diffHours}h` : `+${Math.abs(timeDiff.diffHours)}h`})
                              </span>
                            </>
                          ) : (
                            <span className="text-emerald-700">
                              {remStart} - {remEnd} (+{remHours}h làm hộ)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-purple-100">
                        <span>
                          👤 <b>{currentEmpName}</b>:
                        </span>
                        <span className="font-black text-purple-950">
                          {startTime} - {endTime}
                          <span className={`ml-1 text-[10px] font-black ${isIncrease ? 'text-emerald-700' : 'text-rose-700'}`}>
                            ({isIncrease ? `+${timeDiff.diffHours}h` : `${timeDiff.diffHours}h`})
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Hàng 3: Checkbox tự động đồng bộ */}
                    <label className="flex items-center gap-2 font-bold text-purple-950 cursor-pointer pt-1 border-t border-purple-100">
                      <input
                        type="checkbox"
                        checked={syncPeerShift}
                        onChange={(e) => setSyncPeerShift(e.target.checked)}
                        className="w-4 h-4 rounded text-purple-700 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-[11.5px]">
                        {peer.hasShift ? (
                          isIncrease ? (
                            <>
                              Tự động rút ngắn ca của <b>{peer.name}</b> về <b>{peerLeftTimeStr}</b>
                            </>
                          ) : (
                            <>
                              Tự động tăng ca cho <b>{peer.name}</b> đến <b>{peerNewEndStr}</b>
                            </>
                          )
                        ) : (
                          <>
                            Tự động tạo ca <b>{remStart}-{remEnd}</b> cho <b>{peer.name}</b> nhận làm hộ
                          </>
                        )}
                      </span>
                    </label>
                  </div>
                );
              })()}
            </div>
          )}

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
                disabled={submitting || !selectedEmpId || isTimeInvalid || hours <= 0}
                className={`flex-1 py-3 rounded-xl font-black text-xs cursor-pointer border-0 shadow-2xs transition-all ${
                  isTimeInvalid || hours <= 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-700 hover:bg-purple-800 text-white active:scale-95'
                }`}
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
    </div>,
    document.body
  );
}

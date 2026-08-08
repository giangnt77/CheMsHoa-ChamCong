'use client';

import { useState, useEffect, useMemo } from 'react';
import { getEmployees, getScheduleByDateRange, createShiftSwap } from '@/lib/supabase';
import { getToday, formatDateFull, formatDateWithDayVN, calculateHours, sendTelegramNotification, getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function ModalShiftSwap({ employee, onClose, onRefresh }) {
  const toast = useToast();
  const [step, setStep] = useState(1); // 1: Lý do đổi, 2: Chọn ngày & Đồng nghiệp rảnh, 3: Xác nhận gửi
  const [allEmployees, setAllEmployees] = useState([]);
  const [daySchedules, setDaySchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [reason, setReason] = useState('');
  const [shiftDate, setShiftDate] = useState(getToday());
  const [myShiftInfo, setMyShiftInfo] = useState(''); // Ví dụ: "16:00 - 22:00 (CN 56)"
  const [targetEmpId, setTargetEmpId] = useState('');

  // Tải danh sách nhân viên ban đầu
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const all = await getEmployees();
      const staffOnly = all.filter((e) => e.id !== employee.id && e.role !== 'owner' && e.role !== 'manager');
      setAllEmployees(staffOnly);
    } catch (e) {
      console.error(e);
    }
  }

  // Khi thay đổi Ngày chọn, tự động tải Lịch phân công trong ngày đó để tính toán ai rảnh
  useEffect(() => {
    if (shiftDate) {
      loadScheduleForDate(shiftDate);
    }
  }, [shiftDate]);

  async function loadScheduleForDate(dateStr) {
    if (!dateStr) return;
    setLoadingSchedule(true);
    try {
      const cleanDate = String(dateStr).trim();
      const sched = await getScheduleByDateRange(cleanDate, cleanDate);
      setDaySchedules(sched || []);

      // Tự động tìm ca làm của chính nhân viên đang dùng trong ngày hôm đó
      const myScheds = (sched || []).filter(
        (s) =>
          String(s.employee_id || '').trim() === String(employee.id || '').trim() ||
          (s.employees?.name && employee.name && s.employees.name.trim().toLowerCase() === employee.name.trim().toLowerCase())
      );

      if (myScheds.length > 0) {
        const first = myScheds[0];
        const bName = first.branches?.name || 'Chưa xếp CN';
        const sTime = first.start_time ? String(first.start_time).slice(0, 5) : '';
        const eTime = first.end_time ? String(first.end_time).slice(0, 5) : '';
        const timeStr = sTime && eTime ? `${sTime} - ${eTime}` : 'Có lịch làm';
        setMyShiftInfo(`[CN ${bName}] ${timeStr}`);
      } else {
        setMyShiftInfo('16:00 - 22:00 (Mặc định)');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSchedule(false);
    }
  }

  /**
   * THUẬT TOÁN TÍNH TOÁN THỜI GIAN RẢNH & LỌC DANH SÁCH ĐỒNG NGHIỆP ĐỦ ĐIỀU KIỆN ĐỔI / LÀM HỘ
   * 
   * Nguyên lý:
   * - Lấy khoảng thời gian ca của Tôi (VD: 16:00 - 22:00).
   * - Duyệt qua từng nhân viên:
   *   + Tìm các ca họ đã được phân công trong ngày hôm đó.
   *   + Kiểm tra xem ca nào của họ có bị trùng/chồng thời gian (overlap) với ca của Tôi hay không.
   *   + Nếu KHÔNG TRÙNG thời gian -> Đồng nghĩa họ RẢNH trong khung giờ đó -> Giữ lại trong danh sách!
   *   + Nếu TRÙNG thời gian -> Bị bận -> ẨN TÊN KHỎI DANH SÁCH CHỌN.
   */
  const availableEmployees = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0) return [];

    // Tách thời gian ca của Tôi
    let myStart = 16 * 60; // 16:00 in minutes
    let myEnd = 22 * 60;   // 22:00 in minutes

    if (myShiftInfo.includes('-')) {
      const match = myShiftInfo.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (match) {
        const [sh, sm] = match[1].split(':').map(Number);
        const [eh, em] = match[2].split(':').map(Number);
        myStart = sh * 60 + sm;
        myEnd = eh * 60 + em;
      }
    }

    return allEmployees
      .map((emp) => {
        // Tìm lịch của nhân viên này trong ngày (Khớp cả ID lẫn Tên nhân viên để chính xác 100%)
        const empScheds = daySchedules.filter(
          (s) =>
            String(s.employee_id || '').trim() === String(emp.id || '').trim() ||
            (s.employees?.name && emp.name && s.employees.name.trim().toLowerCase() === emp.name.trim().toLowerCase())
        );

        let isOverlap = false;
        let currentShiftLabel = '🟢 Chưa có ca làm (Rảnh trọn ngày)';

        if (empScheds.length > 0) {
          const shiftInfoList = empScheds.map((s) => {
            const bName = s.branches?.name ? `CN ${s.branches.name}` : '';
            const startTimeStr = s.start_time ? String(s.start_time).slice(0, 5) : '';
            const endTimeStr = s.end_time ? String(s.end_time).slice(0, 5) : '';
            const timeStr = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : 'Có lịch làm';

            // Kiểm tra trùng giờ
            if (startTimeStr && endTimeStr) {
              const [sh, sm] = startTimeStr.split(':').map(Number);
              const [eh, em] = endTimeStr.split(':').map(Number);
              const eStart = sh * 60 + sm;
              const eEnd = eh * 60 + em;

              // Trùng giờ nếu: (eStart < myEnd) và (eEnd > myStart)
              if (eStart < myEnd && eEnd > myStart) {
                isOverlap = true;
              }
            }
            return bName ? `[${bName}] ${timeStr}` : timeStr;
          });

          const formattedShifts = shiftInfoList.join(', ');

          if (!isOverlap) {
            currentShiftLabel = `Làm ca khác (${formattedShifts}) ➔ Rảnh giờ ca bạn!`;
          } else {
            currentShiftLabel = `Bị BẬN ca trùng (${formattedShifts})`;
          }
        }

        // Thông tin ca của đồng nghiệp để đổi lại (nếu họ có ca)
        let empShiftDetail = '🟢 Chưa có ca (Sẽ nhận làm giúp)';
        if (empScheds.length > 0) {
          const firstS = empScheds[0];
          const bName = firstS.branches?.name ? `CN ${firstS.branches.name}` : '';
          const sTime = firstS.start_time ? String(firstS.start_time).slice(0, 5) : '09:00';
          const eTime = firstS.end_time ? String(firstS.end_time).slice(0, 5) : '12:00';
          empShiftDetail = bName ? `[${bName}] ${sTime} - ${eTime}` : `${sTime} - ${eTime}`;
        }

        return {
          ...emp,
          isAvailable: !isOverlap,
          shiftSummary: currentShiftLabel,
          targetShiftInfo: empShiftDetail,
        };
      })
      .filter((emp) => emp.isAvailable); // CHỈ GIỮ LẠI NHỮNG NGƯỜI RẢNH, ẨN NGƯỜI BỊ BẬN TRÙNG LỊCH!
  }, [allEmployees, daySchedules, myShiftInfo]);

  // Tự động chọn người đầu tiên trong danh sách đủ điều kiện
  useEffect(() => {
    if (availableEmployees.length > 0 && !targetEmpId) {
      setTargetEmpId(availableEmployees[0].id);
    } else if (availableEmployees.length === 0) {
      setTargetEmpId('');
    }
  }, [availableEmployees]);

  const selectedTargetEmp = useMemo(() => {
    return availableEmployees.find((e) => e.id === targetEmpId) || null;
  }, [availableEmployees, targetEmpId]);

  function handleNextToStep2() {
    if (!reason.trim()) {
      toast.warning('Thiếu lý do', 'Vui lòng nhập lý do xin đổi ca!');
      return;
    }
    setStep(2);
  }

  function handleNextToStep3() {
    if (!targetEmpId) {
      toast.warning('Chưa chọn đồng nghiệp', 'Vui lòng chọn 1 đồng nghiệp có thời gian rảnh đủ điều kiện!');
      return;
    }
    setStep(3);
  }

  async function handleSubmitSwap() {
    if (!selectedTargetEmp) return;
    setSubmitting(true);

    const swapPayload = {
      requester_id: employee.id,
      requester_name: employee.name,
      target_employee_id: selectedTargetEmp.id,
      target_employee_name: selectedTargetEmp.name,
      shift_date: shiftDate,
      my_shift_info: myShiftInfo,
      target_shift_info: selectedTargetEmp.targetShiftInfo,
      reason: reason.trim(),
    };

    try {
      await createShiftSwap(swapPayload);
      // Tự động gửi thông báo Telegram Bot tới Quản Lý
      sendTelegramNotification(swapPayload).catch(console.error);

      toast.success('Thành công', 'Đã gửi yêu cầu đổi ca đến Quản Lý phê duyệt & thông báo Telegram!');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể gửi yêu cầu đổi ca. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in my-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center text-xl font-black shadow-2xs">
              🔄
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-purple-950">Đăng Ký Đổi Ca</h3>
              <p className="text-xs text-purple-700 font-extrabold">
                Bước {step}/3: {step === 1 ? 'Lý Do Xin Đổi' : step === 2 ? 'Chọn Ngày & Đồng Nghiệp Rảnh' : 'Xác Nhận & Gửi Quản Lý'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-sm flex items-center justify-center hover:bg-purple-200 transition-all border-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* BẢNG 1 (STEP 1): LÝ DO XIN ĐỔI CA */}
        {step === 1 && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold space-y-1">
              <p className="font-black text-amber-950 text-xs sm:text-sm">📌 BƯỚC 1: NHẬP LÝ DO XIN ĐỔI CA</p>
              <p>Hãy viết ngắn gọn lý do bạn xin đổi ca (Ví dụ: bận việc gia đình, đi học đột xuất...)</p>
            </div>

            <div>
              <label className="block text-xs font-black text-purple-950 mb-1">
                Lý do xin đổi ca <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do của bạn ở đây..."
                className="w-full px-3.5 py-2.5 bg-white border border-purple-200 focus:border-purple-600 rounded-2xl text-purple-950 text-sm font-bold outline-none transition-all placeholder:text-purple-400 shadow-2xs resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleNextToStep2}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 border-0"
              >
                <span>Tiếp tục Bước 2</span>
                <span>➡️</span>
              </button>
            </div>
          </div>
        )}

        {/* BẢNG 2 (STEP 2): CHỌN NGÀY & ĐỒNG NGHIỆP RẢNH ĐỦ ĐIỀU KIỆN */}
        {step === 2 && (
          <div className="space-y-3.5 animate-fade-in max-h-[68vh] overflow-y-auto pr-1 custom-scrollbar">
            {/* Thẻ nhắc nhở gọi điện chốt trước ngoài đời */}
            <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-xs text-emerald-950 font-bold space-y-1 shadow-2xs">
              <p className="font-black text-emerald-900 text-xs sm:text-sm flex items-center gap-1">
                <span>🤝</span>
                <span>YÊU CẦU XÁC NHẬN TRƯỚC KHI GỬI</span>
              </p>
              <p className="text-[11px] text-emerald-800 font-extrabold">
                Xác nhận 2 người <strong>ĐÃ GỌI ĐIỆN VÀ THỐNG NHẤT</strong> trước khi bấm gửi!
              </p>
            </div>

            {/* Ô chọn Ngày đổi ca */}
            <div>
              <label className="block text-xs font-black text-purple-950 mb-1">
                📅 Chọn ngày muốn đổi ca:
              </label>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-sm font-black outline-none"
              />
            </div>

            {/* Thông tin ca của tôi trong ngày đó */}
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 space-y-1 text-xs">
              <span className="text-[11px] text-purple-700 font-bold">⏰ Ca làm hiện tại của bạn ({employee.name}):</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={myShiftInfo}
                  onChange={(e) => setMyShiftInfo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-purple-300 rounded-xl font-black text-purple-950 text-xs"
                />
              </div>
            </div>

            {/* DANH SÁCH ĐỒNG NGHIỆP CÓ THỜI GIAN RẢNH (ĐƯỢC LỌC THÔNG MINH BẰNG THUẬT TOÁN) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-purple-950 flex items-center justify-between">
                <span>👥 Chọn đồng nghiệp đổi ca cùng:</span>
                {loadingSchedule && <span className="text-[11px] text-purple-600 font-bold animate-pulse">⏳ Đang tính toán thời gian rảnh...</span>}
              </label>

              {availableEmployees.length > 0 ? (
                <div className="space-y-2">
                  <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {availableEmployees.map((emp) => {
                      const isSelected = targetEmpId === emp.id;
                      const isFreeAllDay = emp.shiftSummary.includes('Rảnh trọn ngày') || emp.shiftSummary.includes('🟢');

                      return (
                        <div
                          key={emp.id}
                          onClick={() => setTargetEmpId(emp.id)}
                          className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-purple-900 text-white border-purple-600 shadow-md scale-[1.01]'
                              : isFreeAllDay
                              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950 hover:bg-emerald-100/80'
                              : 'bg-purple-50/70 border-purple-200 text-purple-950 hover:bg-purple-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 shadow-2xs ${
                                isSelected ? 'bg-amber-400 text-purple-950' : 'bg-purple-200 text-purple-950'
                              }`}
                            >
                              {getInitials(emp.name)}
                            </div>
                            <div className="truncate">
                              <div className={`font-black text-xs sm:text-sm truncate ${isSelected ? 'text-white' : 'text-purple-950'}`}>
                                {emp.name}
                              </div>
                              <div className={`text-[11px] font-extrabold truncate ${isSelected ? 'text-amber-300' : 'text-purple-700'}`}>
                                {emp.shiftSummary}
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-all ${
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
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-center text-rose-800 text-xs font-bold space-y-1">
                  <p className="font-black text-rose-950">⚠️ Không tìm thấy đồng nghiệp nào rảnh trong khung giờ này!</p>
                  <p className="text-[11px]">Tất cả nhân viên khác đều đang có lịch làm trùng khung giờ ca của bạn.</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs hover:bg-purple-200 border-0 cursor-pointer"
              >
                ⬅️ Quay lại
              </button>
              <button
                type="button"
                disabled={availableEmployees.length === 0}
                onClick={handleNextToStep3}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:bg-slate-300 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 border-0"
              >
                <span>Xác nhận Bước 3</span>
                <span>➡️</span>
              </button>
            </div>
          </div>
        )}

        {/* BẢNG 3 (STEP 3): XÁC NHẬN TỔNG HỢP & GỬI YÊU CẦU CHO QUẢN LÝ */}
        {step === 3 && selectedTargetEmp && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl space-y-2 text-xs">
              <h4 className="font-black text-purple-950 text-sm border-b border-purple-200 pb-1 flex items-center gap-1.5">
                <span>📋</span>
                <span>TỔNG HỢP YÊU CẦU ĐỔI CA</span>
              </h4>

              <div className="space-y-1.5 text-purple-900 font-bold">
                <p>👤 <strong>Người gửi yêu cầu:</strong> <span className="text-purple-700 font-black">{employee.name}</span></p>
                <p>👥 <strong>Đồng nghiệp đổi/làm giúp:</strong> <span className="text-orange-600 font-black">{selectedTargetEmp.name}</span></p>
                <p>📅 <strong>Ngày diễn ra đổi:</strong> <span className="text-purple-950 font-black">{formatDateWithDayVN(shiftDate)}</span></p>
                <p>⏰ <strong>Ca của bạn ({employee.name}):</strong> <span className="text-purple-900 font-extrabold">{myShiftInfo}</span></p>
                <p>🔄 <strong>Ca của {selectedTargetEmp.name}:</strong> <span className="text-orange-700 font-extrabold">{selectedTargetEmp.targetShiftInfo}</span></p>
                <p className="pt-1 text-purple-800 italic">💬 <strong>Lý do xin đổi:</strong> &quot;{reason}&quot;</p>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-bold">
              ⚡ Yêu cầu sẽ được gửi tới <strong>Quản Lý Phê Duyệt</strong>. Sau khi duyệt, Quản Lý sẽ điều chỉnh trên Lịch Phân Công!
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs hover:bg-purple-200 border-0 cursor-pointer"
              >
                ⬅️ Sửa lại
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitSwap}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-2 border-0"
              >
                {submitting ? '🚀 Đang gửi...' : '🚀 Gửi Yêu Cầu Cho Quản Lý'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

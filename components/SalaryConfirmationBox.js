'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import {
  getSalaryConfirmations,
  saveSalaryConfirmation,
  cancelSalaryConfirmation,
  toggleSalarySigningPermission,
} from '@/lib/supabase';
import { useToast } from '@/components/Toast';

export default function SalaryConfirmationBox({
  employee,
  month,
  displayMonthStr,
  netSalary = 0,
  monthlyHours = 0,
  monthlyShiftsCount = 0,
  isOwnerMode = false, // true: Giao diện Quản lý / Chủ quán (trong Phiếu Tính Lương) | false: Giao diện Nhân viên
  onConfirmedChange,
}) {
  const toast = useToast();
  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);

  const [confirmed, setConfirmed] = useState(false);
  const [openForSigning, setOpenForSigning] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Điều khiển mở khung vẽ chữ ký
  const [isDirectSigning, setIsDirectSigning] = useState(false); // Chủ cho nhân viên ký trực tiếp tại máy chủ
  const [isChecking, setIsChecking] = useState(false); // Nhân viên bấm 'Kiểm tra lương & Ký tên' trên điện thoại
  const [hasDrawn, setHasDrawn] = useState(false);

  // Tải trạng thái xác nhận & quyền ký từ Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadConfirmation() {
      if (!employee || !month) return;
      try {
        const confirmations = await getSalaryConfirmations(month);
        const empConf = confirmations && confirmations[employee.id];
        if (isMounted) {
          if (empConf) {
            setConfirmed(!!empConf.confirmed);
            setOpenForSigning(!!empConf.open_for_signing);
            setConfirmationData(empConf);
            if (onConfirmedChange) onConfirmedChange(!!empConf.confirmed, empConf);
          } else {
            setConfirmed(false);
            setOpenForSigning(false);
            setConfirmationData(null);
            if (onConfirmedChange) onConfirmedChange(false, null);
          }
          setInitialLoaded(true);
        }
      } catch (err) {
        console.error('Error loading salary confirmation:', err);
        if (isMounted) setInitialLoaded(true);
      }
    }
    loadConfirmation();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, month]);

  // Cài đặt Canvas vẽ chữ ký (hỗ trợ màn hình Retina / High-DPI)
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1e1b4b'; // Mực xanh tím than đậm sang trọng
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  // Tính tọa độ chạm / chuột chính xác trên canvas
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e) => {
    if (confirmed || loading) return;
    const { x, y } = getCoordinates(e);
    isDrawingRef.current = true;
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.closePath();
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Lắng nghe Touch Events với passive: false để chặn cuộn trang khi vẽ chữ ký trên mobile
  const shouldRenderCanvas = !confirmed && (isChecking || isDirectSigning);

  useEffect(() => {
    if (!shouldRenderCanvas) return;

    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setupCanvas();

      const handleTouchStart = (e) => {
        e.preventDefault();
        startDrawing(e);
      };
      const handleTouchMove = (e) => {
        e.preventDefault();
        draw(e);
      };
      const handleTouchEnd = (e) => {
        e.preventDefault();
        stopDrawing();
      };

      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

      const handleResize = () => {
        if (!hasDrawn) setupCanvas();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('resize', handleResize);
      };
    }, 60);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRenderCanvas, confirmed, initialLoaded]);

  // CHỦ QUÁN: Bật/Tắt quyền ký cho nhân viên
  async function handleTogglePermission(allow) {
    if (!employee || !month || loading) return;
    setLoading(true);
    try {
      await toggleSalarySigningPermission(month, employee.id, allow);
      setOpenForSigning(allow);
      setIsDirectSigning(false);
      setIsChecking(false);
      if (toast) {
        if (allow) {
          toast.success(
            'Đã mở quyền ký!',
            `Đã cho phép nhân viên ${employee.name} ký xác nhận bảng lương tháng ${displayMonthStr}.`
          );
        } else {
          toast.info(
            'Đã khóa quyền ký',
            `Đã thu hồi quyền ký bảng lương tháng ${displayMonthStr} của ${employee.name}.`
          );
        }
      }
    } catch (err) {
      console.error('Lỗi khi cập nhật quyền ký:', err);
      if (toast) toast.error('Lỗi', 'Không thể cập nhật quyền ký lúc này, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  }

  // KÝ XÁC NHẬN & LƯU SUPABASE
  async function handleConfirmSignature() {
    if (confirmed || !employee || !month || loading) return;

    if (!hasDrawn) {
      if (toast) {
        toast.warning(
          'Chưa có chữ ký',
          'Vui lòng dùng ngón tay hoặc chuột để vẽ chữ ký của bạn vào khung trước khi xác nhận!'
        );
      }
      return;
    }

    const confirmMsg =
      `⚠️ XÁC NHẬN KÝ BẢNG LƯƠNG:\n\nBạn có chắc chắn chữ ký chính xác và đồng ý thanh toán bảng lương tháng ${displayMonthStr} với số tiền ${formatCurrency(netSalary)}?`;

    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    setLoading(true);
    try {
      const canvas = canvasRef.current;
      const signatureImage = canvas ? canvas.toDataURL('image/png') : '';
      const nowStr = new Date().toISOString();

      const payload = {
        open_for_signing: true,
        confirmed: true,
        signed_by: employee.name,
        signed_at: nowStr,
        signature_image: signatureImage,
        net_salary: netSalary,
        total_hours: monthlyHours,
        shifts_count: monthlyShiftsCount,
        employee_name: employee.name,
        is_locked: true,
      };

      await saveSalaryConfirmation(month, employee.id, payload);
      setConfirmed(true);
      setConfirmationData(payload);
      setIsDirectSigning(false);
      setIsChecking(false);
      if (onConfirmedChange) onConfirmedChange(true, payload);
      if (toast) {
        toast.success(
          'Đã ký xác nhận thành công! 🎉',
          `Bảng lương tháng ${displayMonthStr} (${formatCurrency(netSalary)}) đã được ký và lưu vào hệ thống!`
        );
      }
    } catch (err) {
      console.error('Lỗi khi lưu chữ ký xác nhận bảng lương:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu chữ ký xác nhận lúc này, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  }

  // HỦY KÝ (RESET) — Dành cho Chủ quán khi cần cho nhân viên ký lại
  async function handleCancelConfirmation() {
    if (!confirmed || !employee || !month || loading) return;

    const confirmMsg =
      `⚠️ XÁC NHẬN HỦY KÝ:\n\nBạn có chắc chắn muốn hủy chữ ký xác nhận bảng lương tháng ${displayMonthStr} của ${employee.name} để reset cho nhân viên ký lại không?`;

    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    setLoading(true);
    try {
      await cancelSalaryConfirmation(month, employee.id);
      setConfirmed(false);
      setHasDrawn(false);
      setIsDirectSigning(false);
      setIsChecking(false);
      const updatedData = { ...confirmationData, confirmed: false, signature_image: null, signed_at: null };
      setConfirmationData(updatedData);
      if (onConfirmedChange) onConfirmedChange(false, updatedData);
      if (toast) {
        toast.info(
          'Đã hủy chữ ký',
          `Bảng lương tháng ${displayMonthStr} của ${employee.name} đã được reset về chưa ký.`
        );
      }
    } catch (err) {
      console.error('Lỗi khi hủy ký:', err);
      if (toast) toast.error('Lỗi', 'Không thể hủy chữ ký lúc này, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  }

  const formatSignedTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${mins} • ${day}/${month}/${year}`;
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div
      className={`rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 border-2 transition-all shadow-sm ${
        confirmed
          ? 'bg-gradient-to-br from-emerald-50/95 via-teal-50/70 to-white border-emerald-500 ring-2 ring-emerald-400/40'
          : openForSigning
          ? 'bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-white border-purple-400 shadow-sm'
          : 'bg-slate-50/80 border-slate-200'
      }`}
    >
      {/* ========================================================
          1. ĐÃ KÝ XÁC NHẬN (Hiển thị hoài của tháng đó cho cả 2 bên)
         ======================================================== */}
      {confirmed ? (
        <div className="space-y-3.5 animate-fade-in">
          {/* Header cam kết */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-black text-xs sm:text-[13px] text-emerald-950 uppercase tracking-tight">
                  {isOwnerMode
                    ? `NHÂN VIÊN ĐÃ KÝ XÁC NHẬN BẢNG LƯƠNG THÁNG ${displayMonthStr}`
                    : 'TÔI ĐÃ KIỂM TRA KỸ BẢNG LƯƠNG, GIỜ LÀM, MỨC LƯƠNG VÀ HOÀN TOÀN ĐỒNG Ý THANH TOÁN.'}
                </span>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300 shrink-0">
                    <span>🔒</span> ĐÃ XÁC NHẬN & KHÓA
                  </span>

                  {/* Nút Hủy ký dành cho Chủ Quán trong Phiếu Tính Lương */}
                  {isOwnerMode && (
                    <button
                      type="button"
                      onClick={handleCancelConfirmation}
                      disabled={loading}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-rose-700 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 cursor-pointer transition-all active:scale-95 shrink-0 shadow-2xs"
                      title="Bấm để hủy chữ ký và reset cho nhân viên ký lại nếu cần sửa lương"
                    >
                      <span>✕</span> Hủy ký (Cho ký lại)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Khung hiển thị NÉT VẼ CHỮ KÝ THẬT CỦA NHÂN VIÊN */}
          <div className="p-3 sm:p-4 bg-white/90 rounded-2xl border border-emerald-300 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-col items-center sm:items-start">
              <div className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-1 flex items-center gap-1">
                <span>✍️</span> Chữ Ký Xác Nhận Điện Tử:
              </div>
              {confirmationData?.signature_image ? (
                <div className="p-1.5 bg-white rounded-xl border border-emerald-200 shadow-inner flex items-center justify-center min-w-[180px] max-w-[280px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={confirmationData.signature_image}
                    alt="Chữ ký nhân viên"
                    className="max-h-16 sm:max-h-20 w-auto object-contain"
                  />
                </div>
              ) : (
                <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 font-mono font-black text-sm italic">
                  🖋️ {confirmationData?.signed_by || employee?.name}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center sm:items-end text-right space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-500">Họ và tên:</span>
                <span className="px-3 py-1 rounded-xl bg-emerald-700 text-white font-mono font-black text-xs sm:text-sm tracking-wider uppercase shadow-xs border border-emerald-800">
                  {confirmationData?.signed_by || employee?.name}
                </span>
              </div>
              <div className="text-[10.5px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-lg border border-emerald-300">
                ✓ Đã xác nhận: {formatSignedTime(confirmationData?.signed_at)}
              </div>
            </div>
          </div>

          {/* Footer chứng thực điện tử */}
          <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between text-[10.5px] font-bold text-emerald-900/90 flex-wrap gap-1.5">
            <div className="flex items-center gap-1">
              <span>🛡️</span>
              <span>Chứng thực điện tử: Bảng lương tháng {displayMonthStr}</span>
            </div>
            <div className="font-mono font-black text-emerald-950 text-xs sm:text-sm">
              Thực nhận: {formatCurrency(confirmationData?.net_salary || netSalary)}
            </div>
          </div>
        </div>
      ) : isOwnerMode ? (
        /* ========================================================
           2. GIAO DIỆN CHỦ QUÁN (TRONG PHIẾU TÍNH LƯƠNG ADMIN)
           -> Chủ quyết định CÓ CHO PHÉP KÝ HAY KHÔNG
           ======================================================== */
        <div className="space-y-3">
          {/* TRƯỜNG HỢP A: CHỦ CHƯA CHO PHÉP KÝ */}
          {!openForSigning ? (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-purple-50 via-indigo-50/50 to-white rounded-2xl border-2 border-purple-200 shadow-2xs">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-700 to-indigo-800 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-700/30 text-lg">
                  🔒
                </div>
                <div>
                  <div className="font-black text-xs sm:text-[13px] text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
                    <span>QUYỀN KÝ BẢNG LƯƠNG THÁNG {displayMonthStr}</span>
                    <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                      Chưa mở ký
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5">
                    Nhân viên <b>{employee?.name}</b> chưa thấy ô ký tên trên điện thoại. Chủ quán kiểm tra kỹ số liệu trước khi mở quyền ký.
                  </p>
                </div>
              </div>

              {/* NÚT CỦA CHỦ: CHO PHÉP NHÂN VIÊN KÝ */}
              <button
                type="button"
                onClick={() => handleTogglePermission(true)}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-[13px] border-0 cursor-pointer shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0"
              >
                <span>🔓</span>
                <span>Cho Phép Nhân Viên Ký</span>
              </button>
            </div>
          ) : !isDirectSigning ? (
            /* TRƯỜNG HỢP B: CHỦ ĐÃ CHO PHÉP KÝ — ĐANG CHỜ NHÂN VIÊN KÝ */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-amber-50 via-emerald-50/40 to-white rounded-2xl border-2 border-amber-300 shadow-2xs">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30 text-lg animate-pulse">
                  ⏳
                </div>
                <div>
                  <div className="font-black text-xs sm:text-[13px] text-purple-950 uppercase tracking-tight flex items-center gap-1.5 flex-wrap">
                    <span>ĐÃ MỞ QUYỀN KÝ THÁNG {displayMonthStr}</span>
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      ✓ Đang chờ NV ký
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5">
                    Đã mở quyền ký cho <b>{employee?.name}</b>. Nhân viên có thể mở ứng dụng trên điện thoại để kiểm tra và ký xác nhận.
                  </p>
                </div>
              </div>

              {/* Hàng thao tác của Chủ */}
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setIsDirectSigning(true)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-black text-xs border border-purple-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 shadow-2xs"
                  title="Nếu nhân viên đang có mặt tại quán, có thể cho nhân viên vẽ ký trực tiếp tại đây"
                >
                  <span>✍️</span> Ký Tại Đây
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePermission(false)}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 shadow-2xs"
                  title="Thu hồi quyền ký nếu phát hiện sai sót cần chỉnh lại lương"
                >
                  <span>🔒</span> Khóa Quyền Ký
                </button>
              </div>
            </div>
          ) : (
            /* TRƯỜNG HỢP C: CHỦ MỞ Ô CHO NHÂN VIÊN KÝ TRỰC TIẾP TẠI MÁY CHỦ */
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="font-black text-xs sm:text-[13px] text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
                  <span>✍️</span> NHÂN VIÊN VẼ CHỮ KÝ TRỰC TIẾP — THÁNG {displayMonthStr}
                </span>
                <button
                  type="button"
                  onClick={() => setIsDirectSigning(false)}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-0.5 rounded-full border border-slate-300 cursor-pointer transition-colors"
                >
                  ✕ Thu gọn
                </button>
              </div>

              {/* Canvas Pad */}
              <div className="relative w-full rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-white shadow-inner overflow-hidden transition-colors">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  className="w-full h-28 sm:h-32 block bg-white cursor-crosshair"
                  style={{ touchAction: 'none' }}
                />
                <div className="absolute bottom-5 left-6 right-6 border-b border-dashed border-gray-300 pointer-events-none flex items-center justify-between text-[9.5px] font-bold text-gray-300 uppercase tracking-wider select-none">
                  <span>Chữ ký: {employee?.name}</span>
                  <span>✍️ Sign here</span>
                </div>
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 font-bold text-xs sm:text-[13px] italic select-none">
                    ✍️ Nhân viên dùng ngón tay hoặc chuột vẽ chữ ký vào đây...
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-100">
                <button
                  type="button"
                  onClick={clearSignature}
                  disabled={!hasDrawn || loading}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs border-0 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-40"
                >
                  <span>🧹</span> Xóa vẽ lại
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
                    Người ký: <b className="text-purple-950 uppercase">{employee?.name}</b>
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmSignature}
                    disabled={loading}
                    className="px-4.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-[13px] border-0 cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <span>🖋️</span> Ký Xác Nhận & Khóa Bảng Lương
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ========================================================
           3. GIAO DIỆN NHÂN VIÊN TRÊN ĐIỆN THOẠI (/nhanvien)
           -> CHỈ HIỂN THỊ KHI CHỦ ĐÃ CHO PHÉP KÝ
           ======================================================== */
        <div className="space-y-3">
          {/* TRƯỜNG HỢP A: CHỦ CHƯA CHO PHÉP KÝ -> HOÀN TOÀN KHÔNG HIỆN Ô KÝ */}
          {!openForSigning ? (
            <div className="flex items-center justify-between p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🔒</span>
                <div>
                  <div className="text-xs font-black text-slate-800 uppercase tracking-tight">
                    BẢNG LƯƠNG THÁNG {displayMonthStr} CHƯA MỞ KÝ
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">
                    Chủ quán / Quản lý đang rà soát ca làm. Ô ký tên sẽ tự động xuất hiện khi quản lý chốt duyệt.
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 font-black text-[10.5px] shrink-0">
                ⏳ Chờ mở ký
              </span>
            </div>
          ) : !isChecking ? (
            /* TRƯỜNG HỢP B: CHỦ ĐÃ CHO PHÉP KÝ -> HIỆN NÚT KIỂM TRA LƯƠNG */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 bg-gradient-to-r from-purple-50 via-indigo-50/40 to-white rounded-2xl border-2 border-purple-300 shadow-2xs">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-600/30 text-lg">
                  🔔
                </div>
                <div>
                  <div className="font-black text-xs sm:text-[13px] text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
                    <span>✍️</span> QUẢN LÝ ĐÃ MỞ QUYỀN KÝ THÁNG {displayMonthStr}
                  </div>
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5">
                    Vui lòng bấm kiểm tra kỹ ca làm, phụ cấp và thực nhận trước khi ký tên.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsChecking(true)}
                disabled={loading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 hover:from-purple-800 hover:to-indigo-800 text-white font-black text-xs sm:text-[13px] border-0 cursor-pointer shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0"
              >
                <span>🔍</span>
                <span>Kiểm Tra Lương & Ký Tên</span>
              </button>
            </div>
          ) : (
            /* TRƯỜNG HỢP C: NHÂN VIÊN ĐÃ BẤM KIỂM TRA LƯƠNG -> BUNG KHUNG VẼ CHỮ KÝ TAY */
            <div className="space-y-3 animate-fade-in">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs sm:text-[13px] text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
                    <span>✍️</span> VẼ CHỮ KÝ XÁC NHẬN BẢNG LƯƠNG THÁNG {displayMonthStr}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsChecking(false)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-0.5 rounded-full border border-slate-300 cursor-pointer transition-colors"
                  >
                    ✕ Đóng lại
                  </button>
                </div>
                <p className="text-[11px] sm:text-xs font-semibold text-slate-600">
                  Tôi đã kiểm tra kỹ bảng lương, giờ làm, mức lương và hoàn toàn đồng ý thanh toán bảng lương này.
                </p>
              </div>

              {/* Canvas Pad */}
              <div className="relative w-full rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-500 bg-white shadow-inner overflow-hidden transition-colors">
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  className="w-full h-28 sm:h-32 block bg-white cursor-crosshair"
                  style={{ touchAction: 'none' }}
                />
                <div className="absolute bottom-5 left-6 right-6 border-b border-dashed border-gray-300 pointer-events-none flex items-center justify-between text-[9.5px] font-bold text-gray-300 uppercase tracking-wider select-none">
                  <span>Chữ ký nhân viên</span>
                  <span>✍️ Sign here</span>
                </div>
                {!hasDrawn && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 font-bold text-xs sm:text-[13px] italic select-none">
                    ✍️ Dùng ngón tay hoặc chuột vẽ chữ ký vào đây...
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-100">
                <button
                  type="button"
                  onClick={clearSignature}
                  disabled={!hasDrawn || loading}
                  className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs border-0 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-40"
                >
                  <span>🧹</span> Xóa vẽ lại
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[11px] font-bold text-slate-500 hidden sm:inline">
                    Người ký: <b className="text-purple-950 uppercase">{employee?.name}</b>
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmSignature}
                    disabled={loading}
                    className="px-4.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-[13px] border-0 cursor-pointer shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <span>🖋️</span> Ký Xác Nhận Bảng Lương
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAllShiftSwaps, updateShiftSwapStatus } from '@/lib/supabase';
import { formatDateWithDayVN, getCurrentMonth } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function AdminShiftSwapManager() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'time_change' | 'swap'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected'

  // Rejection Modal State
  const [rejectingSwap, setRejectingSwap] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Telegram Bot Config Modal State
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');
  const [fetchingChatId, setFetchingChatId] = useState(false);

  function handleOpenTelegramModal() {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('chems_telegram_bot_token');
      const savedChatId = localStorage.getItem('chems_telegram_chat_id');
      const token = (savedToken && !savedToken.startsWith('8514257668')) ? savedToken : '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8';
      const chatId = (savedChatId && savedChatId !== '5766522088') ? savedChatId : '5616165281';
      setTgBotToken(token);
      setTgChatId(chatId);
      localStorage.setItem('chems_telegram_bot_token', token);
      localStorage.setItem('chems_telegram_chat_id', chatId);
    }
    setShowTelegramModal(true);
  }

  async function handleAutoFetchChatId() {
    const token = tgBotToken.trim() || '8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8';
    setFetchingChatId(true);
    try {
      const res = await fetch(`/api/telegram/get-updates?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data && data.ok && Array.isArray(data.result) && data.result.length > 0) {
        const lastMsg = data.result[data.result.length - 1];
        const detectedChatId = lastMsg.message?.chat?.id || lastMsg.my_chat_member?.chat?.id || lastMsg.channel_post?.chat?.id;
        if (detectedChatId) {
          setTgChatId(String(detectedChatId));
          toast.success('Bắt thành công!', `Đã phát hiện Chat ID: ${detectedChatId}`);
        } else {
          toast.warning('Chưa có tin nhắn', 'Hãy bấm START hoặc gửi 1 tin nhắn bất kỳ tới Bot rồi bấm lại nhé!');
        }
      } else {
        toast.warning('Chưa thấy tin nhắn', 'Hãy mở Telegram, bấm START cho Bot rồi bấm lại nút này nhé!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể kết nối Telegram Bot!');
    } finally {
      setFetchingChatId(false);
    }
  }

  function handleSaveTelegramConfig(e) {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('chems_telegram_bot_token', tgBotToken.trim());
      localStorage.setItem('chems_telegram_chat_id', tgChatId.trim());
    }
    toast.success('Đã lưu Telegram Bot', 'Đã cài đặt Bot Token & Chat ID thành công!');
    setShowTelegramModal(false);
  }

  useEffect(() => {
    loadSwaps();
  }, []);

  async function loadSwaps() {
    setLoading(true);
    try {
      const data = await getAllShiftSwaps();
      setSwaps(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleApproveSwap(swap) {
    const isTimeChange = swap.request_type === 'time_change';
    const confirmMsg = isTimeChange
      ? `Duyệt giờ làm cho ${swap.requester_name}? (${swap.adjusted_time || swap.target_shift_info})`
      : `Đồng ý đổi ca giữa ${swap.requester_name} và ${swap.target_employee_name}?`;

    if (!confirm(confirmMsg)) return;

    try {
      await updateShiftSwapStatus(swap.id, 'approved');
      toast.success(
        'Đã Duyệt',
        isTimeChange
          ? `Đã duyệt giờ làm cho ${swap.requester_name}.`
          : `Đã duyệt đổi ca cho ${swap.requester_name}.`
      );
      loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể duyệt yêu cầu.');
    }
  }

  function handleOpenRejectModal(swap) {
    setRejectingSwap(swap);
    setRejectionReason('');
  }

  async function handleConfirmReject() {
    if (!rejectionReason.trim()) {
      toast.warning('Chưa nhập lý do', 'Vui lòng nhập lý do từ chối.');
      return;
    }

    setSubmitting(true);
    try {
      await updateShiftSwapStatus(rejectingSwap.id, 'rejected', rejectionReason.trim());
      toast.info('Đã Từ Chối', `Đã từ chối yêu cầu của ${rejectingSwap.requester_name}.`);
      setRejectingSwap(null);
      loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể gửi lý do từ chối.');
    } finally {
      setSubmitting(false);
    }
  }

  // Lọc theo Tháng
  const monthSwaps = useMemo(() => {
    return (swaps || []).filter((s) => {
      if (!s.shift_date) return false;
      return s.shift_date.startsWith(filterMonth);
    });
  }, [swaps, filterMonth]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = monthSwaps.length;
    const pending = monthSwaps.filter((s) => s.status === 'pending').length;
    const timeChange = monthSwaps.filter((s) => s.request_type === 'time_change').length;
    const swap = monthSwaps.filter((s) => s.request_type !== 'time_change').length;
    const approved = monthSwaps.filter((s) => s.status === 'approved').length;
    const rejected = monthSwaps.filter((s) => s.status === 'rejected').length;
    return { total, pending, timeChange, swap, approved, rejected };
  }, [monthSwaps]);

  // Lọc kết hợp Type và Status
  const filteredSwaps = useMemo(() => {
    return monthSwaps.filter((s) => {
      if (typeFilter === 'time_change' && s.request_type !== 'time_change') return false;
      if (typeFilter === 'swap' && s.request_type === 'time_change') return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      return true;
    });
  }, [monthSwaps, typeFilter, statusFilter]);

  const sortByNewest = (a, b) => {
    const dateA = new Date(a.shift_date || a.created_at).getTime();
    const dateB = new Date(b.shift_date || b.created_at).getTime();
    return dateB - dateA;
  };

  const pendingSwaps = filteredSwaps.filter((s) => s.status === 'pending').sort(sortByNewest);
  const approvedSwaps = filteredSwaps.filter((s) => s.status === 'approved').sort(sortByNewest);
  const rejectedSwaps = filteredSwaps.filter((s) => s.status === 'rejected').sort(sortByNewest);

  // Helper render Thẻ Yêu Cầu Quản Lý
  function renderAdminTicketCard(swap) {
    const isTimeChange = swap.request_type === 'time_change';
    let typeBadgeText = 'ĐỔI CA';
    let typeBadgeClass = 'bg-purple-700 text-white';

    if (isTimeChange) {
      if (swap.time_change_type === 'overtime') {
        typeBadgeText = `TĂNG CA ${swap.extra_hours ? `(+${swap.extra_hours}h)` : ''}`;
        typeBadgeClass = 'bg-emerald-700 text-white';
      } else if (swap.time_change_type === 'early_leave') {
        typeBadgeText = `VỀ SỚM ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
        typeBadgeClass = 'bg-amber-600 text-white';
      } else if (swap.time_change_type === 'late_arrival') {
        typeBadgeText = `ĐI TRỄ ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
        typeBadgeClass = 'bg-sky-600 text-white';
      } else {
        typeBadgeText = `ĐỔI GIỜ ${swap.extra_hours ? `(${swap.extra_hours > 0 ? `+${swap.extra_hours}` : swap.extra_hours}h)` : ''}`;
        typeBadgeClass = 'bg-purple-800 text-white';
      }
    }

    const isPending = swap.status === 'pending';
    const isApproved = swap.status === 'approved';

    const cardBg = isPending
      ? 'bg-amber-50/90 border-2 border-amber-300'
      : isApproved
      ? 'bg-emerald-50/90 border-2 border-emerald-400'
      : 'bg-rose-50/90 border-2 border-rose-400';

    return (
      <div key={swap.id} className={`p-4 rounded-3xl shadow-2xs space-y-3 relative transition-all ${cardBg}`}>
        {/* Header Thẻ */}
        <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow-2xs ${typeBadgeClass}`}>
              {typeBadgeText}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                isPending ? 'bg-amber-200 text-amber-900' : isApproved ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
              }`}
            >
              {isPending ? 'Chờ Duyệt' : isApproved ? 'Đã Duyệt' : 'Từ Chối'}
            </span>
          </div>
          <span className="text-xs text-purple-950 font-black bg-white px-2.5 py-0.5 rounded-xl border border-purple-200 shadow-2xs">
            {formatDateWithDayVN(swap.shift_date)}
          </span>
        </div>

        {/* Nội dung chi tiết */}
        <div className="space-y-1.5 text-xs text-purple-950 font-bold">
          {isTimeChange ? (
            <>
              <p><strong>Nhân viên:</strong> <span className="text-purple-950 font-black text-sm">{swap.requester_name}</span></p>
              <p><strong>Ca gốc:</strong> <span className="text-purple-700 font-extrabold">{swap.original_time || swap.my_shift_info || 'Không rõ'}</span></p>
              <p><strong>Thực tế:</strong> <span className="text-emerald-800 font-black">{swap.adjusted_time || swap.target_shift_info || 'Chưa nhập'}</span></p>
              {swap.extra_hours && (
                <p>
                  <strong>Chênh lệch:</strong>{' '}
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-black">
                    {Number(swap.extra_hours) > 0 ? `+${swap.extra_hours}h (Tăng ca)` : `${swap.extra_hours}h (Về sớm)`}
                  </span>
                </p>
              )}
            </>
          ) : (
            <>
              <p><strong>Nhờ đổi:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
              <p><strong>Đổi với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
            </>
          )}

          <div className="pt-1">
            <p className="text-purple-900 italic bg-white/80 p-2.5 rounded-2xl border border-purple-200/60">
              <strong>Lý do:</strong> &quot;{swap.reason}&quot;
            </p>
          </div>

          {swap.status === 'rejected' && swap.rejection_reason && (
            <div className="p-2.5 bg-rose-100 rounded-2xl border border-rose-300 text-rose-950 text-xs font-black mt-2 space-y-0.5">
              <p className="text-rose-900 font-black">
                Lý do từ chối:
              </p>
              <p className="text-rose-800 italic">&quot;{swap.rejection_reason}&quot;</p>
            </div>
          )}
        </div>

        {/* Action Buttons nếu đang Chờ Duyệt */}
        {isPending && (
          <div className="pt-2 flex items-center gap-2 border-t border-black/10">
            <button
              type="button"
              onClick={() => handleApproveSwap(swap)}
              className="flex-1 py-2 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 border-0"
            >
              Duyệt
            </button>
            <button
              type="button"
              onClick={() => handleOpenRejectModal(swap)}
              className="flex-1 py-2 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all cursor-pointer shadow-md active:scale-95 border-0"
            >
              Từ Chối
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header Box & Quick Actions */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-purple-950">
              Quản Lý Yêu Cầu Ca Làm
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenTelegramModal}
              className="px-3.5 py-2 rounded-2xl bg-sky-100 hover:bg-sky-200 text-sky-950 text-xs font-black transition-all cursor-pointer border border-sky-300 shadow-2xs"
            >
              Cấu Hình Telegram
            </button>
            <button
              type="button"
              onClick={loadSwaps}
              className="px-3.5 py-2 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-black transition-all cursor-pointer border-0"
            >
              Làm Mới
            </button>
          </div>
        </div>

        {/* 4 THẺ THỐNG KÊ NHANH */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-center">
            <div className="text-[10px] font-bold text-amber-800 uppercase">Chờ duyệt</div>
            <div className="text-lg sm:text-xl font-black text-amber-900">{stats.pending}</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-[10px] font-bold text-emerald-800 uppercase">Báo giờ</div>
            <div className="text-lg sm:text-xl font-black text-emerald-900">{stats.timeChange}</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 text-center">
            <div className="text-[10px] font-bold text-purple-800 uppercase">Đổi ca</div>
            <div className="text-lg sm:text-xl font-black text-purple-900">{stats.swap}</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <div className="text-[10px] font-bold text-slate-700 uppercase">Đã duyệt</div>
            <div className="text-lg sm:text-xl font-black text-slate-900">{stats.approved}</div>
          </div>
        </div>

        {/* BỘ LỌC THÁNG & BỘ LỌC PHÂN LOẠI */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-purple-100">
          {/* Bộ chọn tháng */}
          <div className="flex items-center justify-between gap-2 bg-purple-50 px-3 py-1.5 rounded-2xl border border-purple-200/80">
            <button
              type="button"
              onClick={() => {
                const [y, m] = filterMonth.split('-').map(Number);
                const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
                setFilterMonth(prev);
              }}
              className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
            >
              ◀
            </button>
            <span className="text-xs sm:text-sm font-black text-purple-900">
              Tháng {filterMonth.split('-')[1]}/{filterMonth.split('-')[0]}
            </span>
            <button
              type="button"
              onClick={() => {
                const [y, m] = filterMonth.split('-').map(Number);
                const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
                setFilterMonth(next);
              }}
              className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
            >
              ▶
            </button>
          </div>

          {/* Bộ lọc Loại Ticket */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                typeFilter === 'all'
                  ? 'bg-purple-700 text-white border-purple-800 shadow-2xs'
                  : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
              }`}
            >
              Tất Cả ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('time_change')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                typeFilter === 'time_change'
                  ? 'bg-emerald-700 text-white border-emerald-800 shadow-2xs'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              Báo Giờ ({stats.timeChange})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('swap')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                typeFilter === 'swap'
                  ? 'bg-purple-700 text-white border-purple-800 shadow-2xs'
                  : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
              }`}
            >
              Đổi Ca ({stats.swap})
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mb-2" />
          <p className="text-xs font-black text-purple-900">Đang tải...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: YÊU CẦU ĐANG CHỜ DUYỆT (PENDING) */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wider bg-amber-100/90 px-3.5 py-1.5 rounded-2xl border border-amber-300 w-fit">
              Chờ Duyệt ({pendingSwaps.length})
            </h3>

            {pendingSwaps.length === 0 ? (
              <div className="p-6 bg-white rounded-3xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                Không có yêu cầu nào chờ duyệt.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingSwaps.map(renderAdminTicketCard)}
              </div>
            )}
          </div>

          {/* Section 2: LỊCH SỬ ĐÃ DUYỆT */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider bg-emerald-100/90 px-3.5 py-1.5 rounded-2xl border border-emerald-300 w-fit">
              Đã Duyệt ({approvedSwaps.length})
            </h3>

            {approvedSwaps.length === 0 ? (
              <div className="p-4 bg-white rounded-3xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                Chưa có yêu cầu nào được duyệt.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {approvedSwaps.map(renderAdminTicketCard)}
              </div>
            )}
          </div>

          {/* Section 3: LỊCH SỬ TỪ CHỐI */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-black text-rose-950 uppercase tracking-wider bg-rose-100/90 px-3.5 py-1.5 rounded-2xl border border-rose-300 w-fit">
              Từ Chối ({rejectedSwaps.length})
            </h3>

            {rejectedSwaps.length === 0 ? (
              <div className="p-4 bg-white rounded-3xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                Không có yêu cầu nào bị từ chối.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rejectedSwaps.map(renderAdminTicketCard)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL TỪ CHỐI VÀ NHẬP LÝ DO GỬI NHÂN VIÊN */}
      {mounted && rejectingSwap && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative max-w-md w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-rose-300 animate-scale-in my-auto">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <div>
                <h3 className="font-black text-base text-rose-950">Từ Chối Yêu Cầu</h3>
                <p className="text-[11px] text-rose-700 font-bold">Gửi phản hồi cho {rejectingSwap.requester_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setRejectingSwap(null)}
                className="w-8 h-8 rounded-full bg-rose-100 text-rose-900 font-black text-sm flex items-center justify-center border-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-rose-950 text-xs space-y-1 font-bold">
              <p>Ngày làm việc: <strong>{formatDateWithDayVN(rejectingSwap.shift_date)}</strong></p>
              <p>Lý do nhân viên viết: <em>&quot;{rejectingSwap.reason}&quot;</em></p>
            </div>

            <div>
              <label className="block text-xs font-black text-rose-950 mb-1">
                Lý do từ chối <span className="text-rose-500">*</span>:
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="VD: Ngày này quán đông khách không đủ người phụ, hoặc khung giờ này đã có bạn khác làm..."
                className="w-full px-3.5 py-2.5 bg-rose-50/50 border border-rose-300 focus:border-rose-600 rounded-2xl text-rose-950 text-xs font-bold outline-none resize-none shadow-2xs"
                autoFocus
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingSwap(null)}
                className="px-4 py-2.5 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold text-xs border-0 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmReject}
                className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs border-0 cursor-pointer shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {submitting ? 'Đang gửi...' : 'Gửi Từ Chối'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL CẤU HÌNH BOT TELEGRAM */}
      {mounted && showTelegramModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-sky-300 animate-scale-in my-auto">
            <div className="flex items-center justify-between border-b border-sky-100 pb-3">
              <div>
                <h3 className="font-black text-base text-sky-950">Cài Đặt Telegram Bot</h3>
                <p className="text-[11px] text-sky-700 font-bold">Nhận thông báo khi có ticket mới</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTelegramModal(false)}
                className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-sm flex items-center justify-center border-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTelegramConfig} className="space-y-3.5 text-xs">
              <div className="p-3 bg-sky-50 rounded-2xl border border-sky-200 text-sky-950 font-bold space-y-1">
                <p className="font-black text-sky-900">
                  Telegram Bot Thông Báo Tự Động
                </p>
                <p className="text-[11px]">
                  Mỗi khi nhân viên gửi ticket đổi ca hoặc báo làm thêm/về sớm, Bot Telegram sẽ tự động gửi tin nhắn tới Telegram của Quản Lý.
                </p>
              </div>

              <div>
                <label className="block font-black text-purple-950 mb-1">Telegram Bot Token:</label>
                <input
                  type="text"
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  placeholder="VD: 8840577376:AAFLKRa3e8e4wXFcu6hVXBuI6fJdo4WbPR8"
                  className="w-full px-3 py-2 bg-purple-50 border border-purple-200 focus:border-sky-500 rounded-xl text-purple-950 font-bold outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-black text-purple-950">Chat ID Telegram Quản Lý:</label>
                  <button
                    type="button"
                    onClick={handleAutoFetchChatId}
                    disabled={fetchingChatId}
                    className="text-[11px] font-black text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    {fetchingChatId ? 'Đang quét...' : 'Tự động tìm Chat ID'}
                  </button>
                </div>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="VD: 5616165281"
                  className="w-full px-3 py-2 bg-purple-50 border border-purple-200 focus:border-sky-500 rounded-xl text-purple-950 font-bold outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTelegramModal(false)}
                  className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-bold border-0 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black border-0 cursor-pointer shadow-2xs"
                >
                  Lưu Cấu Hình
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

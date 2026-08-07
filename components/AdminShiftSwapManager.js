'use client';

import { useState, useEffect } from 'react';
import { getAllShiftSwaps, updateShiftSwapStatus } from '@/lib/supabase';
import { formatDateFull } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function AdminShiftSwapManager() {
  const toast = useToast();
  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);

  // Rejection Modal State
  const [rejectingSwap, setRejectingSwap] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    if (!confirm(`Xác nhận ĐỒNG Ý yêu cầu đổi ca giữa ${swap.requester_name} và ${swap.target_employee_name}?`)) return;

    try {
      await updateShiftSwapStatus(swap.id, 'approved');
      toast.success('Đã Phê Duyệt', `Đã đồng ý cho ca đổi của ${swap.requester_name}! Bạn hãy xếp lại lịch phân công bằng tay nhé.`);
      loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể phê duyệt yêu cầu đổi ca.');
    }
  }

  function handleOpenRejectModal(swap) {
    setRejectingSwap(swap);
    setRejectionReason('');
  }

  async function handleConfirmReject() {
    if (!rejectionReason.trim()) {
      toast.warning('Thiếu lý do', 'Vui lòng nhập lý do từ chối để nhân viên nắm thông tin!');
      return;
    }

    setSubmitting(true);
    try {
      await updateShiftSwapStatus(rejectingSwap.id, 'rejected', rejectionReason.trim());
      toast.info('Đã Từ Chối', `Đã từ chối yêu cầu đổi ca của ${rejectingSwap.requester_name}.`);
      setRejectingSwap(null);
      loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể gửi lý do từ chối.');
    } finally {
      setSubmitting(false);
    }
  }

  const pendingSwaps = swaps.filter((s) => s.status === 'pending');
  const historySwaps = swaps.filter((s) => s.status !== 'pending');

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-200 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-purple-950 flex items-center gap-2">
            <span>🔄</span>
            <span>Quản Lý Yêu Cầu Đổi Ca</span>
          </h2>
          <p className="text-xs text-purple-700 font-bold mt-0.5">
            Duyệt các yêu cầu đổi ca từ nhân viên. Khi duyệt thành công, Chủ quán sẽ điều chỉnh ca trên lịch phân công bằng tay.
          </p>
        </div>
        <button
          type="button"
          onClick={loadSwaps}
          className="px-3.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-black transition-all cursor-pointer flex items-center gap-1"
        >
          <span>🔄</span>
          <span>Làm mới danh sách</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mb-2" />
          <p className="text-xs font-black text-purple-900">Đang tải danh sách yêu cầu đổi ca...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Section 1: YÊU CẦU ĐANG CHỜ DUYỆT (PENDING) */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <span>⏳</span>
              <span>Yêu cầu đang chờ phê duyệt ({pendingSwaps.length})</span>
            </h3>

            {pendingSwaps.length === 0 ? (
              <div className="p-6 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                Không có yêu cầu đổi ca nào đang chờ duyệt.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingSwaps.map((swap) => (
                  <div
                    key={swap.id}
                    className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 shadow-xs space-y-3 relative"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase shadow-2xs">
                        ⏳ Chờ Chủ Duyệt
                      </span>
                      <span className="text-[11px] text-amber-900 font-extrabold">
                        📅 Ngày đổi: {formatDateFull(swap.shift_date)}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-amber-950 font-bold">
                      <p>
                        👤 <strong>Người gửi:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)
                      </p>
                      <p>
                        🔄 <strong>Muốn đổi với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)
                      </p>
                      <p className="pt-1 text-amber-900 italic bg-amber-100/70 p-2 rounded-xl">
                        💬 <strong>Lý do:</strong> &quot;{swap.reason}&quot;
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 flex items-center gap-2 border-t border-amber-200/80">
                      <button
                        type="button"
                        onClick={() => handleApproveSwap(swap)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-1 border-0"
                      >
                        <span>✅</span>
                        <span>Đồng Ý</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRejectModal(swap)}
                        className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-1 border-0"
                      >
                        <span>❌</span>
                        <span>Từ Chối (Viết Lý Do)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: LỊCH SỬ ĐÃ XỬ LÝ (APPROVED / REJECTED) */}
          <div className="space-y-3 pt-3">
            <h3 className="text-sm font-black text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <span>📜</span>
              <span>Lịch sử yêu cầu đã xử lý ({historySwaps.length})</span>
            </h3>

            {historySwaps.length === 0 ? (
              <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                Chưa có lịch sử yêu cầu đổi ca.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {historySwaps.map((swap) => {
                  const isApproved = swap.status === 'approved';
                  return (
                    <div
                      key={swap.id}
                      className={`p-4 rounded-2xl border-2 shadow-2xs space-y-2.5 ${
                        isApproved
                          ? 'bg-emerald-50/80 border-emerald-300'
                          : 'bg-rose-50/80 border-rose-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b pb-2 border-purple-100">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white shadow-2xs ${
                            isApproved ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        >
                          {isApproved ? '✅ Đã Đồng Ý' : '❌ Đã Từ Chối'}
                        </span>
                        <span className="text-[11px] text-purple-900 font-extrabold">
                          📅 {formatDateFull(swap.shift_date)}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-purple-950 font-bold">
                        <p>
                          👤 <strong>{swap.requester_name}</strong> ↔ <strong>{swap.target_employee_name}</strong>
                        </p>
                        <p className="text-[11px] text-purple-800">
                          Ca {swap.requester_name}: <span className="font-extrabold">{swap.my_shift_info}</span> | Ca {swap.target_employee_name}: <span className="font-extrabold">{swap.target_shift_info}</span>
                        </p>
                        <p className="text-purple-700 italic text-[11px]">💬 Lý do: &quot;{swap.reason}&quot;</p>

                        {!isApproved && swap.rejection_reason && (
                          <div className="p-2 bg-rose-100/90 rounded-xl border border-rose-200 text-rose-950 text-[11px] font-black mt-1">
                            📌 <strong>Lý do từ chối của Chủ:</strong> &quot;{swap.rejection_reason}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPUP NHẬP LÝ DO TỪ CHỐI DUYỆT ĐỔI CA */}
      {rejectingSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative max-w-md w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-rose-300 animate-scale-in">
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <h3 className="font-black text-rose-900 text-base flex items-center gap-1.5">
                <span>❌</span>
                <span>Từ Chối Đổi Ca ({rejectingSwap.requester_name})</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectingSwap(null)}
                className="w-7 h-7 rounded-full bg-purple-100 text-purple-900 font-black text-xs flex items-center justify-center hover:bg-purple-200 cursor-pointer border-0"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-black text-purple-950">
                Viết lý do từ chối để nhân viên nắm thông tin <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ví dụ: Ca làm ngày này quá đông khách không đủ nhân sự xoay ca..."
                className="w-full px-3 py-2 bg-white border border-purple-200 focus:border-rose-500 rounded-xl text-purple-950 text-xs font-bold outline-none resize-none shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingSwap(null)}
                className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs hover:bg-purple-200 border-0 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md cursor-pointer border-0 active:scale-95 transition-all"
              >
                {submitting ? 'Đang gửi...' : 'Xác Nhận Từ Chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

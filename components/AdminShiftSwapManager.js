'use client';

import { useState, useEffect, useMemo } from 'react';
import { getAllShiftSwaps, updateShiftSwapStatus } from '@/lib/supabase';
import { formatDateWithDayVN, getCurrentMonth } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function AdminShiftSwapManager() {
  const toast = useToast();
  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth());

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
      setTgBotToken(localStorage.getItem('chems_telegram_bot_token') || '8514257668:AAFjq2t3a9p--jmwLomShVX4HSOJ8WNyIGw');
      setTgChatId(localStorage.getItem('chems_telegram_chat_id') || '5766522088');
    }
    setShowTelegramModal(true);
  }

  async function handleAutoFetchChatId() {
    const token = tgBotToken.trim() || '8514257668:AAFjq2t3a9p--jmwLomShVX4HSOJ8WNyIGw';
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

  const filteredSwaps = useMemo(() => {
    return (swaps || []).filter((s) => {
      if (!s.shift_date) return false;
      return s.shift_date.startsWith(filterMonth);
    });
  }, [swaps, filterMonth]);

  const pendingSwaps = filteredSwaps.filter((s) => s.status === 'pending');
  const historySwaps = filteredSwaps.filter((s) => s.status !== 'pending');

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header Box */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-purple-950 flex items-center gap-2">
              <span>🔄</span>
              <span>Quản Lý Yêu Cầu Đổi Ca</span>
            </h2>
            <p className="text-xs text-purple-700 font-bold mt-0.5">
              Duyệt các yêu cầu đổi ca từ nhân viên. Khi duyệt thành công, Quản lý sẽ điều chỉnh ca trên lịch phân công bằng tay.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleOpenTelegramModal}
              className="px-3.5 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-950 text-xs font-black transition-all cursor-pointer flex items-center gap-1 border border-sky-300 shadow-2xs"
            >
              <span>🤖</span>
              <span>Telegram Bot</span>
            </button>
            <button
              type="button"
              onClick={loadSwaps}
              className="px-3.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-black transition-all cursor-pointer flex items-center gap-1 border-0"
            >
              <span>🔄</span>
              <span>Làm mới danh sách</span>
            </button>
          </div>
        </div>

        {/* BỘ LỌC THEO THÁNG DÀNH CHO ADMIN */}
        <div className="flex items-center justify-between gap-2 bg-purple-50 px-3 py-2 rounded-xl border border-purple-200/80">
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
            📅 Tháng {filterMonth.split('-')[1]}/{filterMonth.split('-')[0]}
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
                      <span className="text-[11px] text-amber-950 font-black bg-amber-100/90 px-2.5 py-0.5 rounded-lg border border-amber-300">
                        📅 {formatDateWithDayVN(swap.shift_date)}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-amber-950 font-bold">
                      <p>
                        👤 <strong>Nhân viên xin nhờ làm hộ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)
                      </p>
                      <p>
                        🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)
                      </p>
                      <p className="pt-1 text-amber-900 italic bg-amber-100/70 p-2 rounded-xl">
                        💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;
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

          {/* Section 2 & 3: LỊCH SỬ ĐÃ DUYỆT ĐỒNG Ý VS TỪ CHỐI (SẮP XẾP MỚI NHẤT LÊN ĐẦU) */}
          {(() => {
            const sortByNewest = (a, b) => {
              const dateA = new Date(a.shift_date || a.created_at).getTime();
              const dateB = new Date(b.shift_date || b.created_at).getTime();
              return dateB - dateA;
            };

            const approvedSwaps = historySwaps.filter((s) => s.status === 'approved').sort(sortByNewest);
            const rejectedSwaps = historySwaps.filter((s) => s.status === 'rejected').sort(sortByNewest);

            return (
              <div className="space-y-5 pt-3">
                {/* NHÓM 1: ĐÃ ĐƯỢC ĐỒNG Ý */}
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5 bg-emerald-100/80 px-3 py-1.5 rounded-xl border border-emerald-200 w-fit">
                    <span>✅</span>
                    <span>Lịch sử Yêu Cầu Đã Được Đồng Ý ({approvedSwaps.length})</span>
                  </h3>

                  {approvedSwaps.length === 0 ? (
                    <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                      Chưa có yêu cầu nào được đồng ý.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {approvedSwaps.map((swap) => (
                        <div
                          key={swap.id}
                          className="p-4 rounded-2xl bg-emerald-50/90 border-2 border-emerald-400 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2 border-b pb-2 border-emerald-200">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white bg-emerald-600 shadow-2xs">
                              ✅ ĐÃ ĐỒNG Ý
                            </span>
                            <span className="text-xs text-emerald-950 font-black bg-white px-2.5 py-0.5 rounded-lg border border-emerald-300">
                              📅 {formatDateWithDayVN(swap.shift_date)}
                            </span>
                          </div>

                          <div className="space-y-1 text-xs text-purple-950 font-bold">
                            <p>
                              👤 <strong>Nhân viên nhờ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)
                            </p>
                            <p>
                              🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)
                            </p>
                            <p className="text-purple-800 italic pt-0.5">💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* NHÓM 2: ĐÃ BỊ TỪ CHỐI */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5 bg-rose-100/80 px-3 py-1.5 rounded-xl border border-rose-200 w-fit">
                    <span>❌</span>
                    <span>Lịch sử Yêu Cầu Đã Bị Từ Chối ({rejectedSwaps.length})</span>
                  </h3>

                  {rejectedSwaps.length === 0 ? (
                    <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                      Chưa có yêu cầu nào bị từ chối.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {rejectedSwaps.map((swap) => (
                        <div
                          key={swap.id}
                          className="p-4 rounded-2xl bg-rose-50/90 border-2 border-rose-400 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2 border-b pb-2 border-rose-200">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white bg-rose-600 shadow-2xs">
                              ❌ ĐÃ TỪ CHỐI
                            </span>
                            <span className="text-xs text-rose-950 font-black bg-white px-2.5 py-0.5 rounded-lg border border-rose-300">
                              📅 {formatDateWithDayVN(swap.shift_date)}
                            </span>
                          </div>

                          <div className="space-y-1 text-xs text-purple-950 font-bold">
                            <p>
                              👤 <strong>Nhân viên nhờ:</strong> <span className="text-purple-950 font-black">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)
                            </p>
                            <p>
                              🤝 <strong>Nhờ làm hộ / Đổi ca với:</strong> <span className="text-orange-700 font-black">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)
                            </p>
                            <p className="text-purple-800 italic pt-0.5">💬 <strong>Lý do xin đổi:</strong> &quot;{swap.reason}&quot;</p>

                            {swap.rejection_reason && (
                              <div className="p-2.5 bg-rose-100 rounded-xl border border-rose-300 text-rose-950 text-xs font-black mt-2 space-y-0.5">
                                <p className="text-rose-900 font-black flex items-center gap-1">
                                  <span>📢</span>
                                  <span>LÝ DO TỪ CHỐI DO QUẢN LÝ VIẾT:</span>
                                </p>
                                <p className="text-rose-800 italic">&quot;{swap.rejection_reason}&quot;</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
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

      {/* POPUP CẤU HÌNH BOT TELEGRAM THÔNG BÁO TỰ ĐỘNG */}
      {showTelegramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in">
          <div className="relative max-w-md w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-sky-300 animate-scale-in">
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <h3 className="font-black text-purple-950 text-base">Cấu Hình Bot Telegram Thông Báo</h3>
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
                <p className="font-black text-sky-900 flex items-center gap-1">
                  <span>💡</span> Telegram Bot Thông Báo Đổi Ca Tự Động
                </p>
                <p className="text-[11px]">
                  Mỗi khi nhân viên bấm gửi ticket đổi ca, Bot Telegram sẽ tự động bắn tin nhắn thông báo chi tiết ca đổi tới Telegram của Quản Lý!
                </p>
              </div>

              <div>
                <label className="block font-black text-purple-950 mb-1">🔑 Telegram Bot Token:</label>
                <input
                  type="text"
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  placeholder="VD: 7412345678:AAEg_ExampleToken..."
                  className="w-full px-3 py-2 bg-purple-50 border border-purple-200 focus:border-sky-500 rounded-xl text-purple-950 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-black text-purple-950 mb-1">📢 Chat ID Telegram Quản Lý:</label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  placeholder="VD: 5766522088"
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
                  💾 Lưu Cấu Hình Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

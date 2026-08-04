'use client';

import { useState, useEffect } from 'react';
import { getEmployees, updateEmployeePin } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';

/**
 * EmployeeSelector — Màn hình Chọn Nhân Viên + Bảo mật PIN 4 số.
 * - Tự động nhận diện thiết bị chính chủ từ localStorage (không phải nhập lại).
 * - Bàn phím số PIN 4 số siêu to dễ bấm cho cả người già.
 * - Hỗ trợ khởi tạo PIN lần đầu tiên nếu chưa có.
 */
export default function EmployeeSelector({ onSelect, loading: parentLoading }) {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Flow State
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Employee for PIN Auth
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Khi bấm chọn 1 Nhân viên từ danh sách
  function handleSelectEmployeeCard(emp) {
    const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);
    const actualPin = emp.pin || '123456';

    if (savedPin === actualPin) {
      // Đúng máy chính chủ -> Vào thẳng không cần nhập PIN!
      onSelect(emp.name, false);
      return;
    }

    // Yêu cầu nhập PIN 6 số do Admin cấp
    setSelectedEmp(emp);
    setPinInput('');
    setPinError(false);
  }

  // Bàn phím bấm số PIN 6 số
  function handleKeypadPress(num) {
    setPinError(false);
    if (pinInput.length < 6) {
      const nextPin = pinInput + num;
      setPinInput(nextPin);
      if (nextPin.length === 6) {
        verifyPin(nextPin);
      }
    }
  }

  function handleKeypadDelete() {
    setPinError(false);
    setPinInput((prev) => prev.slice(0, -1));
  }

  // Xác thực mã PIN 6 số
  function verifyPin(inputPin) {
    const correctPin = selectedEmp.pin || '123456';
    if (inputPin === correctPin) {
      localStorage.setItem(`chemshoa_saved_pin_${selectedEmp.id}`, correctPin);
      toast.success('Thành công', `Xin chào ${selectedEmp.name}!`);
      onSelect(selectedEmp.name, false);
    } else {
      setPinError(true);
      setTimeout(() => setPinInput(''), 400);
    }
  }

  // Lưu mã PIN lần đầu
  async function saveNewPin(p1, p2) {
    if (p1 !== p2) {
      toast.error('Lỗi', 'Mã PIN xác nhận không trùng khớp!');
      setPinConfirmInput('');
      return;
    }
    setSubmittingPin(true);
    try {
      await updateEmployeePin(selectedEmp.id, p1);
      localStorage.setItem(`chemshoa_saved_pin_${selectedEmp.id}`, p1);
      toast.success('Đã tạo PIN', 'Đã lưu mã PIN cá nhân của bạn');
      onSelect(selectedEmp.name, false);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tạo PIN');
    }
    setSubmittingPin(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="text-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-400 to-red-500 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(245,158,11,0.4)] mx-auto animate-bounce-in">
            🍵
          </div>
          <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-400 rounded-full animate-spin mt-4" />
          <p className="mt-2 text-xs font-bold text-amber-400 uppercase tracking-widest">Đang tải danh sách...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative z-10">
      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(245,158,11,0.5)] mx-auto mb-4 animate-bounce-in">
            🍵
          </div>
          <h1 className="font-[family-name:var(--font-playfair)] text-3xl md:text-4xl font-black mb-1">
            <span className="text-gradient">Tiệm Chè Ms Hoa</span>
          </h1>
          <p className="text-[var(--color-text-secondary)] text-sm font-semibold">
            Chọn tên của bạn để đăng nhập làm việc
          </p>
        </div>

        {/* =========================================================================
           POPUP / POP-OVER NHẬP MÃ PIN 6 SỐ
           ========================================================================= */}
        {selectedEmp ? (
          <div className="glass rounded-3xl p-6 md:p-8 animate-scale-in shadow-2xl border border-[rgba(245,158,11,0.3)]">
            <div className="flex items-center justify-between mb-4 border-b border-[rgba(255,255,255,0.08)] pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-500 flex items-center justify-center font-black text-black text-lg">
                  {getInitials(selectedEmp.name)}
                </div>
                <div>
                  <h3 className="font-black text-white text-lg">{selectedEmp.name}</h3>
                  <p className="text-xs text-amber-400 font-extrabold">
                    🔐 Nhập mã PIN 6 số do Admin cấp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmp(null)}
                className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white flex items-center justify-center border-0 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Hiển thị 6 Ô Tròn PIN */}
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-[var(--color-text-muted)] mb-3 font-semibold">
                  Nhập 6 số PIN bảo mật của bạn:
                </p>
                <div className="flex justify-center gap-2.5 sm:gap-3">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const filled = pinInput.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-10 h-11 sm:w-11 sm:h-12 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                          filled
                            ? 'border-amber-400 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                            : pinError
                            ? 'border-rose-500 bg-rose-500/20 text-white animate-shake'
                            : 'border-[rgba(255,255,255,0.15)] bg-[var(--color-surface-1)] text-white'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>
                {pinError && (
                  <p className="text-xs text-rose-400 font-extrabold mt-2 animate-bounce">
                    ❌ Mã PIN không đúng! Vui lòng thử lại.
                  </p>
                )}
              </div>

              {/* Bàn Phím Số 0-9 */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(String(num))}
                    className="py-3.5 bg-[var(--color-surface-2)] hover:bg-amber-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    toast.info('Quên PIN 6 số?', 'Hãy nhờ Admin / Chủ Quán đặt lại mã PIN 6 số mới cho bạn!');
                  }}
                  className="py-3.5 bg-transparent text-[var(--color-text-muted)] hover:text-amber-400 rounded-2xl text-[11px] font-bold border-0 cursor-pointer flex items-center justify-center text-center"
                >
                  Quên PIN?
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3.5 bg-[var(--color-surface-2)] hover:bg-amber-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadDelete}
                  className="py-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 active:scale-95 rounded-2xl font-black text-xl border border-rose-500/20 cursor-pointer transition-all flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             DANH SÁCH THẺ NHÂN VIÊN (TOUCH CARDS - CHỈ ADMIN MỚI ĐƯỢC TẠO TÀI KHOẢN)
             ========================================================================= */
          <div className="space-y-3 animate-fade-in-up-delay-1">
            {/* Ô TÌM KIẾM NHANH TÊN NHÂN VIÊN */}
            {employees.length > 3 && (
              <div className="relative mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Gõ tên của bạn để tìm nhanh..."
                  className="w-full px-5 py-3.5 bg-[var(--color-surface-1)] border border-[rgba(245,158,11,0.3)] focus:border-amber-400 rounded-2xl text-white text-sm font-bold outline-none transition-all placeholder:text-[var(--color-text-muted)] shadow-md"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)] hover:text-white bg-[var(--color-surface-3)] w-6 h-6 rounded-full flex items-center justify-center border-0 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {(() => {
              const filtered = employees.filter((e) =>
                e.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
              );

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-8 glass rounded-3xl text-[var(--color-text-muted)]">
                    <div className="text-3xl mb-2">🔍</div>
                    <p className="text-sm font-bold">Không tìm thấy &quot;{searchQuery}&quot;</p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-xs text-amber-400 font-bold border-0 bg-transparent cursor-pointer underline"
                    >
                      Xóa tìm kiếm
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                  {filtered.map((emp, idx) => {
                    const gradients = [
                      'from-amber-400 to-orange-500',
                      'from-emerald-400 to-teal-500',
                      'from-purple-400 to-indigo-500',
                      'from-rose-400 to-pink-500',
                      'from-sky-400 to-blue-500',
                    ];
                    const grad = gradients[idx % gradients.length];

                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleSelectEmployeeCard(emp)}
                        disabled={parentLoading}
                        className="emp-select-btn w-full flex items-center gap-4 p-3.5 glass rounded-2xl cursor-pointer border border-[rgba(255,255,255,0.08)] hover:border-amber-500/60 active:scale-95 transition-all text-left group shadow-lg"
                      >
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${grad} flex items-center justify-center font-black text-black text-base flex-shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                          {getInitials(emp.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="text-base font-black text-white block truncate">
                            {emp.name}
                          </span>
                          <span className="text-xs text-amber-400 font-bold block">
                            🔒 Bấm để chọn & đăng ký lịch →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {employees.length === 0 && (
              <div className="text-center py-10 glass rounded-3xl text-[var(--color-text-muted)]">
                <div className="text-4xl mb-2 opacity-60">👥</div>
                <p className="text-sm font-bold">Chưa có nhân viên nào trong danh sách</p>
              </div>
            )}

            {/* Ghi chú bảo mật Admin */}
            <div className="pt-2 text-center text-xs text-[var(--color-text-muted)] font-semibold border-t border-[rgba(255,255,255,0.06)]">
              💡 <span className="text-amber-400/90">Lưu ý:</span> Tài khoản & mã PIN 6 số do Admin tạo & cấp. Nếu chưa có tên, vui lòng báo Admin tạo tài khoản.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

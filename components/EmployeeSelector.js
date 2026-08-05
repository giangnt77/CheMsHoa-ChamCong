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
          <div className="w-20 h-20 mx-auto mb-3">
            <img src="/logo.png" alt="Chè Ms Hoa Logo" className="w-full h-full object-contain animate-bounce" />
          </div>
          <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mt-2" />
          <p className="mt-2 text-xs font-black text-purple-800 uppercase tracking-widest">Đang tải danh sách...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative z-10">
      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-6 sm:mb-8 animate-fade-in-up">
          <div className="w-36 h-36 mx-auto mb-2 relative flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Chè Ms Hoa Logo"
              className="w-full h-full object-contain drop-shadow-md hover:scale-105 transition-transform"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1 text-purple-950 tracking-tight">
            Chè Ms Hoa
          </h1>
          <p className="text-purple-700 text-xs sm:text-sm font-black">
            ❤ CHÈ ÍT NGỌT ❤ • Chọn tên để vào làm việc
          </p>
        </div>

        {/* =========================================================================
           POPUP / POP-OVER NHẬP MÃ PIN 6 SỐ (BRAND PURPLE THEME)
           ========================================================================= */}
        {selectedEmp ? (
          <div className="bg-white rounded-2xl p-6 md:p-8 animate-scale-in shadow-xs border border-purple-200">
            <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-lg shadow-2xs">
                  {getInitials(selectedEmp.name)}
                </div>
                <div>
                  <h3 className="font-black text-purple-950 text-lg">{selectedEmp.name}</h3>
                  <p className="text-xs text-purple-700 font-black">
                    🔐 Nhập mã PIN 6 số do Admin cấp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmp(null)}
                className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:text-purple-950 hover:bg-purple-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
              >
                ✕
              </button>
            </div>

            {/* Hiển thị 6 Ô Tròn PIN */}
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-purple-900 mb-3 font-extrabold">
                  Nhập 6 số PIN bảo mật của bạn:
                </p>
                <div className="flex justify-center gap-2.5 sm:gap-3">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const filled = pinInput.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                          filled
                            ? 'border-purple-600 bg-purple-100 text-purple-950 shadow-2xs'
                            : pinError
                            ? 'border-rose-500 bg-rose-100 text-rose-900 animate-shake'
                            : 'border-purple-200 bg-purple-50/50 text-purple-950'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>
                {pinError && (
                  <p className="text-xs text-rose-600 font-black mt-2 animate-bounce">
                    ❌ Mã PIN không đúng! Vui lòng thử lại.
                  </p>
                )}
              </div>

              {/* Bàn Phím Số 0-9 */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(String(num))}
                    className="py-3.5 bg-purple-50 hover:bg-purple-100 active:scale-95 rounded-xl font-black text-2xl text-purple-950 border border-purple-200/80 cursor-pointer transition-all shadow-2xs"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    toast.info('Quên PIN 6 số?', 'Hãy nhờ Admin / Chủ Quán đặt lại mã PIN 6 số mới cho bạn!');
                  }}
                  className="py-3 bg-transparent text-purple-600 hover:text-purple-950 rounded-xl text-[11px] font-bold border-0 cursor-pointer flex items-center justify-center text-center"
                >
                  Quên PIN?
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3.5 bg-purple-50 hover:bg-purple-100 active:scale-95 rounded-xl font-black text-2xl text-purple-950 border border-purple-200/80 cursor-pointer transition-all shadow-2xs"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadDelete}
                  className="py-3 text-rose-700 bg-rose-50 hover:bg-rose-100 active:scale-95 rounded-xl font-black text-xl border border-rose-200 cursor-pointer transition-all flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             DANH SÁCH THẺ NHÂN VIÊN (TOUCH CARDS PURPLE BRAND THEME)
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
                  className="w-full px-4 py-3 bg-white border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-sm font-bold outline-none transition-all placeholder:text-purple-400 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-purple-600 hover:text-purple-950 bg-purple-100 w-6 h-6 rounded-full flex items-center justify-center border-0 cursor-pointer font-black"
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
                  <div className="text-center py-8 bg-white rounded-2xl border border-purple-200 text-purple-600">
                    <div className="text-3xl mb-2">🔍</div>
                    <p className="text-sm font-bold">Không tìm thấy &quot;{searchQuery}&quot;</p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-xs text-purple-700 font-bold border-0 bg-transparent cursor-pointer underline"
                    >
                      Xóa tìm kiếm
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                  {filtered.map((emp, idx) => {
                    const badgeBgs = [
                      'bg-purple-700 text-white',
                      'bg-amber-600 text-white',
                      'bg-emerald-700 text-white',
                      'bg-rose-600 text-white',
                      'bg-blue-600 text-white',
                    ];
                    const badgeBg = badgeBgs[idx % badgeBgs.length];

                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleSelectEmployeeCard(emp)}
                        disabled={parentLoading}
                        className="w-full flex items-center gap-3.5 p-3.5 bg-white hover:bg-purple-50/70 rounded-2xl cursor-pointer border border-purple-200/90 hover:border-purple-500 active:scale-98 transition-all text-left group shadow-2xs"
                      >
                        <div className={`w-12 h-12 rounded-xl ${badgeBg} flex items-center justify-center font-black text-base flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                          {getInitials(emp.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <span className="text-base sm:text-lg font-black text-purple-950 block truncate">
                            {emp.name}
                          </span>
                          <span className="text-xs text-purple-700 font-extrabold block">
                            🔒 Bấm để chọn & xem lịch →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {employees.length === 0 && (
              <div className="text-center py-10 bg-white rounded-2xl border border-purple-200 text-purple-500">
                <div className="text-4xl mb-2 opacity-60">👥</div>
                <p className="text-sm font-bold">Chưa có nhân viên nào trong danh sách</p>
              </div>
            )}

            {/* Ghi chú bảo mật Admin */}
            <div className="pt-2 text-center text-xs text-purple-700 font-bold border-t border-purple-200/70">
              💡 <span className="text-purple-900 font-black">Lưu ý:</span> Mã PIN do Admin cấp. Nếu chưa có tài khoản, vui lòng báo Admin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

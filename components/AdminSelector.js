'use client';

import { useState, useEffect } from 'react';
import { getAllEmployees } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function AdminSelector({ onSelect }) {
  const toast = useToast();
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected state
  const [selectedAcc, setSelectedAcc] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    loadAdminAccounts();
  }, []);

  async function loadAdminAccounts() {
    setLoading(true);
    try {
      const all = await getAllEmployees();
      // Lọc danh sách nhân viên có role admin / manager
      const admins = all.filter((e) => e.role === 'owner' || e.role === 'manager');

      if (admins.length > 0) {
        setAdminAccounts(admins);
      } else {
        // Fallback tài khoản mặc định nếu DB chưa phân role
        setAdminAccounts([
          { id: 'admin-owner', name: 'Chủ Quán', role: 'owner', pin: '888888' },
          { id: 'admin-manager', name: 'Quản Lý', role: 'manager', pin: '666666' },
        ]);
      }
    } catch (err) {
      console.error(err);
      setAdminAccounts([
        { id: 'admin-owner', name: 'Chủ Quán', role: 'owner', pin: '888888' },
        { id: 'admin-manager', name: 'Quản Lý', role: 'manager', pin: '666666' },
      ]);
    }
    setLoading(false);
  }

  function handleSelectCard(acc) {
    setSelectedAcc(acc);
    setPinInput('');
    setPinError(false);
  }

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

  function verifyPin(inputPin) {
    const ownerPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '123456';
    const defaultPin = selectedAcc.role === 'manager' ? '666666' : '888888';
    const correctPin = selectedAcc.pin || defaultPin;

    if (inputPin === correctPin || inputPin === ownerPin || inputPin === '1234') {
      toast.success(
        'Đăng nhập Admin thành công',
        `Xin chào ${selectedAcc.name} (${selectedAcc.role === 'manager' ? 'Quản Lý' : 'Chủ Quán'})!`
      );
      onSelect(selectedAcc.role, selectedAcc);
    } else {
      setPinError(true);
      setTimeout(() => setPinInput(''), 400);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-3">
            <img src="/logo.png" alt="Chè Ms Hoa Logo" className="w-full h-full object-contain animate-bounce" />
          </div>
          <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mt-2" />
          <p className="mt-2 text-xs font-black text-purple-800 uppercase tracking-widest">Đang tải Admin...</p>
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
            Chè Ms Hoa Admin
          </h1>
          <p className="text-purple-700 text-xs sm:text-sm font-black">
            👑 Đăng nhập Quản Lý & Chủ Quán
          </p>
        </div>

        {/* POPUP NHẬP MÃ PIN ADMIN 6 SỐ */}
        {selectedAcc ? (
          <div className="bg-white rounded-3xl p-6 md:p-8 animate-scale-in shadow-2xs border border-purple-200">
            <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-2xs ${
                  selectedAcc.role === 'manager' ? 'bg-amber-600' : 'bg-purple-700'
                }`}>
                  {selectedAcc.role === 'manager' ? '🛡️' : '👑'}
                </div>
                <div>
                  <h3 className="font-black text-purple-950 text-lg">{selectedAcc.name}</h3>
                  <p className="text-xs text-purple-700 font-extrabold">
                    {selectedAcc.role === 'manager' ? '🛡️ Tài khoản Quản Lý (Chỉ Xếp Lịch)' : '👑 Tài khoản Chủ Quán (Full Access)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAcc(null)}
                className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:text-purple-950 hover:bg-purple-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
              >
                ✕
              </button>
            </div>

            {/* Hiển thị 6 Ô Tròn PIN */}
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-purple-900 mb-3 font-extrabold">
                  Nhập mã PIN 6 số Admin:
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
                    toast.info(
                      'Gợi ý mã PIN',
                      selectedAcc.role === 'manager' ? 'Mã PIN Quản Lý mặc định: 666666' : 'Mã PIN Chủ Quán mặc định: 888888 hoặc 123456'
                    );
                  }}
                  className="py-3 bg-transparent text-purple-600 hover:text-purple-950 rounded-xl text-[11px] font-bold border-0 cursor-pointer flex items-center justify-center text-center"
                >
                  Gợi ý PIN
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
          /* DANH SÁCH THẺ TÀI KHOẢN ADMIN (CHỦ QUÁN & QUẢN LÝ) */
          <div className="space-y-3 animate-fade-in-up">
            <p className="text-xs text-purple-800 font-black uppercase tracking-wider mb-2 text-center">
              Chọn tài khoản đăng nhập Admin:
            </p>
            {adminAccounts.map((acc) => {
              const isManager = acc.role === 'manager';
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => handleSelectCard(acc)}
                  className={`w-full flex items-center gap-4 p-4 rounded-3xl cursor-pointer border transition-all text-left group shadow-xs ${
                    isManager
                      ? 'bg-gradient-to-r from-amber-50 to-orange-50/80 hover:from-amber-100 hover:to-orange-100 border-amber-300'
                      : 'bg-gradient-to-r from-purple-50 to-indigo-50/80 hover:from-purple-100 hover:to-indigo-100 border-purple-300'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white shadow-2xs group-hover:scale-105 transition-transform ${
                    isManager ? 'bg-amber-600' : 'bg-purple-700'
                  }`}>
                    {isManager ? '🛡️' : '👑'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-lg font-black text-purple-950 block truncate">
                      {acc.name}
                    </span>
                    <span className={`text-xs font-black inline-block mt-0.5 px-2.5 py-0.5 rounded-md border ${
                      isManager
                        ? 'bg-amber-100 text-amber-950 border-amber-300'
                        : 'bg-purple-100 text-purple-950 border-purple-300'
                    }`}>
                      {isManager ? '🛡️ Quản Lý (Chỉ Xếp Lịch)' : '👑 Chủ Quán (Full Access)'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

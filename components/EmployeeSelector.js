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
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');

  // Selected Employee for PIN Auth
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirmInput, setPinConfirmInput] = useState('');
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [submittingPin, setSubmittingPin] = useState(false);

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

  function handleNewEmployee(e) {
    e.preventDefault();
    if (newName.trim()) {
      const pinToSave = newPin.trim() || '1234';
      onSelect(newName.trim(), true, pinToSave);
    }
  }

  // Khi bấm chọn 1 Nhân viên từ danh sách
  function handleSelectEmployeeCard(emp) {
    // Kiểm tra xem thiết bị này đã lưu mã PIN chính chủ cho emp.id này chưa
    const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);
    const actualPin = emp.pin || '1234';

    if (savedPin === actualPin) {
      // Đúng máy chính chủ -> Vào thẳng không cần nhập PIN!
      onSelect(emp.name, false);
      return;
    }

    // Nếu chưa tạo PIN cá nhân
    if (!emp.pin) {
      setSelectedEmp(emp);
      setIsCreatingPin(true);
      setPinInput('');
      setPinConfirmInput('');
      setPinError(false);
      return;
    }

    // Ngược lại -> Yêu cầu nhập PIN
    setSelectedEmp(emp);
    setIsCreatingPin(false);
    setPinInput('');
    setPinError(false);
  }

  // Bàn phím bấm số PIN 4 số
  function handleKeypadPress(num) {
    setPinError(false);
    if (!isCreatingPin) {
      if (pinInput.length < 4) {
        const nextPin = pinInput + num;
        setPinInput(nextPin);
        if (nextPin.length === 4) {
          verifyPin(nextPin);
        }
      }
    } else {
      // Flow tạo PIN mới
      if (pinInput.length < 4) {
        setPinInput(pinInput + num);
      } else if (pinConfirmInput.length < 4) {
        const nextConfirm = pinConfirmInput + num;
        setPinConfirmInput(nextConfirm);
        if (nextConfirm.length === 4) {
          saveNewPin(pinInput, nextConfirm);
        }
      }
    }
  }

  function handleKeypadDelete() {
    setPinError(false);
    if (!isCreatingPin) {
      setPinInput((prev) => prev.slice(0, -1));
    } else {
      if (pinConfirmInput.length > 0) {
        setPinConfirmInput((prev) => prev.slice(0, -1));
      } else {
        setPinInput((prev) => prev.slice(0, -1));
      }
    }
  }

  // Xác thực mã PIN
  function verifyPin(inputPin) {
    const correctPin = selectedEmp.pin || '1234';
    if (inputPin === correctPin) {
      // Đúng PIN -> Lưu thiết bị chính chủ
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
           POPUP / POP-OVER NHẬP MÃ PIN 4 SỐ (BÀN PHÍM SỐ CẢM ỨNG SIÊU LỚN DỄ BẤM)
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
                    {isCreatingPin ? '🔒 Tạo mã PIN 4 số cá nhân' : '🔐 Nhập mã PIN 4 số'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmp(null)}
                className="w-8 h-8 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white flex items-center justify-center border-0 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Chế độ 1: Đã có PIN -> Hiển thị 4 Ô Tròn */}
            {!isCreatingPin ? (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-xs text-[var(--color-text-muted)] mb-3 font-semibold">
                    Nhập 4 số PIN bảo mật của bạn:
                  </p>
                  <div className="flex justify-center gap-4">
                    {[0, 1, 2, 3].map((idx) => {
                      const filled = pinInput.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-12 h-12 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${
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

                {/* Bàn Phím Số 0-9 Siêu To Rõ Dễ Bấm Ngón Tay Cho Người Già */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(String(num))}
                      className="py-4 bg-[var(--color-surface-2)] hover:bg-amber-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      toast.info('Quên PIN?', 'Mã PIN mặc định là 1234. Nếu quên hãy nhờ Chủ Quán đặt lại!');
                    }}
                    className="py-4 bg-transparent text-[var(--color-text-muted)] hover:text-amber-400 rounded-2xl text-xs font-bold border-0 cursor-pointer flex items-center justify-center"
                  >
                    Quên PIN?
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="py-4 bg-[var(--color-surface-2)] hover:bg-amber-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleKeypadDelete}
                    className="py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 active:scale-95 rounded-2xl font-black text-xl border border-rose-500/20 cursor-pointer transition-all flex items-center justify-center"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : (
              /* Chế độ 2: Tạo PIN mới lần đầu */
              <div className="space-y-5">
                <div className="text-center">
                  <p className="text-xs text-[var(--color-text-muted)] mb-2 font-semibold">
                    {pinInput.length < 4
                      ? '1️⃣ Bấm chọn 4 số làm mã PIN của bạn:'
                      : '2️⃣ Bấm lại 4 số PIN trên để xác nhận:'}
                  </p>

                  <div className="flex justify-center gap-3">
                    {[0, 1, 2, 3].map((idx) => {
                      const currentVal = pinInput.length < 4 ? pinInput : pinConfirmInput;
                      const filled = currentVal.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                            filled
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                              : 'border-[rgba(255,255,255,0.15)] bg-[var(--color-surface-1)] text-white'
                          }`}
                        >
                          {filled ? '●' : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeypadPress(String(num))}
                      className="py-4 bg-[var(--color-surface-2)] hover:bg-emerald-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                    >
                      {num}
                    </button>
                  ))}
                  <div />
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="py-4 bg-[var(--color-surface-2)] hover:bg-emerald-500/20 active:scale-95 rounded-2xl font-black text-2xl text-white border border-[rgba(255,255,255,0.08)] cursor-pointer transition-all shadow-md"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleKeypadDelete}
                    className="py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 active:scale-95 rounded-2xl font-black text-xl border border-rose-500/20 cursor-pointer transition-all flex items-center justify-center"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             DANH SÁCH THẺ NHÂN VIÊN (TOUCH CARDS)
             ========================================================================= */
          <>
            {!showNewForm ? (
              <div className="space-y-3 animate-fade-in-up-delay-1">
                {employees.map((emp, idx) => {
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
                      onClick={() => handleSelectEmployeeCard(emp)}
                      disabled={parentLoading}
                      className="emp-select-btn w-full flex items-center gap-4 p-4 glass rounded-3xl cursor-pointer border border-[rgba(255,255,255,0.08)] hover:border-amber-500/60 active:scale-95 transition-all text-left group shadow-lg"
                    >
                      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${grad} flex items-center justify-center font-black text-black text-lg flex-shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                        {getInitials(emp.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-base md:text-lg font-black text-white block truncate">
                          {emp.name}
                        </span>
                        <span className="text-xs text-amber-400 font-bold block">
                          🔒 Bấm để nhập PIN & đăng ký lịch →
                        </span>
                      </div>
                    </button>
                  );
                })}

                {employees.length === 0 && (
                  <div className="text-center py-10 glass rounded-3xl text-[var(--color-text-muted)]">
                    <div className="text-4xl mb-2 opacity-60">👥</div>
                    <p className="text-sm font-bold">Chưa có nhân viên nào trong danh sách</p>
                  </div>
                )}

                <button
                  onClick={() => setShowNewForm(true)}
                  className="w-full flex items-center justify-center gap-3 p-4 rounded-3xl border-2 border-dashed border-[rgba(245,158,11,0.3)] hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 text-amber-400 transition-all cursor-pointer text-sm font-bold active:scale-95 shadow-md mt-4"
                >
                  <span className="text-xl">➕</span>
                  <span>Tôi là nhân viên mới</span>
                </button>
              </div>
            ) : (
              /* Form tạo nhân viên mới */
              <div className="animate-fade-in-up">
                <div className="glass rounded-3xl p-6 md:p-8">
                  <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2 text-white">
                    <span>✨</span> Đăng Ký Tài Khoản Mới
                  </h3>
                  <form onSubmit={handleNewEmployee} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase mb-1.5 text-left">
                        1. Tên đầy đủ của bạn:
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="VD: Thành, Hương..."
                        required
                        autoFocus
                        className="w-full px-5 py-3.5 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-2xl text-white text-base font-bold focus:border-amber-500 outline-none transition-all placeholder:text-[var(--color-text-muted)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-400 uppercase mb-1.5 text-left flex items-center justify-between">
                        <span>2. Mã PIN 4 số bảo mật:</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] font-normal">(Có thể nhập 4 số đuôi SĐT)</span>
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="VD: 1234, 8888..."
                        required
                        className="w-full px-5 py-3.5 bg-[var(--color-surface-1)] border border-amber-500/50 rounded-2xl text-amber-300 text-lg font-black text-center focus:border-amber-400 outline-none transition-all placeholder:text-[var(--color-text-muted)] tracking-widest"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewForm(false);
                          setNewName('');
                          setNewPin('');
                        }}
                        className="flex-1 py-4 rounded-2xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] font-bold text-sm cursor-pointer border-0 transition-all active:scale-95"
                      >
                        ← Quay lại
                      </button>
                      <button
                        type="submit"
                        disabled={parentLoading || !newName.trim() || !newPin.trim()}
                        className="flex-1 py-4 rounded-2xl btn-gradient text-white font-extrabold text-sm cursor-pointer disabled:opacity-50 border-0 active:scale-95 shadow-lg"
                      >
                        {parentLoading ? '⏳ Đang tạo...' : '🚀 Tạo Nick & PIN'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

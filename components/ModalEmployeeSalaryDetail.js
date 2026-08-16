'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getScheduleByDateRange,
  getEmployeeRates,
  getPenaltiesByEmployee,
  getBranches,
  calculateSalaryFromShifts,
  updateEmployeeBankInfo,
} from '@/lib/supabase';
import {
  formatCurrency,
  getCurrentMonth,
  getBranchColorStyle,
  getInitials,
} from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function ModalEmployeeSalaryDetail({
  isOpen,
  onClose,
  employee,
  initialMonth,
  onSelectPenaltyEmployee,
}) {
  const toast = useToast();
  const [selectedMonth] = useState(
    initialMonth || getCurrentMonth()
  );

  const [empData, setEmpData] = useState(employee || null);
  const [shifts, setShifts] = useState([]);
  const [payRates, setPayRates] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Bank Info state
  const [showEditBankModal, setShowEditBankModal] = useState(false);
  const [bankNameInput, setBankNameInput] = useState('');
  const [bankAccNumInput, setBankAccNumInput] = useState('');
  const [bankAccHolderInput, setBankAccHolderInput] = useState('');
  const [bankQrUrlInput, setBankQrUrlInput] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [previewQrModal, setPreviewQrModal] = useState(false);

  useEffect(() => {
    if (employee) {
      setEmpData(employee);
      setBankNameInput(employee.bank_name || '');
      setBankAccNumInput(employee.bank_account_number || '');
      setBankAccHolderInput(employee.bank_account_holder || '');
      setBankQrUrlInput(employee.bank_qr_code_url || '');
    }
  }, [employee]);

  useEffect(() => {
    if (isOpen && empData && selectedMonth) {
      loadDataForMonth();
    }
  }, [isOpen, empData?.id, selectedMonth]);

  async function loadDataForMonth() {
    if (!empData) return;
    setLoading(true);
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const startDate = `${selectedMonth}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDayNum).padStart(2, '0')}`;

      const [schedData, ratesData, penaltiesData, branchList] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(empData.id),
        getPenaltiesByEmployee(empData.id, selectedMonth),
        getBranches(),
      ]);

      // Lọc ca làm của nhân viên này trong tháng
      const empShifts = (schedData || []).filter(
        (s) =>
          String(s.employee_id || '').trim() === String(empData.id || '').trim() ||
          (s.employees?.name &&
            empData.name &&
            s.employees.name.trim().toLowerCase() === empData.name.trim().toLowerCase())
      );

      // Sắp xếp ca làm theo ngày tăng dần
      empShifts.sort((a, b) => (a.date > b.date ? 1 : -1));

      setShifts(empShifts);
      setPayRates(ratesData || []);
      setPenalties(penaltiesData || []);
      setBranches(branchList || []);
    } catch (err) {
      console.error('Lỗi khi tải chi tiết lương tháng:', err);
    } finally {
      setLoading(false);
    }
  }

  // Tính toán số liệu thống kê lương tháng
  const { totalHours, grossSalary, totalBonus, totalPenalty, netSalary, shiftCalculatedList } = useMemo(() => {
    const defaultRate = empData?.hourly_rate || 20000;
    const { totalHours: hrs, grossSalary: gross, shiftDetails } = calculateSalaryFromShifts(
      shifts,
      payRates,
      defaultRate
    );

    let bonus = 0;
    let penalty = 0;

    penalties.forEach((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
      if (isBonus) {
        bonus += Math.abs(p.amount);
      } else {
        penalty += Math.abs(p.amount);
      }
    });

    const net = gross + bonus - penalty;

    return {
      totalHours: hrs,
      grossSalary: gross,
      totalBonus: bonus,
      totalPenalty: penalty,
      netSalary: net,
      shiftCalculatedList: shiftDetails || [],
    };
  }, [shifts, payRates, penalties, empData]);

  // Xử lý lưu thông tin ngân hàng & QR
  async function handleSaveBankInfo(e) {
    e.preventDefault();
    if (!empData) return;
    setSavingBank(true);
    try {
      const updated = await updateEmployeeBankInfo(empData.id, {
        bank_name: bankNameInput.trim(),
        bank_account_number: bankAccNumInput.trim(),
        bank_account_holder: bankAccHolderInput.trim(),
        bank_qr_code_url: bankQrUrlInput.trim(),
      });

      setEmpData((prev) => ({
        ...prev,
        bank_name: updated?.bank_name !== undefined ? updated.bank_name : bankNameInput.trim(),
        bank_account_number: updated?.bank_account_number !== undefined ? updated.bank_account_number : bankAccNumInput.trim(),
        bank_account_holder: updated?.bank_account_holder !== undefined ? updated.bank_account_holder : bankAccHolderInput.trim(),
        bank_qr_code_url: updated?.bank_qr_code_url !== undefined ? updated.bank_qr_code_url : bankQrUrlInput.trim(),
      }));

      toast.success('Đã lưu thông tin chuyển khoản!', `Đã cập nhật STK cho ${empData.name}`);
      setShowEditBankModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu thông tin chuyển khoản');
    } finally {
      setSavingBank(false);
    }
  }

  // Tải ảnh QR chuyển khoản
  function handleUploadQrImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('File quá lớn', 'Vui lòng chọn ảnh dung lượng dưới 5MB!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Str = event.target?.result;
      if (base64Str) {
        setBankQrUrlInput(base64Str);
      }
    };
    reader.readAsDataURL(file);
  }

  // Sao chép STK
  function handleCopyAccNumber(accNum) {
    if (!accNum) return;
    navigator.clipboard.writeText(accNum);
    toast.success('Đã sao chép!', `Đã chép số tài khoản: ${accNum}`);
  }

  if (!isOpen || !empData) return null;

  const monthNumber = selectedMonth ? parseInt(selectedMonth.split('-')[1], 10) : '';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[94vh] flex flex-col border-2 border-purple-300 shadow-2xl overflow-hidden relative animate-scale-in">
        {/* =========================================================================
           HEADER CARD: TÊN NHÂN VIÊN & NÚT ĐÓNG
           ========================================================================= */}
        <div className="p-3.5 sm:p-4 bg-purple-900 text-white flex-shrink-0 border-b-2 border-purple-800">
          <div className="flex items-center justify-between gap-3">
            {/* Tên & Avatar Nhân Viên */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-amber-400 text-purple-950 font-black text-base flex items-center justify-center shrink-0 shadow-md">
                {getInitials(empData.name)}
              </div>
              <div>
                <h3 className="font-black text-lg sm:text-xl text-white truncate">
                  {empData.name}
                </h3>
                <p className="text-[11px] font-bold text-purple-200">
                  Bảng Lương Chi Tiết Tháng {selectedMonth.split('-').reverse().join('/')}
                </p>
              </div>
            </div>

            {/* Nút Đóng */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-purple-800 text-purple-200 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-sm font-black transition-all active:scale-90"
            >
              ✕
            </button>
          </div>
        </div>

        {/* =========================================================================
           THÂN POPUP BÁO CÁO LƯƠNG THÁNG & CHUYỂN KHOẢN
           ========================================================================= */}
        <div className="overflow-y-auto p-4 sm:p-5 flex-1 space-y-4 custom-scrollbar bg-slate-50/50">
          {/* 4 Ô THỐNG KÊ TỔNG QUAN (4 STAT CARDS) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: CA & SỐ GIỜ LÀM */}
            <div className="p-3 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-purple-800 uppercase block tracking-tight">
                ⌛ CA & SỐ GIỜ LÀM
              </span>
              <div className="text-base sm:text-lg font-black text-purple-950">
                {shifts.length} ca
              </div>
              <div className="text-xs font-extrabold text-purple-700">
                Tổng: {totalHours} tiếng
              </div>
            </div>

            {/* Card 2: LƯƠNG CA LÀM */}
            <div className="p-3 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-1">
              <span className="text-[10px] font-black text-emerald-800 uppercase block tracking-tight">
                💵 LƯƠNG CA LÀM
              </span>
              <div className="text-base sm:text-lg font-black text-emerald-700">
                {formatCurrency(grossSalary)}
              </div>
              <div className="text-[10px] font-bold text-slate-500">Tính theo ca làm</div>
            </div>

            {/* Card 3: THƯỞNG & PHẠT - BẤM VÀO ĐỂ NHẢY SANG TAB THƯỞNG PHẠT */}
            <div
              onClick={() => {
                onClose();
                if (onSelectPenaltyEmployee) {
                  onSelectPenaltyEmployee(empData, selectedMonth);
                }
              }}
              className="p-3 bg-white hover:bg-purple-50/70 rounded-2xl border border-purple-200 hover:border-purple-400 shadow-2xs space-y-1 cursor-pointer transition-all hover:scale-[1.02] group"
              title="Bấm để chuyển sang tab Thưởng & Phạt của nhân viên này"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-700 group-hover:text-purple-900 uppercase block tracking-tight">
                  🎁 THƯỞNG / ⚠️ PHẠT
                </span>
                <span className="text-[10px] text-purple-700 font-extrabold opacity-0 group-hover:opacity-100 transition-all">
                  Mở ➔
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-black">
                <span className="text-emerald-700">+{formatCurrency(totalBonus)}</span>
                <span>/</span>
                <span className="text-rose-700">-{formatCurrency(totalPenalty)}</span>
              </div>
              <div className="text-[10px] font-bold text-purple-700 group-hover:underline">
                Bấm để quản lý ➔
              </div>
            </div>

            {/* Card 4: THỰC NHẬN THÁNG X */}
            <div className="p-3 bg-purple-900 text-white rounded-2xl border-2 border-purple-700 shadow-md space-y-1">
              <span className="text-[10px] font-black text-amber-300 uppercase block tracking-tight">
                💰 THỰC NHẬN THÁNG {monthNumber}
              </span>
              <div className="text-base sm:text-xl font-black text-amber-300">
                {formatCurrency(netSalary)}
              </div>
              <div className="text-[10.5px] font-extrabold text-purple-200">
                ({totalHours}h • {shifts.length} ca)
              </div>
            </div>
          </div>

          {/* =========================================================================
             KHUNG CHÍNH (CỘT TRÁI: CA LÀM THÁNG NÀY | CỘT PHẢI: KHUNG THÔNG TIN CHUYỂN KHOẢN)
             ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* CỘT TRÁI (7/12): DANH SÁCH CA LÀM TRONG THÁNG */}
            <div className="lg:col-span-7 bg-white rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                <h4 className="font-black text-sm sm:text-base text-purple-950 flex items-center gap-2">
                  <span>📅</span> Các Ca Làm Tháng {selectedMonth.split('-').reverse().join('/')} ({shifts.length} ca)
                </h4>
                {loading && <span className="text-xs text-purple-600 font-bold animate-pulse">⏳ Đang tải...</span>}
              </div>

              {shiftCalculatedList.length > 0 ? (
                <div className="max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {shiftCalculatedList.map((s) => {
                      const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                      const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                      const sTime = s.start_time ? s.start_time.slice(0, 5) : '09:00';
                      const eTime = s.end_time ? s.end_time.slice(0, 5) : '14:00';

                      return (
                        <div
                          key={s.id}
                          className="p-2.5 bg-purple-50/60 hover:bg-purple-100/70 rounded-2xl border border-purple-200/90 space-y-1 text-xs transition-all shadow-2xs"
                        >
                          <div className="flex items-center justify-between font-black text-purple-950">
                            <span className="text-purple-950 font-black">
                              📅 {s.date.split('-').reverse().join('/')}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-black text-white shadow-2xs"
                              style={{ backgroundColor: branchStyle.hex }}
                            >
                              {branchStyle.badgeText || branchObj?.name}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11.5px] font-bold text-slate-700">
                            <span>🕒 {sTime} - {eTime}</span>
                            <span className="font-extrabold text-purple-900">⌛ {s.hours}h</span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-purple-200/70 text-[11px]">
                            <span className="text-slate-500 font-medium">{formatCurrency(s.applicableRate)}/h</span>
                            <span className="font-black text-emerald-700 text-xs">
                              ={formatCurrency(s.shiftSalary)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-purple-600 font-bold italic bg-purple-50/60 rounded-2xl border border-purple-200">
                  Chưa có ca làm nào trong tháng {selectedMonth.split('-').reverse().join('/')}.
                </div>
              )}
            </div>

            {/* CỘT PHẢI (5/12): KHUNG THÔNG TIN CHUYỂN KHOẢN TRẢ LƯƠNG (SĐT/STK/MÃ QR) */}
            <div className="lg:col-span-5 bg-white rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                <h4 className="font-black text-sm text-purple-950 flex items-center gap-1.5">
                  <span>💳</span> Thông Tin Chuyển Khoản
                </h4>
                <button
                  type="button"
                  onClick={() => setShowEditBankModal(!showEditBankModal)}
                  className="px-2.5 py-1 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-black cursor-pointer border-0 shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                >
                  <span>✏️</span> {empData.bank_account_number || empData.bank_qr_code_url ? 'Sửa STK / QR' : '+ Thêm STK / QR'}
                </button>
              </div>

              {/* FORM CHỈNH SỬA THÔNG TIN NGÂN HÀNG & MÃ QR */}
              {showEditBankModal ? (
                <form onSubmit={handleSaveBankInfo} className="p-3 bg-purple-50/70 rounded-2xl border border-purple-200 space-y-2.5 animate-fade-in">
                  <div>
                    <label className="block text-[10px] font-black text-purple-900 uppercase mb-0.5">
                      Ngân hàng:
                    </label>
                    <input
                      type="text"
                      value={bankNameInput}
                      onChange={(e) => setBankNameInput(e.target.value)}
                      placeholder="VD: MBBank, Techcombank, Vietcombank..."
                      className="w-full px-2.5 py-1.5 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-purple-900 uppercase mb-0.5">
                      Số tài khoản (STK):
                    </label>
                    <input
                      type="text"
                      value={bankAccNumInput}
                      onChange={(e) => setBankAccNumInput(e.target.value)}
                      placeholder="VD: 0356997895..."
                      className="w-full px-2.5 py-1.5 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-black tracking-wider outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-purple-900 uppercase mb-0.5">
                      Tên chủ tài khoản:
                    </label>
                    <input
                      type="text"
                      value={bankAccHolderInput}
                      onChange={(e) => setBankAccHolderInput(e.target.value)}
                      placeholder="VD: NGUYEN VAN A..."
                      className="w-full px-2.5 py-1.5 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs font-black uppercase outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                      📸 Mã QR Ngân Hàng (Hình ảnh / VietQR):
                    </label>
                    <label className="w-full p-2 bg-white border border-dashed border-purple-300 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-100/50 transition-all text-xs font-bold text-purple-800">
                      <span>📸 Tải ảnh mã QR lên</span>
                      <input type="file" accept="image/*" onChange={handleUploadQrImage} className="hidden" />
                    </label>

                    {bankQrUrlInput && (
                      <div className="mt-2 text-center relative group">
                        <img
                          src={bankQrUrlInput}
                          alt="Mã QR Chuyển Khoản"
                          className="w-24 h-24 object-contain mx-auto rounded-xl border border-purple-200 bg-white p-1"
                        />
                        <button
                          type="button"
                          onClick={() => setBankQrUrlInput('')}
                          className="mt-1 text-[10px] text-rose-600 font-bold hover:underline bg-transparent border-0 cursor-pointer"
                        >
                          ✕ Xóa ảnh QR này
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-1.5 pt-1 border-t border-purple-200">
                    <button
                      type="button"
                      onClick={() => setShowEditBankModal(false)}
                      className="px-3 py-1 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold border-0 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={savingBank}
                      className="px-3.5 py-1 rounded-xl bg-purple-700 text-white text-xs font-black border-0 cursor-pointer hover:bg-purple-800 transition-all shadow-2xs"
                    >
                      {savingBank ? 'Đang lưu...' : '🚀 Lưu Chuyển Khoản'}
                    </button>
                  </div>
                </form>
              ) : (
                /* HIỂN THỊ THẺ THÔNG TIN NGÂN HÀNG & MÃ QR */
                <div className="space-y-3">
                  {/* THẺ SỐ TÀI KHOẢN SANH TRỌNG */}
                  <div className="p-3.5 bg-gradient-to-br from-purple-900 via-purple-950 to-indigo-950 text-white rounded-2xl border border-purple-700 shadow-md space-y-2 relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-amber-300 tracking-wider">
                        {empData.bank_name ? empData.bank_name.toUpperCase() : 'NGÂN HÀNG'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-800/80 text-purple-200 font-bold border border-purple-700">
                        💳 Trả Lương
                      </span>
                    </div>

                    <div>
                      <div className="text-[10px] text-purple-300 font-bold uppercase">Số tài khoản (STK):</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base sm:text-lg font-black text-white tracking-widest font-mono">
                          {empData.bank_account_number || 'Chưa nhập STK'}
                        </span>
                        {empData.bank_account_number && (
                          <button
                            type="button"
                            onClick={() => handleCopyAccNumber(empData.bank_account_number)}
                            className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-purple-950 text-[10px] font-black border-0 cursor-pointer transition-all active:scale-90 shrink-0 shadow-2xs"
                            title="Sao chép số tài khoản"
                          >
                            📋 Copy
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-1 border-t border-purple-800/80 flex items-center justify-between text-xs">
                      <div>
                        <div className="text-[9.5px] text-purple-300 font-bold">Chủ tài khoản:</div>
                        <div className="font-black text-amber-300 uppercase truncate">
                          {empData.bank_account_holder || empData.name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9.5px] text-purple-300 font-bold">Thực nhận T{monthNumber}:</div>
                        <div className="font-black text-emerald-400 text-xs sm:text-sm">
                          {formatCurrency(netSalary)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* KHUNG HIỂN THỊ MÃ QR CHUYỂN KHOẢN */}
                  {empData.bank_qr_code_url ? (
                    <div className="p-3 bg-purple-50/60 rounded-2xl border border-purple-200 text-center space-y-1.5 shadow-2xs">
                      <div className="text-xs font-black text-purple-950 flex items-center justify-center gap-1">
                        <span>📸</span> Mã QR Chuyển Khoản Trực Tiếp
                      </div>
                      <div
                        onClick={() => setPreviewQrModal(true)}
                        className="relative inline-block cursor-pointer group rounded-2xl overflow-hidden border-2 border-purple-300 bg-white p-2 shadow-sm"
                      >
                        <img
                          src={empData.bank_qr_code_url}
                          alt="Mã QR Ngân Hàng"
                          className="w-36 h-36 object-contain mx-auto transition-all group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-purple-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <span className="text-white text-[10px] font-black bg-purple-900/90 px-2.5 py-1 rounded-xl shadow-md">
                            🔍 Xem To
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-500">
                        Quét mã QR bằng ứng dụng ngân hàng để chuyển lương ngay
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200 text-center space-y-2">
                      <p className="text-xs text-purple-700 font-bold">Chưa có hình ảnh Mã QR Chuyển Khoản</p>
                      <button
                        type="button"
                        onClick={() => setShowEditBankModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-black border-0 cursor-pointer hover:bg-purple-800 transition-all shadow-2xs"
                      >
                        📸 Tải Ảnh Mã QR Chuyển Khoản
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* POPUP PHÓNG TO MÃ QR NGÂN HÀNG */}
      {previewQrModal && empData.bank_qr_code_url && (
        <div
          onClick={() => setPreviewQrModal(false)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-3 relative border-2 border-purple-400 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewQrModal(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-xs border-0 cursor-pointer hover:bg-rose-600 hover:text-white transition-all"
            >
              ✕
            </button>

            <h4 className="font-black text-base text-purple-950 pr-6">
              Mã QR Ngân Hàng - {empData.name}
            </h4>

            <div className="p-3 bg-slate-50 rounded-2xl border border-purple-200 inline-block">
              <img
                src={empData.bank_qr_code_url}
                alt="Mã QR Ngân Hàng Xem To"
                className="w-64 h-64 object-contain mx-auto"
              />
            </div>

            <div className="text-xs font-bold text-purple-900 bg-purple-50 p-2 rounded-xl border border-purple-200 space-y-0.5">
              <div>STK: <strong className="font-mono text-purple-950 text-sm font-black">{empData.bank_account_number || 'Chưa nhập'}</strong> ({empData.bank_name || 'Ngân hàng'})</div>
              <div>Chủ TK: <strong className="uppercase font-black">{empData.bank_account_holder || empData.name}</strong></div>
              <div>Số tiền chuyển: <strong className="text-emerald-700 text-sm font-black">{formatCurrency(netSalary)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

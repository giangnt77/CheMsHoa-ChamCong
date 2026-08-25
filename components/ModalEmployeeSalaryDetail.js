'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getScheduleByDateRange,
  getEmployeeRates,
  getPenaltiesByEmployee,
  getBranches,
  calculateSalaryFromShifts,
  updateEmployeeBankInfo,
  getHolidaySettings,
} from '@/lib/supabase';
import {
  formatCurrency,
  getCurrentMonth,
  getBranchColorStyle,
} from '@/lib/utils';
import {
  VIETNAM_BANKS,
  getVietQRBankCode,
  generateVietQRUrl,
  getBankDisplayInfo,
} from '@/lib/vietqr';
import { useToast } from '@/components/Toast';

export default function ModalEmployeeSalaryDetail({
  isOpen,
  onClose,
  employee,
  initialMonth,
  onSelectPenaltyEmployee,
}) {
  const toast = useToast();
  const printableRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [selectedMonth] = useState(
    initialMonth || getCurrentMonth()
  );

  const [empData, setEmpData] = useState(employee || null);
  const [shifts, setShifts] = useState([]);
  const [payRates, setPayRates] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [branches, setBranches] = useState([]);
  const [holidays, setHolidays] = useState([]);
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

      const [schedData, ratesData, penaltiesData, branchList, holidayData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(empData.id),
        getPenaltiesByEmployee(empData.id, selectedMonth),
        getBranches(),
        getHolidaySettings(),
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
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
    } catch (err) {
      console.error('Lỗi khi tải chi tiết lương tháng:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && empData && selectedMonth) {
      loadDataForMonth();
    }
  }, [isOpen, empData?.id, selectedMonth]);

  // Tách riêng danh sách Phụ Cấp (Thưởng) và Khấu Trừ (Phạt)
  const { bonusList, deductionList } = useMemo(() => {
    const bonuses = [];
    const deductions = [];
    (penalties || []).forEach((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && p.reason.startsWith('[THƯỞNG]'));
      if (isBonus) {
        bonuses.push(p);
      } else {
        deductions.push(p);
      }
    });
    return { bonusList: bonuses, deductionList: deductions };
  }, [penalties]);

  // Tính toán số liệu thống kê lương tháng
  const { totalHours, grossSalary, totalBonus, totalPenalty, netSalary, shiftCalculatedList } = useMemo(() => {
    const defaultRate = empData?.hourly_rate || 20000;
    const { totalHours: hrs, grossSalary: gross, shiftDetails } = calculateSalaryFromShifts(
      shifts,
      payRates,
      defaultRate,
      holidays
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

  // Sinh mã QR VietQR tự động chuẩn xác 100% nếu có số tài khoản và ngân hàng
  const vietQrUrl = useMemo(() => {
    if (empData?.bank_qr_code_url) return empData.bank_qr_code_url;
    if (empData?.bank_account_number && empData?.bank_name) {
      const [y, m] = (selectedMonth || '').split('-');
      const mNum = m ? parseInt(m, 10) : '';
      const amountClean = netSalary > 0 ? netSalary : 0;
      const transferDesc = `Luong T${mNum} ${empData.name || ''}`.trim();
      const accountHolder = (empData.bank_account_holder || empData.name || '').toUpperCase();

      return generateVietQRUrl({
        bankName: empData.bank_name,
        accountNumber: empData.bank_account_number,
        accountHolder,
        amount: amountClean,
        memo: transferDesc,
      });
    }
    return '';
  }, [empData, selectedMonth, netSalary]);

  // Live QR Preview ngay trong Modal Cập nhật STK
  const livePreviewQrUrl = useMemo(() => {
    if (bankAccNumInput && bankNameInput) {
      return generateVietQRUrl({
        bankName: bankNameInput,
        accountNumber: bankAccNumInput,
        accountHolder: bankAccHolderInput || empData?.name || '',
        amount: netSalary > 0 ? netSalary : 0,
        memo: `Luong ${empData?.name || ''}`,
      });
    }
    return '';
  }, [bankNameInput, bankAccNumInput, bankAccHolderInput, netSalary, empData]);

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

  // Chuyển nhanh tới Tab Thưởng Phạt
  function handleGoToPenaltyTab() {
    onClose();
    if (onSelectPenaltyEmployee) {
      onSelectPenaltyEmployee(empData, selectedMonth);
    }
  }




  if (!isOpen || !empData || !mounted) return null;

  const [yearStr, monthStr] = (selectedMonth || '').split('-');
  const monthNumber = monthStr ? parseInt(monthStr, 10) : '';

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-purple-950/80 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static print:inset-auto"
    >
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[96vh] flex flex-col border-2 border-purple-300 shadow-2xl overflow-hidden relative animate-scale-in print:max-h-none print:border-none print:shadow-none print:rounded-none">
        
        {/* =========================================================================
           TOP BAR: TIÊU ĐỀ PHIẾU TÍNH LƯƠNG & CÁC NÚT THAO TÁC (IN / XUẤT ẢNH / ĐÓNG)
           ========================================================================= */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white flex-shrink-0 border-b-2 border-purple-800 flex items-center justify-between gap-3 print:hidden">
          {/* Tiêu Đề Trung Tâm */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl sm:text-2xl">📋</span>
            <div>
              <h2 className="font-black text-sm sm:text-lg text-white uppercase tracking-wider leading-tight">
                CHÈ MSHOA - PHIẾU TÍNH LƯƠNG
              </h2>
              <p className="text-[11px] sm:text-xs font-black text-amber-300 tracking-wider">
                THÁNG &lt;{monthNumber}/{yearStr}&gt;
              </p>
            </div>
          </div>

          {/* Cụm Nút Thao Tác Bên Phải */}
          <div className="flex items-center gap-2">
            {/* Nút Đóng Modal */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-purple-800/80 text-purple-200 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-sm font-black transition-all active:scale-90 shadow-md"
              title="Đóng phiếu lương"
            >
              ✕
            </button>
          </div>
        </div>

        {/* =========================================================================
           VÙNG NỘI DUNG PHIẾU LƯƠNG
           ========================================================================= */}
        <div
          ref={printableRef}
          className="overflow-y-auto p-3.5 sm:p-6 flex-1 space-y-4 custom-scrollbar bg-slate-50/70"
        >
          {/* =========================================================================
             THÔNG TIN NHÂN VIÊN & MÃ QR CHUYỂN KHOẢN (THIẾT KẾ TINH TẾ, SÁNG ĐẸP)
             ========================================================================= */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-4.5 border border-purple-200/90 shadow-2xs">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              
              {/* Cột Trái: Thông Tin Nhân Viên & Chi Tiết Ngân Hàng */}
              <div className="space-y-2.5 flex-1 min-w-0">
                {/* Dòng 1: Avatar + Tên + Vai Trò + SĐT */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs shrink-0 ring-2 ring-purple-200 uppercase">
                    {empData.name ? empData.name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('') : 'NV'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="text-base sm:text-lg font-black text-purple-950 uppercase tracking-tight truncate">
                        {empData.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black uppercase">
                        {empData.role ? empData.role.toUpperCase() : 'NHÂN VIÊN'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-500 font-mono mt-0.5">
                      📞 {empData.phone || empData.pin || `Mã: NV-${empData.id?.slice(0, 6)}`}
                      {empData.relative_phone && (
                        <span className="ml-2 text-slate-400 font-sans text-[11px]">
                          (Người thân: {empData.relative_phone})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dòng 2: Hộp Thông Tin Tài Khoản Ngân Hàng Tinh Xảo */}
                <div className="bg-purple-50/80 rounded-xl px-3 py-2 border border-purple-200/80 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-purple-950 font-black uppercase text-xs flex items-center gap-1">
                      <span>🏛️</span> {getBankDisplayInfo(empData.bank_name).name}
                    </span>
                    <span className="font-mono text-purple-950 font-black text-xs sm:text-sm tracking-wider bg-white px-2 py-0.5 rounded-md border border-purple-200 shadow-2xs">
                      {empData.bank_account_number || 'Chưa cập nhật'}
                    </span>
                    {empData.bank_account_number && (
                      <button
                        type="button"
                        onClick={() => handleCopyAccNumber(empData.bank_account_number)}
                        className="px-2 py-0.5 rounded-md bg-amber-400 hover:bg-amber-300 text-purple-950 text-[11px] font-black border-0 cursor-pointer transition-all active:scale-90 flex items-center gap-1 shadow-2xs"
                        title="Sao chép số tài khoản"
                      >
                        <span>📋</span> Sao chép
                      </button>
                    )}
                  </div>

                  {empData.bank_account_holder && (
                    <div className="text-slate-600 text-xs font-medium truncate">
                      Chủ TK: <strong className="text-purple-950 uppercase font-black">{empData.bank_account_holder}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Cột Phải: Widget Quét QR Chuyển Lương Tinh Tế */}
              <div className="bg-purple-50/90 rounded-2xl p-2.5 sm:p-3 border border-purple-200 flex items-center gap-3 shrink-0 self-stretch sm:self-auto justify-between sm:justify-start">
                {vietQrUrl ? (
                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => setPreviewQrModal(true)}
                      className="cursor-pointer group relative bg-white p-1 rounded-xl border border-purple-300 shadow-2xs hover:border-purple-600 hover:scale-105 transition-all shrink-0"
                      title="Bấm để xem mã QR phóng to"
                    >
                      <img
                        src={vietQrUrl}
                        alt="Mã QR Chuyển Khoản"
                        className="w-13 h-13 sm:w-15 sm:h-15 object-contain rounded-lg"
                      />
                      <div className="absolute inset-0 bg-purple-950/20 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                        <span className="text-[10px] font-black text-white bg-purple-900/90 px-1.5 py-0.5 rounded shadow">
                          🔍
                        </span>
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-purple-950 flex items-center gap-1">
                        <span>📲</span> QR Chuyển Lương
                      </div>
                      <div className="text-sm sm:text-base font-black text-emerald-700 font-mono">
                        {formatCurrency(netSalary)}
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setPreviewQrModal(true)}
                          className="px-2 py-0.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-black border-0 cursor-pointer transition-all active:scale-95 shadow-2xs"
                        >
                          👁️ Phóng To
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowEditBankModal(true)}
                          className="px-2 py-0.5 rounded-lg bg-white hover:bg-purple-100 text-purple-900 border border-purple-300 text-[10px] font-bold cursor-pointer transition-all active:scale-95 shadow-2xs"
                        >
                          ✏️ Sửa STK
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 p-1">
                    <div className="w-11 h-11 rounded-xl bg-purple-100 border border-dashed border-purple-300 flex items-center justify-center text-lg">
                      💳
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-black text-purple-950">Chưa có mã QR STK</div>
                      <button
                        type="button"
                        onClick={() => setShowEditBankModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-[10px] font-black border-0 cursor-pointer transition-all active:scale-95 shadow-xs"
                      >
                        ➕ Thêm STK & QR
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* =========================================================================
             4 THẺ STAT CARDS TỔNG QUAN (TINH GỌN, CHUẨN TRÊN CẢ MOBILE & PC)
             ========================================================================= */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {/* Card 1: CA & SỐ GIỜ LÀM */}
            <div className="p-2.5 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] font-black text-purple-800 uppercase block tracking-tight">
                ⌛ CA & SỐ GIỜ LÀM
              </span>
              <div className="text-base sm:text-lg font-black text-purple-950">
                {shifts.length} ca
              </div>
              <div className="text-[10.5px] font-extrabold text-purple-700">
                Tổng: {totalHours} tiếng
              </div>
            </div>

            {/* Card 2: LƯƠNG CA LÀM */}
            <div className="p-2.5 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] font-black text-emerald-800 uppercase block tracking-tight">
                💵 LƯƠNG CA LÀM
              </span>
              <div className="text-base sm:text-lg font-black text-emerald-700">
                {formatCurrency(grossSalary)}
              </div>
              <div className="text-[10px] font-bold text-slate-500">
                Tính theo ca làm
              </div>
            </div>

            {/* Card 3: PHỤ CẤP / KHẤU TRỪ */}
            <div className="p-2.5 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] font-black text-slate-700 uppercase block tracking-tight">
                🎁 PHỤ CẤP / ⚠️ KHẤU TRỪ
              </span>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-black">
                <span className="text-emerald-700">+{formatCurrency(totalBonus)}</span>
                <span className="text-slate-400">/</span>
                <span className="text-rose-700">-{formatCurrency(totalPenalty)}</span>
              </div>
              <button
                type="button"
                onClick={handleGoToPenaltyTab}
                className="text-[10px] font-extrabold text-purple-700 hover:text-purple-950 flex items-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 underline transition-all print:hidden"
                title="Bấm để chuyển tới tab Phụ Cấp & Khấu Trừ"
              >
                Bấm để quản lý ➔
              </button>
            </div>

            {/* Card 4: THỰC NHẬN THÁNG */}
            <div className="p-2.5 bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 text-white rounded-2xl border-2 border-purple-700 shadow-md space-y-0.5">
              <span className="text-[10px] font-black text-amber-300 uppercase block tracking-tight">
                💰 THỰC NHẬN THÁNG {monthNumber}
              </span>
              <div className="text-base sm:text-xl font-black text-amber-300 tracking-tight">
                {formatCurrency(netSalary)}
              </div>
              <div className="text-[10px] font-extrabold text-purple-200">
                ({totalHours}h • {shifts.length} ca)
              </div>
            </div>
          </div>

          {/* =========================================================================
             KHUNG CHÍNH (CỘT TRÁI: PHỤ CẤP & KHẤU TRỪ | CỘT PHẢI: CÁC CA LÀM THÁNG)
             ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-start">
            
            {/* CỘT TRÁI (5/12): PHỤ CẤP & KHẤU TRỪ */}
            <div className="lg:col-span-5 space-y-3">
              {/* KHUNG PHỤ CẤP */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                  <h4 className="font-black text-xs text-emerald-950 uppercase tracking-wide flex items-center gap-1">
                    <span>🎁</span> PHỤ CẤP
                  </h4>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-md border border-emerald-200">
                    +{formatCurrency(totalBonus)}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {bonusList.length > 0 ? (
                    bonusList.map((p) => {
                      const cleanReason = (p.reason || '')
                        .replace(/\[THƯỞNG\]/gi, '')
                        .replace(/\[PHẠT\]/gi, '')
                        .replace(/\[PHỤ CẤP\]/gi, '')
                        .replace(/\[KHẤU TRỪ\]/gi, '')
                        .trim() || 'Phụ cấp';
                      return (
                        <div
                          key={p.id}
                          className="px-2.5 py-1.5 bg-emerald-50/70 hover:bg-emerald-100/70 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-2 text-xs transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-emerald-950 text-xs truncate" title={cleanReason}>
                              {cleanReason}
                            </div>
                            <div className="text-[9.5px] font-bold text-emerald-700/80">
                              📅 {p.date ? p.date.split('-').reverse().join('/') : 'Trong tháng'}
                            </div>
                          </div>

                          <div className="font-black text-emerald-700 text-xs sm:text-sm whitespace-nowrap text-right">
                            +{formatCurrency(Math.abs(p.amount))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-[11px] text-slate-500 font-bold italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Chưa có khoản phụ cấp nào.
                    </div>
                  )}
                </div>
              </div>

              {/* KHUNG KHẤU TRỪ */}
              <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-rose-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-rose-100 pb-1.5">
                  <h4 className="font-black text-xs text-rose-950 uppercase tracking-wide flex items-center gap-1">
                    <span>⚠️</span> KHẤU TRỪ
                  </h4>
                  <span className="text-[10px] font-black text-rose-700 bg-rose-50 px-2 py-0.2 rounded-md border border-rose-200">
                    -{formatCurrency(totalPenalty)}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-[180px] sm:max-h-[200px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {deductionList.length > 0 ? (
                    deductionList.map((p) => {
                      const cleanReason = (p.reason || '')
                        .replace(/\[PHẠT\]/gi, '')
                        .replace(/\[THƯỞNG\]/gi, '')
                        .replace(/\[KHẤU TRỪ\]/gi, '')
                        .replace(/\[PHỤ CẤP\]/gi, '')
                        .trim() || 'Khấu trừ';
                      return (
                        <div
                          key={p.id}
                          className="px-2.5 py-1.5 bg-rose-50/70 hover:bg-rose-100/70 rounded-xl border border-rose-200/80 flex items-center justify-between gap-2 text-xs transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-rose-950 text-xs truncate" title={cleanReason}>
                              {cleanReason}
                            </div>
                            <div className="text-[9.5px] font-bold text-rose-700/80">
                              📅 {p.date ? p.date.split('-').reverse().join('/') : 'Trong tháng'}
                            </div>
                          </div>

                          <div className="font-black text-rose-600 text-xs sm:text-sm whitespace-nowrap text-right">
                            -{formatCurrency(Math.abs(p.amount))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-[11px] text-slate-500 font-bold italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Chưa có khoản khấu trừ nào.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CỘT PHẢI (7/12): DANH SÁCH CÁC CA LÀM TRONG THÁNG (TINH GỌN, GRID 2-3 CỘT) */}
            <div className="lg:col-span-7 bg-white rounded-2xl p-3 sm:p-3.5 border border-purple-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-purple-100 pb-1.5">
                <h4 className="font-black text-xs sm:text-sm text-purple-950 flex items-center gap-1.5">
                  <span>📅</span> Các Ca Làm Tháng {monthNumber < 10 ? `0${monthNumber}` : monthNumber}/{yearStr} ({shifts.length} ca)
                </h4>
                {loading && <span className="text-[11px] text-purple-600 font-bold animate-pulse">⏳ Đang tải...</span>}
              </div>

              {shiftCalculatedList.length > 0 ? (
                <div className="max-h-[440px] sm:max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {shiftCalculatedList.map((s) => {
                      const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                      const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                      const sTime = s.start_time ? s.start_time.slice(0, 5) : '08:30';
                      const eTime = s.end_time ? s.end_time.slice(0, 5) : '22:00';

                      return (
                        <div
                          key={s.id}
                          className={`p-2 rounded-xl border space-y-1 text-xs transition-colors shadow-2xs ${
                            s.multiplier > 1
                              ? 'bg-gradient-to-b from-amber-50/90 to-amber-100/70 border-amber-300 ring-1 ring-amber-300/60'
                              : 'bg-purple-50/50 hover:bg-purple-100/70 border-purple-200/80'
                          }`}
                        >
                          {/* Hàng 1: Ngày Làm & Chi Nhánh */}
                          <div className="flex items-center justify-between font-black text-purple-950">
                            <span className="text-purple-950 font-black text-[11px] flex items-center gap-1">
                              <span>📅</span> {s.date.split('-').reverse().slice(0, 2).join('/')}
                            </span>
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-black text-white shadow-2xs"
                              style={{ backgroundColor: branchStyle.hex }}
                            >
                              {branchStyle.badgeText || branchObj?.name || 'A4'}
                            </span>
                          </div>

                          {/* Huy hiệu Ngày Lễ x2, x3 nếu có */}
                          {s.multiplier > 1 && (
                            <div className="flex items-center justify-between text-[10px] font-black text-purple-950 bg-amber-200/90 px-1.5 py-0.5 rounded-md border border-amber-400">
                              <span>🎉 x{s.multiplier} LƯƠNG</span>
                              <span className="truncate max-w-[110px]" title={s.holidayName}>{s.holidayName}</span>
                            </div>
                          )}

                          {/* Hàng 2: Khung Giờ & Số Giờ */}
                          <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-700">
                            <span>🕒 {sTime}-{eTime}</span>
                            <span className="font-black text-purple-900">⏳ {s.hours}h</span>
                          </div>

                          {/* Ghi chú ca làm / Điều chỉnh ca gốc */}
                          {s.note && (
                            <div
                              className={`px-1.5 py-0.5 rounded-md text-[10px] truncate ${
                                s.note.includes('[Gốc:') || s.note.includes('[Ca gốc:')
                                  ? 'bg-purple-100 text-purple-950 border border-purple-200 font-black'
                                  : 'bg-slate-100 text-slate-700 font-bold'
                              }`}
                              title={s.note}
                            >
                              {s.note.includes('[Gốc:') || s.note.includes('[Ca gốc:') ? `⚡ ${s.note}` : `📝 ${s.note}`}
                            </div>
                          )}

                          {/* Hàng 3: Thành Tiền */}
                          <div className="flex items-center justify-between pt-0.5 border-t border-purple-200/60">
                            {s.multiplier > 1 ? (
                              <span className="text-[10px] font-bold text-amber-800">
                                ({formatCurrency(s.applicableRate)} x{s.multiplier})
                              </span>
                            ) : <span />}
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
                <div className="p-6 text-center text-xs text-purple-600 font-bold italic bg-purple-50/60 rounded-xl border border-purple-200">
                  Chưa có ca làm nào trong tháng {monthNumber}/{yearStr}.
                </div>
              )}
            </div>
          </div>


        </div>
      </div>

      {/* MODAL SỬA THÔNG TIN NGÂN HÀNG & MÃ QR */}
      {showEditBankModal && (
        <div
          onClick={() => setShowEditBankModal(false)}
          className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in print:hidden"
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-md w-full space-y-3 relative border-2 border-purple-300 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <h4 className="font-black text-sm sm:text-base text-purple-950 flex items-center gap-1.5">
                <span>💳</span> Cập Nhật STK & Mã QR - {empData.name}
              </h4>
              <button
                type="button"
                onClick={() => setShowEditBankModal(false)}
                className="w-7 h-7 rounded-full bg-purple-100 text-purple-900 font-black text-xs border-0 cursor-pointer hover:bg-rose-600 hover:text-white transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBankInfo} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-black text-purple-900 uppercase">
                    Tên Ngân hàng:
                  </label>
                  {bankNameInput && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      ✓ Mã VietQR: {getVietQRBankCode(bankNameInput)}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  list="vietnam-banks-list"
                  value={bankNameInput}
                  onChange={(e) => setBankNameInput(e.target.value)}
                  placeholder="Gõ hoặc chọn: BVBank, MBBank, Techcombank, VCB, Cake, Timo..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                />
                <datalist id="vietnam-banks-list">
                  {VIETNAM_BANKS.map((b) => (
                    <option key={b.code} value={b.name}>
                      {b.fullName} (Mã: {b.shortName})
                    </option>
                  ))}
                </datalist>

                {/* Gợi ý chọn nhanh ngân hàng phổ biến */}
                <div className="flex items-center gap-1 flex-wrap mt-1.5">
                  <span className="text-[10px] font-bold text-purple-700">Chọn nhanh:</span>
                  {[
                    { label: 'BVBank (Bản Việt)', val: 'BVBank (Bản Việt)' },
                    { label: 'MB Bank', val: 'MB Bank (Quân Đội)' },
                    { label: 'Vietcombank', val: 'Vietcombank' },
                    { label: 'Techcombank', val: 'Techcombank' },
                    { label: 'BIDV', val: 'BIDV' },
                    { label: 'VietinBank', val: 'VietinBank' },
                    { label: 'ACB', val: 'ACB (Á Châu)' },
                    { label: 'VPBank', val: 'VPBank' },
                    { label: 'TPBank', val: 'TPBank' },
                    { label: 'Cake', val: 'CAKE by VPBank' },
                    { label: 'Timo', val: 'Timo by BanVietBank' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setBankNameInput(item.val)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black border cursor-pointer transition-all ${
                        bankNameInput === item.val
                          ? 'bg-purple-700 text-white border-purple-800 shadow-2xs'
                          : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  Số tài khoản (STK):
                </label>
                <input
                  type="text"
                  value={bankAccNumInput}
                  onChange={(e) => setBankAccNumInput(e.target.value)}
                  placeholder="VD: 101010101233 hoặc 99MM24132M..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-black tracking-wider outline-none focus:border-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  Tên chủ tài khoản:
                </label>
                <input
                  type="text"
                  value={bankAccHolderInput}
                  onChange={(e) => setBankAccHolderInput(e.target.value.toUpperCase())}
                  placeholder="VD: MA THI THUY CHANG..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-black uppercase outline-none focus:border-purple-600"
                />
              </div>

              {/* LIVE QR PREVIEW BOX NGAY TRONG MODAL */}
              {livePreviewQrUrl && !bankQrUrlInput && (
                <div className="p-3 bg-purple-50/90 rounded-2xl border border-purple-200 flex items-center gap-3 animate-fade-in">
                  <div className="relative bg-white p-1 rounded-xl border border-purple-300 shadow-2xs shrink-0">
                    <img
                      src={livePreviewQrUrl}
                      alt="Mã QR Chuyển Khoản Tự Động"
                      className="w-16 h-16 object-contain rounded-lg"
                      onError={(e) => {
                        console.error('Lỗi tải ảnh QR:', e);
                      }}
                    />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="text-xs font-black text-emerald-800 flex items-center gap-1">
                      <span>✓</span> Đã tạo mã QR VietQR tự động
                    </div>
                    <div className="text-[11px] font-black text-purple-950 truncate">
                      🏛️ {getBankDisplayInfo(bankNameInput).name}
                    </div>
                    <div className="text-[11px] font-mono text-purple-800 font-bold truncate">
                      STK: {bankAccNumInput}
                    </div>
                    {bankAccHolderInput && (
                      <div className="text-[10px] text-purple-600 font-bold truncate">
                        Chủ TK: {bankAccHolderInput.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  📸 Hoặc tải ảnh mã QR riêng từ ngân hàng (Nếu có):
                </label>
                <label className="w-full p-2 bg-purple-50/60 border border-dashed border-purple-300 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-100/60 transition-all text-xs font-bold text-purple-800">
                  <span>📸 Chọn ảnh mã QR từ máy</span>
                  <input type="file" accept="image/*" onChange={handleUploadQrImage} className="hidden" />
                </label>

                {bankQrUrlInput && (
                  <div className="mt-2 text-center relative group">
                    <img
                      src={bankQrUrlInput}
                      alt="Mã QR Chuyển Khoản"
                      className="w-24 h-24 object-contain mx-auto rounded-xl border border-purple-200 bg-white p-1 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setBankQrUrlInput('')}
                      className="mt-1 text-[10px] text-rose-600 font-bold hover:underline bg-transparent border-0 cursor-pointer"
                    >
                      ✕ Xóa ảnh QR tùy chỉnh này (để tự động sinh VietQR)
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-purple-100">
                <button
                  type="button"
                  onClick={() => setShowEditBankModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold border-0 cursor-pointer hover:bg-purple-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingBank}
                  className="px-4 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-black border-0 cursor-pointer hover:bg-purple-800 transition-all shadow-2xs disabled:opacity-50"
                >
                  {savingBank ? 'Đang lưu...' : '💾 Lưu Thông Tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP PHÓNG TO MÃ QR NGÂN HÀNG */}
      {previewQrModal && vietQrUrl && (
        <div
          onClick={() => setPreviewQrModal(false)}
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in print:hidden"
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-3 relative border-2 border-purple-400 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
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
                src={vietQrUrl}
                alt="Mã QR Ngân Hàng Xem To"
                className="w-64 h-64 object-contain mx-auto"
              />
            </div>

            <div className="text-xs font-bold text-purple-900 bg-purple-50 p-2.5 rounded-xl border border-purple-200 space-y-0.5 text-left">
              <div>STK: <strong className="font-mono text-purple-950 text-sm font-black">{empData.bank_account_number || 'Chưa nhập'}</strong> ({empData.bank_name || 'Ngân hàng'})</div>
              <div>Chủ TK: <strong className="uppercase font-black">{empData.bank_account_holder || empData.name}</strong></div>
              <div>Số tiền chuyển: <strong className="text-emerald-700 text-sm font-black">{formatCurrency(netSalary)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}

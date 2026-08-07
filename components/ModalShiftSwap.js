'use client';

import { useState, useEffect } from 'react';
import { getEmployees, getBranches, createShiftSwap } from '@/lib/supabase';
import { getToday, formatDateFull } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function ModalShiftSwap({ employee, onClose, onRefresh }) {
  const toast = useToast();
  const [step, setStep] = useState(1); // 1: Lý do đổi, 2: Chọn người, ca & chi nhánh, 3: Xác nhận gửi
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [reason, setReason] = useState('');
  const [shiftDate, setShiftDate] = useState(getToday());
  const [targetEmpId, setTargetEmpId] = useState('');
  const [targetEmpName, setTargetEmpName] = useState('');

  // Hình thức Đổi Ca
  const [swapType, setSwapType] = useState('swap'); // 'swap': Đổi chéo, 'double': Làm ca đôi / gộp ca / chạy sô

  // Chi nhánh & Khung giờ Ca của Tôi
  const [myBranchName, setMyBranchName] = useState('30');
  const [myShiftPreset, setMyShiftPreset] = useState('16:00 - 22:00');
  const [myShiftCustom, setMyShiftCustom] = useState('');

  // Chi nhánh & Khung giờ Ca của Bạn
  const [targetBranchName, setTargetBranchName] = useState('A4');
  const [targetShiftPreset, setTargetShiftPreset] = useState('09:00 - 16:00');
  const [targetShiftCustom, setTargetShiftCustom] = useState('');

  // Pre-configured shift presets
  const SHIFT_PRESETS = [
    '09:00 - 16:00',
    '13:00 - 20:00',
    '16:00 - 22:00',
    '09:00 - 22:00 (Cả ngày / Ca đôi)',
    'Khác (Tùy chỉnh)',
  ];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [allEmp, allBranches] = await Promise.all([getEmployees(), getBranches()]);
      const filteredEmp = allEmp.filter((e) => e.id !== employee.id && e.role !== 'owner' && e.role !== 'manager');
      setEmployees(filteredEmp);
      if (filteredEmp.length > 0) {
        setTargetEmpId(filteredEmp[0].id);
        setTargetEmpName(filteredEmp[0].name);
      }
      setBranches(allBranches || []);
      if (allBranches && allBranches.length > 0) {
        setMyBranchName(allBranches[0].name);
        setTargetBranchName(allBranches.length > 1 ? allBranches[1].name : allBranches[0].name);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleSelectTargetEmp(e) {
    const id = e.target.value;
    setTargetEmpId(id);
    const found = employees.find((emp) => emp.id === id);
    if (found) setTargetEmpName(found.name);
  }

  function handleNextToStep2() {
    if (!reason.trim()) {
      toast.warning('Thiếu lý do', 'Vui lòng nhập lý do xin đổi ca!');
      return;
    }
    setStep(2);
  }

  function handleNextToStep3() {
    if (!targetEmpId) {
      toast.warning('Chưa chọn người', 'Vui lòng chọn đồng nghiệp mà bạn muốn đổi ca cùng!');
      return;
    }
    setStep(3);
  }

  async function handleSubmitSwap() {
    setSubmitting(true);

    const myTime = myShiftPreset === 'Khác (Tùy chỉnh)' ? (myShiftCustom || 'Ca tùy chỉnh') : myShiftPreset;
    const targetTime = targetShiftPreset === 'Khác (Tùy chỉnh)' ? (targetShiftCustom || 'Ca tùy chỉnh') : targetShiftPreset;

    const myFullShiftInfo = `[CN ${myBranchName}] ${myTime}`;
    const targetFullShiftInfo = `[CN ${targetBranchName}] ${targetTime}`;

    const swapPayload = {
      requester_id: employee.id,
      requester_name: employee.name,
      target_employee_id: targetEmpId,
      target_employee_name: targetEmpName,
      shift_date: shiftDate,
      my_shift_info: swapType === 'double' ? `⚡ CA ĐÔI / CHẠY SÔ: ${myFullShiftInfo} + ${targetFullShiftInfo}` : myFullShiftInfo,
      target_shift_info: targetFullShiftInfo,
      reason: `[${swapType === 'double' ? 'CA ĐÔI / CHẠY SÔ 2 CHI NHÁNH' : 'ĐỔI CHÉO CA'}] ${reason.trim()}`,
    };

    try {
      await createShiftSwap(swapPayload);
      toast.success('Thành công', 'Đã gửi yêu cầu đổi ca (có thông tin chi nhánh & ca đôi) đến Chủ Quán!');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể gửi yêu cầu đổi ca. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in my-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-700 text-white flex items-center justify-center text-xl font-black shadow-2xs">
              🔄
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-purple-950">Yêu Cầu Đổi Ca / Làm Ca Đôi</h3>
              <p className="text-xs text-purple-700 font-extrabold">
                Bước {step}/3: {step === 1 ? 'Lý Do Đổi' : step === 2 ? 'Chọn Ca, Chi Nhánh & Người Đổi' : 'Xác Nhận & Gửi Chủ'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-sm flex items-center justify-center hover:bg-purple-200 transition-all border-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Dynamic Step Content */}

        {/* BẢNG 1 (STEP 1): LÝ DO ĐỔI CA */}
        {step === 1 && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 font-bold space-y-1">
              <p className="font-black text-amber-950 text-xs sm:text-sm">📌 BƯỚC 1: LÝ DO XIN ĐỔI CA / LÀM CA ĐÔI</p>
              <p>Hãy ghi rõ lý do bạn cần đổi ca hoặc xin gộp làm Ca Đôi (Ví dụ: bận việc gia đình, làm giúp đồng nghiệp...)</p>
            </div>

            <div>
              <label className="block text-xs font-black text-purple-950 mb-1">
                Lý do xin đổi ca <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập chi tiết lý do bạn xin đổi ca ở đây..."
                className="w-full px-3.5 py-2.5 bg-white border border-purple-200 focus:border-purple-600 rounded-2xl text-purple-950 text-sm font-bold outline-none transition-all placeholder:text-purple-400 shadow-2xs resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleNextToStep2}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 border-0"
              >
                <span>Tiếp tục Bước 2</span>
                <span>➡️</span>
              </button>
            </div>
          </div>
        )}

        {/* BẢNG 2 (STEP 2): XÁC NHẬN CHỐT NGOÀI ĐỜI, CHỌN CHI NHÁNH & HÌNH THỨC CA ĐÔI */}
        {step === 2 && (
          <div className="space-y-3.5 animate-fade-in max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
            {/* THẺ CONFIRM BẮT BUỘC ĐÃ THỐNG NHẤT NGOÀI ĐỜI */}
            <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-xs text-emerald-950 font-bold space-y-1 shadow-2xs">
              <p className="font-black text-emerald-900 text-xs sm:text-sm flex items-center gap-1">
                <span>🤝</span>
                <span>XÁC NHẬN ĐỒNG Ý NGOÀI ĐỜI</span>
              </p>
              <p className="text-[11px] text-emerald-800 font-extrabold">
                Xác nhận bạn và đồng nghiệp <strong>ĐÃ TRAO ĐỔI ĐỒNG Ý THỐNG NHẤT Ở NGOÀI ĐỜI</strong> trước khi bấm gửi!
              </p>
            </div>

            {/* CHỌN HÌNH THỨC ĐỔI CA */}
            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 space-y-2">
              <label className="block text-xs font-black text-purple-950">
                ⚙️ Chọn hình thức đổi ca:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSwapType('swap')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    swapType === 'swap'
                      ? 'bg-purple-700 text-white border-purple-800 shadow-xs'
                      : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-100/60'
                  }`}
                >
                  <span>🔄</span>
                  <span>Đổi chéo ca làm</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSwapType('double')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    swapType === 'double'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100/60'
                  }`}
                >
                  <span>⚡</span>
                  <span>Làm Ca Đôi / Chạy sô</span>
                </button>
              </div>
            </div>

            {/* Ô chọn ngày đổi ca */}
            <div>
              <label className="block text-xs font-black text-purple-950 mb-1">
                📅 Ngày diễn ra đổi ca
              </label>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-sm font-bold outline-none"
              />
            </div>

            {/* Ô chọn Đồng nghiệp muốn đổi */}
            <div>
              <label className="block text-xs font-black text-purple-950 mb-1">
                👥 Muốn đổi ca với ai?
              </label>
              {employees.length > 0 ? (
                <select
                  value={targetEmpId}
                  onChange={handleSelectTargetEmp}
                  className="w-full px-3.5 py-2.5 bg-white border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-sm font-black outline-none"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-rose-600 font-bold">Không tìm thấy danh sách đồng nghiệp khác.</p>
              )}
            </div>

            {/* CHI TIẾT CA VÀ CHI NHÁNH 2 BÊN (CHO PHÉP CHỌN KHÁC CHI NHÁNH A4 / 30 / 1A...) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Ca của tôi */}
              <div className="p-3 bg-purple-50/80 rounded-2xl border border-purple-200 space-y-2">
                <label className="block text-[11px] font-black text-purple-950">
                  ⏰ Ca của tôi ({employee.name}):
                </label>
                
                {/* Chọn chi nhánh của tôi */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-purple-900">
                  <span>🏪 Chi nhánh:</span>
                  <select
                    value={myBranchName}
                    onChange={(e) => setMyBranchName(e.target.value)}
                    className="px-2 py-1 bg-white border border-purple-200 rounded-md font-black text-purple-950 text-xs"
                  >
                    {branches.length > 0 ? (
                      branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="30">30</option>
                        <option value="A4">A4</option>
                        <option value="1A">1A</option>
                        <option value="56">56</option>
                        <option value="38">38</option>
                      </>
                    )}
                  </select>
                </div>

                <select
                  value={myShiftPreset}
                  onChange={(e) => setMyShiftPreset(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-purple-200 rounded-lg text-xs font-extrabold text-purple-950"
                >
                  {SHIFT_PRESETS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {myShiftPreset === 'Khác (Tùy chỉnh)' && (
                  <input
                    type="text"
                    placeholder="Ví dụ: 16:00 - 22:00"
                    value={myShiftCustom}
                    onChange={(e) => setMyShiftCustom(e.target.value)}
                    className="w-full px-2.5 py-1 bg-white border border-purple-200 rounded-lg text-xs font-bold"
                  />
                )}
              </div>

              {/* Ca của đồng nghiệp */}
              <div className="p-3 bg-orange-50/80 rounded-2xl border border-orange-200 space-y-2">
                <label className="block text-[11px] font-black text-orange-950">
                  🔄 Ca của ({targetEmpName}):
                </label>

                {/* Chọn chi nhánh của đồng nghiệp */}
                <div className="flex items-center gap-1 text-[11px] font-bold text-orange-900">
                  <span>🏪 Chi nhánh:</span>
                  <select
                    value={targetBranchName}
                    onChange={(e) => setTargetBranchName(e.target.value)}
                    className="px-2 py-1 bg-white border border-orange-200 rounded-md font-black text-orange-950 text-xs"
                  >
                    {branches.length > 0 ? (
                      branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))
                    ) : (
                      <>
                        <option value="A4">A4</option>
                        <option value="30">30</option>
                        <option value="1A">1A</option>
                        <option value="56">56</option>
                        <option value="38">38</option>
                      </>
                    )}
                  </select>
                </div>

                <select
                  value={targetShiftPreset}
                  onChange={(e) => setTargetShiftPreset(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-lg text-xs font-extrabold text-orange-950"
                >
                  {SHIFT_PRESETS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {targetShiftPreset === 'Khác (Tùy chỉnh)' && (
                  <input
                    type="text"
                    placeholder="Ví dụ: 09:00 - 16:00"
                    value={targetShiftCustom}
                    onChange={(e) => setTargetShiftCustom(e.target.value)}
                    className="w-full px-2.5 py-1 bg-white border border-orange-200 rounded-lg text-xs font-bold"
                  />
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs hover:bg-purple-200 border-0 cursor-pointer"
              >
                ⬅️ Quay lại
              </button>
              <button
                type="button"
                onClick={handleNextToStep3}
                className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 border-0"
              >
                <span>Xác nhận Bước 3</span>
                <span>➡️</span>
              </button>
            </div>
          </div>
        )}

        {/* BẢNG 3 (STEP 3): XÁC NHẬN TỔNG HỢP & GỬI YÊU CẦU CHO CHỦ QUÁN */}
        {step === 3 && (
          <div className="space-y-3.5 animate-fade-in">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl space-y-2 text-xs">
              <h4 className="font-black text-purple-950 text-sm border-b border-purple-200 pb-1">
                📋 TỔNG HỢP THÔNG TIN ĐỔI CA
              </h4>

              <div className="space-y-1.5 text-purple-900 font-bold">
                <p>⚙️ <strong>Hình thức:</strong> <span className="text-purple-950 font-black">{swapType === 'double' ? '⚡ LÀM CA ĐÔI / CHẠY SÔ 2 CHI NHÁNH' : '🔄 ĐỔI CHÉO CA'}</span></p>
                <p>👤 <strong>Người gửi:</strong> <span className="text-purple-700 font-black">{employee.name}</span></p>
                <p>👥 <strong>Đồng nghiệp:</strong> <span className="text-orange-600 font-black">{targetEmpName}</span></p>
                <p>📅 <strong>Ngày diễn ra:</strong> <span className="text-purple-950 font-black">{formatDateFull(shiftDate)}</span></p>
                <p>🏪 <strong>Ca của {employee.name}:</strong> <span className="text-purple-900 font-extrabold">[CN {myBranchName}] {myShiftPreset === 'Khác (Tùy chỉnh)' ? myShiftCustom : myShiftPreset}</span></p>
                <p>🔄 <strong>Ca của {targetEmpName}:</strong> <span className="text-orange-700 font-extrabold">[CN {targetBranchName}] {targetShiftPreset === 'Khác (Tùy chỉnh)' ? targetShiftCustom : targetShiftPreset}</span></p>
                <p className="pt-1 text-purple-800 italic">💬 <strong>Lý do:</strong> &quot;{reason}&quot;</p>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-bold">
              ⚡ Yêu cầu sau khi gửi sẽ được <strong>Chủ Quán Phê Duyệt</strong> để sắp xếp lịch chuẩn xác 100%!
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs hover:bg-purple-200 border-0 cursor-pointer"
              >
                ⬅️ Sửa lại
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitSwap}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-2 border-0"
              >
                {submitting ? '🚀 Đang gửi...' : '🚀 Gửi Yêu Cầu Cho Chủ Quán'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
} from '@/lib/supabase';
import ModalXepLichQuick from './ModalXepLichQuick';

/**
 * WeeklyMatrixBoard — Bảng Ma Trận Phân Công Ca Làm Tuần Chuẩn ExcelCao Cấp.
 * Hiển thị chính xác như ảnh mẫu: STT | Tên Nhân Viên | T2 -> CN.
 * Bấm vào bất kỳ ô ngày của Nhân viên để mở Modal Xếp Lịch / Chỉnh Sửa / Xóa Ca.
 */

function formatDateISO(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDaysFromMonday(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(y, m - 1, d + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay(); // 0=CN, 1=T2...
  const daysToSub = day === 0 ? 6 : day - 1;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToSub);
  return formatDateISO(monday);
}

function getBranchColorStyle(name = '', fallbackColor = '#d97706') {
  const n = String(name).toLowerCase().trim();
  // Solid rich color badges for high clarity & zero eye strain for older employees
  if (n.includes('tl') || n.includes('thạch lam') || n.includes('thach lam')) {
    return { badge: 'bg-amber-600 text-white border-amber-700', text: '#92400e', bg: '#fffbe3', border: '#fde68a' }; // Cam Thạch Lam -> TL
  }
  if (n.includes('hbd')) {
    return { badge: 'bg-slate-800 text-white border-slate-900', text: '#1e293b', bg: '#f1f5f9', border: '#cbd5e1' }; // Xám HBD
  }
  if (n.includes('a4') || n.includes('aa4')) {
    return { badge: 'bg-purple-700 text-white border-purple-800', text: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff' }; // Tím A4
  }
  if (n.includes('30') || n.includes('30r')) {
    return { badge: 'bg-emerald-700 text-white border-emerald-800', text: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }; // Xanh lá 30
  }
  if (n.includes('38') || n.includes('38v')) {
    return { badge: 'bg-blue-600 text-white border-blue-700', text: '#075985', bg: '#f0f9ff', border: '#bae6fd' }; // Xanh dương 38
  }
  return { badge: 'bg-amber-600 text-white border-amber-700', text: '#92400e', bg: '#fffbe3', border: '#fde68a' };
}

function formatBranchDisplayName(name = '') {
  if (!name) return '';
  const n = String(name).trim();
  if (n.toLowerCase().includes('thạch lam') || n.toLowerCase().includes('thach lam') || n.toUpperCase() === 'TL') {
    return 'TL';
  }
  return n;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast, highlightEmployeeId, readOnly = false }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [branches, setBranches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    date: null,
    branch: null,
    employee: null,
    editItem: null,
  });

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startDate = weekDays[0];
  const endDate = weekDays[6];

  useEffect(() => {
    loadWeekData();
  }, [currentMonday]);

  async function loadWeekData() {
    setLoading(true);
    try {
      const [branchData, schedData, availData] = await Promise.all([
        getBranches(),
        getScheduleByDateRange(startDate, endDate),
        getAvailabilityByDateRange(startDate, endDate),
      ]);
      setBranches(branchData);
      setSchedule(schedData);
      setAvailability(availData);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể tải lịch tuần');
    }
    setLoading(false);
  }

  function prevWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevM = new Date(y, m - 1, d - 7);
    setCurrentMonday(formatDateISO(prevM));
  }

  function nextWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const nextM = new Date(y, m - 1, d + 7);
    setCurrentMonday(formatDateISO(nextM));
  }

  function goTodayWeek() {
    setCurrentMonday(getMondayOfCurrentWeek());
  }

  // Sắp xếp danh sách nhân viên: Ưu tiên tên cá nhân lên vị trí #1
  const sortedEmployees = useMemo(() => {
    if (!employees) return [];
    return [...employees].sort((a, b) => {
      if (highlightEmployeeId) {
        if (a.id === highlightEmployeeId) return -1;
        if (b.id === highlightEmployeeId) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [employees, highlightEmployeeId]);

  // Index map dữ liệu ca làm theo employeeId_date
  const scheduleByEmpAndDate = useMemo(() => {
    const map = {};
    schedule.forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [schedule]);

  // Index map lịch rảnh theo employeeId_date
  const availByEmpAndDate = useMemo(() => {
    const map = {};
    availability.forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      map[key] = item;
    });
    return map;
  }, [availability]);

  // Phân loại danh sách nhân viên:
  // 1. matrixEmployees: Nhân viên đi làm -> Hiện trong bảng ma trận xếp lịch chính
  // 2. offEmployees: Nhân viên có trạng thái 'leave', 'off' hoặc xin nghỉ cả tuần -> Dời sang bảng riêng bên dưới
  const { matrixEmployees, offEmployees } = useMemo(() => {
    if (!sortedEmployees) return { matrixEmployees: [], offEmployees: [] };

    const matrix = [];
    const offList = [];

    sortedEmployees.forEach((emp) => {
      // 1. Trạng thái cá nhân trong database là 'leave' hoặc 'off'
      const isStatusOff = emp.status === 'leave' || emp.status === 'off' || emp.is_active === false;

      // 2. Số ca đã phân công & số ngày đăng ký xin nghỉ tuần này
      const empWeekShifts = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
      const empOffDays = weekDays.filter((dStr) => availByEmpAndDate[`${emp.id}_${dStr}`]?.type === 'off');

      // Nếu bị set off/leave HOẶC (chưa được phân công ca nào và đăng ký xin nghỉ 4+ ngày trong tuần)
      if (isStatusOff || (empWeekShifts.length === 0 && empOffDays.length >= 4)) {
        offList.push({
          employee: emp,
          reason: emp.status === 'leave'
            ? 'Xin nghỉ ngắn ngày'
            : (emp.status === 'off' || emp.is_active === false)
              ? 'Off / Nghỉ việc'
              : 'Xin nghỉ trong tuần',
          offDaysCount: empOffDays.length,
        });
      } else {
        matrix.push(emp);
      }
    });

    return { matrixEmployees: matrix, offEmployees: offList };
  }, [sortedEmployees, weekDays, availByEmpAndDate, scheduleByEmpAndDate]);

  async function handleSaveModal(data) {
    try {
      await upsertSchedule(data);
      if (toast) toast.success('Thành công', 'Đã lưu phân công ca làm!');
      loadWeekData();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể lưu phân công');
    }
  }

  async function handleDeleteScheduleItem(itemId) {
    try {
      await deleteSchedule(itemId);
      if (toast) toast.info('Đã xóa', 'Đã chuyển ca về trạng thái OFF');
      loadWeekData();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể xóa ca làm');
    }
  }

  function openCellModal(emp, dateStr, existingShift = null) {
    if (readOnly) return;
    const defaultBranch = branches[0] || { id: '', name: 'Chi nhánh' };
    setModalState({
      isOpen: true,
      date: dateStr,
      branch: existingShift?.branches || defaultBranch,
      employee: emp,
      editItem: existingShift,
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Thanh điều hướng Tuần & Chú thích Chi Nhánh - Compact 1-Line Row */}
      <div className="bg-white rounded-2xl p-2.5 sm:px-4 sm:py-3 border border-purple-200/90 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Bộ chuyển tuần 1 dòng */}
        <div className="flex items-center justify-between sm:justify-start gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tuần trước"
          >
            ◀
          </button>

          <div className="text-xs sm:text-base font-black text-purple-950 px-1 text-center">
            <span className="text-purple-800 font-black">
              {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().join('/')}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={nextWeek}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần sau"
            >
              ▶
            </button>

            <button
              type="button"
              onClick={goTodayWeek}
              className="px-2.5 py-1 sm:py-1.5 rounded-xl bg-purple-100 text-purple-950 hover:bg-purple-200 text-xs font-black border border-purple-300 cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              Hôm nay
            </button>
          </div>
        </div>

        {/* Chú thích màu Chi Nhánh - Thẻ Màu Nổi Rõ Ràng */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs font-black justify-center sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-purple-100">
          {branches.map((b) => {
            const style = getBranchColorStyle(b.name, b.color);
            return (
              <div key={b.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] sm:text-xs font-black shadow-2xs ${style.badge}`}>
                <span>{formatBranchDisplayName(b.name)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
         BẢNG MA TRẬN PHÂN CÔNG CHÈ Ms HOA • HEADER 1 DÒNG TỐI ƯU • CỐ ĐỊNH CỘT TÊN
         ========================================================================= */}
      <div className="bg-white rounded-2xl p-1 border border-purple-200 shadow-2xs overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[780px] border-collapse text-xs">
          <thead>
            {/* Header 1 Dòng Duy Nhất: Tên Nhân Viên + T2 (03/08) -> CN (09/08) */}
            <tr className="bg-purple-200 text-purple-950 border-b border-purple-300">
              <th className="py-2.5 px-3 border-r-2 border-purple-300 w-36 sm:w-44 text-left font-black sticky left-0 bg-purple-200 z-20 text-xs sm:text-sm shadow-[3px_0_6px_-2px_rgba(107,33,168,0.1)]">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-1.5 border-r border-purple-300 text-center font-black text-purple-950 text-xs sm:text-sm min-w-[105px]">
                  <div className="font-black text-sm uppercase">{DAY_LABELS[idx]}</div>
                  <div className="text-[11px] font-black text-purple-900">{dStr.split('-').reverse().slice(0, 2).join('/')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                </td>
              </tr>
            ) : matrixEmployees.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-purple-600 italic font-bold">
                  Không có nhân viên đi làm tuần này.
                </td>
              </tr>
            ) : (
              matrixEmployees.map((emp, idx) => {
                const isMe = emp.id === highlightEmployeeId;

                const rowBgClass = isMe
                  ? 'bg-purple-100'
                  : idx % 2 === 0
                    ? 'bg-white'
                    : 'bg-purple-50';

                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-purple-100 transition-all ${rowBgClass} hover:bg-purple-100`}
                  >
                    {/* Tên Nhân Viên - FIXED STICKY LEFT WITH SOLID 100% OPAQUE BACKGROUND */}
                    <td className={`py-3 px-3 border-r-2 border-purple-300 font-black text-purple-950 text-sm sm:text-base sticky left-0 z-20 ${rowBgClass} shadow-[3px_0_6px_-2px_rgba(107,33,168,0.1)]`}>
                      <div className="flex items-center gap-1 truncate">
                        {isMe && <span className="text-purple-700 text-sm">⭐</span>}
                        <span className={isMe ? 'text-purple-950 font-black text-sm sm:text-base' : 'text-purple-950 font-extrabold text-sm sm:text-base'}>
                          {emp.name}
                        </span>
                        {isMe && <span className="text-[10px] text-purple-950 font-black bg-purple-200 px-1.5 py-0.5 rounded border border-purple-300 ml-0.5">(TÔI)</span>}
                      </div>
                    </td>

                    {/* 7 Ô Ngày (T2 -> CN) */}
                    {weekDays.map((dStr) => {
                      const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
                      const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

                      return (
                        <td
                          key={dStr}
                          onClick={() => openCellModal(emp, dStr, empShifts[0] || null)}
                          className={`py-1.5 px-1 border-r border-purple-100 text-center align-middle transition-all min-w-[105px] ${
                            readOnly ? 'cursor-default select-none' : 'cursor-pointer hover:bg-purple-100/60'
                          }`}
                        >
                          {empShifts.length > 0 ? (
                            /* Có Ca Phân Công -> Phô diễn màu sắc tươi sáng, chữ to rõ */
                            <div className="space-y-1">
                              {empShifts.map((shift) => {
                                const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
                                const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                const timeRange = `${startTimeStr}-${endTimeStr}`;
                                const branchDisplayName = formatBranchDisplayName(shift.branches?.name);

                                return (
                                  <div
                                    key={shift.id}
                                    className={`p-1.5 rounded-xl font-black text-xs sm:text-sm leading-tight border shadow-2xs transition-all hover:scale-[1.02] ${style.badge}`}
                                  >
                                    <div className="text-xs font-black tracking-tight">{timeRange}</div>
                                    <div className="text-[11px] font-black opacity-95 mt-0.5 flex items-center justify-center gap-1">
                                      <span>CN {branchDisplayName}</span>
                                      <span className="opacity-80">({shift.hours || 5}h)</span>
                                    </div>
                                    {shift.note && (
                                      <div className="text-[10px] font-extrabold italic opacity-90 truncate mt-0.5">
                                        📝 {shift.note}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Ô Ngày Trống / Không có ca */
                            <div className="py-1 text-center">
                              {!readOnly && empAvail ? (
                                <div className="text-[11px] font-black text-purple-700 truncate">
                                  {empAvail.type === 'full' ? '💪 Cả ngày' : empAvail.type === 'off' ? '🛑 Xin nghỉ' : `📝 ${empAvail.note || 'Tùy ca'}`}
                                </div>
                              ) : (
                                <span className="text-purple-300 font-extrabold text-xs">—</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
         BẢNG RIÊNG DÀNH CHO NHÂN VIÊN XIN NGHỈ / OFF TUẦN NÀY (ĐÃ DỜI KHỎI BẢNG CHÍNH)
         ========================================================================= */}
      {offEmployees.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-rose-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-xs sm:text-sm text-rose-950 flex items-center gap-2">
              <span>🛑</span> Danh Sách Nhân Viên Xin Nghỉ / Off Tuần Này ({offEmployees.length} nhân viên)
            </h3>
            <span className="text-[11px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
              Đã dời khỏi bảng chính để bảng xếp lịch gọn gàng
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {offEmployees.map(({ employee: emp, reason, offDaysCount }) => (
              <div
                key={emp.id}
                className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-purple-950 truncate">{emp.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-rose-100 text-rose-900 border border-rose-300 flex-shrink-0">
                      {reason}
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold text-rose-800 mt-1">
                    🗓️ Số ngày nghỉ: {offDaysCount > 0 ? `${offDaysCount}/7 ngày tuần này` : 'Cả tuần'}
                  </div>
                </div>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => openCellModal(emp, startDate)}
                    className="px-2.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95 flex-shrink-0"
                    title="Xếp lịch làm cho nhân viên này"
                  >
                    + Xếp lịch
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL XẾP LỊCH QUICK KHI BẤM VÀO Ô BẤT KỲ */}
      {modalState.isOpen && (
        <ModalXepLichQuick
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, date: null, branch: null, employee: null, editItem: null })}
          date={modalState.date}
          branch={modalState.branch}
          branches={branches}
          employees={employees}
          availabilities={availability.filter((a) => a.date === modalState.date)}
          daySchedule={schedule.filter((s) => s.date === modalState.date)}
          onSave={handleSaveModal}
          onDelete={handleDeleteScheduleItem}
          editItem={modalState.editItem}
          initialEmployee={modalState.employee}
        />
      )}
    </div>
  );
}

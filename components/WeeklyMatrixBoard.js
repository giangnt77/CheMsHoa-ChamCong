'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
  updateEmployeesSortOrders,
} from '@/lib/supabase';
import { getBranchColorStyle } from '@/lib/utils';
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



function formatBranchDisplayName(name = '') {
  if (!name) return '';
  const n = String(name).trim();
  if (n.toLowerCase().includes('thạch lam') || n.toLowerCase().includes('thach lam') || n.toUpperCase() === 'TL') {
    return 'TL';
  }
  return n;
}

import ModalSortEmployees from './ModalSortEmployees';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast, highlightEmployeeId, readOnly = false, onRefreshEmployees }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [branches, setBranches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSortModal, setShowSortModal] = useState(false);

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

  // Sắp xếp danh sách nhân viên: Đẩy nhân viên OFF xuống cuối cùng, ưu tiên sort_order
  const sortedEmployees = useMemo(() => {
    if (!employees || employees.length === 0) return [];

    return [...employees].sort((a, b) => {
      if (highlightEmployeeId) {
        if (a.id === highlightEmployeeId) return -1;
        if (b.id === highlightEmployeeId) return 1;
      }

      const isOffA = a.status === 'off';
      const isOffB = b.status === 'off';
      if (isOffA !== isOffB) return isOffA ? 1 : -1;

      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;

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

  // Phân loại danh sách nhân viên thành 3 nhóm độc lập:
  // 1. matrixEmployees: Nhân viên đi làm -> Hiện trong bảng ma trận xếp lịch chính
  // 2. shortLeaveEmployees: BẢNG VÀNG 🟡 -> Danh sách Nhân viên xin nghỉ vài ngày / nghỉ ngắn ngày
  // 3. permanentOffEmployees: BẢNG ĐỎ 🔴 -> Danh sách Nhân viên Off luôn / nghỉ việc cố định
  const { matrixEmployees, shortLeaveEmployees, permanentOffEmployees } = useMemo(() => {
    if (!sortedEmployees) return { matrixEmployees: [], shortLeaveEmployees: [], permanentOffEmployees: [] };

    const matrix = [];
    const shortLeaveList = [];
    const permanentOffList = [];

    sortedEmployees.forEach((emp) => {
      // 1. NGHỈ VIỆC / OFF CỐ ĐỊNH (Bảng Đỏ 🔴) -> Chỉ khi trạng thái chính xác là 'off'
      if (emp.status === 'off') {
        permanentOffList.push({
          employee: emp,
          reason: 'Off / Nghỉ việc cố định',
        });
        return;
      }

      // Đếm số ngày đăng ký xin nghỉ trong tuần này
      const empOffDays = weekDays.filter((dStr) => availByEmpAndDate[`${emp.id}_${dStr}`]?.type === 'off');
      const empWeekShifts = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);

      // 2. XIN NGHỈ NGẮN NGÀY / NGHỈ VÀI NGÀY (BẢNG VÀNG 🟡) -> Khi status là 'leave' hoặc đăng ký xin nghỉ trong tuần
      if (emp.status === 'leave' || (empOffDays.length > 0 && empWeekShifts.length === 0)) {
        shortLeaveList.push({
          employee: emp,
          reason: emp.status === 'leave' ? 'Xin nghỉ ngắn ngày' : `Xin nghỉ ${empOffDays.length}/7 ngày tuần này`,
          offDaysCount: empOffDays.length,
        });
        return;
      }

      // 3. Nhân viên đi làm bình thường -> Hiện ở bảng xếp lịch chính
      matrix.push(emp);
    });

    return {
      matrixEmployees: matrix,
      shortLeaveEmployees: shortLeaveList,
      permanentOffEmployees: permanentOffList,
    };
  }, [sortedEmployees, weekDays, availByEmpAndDate, scheduleByEmpAndDate]);

  const [customMatrixOrder, setCustomMatrixOrder] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [isSortMode, setIsSortMode] = useState(false);
  const [savingSort, setSavingSort] = useState(false);

  useEffect(() => {
    if (matrixEmployees && matrixEmployees.length > 0) {
      setCustomMatrixOrder(matrixEmployees);
    }
  }, [matrixEmployees]);

  // Khi người dùng bấm "✓ HOÀN THÀNH SẮP XẾP": Lưu 100% lên Supabase và làm mới dữ liệu cho cả Admin & Nhân viên
  async function handleFinishSorting() {
    setSavingSort(true);
    try {
      const fullList = [
        ...customMatrixOrder,
        ...shortLeaveEmployees.map((x) => x.employee),
        ...permanentOffEmployees.map((x) => x.employee),
      ];
      const orders = fullList.map((emp, i) => ({
        id: emp.id,
        sort_order: i + 1,
      }));

      await updateEmployeesSortOrders(orders);
      if (onRefreshEmployees) await onRefreshEmployees();
      await loadWeekData();
      setIsSortMode(false);
      if (toast) toast.success('Đã lưu thứ tự', 'Đã cập nhật thứ tự mới cho cả Admin & Nhân Viên!');
    } catch (err) {
      console.error('Lỗi lưu thứ tự lên Supabase:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu thứ tự nhân viên!');
    }
    setSavingSort(false);
  }

  function jumpDirectMatrixPosition(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= customMatrixOrder.length || fromIndex === toIndex) return;
    const newMatrix = [...customMatrixOrder];
    const [movedEmp] = newMatrix.splice(fromIndex, 1);
    newMatrix.splice(toIndex, 0, movedEmp);
    setCustomMatrixOrder(newMatrix);
  }

  function handleDirectDragStart(e, index) {
    if (!isSortMode) return;
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDirectDragOver(e, index) {
    if (!isSortMode) return;
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    jumpDirectMatrixPosition(draggedIdx, index);
    setDraggedIdx(index);
  }

  function handleDirectDragEnd() {
    setDraggedIdx(null);
  }

  function handleDirectTouchStart(e, index) {
    if (!isSortMode) return;
    setDraggedIdx(index);
  }

  function handleDirectTouchMove(e) {
    if (!isSortMode || draggedIdx === null) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetElement) return;
    const cellElement = targetElement.closest('[data-sort-index]');
    if (cellElement) {
      const targetIdx = Number(cellElement.getAttribute('data-sort-index'));
      if (!isNaN(targetIdx) && targetIdx !== draggedIdx) {
        jumpDirectMatrixPosition(draggedIdx, targetIdx);
        setDraggedIdx(targetIdx);
      }
    }
  }

  function handleDirectTouchEnd() {
    setDraggedIdx(null);
  }

  const [copyingEmpId, setCopyingEmpId] = useState(null);

  async function handleCopyEmployeePrevWeek(emp) {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevMondayObj = new Date(y, m - 1, d - 7);
    const prevSundayObj = new Date(y, m - 1, d - 1);
    const prevStartDate = formatDateISO(prevMondayObj);
    const prevEndDate = formatDateISO(prevSundayObj);

    if (
      !confirm(
        `Bạn có muốn SAO CHÉP toàn bộ ca làm tuần trước (${prevStartDate
          .split('-')
          .reverse()
          .slice(0, 2)
          .join('/')} - ${prevEndDate.split('-').reverse().slice(0, 2).join('/')}) của nhân viên "${emp.name}" sang tuần này không?`
      )
    ) {
      return;
    }

    setCopyingEmpId(emp.id);
    try {
      const prevSchedData = await getScheduleByDateRange(prevStartDate, prevEndDate);
      const empPrevShifts = prevSchedData.filter((s) => s.employee_id === emp.id);

      if (!empPrevShifts || empPrevShifts.length === 0) {
        if (toast) toast.warning('Trống', `Tuần trước nhân viên ${emp.name} chưa có ca làm nào!`);
        setCopyingEmpId(null);
        return;
      }

      let count = 0;
      for (const item of empPrevShifts) {
        const itemDate = new Date(item.date + 'T00:00:00');
        const newDateObj = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate() + 7);
        const newDateStr = formatDateISO(newDateObj);

        await upsertSchedule({
          employeeId: item.employee_id,
          branchId: item.branch_id,
          date: newDateStr,
          startTime: item.start_time ? item.start_time.slice(0, 5) : '09:00',
          endTime: item.end_time ? item.end_time.slice(0, 5) : '14:00',
          hours: item.hours || 5,
          note: item.note || '',
        });
        count++;
      }

      await loadWeekData();
      if (toast) toast.success('Đã sao chép!', `Đã sao chép ${count} ca làm tuần trước cho ${emp.name}!`);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', `Không thể sao chép lịch cho ${emp.name}`);
    }
    setCopyingEmpId(null);
  }

  async function handleSaveModal(data) {
    try {
      if (data.applyWholeWeek) {
        for (const dayStr of weekDays) {
          await upsertSchedule({
            ...data,
            date: dayStr,
          });
        }
        if (toast) toast.success('Đã nhân bản!', 'Đã áp dụng ca làm này cho tất cả các ngày trong tuần!');
      } else {
        await upsertSchedule(data);
        if (toast) toast.success('Thành công', 'Đã lưu phân công ca làm!');
      }
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

            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  if (isSortMode) {
                    handleFinishSorting();
                  } else {
                    setIsSortMode(true);
                  }
                }}
                disabled={savingSort}
                className={`px-3 py-1 sm:py-1.5 rounded-xl text-xs font-black cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 border-0 ${
                  isSortMode
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse shadow-md font-black'
                    : 'bg-purple-700 hover:bg-purple-800 text-white font-black'
                }`}
                title={isSortMode ? 'Bấm để lưu thứ tự mới cho cả Admin & Nhân Viên' : 'Bấm để bật chế độ kéo thả sắp xếp nhân viên'}
              >
                {savingSort ? (
                  '⏳ Đang lưu...'
                ) : isSortMode ? (
                  <>
                    <span>✓</span> HOÀN THÀNH SẮP XẾP
                  </>
                ) : (
                  <>
                    <span>↕️</span> Sắp Xếp NV
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Chú thích màu Chi Nhánh - Tự động đồng bộ 100% từ DB */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs font-black justify-center sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-purple-100">
          {branches.map((b) => {
            const style = getBranchColorStyle(b.name, b.color);
            return (
              <div
                key={b.id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] sm:text-xs font-black border shadow-2xs"
                style={style.badgeStyle}
              >
                <span>{formatBranchDisplayName(b.name)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
         BẢNG MA TRẬN PHÂN CÔNG CHÈ Ms HOA • HEADER 1 DÒNG TỐI ƯU • CỐ ĐỊNH CỘT TÊN CHE KHẤT 100%
         ========================================================================= */}
      <div className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            {/* Hàng 1: Tên Thứ (T2 -> CN) */}
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-2.5 px-2 border-r-2 border-purple-300 w-28 sm:w-36 text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-xs">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-2 border-r border-purple-800 text-center font-black uppercase text-amber-300 text-xs sm:text-sm">
                  <div>{DAY_LABELS[idx]}</div>
                  <div className="text-[11px] font-extrabold text-purple-200 mt-0.5">{dStr.split('-').reverse().slice(0, 2).join('/')}</div>
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
            ) : customMatrixOrder.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-purple-600 italic font-bold">
                  Không có nhân viên đi làm tuần này.
                </td>
              </tr>
            ) : (
              customMatrixOrder.map((emp, idx) => {
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
                    {/* Tên Nhân Viên — CHỈ CHO PHÉP KÉO THẢ KHI BẬT isSortMode */}
                    <td
                      data-sort-index={idx}
                      draggable={!readOnly && isSortMode}
                      onDragStart={(e) => !readOnly && isSortMode && handleDirectDragStart(e, idx)}
                      onDragOver={(e) => !readOnly && isSortMode && handleDirectDragOver(e, idx)}
                      onDragEnd={handleDirectDragEnd}
                      onTouchStart={(e) => !readOnly && isSortMode && handleDirectTouchStart(e, idx)}
                      onTouchMove={(e) => !readOnly && isSortMode && handleDirectTouchMove(e)}
                      onTouchEnd={handleDirectTouchEnd}
                      className={`py-2.5 px-2 border-r-2 border-purple-300 font-black text-purple-950 text-xs sm:text-sm sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-28 sm:w-36 ${
                        isSortMode
                          ? 'cursor-grab active:cursor-grabbing bg-amber-50/80 border-amber-300 hover:bg-amber-100/90'
                          : ''
                      } ${draggedIdx === idx ? 'bg-purple-200/90 opacity-75 border-purple-500 shadow-xl scale-98' : ''}`}
                      title={isSortMode ? 'Đang bật Sắp Xếp: Chạm/Giữ kéo thả hàng này' : ''}
                    >
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <div className="flex items-center gap-1 truncate min-w-0 flex-1">
                          {isSortMode && (
                            <span className="text-amber-600 font-black text-sm select-none touch-none animate-pulse" title="Chạm giữ để kéo hàng">
                              ≡
                            </span>
                          )}
                          {isMe && <span className="text-purple-700 text-xs" title="Tài khoản của tôi">⭐</span>}
                          <span className={isMe ? 'text-purple-950 font-black text-xs sm:text-sm truncate' : 'text-purple-950 font-extrabold text-xs sm:text-sm truncate'}>
                            {emp.name}
                          </span>
                        </div>

                        {!readOnly && !isSortMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyEmployeePrevWeek(emp);
                            }}
                            disabled={copyingEmpId === emp.id}
                            className="px-1.5 py-0.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-purple-950 font-black text-[10px] border border-amber-500/50 cursor-pointer shadow-2xs flex-shrink-0 transition-all active:scale-95 flex items-center gap-0.5"
                            title={`Sao chép toàn bộ ca làm tuần trước của ${emp.name} sang tuần này`}
                          >
                            <span>📋</span>
                            <span className="hidden sm:inline">{copyingEmpId === emp.id ? '⏳' : 'Copy'}</span>
                          </button>
                        )}
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
                            /* Có Ca Phân Công -> Phô diễn màu sắc tươi sáng chuẩn DB 100% */
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
                                    className="p-1.5 rounded-xl font-black text-xs sm:text-sm leading-tight border shadow-2xs transition-all hover:scale-[1.02]"
                                    style={style.badgeStyle}
                                  >
                                    <div className="text-xs font-black tracking-tight">{timeRange}</div>
                                    <div className="text-xs font-black opacity-95 mt-0.5">
                                      {branchDisplayName}
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
                            /* Ô Ngày Trống / Không có ca -> Hiện chữ thông báo OFF rõ ràng */
                            <div className="py-1 text-center">
                              {!readOnly && empAvail ? (
                                <div className="text-[11px] font-black text-purple-700 truncate">
                                  {empAvail.type === 'full' ? '💪 Cả ngày' : empAvail.type === 'off' ? '🛑 Xin nghỉ' : `📝 ${empAvail.note || 'Tùy ca'}`}
                                </div>
                              ) : (
                                <span className="text-red-600 font-black text-[11px] sm:text-xs uppercase px-2 py-0.5 rounded-md bg-red-50 border border-red-200 inline-block shadow-2xs">
                                  OFF
                                </span>
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
         BẢNG RIÊNG 1: DANH SÁCH NHÂN VIÊN XIN OFF (TẠM NGHỈ VÀI NGÀY)
         ========================================================================= */}
      {shortLeaveEmployees.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-amber-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-xs sm:text-sm text-amber-950 flex items-center gap-2">
              <span>🟡</span> Danh Sách Nhân Viên Xin Off ({shortLeaveEmployees.length} nhân viên)
            </h3>
            <span className="text-[11px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
              Tạm off vài ngày trong tuần
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {shortLeaveEmployees.map(({ employee: emp, reason, offDaysCount }) => (
              <div
                key={emp.id}
                className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-purple-950 truncate">{emp.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-amber-100 text-amber-900 border border-amber-300 flex-shrink-0">
                      🟡 {reason}
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold text-amber-800 mt-1">
                    🗓️ Đã xin off: {offDaysCount > 0 ? `${offDaysCount}/7 ngày tuần này` : 'Tạm off'}
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

      {/* =========================================================================
         BẢNG RIÊNG 2: DANH SÁCH NHÂN VIÊN NGHỈ VIỆC (NGỪNG LÀM / OFF LUÔN)
         ========================================================================= */}
      {permanentOffEmployees.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-rose-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-xs sm:text-sm text-rose-950 flex items-center gap-2">
              <span>🔴</span> Danh Sách Nhân Viên Nghỉ Việc ({permanentOffEmployees.length} nhân viên)
            </h3>
            <span className="text-[11px] font-extrabold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
              Nghỉ luôn / Ngừng làm
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {permanentOffEmployees.map(({ employee: emp, reason }) => (
              <div
                key={emp.id}
                className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-purple-950 truncate">{emp.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-rose-100 text-rose-900 border border-rose-300 flex-shrink-0">
                      🔴 {reason}
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold text-rose-800 mt-1">
                    ⛔ Đã nghỉ việc / ngưng xếp lịch
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

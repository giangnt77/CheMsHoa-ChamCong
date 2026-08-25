'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
  upsertAvailability,
  updateEmployeesSortOrders,
  getHolidaySettings,
  getHolidayForDate,
  getBlockedOffDays,
  getWeekLockStatus,
  saveWeekLockStatus,
  getAllEmployeeRates,
  calculateSalaryFromShifts,
} from '@/lib/supabase';
import { getBranchColorStyle, getToday, formatCurrency } from '@/lib/utils';
import ModalXepLichQuick from './ModalXepLichQuick';
import ModalSortEmployees from './ModalSortEmployees';
import ModalBlockOffDays from './ModalBlockOffDays';
import ModalHolidaySettings from './ModalHolidaySettings';
import ModalWeekPicker from './ModalWeekPicker';
import ModalAdjustedShiftsList from './ModalAdjustedShiftsList';

function calculateShiftHours(shift) {
  if (!shift) return 0;
  if (shift.duration_hours && Number(shift.duration_hours) > 0) {
    return Number(shift.duration_hours);
  }
  const startStr = shift.start_time || '09:00';
  const endStr = shift.end_time || '14:00';
  const [sH, sM] = startStr.split(':').map(Number);
  const [eH, eM] = endStr.split(':').map(Number);
  let startMinutes = (sH || 0) * 60 + (sM || 0);
  let endMinutes = (eH || 0) * 60 + (eM || 0);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return Math.max(0, (endMinutes - startMinutes) / 60);
}

// Bóc tách text hiển thị chi tiết (ví dụ: +4h làm thay Kỳ, +1h tăng ca, Về sớm 17h)
function getShiftAdjustmentDisplay(shift) {
  if (!shift || !shift.note) return null;
  const note = shift.note.trim();

  // Kiểm tra format [Gốc: ...] hoặc [Ca gốc: ...]
  const match = note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*\|\s*([^\]]+))?\]\s*(.*)/i);
  if (match) {
    const origStart = match[1];
    const origEnd = match[2];
    const insidePipe = (match[3] || '').trim();
    const outsideText = (match[4] || '').trim();

    const detail = outsideText || insidePipe;
    if (detail) {
      return detail;
    }

    // Nếu không có text chi tiết, tự tính chênh lệch so với giờ ca hiện tại
    const curStart = shift.start_time ? shift.start_time.slice(0, 5) : '';
    const curEnd = shift.end_time ? shift.end_time.slice(0, 5) : '';
    if (curStart && curEnd && origStart && origEnd) {
      const [sh, sm] = curStart.split(':').map(Number);
      const [eh, em] = curEnd.split(':').map(Number);
      const [osh, osm] = origStart.split(':').map(Number);
      const [oeh, oem] = origEnd.split(':').map(Number);
      let curH = (eh * 60 + em - (sh * 60 + sm)) / 60;
      if (curH < 0) curH += 24;
      let origH = (oeh * 60 + oem - (osh * 60 + osm)) / 60;
      if (origH < 0) origH += 24;
      const diff = Math.round((curH - origH) * 100) / 100;
      if (diff > 0) return `+${diff}h tăng ca`;
      if (diff < 0) return `Về sớm (${diff}h)`;
    }

    return `Gốc: ${origStart}-${origEnd}`;
  }

  return note;
}

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

function formatAvailTextForView(empAvail, isReadOnly) {
  if (!empAvail) return null;

  if (empAvail.type === 'full') {
    return '💪 Cả ngày';
  }

  if (empAvail.type === 'off') {
    // Phía Admin (isReadOnly === false): Hiện chi tiết ghi chú xin nghỉ
    if (!isReadOnly && empAvail.note) {
      return `🔴 ${empAvail.note}`;
    }
    // Phía Nhân Viên (isReadOnly === true): Ẩn 100% lý do riêng tư, chỉ hiện "Xin nghỉ"!
    return '🔴 Xin nghỉ';
  }

  // Loại 'option' (Tùy ca):
  const rawNote = (empAvail.note || '').trim();
  const isOnlyHours = /^\d{1,2}h?(\d{2})?\s*-\s*\d{1,2}h?(\d{2})?$/i.test(rawNote) || /^\d{1,2}h\s*-\s*\d{1,2}h$/i.test(rawNote);

  if (isReadOnly) {
    // Phía Nhân Viên: Giữ mốc giờ sạch (VD: "9h-17h"). Nếu là lý do chữ cá nhân ("bận học", "thứ 2 em xin...") -> Hiện "📝 Tùy ca"!
    if (isOnlyHours) {
      return `📝 ${rawNote}`;
    }
    return '📝 Tùy ca';
  }

  // Phía Admin: Hiện đầy đủ ghi chú
  return `📝 ${rawNote || 'Tùy ca'}`;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast, highlightEmployeeId, readOnly = false, onRefreshEmployees }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [branches, setBranches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [localSchedule, setLocalSchedule] = useState([]);
  const [deletedShiftIds, setDeletedShiftIds] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [localAvailability, setLocalAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showBlockOffModal, setShowBlockOffModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showWeekPickerModal, setShowWeekPickerModal] = useState(false);
  const [showAdjustedShiftsModal, setShowAdjustedShiftsModal] = useState(false);
  const [isWeekLocked, setIsWeekLocked] = useState(false);
  const [ratesMap, setRatesMap] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [blockedMap, setBlockedMap] = useState({});

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

  // Danh sách các ca có phát sinh đổi ca / làm thay / tăng ca / về sớm trong tuần
  const adjustedShiftsInWeek = useMemo(() => {
    const activeSched = localSchedule.length > 0 ? localSchedule : schedule;
    return activeSched.filter((s) => {
      if (!s || !s.note) return false;
      const n = s.note.toLowerCase();
      return (
        n.includes('[gốc:') ||
        n.includes('[ca gốc:') ||
        n.includes('làm thay') ||
        n.includes('tăng ca') ||
        n.includes('về sớm') ||
        n.includes('gánh ca')
      );
    });
  }, [localSchedule, schedule]);

  const tableContainerRef = useRef(null);

  useEffect(() => {
    loadWeekData();
  }, [currentMonday]);

  // CHỈ BÊN NHÂN VIÊN ĐĂNG NHẬP (readOnly === true): TỰ ĐỘNG CUỘN NGANG ĐẾN CỘT "HÔM NAY" ĐỂ XEM LỊCH NHANH ⚡
  useEffect(() => {
    if (readOnly && !loading && tableContainerRef.current) {
      const todayStr = getToday();
      const todayIdx = weekDays.indexOf(todayStr);
      if (todayIdx >= 0) {
        requestAnimationFrame(() => {
          const todayTh = tableContainerRef.current?.querySelector(`[data-date="${todayStr}"]`);
          if (todayTh) {
            const scrollLeft = todayTh.offsetLeft - 140;
            tableContainerRef.current.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
          }
        });
      }
    }
  }, [readOnly, loading, weekDays]);

  async function loadWeekData(isSilent = false) {
    const savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const [branchData, schedData, availData, holidayData, blockedData, lockStatus, allRatesData] = await Promise.all([
        getBranches(),
        getScheduleByDateRange(startDate, endDate),
        getAvailabilityByDateRange(startDate, endDate),
        getHolidaySettings(),
        getBlockedOffDays(),
        getWeekLockStatus(currentMonday),
        getAllEmployeeRates(),
      ]);
      setBranches(branchData);
      setSchedule(schedData);
      setLocalSchedule(schedData);
      setDeletedShiftIds([]);
      setHasUnsavedChanges(false);
      setAvailability(availData);
      setLocalAvailability(availData);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
      setIsWeekLocked(Boolean(lockStatus));

      const rMap = {};
      (allRatesData || []).forEach((r) => {
        if (!rMap[r.employee_id]) rMap[r.employee_id] = [];
        rMap[r.employee_id].push(r);
      });
      setRatesMap(rMap);

      if (blockedData && typeof blockedData === 'object' && !Array.isArray(blockedData)) {
        if (Array.isArray(blockedData.blockedDays)) {
          const map = {};
          blockedData.blockedDays.forEach((dIdx) => {
            map[dIdx] = blockedData.reason || 'Ngày cao điểm đông khách, quán yêu cầu đi làm đầy đủ!';
          });
          setBlockedMap(map);
        } else {
          setBlockedMap(blockedData);
        }
      } else if (Array.isArray(blockedData)) {
        const map = {};
        blockedData.forEach((dIdx) => {
          map[dIdx] = 'Ngày cao điểm đông khách, quán yêu cầu đi làm đầy đủ!';
        });
        setBlockedMap(map);
      }
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể tải lịch tuần');
    }
    if (!isSilent) {
      setLoading(false);
    }

    // Tự động giữ nguyên vị trí cuộn màn hình hiện tại của Admin
    if (typeof window !== 'undefined' && savedScrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      });
    }
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

  async function handleToggleWeekLock() {
    const nextLock = !isWeekLocked;
    if (nextLock) {
      const confirmed = window.confirm(
        '🔒 Bạn có chắc muốn CHỐT LỊCH TUẦN NÀY?\n\n- Toàn bộ lịch làm hiện tại sẽ được lưu làm MỐC CA GỐC chính thức.\n- Các thay đổi sau này trong tuần sẽ được tính là Làm thay / Tăng ca / Về sớm.\n- Bạn vẫn có thể Mở lại chốt lịch bất cứ lúc nào nếu cần xếp lại.'
      );
      if (!confirmed) return;
    }

    setIsWeekLocked(nextLock);
    await saveWeekLockStatus(currentMonday, nextLock);
    if (toast) {
      if (nextLock) {
        toast.success('Đã chốt lịch tuần!', 'Lịch tuần này đã được chốt làm Lịch Gốc chính thức.');
      } else {
        toast.info('Đã mở khóa lịch tuần', 'Bạn có thể chỉnh sửa lịch tự do mà không tính làm thay.');
      }
    }
  }

  // Lọc bỏ tài khoản Chủ Quán & Quản Lý ra khỏi Bảng Xếp Lịch Nhân Viên (BẰNG MỌI GIÁ LOẠI BỎ 'Owner' VÀ 'Manager')
  const staffEmployees = useMemo(() => {
    if (!employees || employees.length === 0) return [];
    return employees.filter((e) => {
      const nameLower = String(e.name || '').toLowerCase().trim();
      const roleLower = String(e.role || '').toLowerCase().trim();
      return (
        roleLower !== 'owner' &&
        roleLower !== 'manager' &&
        nameLower !== 'owner' &&
        nameLower !== 'manager' &&
        !nameLower.includes('owner') &&
        !nameLower.includes('manager') &&
        !nameLower.includes('chủ quán') &&
        !nameLower.includes('quản lý')
      );
    });
  }, [employees]);

  // Sắp xếp danh sách nhân viên: Theo sort_order do Admin sắp xếp
  const sortedEmployees = useMemo(() => {
    if (!staffEmployees || staffEmployees.length === 0) return [];

    return [...staffEmployees].sort((a, b) => {
      if (highlightEmployeeId) {
        if (a.id === highlightEmployeeId) return -1;
        if (b.id === highlightEmployeeId) return 1;
      }

      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;

      return a.name.localeCompare(b.name);
    });
  }, [staffEmployees, highlightEmployeeId]);

  // Index map dữ liệu ca làm theo employeeId_date
  const scheduleByEmpAndDate = useMemo(() => {
    const map = {};
    localSchedule.forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [localSchedule]);

  // Helper tính chuẩn xác tổng lương & tổng giờ dựa trên lịch sử tăng lương và ngày lễ
  const calcTotalSalaryForShifts = useMemo(() => {
    return (shiftsList) => {
      let totalH = 0;
      let totalS = 0;

      const shiftsByEmp = {};
      (shiftsList || []).forEach((s) => {
        if (!s || !s.employee_id) return;
        if (!shiftsByEmp[s.employee_id]) shiftsByEmp[s.employee_id] = [];
        shiftsByEmp[s.employee_id].push(s);
      });

      Object.keys(shiftsByEmp).forEach((empId) => {
        const emp = (employees || []).find((e) => e.id === empId);
        const empRates = ratesMap[empId] || [];
        const defaultRate = emp?.hourly_rate || 20000;
        const { totalHours, grossSalary } = calculateSalaryFromShifts(
          shiftsByEmp[empId],
          empRates,
          defaultRate,
          holidays
        );
        totalH += totalHours;
        totalS += grossSalary;
      });

      return {
        totalHours: Math.round(totalH * 100) / 100,
        totalSalary: Math.round(totalS),
      };
    };
  }, [employees, ratesMap, holidays]);

  // Tính tổng lương & tổng giờ làm của toàn bộ 7 ngày trong tuần
  const { weekTotalHours, weekTotalSalary } = useMemo(() => {
    const weekShifts = (localSchedule || []).filter((s) => weekDays.includes(s.date));
    const res = calcTotalSalaryForShifts(weekShifts);
    return {
      weekTotalHours: res.totalHours || 0,
      weekTotalSalary: res.totalSalary || 0,
    };
  }, [localSchedule, weekDays, calcTotalSalaryForShifts]);

  // Index map lịch rảnh theo employeeId_date
  const availByEmpAndDate = useMemo(() => {
    const map = {};
    (localAvailability.length > 0 ? localAvailability : availability).forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      map[key] = item;
    });
    return map;
  }, [localAvailability, availability]);

  // Phân loại danh sách nhân viên thành 3 nhóm độc lập:
  // 1. matrixEmployees: Nhân viên đi làm -> Hiện trong bảng ma trận xếp lịch chính
  // 2. shortLeaveEmployees: BẢNG VÀNG 🟡 -> Danh sách Nhân viên xin nghỉ cả tuần (7/7 ngày) hoặc trạng thái 'leave'
  // 3. permanentOffEmployees: BẢNG ĐỎ 🔴 -> Danh sách Nhân viên Off luôn / nghỉ việc cố định ('off')
  const { matrixEmployees, shortLeaveEmployees, permanentOffEmployees } = useMemo(() => {
    if (!sortedEmployees) return { matrixEmployees: [], shortLeaveEmployees: [], permanentOffEmployees: [] };

    const matrix = [];
    const shortLeaveList = [];
    const permanentOffList = [];

    sortedEmployees.forEach((emp) => {
      // 0. Kiểm tra xem nhân viên có ca phân công nào trong tuần này không (dù 1 ca cũng tính)
      const hasShiftsInThisWeek = weekDays.some(
        (dStr) => (scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []).length > 0
      );

      // QUY TẮC ƯU TIÊN SỐ 1: Bất kỳ tuần nào có ca phân công -> LUÔN HIỆN TRÊN BẢNG MA TRẬN CHÍNH
      if (hasShiftsInThisWeek) {
        matrix.push(emp);
        return;
      }

      // 0.1 Nếu nhân viên mới vào làm SAU KHI tuần này đã kết thúc -> Ẩn tên khỏi bảng tuần cũ này
      const empStartDate = emp.created_at ? emp.created_at.slice(0, 10) : '2000-01-01';
      if (empStartDate > endDate) {
        return;
      }

      // 1. NGHỈ VIỆC / OFF CỐ ĐỊNH ('off')
      // Nếu tuần đang xem xảy ra TRƯỚC NGÀY NGHỈ VIỆC (startDate < resignedDate) -> Vẫn hiển thị bình thường ở các tuần quá khứ!
      // Nếu tuần đang xem diễn ra SAU KHI ĐÃ NGHỈ VIỆC và không có ca làm -> Ẩn khỏi bảng ma trận chính để tránh rác hàng OFF!
      if (emp.status === 'off' || emp.is_active === false) {
        const resignedDate = emp.resigned_at || emp.off_date || (emp.updated_at ? emp.updated_at.slice(0, 10) : '2099-12-31');
        if (startDate < resignedDate) {
          matrix.push(emp); // Tuần quá khứ trước khi nghỉ -> Vẫn hiện trên bảng!
        } else {
          permanentOffList.push({
            employee: emp,
            reason: `Đã nghỉ việc từ ${resignedDate.split('-').reverse().join('/')}`,
          });
        }
        return;
      }

      // 2. XIN OFF TẠM THỜI ('leave')
      if (emp.status === 'leave') {
        const offStart = emp.off_start_date || (emp.updated_at ? emp.updated_at.slice(0, 10) : startDate);
        const offEnd = emp.off_end_date || offStart;

        // Nếu tuần đang xem nằm trước offStart hoặc nằm sau offEnd -> Hiện tên trên bảng chính
        if (endDate < offStart || startDate > offEnd) {
          matrix.push(emp);
          return;
        }

        // Tính số ngày trong tuần này bị trùng khoảng off [offStart -> offEnd]
        const daysInOffPeriod = weekDays.filter((dStr) => dStr >= offStart && dStr <= offEnd);

        // Nếu OFF TOÀN BỘ 7 NGÀY TRONG TUẦN VÀ KHÔNG CÓ CA NÀO -> Mới đưa vào BẢNG VÀNG 🟡
        if (daysInOffPeriod.length >= 7) {
          shortLeaveList.push({
            employee: emp,
            reason: `Off từ ${offStart.split('-').reverse().slice(0, 2).join('/')} đến ${offEnd.split('-').reverse().slice(0, 2).join('/')}`,
            offDaysCount: daysInOffPeriod.length,
          });
          return;
        }

        // Nếu off vài ngày trong tuần (ví dụ off từ Chủ Nhật) -> VẪN GIỮ NGHUYÊN TRÊN BẢNG MA TRẬN CHÍNH!
        matrix.push(emp);
        return;
      }

      // 3. TẤT CẢ NHÂN VIÊN ĐANG LÀM ('active') -> LUÔN HIỆN TRÊN BẢNG MA TRẬN CHÍNH
      matrix.push(emp);
    });

    return {
      matrixEmployees: matrix,
      shortLeaveEmployees: shortLeaveList,
      permanentOffEmployees: permanentOffList,
    };
  }, [sortedEmployees, weekDays, startDate, endDate, availByEmpAndDate, scheduleByEmpAndDate]);

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

      await loadWeekData(true);
      if (toast) toast.success('Đã sao chép!', `Đã sao chép ${count} ca làm tuần trước cho ${emp.name}!`);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', `Không thể sao chép lịch cho ${emp.name}`);
    }
    setCopyingEmpId(null);
  }

  // 1. Gán / Chỉnh sửa ca làm từ Modal (chỉ cập nhật State Local & đánh dấu isDirty)
  function handleSaveModal(data) {
    const datesToApply = data.applyWholeWeek ? weekDays : [data.date];
    const targetBranch = branches.find((b) => b.id === data.branchId) || branches[0];

    setLocalSchedule((prev) => {
      let updated = [...prev];
      datesToApply.forEach((dStr) => {
        // Nếu là ca chỉnh sửa đã có ID
        const existingIdx = updated.findIndex((s) => s.id && s.id === data.editId);
        if (existingIdx !== -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            branch_id: data.branchId,
            branches: targetBranch,
            start_time: data.startTime,
            end_time: data.endTime,
            hours: data.hours,
            note: data.note || '',
            date: dStr,
            isDirty: true,
          };
        } else {
          // Tạo mới item ca làm draft
          const newDraft = {
            id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            employee_id: data.employeeId,
            branch_id: data.branchId,
            branches: targetBranch,
            date: dStr,
            start_time: data.startTime,
            end_time: data.endTime,
            hours: data.hours,
            note: data.note || '',
            isDraft: true,
            isDirty: true,
          };
          updated.push(newDraft);
        }

        // Tự động đồng bộ ca đối ứng 2 chiều cho nhân viên làm thay/bị thay
        if (data.peerAdjustment && data.peerAdjustment.peerEmployeeId) {
          const peerIdx = updated.findIndex(
            (s) => s.employee_id === data.peerAdjustment.peerEmployeeId && s.date === dStr
          );
          if (peerIdx !== -1) {
            const peerShift = updated[peerIdx];
            const curPeerStart = peerShift.start_time ? peerShift.start_time.slice(0, 5) : '09:00';
            const curPeerEnd = peerShift.end_time ? peerShift.end_time.slice(0, 5) : '18:00';

            // Trích xuất ca gốc ban đầu của peer
            let baseStart = curPeerStart;
            let baseEnd = curPeerEnd;
            if (peerShift.note) {
              const match = peerShift.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
              if (match) {
                baseStart = match[1];
                baseEnd = match[2];
              }
            }

            const currentEmp = employees.find((e) => e.id === data.employeeId);
            const currentEmpName = currentEmp?.name || 'Bạn';

            const [bsh, bsm] = baseStart.split(':').map(Number);
            const [beh, bem] = baseEnd.split(':').map(Number);
            let baseHours = (beh * 60 + bem - (bsh * 60 + bsm)) / 60;
            if (baseHours < 0) baseHours += 24;

            let newPeerEnd = baseEnd;
            let newPeerHours = baseHours;
            let peerNote = '';

            const { type, hoursDiff } = data.peerAdjustment;
            const diffH = Math.abs(hoursDiff || 0);

            if (type === 'reduce') {
              // Rút ngắn ca của peer (ví dụ Khoa 22:00 - 4h = 18:00)
              newPeerHours = Math.max(0, baseHours - diffH);
              const targetMinutes = (bsh * 60 + bsm + Math.round(newPeerHours * 60)) % (24 * 60);
              const ehStr = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
              const emStr = String(targetMinutes % 60).padStart(2, '0');
              newPeerEnd = `${ehStr}:${emStr}`;
              peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay từ ${newPeerEnd}]`;
            } else if (type === 'increase') {
              // Tăng ca cho peer (ví dụ Duy 17:00 + 4h = 21:00)
              newPeerHours = baseHours + diffH;
              const targetMinutes = (bsh * 60 + bsm + Math.round(newPeerHours * 60)) % (24 * 60);
              const ehStr = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
              const emStr = String(targetMinutes % 60).padStart(2, '0');
              newPeerEnd = `${ehStr}:${emStr}`;
              peerNote = `[Gốc: ${baseStart}-${baseEnd}] +${diffH}h làm thay ${currentEmpName} (từ ${data.endTime || '19:00'})`;
            }

            updated[peerIdx] = {
              ...peerShift,
              end_time: newPeerEnd,
              hours: Math.round(newPeerHours * 100) / 100,
              note: peerNote,
              isDirty: true,
            };
          }
        }
      });
      return updated;
    });

    setHasUnsavedChanges(true);
    if (data.peerAdjustment && toast) {
      toast.info('Đã đồng bộ ca 2 chiều', 'Đã cập nhật giờ ca làm cho cả 2 nhân viên!');
    }
  }

  // 2. Xóa ca làm (chỉ cập nhật State Local)
  function handleDeleteScheduleItem(itemId) {
    if (itemId && !String(itemId).startsWith('draft_')) {
      setDeletedShiftIds((prev) => [...prev, itemId]);
    }
    setLocalSchedule((prev) => prev.filter((s) => s.id !== itemId));
    setHasUnsavedChanges(true);
  }

  // 2.5. Gán ca OFF đè lên (CHỈ bật flag is_admin_assigned, GIỮ NGUYÊN ghi chú gốc của NV)
  function handleAssignOff(employeeId, targetDateStr) {
    if (!employeeId || !targetDateStr) return;

    // Xóa ca phân công cũ trong daySchedule nếu có
    const existingShifts = localSchedule.filter((s) => s.employee_id === employeeId && s.date === targetDateStr);
    existingShifts.forEach((s) => {
      if (s.id && !String(s.id).startsWith('draft_')) {
        setDeletedShiftIds((prev) => [...prev, s.id]);
      }
    });
    setLocalSchedule((prev) => prev.filter((s) => !(s.employee_id === employeeId && s.date === targetDateStr)));

    // Bật flag is_admin_assigned = true, giữ nguyên type/note gốc
    setLocalAvailability((prev) => {
      const idx = prev.findIndex((a) => a.employee_id === employeeId && a.date === targetDateStr);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], is_admin_assigned: true };
        return updated;
      }
      return [
        ...prev,
        {
          id: `draft_avail_${Date.now()}`,
          employee_id: employeeId,
          date: targetDateStr,
          type: 'off',
          note: '',
          is_admin_assigned: true,
        },
      ];
    });

    setHasUnsavedChanges(true);
  }

  // 2.6. Xóa ca OFF — quay về trạng thái ban đầu (thấy lại ghi chú đăng ký của NV)
  function handleRemoveOff(employeeId, targetDateStr) {
    if (!employeeId || !targetDateStr) return;

    setLocalAvailability((prev) => {
      const idx = prev.findIndex((a) => a.employee_id === employeeId && a.date === targetDateStr);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], is_admin_assigned: false };
        return updated;
      }
      return prev;
    });

    setHasUnsavedChanges(true);
  }

  // 3. Sao chép ca từ hôm trước (chỉ cập nhật State Local)
  function handleCopyShiftFromPrevDay(employeeId, sourceShift, targetDateStr) {
    const targetBranch = branches.find((b) => b.id === sourceShift.branch_id) || sourceShift.branches || branches[0];
    const newDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      employee_id: employeeId,
      branch_id: sourceShift.branch_id,
      branches: targetBranch,
      date: targetDateStr,
      start_time: sourceShift.start_time ? sourceShift.start_time.slice(0, 5) : '09:00',
      end_time: sourceShift.end_time ? sourceShift.end_time.slice(0, 5) : '14:00',
      hours: sourceShift.hours || 5,
      note: sourceShift.note || '',
      isDraft: true,
      isDirty: true,
    };

    setLocalSchedule((prev) => [...prev, newDraft]);
    setHasUnsavedChanges(true);
  }

  // 4. LƯU THÔNG MINH: CHỈ LƯU NHỮNG CA BỊ THAY ĐỔI/THÊM MỚI/XÓA (TỐC ĐỘ SIÊU TỐC THẦN TỐC ⚡)
  async function handleSaveAllBatch() {
    setIsBatchSaving(true);
    try {
      // 1. Xóa các ca đã bấm xóa
      if (deletedShiftIds.length > 0) {
        for (const delId of deletedShiftIds) {
          await deleteSchedule(delId);
        }
      }

      // 2. CHỈ LƯU / CẬP NHẬT CÁC CA BỊ THAY ĐỔI HOẶC THÊM MỚI (isDirty || isDraft)
      const dirtyShifts = localSchedule.filter((item) => item.isDirty || item.isDraft);

      if (dirtyShifts.length > 0) {
        for (const item of dirtyShifts) {
          await upsertSchedule({
            employeeId: item.employee_id,
            branchId: item.branch_id,
            date: item.date,
            startTime: item.start_time ? item.start_time.slice(0, 5) : '09:00',
            endTime: item.end_time ? item.end_time.slice(0, 5) : '14:00',
            hours: item.hours || 5,
            note: item.note || '',
          });
        }
      }

      // 3. CẬP NHẬT CÁC THAY ĐỔI TRẠNG THÁI OFF BỞI CHỦ (gán OFF hoặc xóa OFF)
      const origAvailMap = {};
      availability.forEach((a) => { origAvailMap[`${a.employee_id}_${a.date}`] = a; });
      const changedAvails = localAvailability.filter((a) => {
        const orig = origAvailMap[`${a.employee_id}_${a.date}`];
        // Bản ghi mới (draft) hoặc is_admin_assigned thay đổi so với DB gốc
        return String(a.id).startsWith('draft_avail_') || (orig && !!orig.is_admin_assigned !== !!a.is_admin_assigned);
      });
      if (changedAvails.length > 0) {
        for (const a of changedAvails) {
          await upsertAvailability(a.employee_id, a.date, a.type || 'off', a.note || '', !!a.is_admin_assigned);
        }
      }

      if (toast) toast.success('Đã lưu thành công', 'Đã cập nhật lịch phân công & Ca OFF');
      await loadWeekData(true);
    } catch (err) {
      console.error('Lỗi khi lưu batch lịch:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu bảng lịch phân công!');
    }
    setIsBatchSaving(false);
  }

  // Hủy thay đổi chưa lưu
  function handleCancelUnsavedChanges() {
    if (confirm('Bạn có chắc chắn muốn HỦY BỎ toàn bộ thay đổi chưa lưu trên bảng xếp lịch tuần này không?')) {
      setLocalSchedule(schedule);
      setLocalAvailability(availability);
      setDeletedShiftIds([]);
      setHasUnsavedChanges(false);
      if (toast) toast.info('Đã hủy', 'Đã khôi phục lại bảng xếp lịch ban đầu.');
    }
  }

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);

  // Tải trực tiếp FILE ẢNH PNG (Độ phân giải 2K sắc nét 100%, RẮC GỌN VỪA KHÍT TỈ LỆ, CHỮ RÕ NẾT ĐẸP MẮT)
  async function handleDownloadImage() {
    if (typeof window === 'undefined') return;
    setIsExportingPDF(true);
    if (toast) toast.info('⏳ Đang xuất bức ảnh PNG...', 'Vui lòng đợi vài giây để tải file ảnh bảng lịch!');

    try {
      const tableHeaderDays = weekDays.map((dStr, idx) => `
        <th style="padding: 7px 4px; border: 1.5px solid #a855f7; background-color: #581c87; color: #ffffff; text-align: center; font-size: 12.5px; font-weight: 900; width: 11.8%;">
          <div style="color: #ffffff; font-weight: 900; font-size: 13px; text-transform: uppercase;">${DAY_LABELS[idx]}</div>
          <div style="font-size: 10px; opacity: 0.95; color: #f3e8ff; font-weight: 700; margin-top: 1px;">${dStr.split('-').reverse().slice(0, 2).join('/')}</div>
        </th>
      `).join('');

      const tableRows = customMatrixOrder.map((emp, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#faf5ff';
        const cells = weekDays.map((dStr) => {
          const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
          const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

          let cellContent = '<span style="color: #cbd5e1; font-size: 13px; font-weight: bold; text-align: center;">—</span>';

          if (empShifts.length > 0) {
            cellContent = empShifts.map((shift) => {
              const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
              const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
              const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
              const branchDisplayName = formatBranchDisplayName(shift.branches?.name);
              
              const bgHex = style.badgeStyle?.backgroundColor || '#f3e8ff';
              const colorHex = style.badgeStyle?.color || '#581c87';

              return `
                <div style="background-color: ${bgHex}; color: ${colorHex}; border-radius: 7px; padding: 5px 2px; text-align: center; border: 1.5px solid rgba(0,0,0,0.12); box-shadow: 0 1px 2px rgba(0,0,0,0.04); font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; width: 100%; min-height: 48px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px;">
                  <span style="font-size: 14px; font-weight: 900; color: ${colorHex}; display: block; line-height: 1.1; letter-spacing: -0.3px;">${startTimeStr}-${endTimeStr}</span>
                  <span style="font-size: 12px; font-weight: 900; color: ${colorHex}; display: block; line-height: 1.1; text-transform: uppercase; opacity: 0.95;">${branchDisplayName}</span>
                </div>
              `;
            }).join('');
          } else if (empAvail?.is_admin_assigned) {
            cellContent = `
              <div style="background-color: #fff1f2; color: #e11d48; border-radius: 7px; padding: 5px 2px; font-size: 13.5px; font-weight: 900; text-align: center; border: 1.5px solid #fecdd3; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; width: 100%; min-height: 48px; display: flex; justify-content: center; align-items: center; line-height: 1;">
                🛑 OFF
              </div>
            `;
          }

          return `<td style="padding: 3px 3px; border: 1px solid #e9d5ff; text-align: center; vertical-align: middle; height: 52px;">${cellContent}</td>`;
        }).join('');

        return `
          <tr style="background-color: ${rowBg};">
            <td style="padding: 8px 12px; border: 1.5px solid #e9d5ff; font-size: 21px; font-weight: 900; color: #0f172a; text-align: left; white-space: nowrap; vertical-align: middle; font-family: system-ui, -apple-system, Arial, sans-serif;">
              <span style="color: #6b21a8; font-size: 17px; margin-right: 6px; font-weight: 900;">${idx + 1}.</span>
              <span style="font-weight: 900; color: #0f172a; font-size: 21px; letter-spacing: -0.3px;">${emp.name}</span>
            </td>
            ${cells}
          </tr>
        `;
      }).join('');

      const tempElement = document.createElement('div');
      tempElement.style.backgroundColor = '#ffffff';
      tempElement.style.padding = '20px 24px';
      tempElement.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      tempElement.style.color = '#1e1b4b';
      tempElement.style.width = '1420px';
      tempElement.style.margin = '0 auto';
      tempElement.style.boxSizing = 'border-box';

      tempElement.innerHTML = `
        <div style="text-align: center; margin-bottom: 14px; border-bottom: 3.5px solid #581c87; padding-bottom: 10px;">
          <h2 style="font-size: 24px; font-weight: 900; color: #1e1b4b; margin: 0; text-transform: uppercase; letter-spacing: 0.6px;">
            BẢNG PHÂN CÔNG LỊCH LÀM TUẦN
          </h2>
          <p style="font-size: 14px; font-weight: 900; color: #6b21a8; margin: 5px 0 0 0;">
            Thời gian: Từ ngày ${startDate.split('-').reverse().join('/')} đến ngày ${endDate.split('-').reverse().join('/')}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; table-layout: fixed;">
          <thead>
            <tr style="background-color: #581c87; color: #ffffff;">
              <th style="padding: 14px 12px; border: 1.5px solid #a855f7; text-align: left; font-size: 16px; font-weight: 900; width: 290px;">
                STT / NHÂN VIÊN
              </th>
              ${tableHeaderDays}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;

      document.body.appendChild(tempElement);

      let canvas;
      try {
        const html2canvas = (await import('html2canvas')).default;
        canvas = await html2canvas(tempElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
            styles.forEach((s) => s.remove());
          },
        });
      } finally {
        if (tempElement && tempElement.parentNode) {
          tempElement.parentNode.removeChild(tempElement);
        }
      }

      if (canvas) {
        const imageURI = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Bảng_Xếp_Lịch_Chè_Ms_Hoa_${startDate}_đến_${endDate}.png`;
        link.href = imageURI;
        document.body.appendChild(link);
        link.click();
        if (link.parentNode) link.parentNode.removeChild(link);
        if (toast) toast.success('Đã tải thành công', 'Đã tải file ảnh bảng lịch (PNG)');
      }
    } catch (err) {
      console.error('Lỗi tải ảnh:', err);
      if (toast) toast.error('Lỗi', 'Không thể xuất file ảnh PNG. Vui lòng thử lại!');
    } finally {
      setIsExportingPDF(false);
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

  const weekHolidays = useMemo(() => {
    const list = [];
    weekDays.forEach((dStr) => {
      const h = getHolidayForDate(dStr, holidays);
      if (h && !list.find((item) => item.name === h.name)) {
        list.push(h);
      }
    });
    return list;
  }, [weekDays, holidays]);

  return (
    <div className="space-y-2.5">
      {/* THANH CẢNH BÁO THAY ĐỔI CHƯA LƯU & NÚT LƯU BATCH 1 LẦN */}
      {!readOnly && hasUnsavedChanges && (
        <div className="sticky top-2 z-40 p-3 sm:p-4 rounded-2xl bg-amber-500 text-purple-950 shadow-xl border-2 border-amber-300 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-black text-sm sm:text-base text-purple-950">
                Có thay đổi chưa lưu trên Bảng Phân Công!
              </div>
              <p className="text-xs text-purple-900 font-extrabold">
                Bấm nút bên phải sau khi xếp ca xong để lưu chính thức 1 lần duy nhất.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancelUnsavedChanges}
              disabled={isBatchSaving}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-purple-950/20 hover:bg-purple-950/30 text-purple-950 text-xs font-black border border-purple-950/30 cursor-pointer"
            >
              ↺ Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={handleSaveAllBatch}
              disabled={isBatchSaving}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-black text-xs sm:text-sm border border-purple-800 cursor-pointer shadow-md active:scale-95 transition-all"
            >
              {isBatchSaving ? '⏳ Đang lưu toàn bộ...' : '💾 LƯU LỊCH PHÂN CÔNG (1 Bấm)'}
            </button>
          </div>
        </div>
      )}

      {/* Thanh điều hướng Tuần, Cụm Nút Thao Tác & Chú thích Chi Nhánh — Thiết Kế Cân Đối, Sang Trọng */}
      <div className="bg-white rounded-3xl p-3 sm:px-5 sm:py-3.5 border border-purple-200/90 shadow-2xs space-y-2.5">
        {/* HÀNG 1: ĐIỀU HƯỚNG TUẦN (TRÁI) & CÁC NÚT HÀNH ĐỘNG (PHẢI) */}
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          {/* Cụm chuyển tuần */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevWeek}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần trước"
            >
              ◀
            </button>

            <button
              type="button"
              onClick={() => setShowWeekPickerModal(true)}
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-purple-100/90 hover:bg-purple-200 text-purple-950 font-black border border-purple-300 flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 text-xs sm:text-sm min-w-[125px] sm:min-w-[145px] justify-center"
              title="Bấm để mở bảng chọn nhanh bất kỳ Tuần & Năm nào (Ví dụ: Tuần 2 năm 2025)"
            >
              <span>📅</span>
              <span className="text-purple-950 font-black">
                {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}
              </span>
              <span className="text-[10px] text-purple-700 font-bold">▾</span>
            </button>

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
              className="px-3 py-1.5 rounded-xl bg-purple-100 text-purple-950 hover:bg-purple-200 text-xs font-black border border-purple-300 cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              Tuần này
            </button>
          </div>

          {/* Nhóm Nút Thao Tác Bên Phải: Phân Nhóm Rõ Ràng & Bắt Mắt */}
          {!readOnly && (
            <div className="flex items-center gap-1.5 flex-wrap ml-auto">
              {/* Nút Chốt Lịch Tuần / Mở Khóa Lịch */}
              {!isWeekLocked ? (
                <button
                  type="button"
                  onClick={handleToggleWeekLock}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                  title="Bấm để Chốt Lịch Tuần Này (Toàn bộ ca hiện tại sẽ được lưu làm Mốc Ca Gốc chính thức)"
                >
                  <span>🔒</span>
                  <span>Chốt Lịch Tuần</span>
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black flex items-center gap-1 shadow-2xs">
                    <span>🔒</span> Đã chốt
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleWeekLock}
                    className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 text-xs font-black border border-purple-200 cursor-pointer transition-all active:scale-95"
                    title="Bấm để Mở Lại Chốt Lịch (quay về chế độ xếp lịch tự do không tính làm thay)"
                  >
                    🔓 Mở khóa
                  </button>
                </div>
              )}

              {/* Nút Xem Danh Sách Ca Đổi Trong Tuần */}
              {adjustedShiftsInWeek.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAdjustedShiftsModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-black border border-amber-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                  title="Xem danh sách các ca có làm thay, tăng ca, về sớm trong tuần"
                >
                  <span>📋</span>
                  <span>{adjustedShiftsInWeek.length} Ca Đổi</span>
                </button>
              )}

              {/* Nhóm 1: Xuất & Xem */}
              <button
                type="button"
                onClick={handleDownloadImage}
                disabled={isExportingPDF}
                className="px-3 py-1.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white text-xs font-black border border-purple-800 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                title="Tải File Bức Ảnh PNG Bảng Phân Công Lịch Tuần trọn gói về máy"
              >
                <span>🖼️</span>
                <span>{isExportingPDF ? '⏳ Đang Tải...' : 'Tải Ảnh (PNG)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPDFPreview(true)}
                className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 text-xs font-black border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                title="Xem Trước Bản Bảng Lịch Tuần"
              >
                <span>👁️</span>
                <span>Xem Trước</span>
              </button>

              {/* Nhóm 2: Cài Đặt Quản Trị */}
              <button
                type="button"
                onClick={() => setShowHolidayModal(true)}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-purple-950 text-xs font-black border border-amber-500 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                title="Cấu hình các ngày lễ tết và hệ số nhân lương (x2, x3...)"
              >
                <span>🎉</span>
                <span>Ngày Lễ (x2, x3)</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBlockOffModal(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-black border border-rose-200 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                title="Cấu hình các ngày cao điểm cấm nhân viên xin nghỉ trong tuần"
              >
                <span>🚫</span>
                <span>Cấm Off</span>
              </button>

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
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 border-0 ${isSortMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse shadow-md font-black'
                  : 'bg-purple-700 hover:bg-purple-800 text-white font-black'
                  }`}
                title={isSortMode ? 'Bấm để lưu thứ tự mới cho cả Admin & Nhân Viên' : 'Bấm để bật chế độ kéo thả sắp xếp nhân viên'}
              >
                {savingSort ? (
                  '⏳ Lưu...'
                ) : isSortMode ? (
                  <>
                    <span>✓</span> XONG
                  </>
                ) : (
                  <>
                    <span>↕️</span> Sắp Xếp
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* HÀNG 2: THÔNG BÁO NGÀY LỄ TRONG TUẦN (TRÁI) & CHÚ THÍCH CHI NHÁNH (PHẢI) */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-purple-100">
          {/* Thông báo ngày lễ nếu tuần này có ngày lễ */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {weekHolidays.length > 0 ? (
              weekHolidays.map((h, hIdx) => (
                <span
                  key={hIdx}
                  className="px-2.5 py-0.5 rounded-full bg-amber-100 text-purple-950 border border-amber-300 text-[11px] font-black flex items-center gap-1 shadow-2xs"
                >
                  <span>🎉</span>
                  <span>{h.name}:</span>
                  <strong className="text-amber-800">x{h.multiplier} Lương</strong>
                </span>
              ))
            ) : !readOnly ? (
              <span className="text-[11px] font-extrabold text-purple-600/80">
                ✨ Bấm vào ô của nhân viên để xếp ca nhanh
              </span>
            ) : null}
          </div>

          {/* Chú thích màu Chi Nhánh — Đặt gọn gàng bên phải */}
          <div className="flex items-center flex-wrap gap-1.5 text-xs font-black justify-end ml-auto">
            <span className="text-[11px] font-extrabold text-purple-800 mr-0.5">
              🏢 Chi nhánh:
            </span>
            {branches.map((b) => {
              const style = getBranchColorStyle(b.name, b.color);
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-black border shadow-2xs"
                  style={style.badgeStyle}
                >
                  <span>{formatBranchDisplayName(b.name)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
         BẢNG MA TRẬN PHÂN CÔNG CHÈ Ms HOA • HEADER 1 DÒNG TỐI ƯU • TỰ ĐỘNG CUỘN TỚI HÔM NAY
         ========================================================================= */}
      <div ref={tableContainerRef} className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="table-fixed w-full min-w-[1000px] border-collapse text-xs">
          <thead>
            {/* Hàng 1: Tên Thứ (T2 -> CN) */}
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-2 px-2 border-r-2 border-purple-300 w-[14%] min-w-[110px] max-w-[140px] text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-xs">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => {
                const isToday = dStr === getToday();
                const holiday = !readOnly ? getHolidayForDate(dStr, holidays) : null;

                return (
                  <th
                    key={dStr}
                    data-date={dStr}
                    className={`py-2.5 px-1 border-r border-purple-800 text-center font-black uppercase text-xs w-[12.28%] min-w-[115px] max-w-[135px] transition-all ${
                      isToday
                        ? 'bg-amber-400 text-purple-950 font-black border-x-2 border-amber-500 shadow-inner'
                        : 'text-amber-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{DAY_LABELS[idx]}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black animate-pulse">
                          HÔM NAY
                        </span>
                      )}
                      {!readOnly && holiday && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-black shadow-xs tracking-tight transition-all ${
                            isToday
                              ? 'bg-purple-950 text-amber-300 border border-purple-900'
                              : 'bg-amber-400 text-purple-950 border border-amber-300 shadow-sm font-black ring-1 ring-amber-300/80'
                          }`}
                          title={`${holiday.name} (x${holiday.multiplier} Lương)`}
                        >
                          x{holiday.multiplier}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] font-extrabold mt-0.5 ${isToday ? 'text-purple-950' : 'text-purple-200'}`}>
                      {dStr.split('-').reverse().slice(0, 2).join('/')}
                    </div>
                  </th>
                );
              })}
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
                      className={`py-2 px-2 border-r-2 border-purple-300 font-black text-purple-950 text-xs sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-[14%] min-w-[110px] max-w-[140px] truncate ${isSortMode
                        ? 'cursor-grab active:cursor-grabbing bg-amber-50/80 border-amber-300 hover:bg-amber-100/90'
                        : ''
                        } ${draggedIdx === idx ? 'bg-purple-200/90 opacity-75 border-purple-500 shadow-xl scale-98' : ''}`}
                      title={isSortMode ? 'Đang bật Sắp Xếp: Chạm/Giữ kéo thả hàng này' : ''}
                    >
                      <div className="flex items-center gap-1.5 truncate min-w-0">
                        {isSortMode && (
                          <span className="text-amber-600 font-black text-sm select-none touch-none animate-pulse" title="Chạm giữ để kéo hàng">
                            ≡
                          </span>
                        )}
                        {isMe && <span className="text-purple-700 text-xs shrink-0" title="Tài khoản của tôi">⭐</span>}
                        <div className="truncate min-w-0 flex flex-col justify-center">
                          {emp.nickname ? (
                            <>
                              <span
                                className="text-purple-950 font-black text-xs sm:text-sm truncate leading-tight"
                                title={!readOnly ? `Biệt danh: ${emp.nickname} - Tên thật: ${emp.name}` : `Biệt danh: ${emp.nickname}`}
                              >
                                {emp.nickname}
                              </span>
                              {/* Phía Admin: Hiện tên thật bên dưới trong ngoặc. Phía Nhân Viên: Chỉ hiện Biệt Danh! */}
                              {!readOnly && (
                                <span className="text-[9.5px] font-bold text-purple-700/80 truncate leading-none mt-0.5">
                                  ({emp.name})
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              className={isMe ? 'text-purple-950 font-black text-xs sm:text-sm truncate' : 'text-purple-950 font-extrabold text-xs sm:text-sm truncate'}
                              title={`Tên nhân viên: ${emp.name}`}
                            >
                              {emp.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 7 Ô Ngày (T2 -> CN) */}
                    {weekDays.map((dStr, dayIdx) => {
                      const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
                      const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

                      // Tìm ca của ngày hôm trước (nếu dayIdx > 0)
                      const prevDateStr = dayIdx > 0 ? weekDays[dayIdx - 1] : null;
                      const prevDayShifts = prevDateStr ? scheduleByEmpAndDate[`${emp.id}_${prevDateStr}`] || [] : [];
                      const canCopyFromPrevDay = !readOnly && !isSortMode && empShifts.length === 0 && prevDayShifts.length > 0;

                      return (
                        <td
                          key={dStr}
                          onClick={() => openCellModal(emp, dStr, empShifts[0] || null)}
                          className={`p-1.5 border-r border-purple-100 text-center align-middle transition-all w-[12.28%] min-w-[115px] max-w-[135px] overflow-hidden group ${readOnly ? 'cursor-default select-none' : 'cursor-pointer hover:bg-purple-100/60'
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
                                    {!readOnly && shift.note && (
                                      <div
                                        className="text-[10px] font-extrabold opacity-95 truncate max-w-[110px] mx-auto mt-0.5"
                                        title={shift.note}
                                      >
                                        <span className="inline-block px-1.5 py-0.2 rounded bg-black/15 text-[9px] font-black tracking-tight">
                                          {getShiftAdjustmentDisplay(shift)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Ô Ngày Trống / Không có ca:
                               - Phía Nhân Viên (readOnly): CHỈ hiện OFF khi Chủ bấm gán OFF (ADMIN_OFF). Còn lại luôn hiện "Đang xếp lịch".
                               - Phía Chủ/Admin: Hiện thông tin đăng ký rảnh. Khi Chủ bấm OFF -> đè chữ OFF thay thế. */
                            <div className="py-1 text-center space-y-1 overflow-hidden">
                              {readOnly ? (
                                /* === PHÍA NHÂN VIÊN === */
                                empAvail?.is_admin_assigned ? (
                                  /* Chủ đã bấm gán OFF -> Hiện badge OFF nổi bật */
                                  <span className="text-rose-600 font-black text-[11px] uppercase px-2.5 py-1 rounded-xl bg-rose-50 border-2 border-rose-300 inline-block shadow-sm">
                                    🛑 OFF
                                  </span>
                                ) : (
                                  /* Chưa có lịch, chưa gán OFF -> Đang xếp lịch */
                                  <span className="text-purple-700 font-extrabold text-[10.5px] px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 inline-block shadow-2xs">
                                    ⏳ Đang xếp lịch
                                  </span>
                                )
                              ) : (
                                /* === PHÍA CHỦ / ADMIN === */
                                empAvail?.is_admin_assigned ? (
                                  /* Chủ đã bấm OFF -> Hiện badge OFF lớn nổi bật (tương tự badge ca làm) */
                                  <div className="p-1.5 rounded-xl font-black text-xs sm:text-sm leading-tight border-2 border-rose-400 shadow-sm bg-rose-100 text-rose-700 transition-all hover:scale-[1.02]">
                                    <div className="text-xs font-black">🛑 OFF</div>
                                    <div className="text-[10px] font-extrabold opacity-80 mt-0.5">Nghỉ</div>
                                  </div>
                                ) : empAvail ? (
                                  /* Nhân viên đã đăng ký rảnh -> Hiện thông tin đăng ký */
                                  <div
                                    className="text-[11px] font-black text-purple-700 truncate max-w-[115px] mx-auto px-1"
                                    title={empAvail.type === 'off' && empAvail.note ? `Xin nghỉ: ${empAvail.note}` : empAvail.note || ''}
                                  >
                                    {empAvail.type === 'full'
                                      ? '💪 Cả ngày'
                                      : empAvail.type === 'off'
                                        ? (empAvail.note ? `🛑 ${empAvail.note}` : '🛑 Xin nghỉ')
                                        : `📝 ${empAvail.note || 'Tùy ca'}`}
                                  </div>
                                ) : (
                                  /* Nhân viên chưa đăng ký gì */
                                  <span className="text-gray-400 font-bold text-[10px] italic">—</span>
                                )
                              )}

                              {/* NÚT SAO CHÉP NHANH TINH TẾ TỪ NGÀY HÔM TRƯỚC */}
                              {canCopyFromPrevDay && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyShiftFromPrevDay(emp.id, prevDayShifts[0], dStr);
                                  }}
                                  className="py-0.5 px-2 rounded-lg bg-purple-100 hover:bg-purple-700 text-purple-900 hover:text-white font-black text-[10px] border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1 mx-auto opacity-80 group-hover:opacity-100 group-hover:scale-105"
                                  title={`Bấm 1-chạm để sao chép ca làm của ${DAY_LABELS[dayIdx - 1]} sang ${DAY_LABELS[dayIdx]}`}
                                >
                                  <span>⚡</span>
                                  <span>Copy {DAY_LABELS[dayIdx - 1]}</span>
                                </button>
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

            {/* =========================================================================
               HÀNG TỔNG LƯƠNG & TỔNG GIỜ LÀM THEO TỪNG NGÀY TRONG TUẦN (CHỈ HIỂN THỊ PHÍA ADMIN)
               ========================================================================= */}
            {!readOnly && (
              <tr className="border-t-2 border-purple-900 font-black">
                {/* Cột Đầu Tiên: TỔNG CẢ TUẦN (Cộng dồn tất cả 7 ngày trong tuần) */}
                <td className="p-2 sm:p-2.5 bg-purple-200 text-purple-950 text-center font-black border-r-2 border-purple-300 space-y-0.5 min-w-[110px] sticky left-0 z-20 shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-purple-800">
                    TỔNG CẢ TUẦN
                  </div>
                  <div className="text-xs sm:text-sm font-black text-purple-950 tracking-tight">
                    {formatCurrency(weekTotalSalary)}
                  </div>
                  <div className="text-[11px] font-extrabold text-purple-800/90">
                    {weekTotalHours > 0 ? `${weekTotalHours}h` : '0h'}
                  </div>
                </td>

                {/* 7 Cột Tương Ứng T2 -> CN */}
                {weekDays.map((dStr) => {
                  // 1. Lọc tất cả ca phân công trong ngày dStr từ localSchedule
                  const dayShifts = (localSchedule || []).filter((s) => s.date === dStr);

                  // 2. Tính tổng giờ và tổng lương ngày đó chuẩn xác theo mốc lương & ngày lễ
                  const { totalHours: dayTotalHours, totalSalary: dayTotalSalary } = calcTotalSalaryForShifts(dayShifts);

                  return (
                    <td
                      key={dStr}
                      className="p-2 sm:p-2.5 bg-purple-950 text-center text-white border-r border-purple-900 shadow-inner space-y-0.5"
                    >
                      {/* Tổng Số Tiền Lương Ngày Hôm Đó (Chữ Xanh Lá Cây Sáng Nổi Bật) */}
                      <div className="text-xs sm:text-sm font-black text-emerald-400 tracking-tight">
                        {formatCurrency(dayTotalSalary)}
                      </div>

                      {/* Tổng Số Giờ Làm Trong Ngày Đó */}
                      <div className="text-[11px] font-extrabold text-purple-200/90">
                        {dayTotalHours > 0 ? `${dayTotalHours}h` : '0h'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
         BẢNG RIÊNG 1: DANH SÁCH NHÂN VIÊN XIN OFF (TẠM NGHỈ VÀI NGÀY) - CHỈ ADMIN HIỂN THỊ
         ========================================================================= */}
      {!readOnly && shortLeaveEmployees.length > 0 && (
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

                <button
                  type="button"
                  onClick={() => openCellModal(emp, startDate)}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95 flex-shrink-0"
                  title="Xếp lịch làm cho nhân viên này"
                >
                  + Xếp lịch
                </button>
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
          availabilities={(localAvailability.length > 0 ? localAvailability : availability).filter((a) => a.date === modalState.date)}
          daySchedule={localSchedule.filter((s) => s.date === modalState.date)}
          onSave={handleSaveModal}
          onDelete={handleDeleteScheduleItem}
          onAssignOff={handleAssignOff}
          onRemoveOff={handleRemoveOff}
          editItem={modalState.editItem}
          initialEmployee={modalState.employee}
          isWeekLocked={isWeekLocked}
        />
      )}

      {/* MODAL XEM TRƯỚC BẢNG NGUYÊN BẢN TRƯỚC KHI TẢI FILE PDF / IN */}
      {showPDFPreview && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-purple-300 overflow-hidden">
            {/* Header Modal */}
            <div className="p-3.5 sm:p-5 bg-purple-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">👁️</span>
                <div>
                  <h3 className="font-black text-sm sm:text-base tracking-tight text-white uppercase">
                    XEM TRƯỚC BẢNG LỊCH PHÂN CÔNG
                  </h3>
                  <p className="text-xs text-purple-200 font-extrabold">
                    Xem trước hình ảnh bảng phân công trước khi tải về
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={isExportingPDF}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs sm:text-sm border border-emerald-400 cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Tải file ảnh PNG"
                >
                  <span>🖼️</span>
                  <span>{isExportingPDF ? '⏳ Đang Tải...' : 'TẢI FILE ẢNH (PNG)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPDFPreview(false)}
                  className="w-8 h-8 rounded-full bg-purple-950/50 hover:bg-purple-950 text-white font-black text-sm flex items-center justify-center cursor-pointer border border-purple-700"
                  title="Đóng xem trước"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Nội dung bản xem trước — Định dạng trọn bộ 1 hình ma trận sạch đét y hệt Hình 4 */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-purple-50/50 space-y-4">
              <div
                id="pdf-preview-content"
                className="bg-white p-4 sm:p-6 rounded-2xl border border-purple-200 shadow-md space-y-4 max-w-full overflow-x-auto"
              >
                {/* Tiêu đề bảng ngắn gọn sạch đét */}
                <div className="text-center pb-2 border-b-2 border-purple-900">
                  <h2 className="text-base sm:text-xl font-black text-purple-950 uppercase tracking-tight">
                    BẢNG PHÂN CÔNG LỊCH LÀM TUẦN
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-purple-800 mt-1">
                    Thời gian: Từ ngày {startDate.split('-').reverse().join('/')} đến ngày {endDate.split('-').reverse().join('/')}
                  </p>
                </div>

                {/* Bản sao chép Ma Trận Bảng Lịch Tuần */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-purple-900 text-white border-b border-purple-800">
                        <th className="py-2 px-2 border-r border-purple-800 text-left font-black text-xs">
                          STT / NHÂN VIÊN
                        </th>
                        {weekDays.map((dStr, idx) => (
                          <th key={dStr} className="py-2 px-1 text-center font-black text-xs border-r border-purple-800 min-w-[95px]">
                            <div>{DAY_LABELS[idx]}</div>
                            <div className="text-[10px] font-extrabold text-purple-200">
                              {dStr.split('-').reverse().slice(0, 2).join('/')}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customMatrixOrder.map((emp, idx) => (
                        <tr key={emp.id} className={`border-b border-purple-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/60'}`}>
                          <td className="py-1.5 px-3 border-r border-purple-200 font-black text-purple-950 text-sm whitespace-nowrap">
                            <span className="text-purple-700 font-black text-xs mr-1.5">{idx + 1}.</span>
                            <span className="font-black text-purple-950 text-sm">{emp.name}</span>
                          </td>
                          {weekDays.map((dStr) => {
                            const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
                            const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

                            return (
                              <td key={dStr} className="py-1 px-1 border-r border-purple-100 text-center align-middle h-[34px]">
                                {empShifts.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {empShifts.map((shift) => {
                                      const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
                                      const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                      const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                      const branchDisplayName = formatBranchDisplayName(shift.branches?.name);

                                      return (
                                        <div
                                          key={shift.id}
                                          className="p-1 rounded-md font-black text-[11px] leading-tight border shadow-2xs flex flex-col justify-center items-center min-h-[26px]"
                                          style={style.badgeStyle}
                                        >
                                          <div className="text-[11px] font-black">{startTimeStr}-{endTimeStr}</div>
                                          <div className="text-[9.5px] font-black uppercase opacity-95 mt-0.5">{branchDisplayName}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : empAvail?.is_admin_assigned ? (
                                  <div className="text-rose-600 font-black text-[11px] uppercase p-1 rounded-md bg-rose-50 border border-rose-200 flex justify-center items-center min-h-[26px]">
                                    🛑 OFF
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-bold text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL CẤU HÌNH CẤM XIN NGHỈ CHO ADMIN */}
      {showBlockOffModal && (
        <ModalBlockOffDays
          isOpen={showBlockOffModal}
          onClose={() => setShowBlockOffModal(false)}
          toast={toast}
          onSaved={(newBlockedMap) => {
            setBlockedMap(newBlockedMap || {});
            loadWeekData(true);
          }}
        />
      )}

      {/* MODAL CẤU HÌNH NGÀY LỄ (x2, x3 LƯƠNG) CHO ADMIN */}
      {showHolidayModal && (
        <ModalHolidaySettings
          isOpen={showHolidayModal}
          onClose={() => setShowHolidayModal(false)}
          toast={toast}
          onHolidaysUpdated={(newHolidays) => {
            setHolidays(newHolidays);
          }}
        />
      )}

      {/* MODAL CHỌN NHANH TUẦN & NĂM */}
      {showWeekPickerModal && (
        <ModalWeekPicker
          isOpen={showWeekPickerModal}
          onClose={() => setShowWeekPickerModal(false)}
          currentMonday={currentMonday}
          onSelectMonday={(mStr) => {
            setCurrentMonday(mStr);
          }}
        />
      )}

      {/* MODAL XEM NHẬT KÝ CÁC CA ĐỔI / LÀM THAY / TĂNG CA / VỀ SỚM TRONG TUẦN */}
      {showAdjustedShiftsModal && (
        <ModalAdjustedShiftsList
          isOpen={showAdjustedShiftsModal}
          onClose={() => setShowAdjustedShiftsModal(false)}
          shifts={localSchedule.length > 0 ? localSchedule : schedule}
          employees={employees}
          branches={branches}
          startDate={startDate}
          endDate={endDate}
          isWeekLocked={isWeekLocked}
        />
      )}
    </div>
  );
}

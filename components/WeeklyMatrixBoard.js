'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
  upsertAvailability,
  updateEmployeesSortOrders,
} from '@/lib/supabase';
import { getBranchColorStyle, getToday } from '@/lib/utils';
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

import ModalSortEmployees from './ModalSortEmployees';
import ModalBlockOffDays from './ModalBlockOffDays';

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
      const [branchData, schedData, availData] = await Promise.all([
        getBranches(),
        getScheduleByDateRange(startDate, endDate),
        getAvailabilityByDateRange(startDate, endDate),
      ]);
      setBranches(branchData);
      setSchedule(schedData);
      setLocalSchedule(schedData);
      setDeletedShiftIds([]);
      setHasUnsavedChanges(false);
      setAvailability(availData);
      setLocalAvailability(availData);
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

  // Lọc bỏ tài khoản Chủ Quán & Quản Lý ra khỏi Bảng Xếp Lịch Nhân Viên
  const staffEmployees = useMemo(() => {
    if (!employees || employees.length === 0) return [];
    return employees.filter(
      (e) => e.role !== 'owner' && e.role !== 'manager' && !e.name.includes('Chủ Quán') && !e.name.includes('Quản Lý')
    );
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
      if (emp.status === 'off' || emp.is_active === false) {
        const resignedDate = emp.resigned_at || emp.off_date || (emp.updated_at ? emp.updated_at.slice(0, 10) : '2099-12-31');
        if (resignedDate >= startDate) {
          matrix.push(emp);
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
      });
      return updated;
    });

    setHasUnsavedChanges(true);
    if (toast) toast.info('Đã gán ca (Bản thảo)', 'Thay đổi đã được cập nhật! Bấm "LƯU LỊCH PHÂN CÔNG" ở trên khi xếp xong.');
  }

  // 2. Xóa ca làm (chỉ cập nhật State Local)
  function handleDeleteScheduleItem(itemId) {
    if (itemId && !String(itemId).startsWith('draft_')) {
      setDeletedShiftIds((prev) => [...prev, itemId]);
    }
    setLocalSchedule((prev) => prev.filter((s) => s.id !== itemId));
    setHasUnsavedChanges(true);
    if (toast) toast.info('Đã bỏ ca (Bản thảo)', 'Đã xóa ca trên bản thảo. Bấm "LƯU LỊCH PHÂN CÔNG" để lưu chính thức!');
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
    if (toast) toast.warning('Đã gán Ca OFF', 'Đã đè trạng thái OFF cho nhân viên. Bấm "LƯU LỊCH PHÂN CÔNG" để lưu chính thức!');
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
    if (toast) toast.info('Đã xóa Ca OFF', 'Đã khôi phục trạng thái ban đầu. Bấm "LƯU LỊCH PHÂN CÔNG" để lưu chính thức!');
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
    if (toast) toast.info('Đã copy ca (Bản thảo)', 'Bấm "LƯU LỊCH PHÂN CÔNG" ở trên khi xếp xong.');
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

      if (toast) toast.success('🚀 THÀNH CÔNG RỰC RỠ!', `Đã lưu siêu tốc các thay đổi lịch phân công & Ca OFF!`);
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

      {/* Thanh điều hướng Tuần & Chú thích Chi Nhánh - Compact 1-Line Row */}
      {/* Thanh điều hướng Tuần & Chú thích Chi Nhánh - Mobile Friendly Compact Row */}
      <div className="bg-white rounded-2xl p-2 sm:px-4 sm:py-3 border border-purple-200/90 shadow-2xs space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Bộ chuyển tuần 1 dòng */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={prevWeek}
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần trước"
            >
              ◀
            </button>

            <div className="text-xs sm:text-base font-black text-purple-950 px-1 text-center">
              <span className="text-purple-800 font-black">
                {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}
              </span>
            </div>

            <button
              type="button"
              onClick={nextWeek}
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần sau"
            >
              ▶
            </button>

            <button
              type="button"
              onClick={goTodayWeek}
              className="px-2.5 py-1 rounded-xl bg-purple-100 text-purple-950 hover:bg-purple-200 text-[11px] sm:text-xs font-black border border-purple-300 cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              Tuần này
            </button>
          </div>

          {/* Nhóm Nút Thao Tác (Cấm Off, Sắp Xếp) */}
          {!readOnly && (
            <div className="flex items-center gap-1.5 flex-wrap ml-auto">

              <button
                type="button"
                onClick={() => setShowBlockOffModal(true)}
                className="px-2.5 py-1 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-950 text-[11px] sm:text-xs font-black border border-rose-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                title="Cấu hình các ngày cao điểm cấm nhân viên xin nghỉ trong tuần"
              >
                <span>🚫</span>
                <span className="hidden sm:inline">Cấm Off</span>
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
                className={`px-3 py-1 rounded-xl text-[11px] sm:text-xs font-black cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1 border-0 ${
                  isSortMode
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
         BẢNG MA TRẬN PHÂN CÔNG CHÈ Ms HOA • HEADER 1 DÒNG TỐI ƯU • TỰ ĐỘNG CUỘN TỚI HÔM NAY
         ========================================================================= */}
      <div ref={tableContainerRef} className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            {/* Hàng 1: Tên Thứ (T2 -> CN) */}
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-2 px-1 border-r-2 border-purple-300 w-20 sm:w-32 text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-[11px] sm:text-xs">
                NHÂN VIÊN
              </th>
              {weekDays.map((dStr, idx) => {
                const isToday = dStr === getToday();
                return (
                  <th
                    key={dStr}
                    data-date={dStr}
                    className={`py-2.5 px-2 border-r border-purple-800 text-center font-black uppercase text-xs sm:text-sm transition-all ${
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
                      className={`py-2 px-1 border-r-2 border-purple-300 font-black text-purple-950 text-[11px] sm:text-xs sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-20 sm:w-32 ${
                        isSortMode
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
                        {isMe && <span className="text-purple-700 text-xs" title="Tài khoản của tôi">⭐</span>}
                        <span className={isMe ? 'text-purple-950 font-black text-xs sm:text-sm truncate' : 'text-purple-950 font-extrabold text-xs sm:text-sm truncate'}>
                          {emp.name}
                        </span>
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
                          className={`py-2 px-1 border-r border-purple-100 text-center align-middle transition-all min-w-[105px] max-w-[125px] overflow-hidden group ${
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
                                    {!readOnly && shift.note && (
                                      <div className="text-[10px] font-extrabold italic opacity-90 truncate max-w-[110px] mx-auto mt-0.5" title={shift.note}>
                                        📝 {shift.note}
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
          </tbody>
        </table>
      </div>

      {/* =========================================================================
         BẢNG RIÊNG 1: DANH SÁCH NHÂN VIÊN XIN OFF (TẠM NGHỈ VÀI NGÀY)
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
      {!readOnly && permanentOffEmployees.length > 0 && (
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
          availabilities={(localAvailability.length > 0 ? localAvailability : availability).filter((a) => a.date === modalState.date)}
          daySchedule={localSchedule.filter((s) => s.date === modalState.date)}
          onSave={handleSaveModal}
          onDelete={handleDeleteScheduleItem}
          onAssignOff={handleAssignOff}
          onRemoveOff={handleRemoveOff}
          editItem={modalState.editItem}
          initialEmployee={modalState.employee}
        />
      )}

      {/* MODAL CẤU HÌNH CẤM XIN NGHỈ CHO ADMIN */}
      {showBlockOffModal && (
        <ModalBlockOffDays
          isOpen={showBlockOffModal}
          onClose={() => setShowBlockOffModal(false)}
          toast={toast}
        />
      )}
    </div>
  );
}

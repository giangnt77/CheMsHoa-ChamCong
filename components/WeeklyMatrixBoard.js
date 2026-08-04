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
 * WeeklyMatrixBoard — Giao diện Xếp Lịch Mobile-First Đỉnh Cao.
 * Hỗ trợ 2 chế độ View:
 * 1. 📱 View Theo Ngày (Mobile-First): Chọn 1 ngày trong tuần -> Hiện 5 Chi nhánh dạng Card to rộng, dễ bấm 1 tay.
 * 2. 🖥️ View Ma Trận Tuần (Desktop): Nhìn toàn bộ 7 ngày x 5 chi nhánh.
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
  const day = today.getDay(); // 0=CN, 1=T2, 2=T3...
  const daysToSub = day === 0 ? 6 : day - 1;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToSub);
  return formatDateISO(monday);
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [branches, setBranches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);

  // Today
  const todayStr = formatDateISO(new Date());

  // Mobile selected day
  const [activeDate, setActiveDate] = useState(todayStr);

  // View mode: 'day' (Mobile optimized) | 'matrix' (Full table)
  const [viewMode, setViewMode] = useState('day');

  // Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    date: null,
    branch: null,
    editItem: null,
  });

  const weekDays = useMemo(
    () => getWeekDaysFromMonday(currentMonday),
    [currentMonday]
  );

  const startDate = weekDays[0];
  const endDate = weekDays[6];

  // If activeDate not in current week, default to Monday or Today
  useEffect(() => {
    if (!weekDays.includes(activeDate)) {
      setActiveDate(weekDays.includes(todayStr) ? todayStr : weekDays[0]);
    }
  }, [currentMonday]);

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
    setActiveDate(todayStr);
  }

  const scheduleMap = useMemo(() => {
    const map = {};
    schedule.forEach((item) => {
      const key = `${item.branch_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [schedule]);

  const availMap = useMemo(() => {
    const map = {};
    availability.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, [availability]);

  async function handleSaveModal(data) {
    try {
      await upsertSchedule(data);
      if (toast) toast.success('Thành công', 'Đã lưu lịch phân công');
      loadWeekData();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể lưu phân công');
    }
  }

  async function handleRemoveShift(shiftId) {
    try {
      await deleteSchedule(shiftId);
      if (toast) toast.info('Đã xóa', 'Đã gỡ nhân viên khỏi ca');
      loadWeekData();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể xóa');
    }
  }

  function formatDateShort(dStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    return `${d}/${m}`;
  }

  const startWeekLabel = formatDateShort(startDate);
  const endWeekLabel = formatDateShort(endDate);

  // Get availabilities for active date
  const activeDayAvails = availMap[activeDate] || [];

  return (
    <div className="space-y-5">
      {/* Header Điều Khiển Tuần */}
      <div className="glass rounded-3xl p-4 md:p-5 flex items-center justify-between flex-wrap gap-3 shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={prevWeek}
            className="px-3 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-white text-xs md:text-sm font-extrabold rounded-2xl border-0 cursor-pointer active:scale-95 transition-all"
          >
            ◀ Tuần trước
          </button>
          <button
            onClick={goTodayWeek}
            className="px-3 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 text-xs md:text-sm font-extrabold rounded-2xl cursor-pointer active:scale-95 transition-all"
          >
            Hôm nay
          </button>
          <button
            onClick={nextWeek}
            className="px-3 py-2 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-white text-xs md:text-sm font-extrabold rounded-2xl border-0 cursor-pointer active:scale-95 transition-all"
          >
            Tuần sau ▶
          </button>
        </div>

        {/* View Mode Toggle: Day vs Matrix */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[var(--color-surface-1)] rounded-xl p-1 border border-[var(--color-glass-border)]">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all ${
                viewMode === 'day'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              📱 Theo Ngày
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-all ${
                viewMode === 'matrix'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              🗓️ Tổng Quan Lịch Làm
            </button>
          </div>

          <div className="text-xs md:text-sm font-black text-white hidden sm:block">
            📅 Tuần: <span className="text-amber-400">{startWeekLabel} — {endWeekLabel}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-10 h-10 border-3 border-[var(--color-surface-3)] border-t-amber-400 rounded-full animate-spin" />
          <p className="mt-3 text-xs font-bold text-amber-400 uppercase tracking-widest">Đang tải lịch phân công...</p>
        </div>
      ) : (
        <>
          {/* =========================================================================
             MODE 1: VIEW THEO NGÀY (MOBILE OPTIMIZED - SIÊU RÕ RÀNG & DỄ BẤM 1 TAY)
             ========================================================================= */}
          {viewMode === 'day' && (
            <div className="space-y-5 animate-fade-in">
              {/* Thanh Tab 7 Ngày Ngang Siêu Nét */}
              <div className="glass rounded-2xl p-2 overflow-x-auto scrollbar-thin shadow-lg">
                <div className="flex gap-2 min-w-max">
                  {weekDays.map((dStr, idx) => {
                    const isSelected = dStr === activeDate;
                    const isToday = dStr === todayStr;
                    const dayAvails = availMap[dStr] || [];
                    const availCount = dayAvails.filter(a => a.type !== 'off').length;

                    return (
                      <button
                        key={dStr}
                        onClick={() => setActiveDate(dStr)}
                        className={`flex-1 min-w-[70px] md:min-w-[90px] py-2.5 px-3 rounded-2xl border text-center cursor-pointer transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-gradient-to-tr from-amber-400 to-orange-500 text-black border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)] font-black'
                            : isToday
                            ? 'bg-[var(--color-surface-2)] text-amber-400 border-amber-500/50 font-bold'
                            : 'bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] border-[var(--color-glass-border)] hover:border-white/20'
                        }`}
                      >
                        <div className="text-xs font-black">
                          {DAY_LABELS[idx]} {isToday && '⭐'}
                        </div>
                        <div className="text-sm font-extrabold mt-0.5">
                          {formatDateShort(dStr)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Danh sách 5 Chi Nhánh của Ngày Đang Chọn */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="font-black text-base text-white flex items-center gap-2">
                    <span>📅</span> Lịch phân công ngày <span className="text-amber-400">{activeDate.split('-').reverse().join('/')}</span>
                  </h3>
                  {activeDayAvails.length > 0 && (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                      ✋ {activeDayAvails.length} nhân viên báo rảnh
                    </span>
                  )}
                </div>

                {/* 5 Card Chi Nhánh */}
                {branches.map((branch) => {
                  const key = `${branch.id}_${activeDate}`;
                  const assignedShifts = scheduleMap[key] || [];

                  return (
                    <div
                      key={branch.id}
                      className="glass rounded-3xl overflow-hidden border shadow-xl transition-all"
                      style={{ borderColor: `${branch.color}50` }}
                    >
                      {/* Header Chi Nhánh */}
                      <div
                        className="px-5 py-3.5 flex items-center justify-between"
                        style={{
                          backgroundColor: `${branch.color}25`,
                          borderBottom: `1px solid ${branch.color}35`,
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full inline-block shadow-[0_0_10px_currentColor]"
                            style={{ backgroundColor: branch.color }}
                          />
                          <span className="font-black text-base text-white tracking-wide">
                            CHI NHÁNH {branch.name}
                          </span>
                        </div>
                        <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-black/30 text-white border border-white/10">
                          {assignedShifts.length} nhân viên
                        </span>
                      </div>

                      {/* Content: Danh sách Nhân viên đã xếp ca */}
                      <div className="p-4 space-y-3">
                        {assignedShifts.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)] italic text-center py-2">
                            Chưa có nhân viên nào được phân công vào chi nhánh này
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {assignedShifts.map((shift) => (
                              <div
                                key={shift.id}
                                className="p-3.5 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-glass-border)] flex items-center justify-between gap-3 shadow-md"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-black text-sm text-white flex items-center gap-1.5">
                                    <span>👤 {shift.employees?.name}</span>
                                  </div>
                                  <div className="text-xs font-black text-amber-300 mt-1 flex items-center gap-1">
                                    <span>⏱️ {shift.start_time ? `${shift.start_time.slice(0, 5)} - ${shift.end_time?.slice(0, 5)}` : `${shift.hours || 5}h`}</span>
                                    <span className="text-[10px] text-[var(--color-text-muted)] font-bold">({shift.hours || 5} tiếng)</span>
                                  </div>
                                  {shift.note && (
                                    <div className="text-xs text-[var(--color-text-muted)] italic truncate mt-0.5">
                                      💬 {shift.note}
                                    </div>
                                  )}
                                </div>

                                {/* Nút Sửa & Xóa Lớn Dễ BấmNgón Tay */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() =>
                                      setModalState({
                                        isOpen: true,
                                        date: activeDate,
                                        branch,
                                        editItem: shift,
                                      })
                                    }
                                    className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-bold border border-amber-500/30 cursor-pointer transition-all active:scale-95"
                                  >
                                    ✏️ Sửa
                                  </button>
                                  <button
                                    onClick={() => handleRemoveShift(shift.id)}
                                    className="px-3 py-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-bold border border-rose-500/30 cursor-pointer transition-all active:scale-95"
                                  >
                                    🗑️ Xóa
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Nút "+ Thêm Nhân Viên Vào Chi Nhánh" Lớn Dễ Bấm */}
                        <button
                          onClick={() =>
                            setModalState({
                              isOpen: true,
                              date: activeDate,
                              branch,
                              editItem: null,
                            })
                          }
                          className="w-full py-3 px-4 rounded-2xl bg-[var(--color-surface-2)] hover:bg-amber-500/20 text-amber-400 hover:text-white font-extrabold text-sm border border-dashed border-amber-500/40 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md mt-2"
                        >
                          <span>➕ Thêm Nhân Viên Vào CN {branch.name}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
             MODE 2: VIEW TỔNG QUAN LỊCH LÀM TOÀN BỘ TUẦN (RỘNG RÃI RÕ TÊN)
             ========================================================================= */}
          {viewMode === 'matrix' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-xs text-[var(--color-text-muted)] font-semibold flex items-center gap-1.5 bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20">
                <span>💡</span> Trượt ngang màn hình để xem đầy đủ tên nhân viên và ca làm của cả 7 ngày trong tuần.
              </div>

              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className="glass rounded-3xl overflow-hidden border shadow-xl"
                  style={{ borderColor: `${branch.color}40` }}
                >
                  <div
                    className="px-5 py-3.5 font-black text-base flex items-center justify-between"
                    style={{
                      backgroundColor: `${branch.color}25`,
                      color: '#ffffff',
                      borderBottom: `1px solid ${branch.color}35`,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full inline-block"
                        style={{ backgroundColor: branch.color }}
                      />
                      <span className="tracking-wide">🏢 CHI NHÁNH {branch.name}</span>
                    </div>
                  </div>

                  {/* Cho cuộn ngang mượt với độ rộng tối thiểu 900px (mỗi ngày 125px) */}
                  <div className="overflow-x-auto scrollbar-thin">
                    <div className="grid grid-cols-7 min-w-[900px] divide-x divide-[rgba(255,255,255,0.06)]">
                      {weekDays.map((dateStr, idx) => {
                        const key = `${branch.id}_${dateStr}`;
                        const assignedShifts = scheduleMap[key] || [];

                        return (
                          <div
                            key={dateStr}
                            className="p-2.5 bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/60 transition-colors flex flex-col justify-between min-h-[170px]"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2 pb-1 border-b border-[rgba(255,255,255,0.06)]">
                                <span className="font-black text-xs text-white">
                                  {DAY_LABELS[idx]} <span className="text-[11px] text-[var(--color-text-secondary)] font-semibold">({formatDateShort(dateStr)})</span>
                                </span>
                              </div>

                              <div className="space-y-1.5 mb-3">
                                {assignedShifts.map((shift) => (
                                  <div
                                    key={shift.id}
                                    className="p-2 bg-[var(--color-surface-2)] rounded-xl border border-[var(--color-glass-border)] text-xs shadow-sm"
                                  >
                                    <div className="flex items-center justify-between font-black text-white gap-1">
                                      <span className="font-extrabold text-white text-xs leading-tight whitespace-normal break-words">
                                        {shift.employees?.name}
                                      </span>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                          onClick={() =>
                                            setModalState({
                                              isOpen: true,
                                              date: dateStr,
                                              branch,
                                              editItem: shift,
                                            })
                                          }
                                          className="text-amber-400 border-0 bg-transparent cursor-pointer p-0.5 hover:scale-110"
                                          title="Sửa ca làm"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => handleRemoveShift(shift.id)}
                                          className="text-rose-400 border-0 bg-transparent cursor-pointer p-0.5 hover:scale-110"
                                          title="Xóa ca làm"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                    <div className="text-[11px] text-amber-300 font-black mt-1">
                                      ⏱️ {shift.start_time ? `${shift.start_time.slice(0, 5)}-${shift.end_time?.slice(0, 5)}` : `${shift.hours || 5}h`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <button
                              onClick={() =>
                                setModalState({
                                  isOpen: true,
                                  date: dateStr,
                                  branch,
                                  editItem: null,
                                })
                              }
                              className="w-full py-2 rounded-xl bg-[var(--color-surface-2)] text-amber-400 font-extrabold text-xs border border-dashed border-amber-500/40 cursor-pointer"
                            >
                              ➕ Xếp NV
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Quick Add/Edit Shift */}
      {modalState.isOpen && (
        <ModalXepLichQuick
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, date: null, branch: null, editItem: null })}
          date={modalState.date}
          branch={modalState.branch}
          employees={employees}
          availabilities={availMap[modalState.date] || []}
          daySchedule={scheduleMap[`${modalState.branch?.id}_${modalState.date}`] || []}
          onSave={handleSaveModal}
          editItem={modalState.editItem}
        />
      )}
    </div>
  );
}

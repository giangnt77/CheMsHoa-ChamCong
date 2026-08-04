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

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast, highlightEmployeeId }) {
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
    <div className="space-y-4">
      {/* Banner Slogan Chuẩn Tiệm Chè Ms Hoa (Như ảnh mẫu) */}
      <div className="glass rounded-2xl p-3.5 border border-amber-500/40 bg-gradient-to-r from-purple-900/60 via-amber-900/60 to-rose-900/60 text-center shadow-lg">
        <p className="text-amber-300 font-black text-xs md:text-sm uppercase tracking-wide">
          TIẾT KIỆM NGUYÊN VẬT LIỆU & DỌN DẸP GỌN GÀNG SẠCH SẼ KHU VỰC BÁN HÀNG
        </p>
        <p className="text-white/90 font-bold text-[11px] md:text-xs mt-0.5">
          GIỮ KHÁCH ĐỂ HỌ GIỚI THIỆU KHÁCH KHÁC NỮA • NÓI NĂNG, GIAO TIẾP LỊCH SỰ VỚI KHÁCH HÀNG
        </p>
      </div>

      {/* Thanh điều hướng Tuần & Legend màu Chi Nhánh */}
      <div className="glass rounded-3xl p-4 border border-[var(--color-glass-border)] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevWeek}
            className="px-3 py-2 rounded-xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-white text-xs font-bold border-0 cursor-pointer transition-all active:scale-95"
          >
            ◀ Tuần trước
          </button>
          <button
            type="button"
            onClick={goTodayWeek}
            className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-black border border-amber-500/40 cursor-pointer transition-all active:scale-95"
          >
            Tuần này
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="px-3 py-2 rounded-xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-white text-xs font-bold border-0 cursor-pointer transition-all active:scale-95"
          >
            Tuần sau ▶
          </button>
        </div>

        <div className="text-xs font-extrabold text-white">
          📅 Lịch tuần: <span className="text-amber-400">{startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().join('/')}</span>
        </div>

        {/* Legend Chi Nhánh */}
        <div className="flex flex-wrap gap-1.5">
          {branches.map((b) => (
            <span
              key={b.id}
              className="text-[10px] font-black px-2 py-0.5 rounded-md text-white border"
              style={{ backgroundColor: `${b.color}35`, borderColor: b.color }}
            >
              <span className="w-2 h-2 rounded-full inline-block mr-1" style={{ backgroundColor: b.color }} />
              {b.name}
            </span>
          ))}
        </div>
      </div>

      {/* =========================================================================
         BẢNG EXCEL MA TRẬN PHÂN CÔNG CHUẨN ĐÚNG THEO ẢNH MẪU
         ========================================================================= */}
      <div className="glass rounded-3xl p-3 border border-[var(--color-glass-border)] shadow-2xl overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            {/* Hàng 1: Tên Thứ (T2 -> CN) */}
            <tr className="bg-[var(--color-surface-2)] text-white border-b border-[rgba(255,255,255,0.12)]">
              <th className="py-2.5 px-2 border-r border-[rgba(255,255,255,0.1)] w-12 text-center font-black">STT</th>
              <th className="py-2.5 px-3 border-r border-[rgba(255,255,255,0.1)] w-48 text-left font-black">THỨ</th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-2 border-r border-[rgba(255,255,255,0.1)] text-center font-black uppercase text-amber-400 text-sm">
                  {DAY_LABELS[idx]}
                </th>
              ))}
            </tr>
            {/* Hàng 2: Ngày Tây (VD: 03/08, 04/08...) */}
            <tr className="bg-[var(--color-surface-1)] text-amber-300/80 border-b border-[rgba(255,255,255,0.12)] text-[11px]">
              <th className="py-1 px-2 border-r border-[rgba(255,255,255,0.06)]" />
              <th className="py-1 px-3 border-r border-[rgba(255,255,255,0.06)] text-left font-bold">NGÀY TÂY</th>
              {weekDays.map((dStr) => (
                <th key={dStr} className="py-1 px-2 border-r border-[rgba(255,255,255,0.06)] text-center font-bold">
                  {dStr.split('-').reverse().slice(0, 2).join('/')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
                </td>
              </tr>
            ) : sortedEmployees.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-[var(--color-text-muted)] italic font-bold">
                  Chưa có nhân viên nào trong hệ thống.
                </td>
              </tr>
            ) : (
              sortedEmployees.map((emp, idx) => {
                const isMe = emp.id === highlightEmployeeId;

                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-[rgba(255,255,255,0.06)] transition-all ${
                      isMe
                        ? 'bg-amber-500/15 font-bold'
                        : idx % 2 === 0
                        ? 'bg-[var(--color-surface-1)]/50'
                        : 'bg-[var(--color-surface-2)]/30'
                    } hover:bg-amber-500/15`}
                  >
                    {/* STT */}
                    <td className="py-3 px-2 border-r border-[rgba(255,255,255,0.06)] text-center font-black text-[var(--color-text-muted)]">
                      {idx + 1}
                    </td>

                    {/* Tên Nhân Viên */}
                    <td className="py-3 px-3 border-r border-[rgba(255,255,255,0.06)] font-black text-white text-sm">
                      <div className="flex items-center gap-1.5 truncate">
                        {isMe && <span className="text-amber-400">⭐</span>}
                        <span className={isMe ? 'text-amber-300' : 'text-white'}>{emp.name}</span>
                        {isMe && <span className="text-[10px] text-amber-400 font-bold">(TÔI)</span>}
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
                          className="py-1.5 px-1.5 border-r border-[rgba(255,255,255,0.06)] text-center align-middle cursor-pointer hover:opacity-90 transition-all min-w-[108px]"
                        >
                          {empShifts.length > 0 ? (
                            /* Có Ca Phân Công -> Render màu sắc chuẩn Excel (Giờ làm & Mã CN) */
                            <div className="space-y-1">
                              {empShifts.map((shift) => {
                                const bColor = shift.branches?.color || '#f59e0b';
                                const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                const timeRange = `${startTimeStr}-${endTimeStr}`;

                                return (
                                  <div
                                    key={shift.id}
                                    className="p-1.5 rounded-xl text-white font-black text-[11px] leading-tight shadow-md border"
                                    style={{
                                      backgroundColor: `${bColor}dd`,
                                      borderColor: bColor,
                                      boxShadow: `0 2px 8px ${bColor}40`,
                                    }}
                                  >
                                    <div className="text-[11px] font-black text-white">{timeRange}</div>
                                    <div className="text-[10px] opacity-90 mt-0.5 flex items-center justify-center gap-1 font-bold">
                                      <span>CN {shift.branches?.name}</span>
                                      <span className="opacity-75">({shift.hours || 5}h)</span>
                                    </div>
                                    {shift.note && (
                                      <div className="text-[9px] font-semibold italic opacity-90 truncate mt-0.5">
                                        💬 {shift.note}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : empAvail?.type === 'off' ? (
                            /* Xin nghỉ */
                            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-extrabold text-[11px]">
                              OFF
                              {empAvail.note && (
                                <span className="block text-[9px] font-normal italic truncate">
                                  {empAvail.note}
                                </span>
                              )}
                            </div>
                          ) : empAvail?.type === 'full' ? (
                            /* Đăng ký rảnh cả ngày */
                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[11px]">
                              💪 Cả ngày
                            </div>
                          ) : empAvail?.type === 'option' ? (
                            /* Đăng ký rảnh tùy chọn */
                            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-[11px]">
                              📝 {empAvail.note || 'Tùy chọn'}
                            </div>
                          ) : (
                            /* Mặc định chưa có lịch */
                            <div className="p-2 rounded-xl bg-[var(--color-surface-2)]/40 text-rose-400/60 font-bold text-[11px] hover:bg-amber-500/20 hover:text-amber-300 transition-all">
                              OFF
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

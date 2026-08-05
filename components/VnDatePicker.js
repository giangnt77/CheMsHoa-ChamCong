'use client';

/**
 * VnDatePicker — Bộ chọn ngày tiếng Việt 3 ô Ngày / Tháng / Năm siêu dễ dùng
 * Thay thế hoàn toàn ô input type="date" mặc định của trình duyệt.
 */
export default function VnDatePicker({ value, onChange }) {
  const safeValue = value && value.includes('-') ? value : '2026-08-01';
  const parts = safeValue.split('-');
  const y = Number(parts[0]) || 2026;
  const m = Number(parts[1]) || 8;
  const d = Number(parts[2]) || 1;

  const handleSelect = (newD, newM, newY) => {
    // Tự động điều chỉnh nếu số ngày vượt quá tối đa của tháng đó
    const maxDays = new Date(newY, newM, 0).getDate();
    const validD = Math.min(newD, maxDays);

    const padD = String(validD).padStart(2, '0');
    const padM = String(newM).padStart(2, '0');
    onChange(`${newY}-${padM}-${padD}`);
  };

  const years = Array.from({ length: 15 }, (_, i) => 2020 + i);

  return (
    <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-purple-200 shadow-2xs">
      {/* Chọn Ngày */}
      <select
        value={d}
        onChange={(e) => handleSelect(Number(e.target.value), m, y)}
        className="px-2 py-1 bg-purple-50 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200 cursor-pointer shadow-2xs"
      >
        {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => (
          <option key={dayNum} value={dayNum} className="text-purple-950 font-bold bg-white">
            Ngày {String(dayNum).padStart(2, '0')}
          </option>
        ))}
      </select>

      <span className="text-purple-400 font-black text-xs">/</span>

      {/* Chọn Tháng */}
      <select
        value={m}
        onChange={(e) => handleSelect(d, Number(e.target.value), y)}
        className="px-2 py-1 bg-purple-50 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200 cursor-pointer shadow-2xs"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((monthNum) => (
          <option key={monthNum} value={monthNum} className="text-purple-950 font-bold bg-white">
            Tháng {monthNum}
          </option>
        ))}
      </select>

      <span className="text-purple-400 font-black text-xs">/</span>

      {/* Chọn Năm */}
      <select
        value={y}
        onChange={(e) => handleSelect(d, m, Number(e.target.value))}
        className="px-2 py-1 bg-purple-50 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200 cursor-pointer shadow-2xs"
      >
        {years.map((yearNum) => (
          <option key={yearNum} value={yearNum} className="text-purple-950 font-bold bg-white">
            Năm {yearNum}
          </option>
        ))}
      </select>
    </div>
  );
}

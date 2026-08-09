-- ============================================
-- TIỆM CHÈ MS HOA - SCHEMA CHUẨN ĐẦY ĐỦ 100% (v4)
-- Chạy script này trong Supabase SQL Editor
-- Script này sẽ khởi tạo hoàn chỉnh 8 bảng & đầy đủ các cột
-- ============================================

-- --------------------------------------------
-- BƯỚC 1: XÓA SẠCH TẤT CẢ BẢNG CŨ NẾU CẦN RESET (CÓ CASCADE)
-- --------------------------------------------
DROP TABLE IF EXISTS shift_swaps CASCADE;
DROP TABLE IF EXISTS employee_rates CASCADE;
DROP TABLE IF EXISTS penalties CASCADE;
DROP TABLE IF EXISTS schedule CASCADE;
DROP TABLE IF EXISTS availability CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- --------------------------------------------
-- BƯỚC 2: TẠO BẢNG CẤU HÌNH HỆ THỐNG (system_settings)
-- --------------------------------------------
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 3: TẠO BẢNG NHÂN VIÊN (employees)
-- --------------------------------------------
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'staff',            -- 'staff' | 'manager' | 'owner'
  hourly_rate INTEGER DEFAULT 20000,
  pin TEXT DEFAULT '1234',
  status TEXT DEFAULT 'active',        -- 'active' (Làm) | 'leave' (Xin nghỉ ngắn ngày) | 'off' (Nghỉ/Off)
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  off_start_date TEXT,
  off_end_date TEXT,
  resigned_at TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 4: TẠO BẢNG CHI NHÁNH (branches)
-- --------------------------------------------
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#f59e0b',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 5: TẠO BẢNG ĐĂNG KÝ / DUYỆT CA OFF (availability)
-- --------------------------------------------
CREATE TABLE availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'full',   -- 'full' | 'option' | 'off'
  note TEXT DEFAULT '',                -- ghi chú mốc ca làm hoặc lý do xin off
  is_admin_assigned BOOLEAN DEFAULT false, -- true = Chủ quán gán OFF, false = Nhân viên tự đăng ký
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- --------------------------------------------
-- BƯỚC 6: TẠO BẢNG LỊCH LÀM CHÍNH THỨC (schedule)
-- --------------------------------------------
CREATE TABLE schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME,                     -- Giờ bắt đầu (VD: 08:00:00)
  end_time TIME,                       -- Giờ kết thúc (VD: 13:00:00)
  hours DECIMAL(4,2),                  -- Tổng số tiếng (VD: 5.0)
  note TEXT DEFAULT '',                -- Ghi chú cho ca làm
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- --------------------------------------------
-- BƯỚC 7: TẠO BẢNG PHẠT / THƯỞNG LƯƠNG (penalties)
-- --------------------------------------------
CREATE TABLE penalties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  type TEXT DEFAULT 'penalty',         -- 'penalty' (Phạt) | 'bonus' (Thưởng)
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 8: TẠO BẢNG MỐC TĂNG LƯƠNG THEO THỜI GIAN (employee_rates)
-- --------------------------------------------
CREATE TABLE employee_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  hourly_rate INTEGER NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 9: TẠO BẢNG ĐỔI CA TỰ ĐỘNG (shift_swaps)
-- --------------------------------------------
CREATE TABLE shift_swaps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  target_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  target_employee_name TEXT NOT NULL,
  shift_date DATE NOT NULL,
  my_shift_info TEXT DEFAULT '',
  target_shift_info TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',       -- 'pending' (Chờ duyệt) | 'approved' (Đồng ý) | 'rejected' (Từ chối)
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 10: NẠP DỮ LIỆU MẶC ĐỊNH CHI NHÁNH & CẤU HÌNH
-- --------------------------------------------
INSERT INTO branches (name, color, sort_order) VALUES
  ('HBD', '#f59e0b', 1),
  ('A4', '#10b981', 2),
  ('TL', '#8b5cf6', 3),
  ('38', '#ef4444', 4),
  ('30', '#3b82f6', 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
  ('blocked_off_days', '[]'::jsonb),
  ('announcement_notice', '"📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!"'::jsonb),
  ('special_event_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------
-- BƯỚC 11: TẠO INDEXES TỐI ƯU TỐC ĐỘ TRUY VẤN
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_availability_employee ON availability(employee_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_schedule_employee ON schedule(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(date);
CREATE INDEX IF NOT EXISTS idx_schedule_branch ON schedule(branch_id);
CREATE INDEX IF NOT EXISTS idx_penalties_employee_id ON penalties(employee_id);
CREATE INDEX IF NOT EXISTS idx_penalties_month ON penalties(month);
CREATE INDEX IF NOT EXISTS idx_penalties_date ON penalties(date);
CREATE INDEX IF NOT EXISTS idx_penalties_type ON penalties(type);
CREATE INDEX IF NOT EXISTS idx_employee_rates_employee ON employee_rates(employee_id);

-- --------------------------------------------
-- BƯỚC 12: BẬT ROW LEVEL SECURITY & POLICY CHUẨN
-- --------------------------------------------
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all system_settings') THEN
    CREATE POLICY "Allow all system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all employees') THEN
    CREATE POLICY "Allow all employees" ON employees FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all branches') THEN
    CREATE POLICY "Allow all branches" ON branches FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all availability') THEN
    CREATE POLICY "Allow all availability" ON availability FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all schedule') THEN
    CREATE POLICY "Allow all schedule" ON schedule FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all penalties') THEN
    CREATE POLICY "Allow all penalties" ON penalties FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all employee_rates') THEN
    CREATE POLICY "Allow all employee_rates" ON employee_rates FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all shift_swaps') THEN
    CREATE POLICY "Allow all shift_swaps" ON shift_swaps FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

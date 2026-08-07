-- ============================================
-- CHÈ MS HOA - FULL RESET & INITIALIZE DATABASE (v3)
-- Chạy script này trong Supabase SQL Editor
-- Script này sẽ xóa sạch dữ liệu cũ và khởi tạo cấu trúc mới 100%
-- ============================================

-- --------------------------------------------
-- BƯỚC 1: XÓA SẠCH TẤT CẢ BẢNG CŨ (CÓ CASCADE)
-- --------------------------------------------
DROP TABLE IF EXISTS penalties CASCADE;
DROP TABLE IF EXISTS schedule CASCADE;
DROP TABLE IF EXISTS availability CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- --------------------------------------------
-- BƯỚC 2: TẠO BẢNG NHÂN VIÊN (Có mã PIN 4 số cá nhân)
-- --------------------------------------------
CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  hourly_rate INTEGER DEFAULT 20000,
  pin TEXT DEFAULT '1234',
  status TEXT DEFAULT 'active',        -- 'active' (Làm) | 'leave' (Xin nghỉ ngắn ngày) | 'off' (Nghỉ/Off)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 3: TẠO BẢNG 5 CHI NHÁNH
-- --------------------------------------------
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#f59e0b',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 4: TẠO BẢNG ĐĂNG KÝ LỊCH CA LÀM (Nhân viên tự đăng ký tuần sau)
-- --------------------------------------------
CREATE TABLE availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'full',   -- 'full' | 'option' | 'off'
  note TEXT DEFAULT '',                -- ghi chú mốc ca làm hoặc lý do xin off
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- --------------------------------------------
-- BƯỚC 5: TẠO BẢNG LỊCH LÀM CHÍNH THỨC (Chủ quán xếp)
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
-- BƯỚC 6: TẠO BẢNG PHẠT / TRỪ LƯƠNG
-- --------------------------------------------
CREATE TABLE penalties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 7: TẠO BẢNG MỐC TĂNG LƯƠNG THEO THỜI GIAN
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS employee_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  hourly_rate INTEGER NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------
-- BƯỚC 8: NẠP DỮ LIỆU SẴN 5 CHI NHÁNH CỦA TIỆM CHÈ MS HOA
-- --------------------------------------------
INSERT INTO branches (name, color, sort_order) VALUES
  ('HBD', '#f59e0b', 1),
  ('A4', '#10b981', 2),
  ('TL', '#8b5cf6', 3),
  ('38', '#ef4444', 4),
  ('30', '#3b82f6', 5)
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------
-- BƯỚC 9: TẠO INDEXES TỐI ƯU TỐC ĐỘ TRUY VẤN
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_availability_employee ON availability(employee_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_schedule_employee ON schedule(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(date);
CREATE INDEX IF NOT EXISTS idx_schedule_branch ON schedule(branch_id);
CREATE INDEX IF NOT EXISTS idx_penalties_employee_id ON penalties(employee_id);
CREATE INDEX IF NOT EXISTS idx_penalties_month ON penalties(month);
CREATE INDEX IF NOT EXISTS idx_employee_rates_employee ON employee_rates(employee_id);

-- --------------------------------------------
-- BƯỚC 10: BẬT RLS (ROW LEVEL SECURITY)
-- --------------------------------------------
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_rates ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------
-- BƯỚC 11: TẠO QUYỀN TRUY CẬP PUBLIC (APPLICATIONS POLICIES)
-- --------------------------------------------
DO $$
BEGIN
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
END $$;

-- --------------------------------------------
-- BƯỚC 12: NÂNG CẤP BẢNG & BỔ SUNG MỞ RỘNG (MIGRATION SQL)
-- --------------------------------------------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT '1234';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 20000;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS off_start_date TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS off_end_date TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS resigned_at TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS note TEXT;

-- BẢNG QUẢN LÝ ĐỔI CA (SHIFT SWAPS)
CREATE TABLE IF NOT EXISTS shift_swaps (
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

ALTER TABLE shift_swaps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all shift_swaps') THEN
    CREATE POLICY "Allow all shift_swaps" ON shift_swaps FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


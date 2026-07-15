-- Draw.io 图表表
CREATE TABLE IF NOT EXISTS drawios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '未命名图表',
  xml TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE drawios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own drawios"
  ON drawios
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 索引
CREATE INDEX IF NOT EXISTS idx_drawios_user_id ON drawios(user_id);
CREATE INDEX IF NOT EXISTS idx_drawios_updated_at ON drawios(updated_at DESC);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION update_drawios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_drawios_updated_at ON drawios;
CREATE TRIGGER trg_drawios_updated_at
  BEFORE UPDATE ON drawios
  FOR EACH ROW EXECUTE FUNCTION update_drawios_updated_at();

-- ============================================================
-- Board Plugin — 看板插件数据库迁移
-- ============================================================

-- 1. board_pools 看板表
CREATE TABLE IF NOT EXISTS board_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. board_lanes 泳道表（纵向分组）
CREATE TABLE IF NOT EXISTS board_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES board_pools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. board_stages 阶段表（横向分组）
CREATE TABLE IF NOT EXISTS board_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES board_pools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. board_cards 卡片表（含备注字段替代评论）
CREATE TABLE IF NOT EXISTS board_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES board_pools(id) ON DELETE CASCADE,
  lane_id UUID REFERENCES board_lanes(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES board_stages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  note TEXT DEFAULT '',
  priority TEXT DEFAULT 'P2' CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  order_in_cell INTEGER DEFAULT 0,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_board_pools_user_id ON board_pools(user_id);
CREATE INDEX IF NOT EXISTS idx_board_lanes_pool_id ON board_lanes(pool_id);
CREATE INDEX IF NOT EXISTS idx_board_stages_pool_id ON board_stages(pool_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_pool_id ON board_cards(pool_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_lane_stage ON board_cards(lane_id, stage_id);

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_board_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- board_pools
DROP TRIGGER IF EXISTS trigger_board_pools_updated_at ON board_pools;
CREATE TRIGGER trigger_board_pools_updated_at
  BEFORE UPDATE ON board_pools
  FOR EACH ROW EXECUTE FUNCTION update_board_updated_at();

-- board_lanes
DROP TRIGGER IF EXISTS trigger_board_lanes_updated_at ON board_lanes;
CREATE TRIGGER trigger_board_lanes_updated_at
  BEFORE UPDATE ON board_lanes
  FOR EACH ROW EXECUTE FUNCTION update_board_updated_at();

-- board_stages
DROP TRIGGER IF EXISTS trigger_board_stages_updated_at ON board_stages;
CREATE TRIGGER trigger_board_stages_updated_at
  BEFORE UPDATE ON board_stages
  FOR EACH ROW EXECUTE FUNCTION update_board_updated_at();

-- board_cards
DROP TRIGGER IF EXISTS trigger_board_cards_updated_at ON board_cards;
CREATE TRIGGER trigger_board_cards_updated_at
  BEFORE UPDATE ON board_cards
  FOR EACH ROW EXECUTE FUNCTION update_board_updated_at();

-- ============================================================
-- RLS 策略
-- ============================================================

-- board_pools: 用户只能操作自己的看板
ALTER TABLE board_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_pools_select_policy ON board_pools;
CREATE POLICY board_pools_select_policy ON board_pools
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS board_pools_insert_policy ON board_pools;
CREATE POLICY board_pools_insert_policy ON board_pools
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS board_pools_update_policy ON board_pools;
CREATE POLICY board_pools_update_policy ON board_pools
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS board_pools_delete_policy ON board_pools;
CREATE POLICY board_pools_delete_policy ON board_pools
  FOR DELETE USING (auth.uid() = user_id);

-- board_lanes: 通过 pool 关联权限
ALTER TABLE board_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_lanes_select_policy ON board_lanes;
CREATE POLICY board_lanes_select_policy ON board_lanes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_lanes.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_lanes_insert_policy ON board_lanes;
CREATE POLICY board_lanes_insert_policy ON board_lanes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_lanes.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_lanes_update_policy ON board_lanes;
CREATE POLICY board_lanes_update_policy ON board_lanes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_lanes.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_lanes_delete_policy ON board_lanes;
CREATE POLICY board_lanes_delete_policy ON board_lanes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_lanes.pool_id AND user_id = auth.uid())
  );

-- board_stages: 通过 pool 关联权限
ALTER TABLE board_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_stages_select_policy ON board_stages;
CREATE POLICY board_stages_select_policy ON board_stages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_stages.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_stages_insert_policy ON board_stages;
CREATE POLICY board_stages_insert_policy ON board_stages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_stages.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_stages_update_policy ON board_stages;
CREATE POLICY board_stages_update_policy ON board_stages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_stages.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_stages_delete_policy ON board_stages;
CREATE POLICY board_stages_delete_policy ON board_stages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_stages.pool_id AND user_id = auth.uid())
  );

-- board_cards: 通过 pool 关联权限
ALTER TABLE board_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_cards_select_policy ON board_cards;
CREATE POLICY board_cards_select_policy ON board_cards
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_cards.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_cards_insert_policy ON board_cards;
CREATE POLICY board_cards_insert_policy ON board_cards
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_cards.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_cards_update_policy ON board_cards;
CREATE POLICY board_cards_update_policy ON board_cards
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_cards.pool_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS board_cards_delete_policy ON board_cards;
CREATE POLICY board_cards_delete_policy ON board_cards
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM board_pools WHERE id = board_cards.pool_id AND user_id = auth.uid())
  );

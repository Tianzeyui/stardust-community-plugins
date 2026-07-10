-- ============================================================
-- Mind Map Plugin — 思维导图插件数据库迁移
-- ============================================================

-- 1. mindmaps 思维导图表
CREATE TABLE IF NOT EXISTS mindmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. mindmap_nodes 节点表（树形结构）
CREATE TABLE IF NOT EXISTS mindmap_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID NOT NULL REFERENCES mindmaps(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#6b7280',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mindmaps_user_id ON mindmaps(user_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_map_id ON mindmap_nodes(map_id);
CREATE INDEX IF NOT EXISTS idx_mindmap_nodes_parent_id ON mindmap_nodes(parent_id);

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_mindmap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_mindmaps_updated_at ON mindmaps;
CREATE TRIGGER trigger_mindmaps_updated_at
  BEFORE UPDATE ON mindmaps FOR EACH ROW EXECUTE FUNCTION update_mindmap_updated_at();

DROP TRIGGER IF EXISTS trigger_mindmap_nodes_updated_at ON mindmap_nodes;
CREATE TRIGGER trigger_mindmap_nodes_updated_at
  BEFORE UPDATE ON mindmap_nodes FOR EACH ROW EXECUTE FUNCTION update_mindmap_updated_at();

-- ============================================================
-- RLS — mindmaps
-- ============================================================
ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mindmaps_select_policy ON mindmaps;
CREATE POLICY mindmaps_select_policy ON mindmaps FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS mindmaps_insert_policy ON mindmaps;
CREATE POLICY mindmaps_insert_policy ON mindmaps FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS mindmaps_update_policy ON mindmaps;
CREATE POLICY mindmaps_update_policy ON mindmaps FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS mindmaps_delete_policy ON mindmaps;
CREATE POLICY mindmaps_delete_policy ON mindmaps FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- RLS — mindmap_nodes（通过 map 关联权限）
-- ============================================================
ALTER TABLE mindmap_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mindmap_nodes_select_policy ON mindmap_nodes;
CREATE POLICY mindmap_nodes_select_policy ON mindmap_nodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM mindmaps WHERE id = mindmap_nodes.map_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS mindmap_nodes_insert_policy ON mindmap_nodes;
CREATE POLICY mindmap_nodes_insert_policy ON mindmap_nodes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM mindmaps WHERE id = mindmap_nodes.map_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS mindmap_nodes_update_policy ON mindmap_nodes;
CREATE POLICY mindmap_nodes_update_policy ON mindmap_nodes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM mindmaps WHERE id = mindmap_nodes.map_id AND user_id = auth.uid())
);

DROP POLICY IF EXISTS mindmap_nodes_delete_policy ON mindmap_nodes;
CREATE POLICY mindmap_nodes_delete_policy ON mindmap_nodes FOR DELETE USING (
  EXISTS (SELECT 1 FROM mindmaps WHERE id = mindmap_nodes.map_id AND user_id = auth.uid())
);

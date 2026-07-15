/**
 * Draw.io 图表插件 — AI 代理驱动绘图
 *
 * 能力：draw.io 编辑器嵌入、AI 直接操控图表（通过 MXGraph XML）
 * 数据存储：Supabase（drawios 表）
 */
import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { DrawioCanvas } from './DrawioCanvas'
import { initApi } from './api'

export function register(ctx: any) {
  const { supabase } = ctx.api

  function DrawioApp() {
    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [view, setView] = useState<'loading' | 'canvas'>('loading')

    useEffect(() => {
      let cancelled = false
      async function setup() {
        try {
          const client = supabase.getClient()
          if (!client) {
            if (!cancelled) setError('Supabase 未配置，请在设置中配置 Supabase 后使用drawio功能。')
            return
          }
          const { data } = await client.auth.getUser()
          if (!cancelled) {
            initApi(client, data.user?.id || '')
            setView('canvas')
            setReady(true)
          }
        } catch (e: any) {
          if (!cancelled) setError('初始化失败: ' + (e.message || '未知错误'))
        }
      }
      setup()
      return () => { cancelled = true }
    }, [])

    if (error) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background">
          <p className="text-xs">{error}</p>
        </div>
      )
    }
    if (!ready) {
      return (
        <div className="h-full flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (view === 'canvas') {
      return <DrawioCanvas onBack={() => {}} />
    }
    return null
  }

  ctx.registerNav({ id: 'drawio', label: 'drawio', icon: 'Workflow', order: 80 })
  ctx.registerRoute('drawio', () => Promise.resolve({ default: DrawioApp }))

  // ============================================================
  // AI 工具注册
  // ============================================================
  ctx.onToolRegister((tools: Record<string, any>) => {
    function getSB() {
      const client = supabase.getClient()
      if (!client) throw new Error('Supabase 未配置')
      return client
    }

    // 辅助：通过 Supabase 直接操作 drawios 表
    async function _listDiagrams() {
      const sb = getSB()
      const { data, error } = await sb.from('drawios').select('*').order('updated_at', { ascending: false })
      if (error) throw error
      return data || []
    }

    async function _getDiagram(id: string) {
      const sb = getSB()
      const { data, error } = await sb.from('drawios').select('*').eq('id', id).single()
      if (error) throw error
      return data
    }

    async function _createDiagram(name: string, xml: string) {
      const sb = getSB()
      const { data: { user } } = await sb.auth.getUser()
      const { data, error } = await sb.from('drawios').insert({ user_id: user.id, name, xml }).select().single()
      if (error) throw error
      return data
    }

    async function _updateDiagram(id: string, updates: { name?: string; xml?: string }) {
      const sb = getSB()
      const { data, error } = await sb.from('drawios').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    }

    // ============================================================
    // drawio_display — 创建/替换图表（Agent 驱动绘图的核心工具）
    // ============================================================
    tools['drawio_display'] = {
      description: `创建新的 draw.io 图表或完全替换已有图表。

**图表类型**：流程图、架构图、UML图、ER图、网络拓扑、泳道图、组织架构图等。

**XML 格式规范（MXGraph）**：
图表 XML 必须符合以下结构：

\`\`\`xml
<mxfile host="stardust">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- 节点：vertex="1" 表示形状，parent="1" 表示放在画布上 -->
        <!-- 边：edge="1" source="节点id" target="节点id" -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
\`\`\`

**节点 (vertex) 模板**：
\`\`\`xml
<mxCell id="UNIQUE_ID" value="显示文字" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
  <mxGeometry x="200" y="150" width="120" height="60" as="geometry"/>
</mxCell>
\`\`\`

**连接线 (edge) 模板**：
\`\`\`xml
<mxCell id="UNIQUE_ID" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="NODE_A_ID" target="NODE_B_ID">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
\`\`\`

**常用样式**：
- 圆角矩形: rounded=1;whiteSpace=wrap;html=1;
- 菱形(决策): rhombus;whiteSpace=wrap;html=1;
- 圆柱(数据库): shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;
- 云朵: shape=cloud;whiteSpace=wrap;html=1;
- 六边形: shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;fixedSize=1;
- 泳道: swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;

**ID 规则**：id 必须是数字字符串（"2", "3", "4"...），每个 cell 唯一。不要跳过数字。

**x/y 坐标**：节点放在 (x: 40-800, y: 40-600) 范围内，横向间距 160+，纵向间距 80+。左侧留 x=40 起点。

返回创建后的图表 id 和摘要。`,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '图表名称' },
          xml: { type: 'string', description: '完整的 draw.io MXGraph XML 字符串' },
          diagram_id: { type: 'string', description: '可选。如果提供，则替换已有图表而非新建' },
        },
        required: ['name', 'xml'],
      },
      execute: async (args: { name: string; xml: string; diagram_id?: string }) => {
        try {
          let diagram
          if (args.diagram_id) {
            diagram = await _updateDiagram(args.diagram_id, { name: args.name, xml: args.xml })
          } else {
            diagram = await _createDiagram(args.name, args.xml)
          }

          // 通知当前画布刷新（如果已打开）
          if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('drawio:updated', { detail: { id: diagram.id } }))
          }

          // 自动打开 drawio 窗口
          try {
            localStorage.setItem('stardust_drawio_activeId', diagram.id)
          } catch { /* ignore */ }
          const api = (window as any).electronAPI
          if (api?.window?.openNav) {
            api.window.openNav('drawio', 'drawio')
          }

          return `图表「${args.name}」${args.diagram_id ? '已更新' : '已创建'}。drawio 窗口已自动打开。`
        } catch (e: any) {
          return '创建图表失败: ' + e.message
        }
      },
    }

    // ============================================================
    // drawio_open — 打开已有图表
    // ============================================================
    tools['drawio_open'] = {
      description: '打开指定的已有图表。当用户说"打开XX图"、"查看XX图"时使用。先调用 drawio_list 获取图表 id，再用此工具打开。支持前 8 位短 id。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图表 id，支持前 8 位短 id' },
        },
        required: ['id'],
      },
      execute: async (args: { id: string }) => {
        try {
          let d
          if (args.id.length < 36) {
            const list = await _listDiagrams()
            d = list.find((item: any) => item.id.startsWith(args.id))
            if (!d) return `未找到 id=${args.id.slice(0, 8)} 的图表。请用 drawio_list 查看可用图表。`
          } else {
            d = await _getDiagram(args.id)
          }

          // 设置活动图表，打开窗口
          try {
            localStorage.setItem('stardust_drawio_activeId', d.id)
          } catch { /* ignore */ }
          const api = (window as any).electronAPI
          if (api?.window?.openNav) {
            api.window.openNav('drawio', 'drawio')
          }

          return `已打开图表「${d.name}」。`
        } catch (e: any) { return '打开图表失败: ' + e.message }
      },
    }

    // ============================================================
    // drawio_get — 获取图表 XML（编辑前必须先获取）
    // ============================================================
    tools['drawio_get'] = {
      description: `获取指定图表的完整 XML 内容。在对已有图表调用 drawio_display 进行修改之前，必须先调用本工具获取当前 XML。

支持前 8 位短 id 匹配。`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图表 id，支持前 8 位短 id' },
        },
        required: ['id'],
      },
      execute: async (args: { id: string }) => {
        try {
          // 支持短 id 匹配
          let d
          if (args.id.length < 36) {
            const list = await _listDiagrams()
            d = list.find((item: any) => item.id.startsWith(args.id))
            if (!d) return `未找到 id=${args.id.slice(0, 8)} 的图表。`
          } else {
            d = await _getDiagram(args.id)
          }

          return [
            `## ${d.name}`,
            `更新时间: ${new Date(d.updated_at).toLocaleString('zh-CN')}`,
            '',
            '```xml',
            d.xml,
            '```',
          ].join('\n')
        } catch (e: any) { return '获取图表失败: ' + e.message }
      },
    }

    // ============================================================
    // drawio_list — 列出所有图表
    // ============================================================
    tools['drawio_list'] = {
      description: '列出当前用户的所有 draw.io 图表。返回图表 id、名称和更新时间。需要查看或编辑某个图表时先调用此工具。',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        try {
          const diagrams = await _listDiagrams()
          if (diagrams.length === 0) return '暂无图表。使用 drawio_display 创建第一个图表吧。'
          return diagrams.map((d: any) =>
            `- ${d.name} (${d.id.slice(0, 8)}) | ${new Date(d.updated_at).toLocaleString('zh-CN')}`
          ).join('\n')
        } catch (e: any) { return '获取图表列表失败: ' + e.message }
      },
    }

    // ============================================================
    // drawio_export — 导出图表为图片
    // ============================================================
    tools['drawio_export'] = {
      description: '导出指定图表为 PNG 图片（如果图表已打开在画布中，会触发浏览器下载；否则返回 XML 用于服务端处理）。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '图表 id，支持短 id' },
        },
        required: ['id'],
      },
      execute: async (args: { id: string }) => {
        try {
          let d
          if (args.id.length < 36) {
            const list = await _listDiagrams()
            d = list.find((item: any) => item.id.startsWith(args.id))
            if (!d) return `未找到 id=${args.id.slice(0, 8)} 的图表。`
          } else {
            d = await _getDiagram(args.id)
          }

          // 通知画布触发导出
          if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('drawio:export', { detail: { id: (d as any).id } }))
          }

          return `图表「${(d as any).name}」导出请求已发送。请切换到「drawio」页面查看并下载 PNG 图片。`
        } catch (e: any) { return '导出失败: ' + e.message }
      },
    }
  })
}

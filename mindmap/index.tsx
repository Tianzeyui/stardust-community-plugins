/**
 * 思维导图插件 — 树形脑图可视化
 *
 * 能力：SVG 画布渲染、自顶向下树形布局、节点增删改、平移缩放
 * 数据存储：Supabase（mindmaps / mindmap_nodes 表）
 */
import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { MindMapPage } from './MindMapPage'
import { initApi } from './api'

export function register(ctx: any) {
  const { supabase } = ctx.api

  function MindMapApp() {
    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let cancelled = false
      async function setup() {
        try {
          const client = supabase.getClient()
          if (!client) {
            if (!cancelled) setError('Supabase 未配置，请在设置中配置 Supabase 后使用思维导图功能。')
            return
          }
          const { data } = await client.auth.getUser()
          if (!cancelled) {
            initApi(client, data.user?.id || '')
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
    return <MindMapPage />
  }

  ctx.registerNav({ id: 'mindmap', label: '思维导图', icon: 'Lightbulb', order: 75 })
  ctx.registerRoute('mindmap', () => Promise.resolve({ default: MindMapApp }))

  // ---- AI 工具 ----
  ctx.onToolRegister((tools: Record<string, any>) => {
    function getSB() {
      const client = supabase.getClient()
      if (!client) throw new Error('Supabase 未配置')
      return client
    }

    tools['mindmap_list'] = {
      description: '列出当前用户的所有思维导图及其节点结构。',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        try {
          const sb = getSB()
          const { data: maps, error } = await sb.from('mindmaps').select('id,name,updated_at').order('updated_at', { ascending: false })
          if (error) throw error
          if (!maps || maps.length === 0) return '暂无思维导图。'
          return (maps as any[]).map((m: any) =>
            `- ${m.name} (${m.id.slice(0, 8)}) | ${new Date(m.updated_at).toLocaleString('zh-CN')}`
          ).join('\n')
        } catch (e: any) { return '查询失败: ' + e.message }
      },
    }
  })
}

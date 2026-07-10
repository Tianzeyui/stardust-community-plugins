/**
 * 看板插件 — 泳道+阶段矩阵式任务管理
 *
 * 能力：看板 CRUD、泳道/阶段管理、卡片拖拽移动、备注功能
 * 数据存储：Supabase（board_pools / board_lanes / board_stages / board_cards 表）
 */
import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { BoardPage } from './BoardPage'
import { initApi } from './api'

export function register(ctx: any) {
  const { supabase } = ctx.api

  function BoardApp() {
    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      let cancelled = false

      async function setup() {
        try {
          const client = supabase.getClient()
          if (!client) {
            if (!cancelled) setError('Supabase 未配置，请在设置中配置 Supabase 后使用看板功能。')
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
          <div className="text-4xl">⚠️</div>
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

    return <BoardPage />
  }

  ctx.registerNav({ id: 'board', label: '卡片看板', icon: 'FolderKanban', order: 70 })
  ctx.registerRoute('board', () => Promise.resolve({ default: BoardApp }))

  // ---- AI 工具 ----
  ctx.onToolRegister((tools: Record<string, any>) => {
    function getSB() {
      const client = supabase.getClient()
      if (!client) throw new Error('Supabase 未配置')
      return client
    }

    tools['board_list_pools'] = {
      description: '列出当前用户的所有看板。返回看板 id、名称、描述。需要查看某个看板的卡片时用 board_list_cards。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const sb = getSB()
          const { data, error } = await sb.from('board_pools').select('id,name,description,updated_at').order('updated_at', { ascending: false })
          if (error) throw error
          const pools = (data || []) as any[]
          if (!pools.length) return '暂无看板。'
          return pools.map((p: any) => `- ${p.name} (${p.id.slice(0, 8)}) | ${p.description || '无描述'} | ${new Date(p.updated_at).toLocaleString('zh-CN')}`).join('\n')
        } catch (e: any) { return '查询失败: ' + e.message }
      },
    }

    tools['board_list_cards'] = {
      description: '列出指定看板的所有卡片。需要 pool_id（看板 id）。返回卡片标题、优先级、负责人、所属阶段/泳道等摘要信息。支持前 8 位短 id 匹配 pool_id。',
      inputSchema: {
        type: 'object',
        properties: {
          pool_id: { type: 'string', description: '看板 id，支持前 8 位短 id' },
        },
        required: ['pool_id'],
      },
      execute: async (args: { pool_id: string }) => {
        try {
          const sb = getSB()
          // 查找看板
          let poolQuery = sb.from('board_pools').select('id,name')
          poolQuery = args.pool_id.length < 36
            ? poolQuery.filter('id::text', 'like', `${args.pool_id}%`)
            : poolQuery.eq('id', args.pool_id)
          const { data: pools, error: poolErr } = await poolQuery
          if (poolErr) throw poolErr
          if (!pools || pools.length === 0) return `未找到 id=${args.pool_id} 的看板。`

          const pool = pools[0] as any
          // 获取阶段和泳道
          const [{ data: stages }, { data: lanes }, { data: cards }] = await Promise.all([
            sb.from('board_stages').select('id,name').eq('pool_id', pool.id).order('sort_order'),
            sb.from('board_lanes').select('id,name').eq('pool_id', pool.id).order('sort_order'),
            sb.from('board_cards').select('id,title,priority,assignee,note,lane_id,stage_id').eq('pool_id', pool.id).order('order_in_cell'),
          ])

          const stageMap = new Map((stages || []).map((s: any) => [s.id, s.name]))
          const laneMap = new Map((lanes || []).map((l: any) => [l.id, l.name]))

          if (!cards || cards.length === 0) return `看板「${pool.name}」暂无卡片。`

          return `## ${pool.name}\n\n` + (cards as any[]).map((c: any) => {
            const stage = stageMap.get(c.stage_id) || '未分类'
            const lane = laneMap.get(c.lane_id) || '默认'
            const noteIcon = c.note ? ' 📝' : ''
            return `- [${c.priority}] ${c.title} | ${lane} → ${stage}${noteIcon} (${c.id.slice(0, 8)})`
          }).join('\n')
        } catch (e: any) { return '查询失败: ' + e.message }
      },
    }

    tools['board_get_card'] = {
      description: '获取指定卡片的完整详情（含内容、备注）。先用 board_list_cards 拿到卡片 id，再用此工具。支持前 8 位短 id。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: '卡片 id，支持前 8 位短 id' } },
        required: ['id'],
      },
      execute: async (args: { id: string }) => {
        try {
          const sb = getSB()
          let q = sb.from('board_cards').select('*')
          q = args.id.length < 36 ? q.filter('id::text', 'like', `${args.id}%`) : q.eq('id', args.id)
          const { data, error } = await q.maybeSingle()
          if (error) throw error
          if (!data) return `未找到 id=${args.id} 的卡片。`
          const c = data as any
          return `## ${c.title}\n\n**内容:**\n${c.content || '(无内容)'}\n\n**备注:**\n${c.note || '(无备注)'}\n\n- 优先级: ${c.priority}\n- 创建人: ${c.created_by || '未知'}\n- 创建时间: ${new Date(c.created_at).toLocaleString('zh-CN')}`
        } catch (e: any) { return '查询失败: ' + e.message }
      },
    }
  })
}

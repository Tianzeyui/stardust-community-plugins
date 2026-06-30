/**
 * 日记插件 — 挂载现有 DiaryPage 组件 + 注册 AI 工具
 * AI 工具只提供只读访问，写入/编辑/删除仅限 UI 操作
 */
export function register(ctx: any) {
  ctx.registerNav({ id: 'diary', label: '日记', icon: 'BookOpen', order: 60 })
  ctx.registerRoute('diary', () => import('@/components/diary/DiaryPage'))

  ctx.onToolRegister((tools: Record<string, any>) => {
    // 公共 helper：获取 Supabase client
    function getClient() {
      const client = ctx.api.supabase.getClient()
      if (!client) throw new Error('Supabase 未配置')
      return client
    }

    // ====== 只读工具：时间线 ======
    tools['diary_timeline'] = {
      description:
        '查看日记时间线，列出有日记记录的日期及标题。可用于快速了解用户的日记习惯和关注话题。' +
        '不返回正文内容，需要详细内容时使用 diary_get。',
      inputSchema: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '筛选年份（可选），如 2026' },
          month: { type: 'number', description: '筛选月份 1-12（可选），需与 year 一起使用' },
        },
      },
      execute: async (args: { year?: number; month?: number }) => {
        try {
          const sb = getClient()
          let query = sb.from('diary_entries')
            .select('entry_date, title, mood')
            .order('entry_date', { ascending: false })

          if (args.year) {
            const y = String(args.year)
            if (args.month) {
              const m = String(args.month).padStart(2, '0')
              query = query.gte('entry_date', `${y}-${m}-01`).lt('entry_date', m === '12' ? `${Number(y) + 1}-01-01` : `${y}-${String(Number(m) + 1).padStart(2, '0')}-01`)
            } else {
              query = query.gte('entry_date', `${y}-01-01`).lt('entry_date', `${Number(y) + 1}-01-01`)
            }
          }

          const { data, error } = await query
          if (error) throw error
          const entries = (data || []) as any[]
          if (entries.length === 0) {
            const scope = args.year
              ? args.month ? `${args.year}年${args.month}月` : `${args.year}年`
              : ''
            return scope ? `${scope}暂无日记记录。` : '暂无日记记录。'
          }

          const lines = entries.map((e: any) =>
            `- **${e.entry_date}**${e.title ? ` — ${e.title}` : ''}${e.mood ? ` [${e.mood}]` : ''}`
          )
          return `${entries.length} 篇日记：\n${lines.join('\n')}`
        } catch (e: any) {
          return `获取日记时间线失败：${e.message}`
        }
      },
    }

    // ====== 只读工具：查看详情 ======
    tools['diary_get'] = {
      description:
        '获取指定日期的日记全文。先用 diary_timeline 查看有哪些日期有日记，再按日期读取详细内容。' +
        '如果用户提到某个日期或事件，可以用此工具查看当天的日记。',
      inputSchema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '日期，格式 YYYY-MM-DD' },
        },
        required: ['date'],
      },
      execute: async (args: { date: string }) => {
        try {
          const sb = getClient()
          const { data, error } = await sb.from('diary_entries')
            .select('*').eq('entry_date', args.date).maybeSingle()
          if (error) throw error
          if (!data) return `${args.date} 没有日记记录。`
          const e = data as any
          return [
            `## ${e.entry_date}${e.title ? ` — ${e.title}` : ''}${e.mood ? `  [${e.mood}]` : ''}`,
            '',
            e.content || '(空)',
          ].join('\n')
        } catch (e: any) {
          return `获取日记失败：${e.message}`
        }
      },
    }
  })
}

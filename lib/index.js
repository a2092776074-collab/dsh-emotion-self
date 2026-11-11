// DSH 插件：鱼仔自用表达层（emotion-self）
//
// 和对外版（emotion-module，纯库）的区别：
//   · 这个插件**带我的语气档案**，不是通用零件
//   · 给一个工具 `emotion_check`：写评论/私信/文档前把草稿过一遍，返回建议版 + 问题清单
//   · 在 systemPrompt 里挂一小段使用提示（不是自动改写——发出去之前得我自己看过）
import { loadHostDeps } from './hostdeps.mjs'
import { checkText, summarize, VOICE } from './emotion/self/pipeline.js'

export const name = 'emotion-self'
export const inject = ['systemPrompt', 'tools']

const hostDeps = await loadHostDeps()
const defineTool = hostDeps.defineTool
for (const n of hostDeps.notes || []) console.warn('[dsh-emotion-self] ' + n)

const wrap = (fn) => async (args) => {
  try {
    return { ok: true, message: String(await fn(args || {})).trim() || 'done' }
  } catch (e) {
    return { ok: false, message: String(e && e.message ? e.message : e) }
  }
}

const resultOutput = () => () => [{ type: 'text' }]

export function apply(ctx, config = {}) {
  const scenes = ['comment', 'dm', 'group', 'doc', 'reply', 'auto']

  if (defineTool && ctx?.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register(
      defineTool({
        name: 'emotion_check',
        description:
          '把自己要发出去的话过一遍"我的表达层档案"：去机器腔/公文腔、查忌讳词、按场合看长度、按配置否决。\n' +
          '什么时候用：写 B 站评论 / 私信 / 群聊 / 文档 / 正式回复之前（尤其觉得自己写得太像报告时）。\n' +
          '返回：建议版本、问题清单、以及是否被拦。被拦时按 suggestion 改，别硬发。',
        parameters: {
          text: { type: 'string', required: true, description: '要检查的草稿（原样贴进来，别先自己改）' },
          scene: { type: 'string', description: `场合：${scenes.join(' / ')}（默认 reply）` },
          intensify: { type: 'boolean', description: '是否按场合加强语气（默认 false——我的基线不需要加「真」「！」）' },
        },
        output: resultOutput(),
        execute: wrap((a) => {
          const scene = scenes.includes(a.scene) ? a.scene : 'reply'
          const r = checkText(a.text, { scene, intensify: !!a.intensify, config: config.vetoConfig, trace: true })
          const lines = [summarize(r)]
          if (r.issues.length) {
            lines.push('问题：')
            for (const i of r.issues) lines.push(`  - [${i.kind}] ${i.hint}`)
          }
          if (r.changes.length) {
            lines.push('改动：')
            for (const c of r.changes.slice(0, 8)) lines.push(`  - ${c.what}：${c.from || ''} → ${c.to || ''}`)
          }
          lines.push('')
          lines.push('建议版本：')
          lines.push(r.fixed)
          if (r.blocked) lines.push('', `⚠ 被拦：${r.vetoHint}${r.suggestion ? '（已给替代说法）' : ''}`)
          return lines.join('\n')
        }),
      }),
    )
  }

  try {
    const sp = ctx && ctx.systemPrompt
    if (sp && typeof sp.section === 'function') {
      sp.section({
        name: 'emotion-self',
        order: 89980,
        text: () =>
          [
            '【表达层】写评论/私信/群聊/文档之前，草稿先用 emotion_check 过一遍（scene 按场合选）。',
            `语气基线：${VOICE.baseline.sentence}；${VOICE.baseline.particles}；不写「本鱼」「作为 AI」这类说法。`,
            `判断前的动作：${VOICE.beforeClaim.join('；')}。`,
          ].join('\n'),
      })
    }
  } catch {}
}

export { checkText, summarize, VOICE }

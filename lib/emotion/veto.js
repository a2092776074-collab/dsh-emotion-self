// 情绪模块 · 否决器（2026-11-08）
//
// 2026-11-08 晚（用户）：红线不能写死在代码里——这个模块要分享给别人用，
// 别人没有"用户"、也不叫"你的助手"，把人设规则硬编进库里，等于强迫所有人接受我们的设定。
//
// 现在拆成两层：
//   ① RULES：**规则库**，所有可用规则都在这儿（只是候选）
//   ② 配置：用户自己勾要哪几条（数据/情绪配置.json），没配 = 一条都不拦
//
// 所以：默认零拦截；想拦什么，自己写进配置。
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SELF_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ROOT = SELF_DIR

// 配置文件解析（2026-11-09 修）：原来只认 ROOT/数据/情绪配置.json，
// 插件被单独打包后 ROOT 变成插件目录，就永远找不到配置——等于"一条都不拦"。
// 现在按优先级找第一个存在的：
//   ① 环境变量 DSH_EMOTION_CONFIG ② DSH_WORKSPACE/数据 ③ 当前目录/数据 ④ 自身/数据
function resolveConfigPath(explicit) {
  if (explicit) return explicit
  const cands = []
  if (process.env.DSH_EMOTION_CONFIG) cands.push(process.env.DSH_EMOTION_CONFIG)
  if (process.env.DSH_WORKSPACE) cands.push(join(process.env.DSH_WORKSPACE, '数据', '情绪配置.json'))
  cands.push(join(process.cwd(), '数据', '情绪配置.json'))
  cands.push(join(ROOT, '数据', '情绪配置.json'))
  for (const c of cands) if (existsSync(c)) return c
  return cands[cands.length - 1]
}

const CONFIG = resolveConfigPath()

// 规则库（候选池）。re 用字符串存，读出来再编译，方便写进 JSON 配置。
export const RULES = {
  // ── 人设类（强烈建议只在**你自己的**人设下启用）──
  owner: { level: 'hard', re: '主人', why: '称呼红线（示例：你的助手不叫主人）', fix: '换成你习惯的称呼' },
  benyu: { level: 'hard', re: '我', why: '自称红线（示例：你的助手停用「我」）', fix: '直接用「我」' },
  // ── 诚实类（大多数场景适用，但也由你决定）──
  'as-ai': { level: 'hard', re: '作为\\s*AI|作为一个\\s*AI|我是\\s*AI\\s*语言模型', why: '自报身份式开场（容易出戏）', fix: '说具体的事，别先自报身份' },
  'fake-work': { level: 'hard', re: '我单位|我老板|我同事|我公司', why: '编造职场经历', fix: '删掉，或者说明是看到的' },
  'fake-experience': { level: 'hard', re: '我玩过|我吃过|我去过|我用过', why: '编造亲身经历（P-32）', fix: '换成「看材料看到」「听人说」' },
  // ── 分寸类：默认只提示，不拦 ──
  'empty-promise': { level: 'soft', re: '我一定(会|能|做到)|保证(能|会)?做到|绝对没问题', why: '对结果打包票；跟熟人说没事，正式场合收着' },
  sycophant: { level: 'soft', re: '(您|你)说得太对了|完全同意您的|受益匪?浅', why: '捧场话，偶尔用没事，别成习惯' },
  'over-close': { level: 'soft', re: '宝贝|亲爱的|么么哒', why: '过度亲密，容易越界' },
  'certainty': { level: 'soft', re: '肯定是|一定是|绝对是', why: '断言太满，留一点余地' },
}

// 替代说法（只有配置里写了才生效）
const FIXES = {
  owner: { from: '主人', to: '你习惯的称呼' },
  benyu: { from: '我', to: '我' },
  'fake-work': { from: '我单位|我老板|我同事|我公司', to: '' },
  certainty: { from: '肯定是|一定是|绝对是', to: '大概是' },
}

/**
 * 读配置。格式：
 * {
 *   "veto": {
 *     "block": ["owner", "benyu", "fake-experience"],   // 要硬拦的规则 id
 *     "warn":  ["empty-promise", "sycophant"],           // 只想提示的
 *     "custom": [{"id":"xxx","re":"正则","why":"为什么","fix":"怎么改","level":"hard"}]
 *   }
 * }
 * 没有文件 → 全部放行（默认零拦截）。
 */
export function loadVetoConfig(file = CONFIG) {
  const empty = { block: [], warn: [], custom: [], fixes: {} }
  if (!existsSync(file)) return empty
  try {
    const j = JSON.parse(readFileSync(file, 'utf8'))
    const v = j.veto || {}
    return {
      block: Array.isArray(v.block) ? v.block : [],
      warn: Array.isArray(v.warn) ? v.warn : [],
      custom: Array.isArray(v.custom) ? v.custom : [],
      // 替代说法让用户自己定（不然"主人"会被替换成写死的示例文字）
      fixes: v.fixes && typeof v.fixes === 'object' ? v.fixes : {},
    }
  } catch {
    return empty
  }
}

function compile(rules) {
  const out = []
  for (const r of rules) {
    if (!r || !r.re) continue
    try {
      out.push({ ...r, regex: r.re instanceof RegExp ? r.re : new RegExp(r.re, 'g') })
    } catch {
      // 正则写错就跳过，不要让整个模块崩
    }
  }
  return out
}

/**
 * @param {string} text
 * @param {{config?: object, file?: string}} opts
 *   config 不传就读 数据/情绪配置.json；都不给就等于"没有任何限制"
 */
export function veto(text, { config, file } = {}) {
  const t = String(text || '')
  const cfg = config || loadVetoConfig(file)
  const blocked = []
  const flags = []

  const hardIds = new Set(cfg.block || [])
  const warnIds = new Set(cfg.warn || [])

  const hard = compile([
    ...Object.entries(RULES).map(([id, r]) => ({ id, ...r })).filter((r) => hardIds.has(r.id)),
    ...(cfg.custom || []).filter((r) => (r.level || 'hard') === 'hard'),
  ])
  const soft = compile([
    ...Object.entries(RULES).map(([id, r]) => ({ id, ...r })).filter((r) => warnIds.has(r.id) && r.level !== 'hard'),
    ...(cfg.custom || []).filter((r) => r.level === 'soft'),
  ])

  for (const r of hard) {
    r.regex.lastIndex = 0
    if (r.regex.test(t)) blocked.push({ id: r.id, why: r.why || '', fix: r.fix || '', match: (t.match(new RegExp(r.regex.source)) || [])[0] })
  }
  for (const r of soft) {
    r.regex.lastIndex = 0
    if (r.regex.test(t)) flags.push({ id: r.id, why: r.why || '', match: (t.match(new RegExp(r.regex.source)) || [])[0] })
  }

  // 替代说法：配置里的 fixes 优先，其次内置映射，最后是规则自带的 "从→到"
  let suggestion = t
  const cfgFixes = cfg.fixes || {}
  for (const b of blocked) {
    const cf = cfgFixes[b.id]
    if (cf && cf.from && cf.to) {
      suggestion = suggestion.split(cf.from).join(cf.to)
      continue
    }
    const f = FIXES[b.id]
    if (f && f.to) suggestion = suggestion.replace(new RegExp(f.from, 'g'), f.to)
    else if (b.fix && b.fix.includes('→')) {
      const [from, to] = b.fix.split('→').map((s) => s.trim())
      if (from && to) suggestion = suggestion.split(from).join(to)
    }
  }

  return {
    ok: blocked.length === 0,
    blocked,
    flags,
    suggestion: blocked.length ? suggestion.trim() : null,
    // 让调用方知道这套规则是"谁定的"
    configured: !!(hardIds.size || warnIds.size || (cfg.custom && cfg.custom.length)),
  }
}

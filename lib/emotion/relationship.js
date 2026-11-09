// 关系熟悉度（2026-11-08，用户提的"越聊越开"机制）
//
// 理论：第一次见面会收敛（礼貌/克制），熟了会放开（玩笑/俚语/长句）。
// 落地成一条"熟悉度"状态，按对象分别记：
//
//   familiarity 0..1：0=刚认识，1=很熟
//   → 派生四个表达档位：formality（客气度）、warmth（热络）、verbosity（话量）、playfulness（玩笑度）
//
// 和原来三通道敏感度（being_cut 等）的区别：
//   · 三通道是"我这个人现在什么状态"（全局、慢变）
//   · 熟悉度是"我跟这个人多熟"（按人、随互动累积）
//
// ⚠ 重要约束（用我们自己的私信数据验出来的）：
//   你的助手的敬语率从一开始就是 0 —— 初始不是"腼腆"，是"克制但不说客套话"。
//   所以初始档位按人设配置，默认 formality=0.35 而不是 0.8。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATE = join(ROOT, '数据', '关系状态.json')
const CONFIG_FILE = join(ROOT, '数据', '情绪配置.json')

// 2026-11-08 晚：初始熟悉度也交给配置（否则分享出去别人还得改代码）
function loadInit() {
  const fallback = { stranger: 0.15, acquaintance: 0.4, regular: 0.65, inner: 0.85 }
  try {
    if (!existsSync(CONFIG_FILE)) return { init: fallback, known: {} }
    const j = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return { init: { ...fallback, ...(j.relationship && j.relationship.init) }, known: (j.relationship && j.relationship.known) || {} }
  } catch {
    return { init: fallback, known: {} }
  }
}

const RC = loadInit()
const CONFIG = {
  // 初始熟悉度：陌生人低，熟人高（可在 数据/情绪配置.json 里改）
  init: RC.init,
  // 已知的人直接给熟悉度（配置里 relationship.known）
  known: RC.known,
  // 每次正向互动加多少（负向少加、且不加分）
  gain: { positive: 0.012, neutral: 0.006, negative: 0.002 },
  // 一次互动最多影响多少（防止一句热络话直接拉满）
  capPerTurn: 0.05,
  // 冷落衰减：半衰期 30 天，向"认识"那档回落
  halfLifeDays: 30,
  // 派生档位：熟悉度 → 表达
  derive: {
    formality: (f) => Number((0.45 * (1 - f) + 0.05).toFixed(2)), // 0.45→0.05
    warmth: (f) => Number((0.3 + 0.6 * f).toFixed(2)),
    verbosity: (f) => Number((0.4 + 0.6 * f).toFixed(2)),
    playfulness: (f) => Number((0.1 + 0.8 * Math.max(0, f - 0.35)).toFixed(2)),
  },
}

function load() {
  if (!existsSync(STATE)) return { peers: {}, updated: Date.now() }
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    return { peers: {}, updated: Date.now() }
  }
}

function save(s) {
  s.updated = Date.now()
  writeFileSync(STATE, JSON.stringify(s, null, 1), 'utf8')
}

function decay(peerState, now = Date.now()) {
  const last = peerState.lastAt || now
  const days = Math.max(0, (now - last) / 86400_000)
  const k = Math.pow(0.5, days / CONFIG.halfLifeDays)
  const floor = CONFIG.init.acquaintance
  peerState.familiarity = floor + (peerState.familiarity - floor) * k
  return peerState
}

export function getPeer(peerKey, { kind = 'stranger' } = {}) {
  const s = load()
  if (!s.peers[peerKey]) {
    // 配置里点名认识的人（relationship.known）直接给熟悉度，不用从陌生人开始
    const known = CONFIG.known[peerKey]
    s.peers[peerKey] = {
      familiarity: known && Number.isFinite(known.familiarity) ? known.familiarity : (CONFIG.init[kind] ?? CONFIG.init.stranger),
      turns: 0,
      positive: 0,
      negative: 0,
      topics: [],
      lastAt: Date.now(),
      kind,
    }
    save(s)
  }
  return decay(s.peers[peerKey])
}

/**
 * 记一次互动。
 * @param {string} peerKey 对象标识（uid/nickname）
 * @param {object} signal {valence, isQuestion, topic, kind}
 */
export function recordTurn(peerKey, signal = {}) {
  const s = load()
  const p = (s.peers[peerKey] ||= {
    familiarity: CONFIG.init[signal.kind || 'stranger'] ?? CONFIG.init.stranger,
    turns: 0,
    positive: 0,
    negative: 0,
    topics: [],
    lastAt: Date.now(),
    kind: signal.kind || 'stranger',
  })
  decay(p)
  const v = Number(signal.valence || 0)
  const bucket = v > 0.15 ? 'positive' : v < -0.15 ? 'negative' : 'neutral'
  let delta = CONFIG.gain[bucket]
  // 带新话题的交流加得更多（"聊到一块去了"）
  if (signal.topic && !p.topics.includes(signal.topic)) {
    p.topics.push(signal.topic)
    if (p.topics.length > 20) p.topics.shift()
    delta += 0.004
  }
  // 问句略微加：愿意问说明想聊
  if (signal.isQuestion) delta += 0.002
  p.familiarity = Math.min(1, p.familiarity + Math.min(CONFIG.capPerTurn, delta))
  p.turns += 1
  if (bucket === 'positive') p.positive += 1
  if (bucket === 'negative') p.negative += 1
  p.lastAt = Date.now()
  save(s)
  return p
}

/** 拿某人的表达档位 */
export function profileFor(peerKey, opts = {}) {
  const p = getPeer(peerKey, opts)
  const f = Math.max(0, Math.min(1, p.familiarity))
  const d = CONFIG.derive
  return {
    peer: peerKey,
    familiarity: Number(f.toFixed(2)),
    turns: p.turns,
    formality: d.formality(f),
    warmth: d.warmth(f),
    verbosity: d.verbosity(f),
    playfulness: d.playfulness(f),
    // 一句话总结，方便看
    stage: f < 0.25 ? '刚认识' : f < 0.45 ? '有点熟' : f < 0.7 ? '熟人' : '很熟',
  }
}

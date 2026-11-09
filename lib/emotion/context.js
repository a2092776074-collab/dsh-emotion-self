// 上下文装载（2026-11-08）
//
// 实测：加一句上文，20% 的判定会改变，其中 7:1 变得更确定。
// 所以判断接口要能吃上下文——但**规则判定基本吃不动**（它看字面），
// 真正受益的是模型判定；规则只做一件事：有上下文但自己没用上时，把置信度调低。
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 从私信缓存里取某人的最近 N 条（供运行时/离线分析用）
 * @param {string|number} peer
 * @param {number} n
 */
export function recentTurns(peer, n = 3) {
  const p = join(ROOT, 'dsh-社交平台', 'scratch', 'dm-inbox.json')
  if (!existsSync(p)) return []
  try {
    const inbox = JSON.parse(readFileSync(p, 'utf8'))
    const convs = Array.isArray(inbox) ? inbox : Object.values(inbox)
    const c = convs.find((x) => String(x.peer) === String(peer))
    if (!c) return []
    return (c.msgs || [])
      .map((m) => ({ who: m.who === 'me' ? 'me' : 'them', text: String(m.text || '').trim() }))
      .filter((m) => m.text && !m.text.startsWith('{') && m.text.length <= 60)
      .slice(-n)
  } catch {
    return []
  }
}

/** 把上下文拼成一句给模型看的说明 */
export function contextBlock(turns) {
  if (!turns || !turns.length) return ''
  return turns.map((t) => `${t.who === 'me' ? '我' : '对方'}：${t.text}`).join('\n')
}

/**
 * 判断"这句话是不是没上下文就说不清"
 * 规则：短句 + 规则判不出情绪 + 有上下文 → 标记 needContext
 */
export function needContext(text, judged, turns) {
  if (!turns || !turns.length) return false
  const short = String(text || '').trim().length <= 8
  const unclear = Math.abs(judged.valence) < 0.15 && judged.intensity < 1
  return short && unclear
}

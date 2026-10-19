// Built-in actions a profile may request by name. These are the only code a profile can run,
// and each is a step of https://git-mark.com/start.html: fund, trail, mark, announce.
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { execFileSync, spawnSync } from 'child_process'

const require = createRequire(import.meta.url)
export const GITMARK_BIN = require.resolve('gitmark/bin/git-mark.js')
const ORDER = ['fund', 'trail', 'mark', 'announce']

function gitmark(args, { cwd, dryRun, log, quiet = false }) {
  if (dryRun) { log(`  would run: git mark ${args.join(' ')}`); return '' }
  const r = spawnSync(process.execPath, [GITMARK_BIN, ...args], { cwd, encoding: 'utf8', env: process.env })
  if (r.stdout && !quiet) process.stderr.write(r.stdout.split('\n').filter(Boolean).map((l) => `  ${l}`).join('\n') + '\n')
  if (r.status !== 0) throw new Error(`git mark ${args[0] || ''} failed${r.stderr ? `: ${r.stderr.trim()}` : ''}`)
  return r.stdout
}

export const ACTIONS = {
  // Coins to the agent key from the voucher file; with no voucher file at all on a test chain, bootstrap one first.
  async fund({ pubkey, chain, cwd, dryRun, log }) {
    const fa = await import('fund-agent')
    const info = fa.chainInfo(chain)
    let v = fa.resolveVoucher(null)
    if (!v) {
      if (info.network === 'mainnet') throw new Error(`No voucher file at ${fa.DEFAULT_FAUCET} and no bootstrap on ${chain}`)
      log(`  no voucher file at ${fa.DEFAULT_FAUCET}; taking one coin from the public bootstrap address on ${chain}`)
      if (dryRun) { log('  would run: fund-agent init --bootstrap'); log('  would run: fund-agent'); return }
      fs.mkdirSync(path.dirname(fa.DEFAULT_FAUCET), { recursive: true })
      const b = await fa.bootstrap({ chain, voucherFile: fa.DEFAULT_FAUCET })
      fs.chmodSync(fa.DEFAULT_FAUCET, 0o600)
      log(`  bootstrap: ${b.amount.toLocaleString()} sats to a new voucher key, tx ${b.txid.slice(0, 16)}…`)
      v = fa.resolveVoucher(null)
    }
    if (dryRun) { log(`  would fund ${fa.INIT_AMOUNT.toLocaleString()} sats from ${v.file || 'the voucher'} to the agent key`); return }
    const { voucher } = await fa.refreshVoucher(v)
    if (!voucher.funded) throw new Error(`The voucher key has no coins yet; send some to ${voucher.address} and run again`)
    if (voucher.chain !== chain) throw new Error(`The voucher is for ${voucher.chain}, not ${chain}; pass --chain ${voucher.chain}`)
    const r = await fa.fund({ publicKey: pubkey, voucher, voucherFile: v.file })
    log(`  funded: ${r.amount.toLocaleString()} sats, tx ${r.txid.slice(0, 16)}…`)
  },
  // The trail: gitmark finds the coin at the key's address and adopts it
  async trail(ctx) { gitmark(['init', '--chain', ctx.chain], ctx) },
  // The first mark: commit what is here and mark that commit
  async mark(ctx) {
    const { cwd, dryRun, log } = ctx
    if (dryRun) { log('  would commit the generated files as "agent identity" and run: git mark'); return }
    execFileSync('git', ['add', '-A'], { cwd })
    const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd }).status === 1
    if (staged) execFileSync('git', ['-c', 'user.name=agent', '-c', 'user.email=agent@localhost', 'commit', '-qm', 'agent identity'], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'agent', GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'agent@localhost', GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'agent', GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'agent@localhost' } })
    gitmark([], ctx)
    // the mark updates blocktrails.json; commit it so the trail travels with the repo
    execFileSync('git', ['add', '-A'], { cwd })
    if (spawnSync('git', ['diff', '--cached', '--quiet'], { cwd }).status === 1) execFileSync('git', ['-c', 'user.name=agent', '-c', 'user.email=agent@localhost', 'commit', '-qm', 'trail: first mark'], { cwd })
  },
  async announce(ctx) { gitmark(['announce'], ctx) },
}

/** Run the requested actions in their fixed order, stopping at the first failure with the step named */
export async function runActions(actions, ctx) {
  const list = ORDER.filter((a) => actions.includes(a))
  for (const a of list) {
    ctx.log(`\x1b[36m${a}\x1b[0m`)
    const fn = (ctx.actions && ctx.actions[a]) || ACTIONS[a]
    try { await fn(ctx) } catch (e) { throw new Error(`step "${a}" failed: ${e.message}`) }
  }
  return list
}

export function trailInfo(ctx) {
  try { return gitmark(['info'], { ...ctx, dryRun: false, quiet: true }) } catch { return '' }
}

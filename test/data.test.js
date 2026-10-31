import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Isolate the plugin logic from the running bot and its private account data.
function setup(config = {}, send = async () => {}) {
  const source = readFileSync(new URL('../components/Data.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace('export default new Data()', 'globalThis.data = new Data()')
  const context = vm.createContext({
    Config: { SparkSet: config },
    douyinAccounts: () => ['account'],
    onlineAccounts: () => ['account'],
    fetchStickers: async () => [{ value: '续火花', uriKey: 'sticker-id' }],
    fetchFriends: async () => [{ byId: 'account', uid: 'friend', chatId: 'chat' }],
    Bot: { account: { sdk: { msg: { send } } } },
    logger: { warn() {}, error() {}, mark() {}, info() {} },
    loader: {},
  })
  vm.runInContext(source, context)
  return context.data
}

test('command-created account uses the default sticker without copying another account', async () => {
  const calls = []
  const data = setup({ account: { users: ['friend'] }, other: { sparkEmoji: ['other-sticker'] } },
    async (...args) => calls.push(args))
  const stats = await data.dailyTask()
  assert.equal(stats.ok, 1)
  assert.equal(stats.fail, 0)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].emoji, 'sticker-id')
})

test('explicitly empty stickers remain empty and report an actionable reason', async () => {
  const data = setup({ account: { users: ['friend'], sparkEmoji: [] } },
    async () => assert.fail('must not send'))
  const stats = await data.dailyTask()
  assert.equal(stats.fail, 1)
  assert.match(stats.notes[0], /锅巴面板/)
})

test('custom stickers are preserved and multiple failures count one recipient once', async () => {
  const calls = []
  const data = setup({ account: { users: ['friend'], sparkEmoji: ['custom-a', 'custom-b'] } },
    async (_, message) => { calls.push(message.emoji); throw new Error('send failed') })
  const stats = await data.dailyTask()
  assert.deepEqual(calls, ['custom-a', 'custom-b'])
  assert.equal(stats.total, 1)
  assert.equal(stats.ok, 0)
  assert.equal(stats.fail, 1)
})

test('null uses the default while blank strings and null array entries are not sent', () => {
  assert.equal(setup({ account: { sparkEmoji: null } }).emojiListOf('account')[0], '续火花')
  assert.equal(setup({ account: { sparkEmoji: [' ', null] } }).emojiListOf('account').length, 0)
})

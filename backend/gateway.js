const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')
const pino = require('express-pino-logger')()
const cors = require('cors')
const user = require('./lib')
const hyperdrive = require('hyperdrive')
const Discovery = require('hyperdiscovery')
const storage = require('./storage/dat')
const box = require('./lib/box')
const AsyncLock = require('async-lock')

var archivesLock = new AsyncLock()

// no-op auth for testing
const authGoogle = require('./auth/google')
const authTest = require('./auth/noop')

const View = require('./lib/views/gateway')

async function main () {
  let archives = {}
  let disc

  let app = express()
  var http = require('http').Server(app)
  var io = require('socket.io')(http)
  app.use(bodyParser.json())
  app.use(cors())
  app.use(pino)

  let view = new View(archives)
  await loadExistingArchives()

  let ns = io

  if (process.env.GATEWAY_SOCKET_IO_NAMESPACE) {
    ns = io.of(process.env.GATEWAY_SOCKET_IO_NAMESPACE)
  }

  let token2socket = {}

  ns.on('connection', (socket) => {
    socket.emit('hello')
    socket.on('register', async function (token) {
      if (!token) return

      console.log('registering connection from', token)
      await loadArchive(token)
      token2socket[token] = socket

      // console.log('registered', token, archives[token])
      if (archives[token]) {
        let ret = filterDMChannels(view.state.dmChannels, archives[token])
        socket.emit('dm', ret)
      }
    })
  })

  view.on('dm', (dmChannels) => {
    for (let token in token2socket) {
      let socket = token2socket[token]
      let socketArchive = archives[token]
      if (socket && socketArchive) {
        let ret = filterDMChannels(dmChannels, archives[token])
        socket.emit('dm', ret)
      } else {
        console.error('unable to find archive for socket with token:', token)
      }
    }
  })

  function filterDMChannels (dmChannels, archive) {
    let ret = {}
    for (let channelID in dmChannels) {
      try {
        let archiveKey = archive.key.toString('hex')
        if (channelID.startsWith(archiveKey) || channelID.endsWith(archiveKey)) {
          ret[channelID] = dmChannels[channelID]
        } else {
          continue
        }
      } catch (e) {
        console.error(e)
      // TODO: ignore for now
      }
    }

    return ret
  }

  function loadArchive (token) {
    return new Promise((resolve, reject) => {
      console.log('loading archive', token, archives[token] ? archives[token].key.toString('hex') : 'not found')
      archivesLock.acquire('lock', (done) => {
        if (archives[token]) {
          archives[token].ready(() => {
            return resolve(archives[token])
          })
        }
        let archive = hyperdrive(storage(`gateway/storage/${token}`, { secretDir: 'gateway/secrets' }), { latest: true })

        archive.on('ready', async () => {
          view.addArchive(token, archive)
          archives[token] = archive
          try {
            await user.init(archive)

            await user.createTopic(archive, 'general')
            await user.postToTopic(archive, 'general', { id: Date.now(), message: { type: 'action', value: 'joined the topic' } })
          } catch (e) {
            console.error(e)
          }
          if (!disc) {
            disc = Discovery(archive)
            disc.on('connection', function (peer, type) {
              console.log('gateway got connection')
              console.log('gateway connected to', disc.connections.length, 'peers')
              peer.on('close', function () {
                console.log('peer disconnected')
              })
            })
          } else {
            disc.add(archive)
          }
          archive.on('sync', () => { console.log('sync') })
          archive.on('update', () => {
            console.log('update')
            console.log(archive.metadata.listenerCount('append'))
            view.apply(archive)
          })
          archive.on('content', () => {
            console.log('content')
            view.apply(archive)
          })

          resolve(archive)
          done()
        })
      })
    })
  }

  function replicate (key) {
    let archive = hyperdrive(storage(`gateway/replicates/${key}`, { secretdir: 'gateway/secrets' }), key, { latest: true })

    if (!disc) {
      disc = Discovery(archive)
    } else {
      disc.add(archive)
    }
  }

  app.post('/login', async (req, res) => {
    let { token, name } = await authGoogle(req.body.id_token.id_token)
    let archive = await loadArchive(token)

    if (name) {
      await user.setProfile(archive, { name })
    }
    res.json({ result: { key: archive.key.toString('hex'), token } })
  })

  app.post('/test-login', async (req, res) => {
    let token = await authTest(req.body.id_token)
    let archive = await loadArchive(token)

    await user.setProfile(archive, { name: req.body.id_token })
    res.json({ result: { key: archive.key.toString('hex'), token } })
  })

  app.get('/me', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    console.log(Object.keys(archives))
    res.json({ result: { key: archive.key.toString('hex') } })
  })

  app.get('/topics', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    let ts = await user.getTopics(archive)

    res.json({ result: ts })
  })

  app.post('/topics', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.createTopic(archive, req.body.data)

    res.json({ result: 'ok' })
  })

  app.get('/topics/:id', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    let t = await user.getTopic(archive, req.params.id)

    res.json({ result: t })
  })

  app.post('/topics/:id', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.postToTopic(archive, req.params.id, req.body.data)

    res.json({ result: 'ok' })
  })

  app.get('/topics/:id/curators', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    let cs = await user.getCurators(archive, req.params.id)

    res.json({ result: cs })
  })

  app.post('/topics/:id/curators', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.addCurator(archive, req.params.id, req.body.data)

    res.json({ result: 'ok' })
  })

  app.post('/topics/:id/moderation', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.moderate(archive, req.params.id, req.body.data)

    res.json({ result: 'ok' })
  })

  app.post('/topics/:id/reactions', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.react(archive, req.params.id, req.body.data)

    res.json({ result: 'ok' })
  })

  app.get('/friends', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    let fs = await user.getFriends(archive)

    res.json({ result: fs })
  })

  app.post('/friends', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.createFriend(archive, req.body.data)

    await replicate(req.body.data.id)

    res.json({ result: 'ok' })
  })

  app.post('/dm', async (req, res) => {
    let archive = await loadArchive(req.query.token)

    let receiverPublicKey = Buffer.from(req.body.data.receiver, 'hex')
    let msg = req.body.data.message
    if (!msg.date) msg.date = Date.now()
    msg = Buffer.from(JSON.stringify(req.body.data.message))

    // console.log('sending dm', { receiver: receiverPublicKey, secretKey: archive.metadata.secretKey })

    let b = box.encrypt(archive.metadata.secretKey, receiverPublicKey, msg)

    await user.postToTopic(
      archive,
      '__gossiping',
      {
        id: Date.now(),
        nonce: b.nonce.toString('hex'),
        cipher: b.cipher.toString('hex')
      })

    res.json({ result: 'ok' })
  })

  app.get('/profile', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    let profile = await user.getProfile(archive)

    res.json({ result: profile })
  })

  app.post('/profile', async (req, res) => {
    let archive = await loadArchive(req.query.token)
    await user.setProfile(archive, req.body.data)

    res.json({ result: 'ok' })
  })

  let port = process.argv[2] || '9988'

  http.listen(port, () => { console.log(`listening ${port}`) })

  async function loadExistingArchives () {
    console.log('loading existing archives')
    try {
      let tokens = fs.readdirSync(path.resolve('./gateway/storage'))
      console.log(tokens)
      for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i]
        await loadArchive(token)
      }
      console.log('loaded')
    } catch (e) {
      // TODO: ignore for now
      console.error(e)
    }
  }
}

main()

const user = require('.')
const EventEmitter = require('events')

class View extends EventEmitter {
  constructor (state) {
    super()
    if (!state) {
      state = {
        messages: [],
        currentVersion: {},
        mods: [],
        reacts: {},
        profiles: {}
      }
    }

    this.state = state
  }

  get messages () {
    return this.state.messages
  }

  get profiles () {
    return this.state.profiles
  }

  update (archive) {
    let key = archive.key.toString('hex')
    if (!this.state.currentVersion[key]) this.state.currentVersion[key] = 0

    let diff = archive.createDiffStream(this.state.currentVersion[key])
    diff.on('data', async (d) => {
      console.log(d.name)
      if (d.value.size === 0) return // skip directories

      if (d.name.match(/^\/topics\/(.+)\/moderation\/(.+)$/)) {
        let data = await user.readFile(archive, d.name)

        let action = JSON.parse(data)
        this.state.mods.push(action)
      } else if (d.name.match(/^\/topics\/(.+)\/reactions\/(.+)$/)) {
        let data = await user.readFile(archive, d.name)

        let react = JSON.parse(data)
        if (!this.state.reacts[react.msgID]) this.state.reacts[react.msgID] = []
        react.author = archive.key.toString('hex')
        this.state.reacts[react.msgID].push(react)
      } else if (d.name.match(/^\/topics\/(.+)$/)) {
        let data = await user.readFile(archive, d.name)
        let m = JSON.parse(data)
        m.author = archive.key.toString('hex')
        this.state.messages.push(m)

        this.state.messages = this.state.messages.sort((x, y) => x.date - y.date)
      } else if (d.name.match(/^\/profile.json/)) {
        let data = await user.readFile(archive, d.name)
        let profile = JSON.parse(data)
        this.state.profiles[archive.key.toString('hex')] = profile

        this.emit('profiles', this.state.profiles)
      }

      for (let j = 0; j < this.state.mods.length; j++) {
        this.state.messages = this.state.messages.filter(m => m.id !== this.state.mods[j].id)
      }

      for (let msgID in this.state.reacts) {
        for (let i = 0; i < this.state.messages.length; i++) {
          if (`${this.state.messages[i].id}` === msgID) {
            this.state.messages[i].reactions = []
            for (let react of this.state.reacts[msgID]) {
              this.state.messages[i].reactions.push(react)
            }
            break
          }
        }
      }
      console.log('view updated')
      this.emit('update', this.state.messages)
    })

    this.state.currentVersion[key] = archive.version
  }
}

module.exports = View

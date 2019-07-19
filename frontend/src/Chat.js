import React, { Component } from 'react'
import ReactDOM from 'react-dom'
import axios from 'axios'
import socketIOClient from 'socket.io-client'
import 'emoji-mart/css/emoji-mart.css'
import { Picker as EmojiPicker } from 'emoji-mart'

import { Menu, Item, MenuProvider } from 'react-contexify'
import 'react-contexify/dist/ReactContexify.min.css'

const HUBS = [
  process.env.REACT_APP_HUB_URL
]

class Chat extends Component {
  constructor () {
    super()
    this.state = {
      currentTopic: 'tech',
      topics: [],
      friends: [],
      me: { key: '' },
      messages: {},
      hubID: 0,
      api: process.env.REACT_APP_GATEWAY_URL,
      username: 'username',
      showEmojiPicker: false,
      emojiPickerBottom: 0,
      emojiPickerData: null,
      profiles: {},
      token: window.localStorage.getItem('token')
    }

    this.messageEndRef = React.createRef()
    this.emojiPickerRef = React.createRef()
  }

  async req (method, url, data) {
    return axios({
      method,
      url: `${this.state.api}${url}`,
      params: { token: this.state.token },
      data: { data }
    })
  }

  componentDidMount () {
    this.load()
    document.addEventListener('mousedown', this.onClickOutSideEmojiPicker.bind(this))
  }

  componentWillUnmount () {
    document.removeEventListener('mousedown', this.onClickOutSideEmojiPicker.bind(this))
  }

  async updateProfile () {
    let name = window.prompt('Enter new name')

    if (name) {
      await this.req('post', '/profile', { name })

      this.setState({ username: name })
    }
  }

  onKeyPress (e) {
    if (e.key === 'Enter' && e.target.value.length > 0) {
      this.submit(e.target.value)

      e.target.value = ''
    }
  }

  onClickOutSideEmojiPicker (e) {
    if (this.emojiPickerRef.current && !ReactDOM.findDOMNode(ReactDOM.findDOMNode(this.emojiPickerRef.current)).contains(e.target)) {
      this.setState({ showEmojiPicker: false })
    }
  }

  scrollMessage () {
    if (this.messageEndRef.current) {
      this.messageEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  async submit (msg) {
    if (msg.startsWith('+')) {
      let msgs = this.state.messages[this.state.currentTopic]
      let last = msgs[msgs.length - 1]
      await this.req('post', `/topics/${this.state.currentTopic}/reactions`, { id: Date.now(), msgID: last.id, react: msg.slice(1) })
      return
    }
    await this.req('post', `/topics/${this.state.currentTopic}`, { id: Date.now(), message: msg })
    this.scrollMessage()
  }

  async load () {
    let res

    res = await this.req('get', `/topics`)
    let topics = res.data.result

    res = await this.req('get', `/friends`)
    let friends = res.data.result

    res = await this.req('get', `/me`)
    let me = res.data.result

    res = await this.req('get', `/profile`)
    let profile = res.data.result
    console.log(profile)

    this.setState({ topics, friends, me, username: profile.name }, this.connect)
  }

  async connect () {
    if (this.socket) this.socket.close()
    let hub = HUBS[this.state.hubID]

    await axios.post(`${hub}/join`, { public_key: this.state.me.key })

    let socket = socketIOClient(hub)
    this.socket = socket
    this.socket.on('update', (msgs) => {
      console.log(msgs)

      let messages = {}
      for (let i = 0; i < msgs.length; i++) {
        let m = msgs[i]
        if (!messages[m.topic]) messages[m.topic] = []
        messages[m.topic].push(m)
      }

      this.setState({ messages })
      this.scrollMessage()
    })
    this.socket.on('profiles', (profiles) => {
      console.log('profiles', profiles)
      this.setState({ profiles })
    })

    this.socket.on('event', console.log)
  }

  async createTopic () {
    let topic = window.prompt('enter a new topic')
    if (topic) {
      await this.req('post', '/topics', topic)
      let res = await this.req('get', `/topics`)
      let topics = res.data.result
      this.setState({ topics, currentTopic: topic })
    }
  }

  async newFriend () {
    let id = window.prompt('friend\'s ID')
    if (id) {
      await this.req('post', '/friends', { id })
      let res = await this.req('get', `/friends`)
      let friends = res.data.result
      this.setState({ friends })
    }
  }

  changeTopic (topic) {
    return () => {
      this.setState({ currentTopic: topic })
    }
  }

  async handleModeration ({ event, props }) {
    console.log('mod', props)
    let ret = await this.req('post', `/topics/${props.topic}/moderation`, { id: props.id, action: 'delete' })
    console.log(ret.data)
  }

  handleAddReaction ({ event, props }) {
    this.setState({ emojiPickerData: props, emojiPickerBottom: document.documentElement.clientHeight - event.clientY - 100, showEmojiPicker: true })
  }

  async handleSelectEmoji (emoji, e) {
    this.setState({ showEmojiPicker: false })
    let props = this.state.emojiPickerData
    let ret = await this.req('post', `/topics/${props.topic}/reactions`, { id: Date.now(), react: emoji.native, msgID: props.id })
    console.log(ret.data)
  }

  setHub (id) {
    return () => {
      this.setState({ hubID: id }, () => {
        this.connect()
      })
    }
  }

  render () {
    return (
      <div className='w-screen h-screen app'>
        {this.state.showEmojiPicker
          ? <EmojiPicker ref={this.emojiPickerRef} style={{ right: 0, bottom: this.state.emojiPickerBottom, position: 'absolute' }} onClick={this.handleSelectEmoji.bind(this)} />
          : ''}
        <Menu id='menu_id'>
          <Item onClick={this.handleModeration.bind(this)}>Hide</Item>
          <Item onClick={this.handleAddReaction.bind(this)}>React...</Item>
        </Menu>
        <div className='hubs bg-gray-500 pt-2'>
          {HUBS.map((h, i) => {
            return <div
              className={`rounded-full bg-gray-700 flex justify-center items-center text-white text-xl mt-2 border-box border-white ${this.state.hubID === i ? 'border-4' : ''}`}
              style={{ width: '50px', height: '50px', marginLeft: '3px' }}
              key={i}
              onClick={this.setHub(i).bind(this)}
            >
              {i}
            </div>
          })}
        </div>
        <div className='sidebar bg-gray-200' >
          <div className='flex flex-col justify-between h-full'>
            <div className='overflow-y-auto p-2'>
              <div className='mb-4'>
                <h2 className='font-bold'>P.me</h2>
                <input className='p-1 border border-gray-500 rounded font-mono text-xs w-full bg-gray-200' value={process.env.REACT_APP_GATEWAY_URL} readOnly />
              </div>
              <div className='flex flex-row justify-between'>
                <h2 className='font-bold'>Topics</h2>
                <h2 className='cursor-pointer mr-1 text-gray-600' onClick={this.createTopic.bind(this)}>+</h2>
              </div>
              <ul>
                {this.state.topics.map(t => {
                  if (t === this.state.currentTopic) {
                    return <li onClick={this.changeTopic(t).bind(this)} key={t} className='rounded bg-gray-400 cursor-pointer'>#{t}</li>
                  } else {
                    return <li onClick={this.changeTopic(t).bind(this)} key={t} className='cursor-pointer'>#{t}</li>
                  }
                })}
              </ul>
              <div className='mt-4'>
                <div className='flex flex-row justify-between'>
                  <h2 className='font-bold'>Friends</h2>
                  <h2 className='cursor-pointer mr-1 text-gray-600' onClick={this.newFriend.bind(this)}>+</h2>
                </div>
                <ul>
                  {this.state.friends.map(f => <li key={f.id}>@{this.state.profiles[f.id] ? this.state.profiles[f.id].name : f.id}</li>)}
                </ul>
                <span className='text-gray-700 underline cursor-pointer'>add new friend</span>
              </div>
            </div>
            <div className='bg-gray-100 h-20 flex flex-col justify-around px-2'>
              <div className='flex flex-row justify-between items-center'>
                <h2>@{this.state.username.slice(0, 16)}</h2>
                <h2 className='cursor-pointer mr-1 text-gray-600' onClick={this.updateProfile.bind(this)}>✎</h2>
              </div>
              <input className='bg-gray-400 px-1 border border-gray-500 w-full' value={this.state.me.key} readOnly />
            </div>
          </div>

        </div>
        <div className='message bg-red overflow-y-auto px-2' >
          <ul className='min-h-full flex flex-col justify-end'>
            {this.state.messages[this.state.currentTopic] ? this.state.messages[this.state.currentTopic].map(m => {
              return <li
                key={m.id}
                className='flex flex-col'>
                <div className='flex flex-row justify-between'>
                  <span><span className='font-bold'>{m.author ? (this.state.profiles[m.author] ? this.state.profiles[m.author].name.substring(0, 8) : m.author.substring(0, 8) + '...') : ''}</span>: {m.message}</span>
                  <MenuProvider id='menu_id' event='onClick' data={m}>
                    <span className='text-gray-500 hover:text-black cursor-pointer'>...</span>
                  </MenuProvider>
                </div>
                <div className='my-1'>
                  {m.reactions && m.reactions.length > 0 ? m.reactions.map(r => <span className='text-sm py-1 px-2 mr-1 bg-gray-200 rounded-lg w-auto' key={r.id}>{r.react}</span>) : '' }
                </div>
              </li>
            }) : ''}
          </ul>
          <div id='end' ref={this.messageEndRef} />
        </div>
        <div className='prompt bg-blue'>
          <input onKeyPress={this.onKeyPress.bind(this)} type='text' placeholder='say something...' className='border border-grey-100 w-full h-full p-2 rounded border-box' />
        </div>
      </div>
    )
  }
}

export default Chat

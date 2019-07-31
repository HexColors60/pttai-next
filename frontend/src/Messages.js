import React, { Component } from 'react'
import { MenuProvider } from 'react-contexify'
import Reactions from './Reactions'
import Linkify from 'react-linkify'
import nameColors from './name_colors'

import moment from 'moment'

class Messages extends Component {
  onNewFriend (id) {
    return () => {
      this.props.onNewFriend(id)
    }
  }

  id2color (id) {
    let n = parseInt(id, 16)
    return nameColors[n % nameColors.length]
  }

  render () {
    console.log('rendering messages', this.props.messages)
    return <ul className='min-h-full flex flex-col justify-end'>
      {this.props.messages.length > 0 ? <div className='h-48' /> : ''}
      {this.props.messages.map(m => {
        if (m.message.type === 'text') {
          return <li
            key={m.id}
            className='flex flex-col hover:bg-gray-100'>
            <div className='flex flex-row justify-between'>
              <span className='break-all'>
                <span className='text-gray-600 inline-block mr-4'>{moment(m.date).format('HH:mm')}</span>
                <span className={`font-bold cursor-pointer hover:underline ${this.id2color(m.author)}`} onClick={this.onNewFriend(m.author)}>
                  {m.author ? (this.props.profiles[m.author] ? this.props.profiles[m.author].name.substring(0, 16) : m.author.substring(0, 16) + '...') : ''}
                </span>
                : <Linkify properties={{ target: '_blank', className: 'text-blue-600 underline' }}>{m.message.value}</Linkify>
              </span>
              {this.props.allowReact ? <MenuProvider id='menu_id' event='onClick' data={m}>
                <span className='text-gray-500 hover:text-black cursor-pointer'>...</span>
              </MenuProvider> : ''}
            </div>
            { m.reactions && m.reactions.length > 0
              ? <div className='my-1 mb-3 ml-16'>
                <Reactions myKey={this.props.myKey} reactions={m.reactions} onAddReaction={this.props.onAddReaction} message={m} />
              </div>
              : <div className='my-1' />}
          </li>
        } else if (m.message.type === 'action') {
          return <li
            key={m.id}
            className='message flex flex-col hover:bg-gray-100'>
            <div className='flex flex-row justify-between'>
              <span className='text-gray-500'>
                <span className='text-gray-600 inline-block mr-4'>{moment(m.date).format('HH:mm')}</span>
                <span className='font-bold cursor-pointer hover:underline italic' onClick={this.onNewFriend(m.author)}>
                  {m.author ? (this.props.profiles[m.author] ? this.props.profiles[m.author].name.substring(0, 16) : m.author.substring(0, 16) + '...') : ''}
                </span>
                <Linkify properties={{ target: '_blank', className: 'text-blue-400 underline' }}>{` ${m.message.value}`}</Linkify>
              </span>
              {this.props.allowReact ? <MenuProvider id='menu_id' event='onClick' data={m}>
                <span className='text-gray-500 hover:text-black cursor-pointer'>...</span>
              </MenuProvider> : ''}
            </div>
            { m.reactions && m.reactions.length > 0
              ? <div className='my-1 mb-3 ml-16'>
                <Reactions myKey={this.props.myKey} reactions={m.reactions} onAddReaction={this.props.onAddReaction} message={m} />
              </div>
              : <div className='my-1' />}
          </li>
        }
        return ''
      })}
    </ul>
  }
}

export default Messages

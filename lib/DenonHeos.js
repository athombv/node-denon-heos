'use strict';

const { EventEmitter } = require('events');
const { Socket } = require('net');
const querystring = require('querystring');

const PORT = 1255;
const TELNET_PORT = 23;
const DELIMITER = '\r\n';
const TELNET_DELIMITER = '\r';
const WATCHDOG_INTERVAL = 10000;
const SEND_TIMEOUT = 5000;

class DenonHeos extends EventEmitter {

  constructor({ address }) {
    super();

    this.address = address;

    this._debug = process.env.HEOS_DEBUG === '1';

    this._state = 'disconnected';
    this._sendQueue = [];
    this._currentSendQueueItem = undefined;
    this._rxBuffer = '';
    this._telnetBuffer = '';
  }

  debug(...props) {
    if(!this._debug) return;
    console.log('[Debug]', `[${new Date()}]`, ...props);
  }

  setAddress( address ) {
    if( address !== this.address ) {
      this.address = address;
      this.debug(`Address changed from ${this.address} to ${address}`);
    }
  }

  async connect() {
    this.debug('connect()');

    return this._connect();
  }

  async _connect() {
    this.debug('_connect()');

    if( this._state === 'connected' )
      return;

    if( this._state === 'connecting' )
      return this._connectPromise;

    if( this._state === 'disconnecting' ) {
      try {
        await this._disconnectPromise;
        await new Promise(resolve => process.nextTick(resolve));
      } catch( err ) {}
    }

    this._connectPromise = new Promise((resolve, reject) => {
      this._setState('connecting');

      this._socket = new Socket();
      this._socket
        //.setKeepAlive(true)
        //.setTimeout(5000)
        .on('error', err => {
          this.debug('Socket Error', err);
          reject(err);
        })
        .on('timeout', () => {
          this.debug('Socket onTimeout');
          this._socket.end();
          reject( new Error('Socket timeout') );
        })
        .on('end', () => {
          this.debug('Socket onEnd');
        })
        .on('close', () => {
          this.debug('Socket onClose');

          this._socket.removeAllListeners();
          this._socket.destroy();
          this._socket = null;
          this._connectPromise = null;
          this._setState('disconnected');
          reject(new Error('Closed'));
        })
        .on('data', ( chunk ) => {
          this._rxBuffer += chunk;
          this._parseRxBuffer();
        })
        .connect( PORT, this.address, () => {
          this.debug('Socket onConnect Callback');

          this.systemRegisterForChangeEvents()
            .then(() => {
              this.debug('Socket connected');
              this._connectPromise = null;
              this._setState('connected');

              if(!this._watchdog)
                this._watchdog = setInterval(this._onWatchdog.bind(this), WATCHDOG_INTERVAL);

              resolve();
            }).catch(err => {
              this.debug('Socket connect error', err);
              this._connectPromise = null;
              this._disconnect();
            })
        });
    });

    return this._connectPromise;
  }

  async disconnect() {
    this.debug('disconnect()');

    if( this._watchdog )
      clearInterval(this._watchdog);

    return this._disconnect();
  }

  async _disconnect() {
    this.debug('_disconnect()');

    if( this._state === 'disconnected' )
      return;

    if( this._state === 'disconnecting' )
      return this._disconnectPromise;

    if( this._state === 'connecting' ) {
      try {
        await this._connectPromise;
      } catch( err ) {}
    }

    this._setState('disconnecting');

    this._disconnectPromise = new Promise((resolve, reject) => {
      this._socket.once('close', () => {
        resolve();
      });
      this._socket.end();
    });

    return this._disconnectPromise;
  }

  async reconnect() {
    this.debug('reconnect()');

    if( this._reconnectPromise )
      return this._reconnectPromise;

    this._reconnectPromise = Promise.resolve().then(() => {
      this.emit('reconnecting');
      return this._disconnect()
        .catch(err => {
          console.error('Disconnect error:', err);
        })
        .then(() => {
          return this._connect();
        })
        .then(() => {
          this.emit('reconnected');
          this._reconnectPromise = null;
        })
        .catch(err => {
          this.emit('reconnect_error', err);
          this._reconnectPromise = null;
          throw err;
        })
    });

    return this._reconnectPromise;
  }

  _setState(state) {
    this._state = state;
    this.emit(state);
    this.emit('state', state);
  }

  _onWatchdog() {
    if( this._watchdogPromise )
      return;

    if( this._state === 'connecting' )
      return;

    if( this._state === 'disconnecting' )
      return;

    this.debug('Watchdog testing connection');

    this._watchdogPromise = this.playerGetPlayers().then(()=> {
      this.debug('Watchdog OK');
      this._watchdogPromise = null;
    }).catch(err => {
      this.debug('Watchdog error', err);
      this.reconnect().then(() => {
        this.debug('Watchdog reconnected');
        this._watchdogPromise = null;
      }).catch(err => {
        this.debug('Watchdog reconnect error', err);
        this._watchdogPromise = null;
      });
    });
  }

  _nextSendQueueItem() {
    if( this._currentSendQueueItem ) return;

    this._currentSendQueueItem = this._sendQueue.shift();
    if( !this._currentSendQueueItem ) return;

    const {
      qs,
      command,
      reject,
    } = this._currentSendQueueItem;

    try {
      this._write({ command, qs });
    } catch( err ) {
      reject(err);
      this._nextSendQueueItem();
    }
  }

  _parseRxBuffer() {
    let rxBufferArr = this._rxBuffer.split( DELIMITER );
    if( rxBufferArr.length > 1 ) {
      let rxBufferItem = rxBufferArr.shift();
      this._rxBuffer = rxBufferArr.join( DELIMITER );

      let response = JSON.parse( rxBufferItem );
      response = this._responseParser( response );

      /*
       * Some commands need to wait for real results,
       * before this a "command under process" is send
       * we can just simply ignore this message, and continue
       */
      if( response.message['command under process'] !== undefined )
        return this._parseRxBuffer();

      if( response.command && response.command.startsWith('event/') ) {
        let event = response.command.replace('event/', '');
        this.emit('event', {
          event,
          message: response.message,
        });
        this.emit( event, response.message );
      } else {
        if( this._currentSendQueueItem ) {
          const {
            resolve,
            reject,
          } = this._currentSendQueueItem;

          if( response instanceof Error )
            return reject(response);
          return resolve(response);
        }
      }

      this._parseRxBuffer();

    }
  }

  _responseParser({
      heos,
      payload = null,
    }) {
    if( heos ) {
      const {
        result = null,
        command = null,
        message = '',
      } = heos;

      const parsedMessage = querystring.parse(message);
      if( result === 'fail' ) {
        return new Error(parsedMessage.text || 'Unknown Heos Error');
      }

      return {
        payload,
        command,
        message: parsedMessage,
      };
    }

    return new Error('Unknown Heos Response');

  }

  _write({ command, qs }) {
    this.debug('_write()', { command, qs });

    if( !this._socket )
      throw new Error('not_connected');

    const data = `heos://${command}?`
      + querystring.unescape(querystring.stringify(qs))
      + DELIMITER;

    this._socket.write(data);
  }

  /*
    API commands
  */

  async send( command, qs = {} ) {
    this.debug('send()', { command, qs });

    const sendQueueItem = {}
    sendQueueItem.command = command;
    sendQueueItem.qs = qs;

    return Promise.race([
      new Promise((resolve, reject) => {
        sendQueueItem.resolve = resolve;
        sendQueueItem.reject = reject;

        this._sendQueue.push( sendQueueItem );
        this._nextSendQueueItem();
      }),
      new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Send Timeout'));
        }, SEND_TIMEOUT);
      }),
    ]).then(result => {
      this._currentSendQueueItem = null;
      this._nextSendQueueItem();
      return result;
    }).catch(err => {
      this._currentSendQueueItem = null;
      this._nextSendQueueItem();
      throw err;
    });
  }

  /*
    System commands
  */

  async systemRegisterForChangeEvents({ enabled = true } = {}) {
    return this.send(`system/register_for_change_events`, {
      enable: ( enabled === true ) ? 'on' : 'off'
    });
  }

  async systemSignIn({ username, password }) {
    return this.send('system/sign_in', {
      un: username,
      pw: password,
    }).then(result => result.message);
  }

  async systemSignOut() {
    return this.send('system/sign_out').then(result => result.message);
  }

  async systemCheckAccount() {
    return this.send('system/check_account').then(result => result.message);
  }

  async systemReboot() {
    return this.send('system/reboot').then(result => result.result);
  }

  /*
    Player commands
  */

  async playerGetPlayers() {
    const players = this.send(`player/get_players`, {}).then(result => result.payload);

    if( players )
      return players;

    // Try again
    return this.send(`player/get_players`, {}).then(result => result.payload);
  }

  async playerGetPlayerInfo({ pid }) {
    return this.send(`player/get_player_info`, {
      pid,
    }).then(result => result.payload);
  }

  async playerGetPlayState({ pid }) {
    return this.send(`player/get_play_state`, {
      pid,
    }).then(result => result.message);
  }

  async playerSetPlayState({ pid, state }) {
    return this.send(`player/set_play_state`, {
      pid,
      state,
    });
  }

  async playerGetNowPlayingMedia({ pid }) {
    return this.send(`player/get_now_playing_media`, {
      pid,
    }).then(result => result.payload);
  }

  async playerGetVolume({ pid }) {
    return this.send(`player/get_volume`, {
      pid,
    }).then(result => result.message);
  }

  async playerSetVolume({ pid, level }) {
    return this.send(`player/set_volume`, {
      pid,
      level: String(level), // 0 - 100
    }).then(result => result.message);
  }

  async playerSetVolumeUp({ pid, step }) {
    return this.send(`player/volume_up`, {
      pid,
      step: String(step), // 0 - 10, default: 5
    }).then(result => result.message);
  }

  async playerSetVolumeDown({ pid, step }) {
    return this.send(`player/volume_down`, {
      pid,
      step: String(step), // 0 - 10, default: 5
    }).then(result => result.message);
  }

  async playerGetMute({ pid }) {
    return this.send(`player/get_mute`, {
      pid,
    }).then(result => result.message);
  }

  async playerSetMute({ pid, muted }) {
    return this.send(`player/set_mute`, {
      pid,
      state: ( muted === true ) ? 'on' : 'off'
    }).then(result => result.message);;
  }

  async playerPlayNext({ pid }) {
    await this.send(`player/play_next`, {
      pid,
    });
  }

  async playerPlayPrevious({ pid }) {
    await this.send(`player/play_previous`, {
      pid,
    });
  }

  async playerPlayPreset({ pid, preset }) {
    await this.send(`player/play_preset`, {
      pid,
      preset,
    });
  }

  async playerGetPlayMode({ pid }) {
    return this.send(`player/get_play_mode`, {
      pid,
    }).then(result => result.message);
  }

  async playerSetPlayMode({ pid, shuffle, repeat }) {
    return this.send(`player/set_play_mode`, {
      pid,
      shuffle: ( shuffle === true ) ? 'on' : 'off',
      repeat, // on_all, on_one, off
    }).then(result => result.message);
  }

  async playerClearQueue({ pid }) {
    return this.send(`player/clear_queue`, {
      pid,
    }).then(result => result.message);
  }

  async playerSetQuickSelect({ pid, id }) {
    return this.send(`player/set_quickselect`, {
      pid,
      id, // 1 - 6
    }).then(result => result.message);
  }

  async playerPlayQuickSelect({ pid, id }) {
    return this.send(`player/play_quickselect`, {
      pid,
      id, // 1 - 6
    }).then(result => result.message);
  }

  async playerGetQuickSelects({ pid }) {
    return this.send(`player/get_quickselects`, {
      pid,
    }).then(result => result.payload);
  }

  /*
    Group commands
  */

  async groupGetGroups() {
    return this.send(`group/get_groups`).then(result => result.payload);
  }

  async groupGetGroupInfo({ gid }) {
    return this.send(`group/get_group_info`, {
      gid,
    }).then(result => result.payload);
  }

  async groupSetGroups( pid ) {
    if( !Array.isArray(pid) ) return 'PIDs should be in an array'
    return this.send(`group/set_group`, {
      pid: pid.join(','),
    }).then(result => result.message);
  }

  async groupGetVolume({ pid }) {
    return this.send(`group/get_volume`, {
      pid,
    }).then(result => result.message);
  }

  async groupSetVolume({ pid, level }) {
    return this.send(`group/set_volume`, {
      pid,
      level: String(level), // 0 - 100
    }).then(result => result.message);
  }

  async groupSetVolumeUp({ pid, step }) {
    return this.send(`group/volume_up`, {
      pid,
      step: String(step), // 0 - 10, default: 5
    }).then(result => result.message);
  }

  async groupSetVolumeDown({ pid, step }) {
    return this.send(`group/volume_down`, {
      pid,
      step: String(step), // 0 - 10, default: 5
    }).then(result => result.message);
  }

  async groupGetMute({ pid }) {
    return this.send(`group/get_mute`, {
      pid,
    }).then(result => result.message);
  }

  async groupSetMute({ pid, muted }) {
    return this.send(`group/set_mute`, {
      pid,
      state: ( muted === true ) ? 'on' : 'off',
    }).then(result => result.message);;
  }

  /*
    Browse commands
  */

  async browseLocalMedia() {
    return this.send(`browse/browse`, { sid: 1024 }).then(result => result.payload);
  }

  async browsePlaylists() {
    return this.send(`browse/browse`, { sid: 1025 }).then(result => result.payload);
  }

  async browseHistory() {
    return this.send(`browse/browse`, { sid: 1026 }).then(result => result.payload);
  }

  async browseAuxSID() {
    return this.send(`browse/browse`, { sid: 1027 }).then(result => result.payload);
  }

  async browseInput( sid ) {
    return this.send(`browse/browse`, { sid: sid }).then(result => result.payload);
  }

  async browseFavorite() {
    return this.send(`browse/browse`, { sid: 1028 }).then(result => result.payload);
  }

  async browseGetMusicSources() {
    return this.send(`browse/get_music_sources`, {

    }).then(result => result.payload);
  }

  async browsePlayStream({ pid, sid, mid, spid, input }) {
    return this.send(`browse/play_stream`, {
      pid,
      sid,
      mid,
      spid,
      input,
    });
  }

  async browsePlayInput({ pid, input }) {
    return this.send(`browse/play_input`, {
      pid,
      input,
    });
  }

  async browsePlayAuxIn1({ pid }) {
    return this.browsePlayInput({
      pid,
      input: 'inputs/aux_in_1',
    });
  }

  async browsePlayURL({ pid, url }) {
    return this.send(`browse/play_stream`, {
      pid,
      url,
    });
  }

  // TODO

  /*
   * Telnet for AVR controls
   */

  async connectTelnet() {
    return new Promise((resolve, reject) => {
      this._socketTelnet = new Socket();

      this._socketTelnet
        .setTimeout(3000)
        .once('connect', () => {
          resolve('Telnet connected');
        })
        .on('timeout', () => {
          this.debug('Telnet socket onTimeout');
          this._socketTelnet.end();

          reject( new Error('Telnet socket timeout') );
        })
        .on('error', err => {
          this.debug('Telnet socket Error', err);
          reject(err);
        })
        .on('end', () => {
          this.debug('Telnet socket onEnd');
        })
        .on('close', () => {
          this.debug('Telnet socket onClose');

          this._socketTelnet.destroy();
          this._socketTelnet = null;

          reject(new Error('Telnet closed'));
        })
        .on('data', ( data ) => {
          this._telnetBuffer += data;
          this._parseTelnetData();
        })
        .connect( TELNET_PORT , this.address );
    });
  }

  _parseTelnetData() {
    const telnetBufferArr = this._telnetBuffer.split( TELNET_DELIMITER );
    if( telnetBufferArr.length > 1 ) {
      const telnetBufferItem = telnetBufferArr.shift();
      this._telnetBuffer = telnetBufferArr.join( TELNET_DELIMITER );

      if( telnetBufferItem === 'PWSTANDBY' ) this.emit( 'avr_state' , false);
      if( telnetBufferItem === 'PWON' ) this.emit( 'avr_state' , true);
    }
  }

  _writeTelnet( command ) {
    return new Promise((resolve, reject) => {
      if( this._socketTelnet ) {
        this._socketTelnet.once('data', result => {
          if( result ) {
            resolve(result.toString().replace(TELNET_DELIMITER, ''));
          } else {
            reject(new Error('No result'));
          }
        })
        this._socketTelnet.once('error', err => {
          reject(err);
        })
        setTimeout(() => {
          resolve('OK')
        }, 200);
        this._socketTelnet.write(command + TELNET_DELIMITER);
      } else {
        reject(new Error('Not connected'));
      }
    });
  }

  async getAvrState() {
    const state = await this._writeTelnet('PW?');
    return state.includes('PWON');
  }

  async setAvrState( state ) {
    if( state === true ) {
      const setState = await this._writeTelnet('PWON');
      if( setState ) {
        // Also set the AVR to HEOS input
        return await this.setAvrInput('SINET');
      } else {
        return 'Failed to turn on';
      }
    } else {
      return await this._writeTelnet('PWSTANDBY');
    }
  }

  async getAvrInput() {
    return await this._writeTelnet('SI?');
  }

  async setAvrInput( input ) {
    return await this._writeTelnet(input);
  }
}

module.exports = DenonHeos;

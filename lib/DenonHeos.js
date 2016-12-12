'use strict';

const events = require('events');
const net = require('net');
const querystring = require('querystring');

const PORT = 1255;
const DELIMITER = '\r\n';

class DenonHeos extends events.EventEmitter {

	constructor( address ) {
		super();

		this.address = address;

		this._sendQueue = [];
		this._currentSendQueueItem = undefined;
		this._rxBuffer = '';

	}

	send( command, qs, callback ) {

		if( typeof qs === 'function' ) {
			callback = qs;
			qs = {};
		}

		let sendQueueItem = {}
			sendQueueItem.command = `${command}?` + querystring.stringify( qs );

		if( typeof callback === 'function' ) {
			sendQueueItem.callback = ( err, result ) => {
				this._currentSendQueueItem = undefined;
				process.nextTick(() => {
					callback( err, result );
				});
				this._nextSendQueueItem();
			}
		}

		this._sendQueue.push( sendQueueItem );

		this._nextSendQueueItem();
	}

	_nextSendQueueItem() {

		if( typeof this._currentSendQueueItem !== 'undefined' )
			return;

		this._currentSendQueueItem = this._sendQueue.shift();
		if( this._currentSendQueueItem ) {
			let writeResult = this._write( this._currentSendQueueItem.command );

			let cb = this._currentSendQueueItem.callback;

			// if no callback, proceed
			if( typeof cb !== 'function' ) {
				return this._nextSendQueueItem();
			}

			// if could not write, send callback
			if( writeResult instanceof Error )
				return cb.call( cb, writeResult );

			// wait for response
			this.once('_response', ( data ) => {

				try {
					data = JSON.parse(data);
				} catch( err ) {
					return cb.call( cb, err );
				}

				if( !data.heos)
					return cb.call( cb, new Error('invalid_response') );

				if( data.heos.result !== 'success' )
					return cb.call( cb, new Error( data.heos.message || 'unknown_error') );

				return cb.call( cb, null, this._responseParser( data ));
			});
		}

	}

	_responseParser( data ) {
		return {
			payload: data.payload,
			command: data.heos.command,
			message: querystring.parse(data.heos.message)
		}
	}

	_write( command ) {

		if( !this._socket )
			return new Error('not_connected');

		this._socket.write(`heos://${command}` + '\r\n');
	}

	connect( callback ) {
		callback = callback || function(){}

		this._socket = net.connect( PORT, this.address );

		this._socket
			.once('connect', () => {
				this.systemRegisterForChangeEvents( true, ( err ) => {
					if( err ) return callback( err );
					callback();
				});
			})
			.once('timeout', () => {
				callback( new Error('timeout') );
			})
			.once('end', () => {
				this.emit('_end');
			})
			.on('data', ( chunk ) => {

				this._rxBuffer += chunk;
				if( this._rxBuffer.indexOf( DELIMITER ) > -1 ) {
					let rxBufferArr = this._rxBuffer.split( DELIMITER );
					this._rxBuffer = rxBufferArr[1];

					if( typeof this._currentSendQueueItem !== 'undefined'
					 && typeof this._currentSendQueueItem.callback === 'function' ) {
				 		this.emit('_response', rxBufferArr[0]);
					} else {

						try {
							let data = JSON.parse( rxBufferArr[0] );
								data = this._responseParser( data );
							this.emit('event', data);

							let event = data.command.replace('event/', '');
							this.emit( event, data.message );
						} catch( err ) {}
					}
				}
			});

		return this;

	}

	disconnect( callback ) {
		callback = callback || function(){}

		if( !this._socket )
			return callback( new Error('not_connected') );

		this.once('_end', callback);

		this._socket.end();

		return this;

	}

	/*
		API commands below
	*/

	/*
		System commands
	*/
	systemRegisterForChangeEvents( enabled, callback ) {
		return this.send(`system/register_for_change_events`, {
			enable: ( enabled === true ) ? 'on' : 'off'
		}, callback);
	}
	/*
		Player commands
	*/
	playerGetPlayers( callback ) {
		return this.send(`player/get_players`, callback);
	}

	playerGetPlayerInfo( playerId, callback ) {
		return this.send(`player/get_player_info`, {
			pid: playerId
		}, callback);
	}

	playerGetPlayState( playerId, callback ) {
		return this.send(`player/get_play_state`, {
			pid: playerId
		}, callback);
	}

	playerSetPlayState( playerId, playState, callback ) {
		return this.send(`player/set_play_state`, {
			pid: playerId,
			state: playState
		}, callback);
	}

	playerGetNowPlayingMedia( playerId, callback ) {
		return this.send(`player/get_now_playing_media`, {
			pid: playerId
		}, callback);
	}

	playerGetVolume( playerId, callback ) {
		return this.send(`player/get_volume`, {
			pid: playerId
		}, callback);
	}

	playerSetVolume( playerId, level, callback ) {
		return this.send(`player/set_volume`, {
			pid: playerId,
			level: level // 0 - 100
		}, callback);
	}

	playerGetMute( playerId, callback ) {
		return this.send(`player/get_mute`, {
			pid: playerId
		}, callback);
	}

	playerSetMute( playerId, muted, callback ) {
		return this.send(`player/set_mute`, {
			pid: playerId,
			state: ( muted === true ) ? 'on' : 'off'
		}, callback);
	}

	playerToggleMute( playerId, callback ) {
		return this.send(`player/set_mute`, {
			pid: playerId
		}, callback);
	}

	playerPlayNext( playerId, callback ) {
		return this.send(`player/play_next`, {
			pid: playerId
		}, callback);
	}

	playerPlayPrevious( playerId, callback ) {
		return this.send(`player/play_previous`, {
			pid: playerId
		}, callback);
	}

	/*
		Group commands
	*/

	/*
		Browse commands
	*/

}

module.exports = DenonHeos;
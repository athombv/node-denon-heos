'use strict';

const events = require('events');
const net = require('net');

const PORT = 1255;
const DELIMITER = '\r\n';
const URN = 'urn:schemas-denon-com:device:ACT-Denon:1';

class DenonHeos extends events.EventEmitter {

	constructor( address ) {
		super();

		this.address = address;

		this._sendQueue = [];
		this._currentSendQueueItem = undefined;
		this._rxBuffer = '';

	}

	send( command, callback ) {

		this._sendQueue.push({
			command		: command,
			callback	: callback
		});

		this._nextSendQueueItem();
	}

	_nextSendQueueItem() {

		this._currentSendQueueItem = this._sendQueue.shift();
		if( this._currentSendQueueItem ) {
			let writeResult = this._write( this._currentSendQueueItem.command );

			if( typeof this._currentSendQueueItem.callback === 'function' ) {

				if( writeResult instanceof Error ) {
					this._currentSendQueueItem.callback.call( this._currentSendQueueItem.callback, writeResult );
					return this._nextSendQueueItem();
				}

				this.once('_response', ( data ) => {

					try {
						data = JSON.parse(data);

						if( !data.heos)
							return this._currentSendQueueItem.callback.call( this._currentSendQueueItem.callback, new Error('invalid_response') );

						if( data.heos.result !== 'success' )
							return this._currentSendQueueItem.callback.call( this._currentSendQueueItem.callback, new Error( data.heos.message || 'unknown_error') );

						return this._currentSendQueueItem.callback.call( this._currentSendQueueItem.callback, null, data.payload );

					} catch( err ) {
						this._currentSendQueueItem.callback.call( this._currentSendQueueItem.callback, err );
					}

					return this._nextSendQueueItem();
				});
			} else {
				return this._nextSendQueueItem();
			}
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
				callback();
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
					}
				}
			});

	}

	disconnect( callback ) {
		callback = callback || function(){}

		if( !this._socket )
			return callback( new Error('not_connected') );

		this.once('_end', callback);

		this._socket.end();

	}

	getState() {

	}

	playUrl() {

	}

}

module.exports = DenonHeos;
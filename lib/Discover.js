'use strict';

const events 	= require('events');
const dgram 	= require('dgram');
const http		= require('http');

const SSDP 		= require('node-ssdp-lite');
const DenonHeos	= require('..').DenonHeos;

const URN = 'urn:schemas-denon-com:device:ACT-Denon:1';

class Discover extends events.EventEmitter {

	constructor() {
		super();

		this._onResponse = this._onResponse.bind(this);

		this._foundDevices = [];
	}

	_onResponse( msg, rinfo ) {

		if( this._foundDevices.indexOf( rinfo.address ) === -1 ) {
			this._foundDevices.push( rinfo.address );

			let msgObj = this._msgToObject( msg );

			http.get( msgObj['location'], response => {

				let body = '';
		        response.on('data', d => {
		            body += d;
		        });
		        response.on('end', () => {

			        let manufacturer = matchBetweenTags('manufacturer', body);
			        if( manufacturer !== 'Denon' ) return;

			        let friendlyName = matchBetweenTags('friendlyName', body);
			        if( friendlyName ) {
				        friendlyName = friendlyName.replace('ACT-', '');
					}

					this.emit('device', {
						friendlyName	: friendlyName,
						modelName		: matchBetweenTags('modelName', body),
						modelNumber		: matchBetweenTags('modelNumber', body),
						deviceId		: matchBetweenTags('DeviceID', body),
						wlanMac			: matchBetweenTags('wlanMac', body),
						address			: rinfo.address,
						instance		: new DenonHeos( rinfo.address )
					});
		        });
		    });
		}
	}

	_msgToObject( msg ) {

		let msgObj = {};
		let msgArr = msg.split('\n');

		msgArr.forEach( msgArrItem => {
			msgArrItem = msgArrItem.split(':');
			msgArrItem = [msgArrItem.shift(), msgArrItem.join(':')]
			if( msgArrItem.length !== 2 ) return;

			msgObj[ msgArrItem[0].trim().toLowerCase() ] = msgArrItem[1].trim();
		});

		return msgObj;

	}

	start() {

	    this._client = new SSDP();
		this._client.on('response', this._onResponse);
		this._client.search( URN );

	}

	stop() {
	}

}

module.exports = Discover;

function matchBetweenTags( tagName, input ) {

	let re = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`)

    let result = input.match( re );
    if( result && typeof result[1] === 'string' ) return result[1];
    return undefined;

}
'use strict';

const DenonHeos = require('..').DenonHeos;

const address = process.argv[2] || 'emile-heos.local';

var speaker = new DenonHeos( address );
	speaker.connect(( err ) => {
		if( err ) return console.error( err );

		console.log('Connected!');

		speaker.send('player/get_players', ( err, result ) => {
			console.log('data', err, result);

			speaker.disconnect(( err ) => {
				if( err ) return console.error( err );

				console.log('Disconnected!');
			})
		})
	})
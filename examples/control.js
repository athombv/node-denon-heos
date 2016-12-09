'use strict';

const DenonHeos = require('..').DenonHeos;

const address = process.argv[2] || 'emile-heos.local';

let speaker = new DenonHeos( address )
speaker
	.connect(( err ) => {
		if( err ) return console.error( err );

		console.log('Connected!');

		// get all players
		speaker.playerGetPlayers( ( err, result ) => {
			if( err ) return console.error( 'playerGetPlayers', err );

			console.log('playerGetPlayers', result);

			if( result.length < 1 )
				return console.error('no players found');

			var player = result.payload[0];

			// get state
			speaker.playerGetNowPlayingMedia( player.pid, ( err, result ) => {
				if( err ) return console.trace( 'playerGetPlayState err', err );

				console.log('playerGetPlayState', result);

				// start playing
				speaker.playerSetPlayState( player.pid, 'play', ( err, result ) => {
					if( err ) return console.error( 'playerSetPlayState err', err );

					console.log('playerSetPlayState', result);

					// pause after 1s
					setTimeout(() => {
						speaker.playerSetPlayState( player.pid, 'pause', ( err, result ) => {
							if( err ) return console.error( 'playerSetPlayState err', err );

							console.log('playerSetPlayState', result);

							// disconnect
							setTimeout(() => {
								speaker.disconnect(( err ) => {
									if( err ) return console.error( err );

									console.log('Disconnected!');
								})
							}, 5000);

						});
					}, 1000);

				});

			})
		})
	})
	.on('event', ( data ) => {
		console.log('onEvent', data )
	})
	.on('player_state_changed', ( message ) => {
		console.log('onPlayerStateChanged', message);
	})
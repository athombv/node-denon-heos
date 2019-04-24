'use strict';

const {
  Discover,
  DenonHeos,
} = require('..');

const name = process.argv[2] || 'Heos 1';
console.log('Trying to find a device named:', name);

const discover = new Discover();
discover.on('device', ( device ) => {
  if( device.friendlyName === name ) {
    console.log(`Found ${name} @ ${device.address}`);
    onSpeaker(device.instance).catch(console.error);
  }
});
discover.start();

async function onSpeaker( speaker ) {
	
	speaker.on('state', state => {
  	console.log('State:', state);
	})
	speaker.on('event', data => {
  	console.log('Event:', data);
	});
	speaker.on('connecting', () => {
  	console.log('Connecting...');
	})
  speaker.on('disconnect', () => {
  	console.log('Disconnected');
	});
  speaker.on('disconnecting', () => {
  	console.log('Disconnecting...');
	});
  speaker.on('reconnecting', () => {
  	console.log('Reconnecting...');
	});
  speaker.on('reconnected', () => {
  	console.log('Reconnected', speaker.address);
	});
	
  await speaker.connect();
	
	const players = await speaker.playerGetPlayers();
	console.log('playerGetPlayers', players);
	
	if( players.length < 1 )
     throw new Error('No players found');
    
    const player = players.find(player => {
      return player.name === name;
    });
    if(!player)
     throw new Error('Player Not Found');
    
    const { pid } = player;
    
    speaker.on('player_now_playing_changed', () => {
      speaker.playerGetNowPlayingMedia({ pid })
        .then(console.log)
        .catch(console.error);
    })
    
    const playerGetPlayerInfo = await speaker.playerGetPlayerInfo({ pid });
    console.log('playerGetPlayerInfo', playerGetPlayerInfo);
    
    const playerGetPlayState = await speaker.playerGetPlayState({ pid });
    console.log('playerGetPlayState', playerGetPlayState);
    
    const playerGetNowPlayingMedia = await speaker.playerGetNowPlayingMedia({ pid });
    console.log('playerGetNowPlayingMedia', playerGetNowPlayingMedia);
    
    const playerGetVolume = await speaker.playerGetVolume({ pid });
    console.log('playerGetVolume', playerGetVolume);
    
    const playerSetVolume = await speaker.playerSetVolume({
     pid,
     level: parseInt(playerGetVolume.level),
   });
    console.log('playerSetVolume', playerSetVolume);
    
    const playerGetMute = await speaker.playerGetMute({ pid });
    console.log('playerGetMute', playerGetMute);
    
    const playerSetMute = await speaker.playerSetMute({ pid, mute: true });
    console.log('playerSetMute', playerSetMute);
    
    const playerGetPlayMode = await speaker.playerGetPlayMode({ pid });
    console.log('playerGetPlayMode', playerGetPlayMode);
    
    const playerSetPlayMode = await speaker.playerSetPlayMode({
      pid,
      shuffle: true,
    });
    console.log('playerSetPlayMode', playerSetPlayMode);
    
    const browseGetMusicSources = await speaker.browseGetMusicSources();
    console.log('browseGetMusicSources', browseGetMusicSources);
    
    const auxIn = browseGetMusicSources.find(source => {
      return source.name === 'AUX Input';
    });
    
    if( auxIn ) {    
      const browsePlayAuxIn1 = await speaker.browsePlayAuxIn1({ pid });
      console.log('browsePlayAuxIn1', browsePlayAuxIn1);
    }
    
    if( false ) {
      await wait(5000);
      await speaker.disconnect();
      
      await wait(5000);
      await speaker.connect();
      
      const playerGetPlayerInfo2 = await speaker.playerGetPlayerInfo({ pid });
      console.log('playerGetPlayerInfo2', playerGetPlayerInfo2);
    }
}

async function wait(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  })
}
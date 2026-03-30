const APP_ID = "3f3b61c4b24c4772b3e41c4f8e75f61c";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localAudioTrack = null;

client.enableAudioVolumeIndicator();

window.AgoraVoice = {
    joinChannel: async function(channelName, uid) {
        try {
            await client.join(APP_ID, channelName, null, uid);
            client.on("user-published", async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                if (mediaType === "audio") user.audioTrack.play();
            });

            client.on("volume-indicator", volumes => {
                volumes.forEach(vol => {
                    const seatEl = document.querySelector(`.seat[data-uid="${vol.uid}"]`);
                    if(seatEl) {
                        if(vol.level > 5) seatEl.classList.add('speaking');
                        else seatEl.classList.remove('speaking');
                    }
                });
            });
        } catch (error) { console.error("Agora join failed:", error); }
    },

    publishAudio: async function() {
        try {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            await client.publish([localAudioTrack]);
            return true;
        } catch (error) {
            console.error("Publish failed:", error);
            return false;
        }
    },

    unpublishAudio: async function() {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
            await client.unpublish([localAudioTrack]);
            localAudioTrack = null;
        }
    },

    toggleMic: async function() {
        if (!localAudioTrack) return true; 
        const isMuted = !localAudioTrack.isPlaying;
        await localAudioTrack.setMuted(!isMuted);
        return !isMuted; // return new state
    },

    forceMuteAudio: async function() {
        if (localAudioTrack && localAudioTrack.isPlaying) {
            await localAudioTrack.setMuted(true);
            return true;
        }
        return true;
    },

    leaveChannel: async function() {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
            localAudioTrack = null;
        }
        await client.leave();
    }
};

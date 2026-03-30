const APP_ID = "3f3b61c4b24c4772b3e41c4f8e75f61c";
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localAudioTrack = null;
let isMicMutedLocal = true; 

client.enableAudioVolumeIndicator();

window.AgoraVoice = {
    joinChannel: async function(channelName, uid) {
        try {
            await client.join(APP_ID, channelName, null, uid);
            
            client.on("user-published", async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                if (mediaType === "audio") {
                    user.audioTrack.play();
                }
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
        } catch (error) { 
            console.error("Agora join failed:", error); 
        }
    },

    publishAudio: async function() {
        try {
            // Simple mic setup jo har mobile pe chalega
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                encoderConfig: "high_quality"
            });
            
            await client.publish(localAudioTrack);
            
            isMicMutedLocal = true;
            await localAudioTrack.setMuted(true); 
            
            return true;
        } catch (error) {
            console.error("Mic Error:", error);
            alert("Mic Permission Denied! Browser setting me mic allow karein.");
            return false;
        }
    },

    unpublishAudio: async function() {
        if (localAudioTrack) {
            try {
                await client.unpublish(localAudioTrack);
            } catch(e) { console.warn(e); }
            
            try {
                localAudioTrack.stop();
                localAudioTrack.close();
            } catch(e) { console.warn(e); }
            
            localAudioTrack = null;
        }
    },

    toggleMic: async function() {
        if (!localAudioTrack) {
            alert("Mic error! Dubara mic par join karein.");
            return true; 
        }
        try {
            isMicMutedLocal = !isMicMutedLocal;
            await localAudioTrack.setMuted(isMicMutedLocal);
            return isMicMutedLocal;
        } catch(e) {
            return true;
        }
    },

    forceMuteAudio: async function() {
        if (localAudioTrack) {
            try {
                isMicMutedLocal = true;
                await localAudioTrack.setMuted(true);
            } catch(e) {}
        }
        return true;
    },

    leaveChannel: async function() {
        await this.unpublishAudio();
        try { await client.leave(); } catch(e) {}
    }
};

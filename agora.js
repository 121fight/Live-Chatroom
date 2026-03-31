// Aapka Naya Testing Mode wala APP ID
const APP_ID = "9fcd4c0b88a943bfa9c477f78e00a45d"; 
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localAudioTrack = null;
let isMicMutedLocal = true; 

client.enableAudioVolumeIndicator();

window.AgoraVoice = {
    joinChannel: async function(channelName, uid) {
        try {
            console.log("Joining Agora Room:", channelName);
            // Bina Token (null) ke join karna
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
            return true;
        } catch (error) { 
            console.error("Agora join failed:", error);
            // NAYA ERROR MESSAGE (Taki actual technical problem dikhe)
            alert("Agora Error: " + (error.message || error.code || "Server Connection Failed"));
            return false;
        }
    },

    publishAudio: async function() {
        try {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig: "high_quality" });
        } catch (error) {
            console.error("Mic Access Error:", error);
            alert("Mic Blocked! Chrome settings me mic allow karein aur doosre call/recorder band karein.");
            return false;
        }

        try {
            await client.publish([localAudioTrack]);
            isMicMutedLocal = true;
            await localAudioTrack.setMuted(true); 
            return true;
        } catch (error) {
            console.error("Publish Error:", error);
            alert("Mic Publish Error: " + error.message);
            return false;
        }
    },

    unpublishAudio: async function() {
        if (localAudioTrack) {
            try { await client.unpublish([localAudioTrack]); } catch(e) {}
            try { localAudioTrack.stop(); localAudioTrack.close(); } catch(e) {}
            localAudioTrack = null;
        }
    },

    toggleMic: async function() {
        if (!localAudioTrack) return true; 
        try {
            isMicMutedLocal = !isMicMutedLocal;
            await localAudioTrack.setMuted(isMicMutedLocal);
            return isMicMutedLocal;
        } catch(e) { return true; }
    },

    forceMuteAudio: async function() {
        if (localAudioTrack) {
            try { isMicMutedLocal = true; await localAudioTrack.setMuted(true); } catch(e) {}
        }
        return true;
    },

    leaveChannel: async function() {
        await this.unpublishAudio();
        try { await client.leave(); } catch(e) {}
    }
};

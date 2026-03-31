const APP_ID = "9fcd4c0b88a943bfa9c477f78e00a45d"; // Aapka App ID
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
            return true;
        } catch (error) { 
            console.error("Agora join error:", error);
            return false;
        }
    },

    publishAudio: async function() {
        try {
            // 🔥 YAHAN JADU HAI: Studio Mode / Amplifier Support 🔥
            // Auto Gain (AGC) aur Echo Cancellation (AEC) ko OFF kar diya hai
            // Isse External Amplifier / Playback Mic ki aawaz dabegi nahi, 100% full jayegi.
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({ 
                encoderConfig: "high_quality",
                AEC: false, // Echo Cancellation OFF (Hardware handle karega)
                ANS: false, // Noise Suppression OFF
                AGC: false  // Auto Gain Control OFF (Aawaz dheemi nahi hogi)
            });
        } catch (error) {
            console.error("Mic Access Error:", error);
            alert("Mic Blocked! Kripya settings check karein.");
            return false;
        }

        try {
            await client.publish([localAudioTrack]);
            isMicMutedLocal = true;
            await localAudioTrack.setMuted(true); 
            return true;
        } catch (error) {
            console.error("Publish Error:", error);
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

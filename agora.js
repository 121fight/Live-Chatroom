// Agora Configuration provided
const APP_ID = "3f3b61c4b24c4772b3e41c4f8e75f61c";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let localAudioTrack = null;

// Enable Volume Indicator for Speaker Animation
client.enableAudioVolumeIndicator();

window.AgoraVoice = {
    joinChannel: async function(channelName, uid) {
        try {
            // AppID, Channel, Token(null for testing), UID
            await client.join(APP_ID, channelName, null, uid);
            
            // Auto subscribe to remote users
            client.on("user-published", async (user, mediaType) => {
                await client.subscribe(user, mediaType);
                if (mediaType === "audio") {
                    user.audioTrack.play();
                }
            });

            // Handle speaker volume highlight
            client.on("volume-indicator", volumes => {
                volumes.forEach(vol => {
                    // Update DOM element if speaking volume > 5
                    const seatEl = document.querySelector(`.seat[data-uid="${vol.uid}"]`);
                    if(seatEl) {
                        if(vol.level > 5) seatEl.classList.add('speaking');
                        else seatEl.classList.remove('speaking');
                    }
                });
            });

        } catch (error) {
            console.error("Agora join failed:", error);
            app.showToast("Failed to connect to voice server.");
        }
    },

    publishAudio: async function() {
        try {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            await client.publish([localAudioTrack]);
            return true;
        } catch (error) {
            console.error("Publish failed:", error);
            app.showToast("Microphone access denied.");
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
        if (!localAudioTrack) return true; // muted
        const isMuted = !localAudioTrack.isPlaying;
        await localAudioTrack.setMuted(!isMuted);
        return !isMuted; // returns new mute state
    },

    leaveChannel: async function() {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
        }
        await client.leave();
    }
};

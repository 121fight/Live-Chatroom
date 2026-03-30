const app = {
    user: null,
    currentRoomId: null,
    mySeatIndex: null,
    agoraUid: null,

    init: function() {
        this.checkAuth();
        this.setupEventListeners();
        this.disableBackButton();
        
        // Setup Web Audio Beep sound function
        this.playBeep = (freq = 600) => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = freq; osc.type = "sine";
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            } catch(e){}
        };

        // Load rooms
        FirebaseDB.listenToRooms((rooms) => {
            this.renderRoomsList(rooms);
        });
    },

    checkAuth: function() {
        const savedUser = localStorage.getItem('chatUser');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('my-avatar').src = this.user.avatar;
        } else {
            document.getElementById('auth-modal').classList.remove('hidden');
        }
    },

    setupEventListeners: function() {
        document.getElementById('save-user-btn').addEventListener('click', () => {
            const username = document.getElementById('username-input').value.trim();
            if (username.length < 3) {
                this.showToast("Username must be at least 3 characters");
                return;
            }
            // Generate Random Avatar using DiceBear
            const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
            // Generate Random ID
            const uid = Math.floor(Math.random() * 1000000);

            this.user = { id: uid, username, avatar };
            localStorage.setItem('chatUser', JSON.stringify(this.user));
            
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('my-avatar').src = this.user.avatar;
            this.showToast(`Welcome, ${username}!`);
        });

        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (text && this.currentRoomId) {
                FirebaseDB.sendMessage(this.currentRoomId, this.user, text);
                input.value = '';
            }
        });
    },

    disableBackButton: function() {
        // Prevent back button leaving the app by forcing history states
        history.pushState(null, document.title, location.href);
        window.addEventListener('popstate', () => {
            history.pushState(null, document.title, location.href);
            if(this.currentRoomId && document.getElementById('room-screen').classList.contains('active')) {
                this.showToast("Use Minimize or Exit button to leave the room.");
            }
        });
    },

    showToast: function(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    renderRoomsList: function(rooms) {
        const list = document.getElementById('rooms-list');
        list.innerHTML = '';
        if (rooms.length === 0) {
            list.innerHTML = '<div class="loading-text" style="text-align:center; color:#a0a4b8;">No active rooms. Create one!</div>';
            return;
        }

        rooms.forEach(room => {
            if(!room) return;
            const card = document.createElement('div');
            card.className = 'room-card';
            card.onclick = () => this.enterRoom(room.id, room.title);
            card.innerHTML = `
                <div class="room-details">
                    <h4>${room.title}</h4>
                    <p><i class="fas fa-headphones"></i> ${room.listeners} listening</p>
                </div>
                <button class="join-btn">Join</button>
            `;
            list.appendChild(card);
        });
    },

    createNewRoom: async function() {
        const title = prompt("Enter room title:");
        if (!title) return;
        
        this.showToast("Creating room...");
        const roomId = await FirebaseDB.createRoom(title, this.user);
        this.mySeatIndex = 0; // Host takes seat 0
        this.enterRoom(roomId, title, true);
    },

    enterRoom: async function(roomId, title, isHost = false) {
        // UI Transition
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('room-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
        document.getElementById('current-room-title').innerText = title;
        document.getElementById('chat-messages').innerHTML = '';
        
        this.currentRoomId = roomId;
        this.agoraUid = this.user.id;
        
        this.playBeep(800); // Join sound

        // Agora Setup
        await AgoraVoice.joinChannel(roomId, this.agoraUid);
        
        // Firebase Setup
        await FirebaseDB.joinRoom(roomId);
        
        if (isHost) {
            await this.joinMic(0);
        }

        // Listen to Room Changes (Seats, Listeners)
        FirebaseDB.listenToRoomData(roomId, (data) => {
            if(!data) { this.exitRoom(); return; } // Room deleted
            document.getElementById('room-listeners').innerText = data.listeners || 0;
            this.renderSeats(data.seats);
        });

        // Listen to Chat
        FirebaseDB.listenToChat(roomId, (msg) => {
            this.appendChatMessage(msg);
        });
    },

    renderSeats: function(seatsData) {
        const grid = document.getElementById('mic-grid');
        grid.innerHTML = '';
        
        for (let i = 0; i < 8; i++) {
            const seat = seatsData[i];
            const div = document.createElement('div');
            
            if (seat && seat.isOccupied) {
                // If I am on this seat
                if (seat.userId === this.user.id) {
                    this.mySeatIndex = i;
                    document.getElementById('mic-toggle-btn').classList.remove('hidden');
                }

                div.className = `seat ${seat.isMuted ? 'muted' : ''}`;
                div.dataset.uid = seat.userId; // For Agora speaker highlight
                div.innerHTML = `
                    <div class="seat-avatar">
                        <img src="${seat.avatar}" alt="${seat.username}">
                    </div>
                    <div class="seat-name">${seat.username}</div>
                `;
                if(seat.userId === this.user.id) {
                    div.onclick = () => this.leaveMic();
                }
            } else {
                div.className = 'seat empty';
                div.innerHTML = `
                    <div class="seat-avatar"><i class="fas fa-plus"></i></div>
                    <div class="seat-name">Seat ${i+1}</div>
                `;
                div.onclick = () => this.joinMic(i);
            }
            grid.appendChild(div);
        }

        // If user is not on any seat, hide mic button
        if (this.mySeatIndex === null) {
            document.getElementById('mic-toggle-btn').classList.add('hidden');
        }
    },

    joinMic: async function(seatIndex) {
        if(this.mySeatIndex !== null) {
            this.showToast("You are already on a mic.");
            return;
        }
        
        const success = await AgoraVoice.publishAudio();
        if (success) {
            await FirebaseDB.takeSeat(this.currentRoomId, seatIndex, this.user);
            this.mySeatIndex = seatIndex;
            
            // Setup Mic button UI
            const micBtn = document.getElementById('mic-toggle-btn');
            micBtn.classList.remove('hidden');
            micBtn.classList.remove('active');
            micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>'; // Initial state muted
            
            // Start muted by default when joining mic
            await AgoraVoice.toggleMic(); // true means muted
            await FirebaseDB.updateMuteState(this.currentRoomId, this.mySeatIndex, true);
        }
    },

    leaveMic: async function() {
        if (confirm("Step down from the mic?")) {
            await AgoraVoice.unpublishAudio();
            await FirebaseDB.leaveSeat(this.currentRoomId, this.mySeatIndex);
            this.mySeatIndex = null;
            document.getElementById('mic-toggle-btn').classList.add('hidden');
        }
    },

    toggleMic: async function() {
        if(this.mySeatIndex === null) return;
        
        const isMuted = await AgoraVoice.toggleMic();
        await FirebaseDB.updateMuteState(this.currentRoomId, this.mySeatIndex, isMuted);
        
        const micBtn = document.getElementById('mic-toggle-btn');
        if (isMuted) {
            micBtn.classList.remove('active');
            micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        } else {
            micBtn.classList.add('active');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    },

    appendChatMessage: function(msg) {
        const chatArea = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `<span class="msg-user">${msg.username}:</span> <span class="msg-text">${msg.text}</span>`;
        chatArea.appendChild(div);
        chatArea.parentElement.scrollTop = chatArea.parentElement.scrollHeight;
    },

    sendEmoji: function(emoji) {
        if (this.currentRoomId) {
            FirebaseDB.sendMessage(this.currentRoomId, this.user, emoji);
        }
    },

    minimizeRoom: function() {
        document.getElementById('room-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.remove('hidden');
        this.showToast("Room minimized");
    },

    restoreRoom: function() {
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('room-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
    },

    exitRoom: async function() {
        if(!this.currentRoomId) return;

        this.playBeep(300); // Leave sound

        // Cleanup Agora
        await AgoraVoice.leaveChannel();
        
        // Cleanup Firebase
        FirebaseDB.stopListening(this.currentRoomId);
        await FirebaseDB.leaveRoom(this.currentRoomId, this.user.id, this.mySeatIndex);
        
        // Reset State
        this.currentRoomId = null;
        this.mySeatIndex = null;
        this.agoraUid = null;
        
        // UI Update
        document.getElementById('room-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
        document.getElementById('mic-toggle-btn').classList.add('hidden');
    },

    shareRoom: function() {
        const link = window.location.href;
        navigator.clipboard.writeText(link).then(() => {
            this.showToast("Room link copied to clipboard!");
        });
    }
};

// Start app
window.onload = () => app.init();

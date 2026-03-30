const app = {
    user: null, currentRoomId: null, mySeatIndex: null, isHost: false, hostId: null, adminTargetSeat: null,

    init: function() {
        this.checkAuth(); this.setupEventListeners(); this.disableBackButton();
        this.playBeep = (freq = 600) => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = freq; osc.type = "sine";
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            } catch(e){}
        };
        FirebaseDB.listenToRooms((rooms) => { this.renderRoomsList(rooms); });
    },

    checkAuth: function() {
        const savedUser = localStorage.getItem('chatUser');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('my-avatar').src = this.user.avatar;
        } else { document.getElementById('auth-modal').classList.remove('hidden'); }
    },

    setupEventListeners: function() {
        document.getElementById('save-user-btn').addEventListener('click', () => {
            const username = document.getElementById('username-input').value.trim();
            if (username.length < 3) { this.showToast("Username must be at least 3 characters"); return; }
            const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
            const uid = Math.floor(Math.random() * 1000000);
            this.user = { id: uid, username, avatar };
            localStorage.setItem('chatUser', JSON.stringify(this.user));
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('my-avatar').src = this.user.avatar;
            this.showToast(`Welcome, ${username}!`);
        });

        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault(); const input = document.getElementById('chat-input');
            const text = input.value.trim();
            if (text && this.currentRoomId) { FirebaseDB.sendMessage(this.currentRoomId, this.user, text); input.value = ''; }
        });
    },

    disableBackButton: function() {
        history.pushState(null, document.title, location.href);
        window.addEventListener('popstate', () => {
            history.pushState(null, document.title, location.href);
            if(this.currentRoomId && document.getElementById('room-screen').classList.contains('active')) {
                this.showToast("Use Minimize or Exit button to leave.");
            }
        });
    },

    showToast: function(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div'); toast.className = 'toast'; toast.innerText = msg;
        container.appendChild(toast); setTimeout(() => toast.remove(), 3000);
    },

    renderRoomsList: function(rooms) {
        const list = document.getElementById('rooms-list'); list.innerHTML = '';
        if (rooms.length === 0) { list.innerHTML = '<div class="loading-text" style="text-align:center; color:#a0a4b8;">No active rooms. Create one!</div>'; return; }
        rooms.forEach(room => {
            if(!room) return;
            const card = document.createElement('div'); card.className = 'room-card';
            card.onclick = () => this.enterRoom(room.id, room.title, room.hostId);
            card.innerHTML = `<div class="room-details"><h4>${room.title}</h4><p><i class="fas fa-headphones"></i> ${room.listeners} listening</p></div><button class="join-btn">Join</button>`;
            list.appendChild(card);
        });
    },

    createNewRoom: async function() {
        const title = prompt("Enter room title:");
        if (!title) return;
        this.showToast("Creating room...");
        const roomId = await FirebaseDB.createRoom(title, this.user);
        this.enterRoom(roomId, title, this.user.id, true);
    },

    enterRoom: async function(roomId, title, hostId, isCreating = false) {
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('room-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
        document.getElementById('current-room-title').innerText = title;
        document.getElementById('chat-messages').innerHTML = '';
        
        this.currentRoomId = roomId; this.hostId = hostId; this.isHost = (this.user.id === hostId);
        this.playBeep(800);
        
        // Agar Agora join fail hoga toh error batayega
        const isJoined = await AgoraVoice.joinChannel(roomId, this.user.id);
        if(!isJoined) return;

        await FirebaseDB.joinRoom(roomId);
        if (isCreating) { await this.joinMic(0); }

        FirebaseDB.listenToRoomData(roomId, (data) => {
            if(!data) { this.exitRoom(); return; } 
            document.getElementById('room-listeners').innerText = data.listeners || 0;
            this.handleSeatUpdates(data.seats);
        });

        FirebaseDB.listenToChat(roomId, (msg) => { this.appendChatMessage(msg); });
    },

    handleSeatUpdates: async function(seatsData) {
        if (this.mySeatIndex !== null) {
            const mySeat = seatsData[this.mySeatIndex];
            if (!mySeat || !mySeat.isOccupied || mySeat.userId !== this.user.id) {
                this.showToast("Admin kicked you.");
                await AgoraVoice.unpublishAudio();
                this.mySeatIndex = null;
                document.getElementById('mic-toggle-btn').classList.add('hidden');
            } 
            else if (mySeat.forceMuted) {
                await AgoraVoice.forceMuteAudio();
                await FirebaseDB.updateMuteState(this.currentRoomId, this.mySeatIndex, true);
                const micBtn = document.getElementById('mic-toggle-btn');
                micBtn.classList.remove('active'); micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                firebase.database().ref(`rooms/${this.currentRoomId}/seats/${this.mySeatIndex}/forceMuted`).set(false);
                this.showToast("Admin muted you.");
            }
        }
        this.renderSeatsUI(seatsData);
    },

    renderSeatsUI: function(seatsData) {
        const grid = document.getElementById('mic-grid'); grid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const seat = seatsData[i]; const div = document.createElement('div');
            
            if (seat && seat.isOccupied) {
                if (seat.userId === this.user.id) {
                    this.mySeatIndex = i;
                    document.getElementById('mic-toggle-btn').classList.remove('hidden');
                }
                div.className = `seat ${seat.isMuted ? 'muted' : ''}`; div.dataset.uid = seat.userId;
                let hostBadge = seat.userId === this.hostId ? `<div class="seat-host-badge">HOST</div>` : '';
                div.innerHTML = `${hostBadge}<div class="seat-avatar"><img src="${seat.avatar}"></div><div class="seat-name">${seat.username}</div>`;
                div.onclick = () => this.handleSeatClick(i, seat);
            } else {
                div.className = 'seat empty';
                div.innerHTML = `<div class="seat-avatar"><i class="fas fa-plus"></i></div><div class="seat-name">Seat ${i+1}</div>`;
                div.onclick = () => this.joinMic(i);
            }
            grid.appendChild(div);
        }
        if (this.mySeatIndex === null) { document.getElementById('mic-toggle-btn').classList.add('hidden'); }
    },

    handleSeatClick: function(seatIndex, seatData) {
        if (seatData.userId === this.user.id) { this.leaveMic(); } 
        else if (this.isHost) {
            this.adminTargetSeat = seatIndex;
            document.getElementById('admin-target-name').innerText = `Manage: ${seatData.username}`;
            document.getElementById('admin-modal').classList.remove('hidden');
        }
    },

    closeAdminModal: function() { document.getElementById('admin-modal').classList.add('hidden'); this.adminTargetSeat = null; },
    executeAdminMute: async function() { if (this.adminTargetSeat !== null) { await FirebaseDB.adminMuteUser(this.currentRoomId, this.adminTargetSeat); } this.closeAdminModal(); },
    executeAdminKick: async function() { if (this.adminTargetSeat !== null) { await FirebaseDB.adminKickUser(this.currentRoomId, this.adminTargetSeat); } this.closeAdminModal(); },

    joinMic: async function(seatIndex) {
        if(this.mySeatIndex !== null) return;
        this.showToast("Connecting Mic...");
        
        const success = await AgoraVoice.publishAudio();
        if (success) {
            await FirebaseDB.takeSeat(this.currentRoomId, seatIndex, this.user);
            this.mySeatIndex = seatIndex;
            const micBtn = document.getElementById('mic-toggle-btn');
            micBtn.classList.remove('hidden', 'active');
            micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            this.showToast("Live!");
        } else {
            this.showToast("Mic connect nahi ho paya.");
        }
    },

    leaveMic: async function() {
        if (confirm("Step down?")) {
            await AgoraVoice.unpublishAudio();
            try { await FirebaseDB.leaveSeat(this.currentRoomId, this.mySeatIndex); } catch(e){}
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
            micBtn.classList.remove('active'); micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        } else {
            micBtn.classList.add('active'); micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    },

    appendChatMessage: function(msg) {
        const chatArea = document.getElementById('chat-messages');
        const div = document.createElement('div'); div.className = 'msg';
        div.innerHTML = `<span class="msg-user">${msg.username}:</span> <span class="msg-text">${msg.text}</span>`;
        chatArea.appendChild(div); chatArea.parentElement.scrollTop = chatArea.parentElement.scrollHeight;
    },

    sendEmoji: function(emoji) { if (this.currentRoomId) FirebaseDB.sendMessage(this.currentRoomId, this.user, emoji); },
    minimizeRoom: function() { document.getElementById('room-screen').classList.remove('active'); document.getElementById('home-screen').classList.add('active'); document.getElementById('minimized-widget').classList.remove('hidden'); },
    restoreRoom: function() { document.getElementById('home-screen').classList.remove('active'); document.getElementById('room-screen').classList.add('active'); document.getElementById('minimized-widget').classList.add('hidden'); },

    exitRoom: async function() {
        if(!this.currentRoomId) return;
        this.playBeep(300); 
        await AgoraVoice.leaveChannel();
        FirebaseDB.stopListening(this.currentRoomId);
        try { await FirebaseDB.leaveRoom(this.currentRoomId, this.user.id, this.mySeatIndex); } catch(e){}
        
        this.currentRoomId = null; this.mySeatIndex = null; this.isHost = false; this.hostId = null;
        document.getElementById('room-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
        document.getElementById('mic-toggle-btn').classList.add('hidden');
    },

    shareRoom: function() { navigator.clipboard.writeText(window.location.href).then(() => { this.showToast("Link Copied!"); }); }
};

window.onload = () => app.init();

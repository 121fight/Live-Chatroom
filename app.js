const app = {
    user: null, currentRoomId: null, mySeatIndex: null, isHost: false, hostId: null, tempAvatar: "",

    init: function() {
        this.checkAuth(); 
        this.setupEventListeners();
        
        // DEEP LINKING: Check link URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomToJoin = urlParams.get('room');
        if(roomToJoin && this.user) {
            this.enterRoom(roomToJoin, "Shared Room", null);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        FirebaseDB.listenToRooms((rooms) => { this.renderRoomsList(rooms); });
    },

    checkAuth: function() {
        const savedUser = localStorage.getItem('chatUser');
        if (savedUser) {
            this.user = JSON.parse(savedUser);
            document.getElementById('auth-modal').classList.add('hidden');
            document.getElementById('my-avatar').src = this.user.avatar;
            document.getElementById('edit-username').value = this.user.username;
            document.getElementById('edit-avatar-preview').src = this.user.avatar;
            this.tempAvatar = this.user.avatar;
        } else { document.getElementById('auth-modal').classList.remove('hidden'); }
    },

    // AIDE BACK BUTTON HANDLE
    onHardwareBack: function() {
        if(this.currentRoomId && document.getElementById('room-screen').classList.contains('active')) {
            document.getElementById('back-modal').classList.remove('hidden');
        } else {
            if(window.Android) window.Android.closeApp();
        }
    },

    setupEventListeners: function() {
        document.getElementById('save-user-btn').addEventListener('click', () => {
            const username = document.getElementById('username-input').value.trim();
            if (username.length < 3) return;
            const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`;
            this.user = { id: Math.floor(Math.random() * 1000000), username, avatar, gender: "Male" };
            localStorage.setItem('chatUser', JSON.stringify(this.user));
            location.reload(); 
        });

        document.getElementById('chat-form').addEventListener('submit', (e) => {
            e.preventDefault(); const input = document.getElementById('chat-input');
            if (input.value.trim() && this.currentRoomId) { FirebaseDB.sendMessage(this.currentRoomId, this.user, input.value.trim()); input.value = ''; }
        });
    },

    // PROFILE SETTINGS
    randomizeAvatar: function() {
        this.tempAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${Math.random()}`;
        document.getElementById('edit-avatar-preview').src = this.tempAvatar;
    },
    saveProfile: function() {
        const newName = document.getElementById('edit-username').value.trim();
        const newGender = document.getElementById('edit-gender').value;
        if(newName.length > 2) {
            this.user.username = newName;
            this.user.avatar = this.tempAvatar;
            this.user.gender = newGender;
            localStorage.setItem('chatUser', JSON.stringify(this.user));
            document.getElementById('my-avatar').src = this.user.avatar;
            document.getElementById('profile-modal').classList.add('hidden');
            this.showToast("Profile Updated!");
        }
    },

    showToast: function(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div'); toast.className = 'toast'; toast.innerText = msg;
        container.appendChild(toast); setTimeout(() => toast.remove(), 3000);
    },

    renderRoomsList: function(rooms) {
        const list = document.getElementById('rooms-list'); list.innerHTML = '';
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
        
        if(window.Android) window.Android.updateNotification("Live: " + title);

        const isJoined = await AgoraVoice.joinChannel(roomId, this.user.id);
        if(!isJoined) return;

        await FirebaseDB.joinRoom(roomId);
        if (isCreating) { await this.joinMic(0); }

        FirebaseDB.listenToRoomData(roomId, (data) => {
            if(!data) { this.exitRoom(true); return; } 
            document.getElementById('room-listeners').innerText = data.listeners || 0;
            if(data.title) document.getElementById('current-room-title').innerText = data.title;
            this.handleSeatUpdates(data.seats);
        });

        FirebaseDB.listenToChat(roomId, (msg) => { this.appendChatMessage(msg); });
    },

    handleSeatUpdates: async function(seatsData) {
        if (this.mySeatIndex !== null) {
            const mySeat = seatsData[this.mySeatIndex];
            if (!mySeat || !mySeat.isOccupied || mySeat.userId !== this.user.id) {
                await AgoraVoice.unpublishAudio(); this.mySeatIndex = null;
                document.getElementById('mic-toggle-btn').classList.add('hidden');
            } 
            else if (mySeat.forceMuted) {
                await AgoraVoice.forceMuteAudio();
                await FirebaseDB.updateMuteState(this.currentRoomId, this.mySeatIndex, true);
                document.getElementById('mic-toggle-btn').classList.remove('active');
                document.getElementById('mic-toggle-btn').innerHTML = '<i class="fas fa-microphone-slash"></i>';
                firebase.database().ref(`rooms/${this.currentRoomId}/seats/${this.mySeatIndex}/forceMuted`).set(false);
            }
        }
        this.renderSeatsUI(seatsData);
    },

    renderSeatsUI: function(seatsData) {
        const grid = document.getElementById('mic-grid'); grid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
            const seat = seatsData[i]; const div = document.createElement('div');
            if (seat && seat.isOccupied) {
                if (seat.userId === this.user.id) { this.mySeatIndex = i; document.getElementById('mic-toggle-btn').classList.remove('hidden'); }
                div.className = `seat ${seat.isMuted ? 'muted' : ''}`; div.dataset.uid = seat.userId;
                let hostBadge = seat.userId === this.hostId ? `<div class="seat-host-badge">HOST</div>` : '';
                div.innerHTML = `${hostBadge}<div class="seat-avatar"><img src="${seat.avatar}"></div><div class="seat-name">${seat.username}</div>`;
                div.onclick = () => this.handleSeatClick(i, seat);
            } else {
                div.className = 'seat empty'; div.innerHTML = `<div class="seat-avatar"><i class="fas fa-plus"></i></div><div class="seat-name">Seat ${i+1}</div>`;
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
    executeAdminMute: async function() { if (this.adminTargetSeat !== null) await FirebaseDB.adminMuteUser(this.currentRoomId, this.adminTargetSeat); this.closeAdminModal(); },
    executeAdminKick: async function() { if (this.adminTargetSeat !== null) await FirebaseDB.adminKickUser(this.currentRoomId, this.adminTargetSeat); this.closeAdminModal(); },

    joinMic: async function(seatIndex) {
        if(this.mySeatIndex !== null) return;
        const success = await AgoraVoice.publishAudio();
        if (success) {
            await FirebaseDB.takeSeat(this.currentRoomId, seatIndex, this.user);
            this.mySeatIndex = seatIndex;
            document.getElementById('mic-toggle-btn').classList.remove('hidden', 'active');
            document.getElementById('mic-toggle-btn').innerHTML = '<i class="fas fa-microphone-slash"></i>';
        }
    },

    leaveMic: async function() {
        await AgoraVoice.unpublishAudio();
        try { await FirebaseDB.leaveSeat(this.currentRoomId, this.mySeatIndex); } catch(e){}
        this.mySeatIndex = null;
        document.getElementById('mic-toggle-btn').classList.add('hidden');
    },

    toggleMic: async function() {
        if(this.mySeatIndex === null) return;
        const isMuted = await AgoraVoice.toggleMic();
        await FirebaseDB.updateMuteState(this.currentRoomId, this.mySeatIndex, isMuted);
        const micBtn = document.getElementById('mic-toggle-btn');
        if (isMuted) { micBtn.classList.remove('active'); micBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>'; } 
        else { micBtn.classList.add('active'); micBtn.innerHTML = '<i class="fas fa-microphone"></i>'; }
    },

    appendChatMessage: function(msg) {
        const chatArea = document.getElementById('chat-messages');
        const div = document.createElement('div'); div.className = 'msg';
        div.innerHTML = `<span class="msg-user">${msg.username}:</span> <span class="msg-text">${msg.text}</span>`;
        chatArea.appendChild(div); chatArea.parentElement.scrollTop = chatArea.parentElement.scrollHeight;
    },

    minimizeRoom: function() { 
        document.getElementById('room-screen').classList.remove('active'); 
        document.getElementById('home-screen').classList.add('active'); 
        document.getElementById('minimized-widget').classList.remove('hidden'); 
    },
    restoreRoom: function() { 
        document.getElementById('home-screen').classList.remove('active'); 
        document.getElementById('room-screen').classList.add('active'); 
        document.getElementById('minimized-widget').classList.add('hidden'); 
    },

    exitRoom: async function(force = false) {
        if(!this.currentRoomId) return;
        
        if(this.isHost && !force) {
            if(confirm("End Room? Ye chatroom sabke liye band ho jayega.")) {
                await FirebaseDB.deleteRoom(this.currentRoomId);
            } else return;
        }

        await AgoraVoice.leaveChannel();
        FirebaseDB.stopListening(this.currentRoomId);
        try { await FirebaseDB.leaveRoom(this.currentRoomId, this.user.id, this.mySeatIndex); } catch(e){}
        
        this.currentRoomId = null; this.mySeatIndex = null; this.isHost = false; this.hostId = null;
        document.getElementById('room-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('minimized-widget').classList.add('hidden');
        document.getElementById('mic-toggle-btn').classList.add('hidden');

        if(window.Android) window.Android.updateNotification("Voice Chat Active");
    },

    // WHATSAPP SHARE
    shareRoom: function() { 
        const uniqueRoomLink = "https://121fight.github.io/Live-Chatroom/?room=" + this.currentRoomId;
        if(window.Android) {
            window.Android.shareToWhatsApp(uniqueRoomLink); 
        } else {
            navigator.clipboard.writeText(uniqueRoomLink).then(() => { this.showToast("Room Link Copied!"); }); 
        }
    }
};

window.onload = () => app.init();

const firebaseConfig = {
    apiKey: "AIzaSyCdAfNCXamS4N-fW9v_mh2DcbdfCarG5-Y",
    authDomain: "livechatroom-f2b87.firebaseapp.com",
    projectId: "livechatroom-f2b87",
    storageBucket: "livechatroom-f2b87.firebasestorage.app",
    messagingSenderId: "641768234758",
    appId: "1:641768234758:web:e67c9b743f025ed2f58887"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

window.FirebaseDB = {
    createRoom: async function(title, hostUser) {
        const roomRef = db.ref('rooms').push();
        const roomId = roomRef.key;
        let seats = {};
        for(let i=0; i<8; i++) { seats[i] = { isOccupied: false }; }
        await roomRef.set({ id: roomId, title: title, hostId: hostUser.id, listeners: 1, createdAt: firebase.database.ServerValue.TIMESTAMP, seats: seats });
        return roomId;
    },
    listenToRooms: function(callback) { return db.ref('rooms').on('value', snapshot => { const rooms = []; snapshot.forEach(child => { rooms.push(child.val()); }); callback(rooms.reverse()); }); },
    joinRoom: async function(roomId) { await db.ref(`rooms/${roomId}/listeners`).set(firebase.database.ServerValue.increment(1)); },
    leaveRoom: async function(roomId, userId, seatIndex) { if (!roomId) return; await db.ref(`rooms/${roomId}/listeners`).set(firebase.database.ServerValue.increment(-1)); if (seatIndex !== null) { await this.leaveSeat(roomId, seatIndex); } },
    listenToRoomData: function(roomId, callback) { return db.ref(`rooms/${roomId}`).on('value', snapshot => { if(snapshot.exists()) callback(snapshot.val()); else callback(null); }); },
    takeSeat: async function(roomId, seatIndex, user) { await db.ref(`rooms/${roomId}/seats/${seatIndex}`).set({ isOccupied: true, userId: user.id, username: user.username, avatar: user.avatar, isMuted: true, forceMuted: false }); },
    leaveSeat: async function(roomId, seatIndex) { await db.ref(`rooms/${roomId}/seats/${seatIndex}`).set({ isOccupied: false }); },
    updateMuteState: async function(roomId, seatIndex, isMuted) { await db.ref(`rooms/${roomId}/seats/${seatIndex}/isMuted`).set(isMuted); },
    adminKickUser: async function(roomId, seatIndex) { await db.ref(`rooms/${roomId}/seats/${seatIndex}`).set({ isOccupied: false }); },
    adminMuteUser: async function(roomId, seatIndex) { await db.ref(`rooms/${roomId}/seats/${seatIndex}`).update({ isMuted: true, forceMuted: Date.now() }); },
    sendMessage: async function(roomId, user, text) { await db.ref(`rooms/${roomId}/chat`).push().set({ userId: user.id, username: user.username, text: text, timestamp: firebase.database.ServerValue.TIMESTAMP }); },
    listenToChat: function(roomId, callback) { return db.ref(`rooms/${roomId}/chat`).limitToLast(40).on('child_added', snapshot => { callback(snapshot.val()); }); },
    stopListening: function(roomId) { db.ref(`rooms/${roomId}`).off(); db.ref(`rooms/${roomId}/chat`).off(); },
    deleteRoom: async function(roomId) { await db.ref(`rooms/${roomId}`).remove(); }
};

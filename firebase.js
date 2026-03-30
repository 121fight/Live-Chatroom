// Firebase Configuration provided
const firebaseConfig = {
    apiKey: "AIzaSyCdAfNCXamS4N-fW9v_mh2DcbdfCarG5-Y",
    authDomain: "livechatroom-f2b87.firebaseapp.com",
    projectId: "livechatroom-f2b87",
    storageBucket: "livechatroom-f2b87.firebasestorage.app",
    messagingSenderId: "641768234758",
    appId: "1:641768234758:web:e67c9b743f025ed2f58887",
    measurementId: "G-EGH38K7Z97"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

window.FirebaseDB = {
    createRoom: async function(title, hostUser) {
        const roomRef = db.ref('rooms').push();
        const roomId = roomRef.key;
        
        // Initialize 8 empty seats
        let seats = {};
        for(let i=0; i<8; i++) { seats[i] = { isOccupied: false }; }
        
        // Host gets seat 0
        seats[0] = {
            isOccupied: true,
            userId: hostUser.id,
            username: hostUser.username,
            avatar: hostUser.avatar,
            isMuted: true
        };

        await roomRef.set({
            id: roomId,
            title: title,
            hostId: hostUser.id,
            listeners: 1,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            seats: seats
        });
        return roomId;
    },

    listenToRooms: function(callback) {
        return db.ref('rooms').on('value', snapshot => {
            const rooms = [];
            snapshot.forEach(child => {
                rooms.push(child.val());
            });
            callback(rooms.reverse());
        });
    },

    joinRoom: async function(roomId) {
        const roomRef = db.ref(`rooms/${roomId}`);
        await roomRef.child('listeners').set(firebase.database.ServerValue.increment(1));
    },

    leaveRoom: async function(roomId, userId, seatIndex) {
        if (!roomId) return;
        const roomRef = db.ref(`rooms/${roomId}`);
        await roomRef.child('listeners').set(firebase.database.ServerValue.increment(-1));
        
        if (seatIndex !== null) {
            await this.leaveSeat(roomId, seatIndex);
        }
    },

    listenToRoomData: function(roomId, callback) {
        return db.ref(`rooms/${roomId}`).on('value', snapshot => {
            if(snapshot.exists()) callback(snapshot.val());
        });
    },

    takeSeat: async function(roomId, seatIndex, user) {
        const seatRef = db.ref(`rooms/${roomId}/seats/${seatIndex}`);
        await seatRef.set({
            isOccupied: true,
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            isMuted: true
        });
    },

    leaveSeat: async function(roomId, seatIndex) {
        const seatRef = db.ref(`rooms/${roomId}/seats/${seatIndex}`);
        await seatRef.set({ isOccupied: false });
    },

    updateMuteState: async function(roomId, seatIndex, isMuted) {
        const seatRef = db.ref(`rooms/${roomId}/seats/${seatIndex}`);
        await seatRef.child('isMuted').set(isMuted);
    },

    sendMessage: async function(roomId, user, text) {
        const chatRef = db.ref(`rooms/${roomId}/chat`).push();
        await chatRef.set({
            userId: user.id,
            username: user.username,
            text: text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    },

    listenToChat: function(roomId, callback) {
        return db.ref(`rooms/${roomId}/chat`).limitToLast(30).on('child_added', snapshot => {
            callback(snapshot.val());
        });
    },

    stopListening: function(roomId) {
        db.ref(`rooms/${roomId}`).off();
        db.ref(`rooms/${roomId}/chat`).off();
    }
};

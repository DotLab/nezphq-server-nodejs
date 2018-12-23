const app = require("express")();
const server = require("http").Server(app);
const io = require("socket.io")(server);

server.listen(6021, () => console.log('listening on *:6021'));
// app.get("/", (_, res) => res.status(200).end());

const freeRoomIds = [];
const rooms = [];

function getRoom() {
	if (freeRoomIds.length > 0) {
		const id = freeRoomIds[freeRoomIds.length - 1];
		freeRoomIds.pop();
		return rooms[id];
	}
	rooms.push({ id: rooms.length });
	return rooms[rooms.length - 1];
}

function releaseRoom(room) {
	rooms[room.id].socket = null;
	rooms[room.id] = { id: room.id };  // flush room
	freeRoomIds.push(room.id);
}

io.on("connection", socket => {
	console.log("connection", socket.id);
	var room;

	socket.on("cl_handshake", (credentials, fn) => {
		console.log("\tcl_handshake", socket.id, credentials);
		if (room || !credentials) {
			socket.disconnect();
			return;
		}

		room = getRoom();
		room.socket = socket;
		room.credentials = credentials;
		room.sin = 0;

		setTimeout(() => {
			fn(room.id);
		}, 500)
	});

	socket.on("cl_connect_to", (id, fn) => {
		console.log("\tcl_connect_to", socket.id, id);
		if (!room || room.connectedRoom || room.sin >= 1) {
			socket.disconnect();
			return;
		}

		//  id exists    id socket exists      id not connected
		if (rooms[id] && rooms[id].socket && !rooms[id].connectedRoom) {
			room.waitingId = id;

			if (rooms[id].waitingId === undefined) {  // connect to a free person
				fn(0);
			} else if (rooms[id].waitingId === room.id) {  // connect to someone waiting
				rooms[id].socket.emit("sv_connected", room.id, room.credentials);
				room.socket.emit("sv_connected", id, rooms[id].credentials);
	
				rooms[id].connectedRoom = room;
				room.connectedRoom = rooms[id];
				fn(0);
			} else {  // connect to someone not waiting for you
				console.log("connect to someone not waiting for you")
				room.sin += 1;
				setTimeout(() => {
					fn(1);
				}, 1000)
			}
		} else {
			console.log("connect to non-valid room");
			room.sin += 1;
			setTimeout(() => {
				fn(2);
			}, 1000)
		}
	});

	socket.on("cl_send", (msg, fn) => {
		console.log("\tcl_send", socket.id, msg);
		if (!room || !room.connectedRoom || room.connectedRoom.ended || typeof msg !== "string") {
			socket.disconnect();
			return;
		}

		room.connectedRoom.socket.emit("sv_deliver", msg);
		fn(0);
	});

	socket.on("disconnect", () => {
		console.log("\tdisconnect", socket.id);
		if (room) releaseRoom(room);
		room = null;
	});
});
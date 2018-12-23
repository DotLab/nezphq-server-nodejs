const fs =  require("fs");

const app = require("express")();
const server = require("https").createServer({
	key: fs.readFileSync("../../Ca/localhost/key.pem"),
	cert: fs.readFileSync("../../Ca/localhost/cert.pem")
}, app);
const io = require("socket.io")(server);

server.listen(6021, () => console.log('listening on *:6021'));
app.get("/", (_, res) => res.status(200).send("server online").end());

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

// cl_handshake(cred) --> |
// cl_connect_to(id) ---> | -> sv_connected(id, cred)
// cl_send(msg) --------> | -> sv_deliver(msg)
// cl_recheck(cred) ----> | -> sv_recheck(cred)

io.on("connection", socket => {
	console.log("connection", socket.id);
	var room;

	socket.on("cl_handshake", (cred, fn) => {
		console.log("\tcl_handshake", socket.id, JSON.stringify(cred));
		if (room || !cred) {
			socket.disconnect();
			return;
		}

		room = getRoom();
		room.socket = socket;
		room.cred = cred;
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
				rooms[id].socket.emit("sv_connected", room.id, room.cred);
				room.socket.emit("sv_connected", id, rooms[id].cred);
	
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
		console.log("\tcl_send", socket.id, JSON.stringify(msg));
		if (!room || room.ended || !room.connectedRoom || room.connectedRoom.ended) {
			socket.disconnect();
			return;
		}

		room.connectedRoom.socket.emit("sv_deliver", msg);
		fn(0);
	});

	socket.on("disconnect", () => {
		console.log("\tdisconnect", socket.id);
		if (room) {
			if (room.connectedRoom) room.connectedRoom.socket.disconnect();
			releaseRoom(room);
		}
		room = null;
	});
});
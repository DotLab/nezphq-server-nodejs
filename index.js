const app = require("express")();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

server.listen(80);
app.get("/", (_, res) => res.status(500).end());

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
	rooms[room.id] = { id: room.id };  // flush room
	freeRoomIds.push(room.id);
}

io.on("connection", socket => {
	const room = getRoom();
	room.socketId = socket.id;

	socket.emit('sv_id', room.id);
	
	socket.on("cl_pub_key", pubKey => {
		room.pubKey = pubKey;
	});
	socket.on("cl_connect", (id, fn) => {
		
	});
});
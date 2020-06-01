const Room = require("./room.js");
class DisconnectInfo {
	constructor(roomID, player, deckBuffer) {
		this.roomID = roomID;
		this.player = player;
		this.deckBuffer = deckBuffer;
		this.destroyTimeout = setTimeout(this.timeout, settings.reconnect.timeout);
	}
	async timeout() {
		let room = Room.all[this.roomID];
		if (room) {
			room.disconnect(this.player);
		}
	}
}

module.exports = DisconnectInfo;

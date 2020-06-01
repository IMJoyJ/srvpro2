const Room = require("./room.js");
class DisconnectInfo {
	constructor(roomID, player, deckBuffer) {
		this.data = {
			roomID,
			player,
			deckBuffer: deckBuffer.toString("base64")
		}
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

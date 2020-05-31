
const YGOProMessagesHelper = require("./YGOProMessages.js");
const ygopro = new YGOProMessagesHelper();
class Room {
	constructor(name, hostinfo) {

	}
}
Room.prototype.data = {
	players: [],
	status: "starting",
	established: false,
	duelStage = ygopro.constants.DUEL_STAGE.BEGIN
};
Room.prototype.watcherBuffers = [];
Room.prototype.recorderBuffers = [];
Room.prototype.replays = [];
Room.all = [];

module.exports = Room;

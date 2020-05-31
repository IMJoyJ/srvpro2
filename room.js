const YGOProMessagesHelper = require("./YGOProMessages.js");
const ygopro = new YGOProMessagesHelper();
const _ = require("underscore");
class Room {
	constructor(name, hostinfo) {
		this.watcherBuffers = [];
		this.recorderBuffers = [];
		this.replays = [];
		this.data = {
			players: [],
			watchers: [],
			status: "starting",
			established: false,
			duelStage: ygopro.constants.DUEL_STAGE.BEGIN,
			YGOProErrorLength: 0
		};
		this.data.name = name;
		this.data.hostinfo = hostinfo || JSON.parse(JSON.stringify(settings.hostinfo));
		delete this.data.hostinfo.comment;
		Room.all.push(this);
		this.data.id = Room.all.length - 1;
		if (name.slice(0, 2) === 'M#') {
			this.data.hostinfo.mode = 1;
		} else if (name.slice(0, 2) === 'T#') {
			this.data.hostinfo.mode = 2;
			this.data.hostinfo.start_lp = 16000;
		} else if (name.slice(0, 3) === 'AI#') {
			this.data.hostinfo.rule = 2;
			this.data.hostinfo.lflist = -1;
			this.data.hostinfo.time_limit = 999;
		} else if ((param = name.match(/^(\d)(\d)(T|F)(T|F)(T|F)(\d+),(\d+),(\d+)/i))) {
			this.data.hostinfo.rule = parseInt(param[1]);
			this.data.hostinfo.mode = parseInt(param[2]);
			this.data.hostinfo.duel_rule = (param[3] === 'T' ? 3 : 4);
			this.data.hostinfo.no_check_deck = param[4] === 'T';
			this.data.hostinfo.no_shuffle_deck = param[5] === 'T';
			this.data.hostinfo.start_lp = parseInt(param[6]);
			this.data.hostinfo.start_hand = parseInt(param[7]);
			this.data.hostinfo.draw_count = parseInt(param[8]);
		} else if ((param = name.match(/(.+)#/)) !== null) {
			const rule = param[1].toUpperCase();
			if (rule.match(/(^|，|,)(M|MATCH)(，|,|$)/)) {
				this.data.hostinfo.mode = 1;
			}
			if (rule.match(/(^|，|,)(T|TAG)(，|,|$)/)) {
				this.data.hostinfo.mode = 2;
				this.data.hostinfo.start_lp = 16000;
			}
			if (rule.match(/(^|，|,)(TCGONLY|TO)(，|,|$)/)) {
				this.data.hostinfo.rule = 1;
				this.data.hostinfo.lflist = _.findIndex(lflists, function (list) {
					return list.tcg;
				});
			}
			if (rule.match(/(^|，|,)(OCGONLY|OO)(，|,|$)/)) {
				this.data.hostinfo.rule = 0;
				this.data.hostinfo.lflist = 0;
			}
			if (rule.match(/(^|，|,)(OT|TCG)(，|,|$)/)) {
				this.data.hostinfo.rule = 2;
			}
			if ((param = rule.match(/(^|，|,)LP(\d+)(，|,|$)/))) {
				const start_lp = parseInt(param[2]);
				if (start_lp <= 0) {
					start_lp = 1;
				}
				if (start_lp >= 99999) {
					start_lp = 99999;
				}
				this.data.hostinfo.start_lp = start_lp;
			}
			let param;
			if ((param = rule.match(/(^|，|,)(TIME|TM|TI)(\d+)(，|,|$)/))) {
				time_limit = parseInt(param[3]);
				if (time_limit < 0) {
					time_limit = 180;
				}
				if (time_limit >= 1 && time_limit <= 60) {
					time_limit = time_limit * 60;
				}
				if (time_limit >= 999) {
					time_limit = 999;
				}
				this.data.hostinfo.time_limit = time_limit;
			}
			if ((param = rule.match(/(^|，|,)(START|ST)(\d+)(，|,|$)/))) {
				start_hand = parseInt(param[3]);
				if (start_hand <= 0) {
					start_hand = 1;
				}
				if (start_hand >= 40) {
					start_hand = 40;
				}
				this.data.hostinfo.start_hand = start_hand;
			}
			if ((param = rule.match(/(^|，|,)(DRAW|DR)(\d+)(，|,|$)/))) {
				draw_count = parseInt(param[3]);
				if (draw_count >= 35) {
					draw_count = 35;
				}
				this.data.hostinfo.draw_count = draw_count;
			}
			if ((param = rule.match(/(^|，|,)(LFLIST|LF)(\d+)(，|,|$)/))) {
				lflist = parseInt(param[3]) - 1;
				this.data.hostinfo.lflist = lflist;
			}
			if (rule.match(/(^|，|,)(NOLFLIST|NF)(，|,|$)/)) {
				this.data.hostinfo.lflist = -1;
			}
			if (rule.match(/(^|，|,)(NOUNIQUE|NU)(，|,|$)/)) {
				this.data.hostinfo.rule = 3;
			}
			if (rule.match(/(^|，|,)(NOCHECK|NC)(，|,|$)/)) {
				this.data.hostinfo.no_check_deck = true;
			}
			if (rule.match(/(^|，|,)(NOSHUFFLE|NS)(，|,|$)/)) {
				this.data.hostinfo.no_shuffle_deck = true;
			}
			if (rule.match(/(^|，|,)(IGPRIORITY|PR)(，|,|$)/)) { // deprecated
				this.data.hostinfo.duel_rule = 4;
			}
			if ((param = rule.match(/(^|，|,)(DUELRULE|MR)(\d+)(，|,|$)/))) {
				duel_rule = parseInt(param[3]);
				if (duel_rule && duel_rule > 0 && duel_rule <= 5) {
					this.data.hostinfo.duel_rule = duel_rule;
				}
			}
			if (rule.match(/(^|，|,)(NOWATCH|NW)(，|,|$)/)) {
				this.data.hostinfo.no_watch = true;
			}
		}
		this.data.hostinfo.replay_mode = 0x0;
		this.data.launchParam = [0, this.data.hostinfo.lflist, this.data.hostinfo.rule, this.data.hostinfo.mode, this.data.hostinfo.duel_rule, (this.data.hostinfo.no_check_deck ? 'T' : 'F'), (this.data.hostinfo.no_shuffle_deck ? 'T' : 'F'), this.data.hostinfo.start_lp, this.data.hostinfo.start_hand, this.data.hostinfo.draw_count, this.data.hostinfo.time_limit, this.data.hostinfo.replay_mode];
		let seeds = Room.getSeedTimet(3);
		for (i = 0; i < 3; ++i) {
			param.push(seeds[i]);
		}
	}
	async launch() {
		const {
			workerID,
			success,
			processID,
			connectionHost,
			connectionPort
		} = await processor.addTask("launch_ygopro", {
			params: this.data.launchParam,
			roomID: this.data.id
		});
		if (!success) {
			this.delete();
			return false;
		}
		this.data.processWorkerID = workerID;
		this.data.processID = processID;
		this.data.connectionHost = connectionHost;
		this.data.connectionPort = connectionPort;
		this.established = true;
		for (let player in this.data.players) {
			await processor.addTask("connect_to_server", {
				player: player.id,
				host: connectionHost,
				port: connectionPort
			}, player.workerID);
		}
		return true;
	}
	static getSeedTimet(count) {
		let ret = [];
		for (let i = 0; i < count; ++i) {
			let curTime = null;
			while (!curTime || _.any(ret, function (time) {
					return time === curTime.unix();
				})) {
				curTime = moment();
				let offset = Math.floor(Math.random() * 240) - 120;
				if (offset > 0) {
					curTime = curTime.add(offset, "s");
				} else if (offset < 0) {
					curTime = curTime.subtract(-offset, "s");
				}
			}
			ret.push(curTime.unix());
		}
		ret.sort((a, b) => {
			return a - b;
		});
		return ret;
	}
	async connect(player) {
		this.data.players.push(player);
		if (this.data.established) {
			await processor.addTask("connect_to_server", {
				player: player.id,
				host: this.data.connectionHost,
				port: this.data.connectionPort
			}, player.workerID);
		}
	}
	async initWatcher() {
		if (!this.data.established) {
			return;
		}
		const {
			watcherWorkerID,
			watcherID,
			recorderID
		} = await processor.addTask("init_watcher", {
			roomID: this.data.id,
			host: this.data.connectionHost,
			port: this.data.connectionPort
		});
	}
	async watcherMessage(type, message) {
		const buffer = Buffer.from(message, "base64");
		switch (type) {
			case "watcher": {
				this.watcherBuffers.push(buffer);
				const promises = this.watchers.map(player => {
					return processor.addTask("send_message", {
						playerID: player.id,
						proto: "client",
						message
					}, player.workerID);
				});
				await Promise.all(promises);
				break;
			}
			case "recorder": {
				this.recorderBuffers.push(buffer);
			}
		}
	}
	async delete() {
		if (this.data.deleted) {
			return;
		}
		this.watcherBuffers = [];
		this.recorderBuffers = [];
		this.data.players = [];
		if (this.data.watcherWorkerID) {
			await processor.addTask("remove_watcher", [this.data.watcherID, this.data, recorderID]);
		}
		this.data.deleted = true;
		Room.all[this.id] = null;
	}
}
Room.all = [];

module.exports = Room;

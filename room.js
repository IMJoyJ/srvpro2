const YGOProMessagesHelper = require("./YGOProMessages.js");
const ygopro = new YGOProMessagesHelper();
const _ = require("underscore");
class Room {
	constructor(name, hostinfo) {
		this.watcherBuffers = [];
		this.recorderBuffers = [];
		this.replays = [];
		this.players = [];
		this.watchers = [];
		this.status = "starting";
		this.established = false;
		this.duelStage = ygopro.constants.DUEL_STAGE.BEGIN;
		this.YGOProErrorLength = 0;
		this.name = name;
		this.hostinfo = hostinfo || JSON.parse(JSON.stringify(settings.hostinfo));
		delete this.hostinfo.comment;
		Room.all.push(this);
		this.id = Room.all.length - 1;
		if (name.slice(0, 2) === 'M#') {
			this.hostinfo.mode = 1;
		} else if (name.slice(0, 2) === 'T#') {
			this.hostinfo.mode = 2;
			this.hostinfo.start_lp = 16000;
		} else if (name.slice(0, 3) === 'AI#') {
			this.hostinfo.rule = 2;
			this.hostinfo.lflist = -1;
			this.hostinfo.time_limit = 999;
		} else if ((param = name.match(/^(\d)(\d)(T|F)(T|F)(T|F)(\d+),(\d+),(\d+)/i))) {
			this.hostinfo.rule = parseInt(param[1]);
			this.hostinfo.mode = parseInt(param[2]);
			this.hostinfo.duel_rule = (param[3] === 'T' ? 3 : 4);
			this.hostinfo.no_check_deck = param[4] === 'T';
			this.hostinfo.no_shuffle_deck = param[5] === 'T';
			this.hostinfo.start_lp = parseInt(param[6]);
			this.hostinfo.start_hand = parseInt(param[7]);
			this.hostinfo.draw_count = parseInt(param[8]);
		} else if ((param = name.match(/(.+)#/)) !== null) {
			const rule = param[1].toUpperCase();
			if (rule.match(/(^|，|,)(M|MATCH)(，|,|$)/)) {
				this.hostinfo.mode = 1;
			}
			if (rule.match(/(^|，|,)(T|TAG)(，|,|$)/)) {
				this.hostinfo.mode = 2;
				this.hostinfo.start_lp = 16000;
			}
			if (rule.match(/(^|，|,)(TCGONLY|TO)(，|,|$)/)) {
				this.hostinfo.rule = 1;
				this.hostinfo.lflist = _.findIndex(lflists, function (list) {
					return list.tcg;
				});
			}
			if (rule.match(/(^|，|,)(OCGONLY|OO)(，|,|$)/)) {
				this.hostinfo.rule = 0;
				this.hostinfo.lflist = 0;
			}
			if (rule.match(/(^|，|,)(OT|TCG)(，|,|$)/)) {
				this.hostinfo.rule = 2;
			}
			if ((param = rule.match(/(^|，|,)LP(\d+)(，|,|$)/))) {
				const start_lp = parseInt(param[2]);
				if (start_lp <= 0) {
					start_lp = 1;
				}
				if (start_lp >= 99999) {
					start_lp = 99999;
				}
				this.hostinfo.start_lp = start_lp;
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
				//For creating short-time rooms
				if (time_limit > 999) {
					time_limit = parseInt(time_limit / 1000);
				}
				this.hostinfo.time_limit = time_limit;
			}
			if ((param = rule.match(/(^|，|,)(START|ST)(\d+)(，|,|$)/))) {
				start_hand = parseInt(param[3]);
				if (start_hand <= 0) {
					start_hand = 1;
				}
				if (start_hand >= 40) {
					start_hand = 40;
				}
				this.hostinfo.start_hand = start_hand;
			}
			if ((param = rule.match(/(^|，|,)(DRAW|DR)(\d+)(，|,|$)/))) {
				draw_count = parseInt(param[3]);
				if (draw_count <= 0) {
					draw_count = 1;
				}
				if (draw_count >= 35) {
					draw_count = 35;
				}
				this.hostinfo.draw_count = draw_count;
			}
			if ((param = rule.match(/(^|，|,)(LFLIST|LF)(\d+)(，|,|$)/))) {
				lflist = parseInt(param[3]) - 1;
				this.hostinfo.lflist = lflist;
			}
			if (rule.match(/(^|，|,)(NOLFLIST|NF)(，|,|$)/)) {
				this.hostinfo.lflist = -1;
			}
			if (rule.match(/(^|，|,)(NOUNIQUE|NU)(，|,|$)/)) {
				this.hostinfo.rule = 3;
			}
			if (rule.match(/(^|，|,)(NOCHECK|NC)(，|,|$)/)) {
				this.hostinfo.no_check_deck = true;
			}
			if (rule.match(/(^|，|,)(NOSHUFFLE|NS)(，|,|$)/)) {
				this.hostinfo.no_shuffle_deck = true;
			}
			if (rule.match(/(^|，|,)(IGPRIORITY|PR)(，|,|$)/)) { // deprecated
				this.hostinfo.duel_rule = 4;
			}
			if ((param = rule.match(/(^|，|,)(DUELRULE|MR)(\d+)(，|,|$)/))) {
				duel_rule = parseInt(param[3]);
				if (duel_rule && duel_rule > 0 && duel_rule <= 5) {
					this.hostinfo.duel_rule = duel_rule;
				}
			}
			if (rule.match(/(^|，|,)(NOWATCH|NW)(，|,|$)/)) {
				this.hostinfo.no_watch = true;
			}
		}
		this.hostinfo.replay_mode = 0x0;
		this.launchParam = [0, this.hostinfo.lflist, this.hostinfo.rule, this.hostinfo.mode, this.hostinfo.duel_rule, (this.hostinfo.no_check_deck ? 'T' : 'F'), (this.hostinfo.no_shuffle_deck ? 'T' : 'F'), this.hostinfo.start_lp, this.hostinfo.start_hand, this.hostinfo.draw_count, this.hostinfo.time_limit, this.hostinfo.replay_mode];
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
			params: this.launchParam,
			roomID: this.id
		});
		if (!success) {
			this.delete();
			return false;
		}
		this.processWorkerID = workerID;
		this.processID = processID;
		this.connectionHost = connectionHost;
		this.connectionPort = connectionPort;
		this.established = true;
		for (let player in this.players) {
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
		this.players.push(player);
		if (this.established) {
			await processor.addTask("connect_to_server", {
				player: player.id,
				host: this.connectionHost,
				port: this.connectionPort
			}, player.workerID);
		}
	}
	async initWatcher() {
		if (!this.established) {
			return;
		}
		const {
			watcherWorkerID,
			watcherID,
			recorderID
		} = await processor.addTask("init_watcher", {
			roomID: this.id,
			host: this.connectionHost,
			port: this.connectionPort
		});
		this.watcherWorkerID = watcherWorkerID;
		this.watcherID = watcherID;
		this.recorderID = recorderID;
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
		if (this.deleted) {
			return;
		}
		this.watcherBuffers = [];
		this.recorderBuffers = [];
		this.players = [];
		if (this.watcherWorkerID) {
			await processor.addTask("remove_watcher", [this.watcherID, this.recorderID]);
		}
		this.deleted = true;
		Room.all[this.id] = null;
	}
}
Room.all = [];
Room.disconnectList = {};

module.exports = Room;

const net = require("net");
const YGOProMessagesHelper = require("./YGOProMessages.js");
const _ = require("underscore");
class Player {
	constructor(client, worker) {
		this.client = client;
		this.server = new net.Socket();
		client.player = this;
		this.server.player = this;
		this.preEstablishedBuffers = [];
		this.ip = client.remoteAddress;
		this.isLocalhost = this.ip.includes('127.0.0.1') || this.ip === "::1";
		this.workerID = worker.id;
		Player.all.push(this);
		this.id = Player.all.length - 1;
		client.setTimeout(2000);
		this.registerEvents();
	}
	static clientCloseHandler(client) {
		return async (error) => {
			const player = client.player;
			if (!player) {
				return;
			}
			if (!player.client_closed) {
				player.client_closed = true;
				processor.addTask("client_closed", {
					player: player,
					error
				})
			}
		}
	}
	static clientTimeoutHandler(client) {
		return async () => {
			const player = client.player;
			if (!player) {
				client.destroy();
				return;
			} else {
				const check = await player.getDisconnectInfo();
				if (!check) {
					client.destroy();
				}
			}
		}
	}
	static clientBufferHandler(client) {
		return async (buffer) => {
			const player = client.player;
			if (!player) {
				return;
			}
			const param = {
				player
			};
			if (player.isPostWatcher) {
				const {
					datas,
					feedback
				} = await Player.ygopro.handleBuffer(buffer, "CTOS", ["CHAT"], param);
				if (feedback) {
					log.warn(feedback.message, player.name, player.ip);
					const badIPCount = await processor.addTask("get_bad_ip_count", player.ip);
					if (feedback.type === "OVERSIZE" || badIPCount > 5) {
						await processor.addTask("bad_ip", player.ip);
						await player.terminateClient();
						return;
					}
				}
				for (let b of datas) {
					await processor.addTask("post_watcher_message", {
						player: player,
						message: b.toString("base64")
					});
				}
				return;
			}
			const protoFilter = player.preReconnecting ? ["UPDATE_DECK"] : null;
			const {
				datas,
				feedback
			} = await Player.ygopro.handleBuffer(buffer, "CTOS", protoFilter, param);
			if (feedback) {
				log.warn(feedback.message, player.name, player.ip);
				const badIPCount = await processor.addTask("get_bad_ip_count", player.ip);
				if (feedback.type === "OVERSIZE" || badIPCount > 5) {
					await processor.addTask("bad_ip", player.ip);
					await player.terminate();
					return;
				}
			}
			if (player.server && player.established) {
				for (let buffer of datas) {
					player.server.write(buffer);
				}
			} else {
				for (let buffer of datas) {
					player.preEstablishedBuffers.push(buffer);
				}
			}
		}
	}
	static serverCloseHandler(server) {
		return async (error) => {
			const player = server.player;
			if (!player) {
				return;
			}
			if (!player.server_closed) {
				player.server_closed = true;
				processor.addTask("server_closed", {
					player: player,
					error
				})
			}
		}
	}
	static serverBufferHandler(server) {
		return async (buffer) => {
			const player = server.player;
			if (!player) {
				return;
			}
			const param = {
				player
			};
			const {
				datas,
				feedback
			} = await Player.ygopro.handleBuffer(buffer, "STOC", null, param);
			if (feedback) {
				log.warn(feedback.message, player.name, player.ip);
				if (feedback.type === "OVERSIZE") {
					server.destroy();
					return;
				}
			}
			if (!player.client) {
				return;
			}
			for (let buffer of datas) {
				player.client.write(buffer);
			}
		}
	}
	registerEvents() {
		this.client.on("close", Player.clientCloseHandler(this.client));
		this.client.on("error", Player.clientCloseHandler(this.client));
		this.client.on("timeout", Player.clientTimeoutHandler(this.client));
		this.client.on("data", Player.clientBufferHandler(this.client));
		this.server.on("close", Player.serverCloseHandler(this.server));
		this.server.on("error", Player.serverCloseHandler(this.server));
		this.server.on("data", Player.serverBufferHandler(this.server));
	}
	getIndex() {
		if (this.vpass) {
			return this.name_vpass;
		} else if (this.isLocalhost || !settings.reconnect.strict) {
			return this.name;
		} else {
			return this.ip + ":" + this.name;
		}
	}
	async getDisconnectInfo() {
		const index = this.getIndex();
		return await processor.addTask("check_inside_disconnect_list", index);
	}
	async terminateClient() {
		this.clientTerminated = true;
		if (this.client_closed && settings.reconnect.enabled) {
			await processor.addTask("disconnect_client", this.data);
		} else if (this.client) {
			this.client.destroy();
		}
	}
	async terminateServer() {
		this.serverTerminated = true;
		if (this.server) {
			this.server.destroy();
		}
	}
	async serverConnectTo(host, port) {
		let check = false;
		await new Promise(done => {
			this.server.connect({
				port,
				host,
			}, () => {
				if (!check) {
					check = true;
					done();
				}
			});
		});
		for (let buffer of this.preEstablishedBuffers) {
			this.server.write(buffer);
		}
		this.preEstablishedBuffers = [];
	}
	async sendMessage(proto, message) {
		if (typeof (message) === "string") {
			message = Buffer.from(message, "base64");
		}
		let socket = this.client;
		if (proto.startsWith("CTOS") || proto === "server") {
			if (!this.server || this.server_closed) {
				return;
			}
			socket = this.server;
		} else {
			if (!this.client || this.client_closed) {
				return;
			}
		}
		if (proto === "server" || proto === "client") {
			socket.write(buffer);
		} else {
			Player.ygopro.sendMessage(socket, proto, message);
		}
	}
	async getRoom() {
		return await processor.addTask("get_room", this.roomID);
	}
	async isAbleToReconnect(deckbuf) {
		if (!settings.reconnect.enabled || this.clientTerminated) {
			return false;
		}
		const disconnectInfo = await this.getDisconnectInfo();
		if (!disconnectInfo) {
			return false;
		}
		const room = await processor.addTask("get_room", disconnectInfo.roomID);
		if (!room) {
			await this.reconnectUnregister(false);
			return false;
		}
		if (deckbuf && !_.isEqual(deckbuf, Buffer.from(deckBuffer, "base64"))) {
			return false;
		}
		return true;
	}

}
Player.all = [];
Player.ygopro = new YGOProMessagesHelper();

module.exports = Player;

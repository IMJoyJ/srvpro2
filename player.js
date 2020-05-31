const net = require("net");
const YGOProMessagesHelper = require("./YGOProMessages.js");
const _ = require("underscore");
class Player {
	constructor(client, worker) {
		this.client = client;
		this.server = new net.Socket();
		client.player = this;
		this.server.player = this;
		this.data.ip = client.remoteAddress;
		this.data.isLocalhost = this.ip.includes('127.0.0.1') || this.ip === "::1";
		this.data.workerID = worker.id;
		Player.all.push(this);
		this.data.id = Player.all.length - 1;
		client.setTimeout(2000);
		this.registerMessages();
		this.registerEvents();
	}
	getIndex() {
		if (this.data && this.data.vpass) {
			return this.data.name_vpass;
		} else if (this.data.isLocalhost || !settings.reconnect.strict) {
			return this.data.name;
		} else {
			return this.data.ip + ":" + this.data.name;
		}
	}
	async isInsideDisconnectList() {
		const index = this.getIndex();
		return await processor.addTask("check_inside_disconnect_list", index);
	}
	async terminateClient() {
		this.data.clientTerminated = true;
		if (this.data.client_closed && settings.reconnect.enabled) {
			await processor.addTask("disconnect_client", this.data);
		} else if (this.client) {
			this.client.destroy();
		}
	}
	async terminateServer() {
		this.data.serverTerminated = true;
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
			if (!this.server || this.data.server_closed) {
				return;
			}
			socket = this.server;
		} else {
			if (!this.client || this.data.client_closed) {
				return;
			}
		}
		if (proto === "server" || proto === "client") {
			socket.write(buffer);
		} else {
			Player.ygopro.sendMessage(socket, proto, message);
		}
	}
	static clientCloseHandler(client) {
		return async (error) => {
			const player = client.player;
			if (!player) {
				return;
			}
			if (!player.data.client_closed) {
				player.data.client_closed = true;
				processor.addTask("client_closed", {
					player: player.data,
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
				const check = await player.isInsideDisconnectList();
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
			if (player.data.isPostWatcher) {
				const {
					datas,
					feedback
				} = await Player.ygopro.handleBuffer(buffer, "CTOS", ["CHAT"], param);
				if (feedback) {
					log.warn(feedback.message, player.data.name, player.data.ip);
					const badIPCount = await processor.addTask("get_bad_ip_count", player.data.ip);
					if (feedback.type === "OVERSIZE" || badIPCount > 5) {
						await processor.addTask("bad_ip", player.data.ip);
						await player.terminate();
						return;
					}
				}
				for (let b of datas) {
					await processor.addTask("post_watcher_message", {
						player: player.data,
						message: b.toString("base64")
					});
				}
				return;
			}
			const protoFilter = player.data.preReconnecting ? ["UPDATE_DECK"] : null;
			const {
				datas,
				feedback
			} = await Player.ygopro.handleBuffer(buffer, "CTOS", protoFilter, param);
			if (feedback) {
				log.warn(feedback.message, player.data.name, player.data.ip);
				const badIPCount = await processor.addTask("get_bad_ip_count", player.data.ip);
				if (feedback.type === "OVERSIZE" || badIPCount > 5) {
					await processor.addTask("bad_ip", player.data.ip);
					await player.terminate();
					return;
				}
			}
			if (player.server && player.data.established) {
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
			if (!player.data.server_closed) {
				player.data.server_closed = true;
				processor.addTask("server_closed", {
					player: player.data,
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
				log.warn(feedback.message, player.data.name, player.data.ip);
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
}
Player.all = [];
Player.prototype.data = {};
Player.prototype.preEstablishedBuffers = [];
Player.ygopro = new YGOProMessagesHelper();

module.exports = Player;

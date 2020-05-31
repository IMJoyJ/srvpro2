const fs = require('fs');
const net = require("net");
const Processor = require("./processor.js");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const Player = require("./player.js");
const cluster = require("cluster");
const spawn = require("child_process");

let settings, processor, lflists;
let spawnProcesses = [];

function loadHandlers() {
	processor.addHandler("get_memory_usage", async (param, dataID) => {
		const memStdout = (await exec("free")).stdout;
		const lines = memStdout.split(/\n/g);
		let line = lines[0].split(/\s+/);
		const new_free = (line[6] === 'available' || line[6] === '可用') ? true : false;
		line = lines[1].split(/\s+/);
		const total = parseInt(line[1], 10);
		const free = parseInt(line[3], 10);
		const buffers = parseInt(line[5], 10);
		let actualFree;
		if (new_free) {
			actualFree = parseInt(line[6], 10);
		} else {
			const cached = parseInt(line[6], 10);
			actualFree = free + buffers + cached;
		}
		const percentUsed = parseFloat(((1 - (actualFree / total)) * 100).toFixed(2));
		return percentUsed;
	});
	processor.addHandler("launch_ygopro", (param, dataID) => {
		const { params, roomID } = param;
		const workerID = cluster.worker.id;
		const connectionHost = '127.0.0.1';
		return new Promise(callback => {
			let spawnProcess = spawn('./ygopro', params, {
				cwd: 'ygopro'
			});
			const processID = spawnProcess.pid;
			spawnProcesses.push(spawnProcess);
			spawnProcesses.on('error', (err) => {
				log.warn("launch ygopro fail", err.toString());
				callback({
					workerID,
					success: false
				});
			});
			spawnProcesses.on('exit', async (code) => {
				await processor.addTask("ygopro_exit", {
					roomID,
					code
				});
			});
			spawnProcess.stdout.setEncoding("utf8");
			spawnProcess.stdout.once("data", (data) => {
				const connectPort = parseInt(data);
				callback({
					workerID,
					success: true,
					processID,
					connectionPort,
					connectionHost
				});
			});
			spawnProcess.stderr.setEncoding("utf8");
			spawnProcess.stderr.on("data", async(data) => {
				data = "Debug: " + data;
				data = data.replace(/\n$/, "");
				log.info("YGOPRO " + data);
				await processor.addTask("ygopro_debug_info", {
					roomID,
					data
				});
			});
		});
	});
}

async function netRequestHandler(socket) {
	const player = new Player(socket, cluster.worker);
	await processor.addTask("new_player", player);
}

function startServer() {
	return new Promise(callback => {
		let server = net.createServer(netRequestHandler);
		server.listen({
			host: settings.host,
			port: settings.port
		}, callback);
	});
}

async function main() {
	processor = global.Processor = new Processor();
	const metaInfo = await processor.addTask("get_metainfo");
	settings = global.settings = metaInfo.settings;
	lflists = global.lflists = metaInfo.lflists;
	loadHandlers();
	await startServer();
	await processor.addTask("ready");
}
module.exports = main;
